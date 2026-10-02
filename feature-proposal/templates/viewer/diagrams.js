// @ts-check
/**
 * @file Native lightweight SVG diagram generator (Graph and Sequence diagrams).
 * Zero external libraries, DOM/SVG text-safe creation, Prism Garden palette.
 * Bounded viewBox containers, compact geometry, collision-free routing and accessible table alternatives.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string | number>} attrs
 * @returns {SVGElement}
 */
function createSvgElement(tag, attrs = {}) {
  const elem = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) elem.setAttribute(k, String(attrs[k]));
  return elem;
}

/**
 * Return role badge accent color with Prism Garden palette.
 * @param {string} role
 * @returns {string}
 */
function getRoleBadgeColor(role) {
  switch (role) {
    case 'actor': return '#3f3026';
    case 'service': return '#15018d';
    case 'store': return '#28766F';
    case 'queue': return '#e55a08';
    case 'external': return '#c96a4a';
    case 'state': return '#3b7346';
    default: return '#15018d';
  }
}

const p = (d, c, w = 1.5, fill = 'none') => ({ tag: 'path', attrs: { d, fill, stroke: c, 'stroke-width': w } });
const r = (x, y, width, height, c, rx = 2, fill = 'none', w = 1.5) => ({ tag: 'rect', attrs: { x, y, width, height, rx, fill, stroke: c, 'stroke-width': w } });
const ci = (cx, cy, rad, c, fill = 'none', w = 1.5) => ({ tag: 'circle', attrs: { cx, cy, r: rad, fill, stroke: c, 'stroke-width': w } });
const ln = (x1, y1, x2, y2, c, w = 1.5) => ({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: c, 'stroke-width': w } });
const el = (cx, cy, rx, ry, c, w = 1.5) => ({ tag: 'ellipse', attrs: { cx, cy, rx, ry, fill: 'none', stroke: c, 'stroke-width': w } });

/**
 * System design icon registry.
 * 20 canonical system design and architecture vector icons.
 * @type {Record<string, { color: string; tileBg: string; tileBorder: string; draw: (color: string) => Array<{ tag: string; attrs: Record<string, string | number> }> }>}
 */
export const SYSTEM_ICONS = {
  database: {
    color: '#2563EB', tileBg: '#2563EB1F', tileBorder: '#2563EB59',
    draw: (c) => [el(12, 6, 7.5, 3, c, 1.6), p('M4.5 6v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 11.5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3', c, 1.6)]
  },
  redis: {
    color: '#DC2626', tileBg: '#DC26261F', tileBorder: '#DC262659',
    draw: (c) => [p('M12 3l8 4-8 4-8-4z', c, 1.5, c + '33'), p('M4 11l8 4 8-4M4 16l8 4 8-4', c, 1.5)]
  },
  cdn: {
    color: '#0284C7', tileBg: '#0284C71F', tileBorder: '#0284C759',
    draw: (c) => [ci(12, 12, 8, c), ln(4, 12, 20, 12, c, 1.2), el(12, 12, 3.5, 8, c, 1.2)]
  },
  browser: {
    color: '#4F46E5', tileBg: '#4F46E51F', tileBorder: '#4F46E559',
    draw: (c) => [r(3, 4, 18, 16, c), ln(3, 9, 21, 9, c, 1.2), ci(6, 6.5, 1, c, c), ci(9, 6.5, 1, c, c)]
  },
  'app-server': {
    color: '#EA580C', tileBg: '#EA580C1F', tileBorder: '#EA580C59',
    draw: (c) => [r(6, 6, 12, 12, c, 2, c + '2E', 1.6), p('M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4', c, 1.4)]
  },
  server: {
    color: '#D97706', tileBg: '#D977061F', tileBorder: '#D9770659',
    draw: (c) => [r(3, 4, 18, 6, c, 1.5), r(3, 14, 18, 6, c, 1.5), ln(6, 7, 12, 7, c, 1.3), ci(17, 7, 1, c, c), ln(6, 17, 12, 17, c, 1.3), ci(17, 17, 1, c, c)]
  },
  'load-balancer': {
    color: '#7C3AED', tileBg: '#7C3AED1F', tileBorder: '#7C3AED59',
    draw: (c) => [ci(5, 12, 2.5, c, c), ci(19, 6, 2, c, c), ci(19, 12, 2, c, c), ci(19, 18, 2, c, c), p('M7.5 12h4.5c2 0 3-6 5-6M7.5 12h9.5M7.5 12h4.5c2 0 3 6 5 6', c, 1.5)]
  },
  'api-gateway': {
    color: '#0284C7', tileBg: '#0284C71F', tileBorder: '#0284C759',
    draw: (c) => [p('M4 21V10a8 8 0 0116 0v11', c, 1.6), p('M8 21v-9a4 4 0 018 0v9', c, 1.2), ln(9, 15, 15, 15, c, 1.5)]
  },
  queue: {
    color: '#B45309', tileBg: '#B453091F', tileBorder: '#B4530959',
    draw: (c) => [p('M2 7h20M2 17h20', c, 1.6), r(5, 8.5, 3.5, 7, c, 1, c), r(10.5, 8.5, 3.5, 7, c, 1, c), r(16, 8.5, 3.5, 7, c, 1, c)]
  },
  external: {
    color: '#0D9488', tileBg: '#0D94881F', tileBorder: '#0D948859',
    draw: (c) => [ci(12, 12, 7, c, 'none', 1.6), p('M12 2v3m0 14v3M2 12h3m14 0h3', c, 2)]
  },
  storage: {
    color: '#059669', tileBg: '#0596691F', tileBorder: '#05966959',
    draw: (c) => [el(12, 6.5, 7, 2.8, c, 1.6), p('M5 6.5l1 11.5c.2 1.5 2.5 3 6 3s5.8-1.5 6-3l1-11.5', c, 1.6)]
  },
  auth: {
    color: '#BE123C', tileBg: '#BE123C1F', tileBorder: '#BE123C59',
    draw: (c) => [p('M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z', c, 1.6, c + '26'), ci(12, 10.5, 1.6, c, c), ln(12, 12, 12, 15, c, 1.6)]
  },
  worker: {
    color: '#854D0E', tileBg: '#854D0E1F', tileBorder: '#854D0E59',
    draw: (c) => [ci(12, 12, 7.5, c), p('M12 8v4.5l3 2', c)]
  },
  search: {
    color: '#4338CA', tileBg: '#4338CA1F', tileBorder: '#4338CA59',
    draw: (c) => [ci(10.5, 10.5, 6, c, 'none', 1.6), ln(15, 15, 21, 21, c, 2)]
  },
  metrics: {
    color: '#15803D', tileBg: '#15803D1F', tileBorder: '#15803D59',
    draw: (c) => [r(3, 3.5, 18, 17, c, 2), p('M5 12h3l2-5 3 10 2-7 2 2h2', c)]
  },
  notification: {
    color: '#C2410C', tileBg: '#C2410C1F', tileBorder: '#C2410C59',
    draw: (c) => [r(3, 5, 18, 14, c, 2), p('M3 6l9 7 9-7', c)]
  },
  container: {
    color: '#0369A1', tileBg: '#0369A11F', tileBorder: '#0369A159',
    draw: (c) => [p('M12 3l8 4.5v9L12 21l-8-4.5v-9z', c, 1.5, c + '26'), p('M12 3v18M12 12l8-4.5M12 12L4 7.5', c, 1.3)]
  },
  state: {
    color: '#4F7658', tileBg: '#4F76581F', tileBorder: '#4F765859',
    draw: (c) => [ci(12, 5.5, 2.5, c, c), ci(18, 17, 2.5, c, c), ci(6, 17, 2.5, c, c), p('M13.5 7l3 7.5M15 17H9M7.5 14.5l3-7.5', c, 1.4)]
  },
  user: {
    color: '#7A5B7E', tileBg: '#7A5B7E1F', tileBorder: '#7A5B7E59',
    draw: (c) => [ci(12, 7.5, 4, c, 'none', 1.6), p('M4.5 20c0-4.5 3.5-6.5 7.5-6.5s7.5 2 7.5 6.5', c, 1.6)]
  },
  network: {
    color: '#2563EB', tileBg: '#2563EB1F', tileBorder: '#2563EB59',
    draw: (c) => [ci(12, 12, 8, c), ln(4, 12, 20, 12, c, 1.2), el(12, 12, 3.5, 8, c, 1.2)]
  }
};

/**
 * Synonyms and alternate keys mapped to canonical system design icons.
 * @type {Record<string, string>}
 */
export const ICON_ALIASES = {};
[
  ['database', 'sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'db'],
  ['redis', 'cache', 'memcached', 'inmemory'],
  ['cdn', 'edge', 'cloudflare', 'cloudfront'],
  ['browser', 'client', 'frontend', 'ui', 'web', 'webapp'],
  ['app-server', 'compute', 'processor', 'core'],
  ['server', 'backend', 'webserver', 'web-server'],
  ['load-balancer', 'balancer', 'loadbalancer', 'lb', 'proxy'],
  ['api-gateway', 'gateway', 'ingress'],
  ['queue', 'kafka', 'rabbitmq', 'sqs', 'pubsub', 'eventbus'],
  ['external', 'thirdparty', 'third-party', 'webhook', 'partner'],
  ['storage', 's3', 'blob', 'bucket', 'disk'],
  ['auth', 'security', 'firewall', 'iam'],
  ['worker', 'cron', 'job', 'runner', 'scheduler'],
  ['search', 'elasticsearch', 'vector', 'elastic'],
  ['metrics', 'telemetry', 'monitoring', 'monitor', 'datadog'],
  ['notification', 'email', 'mail', 'sms', 'alert'],
  ['container', 'docker', 'k8s', 'kubernetes', 'pod'],
  ['state', 'workflow', 'statemachine', 'saga', 'pipeline'],
  ['user', 'actor', 'human', 'persona'],
  ['network', 'dns', 'internet']
].forEach(([target, ...aliases]) => {
  for (const a of aliases) ICON_ALIASES[a] = target;
});

const ICON_PATTERNS = [
  ['cdn', /\b(cdn|cloudflare|cloudfront|edge|fastly|akamai)\b/i],
  ['redis', /\b(redis|memcached?|cache|caching|in[\s-]?memory|valkey|keydb)\b/i],
  ['database', /\b(postgres(ql)?|mysql|mariadb|sqlite|oracle|cockroach|sql|relational|rdbms|db|database)\b/i],
  ['queue', /\b(kafka|rabbitmq|sqs|queue|pubsub|event[\s-]?bus|buffer|nats|pulsar|amqp)\b/i],
  ['load-balancer', /\b(load[\s-]?balancer|balancer|lb|nginx|haproxy|envoy|alb|nlb|reverse[\s-]?proxy)\b/i],
  ['api-gateway', /\b(api[\s-]?gateway|gateway|kong|traefik|ingress)\b/i],
  ['browser', /\b(browser|web[\s-]?client|frontend|client|ui|webapp|web[\s-]?app|spa|mobile[\s-]?app)\b/i],
  ['app-server', /\b(app[\s-]?server|application[\s-]?server|compute|core[\s-]?service|processor|lambda|serverless)\b/i],
  ['server', /\b(server|web[\s-]?server|backend|node|api[\s-]?service|backend[\s-]?service)\b/i],
  ['storage', /\b(s3|blob|bucket|gcs|object[\s-]?store|storage|filestore|disk)\b/i],
  ['auth', /\b(auth|oauth|auth0|cognito|security|firewall|iam|shield|jwt|sso|login)\b/i],
  ['worker', /\b(cron|worker|runner|job|scheduler|batch|task)\b/i],
  ['search', /\b(elastic(search)?|opensearch|solr|search|vector[\s-]?db|milvus|pinecone|weaviate)\b/i],
  ['metrics', /\b(metrics|telemetry|monitor(ing)?|datadog|prometheus|grafana|stats|logs|logger)\b/i],
  ['notification', /\b(email|mailer|mail|sendgrid|smtp|notification|sms|twilio|alert|push)\b/i],
  ['container', /\b(docker|k8s|kubernetes|container|pod|helm)\b/i],
  ['state', /\b(state|statemachine|workflow|temporal|step[\s-]?function|saga|pipeline)\b/i],
  ['external', /\b(external|third[\s-]?party|partner|stripe|vendor|webhook|remote)\b/i],
  ['network', /\b(dns|route53|network|internet|wan|lan)\b/i],
  ['user', /\b(user|actor|persona|admin|customer|operator|human)\b/i]
];

/**
 * Resolves the system design icon identifier for a node or participant.
 * @param {{ id?: string; label?: string; detail?: string; role?: string; icon?: string }} item
 * @returns {string} Icon identifier
 */
export function resolveSystemIcon(item) {
  if (item.icon) {
    const raw = item.icon.toLowerCase().trim();
    if (ICON_ALIASES[raw]) return ICON_ALIASES[raw];
    if (SYSTEM_ICONS[raw]) return raw;
  }
  const text = `${item.id || ''} ${item.label || ''} ${item.detail || ''} ${item.role || ''}`.toLowerCase();

  for (const [key, re] of ICON_PATTERNS) {
    if (re.test(text)) return key;
  }

  switch (item.role) {
    case 'store': return 'database';
    case 'queue': return 'queue';
    case 'actor': return 'user';
    case 'external': return 'external';
    case 'state': return 'state';
    default: return 'server';
  }
}

/**
 * Returns color theme (accent color, tile background, tile border) for an icon.
 * @param {string} iconKey
 * @param {string} [fallbackRole]
 * @returns {{ color: string; tileBg: string; tileBorder: string }}
 */
export function getSystemIconTheme(iconKey, fallbackRole) {
  const normKey = (iconKey || '').toLowerCase().trim();
  const resolved = ICON_ALIASES[normKey] || (SYSTEM_ICONS[normKey] ? normKey : null);
  if (resolved && SYSTEM_ICONS[resolved]) {
    const def = SYSTEM_ICONS[resolved];
    return { color: def.color, tileBg: def.tileBg, tileBorder: def.tileBorder };
  }
  const roleColor = getRoleBadgeColor(fallbackRole || 'service');
  return { color: roleColor, tileBg: `${roleColor}1F`, tileBorder: `${roleColor}59` };
}

/**
 * Creates an SVG group element rendering the system design icon.
 * @param {string} iconKey
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} [customColor]
 * @returns {SVGElement}
 */
export function createSystemIconElement(iconKey, x, y, size = 24, customColor = null) {
  const normKey = (iconKey || '').toLowerCase().trim();
  const resolved = ICON_ALIASES[normKey] || (SYSTEM_ICONS[normKey] ? normKey : 'server');
  const iconDef = SYSTEM_ICONS[resolved] || SYSTEM_ICONS.server;
  const color = customColor || iconDef.color;

  const g = createSvgElement('g', {
    transform: `translate(${x}, ${y}) scale(${size / 24})`,
    class: `system-icon system-icon-${resolved}`
  });

  const shapes = iconDef.draw(color);
  for (const shape of shapes) {
    g.appendChild(createSvgElement(shape.tag, shape.attrs));
  }
  return g;
}

function truncateText(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function getEdgeColor(kind) {
  switch (kind) {
    case 'failure': return '#c94a4a';
    case 'data': return '#15018d';
    case 'async': return '#e55a08';
    case 'sync': return '#28766F';
    default: return '#707070';
  }
}

function createTextWithTitle(text, attrs, titleText) {
  const el = createSvgElement('text', attrs);
  el.textContent = text;
  if (titleText) {
    const tip = createSvgElement('title');
    tip.textContent = titleText;
    el.appendChild(tip);
  }
  return el;
}

function appendArrowMarkers(defs, prefix, list, size = 6) {
  for (const m of list) {
    const marker = createSvgElement('marker', {
      id: `${prefix}-${m.id}`, viewBox: '0 0 10 10', refX: 8, refY: 5,
      markerWidth: size, markerHeight: size, orient: 'auto-start-reverse'
    });
    marker.appendChild(createSvgElement('path', { d: 'M 0 1.5 L 8 5 L 0 8.5 z', fill: m.color }));
    defs.appendChild(marker);
  }
}

/**
 * Computes deterministic columns and rows for graph nodes.
 * @param {import('../../scripts/format.mjs').GraphDiagram} graph
 * @returns {{ nodeCols: Map<string, number>; nodeRows: Map<string, number> }}
 */
function computeGraphLayout(graph) {
  const nodes = graph.nodes;
  const edges = graph.edges || [];
  const hasExplicitGrid = nodes.every((n) => typeof n.lane === 'number' && typeof n.order === 'number');

  const nodeCols = new Map();
  const nodeRows = new Map();

  if (hasExplicitGrid) {
    const uniqueLanes = Array.from(new Set(nodes.map((n) => n.lane))).sort((a, b) => a - b);
    const laneMap = new Map();
    uniqueLanes.forEach((lane, idx) => laneMap.set(lane, idx));
    for (const n of nodes) {
      nodeCols.set(n.id, laneMap.get(n.lane) ?? n.lane);
      nodeRows.set(n.id, n.order);
    }
  } else {
    const inDegree = new Map(nodes.map((n) => [n.id, 0]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) {
      if (e.from !== e.to) {
        adj.get(e.from)?.push(e.to);
        inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      }
    }
    const ranks = new Map();
    const queue = [];
    for (const n of nodes) {
      if ((inDegree.get(n.id) || 0) === 0) {
        ranks.set(n.id, 0);
        queue.push(n.id);
      }
    }
    for (const n of nodes) {
      if (!ranks.has(n.id)) {
        ranks.set(n.id, 0);
        queue.push(n.id);
      }
    }
    while (queue.length > 0) {
      const curr = queue.shift();
      const currRank = ranks.get(curr) || 0;
      for (const next of (adj.get(curr) || [])) {
        const nextRank = Math.max(ranks.get(next) || 0, currRank + 1);
        if (nextRank !== ranks.get(next)) {
          ranks.set(next, nextRank);
          queue.push(next);
        }
      }
    }
    const colGroups = new Map();
    for (const n of nodes) {
      const col = Math.min(4, ranks.get(n.id) || 0);
      if (!colGroups.has(col)) colGroups.set(col, []);
      colGroups.get(col).push(n.id);
    }
    for (const [col, ids] of colGroups) {
      ids.forEach((id, rowIdx) => {
        nodeCols.set(id, col);
        nodeRows.set(id, Math.min(3, rowIdx));
      });
    }
  }
  return { nodeCols, nodeRows };
}

/**
 * Calculates orthogonal edge route and label positioning.
 */
function getEdgeRoute(edge, fromCoord, toCoord, exitY, crossIdx, cardW, cardH) {
  if (edge.from === edge.to) {
    const rx = fromCoord.cx;
    const isBot = edge.route === 'bottom';
    const ry = isBot ? fromCoord.y + cardH : fromCoord.y;
    const delta = isBot ? 28 : -28;
    return {
      d: `M ${rx - 18} ${ry} C ${rx - 32} ${ry + delta}, ${rx + 32} ${ry + delta}, ${rx + 18} ${ry}`,
      lx: rx, ly: ry + delta / 1.3
    };
  }
  if (edge.route === 'top' || edge.route === 'bottom') {
    const isTop = edge.route === 'top';
    const yEdge = isTop ? Math.min(fromCoord.y, toCoord.y) - 24 : Math.max(fromCoord.y + cardH, toCoord.y + cardH) + 24;
    const fromY = isTop ? fromCoord.y : fromCoord.y + cardH;
    const toY = isTop ? toCoord.y : toCoord.y + cardH;
    return {
      d: `M ${fromCoord.cx} ${fromY} L ${fromCoord.cx} ${yEdge} L ${toCoord.cx} ${yEdge} L ${toCoord.cx} ${toY}`,
      lx: (fromCoord.cx + toCoord.cx) / 2, ly: isTop ? yEdge - 10 : yEdge + 10
    };
  }
  if (fromCoord.col < toCoord.col) {
    const startX = fromCoord.x + cardW;
    const endX = toCoord.x;
    if (fromCoord.row === toCoord.row) {
      return { d: `M ${startX} ${fromCoord.cy} L ${endX} ${toCoord.cy}`, lx: (startX + endX) / 2, ly: fromCoord.cy };
    }
    const stepX = startX + 26 + (crossIdx % 3) * 18;
    return { d: `M ${startX} ${exitY} L ${stepX} ${exitY} L ${stepX} ${toCoord.cy} L ${endX} ${toCoord.cy}`, lx: (stepX + endX) / 2, ly: toCoord.cy };
  }
  if (fromCoord.col === toCoord.col) {
    if (fromCoord.row < toCoord.row) {
      return { d: `M ${fromCoord.cx} ${fromCoord.y + cardH} L ${toCoord.cx} ${toCoord.y}`, lx: fromCoord.cx, ly: (fromCoord.y + cardH + toCoord.y) / 2 };
    }
    const bypassX = fromCoord.x + cardW + 36;
    return { d: `M ${fromCoord.x + cardW} ${fromCoord.cy} L ${bypassX} ${fromCoord.cy} L ${bypassX} ${toCoord.cy} L ${toCoord.x + cardW} ${toCoord.cy}`, lx: bypassX + 24, ly: (fromCoord.cy + toCoord.cy) / 2 };
  }
  const botY = Math.max(fromCoord.y + cardH, toCoord.y + cardH) + 26;
  return {
    d: `M ${fromCoord.cx} ${fromCoord.y + cardH} L ${fromCoord.cx} ${botY} L ${toCoord.cx} ${botY} L ${toCoord.cx} ${toCoord.y + cardH}`,
    lx: (fromCoord.cx + toCoord.cx) / 2, ly: botY + 10
  };
}

/**
 * Renders graph diagram SVG with clean orthogonal routing and bounded viewBox.
 * @param {import('../../scripts/format.mjs').GraphDiagram} graph
 * @returns {{ svg: SVGElement; width: number; height: number }}
 */
function renderGraphSvg(graph) {
  const { nodeCols, nodeRows } = computeGraphLayout(graph);
  const maxCol = Math.max(0, ...Array.from(nodeCols.values()));
  const maxRow = Math.max(0, ...Array.from(nodeRows.values()));

  let maxEdgeLabelLen = 0;
  for (const edge of (graph.edges || [])) {
    if (edge.label && edge.label.length > maxEdgeLabelLen) {
      maxEdgeLabelLen = edge.label.length;
    }
  }

  const CARD_WIDTH = 210;
  const CARD_HEIGHT = 68;
  const COL_GAP = Math.min(160, Math.max(90, Math.ceil(maxEdgeLabelLen * 6.5 + 24)));
  const ROW_GAP = 60;
  const MARGIN_X = 36;
  const MARGIN_Y = 32;

  const COL_WIDTH = CARD_WIDTH + COL_GAP;
  const ROW_HEIGHT = CARD_HEIGHT + ROW_GAP;

  let width = (maxCol + 1) * COL_WIDTH - COL_GAP + MARGIN_X * 2;
  let height = (maxRow + 1) * ROW_HEIGHT - ROW_GAP + MARGIN_Y * 2;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    class: 'diagram-svg',
    role: 'img',
    'aria-label': graph.title
  });
  svg.style.maxWidth = `${width}px`;
  svg.style.display = 'block';

  // Markers
  const defs = createSvgElement('defs');
  appendArrowMarkers(defs, `arrow-${graph.id}`, [
    { id: 'sync', color: '#28766F' },
    { id: 'data', color: '#15018d' },
    { id: 'async', color: '#e55a08' },
    { id: 'failure', color: '#c94a4a' },
    { id: 'default', color: '#707070' }
  ], 7);
  svg.appendChild(defs);

  const gEdges = createSvgElement('g', { class: 'layer-edges' });
  const gNodes = createSvgElement('g', { class: 'layer-nodes' });
  const gLabels = createSvgElement('g', { class: 'layer-labels' });
  svg.append(gEdges, gNodes, gLabels);

  const nodeCoords = new Map();
  for (const n of graph.nodes) {
    const col = nodeCols.get(n.id) || 0;
    const row = nodeRows.get(n.id) || 0;
    const x = MARGIN_X + col * COL_WIDTH;
    const y = MARGIN_Y + row * ROW_HEIGHT;
    nodeCoords.set(n.id, {
      id: n.id, x, y, cx: x + CARD_WIDTH / 2, cy: y + CARD_HEIGHT / 2,
      width: CARD_WIDTH, height: CARD_HEIGHT, col, row,
      role: n.role || 'service', label: n.label, detail: n.detail, icon: n.icon
    });
  }

  const labelPlacements = [];
  const outgoingMap = new Map();
  for (const edge of (graph.edges || [])) {
    if (!outgoingMap.has(edge.from)) outgoingMap.set(edge.from, []);
    outgoingMap.get(edge.from)?.push(edge);
  }

  for (const [_, edges] of outgoingMap) {
    const count = edges.length;
    let crossIdx = 0;
    edges.forEach((edge, k) => {
      const fromCoord = nodeCoords.get(edge.from);
      const toCoord = nodeCoords.get(edge.to);
      if (!fromCoord || !toCoord) return;

      const strokeColor = getEdgeColor(edge.kind);
      const markerId = `arrow-${graph.id}-${edge.kind || 'default'}`;
      const strokeDash = edge.kind === 'async' ? '4,4' : 'none';

      let exitY = fromCoord.cy;
      if (count > 1) {
        const span = Math.min(32, (count - 1) * 12);
        exitY = fromCoord.cy - span / 2 + k * (span / (count - 1));
      }

      const route = getEdgeRoute(edge, fromCoord, toCoord, exitY, crossIdx++, CARD_WIDTH, CARD_HEIGHT);
      gEdges.appendChild(createSvgElement('path', {
        d: route.d, fill: 'none', stroke: strokeColor, 'stroke-width': 1.6,
        'stroke-dasharray': strokeDash, 'marker-end': `url(#${markerId})`
      }));

      if (edge.label) {
        labelPlacements.push({
          id: edge.id, label: edge.label, x: route.lx, y: route.ly,
          width: Math.max(48, Math.ceil(edge.label.length * 6.5 + 16)), height: 18, strokeColor
        });
      }
    });
  }

  // Adjust SVG bounds if labels extend beyond margin
  for (const lp of labelPlacements) {
    if (lp.y + lp.height / 2 + MARGIN_Y > height) height = Math.ceil(lp.y + lp.height / 2 + MARGIN_Y);
    if (lp.x + lp.width / 2 + MARGIN_X > width) width = Math.ceil(lp.x + lp.width / 2 + MARGIN_X);
  }
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.maxWidth = `${width}px`;

  // Draw Edge Label Pills
  for (const lp of labelPlacements) {
    const gLabel = createSvgElement('g', { class: 'edge-label-group' });
    gLabel.appendChild(createSvgElement('rect', {
      x: lp.x - lp.width / 2, y: lp.y - lp.height / 2, width: lp.width, height: lp.height,
      rx: 2, fill: 'var(--bg-surface, #FFF9F2)', stroke: lp.strokeColor, 'stroke-width': 1, class: 'edge-label-pill'
    }));
    const labelText = createSvgElement('text', {
      x: lp.x, y: lp.y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-family': 'var(--font-mono)', 'font-size': '9.5px', 'font-weight': '500', fill: lp.strokeColor
    });
    labelText.textContent = lp.label;
    gLabel.appendChild(labelText);
    gLabels.appendChild(gLabel);
  }

  // Draw Node Cards
  for (const [_, coord] of nodeCoords) {
    const iconKey = resolveSystemIcon(coord);
    const iconTheme = getSystemIconTheme(iconKey, coord.role);
    const g = createSvgElement('g', { class: `diagram-node node-${coord.role} node-icon-${iconKey}`, id: `node-${graph.id}-${coord.id}`, tabindex: 0 });

    g.appendChild(createSvgElement('rect', { x: coord.x, y: coord.y, width: coord.width, height: coord.height, rx: 4, fill: 'var(--bg-surface, #FFF9F2)', stroke: 'var(--border-color, #958D9E)', 'stroke-width': 1.2, class: 'diagram-node-card' }));
    g.appendChild(createSvgElement('rect', { x: coord.x + 1, y: coord.y + 1, width: coord.width - 2, height: 2.5, rx: 1, fill: iconTheme.color }));

    const tileX = coord.x + 8;
    const tileY = coord.y + 12;
    g.appendChild(createSvgElement('rect', { x: tileX, y: tileY, width: 36, height: 36, rx: 4, fill: iconTheme.tileBg, stroke: iconTheme.tileBorder, 'stroke-width': 1, class: 'diagram-node-tile' }));
    g.appendChild(createSystemIconElement(iconKey, tileX + 7, tileY + 7, 22, iconTheme.color));

    const contentX = coord.x + 50;
    const roleText = coord.role.toUpperCase();
    const badgeW = Math.max(roleText.length * 6 + 12, 44);
    g.appendChild(createSvgElement('rect', { x: contentX, y: coord.y + 11, width: badgeW, height: 14, rx: 2, fill: iconTheme.tileBg, stroke: iconTheme.tileBorder, 'stroke-width': 0.75 }));
    const roleEl = createSvgElement('text', { x: contentX + badgeW / 2, y: coord.y + 18.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': 'var(--font-mono)', 'font-size': '8px', 'font-weight': '700', fill: iconTheme.color });
    roleEl.textContent = roleText;
    g.appendChild(roleEl);

    g.appendChild(createTextWithTitle(truncateText(coord.label, 18), {
      x: contentX, y: coord.detail ? coord.y + 38 : coord.y + 44,
      'font-family': 'var(--font-sans)', 'font-size': '12px', 'font-weight': '600', fill: 'var(--text-bright, #121017)'
    }, coord.label));

    if (coord.detail) {
      g.appendChild(createTextWithTitle(truncateText(coord.detail, 20), {
        x: contentX, y: coord.y + 53,
        'font-family': 'var(--font-mono)', 'font-size': '9.5px', 'font-weight': '400', fill: 'var(--text-muted, #524E5B)'
      }, coord.detail));
    }
    gNodes.appendChild(g);
  }

  return { svg, width, height };
}

/**
 * Creates accessible text alternative details block for diagrams.
 * @param {string} summaryText
 * @param {string[]} headers
 * @param {Array<Array<string | { text: string; className?: string }>>} rows
 * @returns {HTMLElement}
 */
function renderTextAltTable(summaryText, headers, rows) {
  const details = document.createElement('details');
  details.className = 'accordion diagram-table-alt';
  details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'accordion-summary';
  summary.textContent = summaryText;
  details.appendChild(summary);

  const content = document.createElement('div');
  content.className = 'accordion-content';
  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'table-wrapper';
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  for (const title of headers) {
    const th = document.createElement('th');
    th.textContent = title;
    hRow.appendChild(th);
  }
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      if (typeof cell === 'object' && cell !== null) {
        if (cell.className) td.className = cell.className;
        td.textContent = cell.text;
      } else {
        td.textContent = String(cell ?? '');
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  content.appendChild(tableWrapper);
  details.appendChild(content);
  return details;
}

/**
 * Accessible text alternative table for graph diagrams.
 * @param {import('../../scripts/format.mjs').GraphDiagram} graph
 * @returns {HTMLElement}
 */
function renderGraphTextAlt(graph) {
  return renderTextAltTable(
    'View diagram text alternative (nodes & connections)',
    ['ID', 'Icon', 'Role', 'Label', 'Detail'],
    graph.nodes.map((n) => [
      { text: n.id, className: 'cell-id' },
      resolveSystemIcon(n),
      n.role || 'service',
      n.label,
      n.detail || '--'
    ])
  );
}

/**
 * Renders sequence diagram SVG with clean lifelines and message arrows.
 * @param {import('../../scripts/format.mjs').SequenceDiagram} seq
 * @returns {{ svg: SVGElement; width: number; height: number }}
 */
function renderSequenceSvg(seq) {
  const COL_WIDTH = 150;
  const ROW_HEIGHT = 44;
  const MARGIN_X = 36;
  const MARGIN_TOP = 64;
  const MARGIN_BOTTOM = 24;

  const width = Math.max(480, seq.participants.length * COL_WIDTH + MARGIN_X);
  const height = MARGIN_TOP + seq.messages.length * ROW_HEIGHT + MARGIN_BOTTOM;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    class: 'diagram-svg',
    role: 'img',
    'aria-label': seq.title
  });
  svg.style.maxWidth = `${width}px`;
  svg.style.display = 'block';

  const svgDesc = createSvgElement('desc', { id: `seq-desc-${seq.id}` });
  svgDesc.textContent = seq.summary;
  svg.appendChild(svgDesc);

  const defs = createSvgElement('defs');
  appendArrowMarkers(defs, `seq-arr-${seq.id}`, [
    { id: 'req', color: '#15018d' },
    { id: 'res', color: '#28766F' },
    { id: 'async', color: '#e55a08' },
    { id: 'fail', color: '#c94a4a' }
  ], 6);
  svg.appendChild(defs);

  const gLifelines = createSvgElement('g', { class: 'seq-lifelines' });
  const gParticipants = createSvgElement('g', { class: 'seq-participants' });
  const gMsgLines = createSvgElement('g', { class: 'seq-lines' });
  const gMsgLabels = createSvgElement('g', { class: 'seq-labels' });
  svg.append(gLifelines, gParticipants, gMsgLines, gMsgLabels);

  const pX = new Map();
  const partBoxWidth = 130;
  const boxH = 42;

  seq.participants.forEach((pItem, idx) => {
    const x = MARGIN_X + idx * COL_WIDTH + COL_WIDTH / 2;
    pX.set(pItem.id, x);

    gLifelines.appendChild(createSvgElement('line', {
      x1: x, y1: MARGIN_TOP, x2: x, y2: height - 12,
      stroke: 'var(--border-color, #958D9E)', 'stroke-width': 1.5, 'stroke-dasharray': '4,4'
    }));

    const boxX = x - partBoxWidth / 2;
    const boxY = 14;
    const iconKey = resolveSystemIcon(pItem);
    const iconTheme = getSystemIconTheme(iconKey, pItem.role);
    const gBox = createSvgElement('g', { class: `seq-participant seq-icon-${iconKey}`, id: `participant-${seq.id}-${pItem.id}`, tabindex: 0 });

    gBox.appendChild(createSvgElement('rect', { x: boxX, y: boxY, width: partBoxWidth, height: boxH, rx: 4, fill: 'var(--bg-surface, #FFF9F2)', stroke: 'var(--border-color, #958D9E)', 'stroke-width': 1.2, class: 'seq-participant-card' }));
    gBox.appendChild(createSvgElement('rect', { x: boxX + 1, y: boxY + 1, width: partBoxWidth - 2, height: 2.5, rx: 1, fill: iconTheme.color }));

    gBox.appendChild(createSvgElement('rect', { x: boxX + 6, y: boxY + 8, width: 26, height: 26, rx: 3, fill: iconTheme.tileBg, stroke: iconTheme.tileBorder, 'stroke-width': 0.75 }));
    gBox.appendChild(createSystemIconElement(iconKey, boxX + 10, boxY + 12, 18, iconTheme.color));

    gBox.appendChild(createTextWithTitle(truncateText(pItem.label, 13), {
      x: boxX + 38, y: boxY + 22, 'dominant-baseline': 'central',
      'font-family': 'var(--font-sans)', 'font-size': '11.5px', 'font-weight': '600', fill: 'var(--text-bright, #121017)'
    }, pItem.label));

    gParticipants.appendChild(gBox);
  });

  seq.messages.forEach((msg, idx) => {
    const fromX = pX.get(msg.from);
    const toX = pX.get(msg.to);
    if (fromX === undefined || toX === undefined) return;

    const y = MARGIN_TOP + 16 + idx * ROW_HEIGHT;
    const isAsync = msg.kind === 'async';
    const isResponse = msg.kind === 'response';
    const isFailure = msg.kind === 'failure';
    const strokeColor = isFailure ? '#B65368' : isResponse ? '#28766F' : isAsync ? '#9B6A22' : '#51679F';
    const markerId = isFailure ? `seq-arr-${seq.id}-fail` : isResponse ? `seq-arr-${seq.id}-res` : isAsync ? `seq-arr-${seq.id}-async` : `seq-arr-${seq.id}-req`;
    const dashArray = isResponse || isAsync ? '4,4' : 'none';

    if (msg.from === msg.to) {
      gMsgLines.appendChild(createSvgElement('path', {
        d: `M ${fromX} ${y - 8} L ${fromX + 28} ${y - 8} L ${fromX + 28} ${y + 8} L ${fromX} ${y + 8}`,
        fill: 'none', stroke: strokeColor, 'stroke-width': 1.6, 'marker-end': `url(#${markerId})`
      }));
      const labelText = createSvgElement('text', {
        x: fromX + 34, y, 'dominant-baseline': 'central', 'font-family': 'var(--font-mono)', 'font-size': '9.5px', 'font-weight': '500', fill: strokeColor
      });
      labelText.textContent = msg.label;
      gMsgLabels.appendChild(labelText);
    } else {
      gMsgLines.appendChild(createSvgElement('line', {
        x1: fromX, y1: y, x2: toX, y2: y, stroke: strokeColor, 'stroke-width': 1.6, 'stroke-dasharray': dashArray, 'marker-end': `url(#${markerId})`
      }));

      const labelX = (fromX + toX) / 2;
      const approxWidth = Math.max(44, Math.ceil(msg.label.length * 6.5 + 14));
      gMsgLabels.appendChild(createSvgElement('rect', {
        x: labelX - approxWidth / 2, y: y - 9, width: approxWidth, height: 18, rx: 2,
        fill: 'var(--bg-surface, #FFF9F2)', stroke: strokeColor, 'stroke-width': 1
      }));
      const labelText = createSvgElement('text', {
        x: labelX, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'var(--font-mono)', 'font-size': '9.5px', 'font-weight': '500', fill: strokeColor
      });
      labelText.textContent = msg.label;
      gMsgLabels.appendChild(labelText);
    }
  });

  return { svg, width, height };
}

/**
 * Accessible text alternative table for sequence diagrams.
 * @param {import('../../scripts/format.mjs').SequenceDiagram} seq
 * @returns {HTMLElement}
 */
function renderSequenceTextAlt(seq) {
  return renderTextAltTable(
    'View diagram text alternative (sequence messages)',
    ['Seq', 'From', 'To', 'Kind', 'Message'],
    seq.messages.map((msg, idx) => [
      { text: String(idx + 1), className: 'cell-id' },
      msg.from,
      msg.to,
      msg.kind || 'request',
      msg.label
    ])
  );
}

/**
 * Renders a validated Diagram into a clean, lightweight presentation container.
 * @param {import('../../scripts/format.mjs').Diagram} diagram
 * @returns {HTMLElement}
 */
export function renderDiagram(diagram) {
  const frame = document.createElement('div');
  frame.className = 'diagram-frame';
  frame.id = `diagram-${diagram.id}`;

  const toolbar = document.createElement('div');
  toolbar.className = 'diagram-toolbar';

  const infoGroup = document.createElement('div');
  infoGroup.className = 'diagram-info-group';

  const typePill = document.createElement('span');
  typePill.className = `diagram-type-pill pill-type-${diagram.type}`;
  typePill.textContent = diagram.type === 'graph' ? 'GRAPH' : 'SEQUENCE';
  infoGroup.appendChild(typePill);

  const title = document.createElement('span');
  title.className = 'diagram-title';
  title.textContent = diagram.title;
  infoGroup.appendChild(title);

  if (diagram.summary) {
    const summary = document.createElement('span');
    summary.className = 'diagram-summary';
    summary.textContent = `— ${diagram.summary}`;
    infoGroup.appendChild(summary);
  }
  toolbar.appendChild(infoGroup);

  const actionsGroup = document.createElement('div');
  actionsGroup.className = 'diagram-actions';

  const btnCopy = document.createElement('button');
  btnCopy.className = 'btn-copy-svg';
  btnCopy.type = 'button';
  btnCopy.textContent = 'Copy SVG';
  btnCopy.title = 'Copy raw SVG to clipboard';

  const svgElement = diagram.type === 'graph'
    ? renderGraphSvg(diagram).svg
    : renderSequenceSvg(diagram).svg;

  btnCopy.addEventListener('click', async () => {
    try {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svgElement);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(svgStr);
        btnCopy.textContent = 'Copied!';
        setTimeout(() => { btnCopy.textContent = 'Copy SVG'; }, 1800);
      }
    } catch {
      btnCopy.textContent = 'Failed';
      setTimeout(() => { btnCopy.textContent = 'Copy SVG'; }, 1800);
    }
  });

  actionsGroup.appendChild(btnCopy);
  toolbar.appendChild(actionsGroup);
  frame.appendChild(toolbar);

  const viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';
  viewport.appendChild(svgElement);
  frame.appendChild(viewport);

  if (diagram.type === 'graph') {
    frame.appendChild(renderGraphTextAlt(diagram));
  } else {
    frame.appendChild(renderSequenceTextAlt(diagram));
  }

  return frame;
}
