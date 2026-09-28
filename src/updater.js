import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AGENT_REGISTRY, resolveAgentDestination } from './agents.js';
import { discoverSkills, parseSkillDirectory } from './discovery.js';

const EXCLUDED = new Set(['node_modules', '.DS_Store', '.git']);
const BACKUP_DIR = '.agent-skills-backups';
const STAGING_DIR = '.agent-skills-staging';

/** Stable SHA-256 over every file (relative path + content), excluding build/OS noise. */
export function hashDirectory(dir) {
  const hash = crypto.createHash('sha256');
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .filter(e => !EXCLUDED.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const stat = fs.statSync(full); // follows links, mirrors cpSync({ dereference: true })
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile()) {
        hash.update(path.relative(dir, full).split(path.sep).join('/'));
        hash.update('\0');
        hash.update(fs.readFileSync(full));
        hash.update('\0');
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

/**
 * Backups/staging live beside the skills root (never inside it), so agents that
 * scan skill directories recursively never load a stale duplicate.
 */
export function backupRoot(destDir) {
  return path.join(path.dirname(destDir), BACKUP_DIR);
}

function copySkill(srcDir, targetPath) {
  fs.cpSync(srcDir, targetPath, {
    recursive: true,
    dereference: true,
    filter: (src) => !EXCLUDED.has(path.basename(src))
  });
}

/** Resolves which install scopes to scan. */
function scopesFor(scope) {
  return scope === 'project' || scope === 'global' ? [scope] : ['project', 'global'];
}

/**
 * Finds every installed copy/symlink of this repository's skills across agent targets.
 * @param {{ repoRoot: string, scope?: 'project'|'global'|'all', cwd?: string, skills?: string[] }} options
 */
export function findInstalledSkills({ repoRoot, scope = 'all', cwd = process.cwd(), skills = [] }) {
  const wanted = new Set(skills.map(s => s.toLowerCase()).filter(s => s !== 'all'));
  const available = discoverSkills(repoRoot).filter(s => wanted.size === 0 || wanted.has(s.id.toLowerCase()));
  const found = [];
  const seen = new Set();

  for (const currentScope of scopesFor(scope)) {
    for (const agent of AGENT_REGISTRY) {
      const destDir = resolveAgentDestination(agent, currentScope, cwd);
      for (const skill of available) {
        const targetPath = path.join(destDir, skill.id);
        const key = path.resolve(targetPath);
        if (seen.has(key)) continue;

        let stat;
        try { stat = fs.lstatSync(targetPath); } catch { continue; }
        seen.add(key);

        // Never treat the repository's own source directory as an install.
        if (path.resolve(targetPath) === path.resolve(skill.skillDir)) continue;

        const isSymlink = stat.isSymbolicLink();
        let linkTarget = null;
        if (isSymlink) {
          try { linkTarget = path.resolve(path.dirname(targetPath), fs.readlinkSync(targetPath)); } catch { /* broken */ }
        }
        const installed = fs.existsSync(targetPath) ? parseSkillDirectory(targetPath) : null;

        found.push({
          skill,
          agent,
          scope: currentScope,
          destDir,
          targetPath,
          mode: isSymlink ? 'symlink' : 'copy',
          linkTarget,
          installedVersion: installed?.version ?? null
        });
      }
    }
  }
  return found;
}

/** Replaces a copied install atomically: stage → back up old → swap → roll back on failure. */
function replaceCopy(entry, { backup }) {
  const { skill, destDir, targetPath } = entry;
  const stamp = `${skill.id}-${entry.installedVersion ?? 'unknown'}-${Date.now()}`;
  const stagingPath = path.join(path.dirname(destDir), STAGING_DIR, stamp);
  const backupPath = path.join(backupRoot(destDir), stamp);

  fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
  copySkill(skill.skillDir, stagingPath);

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.renameSync(targetPath, backupPath);
  try {
    fs.renameSync(stagingPath, targetPath);
  } catch (err) {
    fs.renameSync(backupPath, targetPath); // rollback
    throw err;
  } finally {
    fs.rmSync(path.join(path.dirname(destDir), STAGING_DIR), { recursive: true, force: true });
  }

  if (!backup) {
    fs.rmSync(backupPath, { recursive: true, force: true });
    return undefined;
  }
  return backupPath;
}

/** True when a link points into a package-runner cache that can be purged at any time. */
export function isEphemeralPath(p) {
  return /[\\/](_npx|\.npm|\.bun[\\/]install[\\/]cache|bunx-[^\\/]*)[\\/]/.test(p);
}

/** Replaces a broken or cache-backed symlink with a persistent copy. */
function symlinkToCopy(entry) {
  const { skill, targetPath } = entry;
  const staging = `${targetPath}.staging-${Date.now()}`;
  copySkill(skill.skillDir, staging);
  fs.unlinkSync(targetPath);
  fs.renameSync(staging, targetPath);
}

/**
 * Updates installed skills in place, preserving each install's mode (symlink/copy).
 * Only skill directories are touched; project data (e.g. `.memory/`) is never read or written.
 * @param {{ repoRoot: string, scope?: string, cwd?: string, skills?: string[], dryRun?: boolean, backup?: boolean }} options
 */
export function executeUpdate({ repoRoot, scope = 'all', cwd = process.cwd(), skills = [], dryRun = false, backup = true }) {
  const results = findInstalledSkills({ repoRoot, scope, cwd, skills }).map(entry => {
    const base = {
      skill: entry.skill.id,
      agentName: entry.agent.name,
      scope: entry.scope,
      targetPath: entry.targetPath,
      mode: entry.mode,
      fromVersion: entry.installedVersion,
      toVersion: entry.skill.version
    };

    if (entry.mode === 'symlink') {
      const healthy = entry.linkTarget && fs.existsSync(path.join(entry.linkTarget, 'SKILL.md'));
      if (healthy && entry.linkTarget === path.resolve(entry.skill.skillDir)) {
        return { ...base, status: 'up-to-date', success: true };
      }
      if (healthy && !isEphemeralPath(entry.linkTarget)) {
        // Linked to the user's own clone: that clone is the source of truth.
        return { ...base, status: 'linked', success: true, note: `Run \`git pull\` in ${entry.linkTarget}` };
      }
      if (dryRun) return { ...base, status: 'would-update', success: true, note: 'broken/cache symlink → copy' };
      try {
        symlinkToCopy(entry);
        return { ...base, mode: 'copy', status: 'updated', success: true };
      } catch (err) {
        return { ...base, status: 'failed', success: false, error: err.message };
      }
    }

    if (hashDirectory(entry.targetPath) === hashDirectory(entry.skill.skillDir)) {
      return { ...base, status: 'up-to-date', success: true };
    }
    if (dryRun) return { ...base, status: 'would-update', success: true };

    try {
      const backedUp = replaceCopy(entry, { backup });
      return { ...base, status: 'updated', success: true, backedUp };
    } catch (err) {
      return { ...base, status: 'failed', success: false, error: err.message };
    }
  });

  return {
    timestamp: new Date().toISOString(),
    dryRun,
    updated: results.filter(r => r.status === 'updated').length,
    pending: results.filter(r => r.status === 'would-update').length,
    failed: results.filter(r => !r.success).length,
    results
  };
}
