// @ts-check
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  symlinkSync,
  mkdtempSync,
  mkdirSync,
  unlinkSync,
  cpSync,
  rmSync,
  existsSync
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  parseManifest,
  parseMarkdown,
  validateDiagram,
  compileBundle,
  scanTableRow,
  buildNavigationIndex
} from '../feature-proposal/scripts/format.mjs';
import {
  readBundle,
  isPathContained,
  isForbiddenPath,
  writeExport
} from '../feature-proposal/scripts/files.mjs';
import { runCli } from '../feature-proposal/scripts/proposal.mjs';
import { startViewer } from '../feature-proposal/scripts/server.mjs';
import {
  resolveSystemIcon,
  SYSTEM_ICONS,
  ICON_ALIASES,
  getSystemIconTheme
} from '../feature-proposal/templates/viewer/diagrams.js';
import { startBrowserHarness } from './browser/feature-proposal/server.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = resolve(__dirname, 'fixtures/feature-proposal');

/**
 * Helper to perform raw HTTP requests without WHATWG Fetch forbidden header restrictions.
 * @param {import('node:http').RequestOptions} options
 * @returns {Promise<{ status: number | undefined; headers: import('node:http').IncomingHttpHeaders; body: string }>}
 */
function rawRequest(options) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Loads the fixture proposal bundle as a ReadBundle.
 */
function loadFixtureBundle() {
  const manifestPath = resolve(FIXTURE_DIR, 'proposal.md');
  const manifestSource = readFileSync(manifestPath, 'utf8');
  const manifestRes = parseManifest(manifestSource);
  assert.ok(manifestRes.value, 'Fixture manifest must be valid');

  const documents = [
    {
      id: 'manifest',
      path: 'proposal.md',
      source: manifestSource
    }
  ];

  for (const doc of manifestRes.value.documents) {
    const docPath = resolve(FIXTURE_DIR, doc.path);
    const source = readFileSync(docPath, 'utf8');
    documents.push({
      id: doc.id,
      path: doc.path,
      source
    });
  }

  return { manifestPath, documents };
}

describe('Feature Proposal Format & Parser Suite', () => {
  describe('format / metadata', () => {
    it('should successfully parse valid manifest metadata', () => {
      const source = readFileSync(resolve(FIXTURE_DIR, 'proposal.md'), 'utf8');
      const res = parseManifest(source);
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);
      assert.strictEqual(res.value.id, 'saved-search-alerts');
      assert.strictEqual(res.value.schemaVersion, 1);
      assert.strictEqual(res.value.documents.length, 8);
    });

    it('should reject missing or duplicate proposal-meta fences', () => {
      const missing = '# Title\n\nNo meta here';
      assert.strictEqual(parseManifest(missing).value, null);

      const duplicate = `\`\`\`proposal-meta
{"schemaVersion":1,"id":"a","title":"A","status":"draft","created":"2026-10-01","updated":"2026-10-01","owner":"O","summary":"S","documents":[]}
\`\`\`
\`\`\`proposal-meta
{"schemaVersion":1,"id":"b","title":"B","status":"draft","created":"2026-10-01","updated":"2026-10-01","owner":"O","summary":"S","documents":[]}
\`\`\``;
      const dupRes = parseManifest(duplicate);
      assert.strictEqual(dupRes.value, null);
      assert.ok(dupRes.diagnostics.some((d) => d.code === 'INVALID_METADATA'));
    });

    it('should reject unknown metadata keys and dangerous object keys', () => {
      const hostile = `\`\`\`proposal-meta
{
  "schemaVersion": 1,
  "id": "good-id",
  "title": "Title",
  "status": "draft",
  "created": "2026-10-01",
  "updated": "2026-10-01",
  "owner": "Owner",
  "summary": "Summary",
  "documents": [],
  "__proto__": { "polluted": true }
}
\`\`\``;
      const res = parseManifest(hostile);
      assert.strictEqual(res.value, null);
      assert.ok(res.diagnostics.some((d) => d.code === 'INVALID_METADATA'));
    });

    it('should reject invalid dates and chronological reversal', () => {
      const badDate = `\`\`\`proposal-meta
{
  "schemaVersion": 1,
  "id": "good-id",
  "title": "Title",
  "status": "draft",
  "created": "2026-10-32",
  "updated": "2026-10-01",
  "owner": "Owner",
  "summary": "Summary",
  "documents": []
}
\`\`\``;
      const res = parseManifest(badDate);
      assert.strictEqual(res.value, null);

      const reversedDate = `\`\`\`proposal-meta
{
  "schemaVersion": 1,
  "id": "good-id",
  "title": "Title",
  "status": "draft",
  "created": "2026-10-05",
  "updated": "2026-10-01",
  "owner": "Owner",
  "summary": "Summary",
  "documents": []
}
\`\`\``;
      const revRes = parseManifest(reversedDate);
      assert.strictEqual(revRes.value, null);
    });

    it('should reject invalid slugs, reserved ID manifest, and path traversal', () => {
      const reservedSlug = `\`\`\`proposal-meta
{
  "schemaVersion": 1,
  "id": "manifest",
  "title": "Title",
  "status": "draft",
  "created": "2026-10-01",
  "updated": "2026-10-01",
  "owner": "Owner",
  "summary": "Summary",
  "documents": []
}
\`\`\``;
      assert.strictEqual(parseManifest(reservedSlug).value, null);

      const badPath = `\`\`\`proposal-meta
{
  "schemaVersion": 1,
  "id": "valid-slug",
  "title": "Title",
  "status": "draft",
  "created": "2026-10-01",
  "updated": "2026-10-01",
  "owner": "Owner",
  "summary": "Summary",
  "documents": [
    { "id": "overview", "tab": "overview", "title": "Overview", "path": "sections/../../secret.md" }
  ]
}
\`\`\``;
      const pathRes = parseManifest(badPath);
      assert.strictEqual(pathRes.value, null);
      assert.ok(pathRes.diagnostics.some((d) => d.code === 'INVALID_PATH'));
    });
  });

  describe('format / Markdown', () => {
    it('should parse headings, code blocks, quotes, lists, and paragraphs', () => {
      const doc = `# Main Heading
Paragraph with **bold** text and \`inline code\`.

> This is a blockquote.

- Bullet 1
- [x] Done task
- [ ] Open task

\`\`\`javascript
const x = 42;
\`\`\`
`;
      const res = parseMarkdown(doc, 'test-doc');
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);
      assert.strictEqual(res.value.length, 5);
      assert.strictEqual(res.value[0].type, 'heading');
      assert.strictEqual(res.value[1].type, 'paragraph');
      assert.strictEqual(res.value[2].type, 'quote');
      assert.strictEqual(res.value[3].type, 'list');
      assert.strictEqual(res.value[4].type, 'code');
    });

    it('should correctly handle escaped table pipes and detect malformed columns', () => {
      const tableWithEscapedPipe = `| Command | Escaped \\| Pipe | Output |
|---|---|---|
| ls | file1 \\| file2 | success |`;
      const res = parseMarkdown(tableWithEscapedPipe, 'table-doc');
      assert.ok(res.value);
      assert.strictEqual(res.value[0].type, 'table');

      // Test scanner directly
      const scanned = scanTableRow('| col1 \\| still col1 | col2 |');
      assert.deepStrictEqual(scanned, ['col1 | still col1', 'col2']);

      // Malformed row column count
      const unevenTable = `| H1 | H2 |
|---|---|
| R1C1 | R1C2 | R1C3 Extra |`;
      const unevenRes = parseMarkdown(unevenTable, 'uneven-doc');
      assert.ok(unevenRes.diagnostics.some((d) => d.code === 'MALFORMED_TABLE'));
    });

    it('should detect unclosed code fences and emit error', () => {
      const unclosed = '```typescript\nconst open = true;\n';
      const res = parseMarkdown(unclosed, 'unclosed-doc');
      assert.strictEqual(res.value, null);
      assert.ok(res.diagnostics.some((d) => d.code === 'UNCLOSED_FENCE'));
    });

    it('should emit warning for raw HTML and treat as inert text', () => {
      const rawHtml = 'Check out <script>alert("xss")</script> safely.';
      const res = parseMarkdown(rawHtml, 'html-doc');
      assert.ok(res.value);
      assert.ok(res.diagnostics.some((d) => d.code === 'RAW_HTML_WARNING'));
    });
  });

  describe('format / links', () => {
    it('should allow internal anchors and safe https links, warning on unsafe schemes', () => {
      const doc = `[Internal Anchor](#architecture)
[Safe External](https://example.com)
[Unsafe JS](javascript:alert(1))
[Unsafe File](file:///etc/passwd)
`;
      const res = parseMarkdown(doc, 'links-doc');
      assert.ok(res.value);
      assert.ok(res.diagnostics.some((d) => d.code === 'UNSAFE_LINK'));
    });
  });

  describe('diagram', () => {
    it('should validate compliant graph diagrams', () => {
      const validGraph = {
        schemaVersion: 1,
        type: 'graph',
        id: 'flow-1',
        title: 'Component Flow',
        summary: 'A simple graph',
        nodes: [
          { id: 'client', label: 'Client', lane: 0, order: 0, role: 'actor' },
          { id: 'api', label: 'API Gateway', lane: 1, order: 0, role: 'service' }
        ],
        edges: [
          { id: 'e1', from: 'client', to: 'api', label: 'GET /items', kind: 'sync' }
        ]
      };
      const res = validateDiagram(validGraph, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);
    });

    it('should validate graph diagrams with optional lane, order, role, and kind', () => {
      const minimalGraph = {
        schemaVersion: 1,
        type: 'graph',
        id: 'flow-minimal',
        title: 'Minimal Graph Flow',
        summary: 'Graph with auto-layout without manual lane/order',
        nodes: [
          { id: 'client', label: 'Client' },
          { id: 'server', label: 'Server' }
        ],
        edges: [
          { id: 'e1', from: 'client', to: 'server', label: 'Call' }
        ]
      };
      const res = validateDiagram(minimalGraph, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);
    });

    it('should reject graph self-edges without explicit top or bottom route', () => {
      const invalidSelfEdge = {
        schemaVersion: 1,
        type: 'graph',
        id: 'flow-self',
        title: 'Self Loop',
        summary: 'Self loop diagram',
        nodes: [
          { id: 'worker', label: 'Worker', lane: 0, order: 0, role: 'service' }
        ],
        edges: [
          { id: 'e-loop', from: 'worker', to: 'worker', label: 'Retry', kind: 'async' }
        ]
      };
      const res = validateDiagram(invalidSelfEdge, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res.value, null);
      assert.ok(res.diagnostics.some((d) => d.code === 'INVALID_DIAGRAM'));
    });

    it('should validate compliant sequence diagrams and enforce limits', () => {
      const validSeq = {
        schemaVersion: 1,
        type: 'sequence',
        id: 'auth-seq',
        title: 'Auth Flow',
        summary: 'User auth sequence',
        participants: [
          { id: 'user', label: 'User' },
          { id: 'server', label: 'Server' }
        ],
        messages: [
          { id: 'msg-1', from: 'user', to: 'server', label: 'Login', kind: 'request' },
          { id: 'msg-2', from: 'server', to: 'user', label: 'Token', kind: 'response' }
        ]
      };
      const res = validateDiagram(validSeq, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);

      // Exceed participants (>6)
      const tooManyParticipants = {
        ...validSeq,
        participants: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `p${n}`, label: `P${n}` }))
      };
      const limitRes = validateDiagram(tooManyParticipants, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(limitRes.value, null);
      assert.ok(limitRes.diagnostics.some((d) => d.code === 'DIAGRAM_LIMIT'));
    });

    it('should validate system design icons on graph nodes and sequence participants', () => {
      const graphWithIcons = {
        schemaVersion: 1,
        type: 'graph',
        id: 'sys-design-flow',
        title: 'Web System Architecture',
        summary: 'Architecture flow with explicit system design icons',
        nodes: [
          { id: 'cdn', label: 'CDN Edge', icon: 'cdn', lane: 0, order: 0, role: 'external' },
          { id: 'lb', label: 'Load Balancer', icon: 'load-balancer', lane: 1, order: 0, role: 'service' },
          { id: 'app', label: 'App Server', icon: 'app-server', lane: 2, order: 0, role: 'service' },
          { id: 'cache', label: 'Redis Cache', icon: 'redis', lane: 3, order: 0, role: 'store' },
          { id: 'db', label: 'SQL Database', icon: 'database', lane: 4, order: 0, role: 'store' }
        ],
        edges: [
          { id: 'e1', from: 'cdn', to: 'lb', label: 'Route' },
          { id: 'e2', from: 'lb', to: 'app', label: 'Balance' },
          { id: 'e3', from: 'app', to: 'cache', label: 'Cache lookup' },
          { id: 'e4', from: 'app', to: 'db', label: 'SQL Query' }
        ]
      };
      const res = validateDiagram(graphWithIcons, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res.value);

      // Sequence with icons
      const seqWithIcons = {
        schemaVersion: 1,
        type: 'sequence',
        id: 'sys-seq',
        title: 'System Design Sequence',
        summary: 'Step sequence with icons',
        participants: [
          { id: 'browser', label: 'Web Browser', icon: 'browser' },
          { id: 'cdn', label: 'Cloudflare CDN', icon: 'cdn' },
          { id: 'api', label: 'API Gateway', icon: 'api-gateway' }
        ],
        messages: [
          { id: 'm1', from: 'browser', to: 'cdn', label: 'Fetch Asset', kind: 'request' },
          { id: 'm2', from: 'cdn', to: 'api', label: 'Origin Forward', kind: 'request' }
        ]
      };
      const seqRes = validateDiagram(seqWithIcons, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(seqRes.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(seqRes.value);
    });

    it('should reject invalid node or participant icons', () => {
      const invalidNodeIcon = {
        schemaVersion: 1,
        type: 'graph',
        id: 'bad-icon-graph',
        title: 'Bad Icon',
        summary: 'Testing icon validation',
        nodes: [
          { id: 'n1', label: 'Node', icon: 'this-icon-name-is-way-too-long-to-be-valid-in-diagram-schema-limits' }
        ],
        edges: []
      };
      const res1 = validateDiagram(invalidNodeIcon, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res1.value, null);
      assert.ok(res1.diagnostics.some((d) => d.code === 'INVALID_DIAGRAM'));

      const invalidPartIcon = {
        schemaVersion: 1,
        type: 'sequence',
        id: 'bad-icon-seq',
        title: 'Bad Participant Icon',
        summary: 'Testing participant icon validation',
        participants: [
          // @ts-expect-error icon must be string
          { id: 'p1', label: 'User', icon: 12345 }
        ],
        messages: []
      };
      const res2 = validateDiagram(invalidPartIcon, { documentId: 'diag-doc', line: 1 });
      assert.strictEqual(res2.value, null);
      assert.ok(res2.diagnostics.some((d) => d.code === 'INVALID_DIAGRAM'));
    });

    it('should accurately resolve system design icons and theme palettes', () => {
      // Explicit icons
      assert.strictEqual(resolveSystemIcon({ icon: 'cdn' }), 'cdn');
      assert.strictEqual(resolveSystemIcon({ icon: 'sql' }), 'database');
      assert.strictEqual(resolveSystemIcon({ icon: 'cache' }), 'redis');
      assert.strictEqual(resolveSystemIcon({ icon: 'load-balancer' }), 'load-balancer');

      // Auto-inferred icons from labels and roles
      assert.strictEqual(resolveSystemIcon({ id: 'edge', label: 'Cloudflare CDN' }), 'cdn');
      assert.strictEqual(resolveSystemIcon({ id: 'pg', label: 'PostgreSQL Database' }), 'database');
      assert.strictEqual(resolveSystemIcon({ id: 'mem', label: 'Redis Cache' }), 'redis');
      assert.strictEqual(resolveSystemIcon({ id: 'lb', label: 'HAProxy Load Balancer' }), 'load-balancer');
      assert.strictEqual(resolveSystemIcon({ id: 'client', label: 'Web Browser Client' }), 'browser');
      assert.strictEqual(resolveSystemIcon({ id: 'app', label: 'Application Server Core' }), 'app-server');
      assert.strictEqual(resolveSystemIcon({ id: 'worker', label: 'Cron Worker Job' }), 'worker');
      assert.strictEqual(resolveSystemIcon({ id: 'kafka', label: 'Kafka Event Bus' }), 'queue');
      assert.strictEqual(resolveSystemIcon({ id: 's3', label: 'S3 Object Storage' }), 'storage');
      assert.strictEqual(resolveSystemIcon({ id: 'auth', label: 'OAuth Security Provider' }), 'auth');

      // Theme colors
      const dbTheme = getSystemIconTheme('database');
      assert.ok(dbTheme.color);
      assert.ok(dbTheme.tileBg);
      assert.ok(dbTheme.tileBorder);

      // Verify all 20 canonical icons exist in registry
      const expectedKeys = [
        'database', 'redis', 'cdn', 'browser', 'app-server', 'server',
        'load-balancer', 'api-gateway', 'queue', 'external', 'storage',
        'auth', 'worker', 'search', 'metrics', 'notification', 'container',
        'state', 'user', 'network'
      ];
      for (const k of expectedKeys) {
        assert.ok(SYSTEM_ICONS[k], `Missing canonical icon: ${k}`);
        assert.strictEqual(typeof SYSTEM_ICONS[k].draw, 'function');
        const shapes = SYSTEM_ICONS[k].draw(SYSTEM_ICONS[k].color);
        assert.ok(shapes.length > 0, `Icon ${k} should have SVG shapes`);
      }
    });
  });

  describe('source & compilation', () => {
    it('should compile fixture bundle deterministically with stable version hash', () => {
      const bundle1 = loadFixtureBundle();
      const res1 = compileBundle(bundle1);
      assert.strictEqual(res1.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(res1.value);

      const bundle2 = loadFixtureBundle();
      const res2 = compileBundle(bundle2);
      assert.ok(res2.value);

      assert.strictEqual(res1.value.version, res2.value.version);
      assert.strictEqual(res1.value.documents.length, 9); // Manifest + 8 sections
      assert.strictEqual(res1.value.tabs.length, 8);
    });

    it('should detect unresolved cross-section internal anchor targets', () => {
      const brokenBundle = loadFixtureBundle();
      const overviewDoc = brokenBundle.documents.find((d) => d.id === 'overview');
      assert.ok(overviewDoc);
      // Inject broken anchor link
      overviewDoc.source += '\n\n[Broken Link](#non-existent-anchor)\n';

      const res = compileBundle(brokenBundle);
      assert.strictEqual(res.value, null);
      assert.ok(res.diagnostics.some((d) => d.code === 'UNKNOWN_ANCHOR'));
    });
  });

  describe('files & safety', () => {
    it('should ignore unlisted files in sections/ directory (manifest-first reading)', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-test-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        // Place unlisted sentinel file in sections/
        writeFileSync(join(tempDir, 'sections/unlisted-secret.md'), 'Top secret content', 'utf8');

        const bundle = await readBundle(join(tempDir, 'proposal.md'));
        assert.ok(bundle.documents.every((d) => !d.path.includes('unlisted-secret')));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should reject symlinked section files', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-test-sym-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        const targetSection = join(tempDir, 'sections/01-overview.md');
        const backupSection = join(tempDir, 'sections/01-overview-orig.md');
        renameSync(targetSection, backupSection);
        symlinkSync(backupSection, targetSection);

        await assert.rejects(
          async () => {
            await readBundle(join(tempDir, 'proposal.md'));
          },
          /Symlinks are forbidden/
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should reject invalid UTF-8 bytes with fatal decoder error', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-test-utf8-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        // Write invalid UTF-8 sequence (0xFF 0xFE)
        const invalidBuffer = Buffer.from([0xff, 0xfe, 0xfa]);
        writeFileSync(join(tempDir, 'sections/01-overview.md'), invalidBuffer);

        await assert.rejects(
          async () => {
            await readBundle(join(tempDir, 'proposal.md'));
          },
          /TypeError|Error/
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('CLI commands', () => {
    it('should return help on --help with exit code 0', async () => {
      let output = '';
      const code = await runCli(['--help'], {
        stdout: { write: (s) => (output += s) },
        stderr: { write: () => {} }
      });
      assert.strictEqual(code, 0);
      assert.ok(output.includes('Usage:'));
    });

    it('should return exit code 2 on unknown command or missing required options', async () => {
      let errOutput = '';
      const code1 = await runCli(['invalid-command'], {
        stdout: { write: () => {} },
        stderr: { write: (s) => (errOutput += s) }
      });
      assert.strictEqual(code1, 2);

      const code2 = await runCli(['check'], {
        stdout: { write: () => {} },
        stderr: { write: (s) => (errOutput += s) }
      });
      assert.strictEqual(code2, 2);

      // Port validation: invalid port or trailing junk
      const code3 = await runCli(
        ['view', '--plan', resolve(FIXTURE_DIR, 'proposal.md'), '--port', '4317junk'],
        {
          stdout: { write: () => {} },
          stderr: { write: (s) => (errOutput += s) }
        }
      );
      assert.strictEqual(code3, 2);

      const code4 = await runCli(
        ['view', '--plan', resolve(FIXTURE_DIR, 'proposal.md'), '--port', '-5'],
        {
          stdout: { write: () => {} },
          stderr: { write: (s) => (errOutput += s) }
        }
      );
      assert.strictEqual(code4, 2);
    });

    it('should run check command successfully on valid fixture', async () => {
      let outText = '';
      const code = await runCli(
        ['check', '--plan', resolve(FIXTURE_DIR, 'proposal.md')],
        {
          stdout: { write: (s) => (outText += s) },
          stderr: { write: () => {} }
        }
      );
      assert.strictEqual(code, 0);
      assert.ok(outText.includes('Proposal is valid'));
    });

    it('should run check --json and emit structured JSON envelope', async () => {
      let jsonOut = '';
      const code = await runCli(
        ['check', '--plan', resolve(FIXTURE_DIR, 'proposal.md'), '--json'],
        {
          stdout: { write: (s) => (jsonOut += s) },
          stderr: { write: () => {} }
        }
      );
      assert.strictEqual(code, 0);
      const parsed = JSON.parse(jsonOut);
      assert.strictEqual(parsed.schemaVersion, 1);
      assert.strictEqual(parsed.valid, true);
      assert.ok(parsed.version);
    });

    it('should run compile command to file, refuse overwrite without force, and reject protected directories', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-compile-'));
      const outFile = join(tempDir, 'export.json');

      try {
        // Compile to file
        const code1 = await runCli([
          'compile',
          '--plan',
          resolve(FIXTURE_DIR, 'proposal.md'),
          '--out',
          outFile
        ]);
        assert.strictEqual(code1, 0);
        assert.ok(existsSync(outFile));

        // Overwrite without force fails
        let errOut = '';
        const code2 = await runCli(
          [
            'compile',
            '--plan',
            resolve(FIXTURE_DIR, 'proposal.md'),
            '--out',
            outFile
          ],
          {
            stdout: { write: () => {} },
            stderr: { write: (s) => (errOut += s) }
          }
        );
        assert.strictEqual(code2, 1);
        assert.ok(errOut.includes('--force'));

        // Overwrite with force succeeds
        const code3 = await runCli([
          'compile',
          '--plan',
          resolve(FIXTURE_DIR, 'proposal.md'),
          '--out',
          outFile,
          '--force'
        ]);
        assert.strictEqual(code3, 0);

        // Attempting export inside proposal source directory must fail
        const forbiddenTarget = resolve(FIXTURE_DIR, 'sections/export.json');
        let forbiddenErr = '';
        const code4 = await runCli(
          [
            'compile',
            '--plan',
            resolve(FIXTURE_DIR, 'proposal.md'),
            '--out',
            forbiddenTarget,
            '--force'
          ],
          {
            stdout: { write: () => {} },
            stderr: { write: (s) => (forbiddenErr += s) }
          }
        );
        assert.strictEqual(code4, 1);
        assert.ok(forbiddenErr.includes('protected directory'));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('http & server lifecycle', () => {
    it('should serve public shell and assets without token or proposal content', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        // GET /
        const resRoot = await fetch(viewer.origin);
        assert.strictEqual(resRoot.status, 200);
        const html = await resRoot.text();
        assert.ok(html.includes('<title>Proposal Viewer</title>'));
        assert.ok(!html.includes('Saved Search Alerts')); // No proposal content embedded in static shell
        assert.ok(resRoot.headers.get('content-security-policy'));

        // GET /assets/styles.css
        const resCss = await fetch(`${viewer.origin}/assets/styles.css`);
        assert.strictEqual(resCss.status, 200);
        assert.strictEqual(resCss.headers.get('content-type'), 'text/css; charset=utf-8');

        // GET /assets/app.js
        const resJs = await fetch(`${viewer.origin}/assets/app.js`);
        assert.strictEqual(resJs.status, 200);
        assert.strictEqual(resJs.headers.get('content-type'), 'application/javascript; charset=utf-8');
      } finally {
        await viewer.close();
      }
    });

    it('should serve /api routes without token and enforce security headers and Host authority', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        // Verify startViewer returns no token property
        // @ts-ignore
        assert.strictEqual(viewer.token, undefined);

        // Token-free request to /api/proposal -> 200
        const res = await fetch(`${viewer.origin}/api/proposal`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.valid, true);
        assert.strictEqual(data.metadata.id, 'saved-search-alerts');
        assert.strictEqual(data.tabs.length, 8);

        // Security headers enforcement on API route
        const cc = res.headers.get('cache-control');
        assert.ok(cc && cc.includes('no-store'), 'API responses must include Cache-Control: no-store');
        assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
        assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
        assert.ok(res.headers.get('content-security-policy'), 'CSP header must be present');

        // Rejection of foreign / mismatched Host headers -> 403
        const resBadHost = await rawRequest({
          hostname: '127.0.0.1',
          port: viewer.port,
          path: '/api/proposal',
          method: 'GET',
          headers: { Host: `localhost:${viewer.port}` }
        });
        assert.strictEqual(resBadHost.status, 403);

        const resEvilHost = await rawRequest({
          hostname: '127.0.0.1',
          port: viewer.port,
          path: '/api/proposal',
          method: 'GET',
          headers: { Host: 'evil-attacker.com' }
        });
        assert.strictEqual(resEvilHost.status, 403);

        const resWrongPort = await rawRequest({
          hostname: '127.0.0.1',
          port: viewer.port,
          path: '/api/proposal',
          method: 'GET',
          headers: { Host: `127.0.0.1:${viewer.port + 1}` }
        });
        assert.strictEqual(resWrongPort.status, 403);
      } finally {
        await viewer.close();
      }
    });

    it('should reject requests with forbidden Origin or cross-site fetch metadata', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        // Hostile origin -> 403
        const resHostileOrigin = await fetch(`${viewer.origin}/api/proposal`, {
          headers: {
            Origin: 'https://evil-website.com'
          }
        });
        assert.strictEqual(resHostileOrigin.status, 403);

        // Cross-site fetch metadata -> 403
        const resCrossSite = await fetch(`${viewer.origin}/api/proposal`, {
          headers: {
            'Sec-Fetch-Site': 'cross-site'
          }
        });
        assert.strictEqual(resCrossSite.status, 403);

        // Same-site fetch metadata -> 403
        const resSameSite = await fetch(`${viewer.origin}/api/proposal`, {
          headers: {
            'Sec-Fetch-Site': 'same-site'
          }
        });
        assert.strictEqual(resSameSite.status, 403);

        // Valid matching loopback origin -> 200
        const resValidOrigin = await fetch(`${viewer.origin}/api/proposal`, {
          headers: {
            Origin: `http://127.0.0.1:${viewer.port}`
          }
        });
        assert.strictEqual(resValidOrigin.status, 200);

        // Valid same-origin Sec-Fetch-Site -> 200
        const resSameOrigin = await fetch(`${viewer.origin}/api/proposal`, {
          headers: {
            'Sec-Fetch-Site': 'same-origin'
          }
        });
        assert.strictEqual(resSameOrigin.status, 200);
      } finally {
        await viewer.close();
      }
    });

    it('should serve tab blocks and return 409 for stale snapshot versions', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        // Valid tab request (token-free)
        const resTab = await fetch(`${viewer.origin}/api/tabs/architecture?version=${viewer.version}`);
        assert.strictEqual(resTab.status, 200);
        const tabData = await resTab.json();
        assert.strictEqual(tabData.tab.id, 'architecture');

        // Stale / unknown version request -> 409 Conflict
        const resStale = await fetch(`${viewer.origin}/api/tabs/architecture?version=stale-version-hash-999`);
        assert.strictEqual(resStale.status, 409);
      } finally {
        await viewer.close();
      }
    });

    it('should serve raw markdown source with exact bytes via /api/source', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        const resSource = await fetch(`${viewer.origin}/api/source/manifest?version=${viewer.version}`);
        assert.strictEqual(resSource.status, 200);
        const text = await resSource.text();
        assert.ok(text.includes('```proposal-meta'));
        assert.strictEqual(resSource.headers.get('content-type'), 'text/plain; charset=utf-8');
      } finally {
        await viewer.close();
      }
    });

    it('should support explicit refresh and coalesce simultaneous refresh requests', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        // Simultaneous refresh calls (token-free)
        const [res1, res2] = await Promise.all([
          fetch(`${viewer.origin}/api/proposal?refresh=1`),
          fetch(`${viewer.origin}/api/proposal?refresh=1`)
        ]);

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res2.status, 200);
        const data1 = await res1.json();
        const data2 = await res2.json();
        assert.strictEqual(data1.version, data2.version);
      } finally {
        await viewer.close();
      }
    });

    it('should reject non-GET methods with 405 Method Not Allowed', async () => {
      const viewer = await startViewer({
        planPath: resolve(FIXTURE_DIR, 'proposal.md'),
        port: 0
      });

      try {
        const resPost = await fetch(`${viewer.origin}/api/proposal`, {
          method: 'POST'
        });
        assert.strictEqual(resPost.status, 405);
        assert.strictEqual(resPost.headers.get('allow'), 'GET');
        assert.strictEqual(resPost.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(resPost.headers.get('content-security-policy'));
      } finally {
        await viewer.close();
      }
    });
  });

  describe('UI static safety & landmarks', () => {
    it('should verify viewer templates contain no unsafe DOM methods or storage calls', () => {
      const viewerDir = resolve(__dirname, '../feature-proposal/templates/viewer');
      const filesToCheck = ['app.js', 'render.js', 'diagrams.js'];

      const forbiddenPatterns = [
        /\.innerHTML/g,
        /\.outerHTML/g,
        /\.insertAdjacentHTML/g,
        /\beval\s*\(/g,
        /\bFunction\s*\(/g,
        /localStorage/g,
        /sessionStorage/g,
        /document\.cookie/g,
        /setInterval/g
      ];

      for (const f of filesToCheck) {
        const content = readFileSync(resolve(viewerDir, f), 'utf8');
        for (const pattern of forbiddenPatterns) {
          assert.equal(
            pattern.test(content),
            false,
            `Forbidden pattern ${pattern} found in ${f}`
          );
        }
      }
    });

    it('should verify index.html contains all 9 tab landmarks and no inline event handlers', () => {
      const indexPath = resolve(__dirname, '../feature-proposal/templates/viewer/index.html');
      const html = readFileSync(indexPath, 'utf8');

      // No inline event handlers (CSP requirement)
      assert.equal(/\s+on[a-z]+\s*=/i.test(html), false, 'Inline event handlers forbidden in index.html');

      // Check all 9 tab buttons exist
      const expectedTabs = [
        'tab-overview',
        'tab-requirements',
        'tab-options',
        'tab-architecture',
        'tab-data-api',
        'tab-performance',
        'tab-risks',
        'tab-delivery',
        'tab-source'
      ];

      for (const tabId of expectedTabs) {
        assert.ok(html.includes(`id="${tabId}"`), `Missing tab button ${tabId} in index.html`);
      }

      // Check landmarks
      assert.ok(html.includes('role="banner"'));
      assert.ok(html.includes('role="tablist"'));
      assert.ok(html.includes('role="main"'));
      assert.ok(html.includes('role="contentinfo"'));
    });
  });

  describe('Phase 1 P1 Regression Scaffolding & Isolations', () => {
    it('should start browser harness server on ephemeral port and serve viewer & harness assets', async () => {
      const harness = await startBrowserHarness({
        port: 0,
        planPath: resolve(FIXTURE_DIR, 'proposal.md')
      });

      try {
        // Harness page
        const resHarness = await fetch(`${harness.origin}/harness.html`);
        assert.strictEqual(resHarness.status, 200);
        const harnessHtml = await resHarness.text();
        assert.ok(harnessHtml.includes('Browser Regression Harness'));
        assert.ok(resHarness.headers.get('content-security-policy'));

        // Harness script
        const resHarnessJs = await fetch(`${harness.origin}/harness.js`);
        assert.strictEqual(resHarnessJs.status, 200);
        const harnessJsText = await resHarnessJs.text();
        assert.ok(harnessJsText.includes('REG-P6-01'), 'Harness must include REG-P6-01 code block check');
        assert.ok(harnessJsText.includes('REG-P6-02'), 'Harness must include REG-P6-02 heading/accordion check');
        assert.ok(harnessJsText.includes('REG-P6-03'), 'Harness must include REG-P6-03 diagram bounds check');
        assert.ok(harnessJsText.includes('REG-P6-04'), 'Harness must include REG-P6-04 contrast/responsive check');

        // Production viewer assets served by harness
        const resIndex = await fetch(`${harness.origin}/index.html`);
        assert.strictEqual(resIndex.status, 200);
        assert.ok((await resIndex.text()).includes('id="tab-overview"'));

        const resCss = await fetch(`${harness.origin}/styles.css`);
        assert.strictEqual(resCss.status, 200);

        const resApp = await fetch(`${harness.origin}/app.js`);
        assert.strictEqual(resApp.status, 200);
      } finally {
        await harness.close();
      }
    });

    it('should simulate controllable API delays and error states in harness', async () => {
      const harness = await startBrowserHarness({
        port: 0,
        planPath: resolve(FIXTURE_DIR, 'proposal.md')
      });

      try {
        // Controllable delay
        const t0 = Date.now();
        const resDelay = await fetch(`${harness.origin}/api/tabs/architecture?delay=60`);
        const duration = Date.now() - t0;
        assert.strictEqual(resDelay.status, 200);
        assert.ok(duration >= 50, `Expected delay >= 50ms, got ${duration}ms`);

        // Simulated invalid refresh with diagnostics
        const resInvalid = await fetch(`${harness.origin}/api/proposal?refresh=1&simulate=invalid`);
        assert.strictEqual(resInvalid.status, 200);
        const dataInvalid = await resInvalid.json();
        assert.strictEqual(dataInvalid.valid, false);
        assert.ok(Array.isArray(dataInvalid.diagnostics));
        assert.ok(dataInvalid.diagnostics.length > 0);
        assert.strictEqual(dataInvalid.diagnostics[0].code, 'INVALID_SYNTAX');

        // Test results reporting endpoint
        const postRes = await fetch(`${harness.origin}/api/test/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary: { total: 1, passed: 1, failed: 0 }, results: [] })
        });
        assert.strictEqual(postRes.status, 200);

        const getRes = await fetch(`${harness.origin}/api/test/results`);
        const resData = await getRes.json();
        assert.strictEqual(resData.summary.total, 1);
      } finally {
        await harness.close();
      }
    });

    it('should detect cross-tab heading internal anchors in fixture bundle', () => {
      const fixture = loadFixtureBundle();
      const compiled = compileBundle(fixture);
      assert.strictEqual(compiled.diagnostics.filter((d) => d.severity === 'error').length, 0);

      // Verify cross-tab internal link exists in overview section
      const overviewDoc = fixture.documents.find((d) => d.id === 'overview');
      assert.ok(overviewDoc);
      assert.ok(overviewDoc.source.includes('[Architecture Flow](#request-flow)'));

      // Verify target heading exists in architecture section
      const archDoc = fixture.documents.find((d) => d.id === 'architecture');
      assert.ok(archDoc);
      assert.ok(archDoc.source.includes('{#request-flow}'));
    });

    it('should support multi-document supplement bundles with cross-tab links', async () => {
      const supplementPlan = resolve(__dirname, 'fixtures/feature-proposal-supplement/proposal.md');
      const bundle = await readBundle(supplementPlan);
      assert.strictEqual(bundle.documents.length, 10); // manifest + 8 core + 1 supplement

      const compiled = compileBundle(bundle);
      assert.strictEqual(compiled.diagnostics.filter((d) => d.severity === 'error').length, 0);
      assert.ok(compiled.value);
      assert.strictEqual(compiled.value.documents.length, 10);

      // Verify architecture tab contains both primary and supplement documents
      const archTab = compiled.value.tabs.find((t) => t.id === 'architecture');
      assert.ok(archTab);
      assert.strictEqual(archTab.documents.length, 2);
      assert.ok(archTab.documents.some((d) => d.id === 'architecture'));
      assert.ok(archTab.documents.some((d) => d.id === 'architecture-storage'));
    });
  });

  describe('Phase 4 Robust reads, containment & refresh lifecycle', () => {
    it('should enforce separator-aware canonical path containment and avoid sibling-prefix bypasses', async () => {
      // Direct path containment tests
      assert.strictEqual(isPathContained('/app/proposals/alpha/section.md', '/app/proposals/alpha'), true);
      assert.strictEqual(isPathContained('/app/proposals/alpha', '/app/proposals/alpha'), true);
      assert.strictEqual(isPathContained('/app/proposals/alpha-sibling/section.md', '/app/proposals/alpha'), false);
      assert.strictEqual(isPathContained('/app/proposals', '/app/proposals/alpha'), false);

      // Forbidden path detection (.env*, .git, credentials, secrets, node_modules)
      assert.strictEqual(isForbiddenPath('.env'), true);
      assert.strictEqual(isForbiddenPath('.env.local'), true);
      assert.strictEqual(isForbiddenPath('.git/config'), true);
      assert.strictEqual(isForbiddenPath('node_modules/package'), true);
      assert.strictEqual(isForbiddenPath('credentials.json'), true);
      assert.strictEqual(isForbiddenPath('sections/secrets.md'), true);
      assert.strictEqual(isForbiddenPath('sections/01-overview.md'), false);

      // Testing writeExport against sibling directory vs protected directory
      const tempBase = mkdtempSync(join(tmpdir(), 'proposal-contain-'));
      try {
        const protectedDir = join(tempBase, 'target-dir');
        const siblingDir = join(tempBase, 'target-dir-sibling');
        const nestedDir = join(protectedDir, 'nested');
        mkdirSync(protectedDir, { recursive: true });
        mkdirSync(siblingDir, { recursive: true });
        mkdirSync(nestedDir, { recursive: true });

        // Writing to sibling directory must succeed (not blocked by startsWith)
        const siblingOut = join(siblingDir, 'export.json');
        await writeExport(siblingOut, JSON.stringify({ ok: true }), {
          forbiddenPaths: [protectedDir]
        });
        assert.ok(existsSync(siblingOut));

        // Writing inside protected directory must fail
        const protectedOut = join(protectedDir, 'export.json');
        await assert.rejects(
          async () => {
            await writeExport(protectedOut, JSON.stringify({ ok: true }), {
              forbiddenPaths: [protectedDir]
            });
          },
          /protected directory/
        );

        // Writing to protected files (.env, credentials) must fail
        const envOut = join(tempBase, '.env');
        await assert.rejects(
          async () => {
            await writeExport(envOut, JSON.stringify({ ok: true }));
          },
          /protected file/
        );
      } finally {
        rmSync(tempBase, { recursive: true, force: true });
      }
    });

    it('should reject symlinked manifest and symlinked section ancestry', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-sym-ancestor-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });

        // Symlinked manifest file rejection
        const realManifest = join(tempDir, 'proposal-real.md');
        const manifestLink = join(tempDir, 'proposal.md');
        renameSync(manifestLink, realManifest);
        symlinkSync(realManifest, manifestLink);

        await assert.rejects(
          async () => {
            await readBundle(manifestLink);
          },
          /Symlinks are forbidden/
        );

        // Restore manifest
        unlinkSync(manifestLink);
        renameSync(realManifest, manifestLink);

        // Symlinked sections directory (section ancestry) rejection
        const realSections = join(tempDir, 'sections-real');
        const sectionsDir = join(tempDir, 'sections');
        renameSync(sectionsDir, realSections);
        symlinkSync(realSections, sectionsDir);

        await assert.rejects(
          async () => {
            await readBundle(manifestLink);
          },
          /Symlinks are forbidden/
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should detect save-race and retry bounded read successfully', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-race-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        const overviewFile = join(tempDir, 'sections/01-overview.md');
        const originalContent = readFileSync(overviewFile, 'utf8');
        const modifiedContent = originalContent + '\n<!-- save race update -->\n';

        let raceFired = false;
        // Schedule modification on the event loop tick during readBundle execution
        setImmediate(() => {
          writeFileSync(overviewFile, modifiedContent, 'utf8');
          raceFired = true;
        });

        const bundle = await readBundle(join(tempDir, 'proposal.md'));
        assert.ok(raceFired, 'Race write should have executed');
        const overviewDoc = bundle.documents.find((d) => d.id === 'overview');
        assert.ok(overviewDoc);
        assert.ok(overviewDoc.source.includes('<!-- save race update -->'), 'Retried bundle must contain updated source');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle invalid->fix->valid refresh cycles preserving last-good snapshot with structured diagnostics', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-refresh-cycle-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        const manifestPath = join(tempDir, 'proposal.md');
        const overviewPath = join(tempDir, 'sections/01-overview.md');
        const originalOverview = readFileSync(overviewPath, 'utf8');

        const viewer = await startViewer({
          planPath: manifestPath,
          port: 0
        });

        try {
          const v1 = viewer.version;

          // 1. Break overview section syntax on disk (unclosed fence)
          writeFileSync(overviewPath, '```typescript\nconst broken = true;\n', 'utf8');

          const resBadSyntax = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          assert.strictEqual(resBadSyntax.status, 200, 'Invalid refresh must return 200 rather than crashing');
          const dataBadSyntax = await resBadSyntax.json();
          assert.strictEqual(dataBadSyntax.valid, false);
          assert.strictEqual(dataBadSyntax.version, v1, 'Must preserve last-good version');
          assert.strictEqual(dataBadSyntax.metadata.id, 'saved-search-alerts');
          assert.ok(Array.isArray(dataBadSyntax.diagnostics));
          assert.ok(dataBadSyntax.diagnostics.some((d) => d.code === 'UNCLOSED_FENCE'));

          // Verify last-good tab content remains accessible while disk is invalid
          const resTab = await fetch(`${viewer.origin}/api/tabs/architecture?version=${v1}`);
          assert.strictEqual(resTab.status, 200);

          // 2. Break via missing file on disk
          unlinkSync(overviewPath);

          const resMissing = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          assert.strictEqual(resMissing.status, 200);
          const dataMissing = await resMissing.json();
          assert.strictEqual(dataMissing.valid, false);
          assert.strictEqual(dataMissing.version, v1);
          assert.ok(dataMissing.diagnostics.some((d) => d.code === 'FILE_NOT_FOUND'));
          // Ensure no leaked absolute temp paths in diagnostic messages
          for (const d of dataMissing.diagnostics) {
            assert.strictEqual(d.message.includes(tempDir), false, 'Must not leak absolute system paths in diagnostics');
          }

          // 3. Fix overview section with valid content
          writeFileSync(overviewPath, originalOverview, 'utf8');

          const resFixed = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          assert.strictEqual(resFixed.status, 200);
          const dataFixed = await resFixed.json();
          assert.strictEqual(dataFixed.valid, true);
          assert.strictEqual(dataFixed.version, v1);
          assert.strictEqual(dataFixed.diagnostics.filter((d) => d.severity === 'error').length, 0);
        } finally {
          await viewer.close();
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should retain strictly current and previous snapshots (max 2) and return 409 for evicted versions', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-retention-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        const manifestPath = join(tempDir, 'proposal.md');
        const overviewPath = join(tempDir, 'sections/01-overview.md');
        const originalOverview = readFileSync(overviewPath, 'utf8');

        const viewer = await startViewer({
          planPath: manifestPath,
          port: 0
        });

        try {
          const v1 = viewer.version;

          // Verify v1 is accessible
          const resV1 = await fetch(`${viewer.origin}/api/tabs/overview?version=${v1}`);
          assert.strictEqual(resV1.status, 200);

          // Snapshot 2: Update overview
          writeFileSync(overviewPath, originalOverview + '\n## Revision 2\n', 'utf8');
          const resRef1 = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          const dataRef1 = await resRef1.json();
          const v2 = dataRef1.version;
          assert.notStrictEqual(v2, v1);

          // Verify both v2 (current) and v1 (previous) are accessible
          const resTabV2 = await fetch(`${viewer.origin}/api/tabs/overview?version=${v2}`);
          assert.strictEqual(resTabV2.status, 200);
          const resTabV1 = await fetch(`${viewer.origin}/api/tabs/overview?version=${v1}`);
          assert.strictEqual(resTabV1.status, 200);

          // Snapshot 3: Update overview again
          writeFileSync(overviewPath, originalOverview + '\n## Revision 3\n', 'utf8');
          const resRef2 = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          const dataRef2 = await resRef2.json();
          const v3 = dataRef2.version;
          assert.notStrictEqual(v3, v2);
          assert.notStrictEqual(v3, v1);

          // Verify v3 (current) and v2 (previous) are accessible
          const resTabV3 = await fetch(`${viewer.origin}/api/tabs/overview?version=${v3}`);
          assert.strictEqual(resTabV3.status, 200);
          const resTabV2After = await fetch(`${viewer.origin}/api/tabs/overview?version=${v2}`);
          assert.strictEqual(resTabV2After.status, 200);

          // Verify v1 has been evicted and returns 409 Conflict
          const resEvictedTab = await fetch(`${viewer.origin}/api/tabs/overview?version=${v1}`);
          assert.strictEqual(resEvictedTab.status, 409);
          const evictedData = await resEvictedTab.json();
          assert.strictEqual(evictedData.error.code, 'STALE_VERSION');

          const resEvictedSource = await fetch(`${viewer.origin}/api/source/manifest?version=${v1}`);
          assert.strictEqual(resEvictedSource.status, 409);
        } finally {
          await viewer.close();
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Phase 5 Navigation, asynchronous state and accessibility semantics', () => {
    it('should build navigation index correctly across core and supplement documents', async () => {
      // 1. Core fixture verification
      const coreBundle = await readBundle(resolve(FIXTURE_DIR, 'proposal.md'));
      const coreCompiled = compileBundle(coreBundle);
      assert.ok(coreCompiled.value);

      const coreNav = buildNavigationIndex(coreCompiled.value);
      assert.strictEqual(coreNav.documents['manifest'], 'source');
      assert.strictEqual(coreNav.documents['overview'], 'overview');
      assert.strictEqual(coreNav.documents['requirements'], 'requirements');
      assert.strictEqual(coreNav.documents['architecture'], 'architecture');
      assert.strictEqual(coreNav.documents['data-api'], 'data-api');
      assert.strictEqual(coreNav.documents['delivery'], 'delivery');

      assert.deepStrictEqual(coreNav.anchors['request-flow'], {
        tabId: 'architecture',
        documentId: 'architecture'
      });
      assert.deepStrictEqual(coreNav.anchors['architecture-components'], {
        tabId: 'architecture',
        documentId: 'architecture'
      });

      // 2. Supplement fixture verification
      const supplementDir = resolve(__dirname, 'fixtures/feature-proposal-supplement');
      const supplementBundle = await readBundle(resolve(supplementDir, 'proposal.md'));
      const supplementCompiled = compileBundle(supplementBundle);
      assert.ok(supplementCompiled.value);

      const supplementNav = buildNavigationIndex(supplementCompiled.value);
      assert.strictEqual(supplementNav.documents['manifest'], 'source');
      assert.strictEqual(supplementNav.documents['architecture-storage'], 'architecture');

      assert.deepStrictEqual(supplementNav.anchors['storage-spec'], {
        tabId: 'architecture',
        documentId: 'architecture-storage'
      });
      assert.deepStrictEqual(supplementNav.anchors['storage-technical'], {
        tabId: 'architecture',
        documentId: 'architecture-storage'
      });

      // 3. Graceful fallback on null / undefined input
      const emptyNav = buildNavigationIndex(null);
      assert.strictEqual(emptyNav.documents['manifest'], 'source');
      assert.deepStrictEqual(emptyNav.anchors, {});
    });

    it('should include navigation in /api/proposal responses for valid and preserved last-good states', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'proposal-nav-api-'));
      try {
        cpSync(FIXTURE_DIR, tempDir, { recursive: true });
        const manifestPath = join(tempDir, 'proposal.md');
        const overviewPath = join(tempDir, 'sections/01-overview.md');
        const originalOverview = readFileSync(overviewPath, 'utf8');

        const viewer = await startViewer({
          planPath: manifestPath,
          port: 0
        });

        try {
          // Valid initial response includes navigation
          const res = await fetch(`${viewer.origin}/api/proposal`);
          assert.strictEqual(res.status, 200);
          const data = await res.json();
          assert.strictEqual(data.valid, true);
          assert.ok(data.navigation, 'Response envelope must contain navigation index');
          assert.strictEqual(data.navigation.documents['manifest'], 'source');
          assert.deepStrictEqual(data.navigation.anchors['request-flow'], {
            tabId: 'architecture',
            documentId: 'architecture'
          });

          // Break syntax on disk and verify navigation is preserved in valid: false response
          writeFileSync(overviewPath, '```typescript\nconst broken = true;\n', 'utf8');

          const resBad = await fetch(`${viewer.origin}/api/proposal?refresh=1`);
          assert.strictEqual(resBad.status, 200);
          const dataBad = await resBad.json();
          assert.strictEqual(dataBad.valid, false);
          assert.ok(dataBad.navigation, 'Preserved last-good envelope must retain navigation index');
          assert.strictEqual(dataBad.navigation.documents['manifest'], 'source');
          assert.deepStrictEqual(dataBad.navigation.anchors['request-flow'], {
            tabId: 'architecture',
            documentId: 'architecture'
          });
        } finally {
          await viewer.close();
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should verify index.html accessibility: skip link, 9 real tabpanels, Source last, and status indicators', () => {
      const indexPath = resolve(__dirname, '../feature-proposal/templates/viewer/index.html');
      const html = readFileSync(indexPath, 'utf8');

      // 1. Skip-to-main content link
      assert.ok(
        html.includes('<a href="#main-content" class="skip-link">Skip to main content</a>'),
        'Must contain accessible skip-to-main link'
      );
      assert.ok(html.includes('<main id="main-content"'), 'Main landmark must have id="main-content"');

      // 2. All 9 tabs have matching real role="tabpanel" containers with aria-labelledby
      const expectedTabs = [
        'overview',
        'requirements',
        'options',
        'architecture',
        'data-api',
        'performance',
        'risks',
        'delivery',
        'source'
      ];

      for (const tabId of expectedTabs) {
        assert.ok(
          html.includes(`id="tab-${tabId}"`),
          `Tab button id="tab-${tabId}" must exist in index.html`
        );
        assert.ok(
          html.includes(`id="panel-${tabId}"`),
          `Tab panel id="panel-${tabId}" must exist in index.html`
        );
        assert.ok(
          html.includes(`aria-labelledby="tab-${tabId}"`),
          `Tab panel panel-${tabId} must have aria-labelledby="tab-${tabId}"`
        );
        assert.ok(
          html.includes(`aria-controls="panel-${tabId}"`),
          `Tab button tab-${tabId} must have aria-controls="panel-${tabId}"`
        );
      }

      // Check roving hidden attributes in initial index.html (overview active, others hidden)
      assert.ok(
        html.includes('id="panel-overview" class="panel-container" role="tabpanel" aria-labelledby="tab-overview">'),
        'Default panel-overview must not be hidden initially'
      );
      for (const tabId of expectedTabs.filter((t) => t !== 'overview')) {
        assert.ok(
          html.includes(`id="panel-${tabId}" class="panel-container" role="tabpanel" aria-labelledby="tab-${tabId}" hidden`),
          `Inactive panel-${tabId} must have hidden attribute initially`
        );
      }

      // 3. Source tab positioned last in visual and landmark order
      const tablistHtml = html.slice(html.indexOf('role="tablist"'), html.indexOf('</nav>'));
      const overviewIdx = tablistHtml.indexOf('id="tab-overview"');
      const sourceIdx = tablistHtml.indexOf('id="tab-source"');
      assert.ok(overviewIdx !== -1 && sourceIdx !== -1);
      assert.ok(overviewIdx < sourceIdx, 'tab-overview must precede tab-source in tablist');

      // Source tab button is last button in tablist
      const lastButtonIdx = tablistHtml.lastIndexOf('<button');
      assert.ok(tablistHtml.slice(lastButtonIdx).includes('id="tab-source"'), 'tab-source must be the last button in tablist');

      // Source panel is last panel in DOM
      const panelColumns = html.slice(html.indexOf('class="content-columns"'), html.indexOf('</main>'));
      const lastPanelIdx = panelColumns.lastIndexOf('<section');
      assert.ok(panelColumns.slice(lastPanelIdx).includes('id="panel-source"'), 'panel-source must be the last panel in DOM');

      // Source landmark is last target in landmarks registry
      const regStart = html.indexOf('class="landmarks-registry"');
      const regEnd = html.indexOf('<!-- Persistent Diagnostic Banner', regStart);
      const landmarksHtml = html.slice(regStart, regEnd);
      const lastLandmarkIdx = landmarksHtml.lastIndexOf('<div id=');
      assert.ok(landmarksHtml.slice(lastLandmarkIdx).includes('id="source"'), 'source must be the last landmark target');

      // 4. Status indicator / no misleading "Live Sync" or "LIVE SPEC"
      assert.strictEqual(html.includes('LIVE SPEC'), false, 'Must remove misleading "LIVE SPEC" text');
      assert.strictEqual(html.includes('Live Sync'), false, 'Must remove misleading "Live Sync" text');
      assert.ok(html.includes('Refresh from disk'), 'Must contain honest "Refresh from disk" indicator');
    });

    it('should verify app.js keyboard navigation, generation guards, error safety, and observer cleanup', () => {
      const appJsPath = resolve(__dirname, '../feature-proposal/templates/viewer/app.js');
      const appJs = readFileSync(appJsPath, 'utf8');

      // 1. Bounded fetchResource implementation
      assert.ok(appJs.includes('async function fetchResource(url, options = {})'), 'fetchResource helper must be defined');
      assert.ok(appJs.includes('timeoutMs = 6000'), 'fetchResource must support timeoutMs');
      assert.ok(appJs.includes("responseKind = 'json'"), 'fetchResource must support responseKind');
      assert.ok(appJs.includes('clearTimeout(timerId)'), 'fetchResource must clear timer in finally block');

      // 2. Independent generation counters and cancellation
      assert.ok(appJs.includes('let tabGeneration = 0;'), 'tabGeneration counter must be defined');
      assert.ok(appJs.includes('let activeTabAbortController = null;'), 'activeTabAbortController must be defined');
      assert.ok(appJs.includes('let sourceGeneration = 0;'), 'sourceGeneration counter must be defined');
      assert.ok(appJs.includes('let activeSourceAbortController = null;'), 'activeSourceAbortController must be defined');

      // Tab generation check
      assert.ok(appJs.includes('currentTabGen !== tabGeneration'), 'activateTab must check tabGeneration');
      // Source generation check
      assert.ok(appJs.includes('currentSourceGen !== sourceGeneration'), 'loadSourceDocument must check sourceGeneration');

      // 3. Error responses not cached as raw markdown source
      assert.ok(
        appJs.includes('sourceCache.set(cacheKey, sourceText)'),
        'Must cache successful source'
      );
      assert.ok(
        appJs.includes('// Never cache failed HTTP responses as raw source!'),
        'Must explicitly not cache failed source responses'
      );

      // 4. WAI-ARIA manual tabstrip keyboard navigation
      assert.ok(appJs.includes("e.key === 'ArrowRight'"), 'Must handle ArrowRight on tab buttons');
      assert.ok(appJs.includes("e.key === 'ArrowLeft'"), 'Must handle ArrowLeft on tab buttons');
      assert.ok(appJs.includes("e.key === 'Home'"), 'Must handle Home on tab buttons');
      assert.ok(appJs.includes("e.key === 'End'"), 'Must handle End on tab buttons');
      assert.ok(appJs.includes("e.key === 'Enter' || e.key === ' '"), 'Enter/Space must activate tab');
      assert.ok(appJs.includes('e.stopPropagation()'), 'Tab keyboard navigation must stop bubbling');

      // Conflicting global arrow keys removed
      const globalKeydownMatch = appJs.slice(appJs.indexOf('function handleGlobalKeydown'));
      const globalBody = globalKeydownMatch.slice(0, globalKeydownMatch.indexOf('function navigatePreviousTab'));
      assert.strictEqual(globalBody.includes('ArrowLeft'), false, 'handleGlobalKeydown must not intercept ArrowLeft');
      assert.strictEqual(globalBody.includes('ArrowRight'), false, 'handleGlobalKeydown must not intercept ArrowRight');

      // 5. outlineObserver declared as module variable and properly cleaned up
      assert.ok(
        /let\s+outlineObserver\s*=\s*null;/.test(appJs),
        'outlineObserver must be declared outside comments'
      );
      assert.ok(
        appJs.includes('outlineObserver.disconnect()'),
        'outlineObserver must be disconnected on tab transition and outline update'
      );

      // 6. Cross-tab deep linking
      assert.ok(
        appJs.includes('proposalNavigation?.anchors') && appJs.includes('proposalNavigation?.documents'),
        'navigateToAnchor must inspect navigation index'
      );
      assert.ok(
        appJs.includes("parent.tagName === 'DETAILS'") && appJs.includes('open = true'),
        'navigateToAnchor must expand ancestor <details>'
      );
      assert.ok(
        appJs.includes("targetEl.setAttribute('tabindex', '-1')"),
        'navigateToAnchor must set temporary tabindex="-1"'
      );
      assert.ok(
        appJs.includes('prefersReducedMotion'),
        'navigateToAnchor must respect prefers-reduced-motion'
      );
    });
  });

  describe('Phase 6 UI simplification, code rendering, diagrams & responsive styles', () => {
    it('should verify viewer templates eliminate fake terminal chrome and regex token highlighting', () => {
      const renderPath = resolve(__dirname, '../feature-proposal/templates/viewer/render.js');
      const stylesPath = resolve(__dirname, '../feature-proposal/templates/viewer/styles.css');
      const indexPath = resolve(__dirname, '../feature-proposal/templates/viewer/index.html');

      const renderJs = readFileSync(renderPath, 'utf8');
      const stylesCss = readFileSync(stylesPath, 'utf8');
      const indexHtml = readFileSync(indexPath, 'utf8');

      // 1. No macOS window traffic light dots or simulated terminal chrome
      const forbiddenTerminalPatterns = [
        'terminal-dots',
        'terminal-dot-close',
        'terminal-dot-minimize',
        'terminal-dot-expand',
        'terminal-window-dots',
        'code-terminal-block',
        'terminal-meta-group'
      ];
      for (const pat of forbiddenTerminalPatterns) {
        assert.strictEqual(renderJs.includes(pat), false, `render.js must not contain fake terminal pattern: ${pat}`);
        assert.strictEqual(stylesCss.includes(pat), false, `styles.css must not contain fake terminal pattern: ${pat}`);
        assert.strictEqual(indexHtml.includes(pat), false, `index.html must not contain fake terminal pattern: ${pat}`);
      }

      // 2. No heavy regex-based syntax highlighter token machinery
      const forbiddenHighlighterPatterns = [
        'SQL_KEYWORDS',
        'SQL_TYPES',
        'JS_KEYWORDS',
        'JS_TYPES',
        'BASH_COMMANDS',
        'tokenizeLine',
        '.token-keyword',
        '.token-string',
        '.tok-kw',
        '.tok-type',
        '.tok-str',
        'pulse-live'
      ];
      for (const pat of forbiddenHighlighterPatterns) {
        assert.strictEqual(renderJs.includes(pat), false, `render.js must not contain highlighter pattern: ${pat}`);
        assert.strictEqual(stylesCss.includes(pat), false, `styles.css must not contain highlighter pattern: ${pat}`);
      }

      // 3. Clean pre.code-block > code.language-{lang} structure
      assert.ok(renderJs.includes("pre.className = 'code-block'"), 'Must build pre.code-block');
      assert.ok(renderJs.includes('codeEl.className = `language-${normLang}`'), 'Must build code.language-{lang}');
      assert.ok(renderJs.includes('codeEl.textContent = codeText'), 'Must set exact textContent');

      // 4. Subtle language badge and non-blocking copy button
      assert.ok(renderJs.includes('code-lang-badge'), 'Must include code-lang-badge');
      assert.ok(renderJs.includes('btn-code-copy'), 'Must include btn-code-copy');
      assert.ok(renderJs.includes('copyCodeBlock'), 'Must include copyCodeBlock handler');

      // 5. No line-number DOM nodes per token
      assert.strictEqual(renderJs.includes('code-line-number'), false, 'render.js must not contain code-line-number');
      assert.strictEqual(renderJs.includes('code-line'), false, 'render.js must not contain code-line per token');
    });

    it('should verify semantic heading structure, document-aware accordion grouping, and visible alert placement', () => {
      const renderPath = resolve(__dirname, '../feature-proposal/templates/viewer/render.js');
      const renderJs = readFileSync(renderPath, 'utf8');

      // 1. Duplicate emoji/icon inference eliminated
      assert.strictEqual(renderJs.includes('getHeadingIcon'), false, 'render.js must not use getHeadingIcon');

      // 2. Semantic headings H1-H4
      assert.ok(renderJs.includes("h1.className = 'page-title'"), 'Must create semantic H1 page title');
      assert.ok(renderJs.includes("h2.className = 'section-title'"), 'Must create semantic H2 section title');
      assert.ok(renderJs.includes("h.className = 'subheading'"), 'Must create semantic H3 subheading');

      // 3. Document-aware accordion nesting: H4 stays nested in active H3 technical details
      assert.ok(
        renderJs.includes("block.level === 3 && /(Technical details|Tests)/i.test(block.text)"),
        'Must detect Technical details/Tests H3'
      );
      assert.ok(
        renderJs.includes("activeDetails.open = false"),
        'Technical details accordion must be closed by default (open = false)'
      );
      assert.ok(
        renderJs.includes("block.type === 'heading' && block.level >= 4 && activeDetails"),
        'Must nest H4 subheadings inside active technical details accordion'
      );
      assert.ok(
        renderJs.includes("(contentDiv || activeDetails).appendChild(h)"),
        'Must append H4 into accordion content without resetting activeDetails'
      );

      // 4. Critical operational warnings placed outside collapsible accordions
      assert.ok(
        renderJs.includes("if (isWarning && activeDetails)"),
        'Must check if warning is inside active accordion'
      );
      assert.ok(
        renderJs.includes("ensureCard().appendChild(bq)"),
        'Warnings inside accordion must be appended to card outside collapsible details'
      );
    });

    it('should verify diagram SVG bounds, icon catalog preservation, and accessible alternatives', () => {
      const diagramsPath = resolve(__dirname, '../feature-proposal/templates/viewer/diagrams.js');
      const stylesPath = resolve(__dirname, '../feature-proposal/templates/viewer/styles.css');

      const diagramsJs = readFileSync(diagramsPath, 'utf8');
      const stylesCss = readFileSync(stylesPath, 'utf8');

      // 1. All 20 canonical SYSTEM_ICONS retained with functional draw()
      assert.strictEqual(Object.keys(SYSTEM_ICONS).length, 20);
      const canonicalIcons = [
        'database', 'redis', 'cdn', 'browser', 'app-server', 'server',
        'load-balancer', 'api-gateway', 'queue', 'external', 'storage',
        'auth', 'worker', 'search', 'metrics', 'notification', 'container',
        'state', 'user', 'network'
      ];
      for (const iconKey of canonicalIcons) {
        assert.ok(SYSTEM_ICONS[iconKey], `SYSTEM_ICONS must contain ${iconKey}`);
        assert.strictEqual(typeof SYSTEM_ICONS[iconKey].draw, 'function');
        const shapes = SYSTEM_ICONS[iconKey].draw('#2563EB');
        assert.ok(Array.isArray(shapes) && shapes.length > 0, `Icon ${iconKey} draw must return shapes`);
      }

      // 2. ICON_ALIASES preserved
      assert.ok(Object.keys(ICON_ALIASES).length >= 70, 'ICON_ALIASES must preserve all canonical alias mappings');
      assert.strictEqual(resolveSystemIcon({ icon: 'cloudflare' }), 'cdn');
      assert.strictEqual(resolveSystemIcon({ icon: 'postgres' }), 'database');
      assert.strictEqual(resolveSystemIcon({ icon: 'sqs' }), 'queue');

      // 3. Bounded viewBox containers without layout blowout
      assert.ok(diagramsJs.includes('viewBox: `0 0 ${width} ${height}`'), 'Must set bounded viewBox on SVG');
      assert.ok(diagramsJs.includes("svg.style.maxWidth = `${width}px`"), 'Must set maxWidth on SVG element');
      assert.ok(diagramsJs.includes("viewport.className = 'diagram-viewport'"), 'Must wrap in diagram-viewport');
      assert.ok(stylesCss.includes('.diagram-viewport {'), 'styles.css must style .diagram-viewport');
      assert.ok(stylesCss.includes('overflow-x: auto;'), 'diagram-viewport must isolate horizontal scroll');

      // 4. Accessible alternative views (semantic data-table)
      assert.ok(diagramsJs.includes('renderGraphTextAlt'), 'Must provide graph text alternative');
      assert.ok(diagramsJs.includes('renderSequenceTextAlt'), 'Must provide sequence text alternative');
      assert.ok(diagramsJs.includes("details.className = 'accordion diagram-table-alt'"), 'Must wrap text alt in details.accordion');
      assert.ok(diagramsJs.includes("table.className = 'data-table'"), 'Must render accessible data-table');

      // 5. Prefers-reduced-motion
      assert.ok(stylesCss.includes('@media (prefers-reduced-motion: reduce)'), 'styles.css must include prefers-reduced-motion');
      assert.ok(stylesCss.includes('transition: none !important;'), 'Must disable transitions under reduced motion');
    });

    it('should verify viewer asset bundle byte budgets and absence of forbidden patterns', () => {
      const assetDir = resolve(__dirname, '../feature-proposal/templates/viewer');
      const files = ['app.js', 'diagrams.js', 'index.html', 'render.js', 'styles.css'];

      let totalBytes = 0;
      const fileSizes = {};

      for (const f of files) {
        const filePath = resolve(assetDir, f);
        assert.ok(existsSync(filePath), `Viewer asset missing: ${f}`);
        const content = readFileSync(filePath, 'utf8');
        const size = Buffer.byteLength(content, 'utf8');
        totalBytes += size;
        fileSizes[f] = size;

        // Security / Safety: Zero unsafe DOM execution methods
        assert.strictEqual(content.includes('innerHTML'), false, `${f} must not contain innerHTML`);
        assert.strictEqual(content.includes('outerHTML'), false, `${f} must not contain outerHTML`);
        assert.strictEqual(content.includes('document.write'), false, `${f} must not contain document.write`);
        assert.strictEqual(/eval\s*\(/.test(content), false, `${f} must not contain eval()`);
        assert.strictEqual(/new\s+Function\s*\(/.test(content), false, `${f} must not contain new Function()`);
      }

      // Acceptance Target: <= 102,400 bytes aggregate raw source assets
      assert.ok(
        totalBytes <= 102400,
        `Aggregate viewer assets (${totalBytes} bytes) must satisfy <= 102,400 byte budget. Breakdown: ${JSON.stringify(fileSizes)}`
      );

      // WCAG 2.2 AA Contrast & Responsive isolation in styles.css
      const stylesContent = readFileSync(resolve(assetDir, 'styles.css'), 'utf8');
      assert.ok(stylesContent.includes('--text-main: #24222B'), 'Light theme main text must satisfy WCAG AA contrast');
      assert.ok(stylesContent.includes('--border-color: #958D9E'), 'Light theme borders must satisfy WCAG AA contrast');
      assert.ok(stylesContent.includes('--text-main: #EEE8F2'), 'Dark theme main text must satisfy WCAG AA contrast');
      assert.ok(stylesContent.includes('--border-color: #73697D'), 'Dark theme borders must satisfy WCAG AA contrast');
      assert.ok(stylesContent.includes('overflow-x: hidden;'), 'Page root must isolate horizontal overflow');
    });
  });

  describe('Phase 7 Prompt evaluation, workload scenarios & browser load/stability validation', () => {
    it('should validate Scenario A (Small Local UI): DB, cache, blob, and replication marked N/A with triggers', () => {
      const skillPath = resolve(__dirname, '../feature-proposal/SKILL.md');
      const planningPath = resolve(__dirname, '../feature-proposal/references/planning.md');
      const dataApiPath = resolve(__dirname, '../feature-proposal/templates/sections/05-data-api.md');
      const perfPath = resolve(__dirname, '../feature-proposal/templates/sections/06-performance.md');

      const skillContent = readFileSync(skillPath, 'utf8');
      const planningContent = readFileSync(planningPath, 'utf8');
      const dataApiContent = readFileSync(dataApiPath, 'utf8');
      const perfContent = readFileSync(perfPath, 'utf8');

      // 1. SKILL.md requires justified N/A with reason and trigger
      assert.ok(
        skillContent.includes('Non-applicable dimensions (e.g. no DB for local UI) require reason and trigger'),
        'SKILL.md must mandate N/A reason and trigger for local UI'
      );

      // 2. Planning reference enforces explicit N/A justification rule and examples
      assert.ok(
        planningContent.includes('Database: N/A — System runs entirely as a client-side static tool with no server or persistent data store'),
        'Planning reference must provide concrete client-side local UI N/A example'
      );
      assert.ok(
        planningContent.includes('Applicability trigger: If multi-user synchronization or server persistence is introduced'),
        'Planning reference must provide concrete applicability trigger for local UI'
      );
      assert.ok(
        planningContent.includes('Never leave a dimension blank'),
        'Planning reference must forbid blank dimensions'
      );

      // 3. Templates include justified N/A slots for blob, distributed tx, and DB
      assert.ok(
        dataApiContent.includes('If the feature requires no server database, mark as N/A with justification'),
        'Data API template must state how to handle local tools without database'
      );
      assert.ok(
        dataApiContent.includes('Distributed transactions*: N/A'),
        'Data API template must provide N/A slot for distributed transactions'
      );
      assert.ok(
        dataApiContent.includes('External blob store*: N/A'),
        'Data API template must provide N/A slot for external blob store'
      );
      assert.ok(
        perfContent.includes('Blob / File Storage | [N] | [N] | [N] | KiB | `N/A`'),
        'Performance template must include N/A example with KiB unit'
      );
    });

    it('should validate Scenario B (Production CRUD Feature): schema, query plan, connection occupancy, pagination, and no microservice splits', () => {
      const planningPath = resolve(__dirname, '../feature-proposal/references/planning.md');
      const dataApiPath = resolve(__dirname, '../feature-proposal/templates/sections/05-data-api.md');
      const perfPath = resolve(__dirname, '../feature-proposal/templates/sections/06-performance.md');
      const fixtureDataPath = resolve(__dirname, 'fixtures/feature-proposal/sections/05-data-api.md');

      const planningContent = readFileSync(planningPath, 'utf8');
      const dataApiContent = readFileSync(dataApiPath, 'utf8');
      const perfContent = readFileSync(perfPath, 'utf8');
      const fixtureDataContent = readFileSync(fixtureDataPath, 'utf8');

      // 1. Stack-specific schema with primary key, tenant_id, and covering index
      assert.ok(dataApiContent.includes('CREATE TABLE IF NOT EXISTS feature_records'), 'Must include DDL table template');
      assert.ok(dataApiContent.includes('id VARCHAR(64) PRIMARY KEY'), 'Must define primary key');
      assert.ok(dataApiContent.includes('tenant_id VARCHAR(64) NOT NULL'), 'Must include tenant isolation column');
      assert.ok(dataApiContent.includes('CREATE INDEX IF NOT EXISTS idx_feature_records_tenant_created'), 'Must include index definition');

      // 2. Query plan and scan efficiency contracts
      assert.ok(dataApiContent.includes('1 single indexed query per request'), 'Must require single indexed query');
      assert.ok(dataApiContent.includes('1 row scanned per 1 row returned'), 'Must specify scan efficiency');
      assert.ok(dataApiContent.includes('Row-level write lock held only during the brief atomic commit (<=5 ms)'), 'Must specify transaction lock bounds');

      // 3. Operational simplicity over microservice splitting
      assert.ok(
        planningContent.includes('Favor single-process and native database capabilities over distributed microservices'),
        'Must prioritize operational simplicity over generic microservice splits'
      );

      // 4. Connection pool occupancy and concurrency formulas
      assert.ok(
        perfContent.includes('DB Connection Occupancy | [N] | [N] | [N] | connections | `estimate` | Mean DB hold time × query rate'),
        'Performance template must specify connection occupancy derivation'
      );
      assert.ok(
        perfContent.includes("Little's Law"),
        'Performance template must reference Little\'s Law for in-flight requests'
      );

      // 5. Fixture validation for CRUD feature
      assert.ok(fixtureDataContent.includes('CREATE TABLE IF NOT EXISTS saved_searches'), 'Fixture has stack-specific CRUD schema');
      assert.ok(fixtureDataContent.includes('idx_saved_searches_eval'), 'Fixture has targeted index');
    });

    it('should validate Scenario C (Blob-Heavy Million-Account Scenario): mathematical derivations, byte units, object storage & compression limits', () => {
      const planningPath = resolve(__dirname, '../feature-proposal/references/planning.md');
      const perfSpecPath = resolve(__dirname, '../docs/proposals/2026-10-02-feature-proposal-quality-and-localhost/sections/06-performance.md');

      const planningContent = readFileSync(planningPath, 'utf8');
      const perfSpecContent = readFileSync(perfSpecPath, 'utf8');

      // 1. Sizing derivations
      // 1,000,000 registered users, 20% DAU = 200,000 DAU
      // 10 reads + 1 write = 11 ops/day -> 2,200,000 ops / 28,800 active seconds = 76.388... QPS
      const registeredUsers = 1_000_000;
      const dau = registeredUsers * 0.20;
      assert.strictEqual(dau, 200_000);
      const totalOpsPerDay = dau * (10 + 1);
      assert.strictEqual(totalOpsPerDay, 2_200_000);
      const activeWindowSeconds = 8 * 3600;
      assert.strictEqual(activeWindowSeconds, 28_800);
      const avgQps = totalOpsPerDay / activeWindowSeconds;
      assert.ok(avgQps >= 76.3 && avgQps <= 76.5, `Average QPS ${avgQps} must be ~76.4`);

      // Peak QPS with 10x burst factor
      const peakQps = avgQps * 10;
      assert.ok(peakQps >= 763.8 && peakQps <= 764.0, `Peak QPS ${peakQps} must be ~763.9`);

      // App CPU cores needed at 2ms/op and 60% target utilization
      const cores = (peakQps * 2) / (1000 * 0.60);
      assert.ok(cores >= 2.54 && cores <= 2.56, `App CPU cores ${cores} must be ~2.55`);

      // DB occupied connections at 1 query/op and 8ms mean connection-held time
      const connOccupancy = peakQps * 1 * 0.008;
      assert.ok(connOccupancy >= 6.10 && connOccupancy <= 6.12, `Connection occupancy ${connOccupancy} must be ~6.11`);

      // In-flight requests (Little's Law) at mean 80ms duration
      const inFlight = peakQps * 0.080;
      assert.ok(inFlight >= 61.10 && inFlight <= 61.12, `In-flight requests ${inFlight} must be ~61.11`);

      // Verify that planning.md documents these formulas and constraints
      assert.ok(planningContent.includes('200,000 DAU × 11 ops/day ÷ 28,800 active seconds/day ≈ 76.4 QPS'));
      assert.ok(planningContent.includes('Cores} \\approx \\frac{\\text{QPS} \\times \\text{CPU ms / op}}{1,000 \\times \\text{Target Utilization}}'));
      assert.ok(planningContent.includes('Occupied Connections} \\approx \\text{DB Ops / sec} \\times \\text{Mean Connection-Held Time (seconds)}'));
      assert.ok(planningContent.includes("Little's Law"));

      // 2. Exact byte unit standards: 1 KB = 1,000 B, 1 KiB = 1,024 B, 1 MB = 1,000,000 B, 1 MiB = 1,048,576 B
      assert.ok(planningContent.includes('1 KB = 1,000 bytes'), 'Must define decimal KB = 1,000 B');
      assert.ok(planningContent.includes('1 KiB = 1,024 bytes'), 'Must define binary KiB = 1,024 B');
      assert.ok(planningContent.includes('1 MB = 1,000,000 bytes'), 'Must define decimal MB = 1,000,000 B');
      assert.ok(planningContent.includes('1 MiB = 1,048,576 bytes'), 'Must define binary MiB = 1,048,576 B');

      // 3. Object storage vs DB blob trade-offs
      assert.ok(
        planningContent.includes('Blob Storage Selection'),
        'Must include explicit blob storage selection evaluation'
      );
      assert.ok(
        planningContent.includes('Evaluate: (a) Database byte columns vs. (b) Dedicated object store with metadata rows vs. (c) Local filesystem storage'),
        'Must compare DB bytes vs object store vs local files'
      );

      // 4. HTTP compression vs ZIP limits
      assert.ok(
        planningContent.includes('HTTP gzip/Brotli is dynamic wire compression; ZIP is a filesystem archive container'),
        'Must distinguish HTTP dynamic compression from archive ZIP containers'
      );
      assert.ok(
        planningContent.includes('Never recommend ZIP for tiny API responses'),
        'Must forbid recommending ZIP for tiny API payloads'
      );
      assert.ok(
        planningContent.includes('byte bounds, entry count/depth limits, traversal protection, and streaming memory bounds'),
        'Must document archive decompression abuse defenses'
      );
    });

    it('should validate Scenario D (Unknown / Blocking Input): <=3 blocking questions, labeled assumptions & intake discipline', () => {
      const skillPath = resolve(__dirname, '../feature-proposal/SKILL.md');
      const planningPath = resolve(__dirname, '../feature-proposal/references/planning.md');

      const skillContent = readFileSync(skillPath, 'utf8');
      const planningContent = readFileSync(planningPath, 'utf8');

      // 1. <=3 decision-changing questions
      assert.ok(skillContent.includes('Ask <=3 blocking questions'), 'SKILL.md must enforce <=3 blocking questions');
      assert.ok(
        planningContent.includes('ask up to 3 targeted questions covering'),
        'Planning reference must cap intake clarification questions at 3'
      );

      // 2. Labeled assumptions (ASM-01, ASM-02)
      assert.ok(skillContent.includes('label assumptions (`ASM-01`) and proceed'), 'SKILL.md must mandate labeled assumptions');
      assert.ok(
        planningContent.includes('Explicit assumptions labeled with IDs (`ASM-01`, `ASM-02`)'),
        'Planning reference must specify assumption labeling convention'
      );

      // 3. Acknowledged unknown status with owner & measurement plan
      assert.ok(
        planningContent.includes('`unknown`: Acknowledged unknown; must include assigned owner and measurement plan'),
        'Must define unknown status with owner and measurement plan'
      );
    });

    it('should enforce the quantitative rubric and verify zero unsupported guarantees', () => {
      const templatesDir = resolve(__dirname, '../feature-proposal/templates/sections');
      const sectionFiles = [
        '01-overview.md',
        '02-requirements.md',
        '03-options.md',
        '04-architecture.md',
        '05-data-api.md',
        '06-performance.md',
        '07-risks.md',
        '08-delivery.md'
      ];

      // 1. Evidence status domain strictly defined
      const planningContent = readFileSync(resolve(__dirname, '../feature-proposal/references/planning.md'), 'utf8');
      const allowedStatuses = ['observed', 'target', 'estimate', 'assumption', 'unknown', 'N/A'];
      for (const st of allowedStatuses) {
        assert.ok(planningContent.includes(`\`${st}\``), `Status domain must include ${st}`);
      }

      // 2. Zero unsupported guarantees in all templates
      const forbiddenClaims = [
        'infinitely scalable',
        'infinite scalability',
        'zero downtime',
        'zero-downtime',
        'millions-ready',
        '100% bug-free',
        'completely secure',
        'unbreakable'
      ];

      for (const sf of sectionFiles) {
        const content = readFileSync(resolve(templatesDir, sf), 'utf8');
        for (const claim of forbiddenClaims) {
          assert.strictEqual(
            content.toLowerCase().includes(claim.toLowerCase()),
            false,
            `Template ${sf} must not contain unsupported guarantee: "${claim}"`
          );
        }
      }

      // 3. Performance template requires explicit units and status columns
      const perfTemplate = readFileSync(resolve(templatesDir, '06-performance.md'), 'utf8');
      assert.ok(perfTemplate.includes('🏷️ Unit'), 'Performance table must include Unit column');
      assert.ok(perfTemplate.includes('📊 Status'), 'Performance table must include Status column');
      assert.ok(perfTemplate.includes('🔬 Evidence / Derivation'), 'Performance table must include Evidence column');
    });

    it('should verify browser performance and stability benchmark definitions in harness and test reporting', async () => {
      const harnessPath = resolve(__dirname, 'browser/feature-proposal/harness.js');
      const harnessJs = readFileSync(harnessPath, 'utf8');

      // 1. All 15 check IDs defined (10 regression + 5 benchmarks)
      const expectedIds = [
        'REG-P1-01', 'REG-P1-02', 'REG-P1-03', 'REG-P1-04', 'REG-P1-05', 'REG-P1-06',
        'REG-P6-01', 'REG-P6-02', 'REG-P6-03', 'REG-P6-04',
        'BENCH-BM-01', 'BENCH-BM-02', 'BENCH-BM-03', 'BENCH-BM-04', 'BENCH-BM-05'
      ];
      for (const id of expectedIds) {
        assert.ok(harnessJs.includes(id), `harness.js must define check ID ${id}`);
      }

      // 2. Benchmark acceptance targets codified in harness.js
      assert.ok(harnessJs.includes('p95 < 500'), 'Must enforce First Usable View <500ms p95 target');
      assert.ok(harnessJs.includes('p95 < 100'), 'Must enforce Small Tab Switch <100ms p95 target');
      assert.ok(harnessJs.includes('nearDuration < 1000'), 'Must enforce Near-Limit Document <1000ms target');
      assert.ok(harnessJs.includes('delta < 150'), 'Must enforce 100-cycle DOM stability plateau target');
      assert.ok(harnessJs.includes('idleFetchCount === 0'), 'Must enforce zero idle network requests target');

      // 3. Start harness server and test reporting of benchmark payload
      const harness = await startBrowserHarness({
        port: 0,
        planPath: resolve(FIXTURE_DIR, 'proposal.md')
      });

      try {
        const mockBenchmarkPayload = {
          hardware: {
            platform: 'darwin',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            hardwareConcurrency: 10,
            deviceMemory: 24
          },
          firstUsableView: { iterations: 30, p50: 18.2, p95: 35.4, max: 48.1, mean: 22.0, target: '<500ms', pass: true },
          tabTransitions: { iterations: 30, p50: 1.8, p95: 4.2, p99: 6.1, max: 7.0, mean: 2.1, target: '<100ms p95', pass: true },
          nearLimitDocument: { renderTimeMs: 12.5, longTasksCount: 0, target: '<1000ms', pass: true },
          stabilityPlateau: { cycles: 100, samples: [{ cycle: 20, elements: 110 }, { cycle: 100, elements: 112 }], target: 'zero unbounded growth', pass: true },
          idleState: { idleFetchCount: 0, activeIntervals: 0, target: 'zero recurring JS timers or network requests', pass: true }
        };

        const postRes = await fetch(`${harness.origin}/api/test/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: { total: 15, reproduced: 0, resolved: 15, errors: 0 },
            results: [{ id: 'BENCH-BM-01', status: 'RESOLVED', observed: 'p95=35.4ms' }],
            benchmarks: mockBenchmarkPayload
          })
        });
        assert.strictEqual(postRes.status, 200);

        const getRes = await fetch(`${harness.origin}/api/test/results`);
        assert.strictEqual(getRes.status, 200);
        const data = await getRes.json();
        assert.strictEqual(data.summary.total, 15);
        assert.strictEqual(data.summary.resolved, 15);
        assert.ok(data.benchmarks);
        assert.strictEqual(data.benchmarks.firstUsableView.pass, true);
        assert.strictEqual(data.benchmarks.tabTransitions.pass, true);
        assert.strictEqual(data.benchmarks.nearLimitDocument.pass, true);
        assert.strictEqual(data.benchmarks.stabilityPlateau.pass, true);
        assert.strictEqual(data.benchmarks.idleState.pass, true);
      } finally {
        await harness.close();
      }
    });
  });
});



