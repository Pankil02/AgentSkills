// @ts-check
/**
 * @file Bounded bundle filesystem reader and atomic JSON exporter.
 * Native Node.js modules only (node:fs, node:path).
 */

import {
  lstatSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  statSync
} from 'node:fs';
import { resolve, dirname, basename, isAbsolute, relative, sep } from 'node:path';
import { parseManifest } from './format.mjs';

const MAX_FILE_BYTES = 128 * 1024; // 128 KiB
const MAX_AGGREGATE_BYTES = 1024 * 1024; // 1 MiB

/**
 * Checks whether targetPath is contained within rootDir using path.relative.
 * Enforces separator-aware canonical path containment to prevent sibling-prefix bypasses.
 * @param {string} targetPath Absolute or resolved path
 * @param {string} rootDir Absolute or resolved root directory
 * @returns {boolean}
 */
export function isPathContained(targetPath, rootDir) {
  if (typeof targetPath !== 'string' || typeof rootDir !== 'string') return false;
  const rel = relative(resolve(rootDir), resolve(targetPath));
  if (rel === '') return true;
  const isEscaping = rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('../') || isAbsolute(rel);
  return !isEscaping;
}

/**
 * Checks whether any component of a path matches protected/forbidden patterns:
 * .env*, .git, credentials, secrets, and node_modules.
 * @param {string} p
 * @returns {boolean}
 */
export function isForbiddenPath(p) {
  if (typeof p !== 'string') return true;
  const normalized = p.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.some((seg) => {
    const s = seg.toLowerCase();
    if (s.startsWith('.env')) return true;
    if (s === '.git') return true;
    if (s === 'node_modules') return true;
    if (s === 'credentials' || s.startsWith('credentials.') || s.startsWith('credentials-') || s === 'credential') return true;
    if (s === 'secrets' || s.startsWith('secrets.') || s.startsWith('secrets-') || s === 'secret' || s.startsWith('secret.') || s.startsWith('secret-')) return true;
    return false;
  });
}

/**
 * Checks whether a path contains directory traversal, control characters, backslashes,
 * Windows drive letters, or forbidden segments (.env*, .git, credentials, secrets, node_modules).
 * @param {string} p
 * @returns {boolean}
 */
export function isPathSuspicious(p) {
  if (typeof p !== 'string') return true;
  if (p.includes('\0') || p.includes('..') || p.includes('\\')) return true;
  if (/^[a-zA-Z]:/.test(p)) return true; // Windows drive letters inside relative paths
  if (isForbiddenPath(p)) return true;
  return false;
}

/**
 * Ensures that neither the target file nor any intermediate directory
 * between rootDir and fullPath is a symbolic link or junction.
 * Does not check directories above rootDir to preserve legitimate symlinks in project/skill roots.
 * @param {string} fullPath Absolute path to file
 * @param {string} rootDir Absolute root directory
 */
export function checkNoSymlinksInAncestry(fullPath, rootDir) {
  const normRoot = resolve(rootDir);
  const normFull = resolve(fullPath);

  if (!isPathContained(normFull, normRoot)) {
    throw new Error(`Path escapes proposal root directory: "${fullPath}"`);
  }

  const rel = relative(normRoot, normFull);
  const segments = rel.split(/[/\\]/).filter(Boolean);
  let current = normRoot;
  for (const segment of segments) {
    current = resolve(current, segment);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlinks are forbidden for proposal documents: "${current}"`);
    }
  }
}

/**
 * Custom error indicating a concurrent modification race on a file during read.
 */
class FileRaceError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = 'FileRaceError';
  }
}

/**
 * Reads a single regular file enforcing size bounds, fatal UTF-8, canonical containment,
 * symlink/junction rejections, and metadata verification before/after read.
 * @param {string} fullPath
 * @param {string} rootDir
 * @returns {{ source: string; mtimeMs: number; size: number }}
 */
function readRegularFile(fullPath, rootDir) {
  checkNoSymlinksInAncestry(fullPath, rootDir);

  const statBefore = statSync(fullPath);
  if (!statBefore.isFile()) {
    throw new Error(`Target is not a regular file: "${fullPath}"`);
  }
  if (statBefore.size > MAX_FILE_BYTES) {
    throw new Error(`File exceeds maximum size limit of 128 KiB: "${fullPath}" (${statBefore.size} bytes)`);
  }

  // Canonical containment check using isPathContained
  const realFull = realpathSync(fullPath);
  const realRoot = realpathSync(rootDir);
  if (!isPathContained(realFull, realRoot)) {
    throw new Error(`Path escapes proposal root directory: "${fullPath}"`);
  }

  const buf = readFileSync(fullPath);
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File byteLength exceeds 128 KiB: "${fullPath}"`);
  }

  const statAfter = statSync(fullPath);
  if (statAfter.mtimeMs !== statBefore.mtimeMs || statAfter.size !== statBefore.size) {
    throw new FileRaceError(`Concurrent modification detected on "${fullPath}"`);
  }

  // Fatal UTF-8 decoding
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const source = decoder.decode(buf);

  return {
    source,
    mtimeMs: statAfter.mtimeMs,
    size: statAfter.size
  };
}

/**
 * Reads the proposal manifest and all explicitly listed section files.
 * Retries at most once if a save races reading.
 * @param {string} manifestInputPath
 * @returns {Promise<{ manifestPath: string; documents: Array<{ id: string; path: string; source: string }> }>}
 */
export async function readBundle(manifestInputPath) {
  const fullManifestPath = isAbsolute(manifestInputPath)
    ? manifestInputPath
    : resolve(process.cwd(), manifestInputPath);

  if (isForbiddenPath(fullManifestPath)) {
    throw new Error(`Forbidden file path rejected: "${fullManifestPath}"`);
  }

  if (!existsSync(fullManifestPath)) {
    throw new Error(`Manifest file does not exist: "${fullManifestPath}"`);
  }

  const manifestLstat = lstatSync(fullManifestPath);
  if (manifestLstat.isSymbolicLink()) {
    throw new Error(`Symlinks are forbidden for proposal manifests: "${fullManifestPath}"`);
  }

  const proposalRoot = dirname(fullManifestPath);

  // Attempt read with at most 1 race-detection retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      /** @type {Map<string, { mtimeMs: number; size: number }>} */
      const fileStats = new Map();

      const manifestResult = readRegularFile(fullManifestPath, proposalRoot);
      fileStats.set(fullManifestPath, { mtimeMs: manifestResult.mtimeMs, size: manifestResult.size });
      const manifestSource = manifestResult.source;

      const manifestRes = parseManifest(manifestSource);
      if (!manifestRes.value) {
        // Verify manifest hasn't changed during the parse
        const manifestStatNow = statSync(fullManifestPath);
        if (manifestStatNow.mtimeMs !== manifestResult.mtimeMs || manifestStatNow.size !== manifestResult.size) {
          throw new FileRaceError(`Concurrent modification detected on "${fullManifestPath}"`);
        }
        // Return manifest as single document so compiler can report diagnostics
        return {
          manifestPath: fullManifestPath,
          documents: [
            {
              id: 'manifest',
              path: basename(fullManifestPath),
              source: manifestSource
            }
          ]
        };
      }

      const meta = manifestRes.value;
      const documents = [
        {
          id: 'manifest',
          path: basename(fullManifestPath),
          source: manifestSource
        }
      ];

      let aggregateBytes = Buffer.byteLength(manifestSource, 'utf8');

      for (const docMeta of meta.documents) {
        if (isPathSuspicious(docMeta.path)) {
          throw new Error(`Suspicious document path rejected: "${docMeta.path}"`);
        }

        const fullDocPath = resolve(proposalRoot, docMeta.path);
        if (isForbiddenPath(fullDocPath)) {
          throw new Error(`Forbidden document path rejected: "${docMeta.path}"`);
        }

        if (!existsSync(fullDocPath)) {
          throw new Error(`Listed section file does not exist: "${docMeta.path}"`);
        }

        const docResult = readRegularFile(fullDocPath, proposalRoot);
        fileStats.set(fullDocPath, { mtimeMs: docResult.mtimeMs, size: docResult.size });
        const docSource = docResult.source;

        aggregateBytes += Buffer.byteLength(docSource, 'utf8');
        if (aggregateBytes > MAX_AGGREGATE_BYTES) {
          throw new Error(`Total proposal bundle exceeds maximum 1 MiB limit.`);
        }

        documents.push({
          id: docMeta.id,
          path: docMeta.path,
          source: docSource
        });
      }

      // Yield once to event loop to allow any in-progress editor write to flush
      await new Promise((r) => setImmediate(r));

      // Re-verify all loaded files before publication
      for (const [filePath, expected] of fileStats.entries()) {
        const statNow = statSync(filePath);
        if (statNow.mtimeMs !== expected.mtimeMs || statNow.size !== expected.size) {
          throw new FileRaceError(`Concurrent modification detected on "${filePath}"`);
        }
      }

      return { manifestPath: fullManifestPath, documents };
    } catch (err) {
      if (err instanceof FileRaceError) {
        if (attempt === 0) continue; // retry once
        throw new Error('Concurrent modification detected while reading proposal bundle.');
      }
      throw err;
    }
  }

  throw new Error('Failed to read proposal bundle due to persistent modification race.');
}

/**
 * Atomically writes JSON export to disk, strictly enforcing safety rules.
 * @param {string} outPath
 * @param {string} json
 * @param {{ force?: boolean; forbiddenPaths?: string[] }} [options]
 */
export async function writeExport(outPath, json, options = {}) {
  const fullOutPath = isAbsolute(outPath) ? outPath : resolve(process.cwd(), outPath);
  const outDir = dirname(fullOutPath);
  const outFileName = basename(fullOutPath);

  if (isForbiddenPath(fullOutPath)) {
    throw new Error(`Export destination cannot be a protected file or directory: "${outPath}"`);
  }

  if (!outFileName.endsWith('.json') || outFileName.startsWith('.')) {
    throw new Error(`Export destination must be a non-hidden .json file: "${outFileName}"`);
  }

  if (!existsSync(outDir)) {
    throw new Error(`Export parent directory does not exist: "${outDir}"`);
  }

  // Target file itself must not be a symlink
  if (existsSync(fullOutPath) && lstatSync(fullOutPath).isSymbolicLink()) {
    throw new Error(`Export target file cannot be a symbolic link: "${fullOutPath}"`);
  }

  // Refuse overwrite unless force is true
  if (existsSync(fullOutPath) && !options.force) {
    throw new Error(`Target file already exists. Use --force to overwrite: "${fullOutPath}"`);
  }

  const realDir = realpathSync(outDir);

  // Check forbidden paths (proposal source, installed skill directories)
  if (options.forbiddenPaths && options.forbiddenPaths.length > 0) {
    for (const forbidden of options.forbiddenPaths) {
      if (existsSync(forbidden)) {
        const realForbidden = realpathSync(forbidden);
        if (isPathContained(realDir, realForbidden) || isPathContained(fullOutPath, realForbidden)) {
          throw new Error(`Refusing to write export inside protected directory: "${forbidden}"`);
        }
      }
    }
  }

  const tempPath = resolve(realDir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    writeFileSync(tempPath, json, 'utf8');
    renameSync(tempPath, fullOutPath);
  } catch (err) {
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // ignore cleanup error
      }
    }
    throw err;
  }
}
