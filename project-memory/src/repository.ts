import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".memory",
  ".idea",
  ".vscode",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "coverage",
  "target",
  "out",
  "tmp",
  "temp",
  "__pycache__",
]);

const SECRET_PATTERNS = [
  /^\.(?:aws|gnupg|ssh)$/i,
  /^\.env(?:\.|$)/i,
  /(?:^|[._-])(secrets?|credentials?|tokens?|private[-_]?keys?)(?:[._-]|$)/i,
  /\.(?:pem|p12|pfx|key|keystore)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
];

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".kts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
]);

const FEATURE_MARKERS = new Set(["domain", "domains", "feature", "features", "module", "modules", "app", "pages", "routes"]);
const MAX_TEXT_SOURCE_BYTES = 2 * 1024 * 1024;
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/,
  /\b(?:password|passwd|client_secret|access_token)\s*[:=]\s*["']?[A-Za-z0-9_+\/=.-]{12,}/i,
];

export interface RepositoryFile {
  path: string;
  size: number;
  mtimeMs: number;
  extension: string;
}

export interface ScopeCandidate {
  path: string;
  fileCount: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface RepositoryScan {
  projectRoot: string;
  git: boolean;
  head?: string;
  files: RepositoryFile[];
  candidates: ScopeCandidate[];
  fingerprint: string;
}

export interface SourceFingerprint {
  resource: string;
  hash: string;
  content?: string;
}

function normalizeRelative(path: string): string {
  return path.split(sep).join("/").replace(/^\.\//, "");
}

export function isPathInside(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function assertSafeRelativePath(path: string): string {
  const normalized = normalizeRelative(path.trim());
  if (!normalized || normalized === ".") return ".";
  if (normalized.startsWith("/") || normalized.includes("\0")) throw new Error(`Unsafe absolute or NUL path: ${path}`);
  let safetyPath = normalized;
  try {
    for (let index = 0; index < 3; index++) {
      const decoded = decodeURIComponent(safetyPath);
      if (decoded === safetyPath) break;
      safetyPath = decoded;
    }
  } catch {
    throw new Error(`Unsafe encoded path: ${path}`);
  }
  const parts = safetyPath.replace(/\\/g, "/").split("/");
  if (safetyPath.startsWith("/") || safetyPath.includes("\0") || parts.some((part) => part === ".." || part === "")) throw new Error(`Unsafe relative path: ${path}`);
  return normalized;
}

export function isSecretLike(path: string): boolean {
  const name = basename(path);
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}

export function containsLikelySecret(content: string | Buffer): boolean {
  const text = typeof content === "string" ? content : content.toString("utf8");
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isExcludedPath(path: string): boolean {
  const normalized = normalizeRelative(path);
  const parts = normalized.split("/");
  return parts.some((part) => EXCLUDED_DIRECTORIES.has(part) || isSecretLike(part)) || isSecretLike(normalized);
}

async function git(root: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

export async function findProjectRoot(cwd: string): Promise<string> {
  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return root ? resolve(root) : resolve(cwd);
}

async function fallbackWalk(root: string, current = root, output: string[] = []): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const rel = normalizeRelative(relative(root, absolute));
    if (isExcludedPath(rel) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) await fallbackWalk(root, absolute, output);
    else if (entry.isFile()) output.push(rel);
  }
  return output;
}

export async function listRepositoryPaths(root: string): Promise<string[]> {
  const gitOutput = await git(root, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const paths = gitOutput !== undefined
    ? gitOutput.split("\0").filter(Boolean).map(normalizeRelative)
    : await fallbackWalk(root);
  return [...new Set(paths.filter((path) => !isExcludedPath(path)))].sort();
}

export async function inventoryRepository(root: string): Promise<RepositoryFile[]> {
  const paths = await listRepositoryPaths(root);
  const files: RepositoryFile[] = [];
  for (const path of paths) {
    const absolute = resolve(root, path);
    if (!isPathInside(root, absolute)) continue;
    try {
      const info = await lstat(absolute);
      if (!info.isFile() || info.isSymbolicLink()) continue;
      files.push({
        path,
        size: info.size,
        mtimeMs: info.mtimeMs,
        extension: extname(path).toLowerCase(),
      });
    } catch {
      // A file may disappear between Git listing and stat; the next scan will reconcile it.
    }
  }
  return files;
}

function candidateDirectories(files: RepositoryFile[]): Map<string, { reasons: Set<string>; files: Set<string> }> {
  const candidates = new Map<string, { reasons: Set<string>; files: Set<string> }>();
  const directCodeByDirectory = new Map<string, string[]>();

  const add = (path: string, reason: string, file: string) => {
    if (!path || path === ".") return;
    const record = candidates.get(path) ?? { reasons: new Set<string>(), files: new Set<string>() };
    record.reasons.add(reason);
    record.files.add(file);
    candidates.set(path, record);
  };

  for (const file of files) {
    if (!CODE_EXTENSIONS.has(file.extension)) continue;
    const dir = normalizeRelative(dirname(file.path));
    const direct = directCodeByDirectory.get(dir) ?? [];
    direct.push(file.path);
    directCodeByDirectory.set(dir, direct);

    const parts = file.path.split("/");
    for (let index = 0; index < parts.length - 1; index++) {
      if (!FEATURE_MARKERS.has(parts[index].toLowerCase()) || index + 1 >= parts.length - 1) continue;
      const featurePath = parts.slice(0, index + 2).join("/");
      add(featurePath, `Located under '${parts[index]}'`, file.path);
    }
  }

  for (const [dir, directFiles] of directCodeByDirectory) {
    if (directFiles.length >= 2) {
      for (const file of directFiles) add(dir, `${directFiles.length} directly contained source files`, file);
    }
  }

  return candidates;
}

export function discoverScopeCandidates(files: RepositoryFile[]): ScopeCandidate[] {
  const candidates = candidateDirectories(files);
  return [...candidates.entries()]
    .map(([path, value]) => {
      const markerReason = [...value.reasons].some((reason) => reason.startsWith("Located under"));
      const fileCount = files.filter((file) => file.path === path || file.path.startsWith(`${path}/`)).length;
      return {
        path,
        fileCount,
        confidence: markerReason && fileCount >= 2 ? "high" as const : fileCount >= 2 ? "medium" as const : "low" as const,
        reasons: [...value.reasons].sort(),
      };
    })
    .filter((candidate) => candidate.fileCount > 0)
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function assertNoSymlinkPath(root: string, target: string): Promise<void> {
  const rel = relative(root, target);
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Symbolic-link sources are not supported: ${normalizeRelative(rel)}`);
  }
}

export async function readResponseLimited(response: IncomingMessage, limit: number): Promise<Buffer> {
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    response.destroy();
    throw new Error(`Source URL exceeds ${limit} bytes`);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const value of response) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    bytes += chunk.byteLength;
    if (bytes > limit) {
      response.destroy();
      throw new Error(`Source URL exceeds ${limit} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

function mappedIpv4Address(address: string): string | undefined {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (dotted) return dotted;
  if (isIP(address) !== 6) return undefined;
  const parse = (side: string): number[] => side ? side.split(":").flatMap((part) => {
    if (!part.includes(".")) return [Number.parseInt(part, 16)];
    const bytes = part.split(".").map(Number);
    return [(bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]];
  }) : [];
  const [leftText, rightText = ""] = address.toLowerCase().split("::");
  const left = parse(leftText);
  const right = parse(rightText);
  const groups = rightText || address.includes("::")
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right]
    : left;
  if (groups.length !== 8 || groups.slice(0, 5).some(Boolean) || groups[5] !== 0xffff) return undefined;
  return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
}

function isPrivateAddress(input: string): boolean {
  const address = input.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = mappedIpv4Address(address);
  if (mapped) return isPrivateAddress(mapped);
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && ((b === 0 && [0, 2].includes(c)) || b === 168))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) return address === "::" || address === "::1" || /^(?:fc|fd|fe[89ab]|ff)/.test(address);
  return true;
}

type PublicAddress = { address: string; family: 4 | 6 };

export function createPinnedLookup(addresses: PublicAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
}

async function resolvePublicSourceUrl(input: string): Promise<{ url: URL; addresses: PublicAddress[] }> {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`Unsafe source URL: ${input}`);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error(`Source URL must use a public host: ${input}`);
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error(`Source URL must resolve only to public addresses: ${input}`);
  return { url, addresses: addresses.map(({ address }) => ({ address, family: isIP(address) as 4 | 6 })) };
}

async function requestPinnedSource(target: Awaited<ReturnType<typeof resolvePublicSourceUrl>>): Promise<IncomingMessage> {
  return new Promise((resolveResponse, reject) => {
    const request = (target.url.protocol === "https:" ? httpsRequest : httpRequest)(target.url, {
      lookup: createPinnedLookup(target.addresses),
    }, resolveResponse);
    request.setTimeout(15_000, () => request.destroy(new Error(`Source URL timed out: ${target.url}`)));
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicSource(input: string): Promise<Buffer> {
  let target = await resolvePublicSourceUrl(input);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await requestPinnedSource(target);
    if (![301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
      if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
        response.destroy();
        throw new Error(`Unable to read source URL (${response.statusCode ?? "unknown"}): ${input}`);
      }
      return readResponseLimited(response, MAX_TEXT_SOURCE_BYTES);
    }
    const location = response.headers.location;
    response.destroy();
    if (!location) throw new Error(`Source URL redirect is missing a location: ${target.url}`);
    target = await resolvePublicSourceUrl(new URL(location, target.url).href);
  }
  throw new Error(`Source URL redirected too many times: ${input}`);
}

async function hashFiles(root: string, paths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    const absolute = resolve(root, path);
    const info = await stat(absolute);
    hash.update(path);
    hash.update("\0");
    if (info.size <= MAX_TEXT_SOURCE_BYTES) {
      const content = await readFile(absolute);
      if (containsLikelySecret(content)) throw new Error(`Source contains likely secret material: ${path}`);
      hash.update(content);
    } else hash.update(`${info.size}:${info.mtimeMs}`);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export async function fingerprintSource(root: string, input: string, fetchRemote = false): Promise<SourceFingerprint> {
  if (containsLikelySecret(input)) throw new Error(`Source identifier contains likely secret material: ${input}`);
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if ([...url.searchParams].some(([key, value]) => containsLikelySecret(`${key}=${value}`))) throw new Error(`Source URL contains likely secret material: ${input}`);
    if (!fetchRemote) {
      return {
        resource: input,
        hash: `sha256:${createHash("sha256").update(input).digest("hex")}`,
      };
    }
    const buffer = await fetchPublicSource(input);
    if (containsLikelySecret(buffer)) throw new Error(`Source URL contains likely secret material: ${input}`);
    return {
      resource: input,
      hash: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
      content: buffer.toString("utf8"),
    };
  }

  const repoPath = input.startsWith("repo://") ? input.slice("repo://".length) : input;
  if (!isAbsolute(repoPath)) assertSafeRelativePath(repoPath);
  const lexicalRoot = resolve(root);
  const canonicalRoot = await realpath(root);
  const absolute = isAbsolute(repoPath) && isPathInside(lexicalRoot, repoPath)
    ? resolve(canonicalRoot, relative(lexicalRoot, repoPath))
    : resolve(canonicalRoot, repoPath);
  if (!isPathInside(canonicalRoot, absolute)) throw new Error(`Source must be inside the project root: ${input}`);
  await assertNoSymlinkPath(canonicalRoot, absolute);
  const canonical = await realpath(absolute);
  if (!isPathInside(canonicalRoot, canonical)) throw new Error(`Source resolves outside the project root: ${input}`);
  const info = await lstat(canonical);
  const relativeCanonical = normalizeRelative(relative(canonicalRoot, canonical));
  if (relativeCanonical.split("/").some(isSecretLike)) throw new Error(`Unsupported or secret-like source: ${input}`);
  if (info.isSymbolicLink()) throw new Error(`Symbolic-link sources are not supported: ${input}`);

  if (info.isDirectory()) {
    const allPaths = await listRepositoryPaths(canonicalRoot);
    const relativeDirectory = relativeCanonical;
    const paths = allPaths.filter((path) => path.startsWith(`${relativeDirectory}/`) && !isSecretLike(path));
    return {
      resource: `repo://${relativeDirectory}`,
      hash: await hashFiles(canonicalRoot, paths),
    };
  }
  if (!info.isFile() || isSecretLike(canonical)) throw new Error(`Unsupported or secret-like source: ${input}`);
  const relativeFile = relativeCanonical;
  const buffer = await readFile(canonical);
  if (containsLikelySecret(buffer)) throw new Error(`Source contains likely secret material: ${input}`);
  return {
    resource: `repo://${relativeFile}`,
    hash: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
    content: buffer.length <= MAX_TEXT_SOURCE_BYTES ? buffer.toString("utf8") : undefined,
  };
}

export async function repositoryHead(root: string): Promise<string | undefined> {
  return git(root, ["rev-parse", "HEAD"]);
}

export async function isGitRepository(root: string): Promise<boolean> {
  return await git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}

export async function changedRepositoryPaths(root: string, since?: string): Promise<string[]> {
  const changes = new Set<string>();
  if (since) {
    const diff = await git(root, ["diff", "--name-only", "-M", `${since}..HEAD`]);
    for (const path of diff?.split("\n") ?? []) if (path && !isExcludedPath(path)) changes.add(normalizeRelative(path));
  }
  const working = await git(root, ["status", "--porcelain=v1", "-z"]);
  if (working) {
    for (const entry of working.split("\0").filter(Boolean)) {
      const path = entry.slice(3).split(" -> ").at(-1)?.trim();
      if (path && !isExcludedPath(path)) changes.add(normalizeRelative(path));
    }
  }
  return [...changes].sort();
}

export function mapPathsToScopes(paths: string[], scopes: string[]): Record<string, string[]> {
  const ordered = [...scopes].sort((a, b) => b.length - a.length);
  const result: Record<string, string[]> = {};
  for (const path of paths) {
    const scope = ordered.find((candidate) => path === candidate || path.startsWith(`${candidate}/`)) ?? ".";
    (result[scope] ??= []).push(path);
  }
  return result;
}

export async function scanRepository(root: string): Promise<RepositoryScan> {
  const projectRoot = await findProjectRoot(root);
  const files = await inventoryRepository(projectRoot);
  const [head, gitRepository] = await Promise.all([repositoryHead(projectRoot), isGitRepository(projectRoot)]);
  const fingerprint = createHash("sha256")
    .update(files.map((file) => `${file.path}:${file.size}:${Math.floor(file.mtimeMs)}`).join("\n"))
    .digest("hex");
  return {
    projectRoot,
    git: gitRepository,
    head,
    files,
    candidates: discoverScopeCandidates(files),
    fingerprint: `sha256:${fingerprint}`,
  };
}
