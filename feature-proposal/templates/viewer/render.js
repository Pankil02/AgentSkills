// @ts-check
/**
 * @file Safe DOM Renderer for AST blocks, inlines, and accessible code blocks.
 * Zero external libraries, zero unsafe DOM methods, zero eval, pure semantic DOM.
 */

import { renderDiagram } from './diagrams.js';

/**
 * @typedef {Object} RenderContext
 * @property {(anchor: string) => void} [onNavigateAnchor]
 */

/**
 * Copies code block content to clipboard without blocking.
 * @param {string} text
 * @param {HTMLButtonElement} btn
 */
async function copyCodeBlock(text, btn) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-copied');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('btn-copied');
      }, 1600);
    } else {
      btn.textContent = 'Copy unavailable';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    }
  } catch {
    btn.textContent = 'Copy failed';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  }
}

/**
 * Builds a clean, safe code block container with a subtle language badge and non-blocking copy button.
 * Preserves exact whitespace, line breaks, and characters without line-number DOM wrappers.
 * @param {string} codeText
 * @param {string} lang
 * @returns {HTMLElement}
 */
function buildCodeBlock(codeText, lang) {
  const container = document.createElement('div');
  container.className = 'code-block-wrapper';

  const header = document.createElement('div');
  header.className = 'code-header';

  const normLang = (lang || 'code').toLowerCase().trim();
  const langTag = document.createElement('span');
  langTag.className = `code-lang-badge lang-${normLang}`;
  langTag.textContent = normLang.toUpperCase();
  header.appendChild(langTag);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-secondary btn-sm btn-code-copy';
  copyBtn.type = 'button';
  copyBtn.setAttribute('aria-label', `Copy ${normLang} code`);
  copyBtn.textContent = 'Copy';
  copyBtn.addEventListener('click', () => copyCodeBlock(codeText, copyBtn));
  header.appendChild(copyBtn);

  container.appendChild(header);

  const pre = document.createElement('pre');
  pre.className = 'code-block';

  const codeEl = document.createElement('code');
  codeEl.className = `language-${normLang}`;
  codeEl.textContent = codeText;

  pre.appendChild(codeEl);
  container.appendChild(pre);

  return container;
}

function createBadge(type, label, iconChar) {
  const span = document.createElement('span');
  span.className = `badge-${type}`;
  if (iconChar) {
    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = iconChar;
    span.append(icon, document.createTextNode(` ${label}`));
  } else {
    span.textContent = label;
  }
  return span;
}

function createHeadingAnchor(id, onNavigateAnchor) {
  const a = document.createElement('a');
  a.className = 'heading-anchor-link';
  a.href = `#${id}`;
  a.textContent = '#';
  a.title = 'Link to this section';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (onNavigateAnchor) onNavigateAnchor(id);
  });
  return a;
}

/**
 * Renders an array of inline tokens into a parent container.
 * @param {import('../../scripts/format.mjs').Inline[]} inlines
 * @param {HTMLElement} parent
 * @param {RenderContext} [context]
 */
export function renderInlines(inlines, parent, context = {}) {
  for (const item of inlines) {
    if (item.type === 'text') {
      const text = item.text;
      const trimmed = text.trim();
      if (/^(?:✓|✅)?\s*Chosen$/i.test(trimmed)) {
        parent.appendChild(createBadge('verdict-chosen', 'Chosen', '✓'));
      } else if (/^(?:✕|❌)?\s*Rejected$/i.test(trimmed)) {
        parent.appendChild(createBadge('verdict-rejected', 'Rejected', '✕'));
      } else if (/^(?:🟢\s*)?High$/i.test(trimmed)) {
        parent.appendChild(createBadge('level-high', 'High'));
      } else if (/^(?:🟡\s*)?Medium$/i.test(trimmed)) {
        parent.appendChild(createBadge('level-med', 'Med'));
      } else if (/^(?:🔴\s*)?Low$/i.test(trimmed)) {
        parent.appendChild(createBadge('level-low', 'Low'));
      } else if (/^(?:🟢\s*)?Nil$/i.test(trimmed)) {
        parent.appendChild(createBadge('level-high', 'Nil'));
      } else {
        parent.appendChild(document.createTextNode(text));
      }
    } else if (item.type === 'code') {
      const el = document.createElement('code');
      el.textContent = item.text;
      const trimmed = item.text.trim();

      if (/^[A-Z]{2,4}-\d+$/.test(trimmed)) {
        el.className = 'cell-id';
      } else if (/^2\d\d(\s+[A-Za-z]+)?$/.test(trimmed)) {
        el.className = 'pill-status-success';
      } else if (/^[45]\d\d(\s+[A-Za-z]+)?$/.test(trimmed)) {
        el.className = 'pill-status-error';
      } else if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/i.test(trimmed)) {
        el.className = 'pill-http-method';
      } else {
        el.className = 'pill-code-id';
      }

      parent.appendChild(el);
    } else if (item.type === 'strong') {
      const el = document.createElement('strong');
      const trimmed = item.text.trim();
      if (/^(?:✓|✅)?\s*Chosen$/i.test(trimmed)) {
        el.appendChild(createBadge('verdict-chosen', 'Chosen', '✓'));
      } else if (/^(?:✕|❌)?\s*Rejected$/i.test(trimmed)) {
        el.appendChild(createBadge('verdict-rejected', 'Rejected', '✕'));
      } else if (/\(Recommended\)/i.test(trimmed)) {
        const prefix = trimmed.replace(/\(Recommended\)/i, '').trim();
        if (prefix) el.appendChild(document.createTextNode(prefix + ' '));
        el.appendChild(createBadge('recommended', 'RECOMMENDED'));
      } else {
        el.textContent = item.text;
      }
      parent.appendChild(el);
    } else if (item.type === 'link') {
      if (item.target.kind === 'internal') {
        const a = document.createElement('a');
        a.className = 'internal-link';
        a.href = `#${item.target.anchor || ''}`;
        a.textContent = item.text;
        a.addEventListener('click', (e) => {
          e.preventDefault();
          if (context.onNavigateAnchor && item.target.anchor) {
            context.onNavigateAnchor(item.target.anchor);
          }
        });
        parent.appendChild(a);
      } else if (item.target.kind === 'external') {
        const a = document.createElement('a');
        a.className = 'external-link';
        a.href = item.target.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = item.text;
        parent.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className = 'inert-link';
        span.title = item.target.reason || 'Unsupported link scheme';
        span.textContent = item.text;
        parent.appendChild(span);
      }
    }
  }
}

/**
 * Renders AST blocks into a DocumentFragment.
 * Semantic headings, plain code blocks, and document-aware accordion grouping.
 * @param {import('../../scripts/format.mjs').Block[]} blocks
 * @param {RenderContext} [context]
 * @returns {DocumentFragment}
 */
export function renderBlocks(blocks, context = {}) {
  const fragment = document.createDocumentFragment();

  let activeCard = null;
  /** @type {HTMLDetailsElement | null} */
  let activeDetails = null;

  function ensureCard() {
    if (!activeCard) {
      activeCard = document.createElement('section');
      activeCard.className = 'card prose';
      fragment.appendChild(activeCard);
    }
    return activeCard;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    // H1 Heading -> Document page title
    if (block.type === 'heading' && block.level === 1) {
      activeDetails = null;
      activeCard = null;

      const pageHeader = document.createElement('header');
      pageHeader.className = 'page-title-header';

      const h1 = document.createElement('h1');
      h1.className = 'page-title';
      h1.id = block.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'page-title-text';
      titleSpan.textContent = block.text;
      h1.appendChild(titleSpan);
      h1.appendChild(createHeadingAnchor(block.id, context.onNavigateAnchor));

      pageHeader.appendChild(h1);
      fragment.appendChild(pageHeader);
      continue;
    }

    // H2 Heading -> Section divider
    if (block.type === 'heading' && block.level === 2) {
      activeDetails = null;
      const card = ensureCard();

      const h2 = document.createElement('h2');
      h2.className = 'section-title';
      h2.id = block.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'section-title-text';
      titleSpan.textContent = block.text;
      h2.appendChild(titleSpan);
      h2.appendChild(createHeadingAnchor(block.id, context.onNavigateAnchor));

      card.appendChild(h2);
      continue;
    }

    // H3 Heading matching "Technical details" or "Tests" -> Collapsible accordion
    if (block.type === 'heading' && block.level === 3 && /(Technical details|Tests)/i.test(block.text)) {
      const card = ensureCard();
      activeDetails = document.createElement('details');
      activeDetails.className = 'accordion';
      activeDetails.id = block.id;
      activeDetails.open = false; // Closed by default per spec

      const summary = document.createElement('summary');
      summary.className = 'accordion-summary';
      summary.textContent = block.text;
      activeDetails.appendChild(summary);

      const contentDiv = document.createElement('div');
      contentDiv.className = 'accordion-content';
      activeDetails.appendChild(contentDiv);

      card.appendChild(activeDetails);
      continue;
    }

    // H4 Heading nested inside active H3 technical details accordion
    if (block.type === 'heading' && block.level >= 4 && activeDetails) {
      const contentDiv = activeDetails.querySelector('.accordion-content');
      const h = document.createElement(`h${block.level}`);
      h.className = 'subheading subheading-nested';
      h.id = block.id;
      h.textContent = block.text;
      (contentDiv || activeDetails).appendChild(h);
      continue;
    }

    // Regular H3 or top-level H4 outside accordion
    if (block.type === 'heading') {
      activeDetails = null;
      const card = ensureCard();
      const h = document.createElement(`h${block.level}`);
      h.className = 'subheading';
      h.id = block.id;
      h.textContent = block.text;
      card.appendChild(h);
      continue;
    }

    // Target parent is either active accordion content or active card
    const targetParent = activeDetails
      ? activeDetails.querySelector('.accordion-content') || activeCard
      : ensureCard();

    if (block.type === 'paragraph') {
      const p = document.createElement('p');
      renderInlines(block.content, p, context);
      targetParent.appendChild(p);
    } else if (block.type === 'list') {
      const listEl = document.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        if (item.checked !== null && item.checked !== undefined) {
          li.className = 'task-list-item';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = item.checked;
          cb.disabled = true;
          cb.className = 'task-checkbox';
          li.appendChild(cb);
        }
        renderInlines(item.content, li, context);
        listEl.appendChild(li);
      }
      targetParent.appendChild(listEl);
    } else if (block.type === 'table') {
      const wrapper = document.createElement('div');
      wrapper.className = 'table-wrapper';
      const table = document.createElement('table');
      table.className = 'data-table';

      if (block.headers.length > 0) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        for (const col of block.headers) {
          const th = document.createElement('th');
          renderInlines(col, th, context);
          tr.appendChild(th);
        }
        thead.appendChild(tr);
        table.appendChild(thead);
      }

      if (block.rows.length > 0) {
        const tbody = document.createElement('tbody');
        for (const row of block.rows) {
          const tr = document.createElement('tr');

          const isRowRecommended = row.some((cell) =>
            cell.some((tok) => tok.type === 'text' && /\(Recommended\)/i.test(tok.text))
          );
          if (isRowRecommended) {
            tr.className = 'row-recommended';
          }

          for (const cell of row) {
            const td = document.createElement('td');
            renderInlines(cell, td, context);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        }
        table.appendChild(tbody);
      }

      wrapper.appendChild(table);
      targetParent.appendChild(wrapper);
    } else if (block.type === 'code') {
      const lang = block.language || block.lang || 'code';
      const codeBlockEl = buildCodeBlock(block.text, lang);
      targetParent.appendChild(codeBlockEl);
    } else if (block.type === 'quote') {
      const bq = document.createElement('blockquote');
      bq.className = 'callout';
      const firstText = block.content[0]?.type === 'text' ? block.content[0].text : '';

      const isWarning = /^(Warning|Caution|Alert|Critical):/i.test(firstText);
      const isRecommended = /^Recommended:/i.test(firstText);

      const calloutHdr = document.createElement('div');
      calloutHdr.className = 'callout-header';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'callout-label';

      if (isRecommended) {
        bq.className = 'callout callout-recommended';
        labelSpan.textContent = 'Recommendation';
      } else if (isWarning) {
        bq.className = 'callout callout-warning';
        labelSpan.textContent = 'Warning / Critical Alert';
      } else {
        labelSpan.textContent = 'Note';
      }

      calloutHdr.appendChild(labelSpan);
      bq.appendChild(calloutHdr);

      renderInlines(block.content, bq, context);

      // Keep warnings and critical operational alerts visible outside collapsible accordions
      if (isWarning && activeDetails) {
        ensureCard().appendChild(bq);
      } else {
        targetParent.appendChild(bq);
      }
    } else if (block.type === 'diagram') {
      const diagEl = renderDiagram(block.diagram);
      targetParent.appendChild(diagEl);
    }
  }

  return fragment;
}
