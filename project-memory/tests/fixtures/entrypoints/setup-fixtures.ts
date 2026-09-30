import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FixtureDefinition {
  name: string;
  files: Record<string, string>;
  expectedShape: "single-package" | "workspace" | "unknown";
  expectedScopeCount: number;
  expectedLanguages: string[];
  expectedVerification?: {
    scope: string;
    cmdPart: string;
  };
}

export const FIXTURE_DEFINITIONS: Record<string, FixtureDefinition> = {
  "single-package": {
    name: "single-package",
    files: {
      "package.json": JSON.stringify({
        name: "single-lib",
        version: "1.0.0",
        scripts: { test: "node --test", build: "tsc" },
        dependencies: {}
      }, null, 2),
      "src/index.ts": "export function greet(name: string): string { return `Hello, ${name}`; }\n",
      "tests/index.test.ts": "import test from 'node:test';\nimport assert from 'node:assert';\ntest('greet', () => { assert.equal(1, 1); });\n",
      "README.md": "# Single Lib\nA single package library.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: ["TypeScript"]
  },
  "workspace-monorepo": {
    name: "workspace-monorepo",
    files: {
      "package.json": JSON.stringify({
        name: "root-mono",
        private: true,
        workspaces: ["apps/*", "packages/*"]
      }, null, 2),
      "turbo.json": JSON.stringify({ pipeline: { build: {}, test: {} } }, null, 2),
      "apps/api/package.json": JSON.stringify({
        name: "@mono/api",
        scripts: { test: "vitest run" },
        dependencies: { express: "^4.18.0" }
      }, null, 2),
      "apps/api/src/server.ts": "export const port = 3000;\n",
      "apps/web/package.json": JSON.stringify({
        name: "@mono/web",
        scripts: { test: "playwright test" },
        dependencies: { next: "^14.0.0", react: "^18.0.0" }
      }, null, 2),
      "apps/web/src/app/page.tsx": "export default function Page() { return <div>Web</div>; }\n",
      "packages/shared/package.json": JSON.stringify({
        name: "@mono/shared",
        scripts: { test: "vitest run" }
      }, null, 2),
      "packages/shared/src/index.ts": "export const SHARED_CONSTANT = 42;\n",
      "README.md": "# Workspace Monorepo\nMulti-package repository with Turborepo.\n"
    },
    expectedShape: "workspace",
    expectedScopeCount: 3,
    expectedLanguages: ["TypeScript"]
  },
  "duplicate-roots-nested": {
    name: "duplicate-roots-nested",
    files: {
      "package.json": JSON.stringify({
        name: "app-with-examples",
        scripts: { test: "vitest run" }
      }, null, 2),
      "src/index.ts": "export const main = true;\n",
      "examples/nested-sample/package.json": JSON.stringify({
        name: "nested-sample"
      }, null, 2),
      "examples/nested-sample/demo.ts": "console.log('demo');\n",
      "README.md": "# App With Examples\nHas a non-workspace nested example package.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: ["TypeScript"]
  },
  "python-package": {
    name: "python-package",
    files: {
      "pyproject.toml": `[project]
name = "data-processor"
version = "0.1.0"
dependencies = ["fastapi", "sqlalchemy"]

[tool.pytest.ini_options]
testpaths = ["tests"]
`,
      "src/processor/__init__.py": "__version__ = '0.1.0'\n",
      "src/processor/core.py": "def process_data(item):\n    return item * 2\n",
      "tests/test_core.py": "def test_process():\n    assert True\n",
      "README.md": "# Data Processor\nPython package with FastAPI and SQLAlchemy.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: ["Python"]
  },
  "go-module": {
    name: "go-module",
    files: {
      "go.mod": "module example.com/goservice\n\ngo 1.22\n",
      "cmd/server/main.go": "package main\n\nfunc main() {}\n",
      "pkg/auth/auth.go": "package auth\n\nfunc Verify() bool { return true }\n",
      "pkg/auth/auth_test.go": "package auth\nimport \"testing\"\nfunc TestVerify(t *testing.T) {}\n",
      "README.md": "# Go Service\nA Go backend microservice.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: ["Go"]
  },
  "rust-workspace": {
    name: "rust-workspace",
    files: {
      "Cargo.toml": `[workspace]
members = [
    "crates/core",
    "crates/cli",
]
`,
      "crates/core/Cargo.toml": `[package]
name = "core"
version = "0.1.0"
edition = "2021"
`,
      "crates/core/src/lib.rs": "pub fn run() -> bool { true }\n",
      "crates/cli/Cargo.toml": `[package]
name = "cli"
version = "0.1.0"
edition = "2021"

[dependencies]
core = { path = "../core" }
`,
      "crates/cli/src/main.rs": "fn main() {}\n",
      "README.md": "# Rust Workspace\nCargo multi-crate workspace.\n"
    },
    expectedShape: "workspace",
    expectedScopeCount: 2,
    expectedLanguages: ["Rust"]
  },
  "mixed-language": {
    name: "mixed-language",
    files: {
      "Makefile": "test:\n\tpytest && npm test\nbuild:\n\tnpm run build\n",
      "backend/pyproject.toml": `[project]
name = "backend-api"
version = "0.1.0"
`,
      "backend/app.py": "def app(): pass\n",
      "frontend/package.json": JSON.stringify({
        name: "frontend-ui",
        scripts: { test: "vitest run" }
      }, null, 2),
      "frontend/src/main.js": "console.log('UI');\n",
      "README.md": "# Mixed Language\nPolyglot project with Make, Python backend and JS frontend.\n"
    },
    expectedShape: "workspace",
    expectedScopeCount: 2,
    expectedLanguages: ["JavaScript", "Python"]
  },
  "docs-only": {
    name: "docs-only",
    files: {
      "mkdocs.yml": "site_name: Knowledge Base\nnav:\n  - Home: index.md\n  - Guide: guide.md\n",
      "docs/index.md": "# Knowledge Base\nWelcome to docs.\n",
      "docs/guide.md": "# Guide\nUser guide content.\n",
      "README.md": "# Docs Only\nDocumentation-only repository.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: []
  },
  "empty-repo": {
    name: "empty-repo",
    files: {
      "README.md": "# Empty Repository\nJust a simple readme.\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: []
  },
  "unsupported-language": {
    name: "unsupported-language",
    files: {
      "src/main.zig": "pub fn main() void {}\n",
      "src/math.zig": "pub fn add(a: i32, b: i32) i32 { return a + b; }\n",
      "README.md": "# Zig Project\nProject written in Zig (unsupported by default scanner).\n"
    },
    expectedShape: "single-package",
    expectedScopeCount: 0,
    expectedLanguages: []
  }
};

export async function populateFixture(targetDir: string, fixtureKey: string): Promise<string> {
  const def = FIXTURE_DEFINITIONS[fixtureKey];
  if (!def) throw new Error(`Unknown fixture key: ${fixtureKey}`);
  const root = join(targetDir, fixtureKey);
  await mkdir(root, { recursive: true });
  for (const [relPath, content] of Object.entries(def.files)) {
    const fullPath = join(root, relPath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }
  return root;
}
