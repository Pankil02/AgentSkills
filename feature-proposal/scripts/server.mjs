// @ts-check
/**
 * @file Protected loopback HTTP server for feature proposal viewer.
 * Zero external dependencies. Uses node:http, node:fs, node:path.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBundle } from './files.mjs';
import { compileBundle, buildNavigationIndex, CORE_TABS } from './format.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_ASSET_ROOT = resolve(__dirname, '../templates/viewer');
const DEFAULT_PORT = 4317;
const MAX_PORT_ATTEMPTS = 10;

/**
 * Validates a port value as a whole decimal integer between 0 and 65535.
 * @param {unknown} port
 * @returns {number}
 */
export function validatePort(port) {
  if (typeof port === 'number') {
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error(`Invalid port "${port}". Port must be an integer between 0 and 65535.`);
    }
    return port;
  }
  if (typeof port === 'string') {
    const trimmed = port.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid port "${port}". Port must be a decimal integer between 0 and 65535.`);
    }
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 0 || num > 65535) {
      throw new Error(`Invalid port "${port}". Port must be between 0 and 65535.`);
    }
    return num;
  }
  throw new Error(`Invalid port type: expected number or string, got ${typeof port}.`);
}

/**
 * Validates request Host, Origin, and Fetch metadata.
 * Strictly enforces canonical loopback authority: 127.0.0.1:<actualPort>.
 * Rejects localhost alias, foreign origins, and cross-site/same-site fetch metadata.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} actualPort
 * @returns {boolean}
 */
function isAllowedClientOrigin(req, actualPort) {
  const host = req.headers['host'];
  const expectedHost = `127.0.0.1:${actualPort}`;
  if (host !== expectedHost) {
    return false;
  }

  const origin = req.headers['origin'];
  if (origin && origin !== `http://127.0.0.1:${actualPort}`) {
    return false;
  }

  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') {
    return false;
  }

  return true;
}

/**
 * Sets standardized security response headers.
 * @param {import('node:http').ServerResponse} res
 * @param {number} actualPort
 * @param {boolean} [isApi]
 */
function setSecurityHeaders(res, actualPort, isApi = false) {
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'none'; connect-src http://127.0.0.1:${actualPort}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (isApi) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }
}

/**
 * Starts the proposal viewer loopback server.
 * @param {{
 *   planPath: string;
 *   port?: number | string;
 *   assetRoot?: string;
 * }} options
 * @returns {Promise<{
 *   origin: string;
 *   version: string;
 *   port: number;
 *   close(): Promise<void>;
 * }>}
/**
 * Formats a read or compilation exception into a structured Diagnostic.
 * Strips absolute proposal root to avoid leaking local paths.
 * @param {unknown} err
 * @param {string} rootDir
 * @returns {import('./format.mjs').Diagnostic}
 */
function formatReadErrorDiagnostic(err, rootDir) {
  const rawMsg = err instanceof Error ? err.message : String(err);
  let sanitized = rawMsg;
  if (rootDir) {
    sanitized = sanitized.split(rootDir).join('.');
  }

  let code = 'READ_ERROR';
  let documentId = 'manifest';

  if (/symlink|junction/i.test(rawMsg)) {
    code = 'SYMLINK_FORBIDDEN';
  } else if (/does not exist|not found|enoent/i.test(rawMsg)) {
    code = 'FILE_NOT_FOUND';
  } else if (/128 KiB|1 MiB|limit/i.test(rawMsg)) {
    code = 'FILE_LIMIT';
  } else if (/utf-8|encoding/i.test(rawMsg)) {
    code = 'INVALID_ENCODING';
  } else if (/suspicious|forbidden/i.test(rawMsg)) {
    code = 'FORBIDDEN_PATH';
  } else if (/concurrent modification|race/i.test(rawMsg)) {
    code = 'CONCURRENT_MODIFICATION';
  }

  const docMatch = rawMsg.match(/sections\/([a-z0-9-]+)\.md/i);
  if (docMatch) {
    documentId = docMatch[1];
  } else if (/proposal\.md/i.test(rawMsg)) {
    documentId = 'manifest';
  }

  return {
    severity: 'error',
    code,
    documentId,
    message: sanitized
  };
}

/**
 * Starts the proposal viewer loopback server.
 * @param {{
 *   planPath: string;
 *   port?: number | string;
 *   assetRoot?: string;
 * }} options
 * @returns {Promise<{
 *   origin: string;
 *   version: string;
 *   port: number;
 *   close(): Promise<void>;
 * }>}
 */
export async function startViewer(options) {
  const assetRoot = options.assetRoot || DEFAULT_ASSET_ROOT;

  let requestedPort;
  if (options.port !== undefined) {
    requestedPort = validatePort(options.port);
  }

  // Initial read & compile
  const initialBundle = await readBundle(options.planPath);
  const initialCompile = compileBundle(initialBundle);
  if (!initialCompile.value) {
    const errorMsgs = initialCompile.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => `[${d.code}] ${d.documentId}: ${d.message}`)
      .join('\n');
    throw new Error(`Cannot start viewer: Proposal has validation errors:\n${errorMsgs}`);
  }

  const proposalRoot = dirname(resolve(process.cwd(), options.planPath));

  /** @type {Map<string, import('./format.mjs').CompiledProposal>} */
  const snapshots = new Map();
  snapshots.set(initialCompile.value.version, initialCompile.value);
  let currentVersion = initialCompile.value.version;
  /** @type {string | null} */
  let previousVersion = null;

  /**
   * @typedef {{
   *   success: true;
   *   snapshot: import('./format.mjs').CompiledProposal;
   *   diagnostics: import('./format.mjs').Diagnostic[];
   * } | {
   *   success: false;
   *   diagnostics: import('./format.mjs').Diagnostic[];
   * }} RefreshResult
   */

  /** @type {Promise<RefreshResult> | null} */
  let activeRefreshPromise = null;

  async function performRefresh() {
    try {
      const bundle = await readBundle(options.planPath);
      const compileRes = compileBundle(bundle);
      if (compileRes.value) {
        if (compileRes.value.version !== currentVersion) {
          previousVersion = currentVersion;
          currentVersion = compileRes.value.version;
          snapshots.set(currentVersion, compileRes.value);
          // Retain strictly current and previous snapshots (max 2)
          for (const v of Array.from(snapshots.keys())) {
            if (v !== currentVersion && v !== previousVersion) {
              snapshots.delete(v);
            }
          }
        }
        return {
          success: true,
          snapshot: compileRes.value,
          diagnostics: compileRes.diagnostics
        };
      }
      return {
        success: false,
        diagnostics: compileRes.diagnostics
      };
    } catch (err) {
      return {
        success: false,
        diagnostics: [formatReadErrorDiagnostic(err, proposalRoot)]
      };
    }
  }

  function executeRefresh() {
    if (!activeRefreshPromise) {
      activeRefreshPromise = performRefresh().finally(() => {
        activeRefreshPromise = null;
      });
    }
    return activeRefreshPromise;
  }

  // Cache allowlisted public assets in memory at startup
  /** @type {Map<string, { content: string; type: string }>} */
  const assetCache = new Map();

  const indexPath = resolve(assetRoot, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Viewer index.html missing from asset root: "${assetRoot}"`);
  }
  const indexHtml = readFileSync(indexPath, 'utf8');
  assetCache.set('/', { content: indexHtml, type: 'text/html; charset=utf-8' });
  assetCache.set('/index.html', { content: indexHtml, type: 'text/html; charset=utf-8' });

  const ALLOWED_ASSET_DEFS = [
    { route: '/assets/styles.css', file: 'styles.css', type: 'text/css; charset=utf-8' },
    { route: '/assets/app.js', file: 'app.js', type: 'application/javascript; charset=utf-8' },
    { route: '/assets/render.js', file: 'render.js', type: 'application/javascript; charset=utf-8' },
    { route: '/assets/diagrams.js', file: 'diagrams.js', type: 'application/javascript; charset=utf-8' }
  ];

  for (const assetDef of ALLOWED_ASSET_DEFS) {
    const assetPath = resolve(assetRoot, assetDef.file);
    if (!existsSync(assetPath)) {
      throw new Error(`Allowlisted asset missing from asset root: "${assetDef.file}" in "${assetRoot}"`);
    }
    const content = readFileSync(assetPath, 'utf8');
    assetCache.set(assetDef.route, { content, type: assetDef.type });
  }

  /** @type {Set<import('node:net').Socket>} */
  const activeSockets = new Set();

  let actualPort = 0;

  const server = createServer(async (req, res) => {
    const isApi = req.url ? req.url.startsWith('/api/') : false;

    // Only GET is supported
    if (req.method !== 'GET') {
      setSecurityHeaders(res, actualPort, isApi);
      res.writeHead(405, {
        Allow: 'GET',
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method Not Allowed' } }));
      return;
    }

    if (!isAllowedClientOrigin(req, actualPort)) {
      setSecurityHeaders(res, actualPort, isApi);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'FORBIDDEN_ORIGIN', message: 'Forbidden origin or host authority.' } }));
      return;
    }

    const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${actualPort}`);
    const pathname = parsedUrl.pathname;

    // Public Route: Cached allowlisted static assets and index.html
    if (assetCache.has(pathname)) {
      const asset = assetCache.get(pathname);
      setSecurityHeaders(res, actualPort, false);
      // @ts-ignore
      res.writeHead(200, { 'Content-Type': asset.type });
      // @ts-ignore
      res.end(asset.content);
      return;
    }

    // API Routes: /api/* (Token-free loopback access)
    if (pathname.startsWith('/api/')) {
      setSecurityHeaders(res, actualPort, true);

      // GET /api/proposal (or /api/proposal?refresh=1)
      if (pathname === '/api/proposal') {
        const isRefresh = parsedUrl.searchParams.get('refresh') === '1';
        let currentSnapshot = snapshots.get(currentVersion);

        if (isRefresh) {
          const refreshResult = await executeRefresh();
          if (refreshResult.success) {
            currentSnapshot = refreshResult.snapshot;
          } else {
            // Keep last good snapshot with structured diagnostics
            const lastGood = snapshots.get(currentVersion);
            /** @type {Record<string, any>} */
            const invalidPayload = {
              schemaVersion: 1,
              valid: false,
              version: currentVersion,
              metadata: lastGood?.metadata,
              documents: lastGood?.documents.map((d) => ({
                id: d.id,
                title: d.title,
                path: d.path,
                tab: d.tab
              })),
              tabs: lastGood?.tabs.map((t) => ({ id: t.id, title: t.title })),
              diagnostics: refreshResult.diagnostics,
              navigation: buildNavigationIndex(lastGood)
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(invalidPayload));
            return;
          }
        }

        if (!currentSnapshot) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'NO_SNAPSHOT', message: 'No active snapshot available.' } }));
          return;
        }

        /** @type {Record<string, any>} */
        const payload = {
          schemaVersion: 1,
          valid: true,
          version: currentSnapshot.version,
          metadata: currentSnapshot.metadata,
          documents: currentSnapshot.documents.map((d) => ({
            id: d.id,
            title: d.title,
            path: d.path,
            tab: d.tab
          })),
          tabs: currentSnapshot.tabs.map((t) => ({ id: t.id, title: t.title })),
          diagnostics: currentSnapshot.diagnostics,
          navigation: buildNavigationIndex(currentSnapshot)
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      // GET /api/tabs/<tab-id>?version=<hash>
      const tabMatch = pathname.match(/^\/api\/tabs\/([a-z0-9-]+)$/);
      if (tabMatch) {
        const tabId = tabMatch[1];
        if (!CORE_TABS.includes(tabId)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'NOT_FOUND', message: `Unknown tab "${tabId}".` } }));
          return;
        }

        const reqVersion = parsedUrl.searchParams.get('version') || currentVersion;
        const snapshot = snapshots.get(reqVersion);
        if (!snapshot) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              schemaVersion: 1,
              error: {
                code: 'STALE_VERSION',
                message: 'Requested snapshot version is stale or unknown. Please click Refresh.'
              }
            })
          );
          return;
        }

        const tabData = snapshot.tabs.find((t) => t.id === tabId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ schemaVersion: 1, version: snapshot.version, tab: tabData }));
        return;
      }

      // GET /api/source/<doc-id>?version=<hash>
      const sourceMatch = pathname.match(/^\/api\/source\/([a-z0-9-]+)$/);
      if (sourceMatch) {
        const docId = sourceMatch[1];
        const reqVersion = parsedUrl.searchParams.get('version') || currentVersion;
        const snapshot = snapshots.get(reqVersion);

        if (!snapshot) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              schemaVersion: 1,
              error: {
                code: 'STALE_VERSION',
                message: 'Requested snapshot version is stale. Please refresh.'
              }
            })
          );
          return;
        }

        const doc = snapshot.documents.find((d) => d.id === docId);
        if (!doc) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'NOT_FOUND', message: `Document "${docId}" not found.` } }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(doc.source);
        return;
      }
    }

    // Default 404 for unknown routes
    setSecurityHeaders(res, actualPort, isApi);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ schemaVersion: 1, error: { code: 'NOT_FOUND', message: 'Not Found' } }));
  });

  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.maxHeadersCount = 100;

  server.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.once('close', () => {
      activeSockets.delete(socket);
    });
  });

  if (requestedPort !== undefined) {
    // Explicit port: listen once, fail on EADDRINUSE
    await new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(requestedPort, '127.0.0.1', () => {
        server.removeListener('error', rejectListen);
        // @ts-ignore
        actualPort = server.address().port;
        resolveListen(null);
      });
    });
  } else {
    // Default range scan (4317..4326)
    let bound = false;
    for (let offset = 0; offset < MAX_PORT_ATTEMPTS; offset++) {
      const portCandidate = DEFAULT_PORT + offset;
      try {
        await new Promise((resolveListen, rejectListen) => {
          server.once('error', rejectListen);
          server.listen(portCandidate, '127.0.0.1', () => {
            server.removeListener('error', rejectListen);
            // @ts-ignore
            actualPort = server.address().port;
            bound = true;
            resolveListen(null);
          });
        });
        if (bound) break;
      } catch (err) {
        // @ts-ignore
        if (err.code === 'EADDRINUSE' && offset < MAX_PORT_ATTEMPTS - 1) {
          continue;
        }
        throw err;
      }
    }
  }

  const origin = `http://127.0.0.1:${actualPort}`;

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;

    for (const s of activeSockets) {
      s.destroy();
    }
    activeSockets.clear();

    await new Promise((resolveClose) => {
      server.close(() => resolveClose(null));
    });
  }

  return {
    origin,
    version: currentVersion,
    port: actualPort,
    close
  };
}
