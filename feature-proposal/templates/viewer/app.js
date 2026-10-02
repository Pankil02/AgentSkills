// @ts-check
/**
 * @file Main client-side application logic for local proposal viewer.
 * Vanilla JavaScript, WAI-ARIA keyboard tabs, token-free localhost, explicit refresh.
 */

import { renderBlocks } from './render.js';

const TABS = Object.freeze([
  'overview',
  'requirements',
  'options',
  'architecture',
  'data-api',
  'performance',
  'risks',
  'delivery',
  'source'
]);

/** @type {string | null} */
let currentVersion = null;
/** @type {any} */
let proposalMeta = null;
/** @type {{ anchors: Record<string, { tabId: string, documentId: string }>; documents: Record<string, string> }} */
let proposalNavigation = { anchors: {}, documents: {} };

/** @type {Map<string, any>} */
const tabCache = new Map();
/** @type {Map<string, string>} */
const sourceCache = new Map();

/** @type {string} */
let activeTabId = 'overview';

let tabGeneration = 0;
/** @type {AbortController | null} */
let activeTabAbortController = null;

let sourceGeneration = 0;
/** @type {AbortController | null} */
let activeSourceAbortController = null;

/** @type {number | null} */
let toastTimeoutId = null;
/** @type {IntersectionObserver | null} */
let outlineObserver = null;

/**
 * Bounded resource fetch helper with strict timeout cleanup and structured error handling.
 * @param {string} url
 * @param {{ signal?: AbortSignal; timeoutMs?: number; responseKind?: 'json' | 'text' }} [options]
 * @returns {Promise<{ ok: true; status: number; data: any } | { ok: false; status: number; error: { code: string; message: string; diagnostics?: any[] } }>}
 */
async function fetchResource(url, options = {}) {
  const { signal: externalSignal, timeoutMs = 6000, responseKind = 'json' } = options;
  const controller = new AbortController();
  let timerId = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs) : null;
  let abortListener = null;

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else {
      abortListener = () => controller.abort(externalSignal.reason);
      externalSignal.addEventListener('abort', abortListener, { once: true });
    }
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      let errorBody = null;
      try {
        const text = await res.text();
        try { errorBody = JSON.parse(text); } catch { errorBody = { message: text }; }
      } catch {}
      const code = errorBody?.error?.code || `HTTP_${res.status}`;
      const message = errorBody?.error?.message || errorBody?.message || res.statusText || `Request failed with status ${res.status}`;
      return { ok: false, status: res.status, error: { code, message, diagnostics: errorBody?.diagnostics } };
    }
    const data = responseKind === 'text' ? await res.text() : await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    const isAbort = controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError');
    return { ok: false, status: 0, error: { code: isAbort ? 'ABORTED' : 'NETWORK_ERROR', message: err instanceof Error ? err.message : String(err) } };
  } finally {
    if (timerId !== null) clearTimeout(timerId);
    if (externalSignal && abortListener) externalSignal.removeEventListener('abort', abortListener);
  }
}

/**
 * Initializes the application on page load.
 */
async function initApp() {
  setupEventListeners();
  await loadProposal(false);
  const initialHash = window.location.hash.slice(1);
  if (initialHash) await navigateToAnchor(initialHash);
}

/**
 * Attaches DOM and keyboard event listeners.
 */
function setupEventListeners() {
  const btnTheme = document.getElementById('btn-theme-toggle');
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) btnRefresh.addEventListener('click', () => loadProposal(true));

  const sourceSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-doc-select'));
  if (sourceSelect) {
    sourceSelect.addEventListener('change', (e) => {
      // @ts-ignore
      const docId = e.target.value;
      if (docId) {
        updateSourceFileName(docId);
        loadSourceDocument(docId);
      }
    });
  }

  const btnCopy = document.getElementById('btn-copy-source');
  if (btnCopy) btnCopy.addEventListener('click', copySourceToClipboard);

  // Tab buttons (WAI-ARIA manual activation pattern)
  const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
  tabButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => activateTab(btn.id.replace('tab-', '')));
    btn.addEventListener('keydown', (e) => {
      let targetIdx = -1;
      if (e.key === 'ArrowRight') targetIdx = (idx + 1) % tabButtons.length;
      else if (e.key === 'ArrowLeft') targetIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
      else if (e.key === 'Home') targetIdx = 0;
      else if (e.key === 'End') targetIdx = tabButtons.length - 1;
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        activateTab(btn.id.replace('tab-', ''));
        return;
      }

      if (targetIdx !== -1) {
        e.preventDefault();
        e.stopPropagation();
        tabButtons.forEach((b, i) => b.setAttribute('tabindex', i === targetIdx ? '0' : '-1'));
        tabButtons[targetIdx].focus();
      }
    });
  });

  window.addEventListener('keydown', handleGlobalKeydown);
}

/**
 * Handles global presentation and keyboard shortcuts.
 * @param {KeyboardEvent} e
 */
function handleGlobalKeydown(e) {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true')) return;

  if (/^[1-9]$/.test(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    if (idx >= 0 && idx < TABS.length) { e.preventDefault(); activateTab(TABS[idx]); }
  } else if (e.key === '[') {
    e.preventDefault(); navigatePreviousTab();
  } else if (e.key === ']') {
    e.preventDefault(); navigateNextTab();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault(); loadProposal(true);
  } else if (e.key === 't' || e.key === 'T') {
    e.preventDefault(); toggleTheme();
  }
}

function navigatePreviousTab() {
  const currentIndex = TABS.indexOf(activeTabId);
  activateTab(TABS[(currentIndex - 1 + TABS.length) % TABS.length]);
}

function navigateNextTab() {
  const currentIndex = TABS.indexOf(activeTabId);
  activateTab(TABS[(currentIndex + 1) % TABS.length]);
}

/**
 * Shows an ephemeral toast message.
 * @param {string} msg
 */
function showToast(msg) {
  const toast = document.getElementById('app-toast');
  if (!toast) return;

  if (toastTimeoutId !== null) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }

  toast.textContent = msg;
  toast.hidden = false;
  toast.classList.add('show');

  toastTimeoutId = window.setTimeout(() => {
    toast.classList.remove('show');
    toast.hidden = true;
    toastTimeoutId = null;
  }, 2200);
}

/**
 * Displays persistent diagnostic banner for validation errors.
 * @param {Array<{ code: string; documentId: string; line?: number; message: string }> | undefined} diagnostics
 */
function showDiagnosticBanner(diagnostics) {
  const banner = document.getElementById('diagnostic-banner');
  if (!banner) return;

  banner.textContent = '';
  banner.hidden = false;

  const title = document.createElement('div');
  title.className = 'banner-title';
  title.textContent = 'Validation errors on disk (retaining last valid snapshot):';
  banner.appendChild(title);

  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    const list = document.createElement('ul');
    list.className = 'banner-list';
    for (const diag of diagnostics) {
      const li = document.createElement('li');
      const lineStr = diag.line !== undefined ? `:${diag.line}` : '';
      li.textContent = `[${diag.code}] ${diag.documentId}${lineStr} — ${diag.message}`;
      list.appendChild(li);
    }
    banner.appendChild(list);
  }
}

function clearDiagnosticBanner() {
  const banner = document.getElementById('diagnostic-banner');
  if (banner) {
    banner.hidden = true;
    banner.textContent = '';
  }
}

/**
 * Loads proposal manifest metadata and initial tab.
 * @param {boolean} isRefresh
 */
async function loadProposal(isRefresh) {
  const url = isRefresh ? '/api/proposal?refresh=1' : '/api/proposal';
  const refreshBtn = document.getElementById('btn-refresh');
  const spinTarget = refreshBtn?.querySelector('.spin-target');
  const statusIndicator = document.getElementById('status-indicator');

  if (spinTarget) spinTarget.classList.add('spinning');
  if (statusIndicator) statusIndicator.textContent = 'Refreshing...';

  try {
    const res = await fetchResource(url, { timeoutMs: 6000, responseKind: 'json' });
    if (!res.ok) {
      console.error('Failed to load proposal:', res.error);
      const loading = document.getElementById('loading-indicator');
      if (loading) loading.textContent = `Error connecting to proposal server: ${res.error.message}`;
      showToast(`Error: ${res.error.message}`);
      return;
    }

    const data = res.data;
    if (data.valid === false) {
      showDiagnosticBanner(data.diagnostics);
      if (statusIndicator) statusIndicator.textContent = 'Disk error';
      showToast('Validation errors on disk; retaining last valid proposal');
      if (data.version) currentVersion = data.version;
      if (data.navigation) proposalNavigation = data.navigation;
      return;
    }

    clearDiagnosticBanner();

    if (isRefresh && data.version !== currentVersion) {
      tabCache.clear();
      sourceCache.clear();
      showToast(`Refreshed to version ${data.version.slice(0, 8)}`);
    } else if (isRefresh) {
      showToast('Proposal is already up-to-date');
    }

    currentVersion = data.version;
    proposalMeta = data.metadata;
    proposalNavigation = data.navigation || { anchors: {}, documents: {} };

    updateHeaderUI(data);
    populateSourceDropdown(data.documents);
    await activateTab(activeTabId);
  } catch (err) {
    console.error('Unexpected error loading proposal:', err);
    showToast(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (spinTarget) spinTarget.classList.remove('spinning');
    if (statusIndicator && statusIndicator.textContent === 'Refreshing...') {
      statusIndicator.textContent = 'Refresh from disk';
    }
  }
}

function updateHeaderUI(data) {
  const meta = data.metadata || {};
  const titleEl = document.getElementById('proposal-title');
  if (titleEl) titleEl.textContent = meta.title || 'Proposal Viewer';
}

function updateSourceFileName(docId) {
  const filenameEl = document.getElementById('source-filename');
  if (filenameEl) {
    filenameEl.textContent = docId === 'manifest' ? 'proposal.md' : `sections/${docId}.md`;
  }
}

function populateSourceDropdown(documents) {
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-doc-select'));
  if (!select) return;

  const currentSelected = select.value;
  select.textContent = '';

  for (const doc of documents) {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = `${doc.title} (${doc.path})`;
    select.appendChild(opt);
  }

  if (currentSelected && documents.some((d) => d.id === currentSelected)) {
    select.value = currentSelected;
  }
}

/**
 * Activates a tab by ID.
 * @param {string} tabId
 */
async function activateTab(tabId) {
  if (!TABS.includes(tabId)) return;

  if (outlineObserver) {
    outlineObserver.disconnect();
    outlineObserver = null;
  }

  if (activeTabAbortController) {
    activeTabAbortController.abort();
    activeTabAbortController = null;
  }

  tabGeneration++;
  const currentTabGen = tabGeneration;
  const targetVersion = currentVersion;
  activeTabAbortController = new AbortController();

  activeTabId = tabId;
  // @ts-ignore
  window.activeTabId = tabId;

  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    const isCurrent = btn.id === `tab-${tabId}`;
    btn.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    btn.setAttribute('tabindex', isCurrent ? '0' : '-1');
  });

  for (const id of TABS) {
    const panel = document.getElementById(`panel-${id}`);
    if (panel) {
      if (id === tabId) {
        panel.hidden = false;
      } else {
        panel.hidden = true;
        if (id !== 'source') panel.textContent = '';
      }
    }
  }

  const activePanel = document.getElementById(`panel-${tabId}`);
  if (!activePanel) return;

  if (tabId === 'source') {
    updateOutline([]);
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-doc-select'));
    const docId = select?.value || 'manifest';
    updateSourceFileName(docId);
    await loadSourceDocument(docId);
    return;
  }

  const cacheKey = `${tabId}:${currentVersion}`;
  let tabData = tabCache.get(cacheKey);

  if (!tabData) {
    activePanel.textContent = '';
    const loadingState = document.createElement('div');
    loadingState.className = 'loading-state';
    const pulse = document.createElement('span');
    pulse.className = 'loader-pulse';
    const text = document.createElement('span');
    text.textContent = `Loading ${tabId} content...`;
    loadingState.append(pulse, text);
    activePanel.appendChild(loadingState);

    const res = await fetchResource(`/api/tabs/${tabId}?version=${currentVersion}`, {
      signal: activeTabAbortController.signal,
      timeoutMs: 6000,
      responseKind: 'json'
    });

    if (currentTabGen !== tabGeneration || activeTabId !== tabId || currentVersion !== targetVersion) return;

    if (!res.ok) {
      if (res.status === 409) {
        await loadProposal(true);
        return;
      }
      if (res.error.code === 'ABORTED') return;
      activePanel.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'banner banner-error';
      errDiv.textContent = `Error loading tab content: ${res.error.message}`;
      activePanel.appendChild(errDiv);
      return;
    }

    tabData = res.data.tab;
    tabCache.set(cacheKey, tabData);
  }

  if (currentTabGen !== tabGeneration || activeTabId !== tabId || currentVersion !== targetVersion) return;

  activePanel.textContent = '';
  const allBlocks = [];
  if (tabData && Array.isArray(tabData.documents)) {
    for (const doc of tabData.documents) {
      allBlocks.push(...doc.blocks);
    }
  }

  const fragment = renderBlocks(allBlocks, { onNavigateAnchor: navigateToAnchor });
  activePanel.appendChild(fragment);
  updateOutline(allBlocks);
}

/**
 * Loads and displays raw markdown source in Source tab.
 * @param {string} docId
 */
async function loadSourceDocument(docId) {
  const codeView = document.getElementById('source-code-view');
  if (!codeView) return;

  if (activeSourceAbortController) {
    activeSourceAbortController.abort();
    activeSourceAbortController = null;
  }

  sourceGeneration++;
  const currentSourceGen = sourceGeneration;
  const targetVersion = currentVersion;
  activeSourceAbortController = new AbortController();

  const cacheKey = `${docId}:${currentVersion}`;
  let sourceText = sourceCache.get(cacheKey);

  if (!sourceText) {
    codeView.textContent = 'Loading source...';

    const res = await fetchResource(`/api/source/${docId}?version=${currentVersion}`, {
      signal: activeSourceAbortController.signal,
      timeoutMs: 6000,
      responseKind: 'text'
    });

    if (currentSourceGen !== sourceGeneration || currentVersion !== targetVersion) return;

    if (!res.ok) {
      if (res.status === 409) {
        await loadProposal(true);
        return;
      }
      if (res.error.code === 'ABORTED') return;
      // Never cache failed HTTP responses as raw source!
      codeView.textContent = `Error loading source: ${res.error.message}`;
      return;
    }

    sourceText = res.data;
    sourceCache.set(cacheKey, sourceText);
  }

  if (currentSourceGen !== sourceGeneration || currentVersion !== targetVersion) return;
  codeView.textContent = sourceText;
}

/**
 * Updates table of contents outline in the horizontal index bar.
 * @param {import('../../scripts/format.mjs').Block[]} blocks
 */
function updateOutline(blocks) {
  const outlineNav = document.getElementById('outline-nav');
  const outlineBar = document.getElementById('outline-sidebar');
  if (!outlineNav) return;

  if (outlineObserver) {
    outlineObserver.disconnect();
    outlineObserver = null;
  }

  outlineNav.textContent = '';
  let headings = blocks.filter((b) => b.type === 'heading' && b.level >= 2 && b.level <= 3);
  if (headings.length === 0) {
    headings = blocks.filter((b) => b.type === 'heading' && b.level <= 3);
  }

  if (headings.length === 0) {
    if (outlineBar) outlineBar.style.display = 'none';
    return;
  }

  if (outlineBar) outlineBar.style.display = 'flex';

  for (const h of headings) {
    if (h.type !== 'heading') continue;
    const a = document.createElement('a');
    a.className = h.level === 3 ? 'outline-link outline-sublink' : 'outline-link';
    a.href = `#${h.id}`;
    a.textContent = (h.level === 3 ? '↳ ' : '') + h.text;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToAnchor(h.id);
    });
    outlineNav.appendChild(a);
  }

  setupOutlineObserver(headings);
}

/**
 * Sets up intersection observer to highlight currently visible heading in index.
 * @param {import('../../scripts/format.mjs').HeadingBlock[]} headings
 */
function setupOutlineObserver(headings) {
  if (typeof IntersectionObserver === 'undefined') return;

  const targetElements = headings
    .map((h) => document.getElementById(h.id))
    .filter((el) => el !== null);

  if (targetElements.length === 0) return;

  outlineObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length > 0) {
        const topEntry = visible.reduce((prev, curr) =>
          prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
        );
        const activeId = topEntry.target.id;
        const allLinks = document.querySelectorAll('.outline-link');
        allLinks.forEach((link) => {
          const isActive = link.getAttribute('href') === `#${activeId}`;
          if (isActive) {
            link.classList.add('active-outline');
            link.setAttribute('aria-current', 'location');
          } else {
            link.classList.remove('active-outline');
            link.removeAttribute('aria-current');
          }
        });
      }
    },
    { rootMargin: '0px 0px -60% 0px', threshold: 0.1 }
  );

  targetElements.forEach((el) => {
    if (el) outlineObserver?.observe(el);
  });
}

/**
 * Navigates safely to an anchor, document, or tab.
 * @param {string} anchor
 */
async function navigateToAnchor(anchor) {
  if (!anchor) return;

  if (TABS.includes(anchor)) {
    await activateTab(anchor);
    return;
  }

  if (anchor.startsWith('tab-') && TABS.includes(anchor.replace('tab-', ''))) {
    await activateTab(anchor.replace('tab-', ''));
    return;
  }

  if (anchor === 'manifest') {
    await activateTab('source');
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-doc-select'));
    if (select) {
      select.value = 'manifest';
      updateSourceFileName('manifest');
      await loadSourceDocument('manifest');
    }
    return;
  }

  if (proposalNavigation?.documents && anchor in proposalNavigation.documents) {
    const owningTab = proposalNavigation.documents[anchor];
    if (owningTab === 'source') {
      await activateTab('source');
      const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-doc-select'));
      if (select) {
        select.value = anchor;
        updateSourceFileName(anchor);
        await loadSourceDocument(anchor);
      }
      return;
    } else if (owningTab && activeTabId !== owningTab) {
      await activateTab(owningTab);
    }
  }

  if (proposalNavigation?.anchors && anchor in proposalNavigation.anchors) {
    const target = proposalNavigation.anchors[anchor];
    if (target?.tabId && activeTabId !== target.tabId) {
      await activateTab(target.tabId);
    }
  }

  const targetEl = document.getElementById(anchor);
  if (targetEl) {
    let parent = targetEl.parentElement;
    while (parent) {
      if (parent.tagName === 'DETAILS') {
        /** @type {HTMLDetailsElement} */ (parent).open = true;
      }
      parent = parent.parentElement;
    }
    if (targetEl.tagName === 'DETAILS') {
      /** @type {HTMLDetailsElement} */ (targetEl).open = true;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    targetEl.setAttribute('tabindex', '-1');
    targetEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    targetEl.focus({ preventScroll: true });
  }
}

async function copySourceToClipboard() {
  const codeView = document.getElementById('source-code-view');
  if (!codeView || !codeView.textContent) return;

  try {
    await navigator.clipboard.writeText(codeView.textContent);
    showToast('Source copied to clipboard');
    const btn = document.getElementById('btn-copy-source');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
  } catch {
    alert('Unable to copy via clipboard API. Please select text manually.');
  }
}

function toggleTheme() {
  const doc = document.documentElement;
  const currentTheme = doc.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  doc.setAttribute('data-theme', newTheme);
  showToast(`Switched to ${newTheme} theme`);
}

// Expose state and functions on window for test harness and automation
// @ts-ignore
window.activeTabId = activeTabId;
// @ts-ignore
window.activateTab = activateTab;
// @ts-ignore
window.navigateToAnchor = navigateToAnchor;
// @ts-ignore
window.loadProposal = loadProposal;
// @ts-ignore
window.fetchResource = fetchResource;
// @ts-ignore
window.updateOutline = updateOutline;

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.slice(1);
  if (hash) navigateToAnchor(hash);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
