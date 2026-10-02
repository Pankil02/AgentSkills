// @ts-check
/**
 * @file Pure restricted Markdown parser, AST builder, diagram validator, and bundle compiler.
 * Zero I/O, zero HTTP, zero external dependencies.
 */

import { createHash } from 'node:crypto';

/**
 * @typedef {'overview' | 'requirements' | 'options' | 'architecture' | 'data-api' | 'performance' | 'risks' | 'delivery'} TabId
 * @typedef {'error' | 'warning'} DiagnosticSeverity
 *
 * @typedef {Object} Diagnostic
 * @property {DiagnosticSeverity} severity
 * @property {string} code
 * @property {string} documentId
 * @property {number} [line]
 * @property {string} message
 *
 * @template T
 * @typedef {Object} Result
 * @property {T | null} value
 * @property {Diagnostic[]} diagnostics
 *
 * @typedef {Object} LinkTarget
 * @property {'internal' | 'external' | 'inert'} kind
 * @property {string} [tab]
 * @property {string} [documentId]
 * @property {string} [anchor]
 * @property {string} [url]
 * @property {string} [raw]
 * @property {string} [reason]
 *
 * @typedef {Object} InlineText
 * @property {'text'} type
 * @property {string} text
 *
 * @typedef {Object} InlineCode
 * @property {'code'} type
 * @property {string} text
 *
 * @typedef {Object} InlineStrong
 * @property {'strong'} type
 * @property {string} text
 *
 * @typedef {Object} InlineLink
 * @property {'link'} type
 * @property {string} text
 * @property {LinkTarget} target
 *
 * @typedef {InlineText | InlineCode | InlineStrong | InlineLink} Inline
 *
 * @typedef {Object} ListItem
 * @property {string} text
 * @property {boolean | null} [checked]
 * @property {Inline[]} content
 *
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {string} label
 * @property {string} [detail]
 * @property {string} [icon]
 * @property {number} lane
 * @property {number} order
 * @property {'actor' | 'service' | 'store' | 'queue' | 'external' | 'state'} role
 * @property {string} [evidence]
 *
 * @typedef {Object} GraphEdge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string} label
 * @property {'sync' | 'async' | 'data' | 'failure'} kind
 * @property {'forward' | 'top' | 'bottom'} [route]
 * @property {number} [track]
 *
 * @typedef {Object} GraphDiagram
 * @property {1} schemaVersion
 * @property {'graph'} type
 * @property {string} id
 * @property {string} title
 * @property {string} summary
 * @property {GraphNode[]} nodes
 * @property {GraphEdge[]} edges
 *
 * @typedef {Object} SequenceParticipant
 * @property {string} id
 * @property {string} label
 * @property {string} [role]
 * @property {string} [icon]
 *
 * @typedef {Object} SequenceMessage
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string} label
 * @property {'request' | 'response' | 'async' | 'failure'} kind
 * @property {string} [note]
 *
 * @typedef {Object} SequenceDiagram
 * @property {1} schemaVersion
 * @property {'sequence'} type
 * @property {string} id
 * @property {string} title
 * @property {string} summary
 * @property {SequenceParticipant[]} participants
 * @property {SequenceMessage[]} messages
 *
 * @typedef {GraphDiagram | SequenceDiagram} Diagram
 *
 * @typedef {Object} HeadingBlock
 * @property {'heading'} type
 * @property {1 | 2 | 3 | 4} level
 * @property {string} id
 * @property {string} text
 * @property {number} line
 *
 * @typedef {Object} ParagraphBlock
 * @property {'paragraph'} type
 * @property {Inline[]} content
 * @property {number} line
 *
 * @typedef {Object} ListBlock
 * @property {'list'} type
 * @property {boolean} ordered
 * @property {ListItem[]} items
 * @property {number} line
 *
 * @typedef {Object} TableBlock
 * @property {'table'} type
 * @property {Inline[][]} headers
 * @property {Inline[][][]} rows
 * @property {number} line
 *
 * @typedef {Object} CodeBlock
 * @property {'code'} type
 * @property {string} language
 * @property {string} text
 * @property {number} line
 *
 * @typedef {Object} QuoteBlock
 * @property {'quote'} type
 * @property {Inline[]} content
 * @property {number} line
 *
 * @typedef {Object} DiagramBlock
 * @property {'diagram'} type
 * @property {Diagram} diagram
 * @property {number} line
 *
 * @typedef {HeadingBlock | ParagraphBlock | ListBlock | TableBlock | CodeBlock | QuoteBlock | DiagramBlock} Block
 *
 * @typedef {Object} DocumentMeta
 * @property {string} id
 * @property {TabId} tab
 * @property {string} title
 * @property {string} path
 *
 * @typedef {Object} ProposalMeta
 * @property {1} schemaVersion
 * @property {string} id
 * @property {string} title
 * @property {'draft' | 'needs-input' | 'ready' | 'approved' | 'superseded'} status
 * @property {string} created
 * @property {string} updated
 * @property {string} owner
 * @property {string} summary
 * @property {DocumentMeta[]} documents
 *
 * @typedef {Object} SourceDocument
 * @property {string} id
 * @property {string} path
 * @property {string} source
 *
 * @typedef {Object} ReadBundle
 * @property {string} manifestPath
 * @property {SourceDocument[]} documents
 *
 * @typedef {Object} CompiledDocument
 * @property {string} id
 * @property {string} title
 * @property {string} path
 * @property {TabId | 'source'} tab
 * @property {string} source
 *
 * @typedef {Object} TabSection
 * @property {string} id
 * @property {Block[]} blocks
 *
 * @typedef {Object} CompiledTab
 * @property {TabId} id
 * @property {string} title
 * @property {TabSection[]} documents
 *
 * @typedef {Object} CompiledProposal
 * @property {1} schemaVersion
 * @property {string} version
 * @property {ProposalMeta} metadata
 * @property {CompiledDocument[]} documents
 * @property {CompiledTab[]} tabs
 * @property {Diagnostic[]} diagnostics
 */

export const CORE_TABS = Object.freeze([
  'overview',
  'requirements',
  'options',
  'architecture',
  'data-api',
  'performance',
  'risks',
  'delivery'
]);

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,63}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Checks whether an object contains prototype-poisoning keys.
 * @param {unknown} obj
 * @param {number} depth
 * @returns {boolean}
 */
function hasDangerousKeys(obj, depth = 0) {
  if (depth > 12 || !obj || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) return true;
    // @ts-ignore
    if (hasDangerousKeys(obj[key], depth + 1)) return true;
  }
  return false;
}

/**
 * Validates calendar date string (YYYY-MM-DD).
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidCalendarDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Parses proposal manifest metadata block from proposal.md.
 * @param {string} source
 * @returns {Result<ProposalMeta>}
 */
export function parseManifest(source) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  const metaFenceRegex = /```proposal-meta\r?\n([\s\S]*?)\r?\n```/g;
  const matches = [...source.matchAll(metaFenceRegex)];

  if (matches.length === 0) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Missing required ```proposal-meta fence in proposal manifest.'
    });
    return { value: null, diagnostics };
  }

  if (matches.length > 1) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Found multiple ```proposal-meta fences in manifest; exactly one is permitted.'
    });
    return { value: null, diagnostics };
  }

  const jsonContent = matches[0][1];
  if (Buffer.byteLength(jsonContent, 'utf8') > 32 * 1024) {
    diagnostics.push({
      severity: 'error',
      code: 'OVERSIZE',
      documentId: 'manifest',
      message: 'proposal-meta block exceeds 32 KiB size limit.'
    });
    return { value: null, diagnostics };
  }

  /** @type {any} */
  let parsed;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Invalid JSON in proposal-meta: ${err instanceof Error ? err.message : String(err)}`
    });
    return { value: null, diagnostics };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'proposal-meta root must be a JSON object.'
    });
    return { value: null, diagnostics };
  }

  if (hasDangerousKeys(parsed)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'proposal-meta contains forbidden object properties (__proto__, constructor, prototype).'
    });
    return { value: null, diagnostics };
  }

  const allowedMetaKeys = new Set([
    'schemaVersion',
    'id',
    'title',
    'status',
    'created',
    'updated',
    'owner',
    'summary',
    'documents'
  ]);
  for (const k of Object.keys(parsed)) {
    if (!allowedMetaKeys.has(k)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_METADATA',
        documentId: 'manifest',
        message: `Unknown key "${k}" in proposal-meta.`
      });
    }
  }

  if (parsed.schemaVersion !== 1) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Unsupported schemaVersion ${parsed.schemaVersion}. Only version 1 is supported.`
    });
  }

  if (typeof parsed.id !== 'string' || !SLUG_REGEX.test(parsed.id) || parsed.id === 'manifest') {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Invalid proposal id "${parsed.id}". Must be kebab-case slug [a-z][a-z0-9-]{1,63} and cannot be "manifest".`
    });
  }

  const validStatuses = new Set(['draft', 'needs-input', 'ready', 'approved', 'superseded']);
  if (!validStatuses.has(parsed.status)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Invalid status "${parsed.status}". Allowed: ${[...validStatuses].join(', ')}.`
    });
  }

  if (typeof parsed.created !== 'string' || !isValidCalendarDate(parsed.created)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Invalid created date "${parsed.created}". Must be valid YYYY-MM-DD.`
    });
  }

  if (typeof parsed.updated !== 'string' || !isValidCalendarDate(parsed.updated)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Invalid updated date "${parsed.updated}". Must be valid YYYY-MM-DD.`
    });
  } else if (parsed.created && parsed.updated < parsed.created) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Updated date "${parsed.updated}" cannot be earlier than created date "${parsed.created}".`
    });
  }

  if (typeof parsed.title !== 'string' || parsed.title.length === 0 || parsed.title.length > 120) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Title must be non-empty string <= 120 characters.'
    });
  }

  if (typeof parsed.owner !== 'string' || parsed.owner.length === 0 || parsed.owner.length > 120) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Owner must be non-empty string <= 120 characters.'
    });
  }

  if (typeof parsed.summary !== 'string' || parsed.summary.length === 0 || parsed.summary.length > 300) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Summary must be non-empty string <= 300 characters.'
    });
  }

  if (!Array.isArray(parsed.documents)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: 'Documents must be an array.'
    });
    return { value: null, diagnostics };
  }

  if (parsed.documents.length < 8 || parsed.documents.length > 23) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_METADATA',
      documentId: 'manifest',
      message: `Documents count must be between 8 and 23. Got ${parsed.documents.length}.`
    });
  }

  const seenDocIds = new Set();
  const seenDocPaths = new Set();
  const coveredTabs = new Set();

  for (let i = 0; i < parsed.documents.length; i++) {
    const doc = parsed.documents[i];
    if (!doc || typeof doc !== 'object') {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_METADATA',
        documentId: 'manifest',
        message: `Document entry at index ${i} is not an object.`
      });
      continue;
    }

    if (typeof doc.id !== 'string' || !SLUG_REGEX.test(doc.id) || doc.id === 'manifest') {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_METADATA',
        documentId: 'manifest',
        message: `Invalid document id "${doc.id}" at index ${i}.`
      });
    } else if (seenDocIds.has(doc.id)) {
      diagnostics.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        documentId: 'manifest',
        message: `Duplicate document id "${doc.id}" at index ${i}.`
      });
    } else {
      seenDocIds.add(doc.id);
    }

    if (!CORE_TABS.includes(doc.tab)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_METADATA',
        documentId: 'manifest',
        message: `Invalid tab "${doc.tab}" for document "${doc.id}".`
      });
    } else {
      coveredTabs.add(doc.tab);
    }

    if (typeof doc.title !== 'string' || doc.title.length === 0 || doc.title.length > 120) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_METADATA',
        documentId: 'manifest',
        message: `Document "${doc.id}" title must be non-empty string <= 120 characters.`
      });
    }

    if (typeof doc.path !== 'string') {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_PATH',
        documentId: 'manifest',
        message: `Document "${doc.id}" path must be a string.`
      });
    } else {
      // Must be POSIX sections/<slug>.md
      const pathNorm = doc.path.replace(/\\/g, '/');
      const validPathPattern = /^sections\/[a-zA-Z0-9_-]+\.md$/;
      if (!validPathPattern.test(pathNorm) || pathNorm.includes('..') || pathNorm.startsWith('/')) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_PATH',
          documentId: 'manifest',
          message: `Document "${doc.id}" path "${doc.path}" is invalid. Must be sections/<file>.md with no traversal.`
        });
      } else if (seenDocPaths.has(pathNorm)) {
        diagnostics.push({
          severity: 'error',
          code: 'DUPLICATE_PATH',
          documentId: 'manifest',
          message: `Duplicate document path "${doc.path}".`
        });
      } else {
        seenDocPaths.add(pathNorm);
      }
    }
  }

  for (const tab of CORE_TABS) {
    if (!coveredTabs.has(tab)) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_CORE_TAB',
        documentId: 'manifest',
        message: `Missing mandatory mapping for core tab "${tab}".`
      });
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    value: hasErrors ? null : parsed,
    diagnostics
  };
}

/**
 * Parse inline markdown tokens (code, strong, link, plain text).
 * @param {string} text
 * @param {string} documentId
 * @param {number} line
 * @param {Diagnostic[]} diagnostics
 * @returns {Inline[]}
 */
export function parseInlines(text, documentId, line, diagnostics) {
  /** @type {Inline[]} */
  const inlines = [];

  // Check for raw HTML warning
  if (/<[a-zA-Z][a-zA-Z0-9_-]*(?:\s+[^>]*?)?>|<\/[a-zA-Z][a-zA-Z0-9_-]*>/i.test(text)) {
    diagnostics.push({
      severity: 'warning',
      code: 'RAW_HTML_WARNING',
      documentId,
      line,
      message: 'Raw HTML detected; it will be rendered as inert text.'
    });
  }

  let idx = 0;
  const len = text.length;

  while (idx < len) {
    // Code: `code`
    if (text[idx] === '`') {
      const endTick = text.indexOf('`', idx + 1);
      if (endTick !== -1) {
        const codeContent = text.slice(idx + 1, endTick);
        inlines.push({ type: 'code', text: codeContent });
        idx = endTick + 1;
        continue;
      }
    }

    // Strong: **bold**
    if (text.startsWith('**', idx)) {
      const endStrong = text.indexOf('**', idx + 2);
      if (endStrong !== -1) {
        const strongContent = text.slice(idx + 2, endStrong);
        inlines.push({ type: 'strong', text: strongContent });
        idx = endStrong + 2;
        continue;
      }
    }

    // Link: [text](target)
    if (text[idx] === '[') {
      const closeBracket = text.indexOf(']', idx + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          const linkText = text.slice(idx + 1, closeBracket);
          const rawTarget = text.slice(closeBracket + 2, closeParen).trim();
          idx = closeParen + 1;

          /** @type {LinkTarget} */
          let target;
          if (rawTarget.startsWith('#')) {
            const anchor = rawTarget.slice(1);
            target = { kind: 'internal', anchor };
          } else if (rawTarget.startsWith('https://')) {
            target = { kind: 'external', url: rawTarget };
          } else {
            diagnostics.push({
              severity: 'warning',
              code: 'UNSAFE_LINK',
              documentId,
              line,
              message: `Unsafe or unsupported link scheme in "${rawTarget}"; rendered as inert.`
            });
            target = { kind: 'inert', raw: rawTarget, reason: 'unsupported scheme' };
          }

          inlines.push({ type: 'link', text: linkText, target });
          continue;
        }
      }
    }

    // Text chunk until next special char
    let nextSpecial = idx + 1;
    while (
      nextSpecial < len &&
      text[nextSpecial] !== '`' &&
      !text.startsWith('**', nextSpecial) &&
      text[nextSpecial] !== '['
    ) {
      nextSpecial++;
    }

    const chunk = text.slice(idx, nextSpecial);
    inlines.push({ type: 'text', text: chunk });
    idx = nextSpecial;
  }

  return inlines;
}

/**
 * Scans a markdown table row considering escaped pipes \|.
 * @param {string} line
 * @returns {string[]}
 */
export function scanTableRow(line) {
  const trimmed = line.trim();
  const content = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;

  const cells = [];
  let current = '';
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (escaped) {
    current += '\\';
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parses restricted Markdown string into AST blocks.
 * @param {string} source
 * @param {string} documentId
 * @returns {Result<Block[]>}
 */
export function parseMarkdown(source, documentId) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Block[]} */
  const blocks = [];

  const rawLines = source.split(/\r?\n/);
  let lineIdx = 0;
  let totalBlocks = 0;
  let totalInlines = 0;

  while (lineIdx < rawLines.length) {
    const rawLine = rawLines[lineIdx];
    const currentLineNum = lineIdx + 1;

    if (Buffer.byteLength(rawLine, 'utf8') > 8192) {
      diagnostics.push({
        severity: 'error',
        code: 'LINE_TOO_LONG',
        documentId,
        line: currentLineNum,
        message: 'Line exceeds 8 KiB length limit.'
      });
      lineIdx++;
      continue;
    }

    const trimmed = rawLine.trim();

    // Blank line
    if (trimmed.length === 0) {
      lineIdx++;
      continue;
    }

    // Fenced Code / Diagram Block
    if (trimmed.startsWith('```')) {
      const fenceLang = trimmed.slice(3).trim();
      let fenceEndIdx = -1;
      const codeLines = [];

      for (let j = lineIdx + 1; j < rawLines.length; j++) {
        if (rawLines[j].trim().startsWith('```')) {
          fenceEndIdx = j;
          break;
        }
        codeLines.push(rawLines[j]);
      }

      if (fenceEndIdx === -1) {
        diagnostics.push({
          severity: 'error',
          code: 'UNCLOSED_FENCE',
          documentId,
          line: currentLineNum,
          message: `Unclosed fenced code block starting with \`\`\`${fenceLang}.`
        });
        break;
      }

      const fenceContent = codeLines.join('\n');
      lineIdx = fenceEndIdx + 1;

      if (fenceLang === 'diagram-json') {
        if (Buffer.byteLength(fenceContent, 'utf8') > 32 * 1024) {
          diagnostics.push({
            severity: 'error',
            code: 'DIAGRAM_LIMIT',
            documentId,
            line: currentLineNum,
            message: 'diagram-json block exceeds 32 KiB size limit.'
          });
          continue;
        }

        let parsedDiagram;
        try {
          parsedDiagram = JSON.parse(fenceContent);
        } catch (err) {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_DIAGRAM',
            documentId,
            line: currentLineNum,
            message: `Malformed JSON in diagram-json: ${err instanceof Error ? err.message : String(err)}`
          });
          continue;
        }

        const diagResult = validateDiagram(parsedDiagram, { documentId, line: currentLineNum });
        diagnostics.push(...diagResult.diagnostics);
        if (diagResult.value) {
          blocks.push({
            type: 'diagram',
            diagram: diagResult.value,
            line: currentLineNum
          });
          totalBlocks++;
        }
        continue;
      }

      if (fenceLang === 'proposal-meta') {
        if (documentId !== 'manifest') {
          diagnostics.push({
            severity: 'error',
            code: 'UNEXPECTED_METADATA',
            documentId,
            line: currentLineNum,
            message: 'proposal-meta block is only permitted in root proposal manifest.'
          });
        }
        continue;
      }

      blocks.push({
        type: 'code',
        language: fenceLang,
        text: fenceContent,
        line: currentLineNum
      });
      totalBlocks++;
      continue;
    }

    // Headings (# H1 to #### H4)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = /** @type {1 | 2 | 3 | 4} */ (headingMatch[1].length);
      let headingText = headingMatch[2].trim();
      let headingId = '';

      // Check for explicit {#anchor}
      const anchorMatch = headingText.match(/\s+\{#([a-z0-9_-]+)\}$/);
      if (anchorMatch) {
        headingId = anchorMatch[1];
        headingText = headingText.slice(0, anchorMatch.index).trim();
      } else {
        // Fallback slug: include document ID and line ordinal to avoid collisions
        const baseSlug = headingText
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'h';
        headingId = `${documentId}-${baseSlug}-${currentLineNum}`;
      }

      blocks.push({
        type: 'heading',
        level,
        id: headingId,
        text: headingText,
        line: currentLineNum
      });
      totalBlocks++;
      lineIdx++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (lineIdx < rawLines.length && rawLines[lineIdx].trim().startsWith('>')) {
        const qLine = rawLines[lineIdx].trim().slice(1).trim();
        quoteLines.push(qLine);
        lineIdx++;
      }
      const quoteText = quoteLines.join(' ');
      const content = parseInlines(quoteText, documentId, currentLineNum, diagnostics);
      totalInlines += content.length;
      blocks.push({
        type: 'quote',
        content,
        line: currentLineNum
      });
      totalBlocks++;
      continue;
    }

    // Table: starts with | or contains | with a divider line following
    if (
      lineIdx + 1 < rawLines.length &&
      rawLines[lineIdx].includes('|') &&
      /^\s*\|?\s*:?---[-:]*\s*\|/.test(rawLines[lineIdx + 1])
    ) {
      const headerLine = rawLines[lineIdx];
      const headerCells = scanTableRow(headerLine);
      const colCount = headerCells.length;

      if (colCount > 10) {
        diagnostics.push({
          severity: 'error',
          code: 'TABLE_LIMIT',
          documentId,
          line: currentLineNum,
          message: `Table exceeds maximum 10 columns (found ${colCount}).`
        });
      }

      lineIdx += 2; // Skip header and divider
      const headers = headerCells.map((cell) => parseInlines(cell, documentId, currentLineNum, diagnostics));

      const rows = [];
      let rowCount = 0;
      while (lineIdx < rawLines.length && rawLines[lineIdx].trim().length > 0 && rawLines[lineIdx].includes('|')) {
        const rowCells = scanTableRow(rawLines[lineIdx]);
        rowCount++;
        if (rowCells.length !== colCount) {
          diagnostics.push({
            severity: 'error',
            code: 'MALFORMED_TABLE',
            documentId,
            line: lineIdx + 1,
            message: `Table row has ${rowCells.length} columns; expected ${colCount}.`
          });
        }
        if (rowCount <= 100) {
          rows.push(rowCells.map((cell) => parseInlines(cell, documentId, lineIdx + 1, diagnostics)));
        }
        lineIdx++;
      }

      if (rowCount > 100) {
        diagnostics.push({
          severity: 'error',
          code: 'TABLE_LIMIT',
          documentId,
          line: currentLineNum,
          message: `Table exceeds maximum 100 body rows (found ${rowCount}).`
        });
      }

      blocks.push({
        type: 'table',
        headers,
        rows,
        line: currentLineNum
      });
      totalBlocks++;
      continue;
    }

    // Lists (bullet, ordered, checkboxes)
    const listBulletMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/);
    if (listBulletMatch) {
      const isOrdered = /^\d+\./.test(listBulletMatch[1]);
      const items = [];

      while (lineIdx < rawLines.length) {
        const currLine = rawLines[lineIdx];
        const currTrim = currLine.trim();
        if (currTrim.length === 0) break;

        // Check for nested indentation
        if (currLine.search(/\S/) >= 2 && !/^([-*]|\d+\.)/.test(currTrim)) {
          diagnostics.push({
            severity: 'warning',
            code: 'UNSUPPORTED_SYNTAX',
            documentId,
            line: lineIdx + 1,
            message: 'Nested lists are not supported in restricted Markdown.'
          });
        }

        const match = currTrim.match(/^([-*]|\d+\.)\s+(.+)$/);
        if (!match) break;

        let itemText = match[2].trim();
        let checked = null;

        const checkMatch = itemText.match(/^\[([ xX])\]\s+(.+)$/);
        if (checkMatch) {
          checked = checkMatch[1].toLowerCase() === 'x';
          itemText = checkMatch[2].trim();
        }

        const content = parseInlines(itemText, documentId, lineIdx + 1, diagnostics);
        totalInlines += content.length;
        items.push({ text: itemText, checked, content });
        lineIdx++;
      }

      blocks.push({
        type: 'list',
        ordered: isOrdered,
        items,
        line: currentLineNum
      });
      totalBlocks++;
      continue;
    }

    // Paragraph (accumulate consecutive non-blank lines)
    const paragraphLines = [];
    while (
      lineIdx < rawLines.length &&
      rawLines[lineIdx].trim().length > 0 &&
      !rawLines[lineIdx].trim().startsWith('```') &&
      !rawLines[lineIdx].trim().startsWith('#') &&
      !rawLines[lineIdx].trim().startsWith('>') &&
      !/^([-*]|\d+\.)\s+/.test(rawLines[lineIdx].trim())
    ) {
      paragraphLines.push(rawLines[lineIdx].trim());
      lineIdx++;
    }

    const pText = paragraphLines.join(' ');
    const content = parseInlines(pText, documentId, currentLineNum, diagnostics);
    totalInlines += content.length;

    blocks.push({
      type: 'paragraph',
      content,
      line: currentLineNum
    });
    totalBlocks++;
  }

  if (totalBlocks > 2000) {
    diagnostics.push({
      severity: 'error',
      code: 'AST_LIMIT',
      documentId,
      message: `Total blocks (${totalBlocks}) exceeded maximum limit 2000.`
    });
  }

  if (totalInlines > 20000) {
    diagnostics.push({
      severity: 'error',
      code: 'INLINE_LIMIT',
      documentId,
      message: `Total inline nodes (${totalInlines}) exceeded maximum limit 20000.`
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    value: hasErrors ? null : blocks,
    diagnostics
  };
}

/**
 * Validates a parsed diagram JSON block.
 * @param {unknown} value
 * @param {{ documentId: string; line: number }} context
 * @returns {Result<Diagram>}
 */
export function validateDiagram(value, context) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: 'Diagram must be a JSON object.'
    });
    return { value: null, diagnostics };
  }

  if (hasDangerousKeys(value)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: 'Diagram contains forbidden properties (__proto__, constructor, prototype).'
    });
    return { value: null, diagnostics };
  }

  /** @type {any} */
  const d = value;

  if (d.schemaVersion !== 1) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: `Diagram schemaVersion must be 1. Got ${d.schemaVersion}.`
    });
  }

  if (typeof d.id !== 'string' || !SLUG_REGEX.test(d.id)) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: `Invalid diagram id "${d.id}". Must be kebab-case slug.`
    });
  }

  if (typeof d.title !== 'string' || d.title.length === 0 || d.title.length > 120) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: 'Diagram title must be non-empty string <= 120 characters.'
    });
  }

  if (typeof d.summary !== 'string' || d.summary.length === 0 || d.summary.length > 300) {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: 'Diagram summary must be non-empty string <= 300 characters.'
    });
  }

  if (d.type === 'graph') {
    if (!Array.isArray(d.nodes)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_DIAGRAM',
        documentId: context.documentId,
        line: context.line,
        message: 'Graph diagram nodes must be an array.'
      });
      return { value: null, diagnostics };
    }

    if (d.nodes.length > 12) {
      diagnostics.push({
        severity: 'error',
        code: 'DIAGRAM_LIMIT',
        documentId: context.documentId,
        line: context.line,
        message: `Graph diagram exceeded maximum 12 nodes (got ${d.nodes.length}).`
      });
    }

    const nodeIds = new Set();
    const cellPositions = new Set();
    const validRoles = new Set(['actor', 'service', 'store', 'queue', 'external', 'state']);

    for (let i = 0; i < d.nodes.length; i++) {
      const n = d.nodes[i];
      if (!n || typeof n !== 'object') continue;

      if (typeof n.id !== 'string' || !SLUG_REGEX.test(n.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Invalid node id "${n.id}" at index ${i}.`
        });
      } else if (nodeIds.has(n.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'DUPLICATE_ID',
          documentId: context.documentId,
          line: context.line,
          message: `Duplicate node id "${n.id}".`
        });
      } else {
        nodeIds.add(n.id);
      }

      if (typeof n.label !== 'string' || n.label.length === 0 || n.label.length > 48) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" label must be non-empty string <= 48 characters.`
        });
      }

      if (n.detail && (typeof n.detail !== 'string' || n.detail.length > 120)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" detail must be string <= 120 characters.`
        });
      }

      if (n.icon !== undefined && (typeof n.icon !== 'string' || n.icon.length === 0 || n.icon.length > 32)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" icon must be string <= 32 characters.`
        });
      }

      if (n.lane !== undefined && (typeof n.lane !== 'number' || !Number.isInteger(n.lane) || n.lane < 0 || n.lane > 4)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" lane must be integer between 0 and 4.`
        });
      }

      if (n.order !== undefined && (typeof n.order !== 'number' || !Number.isInteger(n.order) || n.order < 0 || n.order > 3)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" order must be integer between 0 and 3.`
        });
      }

      if (n.lane !== undefined && n.order !== undefined) {
        const cellKey = `${n.lane},${n.order}`;
        if (cellPositions.has(cellKey)) {
          diagnostics.push({
            severity: 'error',
            code: 'INVALID_DIAGRAM',
            documentId: context.documentId,
            line: context.line,
            message: `Multiple nodes occupy lane ${n.lane}, order ${n.order}.`
          });
        } else {
          cellPositions.add(cellKey);
        }
      }

      const role = n.role || 'service';
      if (!validRoles.has(role)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Node "${n.id}" role "${n.role}" is invalid. Allowed: ${[...validRoles].join(', ')}.`
        });
      }
    }

    if (!Array.isArray(d.edges)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_DIAGRAM',
        documentId: context.documentId,
        line: context.line,
        message: 'Graph diagram edges must be an array.'
      });
      return { value: null, diagnostics };
    }

    if (d.edges.length > 18) {
      diagnostics.push({
        severity: 'error',
        code: 'DIAGRAM_LIMIT',
        documentId: context.documentId,
        line: context.line,
        message: `Graph diagram exceeded maximum 18 edges (got ${d.edges.length}).`
      });
    }

    const edgeIds = new Set();
    const validKinds = new Set(['sync', 'async', 'data', 'failure']);
    const validRoutes = new Set(['forward', 'top', 'bottom']);

    for (let i = 0; i < d.edges.length; i++) {
      const e = d.edges[i];
      if (!e || typeof e !== 'object') continue;

      if (typeof e.id !== 'string' || !SLUG_REGEX.test(e.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Invalid edge id "${e.id}" at index ${i}.`
        });
      } else if (edgeIds.has(e.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'DUPLICATE_ID',
          documentId: context.documentId,
          line: context.line,
          message: `Duplicate edge id "${e.id}".`
        });
      } else {
        edgeIds.add(e.id);
      }

      if (!nodeIds.has(e.from)) {
        diagnostics.push({
          severity: 'error',
          code: 'UNKNOWN_REFERENCE',
          documentId: context.documentId,
          line: context.line,
          message: `Edge "${e.id}" references non-existent from node "${e.from}".`
        });
      }

      if (!nodeIds.has(e.to)) {
        diagnostics.push({
          severity: 'error',
          code: 'UNKNOWN_REFERENCE',
          documentId: context.documentId,
          line: context.line,
          message: `Edge "${e.id}" references non-existent to node "${e.to}".`
        });
      }

      if (typeof e.label !== 'string' || e.label.length === 0 || e.label.length > 60) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Edge "${e.id}" label must be non-empty string <= 60 characters.`
        });
      }

      const kind = e.kind || 'sync';
      if (!validKinds.has(kind)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Edge "${e.id}" kind "${e.kind}" is invalid. Allowed: ${[...validKinds].join(', ')}.`
        });
      }

      if (e.route && !validRoutes.has(e.route)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Edge "${e.id}" route "${e.route}" is invalid. Allowed: ${[...validRoutes].join(', ')}.`
        });
      }

      // Self-edge requires explicit route top or bottom
      if (e.from === e.to && e.route !== 'top' && e.route !== 'bottom') {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Self-edge "${e.id}" on node "${e.from}" requires explicit route "top" or "bottom".`
        });
      }
    }
  } else if (d.type === 'sequence') {
    if (!Array.isArray(d.participants)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_DIAGRAM',
        documentId: context.documentId,
        line: context.line,
        message: 'Sequence diagram participants must be an array.'
      });
      return { value: null, diagnostics };
    }

    if (d.participants.length > 6) {
      diagnostics.push({
        severity: 'error',
        code: 'DIAGRAM_LIMIT',
        documentId: context.documentId,
        line: context.line,
        message: `Sequence diagram exceeded maximum 6 participants (got ${d.participants.length}).`
      });
    }

    const participantIds = new Set();
    for (let i = 0; i < d.participants.length; i++) {
      const p = d.participants[i];
      if (!p || typeof p !== 'object') continue;

      if (typeof p.id !== 'string' || !SLUG_REGEX.test(p.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Invalid participant id "${p.id}" at index ${i}.`
        });
      } else if (participantIds.has(p.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'DUPLICATE_ID',
          documentId: context.documentId,
          line: context.line,
          message: `Duplicate participant id "${p.id}".`
        });
      } else {
        participantIds.add(p.id);
      }

      if (typeof p.label !== 'string' || p.label.length === 0 || p.label.length > 48) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Participant "${p.id}" label must be non-empty string <= 48 characters.`
        });
      }

      if (p.icon !== undefined && (typeof p.icon !== 'string' || p.icon.length === 0 || p.icon.length > 32)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Participant "${p.id}" icon must be string <= 32 characters.`
        });
      }
    }

    if (!Array.isArray(d.messages)) {
      diagnostics.push({
        severity: 'error',
        code: 'INVALID_DIAGRAM',
        documentId: context.documentId,
        line: context.line,
        message: 'Sequence diagram messages must be an array.'
      });
      return { value: null, diagnostics };
    }

    if (d.messages.length > 14) {
      diagnostics.push({
        severity: 'error',
        code: 'DIAGRAM_LIMIT',
        documentId: context.documentId,
        line: context.line,
        message: `Sequence diagram exceeded maximum 14 messages (got ${d.messages.length}).`
      });
    }

    const messageIds = new Set();
    const validMsgKinds = new Set(['request', 'response', 'async', 'failure']);

    for (let i = 0; i < d.messages.length; i++) {
      const m = d.messages[i];
      if (!m || typeof m !== 'object') continue;

      if (typeof m.id !== 'string' || !SLUG_REGEX.test(m.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Invalid message id "${m.id}" at index ${i}.`
        });
      } else if (messageIds.has(m.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'DUPLICATE_ID',
          documentId: context.documentId,
          line: context.line,
          message: `Duplicate message id "${m.id}".`
        });
      } else {
        messageIds.add(m.id);
      }

      if (!participantIds.has(m.from)) {
        diagnostics.push({
          severity: 'error',
          code: 'UNKNOWN_REFERENCE',
          documentId: context.documentId,
          line: context.line,
          message: `Message "${m.id}" references unknown from participant "${m.from}".`
        });
      }

      if (!participantIds.has(m.to)) {
        diagnostics.push({
          severity: 'error',
          code: 'UNKNOWN_REFERENCE',
          documentId: context.documentId,
          line: context.line,
          message: `Message "${m.id}" references unknown to participant "${m.to}".`
        });
      }

      if (typeof m.label !== 'string' || m.label.length === 0 || m.label.length > 80) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Message "${m.id}" label must be non-empty string <= 80 characters.`
        });
      }

      if (!validMsgKinds.has(m.kind)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Message "${m.id}" kind "${m.kind}" is invalid. Allowed: ${[...validMsgKinds].join(', ')}.`
        });
      }

      if (m.note && (typeof m.note !== 'string' || m.note.length > 160)) {
        diagnostics.push({
          severity: 'error',
          code: 'INVALID_DIAGRAM',
          documentId: context.documentId,
          line: context.line,
          message: `Message "${m.id}" note must be string <= 160 characters.`
        });
      }
    }
  } else {
    diagnostics.push({
      severity: 'error',
      code: 'INVALID_DIAGRAM',
      documentId: context.documentId,
      line: context.line,
      message: `Invalid diagram type "${d.type}". Allowed: "graph" or "sequence".`
    });
  }

  const hasErrors = diagnostics.some((item) => item.severity === 'error');
  return {
    value: hasErrors ? null : d,
    diagnostics
  };
}

/**
 * Compiles a read bundle into a validated CompiledProposal model.
 * @param {ReadBundle} input
 * @returns {Result<CompiledProposal>}
 */
export function compileBundle(input) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];

  const manifestDoc = input.documents.find((d) => d.id === 'manifest');
  if (!manifestDoc) {
    diagnostics.push({
      severity: 'error',
      code: 'MISSING_MANIFEST',
      documentId: 'manifest',
      message: 'Manifest document not found in bundle input.'
    });
    return { value: null, diagnostics };
  }

  const manifestRes = parseManifest(manifestDoc.source);
  diagnostics.push(...manifestRes.diagnostics);

  if (!manifestRes.value) {
    return { value: null, diagnostics };
  }

  const meta = manifestRes.value;

  // Track known anchors and tabs for internal link resolution
  const knownAnchors = new Set([...CORE_TABS, 'manifest']);
  const parsedSections = new Map();

  for (const docMeta of meta.documents) {
    knownAnchors.add(docMeta.id);
    const sourceDoc = input.documents.find((d) => d.id === docMeta.id);
    if (!sourceDoc) {
      diagnostics.push({
        severity: 'error',
        code: 'MISSING_DOCUMENT',
        documentId: docMeta.id,
        message: `Listed document "${docMeta.id}" (${docMeta.path}) was not loaded.`
      });
      continue;
    }

    const mdRes = parseMarkdown(sourceDoc.source, docMeta.id);
    diagnostics.push(...mdRes.diagnostics);
    if (mdRes.value) {
      parsedSections.set(docMeta.id, mdRes.value);
      // Collect heading IDs
      for (const block of mdRes.value) {
        if (block.type === 'heading') {
          if (knownAnchors.has(block.id)) {
            diagnostics.push({
              severity: 'error',
              code: 'DUPLICATE_ID',
              documentId: docMeta.id,
              line: block.line,
              message: `Duplicate anchor id "${block.id}".`
            });
          } else {
            knownAnchors.add(block.id);
          }
        }
      }
    }
  }

  // Verify internal links across all parsed blocks
  for (const [docId, blocks] of parsedSections.entries()) {
    for (const b of blocks) {
      const inlinesToCheck = [];
      if (b.type === 'paragraph' || b.type === 'quote') {
        inlinesToCheck.push(...b.content);
      } else if (b.type === 'list') {
        for (const item of b.items) inlinesToCheck.push(...item.content);
      } else if (b.type === 'table') {
        for (const col of b.headers) inlinesToCheck.push(...col);
        for (const row of b.rows) {
          for (const cell of row) inlinesToCheck.push(...cell);
        }
      }

      for (const inl of inlinesToCheck) {
        if (inl.type === 'link' && inl.target.kind === 'internal') {
          const anchor = inl.target.anchor || '';
          if (!knownAnchors.has(anchor)) {
            diagnostics.push({
              severity: 'error',
              code: 'UNKNOWN_ANCHOR',
              documentId: docId,
              line: b.line,
              message: `Link targets non-existent anchor or tab "#${anchor}".`
            });
          }
        }
      }
    }
  }

  // Calculate deterministic version hash
  // Hash covers: schemaVersion + length-delimited document IDs + exact raw UTF-8 bytes
  const hasher = createHash('sha256');
  hasher.update(`v1:${input.documents.length}`);

  // Sort document list deterministically by ID for the hash
  const sortedDocs = [...input.documents].sort((a, b) => a.id.localeCompare(b.id));
  for (const doc of sortedDocs) {
    hasher.update(`\n---doc:${doc.id}:${Buffer.byteLength(doc.source, 'utf8')}\n`);
    hasher.update(doc.source);
  }
  const versionHash = hasher.digest('hex');

  // Build compiled documents list (including manifest)
  /** @type {CompiledDocument[]} */
  const compiledDocuments = [
    {
      id: 'manifest',
      title: meta.title,
      path: 'proposal.md',
      tab: 'source',
      source: manifestDoc.source
    }
  ];

  for (const docMeta of meta.documents) {
    const sDoc = input.documents.find((d) => d.id === docMeta.id);
    compiledDocuments.push({
      id: docMeta.id,
      title: docMeta.title,
      path: docMeta.path,
      tab: docMeta.tab,
      source: sDoc ? sDoc.source : ''
    });
  }

  // Build compiled tabs (the 8 core tabs)
  /** @type {CompiledTab[]} */
  const compiledTabs = CORE_TABS.map((tabId) => {
    const matchingDocs = meta.documents.filter((d) => d.tab === tabId);
    return {
      id: tabId,
      title: tabId.charAt(0).toUpperCase() + tabId.slice(1).replace('-', ' & '),
      documents: matchingDocs.map((d) => ({
        id: d.id,
        blocks: parsedSections.get(d.id) || []
      }))
    };
  });

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    value: hasErrors
      ? null
      : {
          schemaVersion: 1,
          version: versionHash,
          metadata: meta,
          documents: compiledDocuments,
          tabs: compiledTabs,
          diagnostics
        },
    diagnostics
  };
}

/**
 * Pure derived helper for viewer metadata navigation index.
 * Maps heading IDs to { tabId, documentId } and document IDs to owning tabId.
 *
 * @param {any} compiled
 * @returns {{ anchors: Record<string, { tabId: string, documentId: string }>, documents: Record<string, string> }}
 */
export function buildNavigationIndex(compiled) {
  /** @type {Record<string, { tabId: string, documentId: string }>} */
  const anchors = {};
  /** @type {Record<string, string>} */
  const documents = {};

  const target = compiled?.value || compiled;
  if (!target) {
    documents.manifest = 'source';
    return { anchors, documents };
  }

  // Populate document -> tabId mapping (manifest maps to 'source')
  if (Array.isArray(target.documents)) {
    for (const doc of target.documents) {
      if (doc && doc.id) {
        documents[doc.id] = doc.id === 'manifest' ? 'source' : (doc.tab || 'source');
      }
    }
  } else if (target.metadata && Array.isArray(target.metadata.documents)) {
    for (const doc of target.metadata.documents) {
      if (doc && doc.id) {
        documents[doc.id] = doc.tab || 'source';
      }
    }
  }
  documents.manifest = 'source';

  // Populate heading anchors -> { tabId, documentId } from parsed blocks across all documents/tabs
  if (Array.isArray(target.tabs)) {
    for (const tab of target.tabs) {
      const tabId = tab.id;
      if (Array.isArray(tab.documents)) {
        for (const doc of tab.documents) {
          const docId = doc.id;
          if (Array.isArray(doc.blocks)) {
            for (const block of doc.blocks) {
              if (block && block.type === 'heading' && block.id) {
                anchors[block.id] = { tabId, documentId: docId };
              }
            }
          }
        }
      }
    }
  }

  return { anchors, documents };
}

