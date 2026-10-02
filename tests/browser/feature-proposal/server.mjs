// @ts-check
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBundle } from '../../../feature-proposal/scripts/files.mjs';
import { compileBundle, buildNavigationIndex } from '../../../feature-proposal/scripts/format.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');
const VIEWER_DIR = resolve(REPO_ROOT, 'feature-proposal/templates/viewer');
const DEFAULT_FIXTURE = resolve(REPO_ROOT, 'tests/fixtures/feature-proposal/proposal.md');

/**
 * @typedef {Object} HarnessOptions
 * @property {number} [port=4319]
 * @property {string} [planPath]
 */

/**
 * Creates and starts the browser regression harness HTTP server.
 * @param {HarnessOptions} [options={}]
 * @returns {Promise<{ server: import('node:http').Server, origin: string, port: number, close: () => Promise<void> }>}
 */
export async function startBrowserHarness(options = {}) {
  const planPath = options.planPath || DEFAULT_FIXTURE;
  const targetPort = options.port !== undefined ? options.port : 4319;

  // Load and compile initial fixture bundle
  const bundle = await readBundle(planPath);
  const compileRes = compileBundle(bundle);
  if (!compileRes.value) {
    throw new Error(`Failed to compile test fixture: ${JSON.stringify(compileRes.diagnostics)}`);
  }

  const initialCompiled = compileRes.value;
  let currentCompiled = initialCompiled;
  /** @type {any} */
  let latestTestResults = null;

  // Cache viewer assets
  const assets = new Map([
    ['/index.html', { content: readFileSync(join(VIEWER_DIR, 'index.html')), type: 'text/html; charset=utf-8' }],
    ['/styles.css', { content: readFileSync(join(VIEWER_DIR, 'styles.css')), type: 'text/css; charset=utf-8' }],
    ['/app.js', { content: readFileSync(join(VIEWER_DIR, 'app.js')), type: 'application/javascript; charset=utf-8' }],
    ['/render.js', { content: readFileSync(join(VIEWER_DIR, 'render.js')), type: 'application/javascript; charset=utf-8' }],
    ['/diagrams.js', { content: readFileSync(join(VIEWER_DIR, 'diagrams.js')), type: 'application/javascript; charset=utf-8' }]
  ]);

  // Harness assets
  const harnessHtmlPath = join(__dirname, 'harness.html');
  const harnessJsPath = join(__dirname, 'harness.js');

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
      const pathname = parsedUrl.pathname;
      const searchParams = parsedUrl.searchParams;

      // Common security headers
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none';"
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');

      // Root redirect / harness
      if (pathname === '/' || pathname === '/harness.html') {
        const content = readFileSync(harnessHtmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.writeHead(200);
        res.end(content);
        return;
      }

      if (pathname === '/harness.js') {
        const content = readFileSync(harnessJsPath, 'utf8');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.writeHead(200);
        res.end(content);
        return;
      }

      // Viewer assets
      if (assets.has(pathname)) {
        const asset = assets.get(pathname);
        res.setHeader('Content-Type', asset.type);
        res.writeHead(200);
        res.end(asset.content);
        return;
      }

      // API: POST test results from browser runner
      if (pathname === '/api/test/results' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            latestTestResults = JSON.parse(body);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        return;
      }

      // API: GET test results
      if (pathname === '/api/test/results' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(JSON.stringify(latestTestResults || { status: 'waiting' }));
        return;
      }

      // Artificial delay helper
      const delayMs = parseInt(searchParams.get('delay') || '0', 10);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // API: /api/proposal
      if (pathname === '/api/proposal') {
        const isRefresh = searchParams.get('refresh') === '1';
        const simulate = searchParams.get('simulate');

        if (isRefresh && simulate === 'invalid') {
          // Simulate invalid refresh diagnostics response
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(200);
          res.end(
            JSON.stringify({
              schemaVersion: 1,
              valid: false,
              version: currentCompiled.version,
              metadata: currentCompiled.metadata,
              documents: currentCompiled.documents.map((d) => ({
                id: d.id,
                title: d.title,
                path: d.path,
                tab: d.tab
              })),
              tabs: currentCompiled.tabs.map((t) => ({ id: t.id, title: t.title })),
              diagnostics: [
                {
                  severity: 'error',
                  code: 'INVALID_SYNTAX',
                  documentId: 'requirements',
                  line: 14,
                  message: 'Unclosed code fence in sections/02-requirements.md:14'
                }
              ],
              navigation: buildNavigationIndex(currentCompiled),
              error: 'Refresh failed validation; displaying last valid snapshot.'
            })
          );
          return;
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(
          JSON.stringify({
            schemaVersion: 1,
            valid: true,
            version: currentCompiled.version,
            metadata: currentCompiled.metadata,
            documents: currentCompiled.documents.map((d) => ({
              id: d.id,
              title: d.title,
              path: d.path,
              tab: d.tab
            })),
            tabs: currentCompiled.tabs.map((t) => ({ id: t.id, title: t.title })),
            diagnostics: [],
            navigation: buildNavigationIndex(currentCompiled)
          })
        );
        return;
      }

      // API: /api/tabs/:id
      if (pathname.startsWith('/api/tabs/')) {
        const tabId = pathname.slice('/api/tabs/'.length);
        const simulate = searchParams.get('simulate');

        if (simulate === 'stale') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(409);
          res.end(JSON.stringify({ error: 'Snapshot version expired' }));
          return;
        }

        const tab = currentCompiled.tabs.find((t) => t.id === tabId);
        if (!tab) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(404);
          res.end(JSON.stringify({ error: `Tab "${tabId}" not found` }));
          return;
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(
          JSON.stringify({
            schemaVersion: 1,
            version: currentCompiled.version,
            tab
          })
        );
        return;
      }

      // API: /api/source/:id
      if (pathname.startsWith('/api/source/')) {
        const docId = pathname.slice('/api/source/'.length);
        const doc = currentCompiled.documents.find((d) => d.id === docId);
        if (!doc) {
          res.writeHead(404);
          res.end(`Document "${docId}" not found`);
          return;
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.writeHead(200);
        res.end(doc.source);
        return;
      }

      // 404 for unknown routes
      res.writeHead(404);
      res.end('Not Found');
    } catch (err) {
      res.writeHead(500);
      res.end(`Internal Server Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.on('error', rejectPromise);
    server.listen(targetPort, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr !== null ? addr.port : targetPort;
      const origin = `http://127.0.0.1:${actualPort}`;
      resolvePromise({
        server,
        origin,
        port: actualPort,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          })
      });
    });
  });
}
