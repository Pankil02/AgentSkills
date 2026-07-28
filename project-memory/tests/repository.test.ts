import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  changedRepositoryPaths,
  createPinnedLookup,
  deepScanRepository,
  fingerprintSource,
  inventoryRepository,
  isSecretLike,
  mapPathsToScopes,
  readResponseLimited,
  scanRepository,
} from "../src/repository.ts";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "knotspot");

async function fixtureProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "project-memory-repository-"));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

test("non-Git scan discovers evidence-backed scopes", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  const scan = await scanRepository(root);
  assert.equal(scan.git, false);
  assert(scan.candidates.some((candidate) => candidate.path === "apps/api/src/domains/user" && candidate.confidence === "high"));
  assert(scan.candidates.some((candidate) => candidate.path === "apps/api/src/events"));
  assert(scan.candidates.some((candidate) => candidate.path === "apps/web/app/dashboard" && candidate.confidence === "high"));
  assert.match(scan.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("inventory excludes secrets, dependencies, build output, and memory", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(join(root, "dist"), { recursive: true });
  await mkdir(join(root, ".memory"), { recursive: true });
  await writeFile(join(root, ".env.production"), "SECRET=value\n");
  await writeFile(join(root, "node_modules", "pkg", "index.js"), "bad\n");
  await writeFile(join(root, "dist", "bundle.js"), "bad\n");
  await writeFile(join(root, ".memory", "index.md"), "bad\n");
  const files = await inventoryRepository(root);
  const paths = files.map((file) => file.path);
  assert(!paths.some((path) => path.includes("node_modules")));
  assert(!paths.some((path) => path.startsWith("dist/")));
  assert(!paths.some((path) => path.startsWith(".memory/")));
  assert(!paths.includes(".env.production"));
  assert.equal(isSecretLike("credentials.json"), true);
  assert.equal(isSecretLike("id_ed25519"), true);
});

test("source fingerprints are stable and detect file and directory changes", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  const first = await fingerprintSource(root, "repo://docs/requirements.md");
  const same = await fingerprintSource(root, "docs/requirements.md");
  assert.equal(first.hash, same.hash);
  assert.equal(first.resource, "repo://docs/requirements.md");
  await writeFile(join(root, "docs", "requirements.md"), `${await readFile(join(root, "docs", "requirements.md"), "utf8")}\nChanged.\n`);
  const changed = await fingerprintSource(root, "repo://docs/requirements.md");
  assert.notEqual(changed.hash, first.hash);
  assert.match((await fingerprintSource(root, "repo://apps/api/src/events")).hash, /^sha256:[a-f0-9]{64}$/);
  await assert.rejects(() => fingerprintSource(root, "../outside"), /Unsafe relative path|inside the project root/);
  await writeFile(join(root, "docs", "leak.md"), "password=supersecretvalue123\n");
  await assert.rejects(() => fingerprintSource(root, "repo://docs/leak.md"), /likely secret material/);
  await mkdir(join(root, ".ssh"));
  await writeFile(join(root, ".ssh", "id_test"), "private");
  await assert.rejects(() => fingerprintSource(root, "repo://.ssh"), /secret-like source/);
  try {
    await symlink(join(root, "docs", "requirements.md"), join(root, "docs", "linked.md"));
    await assert.rejects(() => fingerprintSource(root, "repo://docs/linked.md"), /Symbolic-link sources/);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
});

test("remote source fetching rejects local and private network targets", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => fingerprintSource(root, "http://127.0.0.1/private", true), /public/);
  await assert.rejects(() => fingerprintSource(root, "http://localhost/private", true), /public/);
  await assert.rejects(() => fingerprintSource(root, "http://[::1]/private", true), /public/);
  await assert.rejects(() => fingerprintSource(root, "http://[::ffff:7f00:1]/private", true), /public/);
  await assert.rejects(() => fingerprintSource(root, "https://example.com/spec?access_token=supersecretvalue123"), /secret material/);
  await assert.rejects(() => fingerprintSource(root, "https://example.com/spec?access%5Ftoken=supersecretvalue123"), /secret material/);
});

test("pinned DNS lookup supports Node's all-address request mode", async () => {
  const lookup = createPinnedLookup([{ address: "93.184.216.34", family: 4 }]);
  await new Promise<void>((resolvePromise, reject) => lookup("example.com", { all: true }, (error, addresses) => {
    if (error) return reject(error);
    assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
    resolvePromise();
  }));
});

test("oversized remote responses are destroyed before rejection", async () => {
  const response = Readable.from([]) as any;
  response.headers = { "content-length": "100" };
  await assert.rejects(() => readResponseLimited(response, 10), /exceeds/);
  assert.equal(response.destroyed, true);
});

test("changed paths map to the deepest tracked scope", () => {
  const mapped = mapPathsToScopes([
    "apps/api/src/domains/user/index.ts",
    "apps/api/src/events/publish.ts",
    "README.md",
  ], [".", "apps/api/src/domains/user", "apps/api/src/events"]);
  assert.deepEqual(mapped["apps/api/src/domains/user"], ["apps/api/src/domains/user/index.ts"]);
  assert.deepEqual(mapped["apps/api/src/events"], ["apps/api/src/events/publish.ts"]);
  assert.deepEqual(mapped["."], ["README.md"]);
});

test("changed path lookup remains safe outside Git", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await changedRepositoryPaths(root), []);
});

test("deepScanRepository inspects codebase structure, manifests, and architecture", async (t) => {
  const root = await fixtureProject();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "test-app",
    dependencies: { react: "^18.0.0", next: "^14.0.0" },
    devDependencies: { vitest: "^1.0.0" },
  }));
  await writeFile(join(root, ".env.example"), "DATABASE_URL=postgresql://localhost:5432/db\nAPI_KEY=123\n");
  const deep = await deepScanRepository(root);
  assert.deepEqual(deep.techStack.languages.includes("TypeScript"), true);
  assert.deepEqual(deep.techStack.frameworks.includes("Next.js"), true);
  assert.deepEqual(deep.techStack.frameworks.includes("React"), true);
  assert.deepEqual(deep.techStack.testingTools.includes("Vitest"), true);
  assert.deepEqual(deep.environment.envVariables, ["API_KEY", "DATABASE_URL"]);
  assert(deep.architecture.packages.some((pkg: { path: string }) => pkg.path === "apps/api"));
});

