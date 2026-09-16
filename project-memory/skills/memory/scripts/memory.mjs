#!/usr/bin/env node

// src/cli.ts
import { readFile as readFile3 } from "node:fs/promises";
import { basename as basename3, resolve as resolve3 } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// src/bundle.ts
import { createHash as createHash2, randomUUID } from "node:crypto";
import { cp, open, lstat as lstat2, mkdir, mkdtemp, readFile as readFile2, readdir as readdir2, realpath as realpath2, rename, rm, stat as stat2, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename as basename2, dirname as dirname2, extname as extname2, join as join2, relative as relative2, resolve as resolve2, sep as sep2 } from "node:path";

// node_modules/yaml/browser/dist/nodes/identity.js
var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
function isCollection(node) {
  if (node && typeof node === "object")
    switch (node[NODE_TYPE]) {
      case MAP:
      case SEQ:
        return true;
    }
  return false;
}
function isNode(node) {
  if (node && typeof node === "object")
    switch (node[NODE_TYPE]) {
      case ALIAS:
      case MAP:
      case SCALAR:
      case SEQ:
        return true;
    }
  return false;
}
var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;

// node_modules/yaml/browser/dist/visit.js
var BREAK = /* @__PURE__ */ Symbol("break visit");
var SKIP = /* @__PURE__ */ Symbol("skip children");
var REMOVE = /* @__PURE__ */ Symbol("remove node");
function visit(node, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node)) {
    const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
    if (cd === REMOVE)
      node.contents = null;
  } else
    visit_(null, node, visitor_, Object.freeze([]));
}
visit.BREAK = BREAK;
visit.SKIP = SKIP;
visit.REMOVE = REMOVE;
function visit_(key, node, visitor, path) {
  const ctrl = callVisitor(key, node, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visit_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node)) {
      path = Object.freeze(path.concat(node));
      for (let i = 0; i < node.items.length; ++i) {
        const ci = visit_(i, node.items[i], visitor, path);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node.items.splice(i, 1);
          i -= 1;
        }
      }
    } else if (isPair(node)) {
      path = Object.freeze(path.concat(node));
      const ck = visit_("key", node.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node.key = null;
      const cv = visit_("value", node.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node.value = null;
    }
  }
  return ctrl;
}
async function visitAsync(node, visitor) {
  const visitor_ = initVisitor(visitor);
  if (isDocument(node)) {
    const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
    if (cd === REMOVE)
      node.contents = null;
  } else
    await visitAsync_(null, node, visitor_, Object.freeze([]));
}
visitAsync.BREAK = BREAK;
visitAsync.SKIP = SKIP;
visitAsync.REMOVE = REMOVE;
async function visitAsync_(key, node, visitor, path) {
  const ctrl = await callVisitor(key, node, visitor, path);
  if (isNode(ctrl) || isPair(ctrl)) {
    replaceNode(key, path, ctrl);
    return visitAsync_(key, ctrl, visitor, path);
  }
  if (typeof ctrl !== "symbol") {
    if (isCollection(node)) {
      path = Object.freeze(path.concat(node));
      for (let i = 0; i < node.items.length; ++i) {
        const ci = await visitAsync_(i, node.items[i], visitor, path);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK)
          return BREAK;
        else if (ci === REMOVE) {
          node.items.splice(i, 1);
          i -= 1;
        }
      }
    } else if (isPair(node)) {
      path = Object.freeze(path.concat(node));
      const ck = await visitAsync_("key", node.key, visitor, path);
      if (ck === BREAK)
        return BREAK;
      else if (ck === REMOVE)
        node.key = null;
      const cv = await visitAsync_("value", node.value, visitor, path);
      if (cv === BREAK)
        return BREAK;
      else if (cv === REMOVE)
        node.value = null;
    }
  }
  return ctrl;
}
function initVisitor(visitor) {
  if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
    return Object.assign({
      Alias: visitor.Node,
      Map: visitor.Node,
      Scalar: visitor.Node,
      Seq: visitor.Node
    }, visitor.Value && {
      Map: visitor.Value,
      Scalar: visitor.Value,
      Seq: visitor.Value
    }, visitor.Collection && {
      Map: visitor.Collection,
      Seq: visitor.Collection
    }, visitor);
  }
  return visitor;
}
function callVisitor(key, node, visitor, path) {
  if (typeof visitor === "function")
    return visitor(key, node, path);
  if (isMap(node))
    return visitor.Map?.(key, node, path);
  if (isSeq(node))
    return visitor.Seq?.(key, node, path);
  if (isPair(node))
    return visitor.Pair?.(key, node, path);
  if (isScalar(node))
    return visitor.Scalar?.(key, node, path);
  if (isAlias(node))
    return visitor.Alias?.(key, node, path);
  return void 0;
}
function replaceNode(key, path, node) {
  const parent = path[path.length - 1];
  if (isCollection(parent)) {
    parent.items[key] = node;
  } else if (isPair(parent)) {
    if (key === "key")
      parent.key = node;
    else
      parent.value = node;
  } else if (isDocument(parent)) {
    parent.contents = node;
  } else {
    const pt = isAlias(parent) ? "alias" : "scalar";
    throw new Error(`Cannot replace node with ${pt} parent`);
  }
}

// node_modules/yaml/browser/dist/doc/directives.js
var escapeChars = {
  "!": "%21",
  ",": "%2C",
  "[": "%5B",
  "]": "%5D",
  "{": "%7B",
  "}": "%7D"
};
var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
var Directives = class _Directives {
  constructor(yaml, tags) {
    this.docStart = null;
    this.docEnd = false;
    this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
    this.tags = Object.assign({}, _Directives.defaultTags, tags);
  }
  clone() {
    const copy = new _Directives(this.yaml, this.tags);
    copy.docStart = this.docStart;
    return copy;
  }
  /**
   * During parsing, get a Directives instance for the current document and
   * update the stream state according to the current version's spec.
   */
  atDocument() {
    const res = new _Directives(this.yaml, this.tags);
    switch (this.yaml.version) {
      case "1.1":
        this.atNextDocument = true;
        break;
      case "1.2":
        this.atNextDocument = false;
        this.yaml = {
          explicit: _Directives.defaultYaml.explicit,
          version: "1.2"
        };
        this.tags = Object.assign({}, _Directives.defaultTags);
        break;
    }
    return res;
  }
  /**
   * @param onError - May be called even if the action was successful
   * @returns `true` on success
   */
  add(line, onError) {
    if (this.atNextDocument) {
      this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
      this.tags = Object.assign({}, _Directives.defaultTags);
      this.atNextDocument = false;
    }
    const parts = line.trim().split(/[ \t]+/);
    const name = parts.shift();
    switch (name) {
      case "%TAG": {
        if (parts.length !== 2) {
          onError(0, "%TAG directive should contain exactly two parts");
          if (parts.length < 2)
            return false;
        }
        const [handle, prefix] = parts;
        this.tags[handle] = prefix;
        return true;
      }
      case "%YAML": {
        this.yaml.explicit = true;
        if (parts.length !== 1) {
          onError(0, "%YAML directive should contain exactly one part");
          return false;
        }
        const [version] = parts;
        if (version === "1.1" || version === "1.2") {
          this.yaml.version = version;
          return true;
        } else {
          const isValid = /^\d+\.\d+$/.test(version);
          onError(6, `Unsupported YAML version ${version}`, isValid);
          return false;
        }
      }
      default:
        onError(0, `Unknown directive ${name}`, true);
        return false;
    }
  }
  /**
   * Resolves a tag, matching handles to those defined in %TAG directives.
   *
   * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
   *   `'!local'` tag, or `null` if unresolvable.
   */
  tagName(source, onError) {
    if (source === "!")
      return "!";
    if (source[0] !== "!") {
      onError(`Not a valid tag: ${source}`);
      return null;
    }
    if (source[1] === "<") {
      const verbatim = source.slice(2, -1);
      if (verbatim === "!" || verbatim === "!!") {
        onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
        return null;
      }
      if (source[source.length - 1] !== ">")
        onError("Verbatim tags must end with a >");
      return verbatim;
    }
    const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
    if (!suffix)
      onError(`The ${source} tag has no suffix`);
    const prefix = this.tags[handle];
    if (prefix) {
      try {
        return prefix + decodeURIComponent(suffix);
      } catch (error) {
        onError(String(error));
        return null;
      }
    }
    if (handle === "!")
      return source;
    onError(`Could not resolve tag: ${source}`);
    return null;
  }
  /**
   * Given a fully resolved tag, returns its printable string form,
   * taking into account current tag prefixes and defaults.
   */
  tagString(tag) {
    for (const [handle, prefix] of Object.entries(this.tags)) {
      if (tag.startsWith(prefix))
        return handle + escapeTagName(tag.substring(prefix.length));
    }
    return tag[0] === "!" ? tag : `!<${tag}>`;
  }
  toString(doc) {
    const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
    const tagEntries = Object.entries(this.tags);
    let tagNames;
    if (doc && tagEntries.length > 0 && isNode(doc.contents)) {
      const tags = {};
      visit(doc.contents, (_key, node) => {
        if (isNode(node) && node.tag)
          tags[node.tag] = true;
      });
      tagNames = Object.keys(tags);
    } else
      tagNames = [];
    for (const [handle, prefix] of tagEntries) {
      if (handle === "!!" && prefix === "tag:yaml.org,2002:")
        continue;
      if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
        lines.push(`%TAG ${handle} ${prefix}`);
    }
    return lines.join("\n");
  }
};
Directives.defaultYaml = { explicit: false, version: "1.2" };
Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };

// node_modules/yaml/browser/dist/doc/anchors.js
function anchorIsValid(anchor) {
  if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
    const sa = JSON.stringify(anchor);
    const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
    throw new Error(msg);
  }
  return true;
}
function anchorNames(root) {
  const anchors = /* @__PURE__ */ new Set();
  visit(root, {
    Value(_key, node) {
      if (node.anchor)
        anchors.add(node.anchor);
    }
  });
  return anchors;
}
function findNewAnchor(prefix, exclude) {
  for (let i = 1; true; ++i) {
    const name = `${prefix}${i}`;
    if (!exclude.has(name))
      return name;
  }
}
function createNodeAnchors(doc, prefix) {
  const aliasObjects = [];
  const sourceObjects = /* @__PURE__ */ new Map();
  let prevAnchors = null;
  return {
    onAnchor: (source) => {
      aliasObjects.push(source);
      prevAnchors ?? (prevAnchors = anchorNames(doc));
      const anchor = findNewAnchor(prefix, prevAnchors);
      prevAnchors.add(anchor);
      return anchor;
    },
    /**
     * With circular references, the source node is only resolved after all
     * of its child nodes are. This is why anchors are set only after all of
     * the nodes have been created.
     */
    setAnchors: () => {
      for (const source of aliasObjects) {
        const ref = sourceObjects.get(source);
        if (typeof ref === "object" && ref.anchor && (isScalar(ref.node) || isCollection(ref.node))) {
          ref.node.anchor = ref.anchor;
        } else {
          const error = new Error("Failed to resolve repeated object (this should not happen)");
          error.source = source;
          throw error;
        }
      }
    },
    sourceObjects
  };
}

// node_modules/yaml/browser/dist/doc/applyReviver.js
function applyReviver(reviver, obj, key, val) {
  if (val && typeof val === "object") {
    if (Array.isArray(val)) {
      for (let i = 0, len = val.length; i < len; ++i) {
        const v0 = val[i];
        const v1 = applyReviver(reviver, val, String(i), v0);
        if (v1 === void 0)
          delete val[i];
        else if (v1 !== v0)
          val[i] = v1;
      }
    } else if (val instanceof Map) {
      for (const k of Array.from(val.keys())) {
        const v0 = val.get(k);
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          val.delete(k);
        else if (v1 !== v0)
          val.set(k, v1);
      }
    } else if (val instanceof Set) {
      for (const v0 of Array.from(val)) {
        const v1 = applyReviver(reviver, val, v0, v0);
        if (v1 === void 0)
          val.delete(v0);
        else if (v1 !== v0) {
          val.delete(v0);
          val.add(v1);
        }
      }
    } else {
      for (const [k, v0] of Object.entries(val)) {
        const v1 = applyReviver(reviver, val, k, v0);
        if (v1 === void 0)
          delete val[k];
        else if (v1 !== v0)
          val[k] = v1;
      }
    }
  }
  return reviver.call(obj, key, val);
}

// node_modules/yaml/browser/dist/nodes/toJS.js
function toJS(value, arg, ctx) {
  if (Array.isArray(value))
    return value.map((v, i) => toJS(v, String(i), ctx));
  if (value && typeof value.toJSON === "function") {
    if (!ctx || !hasAnchor(value))
      return value.toJSON(arg, ctx);
    const data = { aliasCount: 0, count: 1, res: void 0 };
    ctx.anchors.set(value, data);
    ctx.onCreate = (res2) => {
      data.res = res2;
      delete ctx.onCreate;
    };
    const res = value.toJSON(arg, ctx);
    if (ctx.onCreate)
      ctx.onCreate(res);
    return res;
  }
  if (typeof value === "bigint" && !ctx?.keep)
    return Number(value);
  return value;
}

// node_modules/yaml/browser/dist/nodes/Node.js
var NodeBase = class {
  constructor(type) {
    Object.defineProperty(this, NODE_TYPE, { value: type });
  }
  /** Create a copy of this node.  */
  clone() {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** A plain JavaScript representation of this node. */
  toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    if (!isDocument(doc))
      throw new TypeError("A document argument is required");
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc,
      keep: true,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this, "", ctx);
    if (typeof onAnchor === "function")
      for (const { count, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
};

// node_modules/yaml/browser/dist/nodes/Alias.js
var Alias = class extends NodeBase {
  constructor(source) {
    super(ALIAS);
    this.source = source;
    Object.defineProperty(this, "tag", {
      set() {
        throw new Error("Alias nodes cannot have tags");
      }
    });
  }
  /**
   * Resolve the value of this alias within `doc`, finding the last
   * instance of the `source` anchor before this node.
   */
  resolve(doc, ctx) {
    if (ctx?.maxAliasCount === 0)
      throw new ReferenceError("Alias resolution is disabled");
    let nodes;
    if (ctx?.aliasResolveCache) {
      nodes = ctx.aliasResolveCache;
    } else {
      nodes = [];
      visit(doc, {
        Node: (_key, node) => {
          if (isAlias(node) || hasAnchor(node))
            nodes.push(node);
        }
      });
      if (ctx)
        ctx.aliasResolveCache = nodes;
    }
    let found = void 0;
    for (const node of nodes) {
      if (node === this)
        break;
      if (node.anchor === this.source)
        found = node;
    }
    return found;
  }
  toJSON(_arg, ctx) {
    if (!ctx)
      return { source: this.source };
    const { anchors, doc, maxAliasCount } = ctx;
    const source = this.resolve(doc, ctx);
    if (!source) {
      const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
      throw new ReferenceError(msg);
    }
    let data = anchors.get(source);
    if (!data) {
      toJS(source, null, ctx);
      data = anchors.get(source);
    }
    if (data?.res === void 0) {
      const msg = "This should not happen: Alias anchor was not resolved?";
      throw new ReferenceError(msg);
    }
    if (maxAliasCount >= 0) {
      data.count += 1;
      if (data.aliasCount === 0)
        data.aliasCount = getAliasCount(doc, source, anchors);
      if (data.count * data.aliasCount > maxAliasCount) {
        const msg = "Excessive alias count indicates a resource exhaustion attack";
        throw new ReferenceError(msg);
      }
    }
    return data.res;
  }
  toString(ctx, _onComment, _onChompKeep) {
    const src = `*${this.source}`;
    if (ctx) {
      anchorIsValid(this.source);
      if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
        const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
        throw new Error(msg);
      }
      if (ctx.implicitKey)
        return `${src} `;
    }
    return src;
  }
};
function getAliasCount(doc, node, anchors) {
  if (isAlias(node)) {
    const source = node.resolve(doc);
    const anchor = anchors && source && anchors.get(source);
    return anchor ? anchor.count * anchor.aliasCount : 0;
  } else if (isCollection(node)) {
    let count = 0;
    for (const item of node.items) {
      const c = getAliasCount(doc, item, anchors);
      if (c > count)
        count = c;
    }
    return count;
  } else if (isPair(node)) {
    const kc = getAliasCount(doc, node.key, anchors);
    const vc = getAliasCount(doc, node.value, anchors);
    return Math.max(kc, vc);
  }
  return 1;
}

// node_modules/yaml/browser/dist/nodes/Scalar.js
var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
var Scalar = class extends NodeBase {
  constructor(value) {
    super(SCALAR);
    this.value = value;
  }
  toJSON(arg, ctx) {
    return ctx?.keep ? this.value : toJS(this.value, arg, ctx);
  }
  toString() {
    return String(this.value);
  }
};
Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
Scalar.PLAIN = "PLAIN";
Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";

// node_modules/yaml/browser/dist/doc/createNode.js
var defaultTagPrefix = "tag:yaml.org,2002:";
function findTagObject(value, tagName, tags) {
  if (tagName) {
    const match = tags.filter((t) => t.tag === tagName);
    const tagObj = match.find((t) => !t.format) ?? match[0];
    if (!tagObj)
      throw new Error(`Tag ${tagName} not found`);
    return tagObj;
  }
  return tags.find((t) => t.identify?.(value) && !t.format);
}
function createNode(value, tagName, ctx) {
  if (isDocument(value))
    value = value.contents;
  if (isNode(value))
    return value;
  if (isPair(value)) {
    const map2 = ctx.schema[MAP].createNode?.(ctx.schema, null, ctx);
    map2.items.push(value);
    return map2;
  }
  if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
    value = value.valueOf();
  }
  const { aliasDuplicateObjects, onAnchor, onTagObj, schema: schema4, sourceObjects } = ctx;
  let ref = void 0;
  if (aliasDuplicateObjects && value && typeof value === "object") {
    ref = sourceObjects.get(value);
    if (ref) {
      ref.anchor ?? (ref.anchor = onAnchor(value));
      return new Alias(ref.anchor);
    } else {
      ref = { anchor: null, node: null };
      sourceObjects.set(value, ref);
    }
  }
  if (tagName?.startsWith("!!"))
    tagName = defaultTagPrefix + tagName.slice(2);
  let tagObj = findTagObject(value, tagName, schema4.tags);
  if (!tagObj) {
    if (value && typeof value.toJSON === "function") {
      value = value.toJSON();
    }
    if (!value || typeof value !== "object") {
      const node2 = new Scalar(value);
      if (ref)
        ref.node = node2;
      return node2;
    }
    tagObj = value instanceof Map ? schema4[MAP] : Symbol.iterator in Object(value) ? schema4[SEQ] : schema4[MAP];
  }
  if (onTagObj) {
    onTagObj(tagObj);
    delete ctx.onTagObj;
  }
  const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar(value);
  if (tagName)
    node.tag = tagName;
  else if (!tagObj.default)
    node.tag = tagObj.tag;
  if (ref)
    ref.node = node;
  return node;
}

// node_modules/yaml/browser/dist/nodes/Collection.js
function collectionFromPath(schema4, path, value) {
  let v = value;
  for (let i = path.length - 1; i >= 0; --i) {
    const k = path[i];
    if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
      const a = [];
      a[k] = v;
      v = a;
    } else {
      v = /* @__PURE__ */ new Map([[k, v]]);
    }
  }
  return createNode(v, void 0, {
    aliasDuplicateObjects: false,
    keepUndefined: false,
    onAnchor: () => {
      throw new Error("This should not happen, please report a bug.");
    },
    schema: schema4,
    sourceObjects: /* @__PURE__ */ new Map()
  });
}
var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
var Collection = class extends NodeBase {
  constructor(type, schema4) {
    super(type);
    Object.defineProperty(this, "schema", {
      value: schema4,
      configurable: true,
      enumerable: false,
      writable: true
    });
  }
  /**
   * Create a copy of this collection.
   *
   * @param schema - If defined, overwrites the original's schema
   */
  clone(schema4) {
    const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
    if (schema4)
      copy.schema = schema4;
    copy.items = copy.items.map((it) => isNode(it) || isPair(it) ? it.clone(schema4) : it);
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /**
   * Adds a value to the collection. For `!!map` and `!!omap` the value must
   * be a Pair instance or a `{ key, value }` object, which may not have a key
   * that already exists in the map.
   */
  addIn(path, value) {
    if (isEmptyPath(path))
      this.add(value);
    else {
      const [key, ...rest] = path;
      const node = this.get(key, true);
      if (isCollection(node))
        node.addIn(rest, value);
      else if (node === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
  /**
   * Removes a value from the collection.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.delete(key);
    const node = this.get(key, true);
    if (isCollection(node))
      return node.deleteIn(rest);
    else
      throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    const [key, ...rest] = path;
    const node = this.get(key, true);
    if (rest.length === 0)
      return !keepScalar && isScalar(node) ? node.value : node;
    else
      return isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
  }
  hasAllNullValues(allowScalar) {
    return this.items.every((node) => {
      if (!isPair(node))
        return false;
      const n = node.value;
      return n == null || allowScalar && isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
    });
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   */
  hasIn(path) {
    const [key, ...rest] = path;
    if (rest.length === 0)
      return this.has(key);
    const node = this.get(key, true);
    return isCollection(node) ? node.hasIn(rest) : false;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    const [key, ...rest] = path;
    if (rest.length === 0) {
      this.set(key, value);
    } else {
      const node = this.get(key, true);
      if (isCollection(node))
        node.setIn(rest, value);
      else if (node === void 0 && this.schema)
        this.set(key, collectionFromPath(this.schema, rest, value));
      else
        throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyComment.js
var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
function indentComment(comment, indent) {
  if (/^\n+$/.test(comment))
    return comment.substring(1);
  return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
}
var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;

// node_modules/yaml/browser/dist/stringify/foldFlowLines.js
var FOLD_FLOW = "flow";
var FOLD_BLOCK = "block";
var FOLD_QUOTED = "quoted";
function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
  if (!lineWidth || lineWidth < 0)
    return text;
  if (lineWidth < minContentWidth)
    minContentWidth = 0;
  const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
  if (text.length <= endStep)
    return text;
  const folds = [];
  const escapedFolds = {};
  let end = lineWidth - indent.length;
  if (typeof indentAtStart === "number") {
    if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
      folds.push(0);
    else
      end = lineWidth - indentAtStart;
  }
  let split = void 0;
  let prev = void 0;
  let overflow = false;
  let i = -1;
  let escStart = -1;
  let escEnd = -1;
  if (mode === FOLD_BLOCK) {
    i = consumeMoreIndentedLines(text, i, indent.length);
    if (i !== -1)
      end = i + endStep;
  }
  for (let ch; ch = text[i += 1]; ) {
    if (mode === FOLD_QUOTED && ch === "\\") {
      escStart = i;
      switch (text[i + 1]) {
        case "x":
          i += 3;
          break;
        case "u":
          i += 5;
          break;
        case "U":
          i += 9;
          break;
        default:
          i += 1;
      }
      escEnd = i;
    }
    if (ch === "\n") {
      if (mode === FOLD_BLOCK)
        i = consumeMoreIndentedLines(text, i, indent.length);
      end = i + indent.length + endStep;
      split = void 0;
    } else {
      if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
        const next = text[i + 1];
        if (next && next !== " " && next !== "\n" && next !== "	")
          split = i;
      }
      if (i >= end) {
        if (split) {
          folds.push(split);
          end = split + endStep;
          split = void 0;
        } else if (mode === FOLD_QUOTED) {
          while (prev === " " || prev === "	") {
            prev = ch;
            ch = text[i += 1];
            overflow = true;
          }
          const j = i > escEnd + 1 ? i - 2 : escStart - 1;
          if (escapedFolds[j])
            return text;
          folds.push(j);
          escapedFolds[j] = true;
          end = j + endStep;
          split = void 0;
        } else {
          overflow = true;
        }
      }
    }
    prev = ch;
  }
  if (overflow && onOverflow)
    onOverflow();
  if (folds.length === 0)
    return text;
  if (onFold)
    onFold();
  let res = text.slice(0, folds[0]);
  for (let i2 = 0; i2 < folds.length; ++i2) {
    const fold = folds[i2];
    const end2 = folds[i2 + 1] || text.length;
    if (fold === 0)
      res = `
${indent}${text.slice(0, end2)}`;
    else {
      if (mode === FOLD_QUOTED && escapedFolds[fold])
        res += `${text[fold]}\\`;
      res += `
${indent}${text.slice(fold + 1, end2)}`;
    }
  }
  return res;
}
function consumeMoreIndentedLines(text, i, indent) {
  let end = i;
  let start = i + 1;
  let ch = text[start];
  while (ch === " " || ch === "	") {
    if (i < start + indent) {
      ch = text[++i];
    } else {
      do {
        ch = text[++i];
      } while (ch && ch !== "\n");
      end = i;
      start = i + 1;
      ch = text[start];
    }
  }
  return end;
}

// node_modules/yaml/browser/dist/stringify/stringifyString.js
var getFoldOptions = (ctx, isBlock2) => ({
  indentAtStart: isBlock2 ? ctx.indent.length : ctx.indentAtStart,
  lineWidth: ctx.options.lineWidth,
  minContentWidth: ctx.options.minContentWidth
});
var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
function lineLengthOverLimit(str, lineWidth, indentLength) {
  if (!lineWidth || lineWidth < 0)
    return false;
  const limit = lineWidth - indentLength;
  const strLen = str.length;
  if (strLen <= limit)
    return false;
  for (let i = 0, start = 0; i < strLen; ++i) {
    if (str[i] === "\n") {
      if (i - start > limit)
        return true;
      start = i + 1;
      if (strLen - start <= limit)
        return false;
    }
  }
  return true;
}
function doubleQuotedString(value, ctx) {
  const json = JSON.stringify(value);
  if (ctx.options.doubleQuotedAsJSON)
    return json;
  const { implicitKey } = ctx;
  const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  let str = "";
  let start = 0;
  for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
    if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
      str += json.slice(start, i) + "\\ ";
      i += 1;
      start = i;
      ch = "\\";
    }
    if (ch === "\\")
      switch (json[i + 1]) {
        case "u":
          {
            str += json.slice(start, i);
            const code = json.substr(i + 2, 4);
            switch (code) {
              case "0000":
                str += "\\0";
                break;
              case "0007":
                str += "\\a";
                break;
              case "000b":
                str += "\\v";
                break;
              case "001b":
                str += "\\e";
                break;
              case "0085":
                str += "\\N";
                break;
              case "00a0":
                str += "\\_";
                break;
              case "2028":
                str += "\\L";
                break;
              case "2029":
                str += "\\P";
                break;
              default:
                if (code.substr(0, 2) === "00")
                  str += "\\x" + code.substr(2);
                else
                  str += json.substr(i, 6);
            }
            i += 5;
            start = i + 1;
          }
          break;
        case "n":
          if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
            i += 1;
          } else {
            str += json.slice(start, i) + "\n\n";
            while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
              str += "\n";
              i += 2;
            }
            str += indent;
            if (json[i + 2] === " ")
              str += "\\";
            i += 1;
            start = i + 1;
          }
          break;
        default:
          i += 1;
      }
  }
  str = start ? str + json.slice(start) : json;
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_QUOTED, getFoldOptions(ctx, false));
}
function singleQuotedString(value, ctx) {
  if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
    return doubleQuotedString(value, ctx);
  const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
  const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
  return ctx.implicitKey ? res : foldFlowLines(res, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function quotedString(value, ctx) {
  const { singleQuote } = ctx.options;
  let qs;
  if (singleQuote === false)
    qs = doubleQuotedString;
  else {
    const hasDouble = value.includes('"');
    const hasSingle = value.includes("'");
    if (hasDouble && !hasSingle)
      qs = singleQuotedString;
    else if (hasSingle && !hasDouble)
      qs = doubleQuotedString;
    else
      qs = singleQuote ? singleQuotedString : doubleQuotedString;
  }
  return qs(value, ctx);
}
var blockEndNewlines;
try {
  blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
} catch {
  blockEndNewlines = /\n+(?!\n|$)/g;
}
function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
  const { blockQuote, commentString, lineWidth } = ctx.options;
  if (!blockQuote || /\n[\t ]+$/.test(value)) {
    return quotedString(value, ctx);
  }
  const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
  const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.BLOCK_FOLDED ? false : type === Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
  if (!value)
    return literal ? "|\n" : ">\n";
  let chomp;
  let endStart;
  for (endStart = value.length; endStart > 0; --endStart) {
    const ch = value[endStart - 1];
    if (ch !== "\n" && ch !== "	" && ch !== " ")
      break;
  }
  let end = value.substring(endStart);
  const endNlPos = end.indexOf("\n");
  if (endNlPos === -1) {
    chomp = "-";
  } else if (value === end || endNlPos !== end.length - 1) {
    chomp = "+";
    if (onChompKeep)
      onChompKeep();
  } else {
    chomp = "";
  }
  if (end) {
    value = value.slice(0, -end.length);
    if (end[end.length - 1] === "\n")
      end = end.slice(0, -1);
    end = end.replace(blockEndNewlines, `$&${indent}`);
  }
  let startWithSpace = false;
  let startEnd;
  let startNlPos = -1;
  for (startEnd = 0; startEnd < value.length; ++startEnd) {
    const ch = value[startEnd];
    if (ch === " ")
      startWithSpace = true;
    else if (ch === "\n")
      startNlPos = startEnd;
    else
      break;
  }
  let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
  if (start) {
    value = value.substring(start.length);
    start = start.replace(/\n+/g, `$&${indent}`);
  }
  const indentSize = indent ? "2" : "1";
  let header = (startWithSpace ? indentSize : "") + chomp;
  if (comment) {
    header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
    if (onComment)
      onComment();
  }
  if (!literal) {
    const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
    let literalFallback = false;
    const foldOptions = getFoldOptions(ctx, true);
    if (blockQuote !== "folded" && type !== Scalar.BLOCK_FOLDED) {
      foldOptions.onOverflow = () => {
        literalFallback = true;
      };
    }
    const body = foldFlowLines(`${start}${foldedValue}${end}`, indent, FOLD_BLOCK, foldOptions);
    if (!literalFallback)
      return `>${header}
${indent}${body}`;
  }
  value = value.replace(/\n+/g, `$&${indent}`);
  return `|${header}
${indent}${start}${value}${end}`;
}
function plainString(item, ctx, onComment, onChompKeep) {
  const { type, value } = item;
  const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
  if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
    return quotedString(value, ctx);
  }
  if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
    return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
  }
  if (!implicitKey && !inFlow && type !== Scalar.PLAIN && value.includes("\n")) {
    return blockString(item, ctx, onComment, onChompKeep);
  }
  if (containsDocumentMarker(value)) {
    if (indent === "") {
      ctx.forceBlockIndent = true;
      return blockString(item, ctx, onComment, onChompKeep);
    } else if (implicitKey && indent === indentStep) {
      return quotedString(value, ctx);
    }
  }
  const str = value.replace(/\n+/g, `$&
${indent}`);
  if (actualString) {
    const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
    const { compat, tags } = ctx.doc.schema;
    if (tags.some(test) || compat?.some(test))
      return quotedString(value, ctx);
  }
  return implicitKey ? str : foldFlowLines(str, indent, FOLD_FLOW, getFoldOptions(ctx, false));
}
function stringifyString(item, ctx, onComment, onChompKeep) {
  const { implicitKey, inFlow } = ctx;
  const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
  let { type } = item;
  if (type !== Scalar.QUOTE_DOUBLE) {
    if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
      type = Scalar.QUOTE_DOUBLE;
  }
  const _stringify = (_type) => {
    switch (_type) {
      case Scalar.BLOCK_FOLDED:
      case Scalar.BLOCK_LITERAL:
        return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
      case Scalar.QUOTE_DOUBLE:
        return doubleQuotedString(ss.value, ctx);
      case Scalar.QUOTE_SINGLE:
        return singleQuotedString(ss.value, ctx);
      case Scalar.PLAIN:
        return plainString(ss, ctx, onComment, onChompKeep);
      default:
        return null;
    }
  };
  let res = _stringify(type);
  if (res === null) {
    const { defaultKeyType, defaultStringType } = ctx.options;
    const t = implicitKey && defaultKeyType || defaultStringType;
    res = _stringify(t);
    if (res === null)
      throw new Error(`Unsupported default string type ${t}`);
  }
  return res;
}

// node_modules/yaml/browser/dist/stringify/stringify.js
function createStringifyContext(doc, options) {
  const opt = Object.assign({
    blockQuote: true,
    commentString: stringifyComment,
    defaultKeyType: null,
    defaultStringType: "PLAIN",
    directives: null,
    doubleQuotedAsJSON: false,
    doubleQuotedMinMultiLineLength: 40,
    falseStr: "false",
    flowCollectionPadding: true,
    indentSeq: true,
    lineWidth: 80,
    minContentWidth: 20,
    nullStr: "null",
    simpleKeys: false,
    singleQuote: null,
    trailingComma: false,
    trueStr: "true",
    verifyAliasOrder: true
  }, doc.schema.toStringOptions, options);
  let inFlow;
  switch (opt.collectionStyle) {
    case "block":
      inFlow = false;
      break;
    case "flow":
      inFlow = true;
      break;
    default:
      inFlow = null;
  }
  return {
    anchors: /* @__PURE__ */ new Set(),
    doc,
    flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
    indent: "",
    indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
    inFlow,
    options: opt
  };
}
function getTagObject(tags, item) {
  if (item.tag) {
    const match = tags.filter((t) => t.tag === item.tag);
    if (match.length > 0)
      return match.find((t) => t.format === item.format) ?? match[0];
  }
  let tagObj = void 0;
  let obj;
  if (isScalar(item)) {
    obj = item.value;
    let match = tags.filter((t) => t.identify?.(obj));
    if (match.length > 1) {
      const testMatch = match.filter((t) => t.test);
      if (testMatch.length > 0)
        match = testMatch;
    }
    tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
  } else {
    obj = item;
    tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
  }
  if (!tagObj) {
    const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
    throw new Error(`Tag not resolved for ${name} value`);
  }
  return tagObj;
}
function stringifyProps(node, tagObj, { anchors, doc }) {
  if (!doc.directives)
    return "";
  const props = [];
  const anchor = (isScalar(node) || isCollection(node)) && node.anchor;
  if (anchor && anchorIsValid(anchor)) {
    anchors.add(anchor);
    props.push(`&${anchor}`);
  }
  const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
  if (tag)
    props.push(doc.directives.tagString(tag));
  return props.join(" ");
}
function stringify(item, ctx, onComment, onChompKeep) {
  if (isPair(item))
    return item.toString(ctx, onComment, onChompKeep);
  if (isAlias(item)) {
    if (ctx.doc.directives)
      return item.toString(ctx);
    if (ctx.resolvedAliases?.has(item)) {
      throw new TypeError(`Cannot stringify circular structure without alias nodes`);
    } else {
      if (ctx.resolvedAliases)
        ctx.resolvedAliases.add(item);
      else
        ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
      item = item.resolve(ctx.doc);
    }
  }
  let tagObj = void 0;
  const node = isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
  tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
  const props = stringifyProps(node, tagObj, ctx);
  if (props.length > 0)
    ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
  const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : isScalar(node) ? stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
  if (!props)
    return str;
  return isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
}

// node_modules/yaml/browser/dist/stringify/stringifyPair.js
function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
  const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
  let keyComment = isNode(key) && key.comment || null;
  if (simpleKeys) {
    if (keyComment) {
      throw new Error("With simple keys, key nodes cannot have comments");
    }
    if (isCollection(key) || !isNode(key) && typeof key === "object") {
      const msg = "With simple keys, collection cannot be used as a key value";
      throw new Error(msg);
    }
  }
  let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || isCollection(key) || (isScalar(key) ? key.type === Scalar.BLOCK_FOLDED || key.type === Scalar.BLOCK_LITERAL : typeof key === "object"));
  ctx = Object.assign({}, ctx, {
    allNullValues: false,
    implicitKey: !explicitKey && (simpleKeys || !allNullValues),
    indent: indent + indentStep
  });
  let keyCommentDone = false;
  let chompKeep = false;
  let str = stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
  if (!explicitKey && !ctx.inFlow && str.length > 1024) {
    if (simpleKeys)
      throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
    explicitKey = true;
  }
  if (ctx.inFlow) {
    if (allNullValues || value == null) {
      if (keyCommentDone && onComment)
        onComment();
      return str === "" ? "?" : explicitKey ? `? ${str}` : str;
    }
  } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
    str = `? ${str}`;
    if (keyComment && !keyCommentDone) {
      str += lineComment(str, ctx.indent, commentString(keyComment));
    } else if (chompKeep && onChompKeep)
      onChompKeep();
    return str;
  }
  if (keyCommentDone)
    keyComment = null;
  if (explicitKey) {
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
    str = `? ${str}
${indent}:`;
  } else {
    str = `${str}:`;
    if (keyComment)
      str += lineComment(str, ctx.indent, commentString(keyComment));
  }
  let vsb, vcb, valueComment;
  if (isNode(value)) {
    vsb = !!value.spaceBefore;
    vcb = value.commentBefore;
    valueComment = value.comment;
  } else {
    vsb = false;
    vcb = null;
    valueComment = null;
    if (value && typeof value === "object")
      value = doc.createNode(value);
  }
  ctx.implicitKey = false;
  if (!explicitKey && !keyComment && isScalar(value))
    ctx.indentAtStart = str.length + 1;
  chompKeep = false;
  if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && isSeq(value) && !value.flow && !value.tag && !value.anchor) {
    ctx.indent = ctx.indent.substring(2);
  }
  let valueCommentDone = false;
  const valueStr = stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
  let ws = " ";
  if (keyComment || vsb || vcb) {
    ws = vsb ? "\n" : "";
    if (vcb) {
      const cs = commentString(vcb);
      ws += `
${indentComment(cs, ctx.indent)}`;
    }
    if (valueStr === "" && !ctx.inFlow) {
      if (ws === "\n" && valueComment)
        ws = "\n\n";
    } else {
      ws += `
${ctx.indent}`;
    }
  } else if (!explicitKey && isCollection(value)) {
    const vs0 = valueStr[0];
    const nl0 = valueStr.indexOf("\n");
    const hasNewline = nl0 !== -1;
    const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
    if (hasNewline || !flow) {
      let hasPropsLine = false;
      if (hasNewline && (vs0 === "&" || vs0 === "!")) {
        let sp0 = valueStr.indexOf(" ");
        if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
          sp0 = valueStr.indexOf(" ", sp0 + 1);
        }
        if (sp0 === -1 || nl0 < sp0)
          hasPropsLine = true;
      }
      if (!hasPropsLine)
        ws = `
${ctx.indent}`;
    }
  } else if (valueStr === "" || valueStr[0] === "\n") {
    ws = "";
  }
  str += ws + valueStr;
  if (ctx.inFlow) {
    if (valueCommentDone && onComment)
      onComment();
  } else if (valueComment && !valueCommentDone) {
    str += lineComment(str, ctx.indent, commentString(valueComment));
  } else if (chompKeep && onChompKeep) {
    onChompKeep();
  }
  return str;
}

// node_modules/yaml/browser/dist/log.js
function warn(logLevel, warning) {
  if (logLevel === "debug" || logLevel === "warn") {
    console.warn(warning);
  }
}

// node_modules/yaml/browser/dist/schema/yaml-1.1/merge.js
var MERGE_KEY = "<<";
var merge = {
  identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
  default: "key",
  tag: "tag:yaml.org,2002:merge",
  test: /^<<$/,
  resolve: () => Object.assign(new Scalar(Symbol(MERGE_KEY)), {
    addToJSMap: addMergeToJSMap
  }),
  stringify: () => MERGE_KEY
};
var isMergeKey = (ctx, key) => (merge.identify(key) || isScalar(key) && (!key.type || key.type === Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
function addMergeToJSMap(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (isSeq(source))
    for (const it of source.items)
      mergeValue(ctx, map2, it);
  else if (Array.isArray(source))
    for (const it of source)
      mergeValue(ctx, map2, it);
  else
    mergeValue(ctx, map2, source);
}
function mergeValue(ctx, map2, value) {
  const source = resolveAliasValue(ctx, value);
  if (!isMap(source))
    throw new Error("Merge sources must be maps or map aliases");
  const srcMap = source.toJSON(null, ctx, Map);
  for (const [key, value2] of srcMap) {
    if (map2 instanceof Map) {
      if (!map2.has(key))
        map2.set(key, value2);
    } else if (map2 instanceof Set) {
      map2.add(key);
    } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
      Object.defineProperty(map2, key, {
        value: value2,
        writable: true,
        enumerable: true,
        configurable: true
      });
    }
  }
  return map2;
}
function resolveAliasValue(ctx, value) {
  return ctx && isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
}

// node_modules/yaml/browser/dist/nodes/addPairToJSMap.js
function addPairToJSMap(ctx, map2, { key, value }) {
  if (isNode(key) && key.addToJSMap)
    key.addToJSMap(ctx, map2, value);
  else if (isMergeKey(ctx, key))
    addMergeToJSMap(ctx, map2, value);
  else {
    const jsKey = toJS(key, "", ctx);
    if (map2 instanceof Map) {
      map2.set(jsKey, toJS(value, jsKey, ctx));
    } else if (map2 instanceof Set) {
      map2.add(jsKey);
    } else {
      const stringKey = stringifyKey(key, jsKey, ctx);
      const jsValue = toJS(value, stringKey, ctx);
      if (stringKey in map2)
        Object.defineProperty(map2, stringKey, {
          value: jsValue,
          writable: true,
          enumerable: true,
          configurable: true
        });
      else
        map2[stringKey] = jsValue;
    }
  }
  return map2;
}
function stringifyKey(key, jsKey, ctx) {
  if (jsKey === null)
    return "";
  if (typeof jsKey !== "object")
    return String(jsKey);
  if (isNode(key) && ctx?.doc) {
    const strCtx = createStringifyContext(ctx.doc, {});
    strCtx.anchors = /* @__PURE__ */ new Set();
    for (const node of ctx.anchors.keys())
      strCtx.anchors.add(node.anchor);
    strCtx.inFlow = true;
    strCtx.inStringifyKey = true;
    const strKey = key.toString(strCtx);
    if (!ctx.mapKeyWarned) {
      let jsonStr = JSON.stringify(strKey);
      if (jsonStr.length > 40)
        jsonStr = jsonStr.substring(0, 36) + '..."';
      warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
      ctx.mapKeyWarned = true;
    }
    return strKey;
  }
  return JSON.stringify(jsKey);
}

// node_modules/yaml/browser/dist/nodes/Pair.js
function createPair(key, value, ctx) {
  const k = createNode(key, void 0, ctx);
  const v = createNode(value, void 0, ctx);
  return new Pair(k, v);
}
var Pair = class _Pair {
  constructor(key, value = null) {
    Object.defineProperty(this, NODE_TYPE, { value: PAIR });
    this.key = key;
    this.value = value;
  }
  clone(schema4) {
    let { key, value } = this;
    if (isNode(key))
      key = key.clone(schema4);
    if (isNode(value))
      value = value.clone(schema4);
    return new _Pair(key, value);
  }
  toJSON(_, ctx) {
    const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    return addPairToJSMap(ctx, pair, this);
  }
  toString(ctx, onComment, onChompKeep) {
    return ctx?.doc ? stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyCollection.js
function stringifyCollection(collection, ctx, options) {
  const flow = ctx.inFlow ?? collection.flow;
  const stringify4 = flow ? stringifyFlowCollection : stringifyBlockCollection;
  return stringify4(collection, ctx, options);
}
function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
  const { indent, options: { commentString } } = ctx;
  const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
  let chompKeep = false;
  const lines = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    let comment2 = null;
    if (isNode(item)) {
      if (!chompKeep && item.spaceBefore)
        lines.push("");
      addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
      if (item.comment)
        comment2 = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (!chompKeep && ik.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
      }
    }
    chompKeep = false;
    let str2 = stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
    if (comment2)
      str2 += lineComment(str2, itemIndent, commentString(comment2));
    if (chompKeep && comment2)
      chompKeep = false;
    lines.push(blockItemPrefix + str2);
  }
  let str;
  if (lines.length === 0) {
    str = flowChars.start + flowChars.end;
  } else {
    str = lines[0];
    for (let i = 1; i < lines.length; ++i) {
      const line = lines[i];
      str += line ? `
${indent}${line}` : "\n";
    }
  }
  if (comment) {
    str += "\n" + indentComment(commentString(comment), indent);
    if (onComment)
      onComment();
  } else if (chompKeep && onChompKeep)
    onChompKeep();
  return str;
}
function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
  const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
  itemIndent += indentStep;
  const itemCtx = Object.assign({}, ctx, {
    indent: itemIndent,
    inFlow: true,
    type: null
  });
  let reqNewline = false;
  let linesAtValue = 0;
  const lines = [];
  for (let i = 0; i < items.length; ++i) {
    const item = items[i];
    let comment = null;
    if (isNode(item)) {
      if (item.spaceBefore)
        lines.push("");
      addCommentBefore(ctx, lines, item.commentBefore, false);
      if (item.comment)
        comment = item.comment;
    } else if (isPair(item)) {
      const ik = isNode(item.key) ? item.key : null;
      if (ik) {
        if (ik.spaceBefore)
          lines.push("");
        addCommentBefore(ctx, lines, ik.commentBefore, false);
        if (ik.comment)
          reqNewline = true;
      }
      const iv = isNode(item.value) ? item.value : null;
      if (iv) {
        if (iv.comment)
          comment = iv.comment;
        if (iv.commentBefore)
          reqNewline = true;
      } else if (item.value == null && ik?.comment) {
        comment = ik.comment;
      }
    }
    if (comment)
      reqNewline = true;
    let str = stringify(item, itemCtx, () => comment = null);
    reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
    if (i < items.length - 1) {
      str += ",";
    } else if (ctx.options.trailingComma) {
      if (ctx.options.lineWidth > 0) {
        reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
      }
      if (reqNewline) {
        str += ",";
      }
    }
    if (comment)
      str += lineComment(str, itemIndent, commentString(comment));
    lines.push(str);
    linesAtValue = lines.length;
  }
  const { start, end } = flowChars;
  if (lines.length === 0) {
    return start + end;
  } else {
    if (!reqNewline) {
      const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
      reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
    }
    if (reqNewline) {
      let str = start;
      for (const line of lines)
        str += line ? `
${indentStep}${indent}${line}` : "\n";
      return `${str}
${indent}${end}`;
    } else {
      return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
    }
  }
}
function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
  if (comment && chompKeep)
    comment = comment.replace(/^\n+/, "");
  if (comment) {
    const ic = indentComment(commentString(comment), indent);
    lines.push(ic.trimStart());
  }
}

// node_modules/yaml/browser/dist/nodes/YAMLMap.js
function findPair(items, key) {
  const k = isScalar(key) ? key.value : key;
  for (const it of items) {
    if (isPair(it)) {
      if (it.key === key || it.key === k)
        return it;
      if (isScalar(it.key) && it.key.value === k)
        return it;
    }
  }
  return void 0;
}
var YAMLMap = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:map";
  }
  constructor(schema4) {
    super(MAP, schema4);
    this.items = [];
  }
  /**
   * A generic collection parsing method that can be extended
   * to other node classes that inherit from YAMLMap
   */
  static from(schema4, obj, ctx) {
    const { keepUndefined, replacer } = ctx;
    const map2 = new this(schema4);
    const add = (key, value) => {
      if (typeof replacer === "function")
        value = replacer.call(obj, key, value);
      else if (Array.isArray(replacer) && !replacer.includes(key))
        return;
      if (value !== void 0 || keepUndefined)
        map2.items.push(createPair(key, value, ctx));
    };
    if (obj instanceof Map) {
      for (const [key, value] of obj)
        add(key, value);
    } else if (obj && typeof obj === "object") {
      for (const key of Object.keys(obj))
        add(key, obj[key]);
    }
    if (typeof schema4.sortMapEntries === "function") {
      map2.items.sort(schema4.sortMapEntries);
    }
    return map2;
  }
  /**
   * Adds a value to the collection.
   *
   * @param overwrite - If not set `true`, using a key that is already in the
   *   collection will throw. Otherwise, overwrites the previous value.
   */
  add(pair, overwrite) {
    let _pair;
    if (isPair(pair))
      _pair = pair;
    else if (!pair || typeof pair !== "object" || !("key" in pair)) {
      _pair = new Pair(pair, pair?.value);
    } else
      _pair = new Pair(pair.key, pair.value);
    const prev = findPair(this.items, _pair.key);
    const sortEntries = this.schema?.sortMapEntries;
    if (prev) {
      if (!overwrite)
        throw new Error(`Key ${_pair.key} already set`);
      if (isScalar(prev.value) && isScalarValue(_pair.value))
        prev.value.value = _pair.value;
      else
        prev.value = _pair.value;
    } else if (sortEntries) {
      const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
      if (i === -1)
        this.items.push(_pair);
      else
        this.items.splice(i, 0, _pair);
    } else {
      this.items.push(_pair);
    }
  }
  delete(key) {
    const it = findPair(this.items, key);
    if (!it)
      return false;
    const del = this.items.splice(this.items.indexOf(it), 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const it = findPair(this.items, key);
    const node = it?.value;
    return (!keepScalar && isScalar(node) ? node.value : node) ?? void 0;
  }
  has(key) {
    return !!findPair(this.items, key);
  }
  set(key, value) {
    this.add(new Pair(key, value), true);
  }
  /**
   * @param ctx - Conversion context, originally set in Document#toJS()
   * @param {Class} Type - If set, forces the returned collection type
   * @returns Instance of Type, Map, or Object
   */
  toJSON(_, ctx, Type) {
    const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const item of this.items)
      addPairToJSMap(ctx, map2, item);
    return map2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    for (const item of this.items) {
      if (!isPair(item))
        throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
    }
    if (!ctx.allNullValues && this.hasAllNullValues(false))
      ctx = Object.assign({}, ctx, { allNullValues: true });
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "",
      flowChars: { start: "{", end: "}" },
      itemIndent: ctx.indent || "",
      onChompKeep,
      onComment
    });
  }
};

// node_modules/yaml/browser/dist/schema/common/map.js
var map = {
  collection: "map",
  default: true,
  nodeClass: YAMLMap,
  tag: "tag:yaml.org,2002:map",
  resolve(map2, onError) {
    if (!isMap(map2))
      onError("Expected a mapping for this tag");
    return map2;
  },
  createNode: (schema4, obj, ctx) => YAMLMap.from(schema4, obj, ctx)
};

// node_modules/yaml/browser/dist/nodes/YAMLSeq.js
var YAMLSeq = class extends Collection {
  static get tagName() {
    return "tag:yaml.org,2002:seq";
  }
  constructor(schema4) {
    super(SEQ, schema4);
    this.items = [];
  }
  add(value) {
    this.items.push(value);
  }
  /**
   * Removes a value from the collection.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   *
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return false;
    const del = this.items.splice(idx, 1);
    return del.length > 0;
  }
  get(key, keepScalar) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      return void 0;
    const it = this.items[idx];
    return !keepScalar && isScalar(it) ? it.value : it;
  }
  /**
   * Checks if the collection includes a value with the key `key`.
   *
   * `key` must contain a representation of an integer for this to succeed.
   * It may be wrapped in a `Scalar`.
   */
  has(key) {
    const idx = asItemIndex(key);
    return typeof idx === "number" && idx < this.items.length;
  }
  /**
   * Sets a value in this collection. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   *
   * If `key` does not contain a representation of an integer, this will throw.
   * It may be wrapped in a `Scalar`.
   */
  set(key, value) {
    const idx = asItemIndex(key);
    if (typeof idx !== "number")
      throw new Error(`Expected a valid index, not ${key}.`);
    const prev = this.items[idx];
    if (isScalar(prev) && isScalarValue(value))
      prev.value = value;
    else
      this.items[idx] = value;
  }
  toJSON(_, ctx) {
    const seq2 = [];
    if (ctx?.onCreate)
      ctx.onCreate(seq2);
    let i = 0;
    for (const item of this.items)
      seq2.push(toJS(item, String(i++), ctx));
    return seq2;
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    return stringifyCollection(this, ctx, {
      blockItemPrefix: "- ",
      flowChars: { start: "[", end: "]" },
      itemIndent: (ctx.indent || "") + "  ",
      onChompKeep,
      onComment
    });
  }
  static from(schema4, obj, ctx) {
    const { replacer } = ctx;
    const seq2 = new this(schema4);
    if (obj && Symbol.iterator in Object(obj)) {
      let i = 0;
      for (let it of obj) {
        if (typeof replacer === "function") {
          const key = obj instanceof Set ? it : String(i++);
          it = replacer.call(obj, key, it);
        }
        seq2.items.push(createNode(it, void 0, ctx));
      }
    }
    return seq2;
  }
};
function asItemIndex(key) {
  let idx = isScalar(key) ? key.value : key;
  if (idx && typeof idx === "string")
    idx = Number(idx);
  return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
}

// node_modules/yaml/browser/dist/schema/common/seq.js
var seq = {
  collection: "seq",
  default: true,
  nodeClass: YAMLSeq,
  tag: "tag:yaml.org,2002:seq",
  resolve(seq2, onError) {
    if (!isSeq(seq2))
      onError("Expected a sequence for this tag");
    return seq2;
  },
  createNode: (schema4, obj, ctx) => YAMLSeq.from(schema4, obj, ctx)
};

// node_modules/yaml/browser/dist/schema/common/string.js
var string = {
  identify: (value) => typeof value === "string",
  default: true,
  tag: "tag:yaml.org,2002:str",
  resolve: (str) => str,
  stringify(item, ctx, onComment, onChompKeep) {
    ctx = Object.assign({ actualString: true }, ctx);
    return stringifyString(item, ctx, onComment, onChompKeep);
  }
};

// node_modules/yaml/browser/dist/schema/common/null.js
var nullTag = {
  identify: (value) => value == null,
  createNode: () => new Scalar(null),
  default: true,
  tag: "tag:yaml.org,2002:null",
  test: /^(?:~|[Nn]ull|NULL)?$/,
  resolve: () => new Scalar(null),
  stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
};

// node_modules/yaml/browser/dist/schema/core/bool.js
var boolTag = {
  identify: (value) => typeof value === "boolean",
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
  resolve: (str) => new Scalar(str[0] === "t" || str[0] === "T"),
  stringify({ source, value }, ctx) {
    if (source && boolTag.test.test(source)) {
      const sv = source[0] === "t" || source[0] === "T";
      if (value === sv)
        return source;
    }
    return value ? ctx.options.trueStr : ctx.options.falseStr;
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyNumber.js
function stringifyNumber({ format, minFractionDigits, tag, value }) {
  if (typeof value === "bigint")
    return String(value);
  const num = typeof value === "number" ? value : Number(value);
  if (!isFinite(num))
    return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
  let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
  if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
    let i = n.indexOf(".");
    if (i < 0) {
      i = n.length;
      n += ".";
    }
    let d = minFractionDigits - (n.length - i - 1);
    while (d-- > 0)
      n += "0";
  }
  return n;
}

// node_modules/yaml/browser/dist/schema/core/float.js
var floatNaN = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str),
  stringify(node) {
    const num = Number(node.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node);
  }
};
var float = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
  resolve(str) {
    const node = new Scalar(parseFloat(str));
    const dot = str.indexOf(".");
    if (dot !== -1 && str[str.length - 1] === "0")
      node.minFractionDigits = str.length - dot - 1;
    return node;
  },
  stringify: stringifyNumber
};

// node_modules/yaml/browser/dist/schema/core/int.js
var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
function intStringify(node, radix, prefix) {
  const { value } = node;
  if (intIdentify(value) && value >= 0)
    return prefix + value.toString(radix);
  return stringifyNumber(node);
}
var intOct = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^0o[0-7]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
  stringify: (node) => intStringify(node, 8, "0o")
};
var int = {
  identify: intIdentify,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex = {
  identify: (value) => intIdentify(value) && value >= 0,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^0x[0-9a-fA-F]+$/,
  resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
  stringify: (node) => intStringify(node, 16, "0x")
};

// node_modules/yaml/browser/dist/schema/core/schema.js
var schema = [
  map,
  seq,
  string,
  nullTag,
  boolTag,
  intOct,
  int,
  intHex,
  floatNaN,
  floatExp,
  float
];

// node_modules/yaml/browser/dist/schema/json/schema.js
function intIdentify2(value) {
  return typeof value === "bigint" || Number.isInteger(value);
}
var stringifyJSON = ({ value }) => JSON.stringify(value);
var jsonScalars = [
  {
    identify: (value) => typeof value === "string",
    default: true,
    tag: "tag:yaml.org,2002:str",
    resolve: (str) => str,
    stringify: stringifyJSON
  },
  {
    identify: (value) => value == null,
    createNode: () => new Scalar(null),
    default: true,
    tag: "tag:yaml.org,2002:null",
    test: /^null$/,
    resolve: () => null,
    stringify: stringifyJSON
  },
  {
    identify: (value) => typeof value === "boolean",
    default: true,
    tag: "tag:yaml.org,2002:bool",
    test: /^true$|^false$/,
    resolve: (str) => str === "true",
    stringify: stringifyJSON
  },
  {
    identify: intIdentify2,
    default: true,
    tag: "tag:yaml.org,2002:int",
    test: /^-?(?:0|[1-9][0-9]*)$/,
    resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
    stringify: ({ value }) => intIdentify2(value) ? value.toString() : JSON.stringify(value)
  },
  {
    identify: (value) => typeof value === "number",
    default: true,
    tag: "tag:yaml.org,2002:float",
    test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
    resolve: (str) => parseFloat(str),
    stringify: stringifyJSON
  }
];
var jsonError = {
  default: true,
  tag: "",
  test: /^/,
  resolve(str, onError) {
    onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
    return str;
  }
};
var schema2 = [map, seq].concat(jsonScalars, jsonError);

// node_modules/yaml/browser/dist/schema/yaml-1.1/binary.js
var binary = {
  identify: (value) => value instanceof Uint8Array,
  // Buffer inherits from Uint8Array
  default: false,
  tag: "tag:yaml.org,2002:binary",
  /**
   * Returns a Buffer in node and an Uint8Array in browsers
   *
   * To use the resulting buffer as an image, you'll want to do something like:
   *
   *   const blob = new Blob([buffer], { type: 'image/jpeg' })
   *   document.querySelector('#photo').src = URL.createObjectURL(blob)
   */
  resolve(src, onError) {
    if (typeof atob === "function") {
      const str = atob(src.replace(/[\n\r]/g, ""));
      const buffer = new Uint8Array(str.length);
      for (let i = 0; i < str.length; ++i)
        buffer[i] = str.charCodeAt(i);
      return buffer;
    } else {
      onError("This environment does not support reading binary tags; either Buffer or atob is required");
      return src;
    }
  },
  stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
    if (!value)
      return "";
    const buf = value;
    let str;
    if (typeof btoa === "function") {
      let s = "";
      for (let i = 0; i < buf.length; ++i)
        s += String.fromCharCode(buf[i]);
      str = btoa(s);
    } else {
      throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
    }
    type ?? (type = Scalar.BLOCK_LITERAL);
    if (type !== Scalar.QUOTE_DOUBLE) {
      const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
      const n = Math.ceil(str.length / lineWidth);
      const lines = new Array(n);
      for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
        lines[i] = str.substr(o, lineWidth);
      }
      str = lines.join(type === Scalar.BLOCK_LITERAL ? "\n" : " ");
    }
    return stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
  }
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/pairs.js
function resolvePairs(seq2, onError) {
  if (isSeq(seq2)) {
    for (let i = 0; i < seq2.items.length; ++i) {
      let item = seq2.items[i];
      if (isPair(item))
        continue;
      else if (isMap(item)) {
        if (item.items.length > 1)
          onError("Each pair must have its own sequence indicator");
        const pair = item.items[0] || new Pair(new Scalar(null));
        if (item.commentBefore)
          pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
        if (item.comment) {
          const cn = pair.value ?? pair.key;
          cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
        }
        item = pair;
      }
      seq2.items[i] = isPair(item) ? item : new Pair(item);
    }
  } else
    onError("Expected a sequence for this tag");
  return seq2;
}
function createPairs(schema4, iterable, ctx) {
  const { replacer } = ctx;
  const pairs2 = new YAMLSeq(schema4);
  pairs2.tag = "tag:yaml.org,2002:pairs";
  let i = 0;
  if (iterable && Symbol.iterator in Object(iterable))
    for (let it of iterable) {
      if (typeof replacer === "function")
        it = replacer.call(iterable, String(i++), it);
      let key, value;
      if (Array.isArray(it)) {
        if (it.length === 2) {
          key = it[0];
          value = it[1];
        } else
          throw new TypeError(`Expected [key, value] tuple: ${it}`);
      } else if (it && it instanceof Object) {
        const keys = Object.keys(it);
        if (keys.length === 1) {
          key = keys[0];
          value = it[key];
        } else {
          throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
        }
      } else {
        key = it;
      }
      pairs2.items.push(createPair(key, value, ctx));
    }
  return pairs2;
}
var pairs = {
  collection: "seq",
  default: false,
  tag: "tag:yaml.org,2002:pairs",
  resolve: resolvePairs,
  createNode: createPairs
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/omap.js
var YAMLOMap = class _YAMLOMap extends YAMLSeq {
  constructor() {
    super();
    this.add = YAMLMap.prototype.add.bind(this);
    this.delete = YAMLMap.prototype.delete.bind(this);
    this.get = YAMLMap.prototype.get.bind(this);
    this.has = YAMLMap.prototype.has.bind(this);
    this.set = YAMLMap.prototype.set.bind(this);
    this.tag = _YAMLOMap.tag;
  }
  /**
   * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
   * but TypeScript won't allow widening the signature of a child method.
   */
  toJSON(_, ctx) {
    if (!ctx)
      return super.toJSON(_);
    const map2 = /* @__PURE__ */ new Map();
    if (ctx?.onCreate)
      ctx.onCreate(map2);
    for (const pair of this.items) {
      let key, value;
      if (isPair(pair)) {
        key = toJS(pair.key, "", ctx);
        value = toJS(pair.value, key, ctx);
      } else {
        key = toJS(pair, "", ctx);
      }
      if (map2.has(key))
        throw new Error("Ordered maps must not include duplicate keys");
      map2.set(key, value);
    }
    return map2;
  }
  static from(schema4, iterable, ctx) {
    const pairs2 = createPairs(schema4, iterable, ctx);
    const omap2 = new this();
    omap2.items = pairs2.items;
    return omap2;
  }
};
YAMLOMap.tag = "tag:yaml.org,2002:omap";
var omap = {
  collection: "seq",
  identify: (value) => value instanceof Map,
  nodeClass: YAMLOMap,
  default: false,
  tag: "tag:yaml.org,2002:omap",
  resolve(seq2, onError) {
    const pairs2 = resolvePairs(seq2, onError);
    const seenKeys = [];
    for (const { key } of pairs2.items) {
      if (isScalar(key)) {
        if (seenKeys.includes(key.value)) {
          onError(`Ordered maps must not include duplicate keys: ${key.value}`);
        } else {
          seenKeys.push(key.value);
        }
      }
    }
    return Object.assign(new YAMLOMap(), pairs2);
  },
  createNode: (schema4, iterable, ctx) => YAMLOMap.from(schema4, iterable, ctx)
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/bool.js
function boolStringify({ value, source }, ctx) {
  const boolObj = value ? trueTag : falseTag;
  if (source && boolObj.test.test(source))
    return source;
  return value ? ctx.options.trueStr : ctx.options.falseStr;
}
var trueTag = {
  identify: (value) => value === true,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
  resolve: () => new Scalar(true),
  stringify: boolStringify
};
var falseTag = {
  identify: (value) => value === false,
  default: true,
  tag: "tag:yaml.org,2002:bool",
  test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
  resolve: () => new Scalar(false),
  stringify: boolStringify
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/float.js
var floatNaN2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
  resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
  stringify: stringifyNumber
};
var floatExp2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "EXP",
  test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
  resolve: (str) => parseFloat(str.replace(/_/g, "")),
  stringify(node) {
    const num = Number(node.value);
    return isFinite(num) ? num.toExponential() : stringifyNumber(node);
  }
};
var float2 = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
  resolve(str) {
    const node = new Scalar(parseFloat(str.replace(/_/g, "")));
    const dot = str.indexOf(".");
    if (dot !== -1) {
      const f = str.substring(dot + 1).replace(/_/g, "");
      if (f[f.length - 1] === "0")
        node.minFractionDigits = f.length;
    }
    return node;
  },
  stringify: stringifyNumber
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/int.js
var intIdentify3 = (value) => typeof value === "bigint" || Number.isInteger(value);
function intResolve2(str, offset, radix, { intAsBigInt }) {
  const sign = str[0];
  if (sign === "-" || sign === "+")
    offset += 1;
  str = str.substring(offset).replace(/_/g, "");
  if (intAsBigInt) {
    switch (radix) {
      case 2:
        str = `0b${str}`;
        break;
      case 8:
        str = `0o${str}`;
        break;
      case 16:
        str = `0x${str}`;
        break;
    }
    const n2 = BigInt(str);
    return sign === "-" ? BigInt(-1) * n2 : n2;
  }
  const n = parseInt(str, radix);
  return sign === "-" ? -1 * n : n;
}
function intStringify2(node, radix, prefix) {
  const { value } = node;
  if (intIdentify3(value)) {
    const str = value.toString(radix);
    return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
  }
  return stringifyNumber(node);
}
var intBin = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "BIN",
  test: /^[-+]?0b[0-1_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 2, opt),
  stringify: (node) => intStringify2(node, 2, "0b")
};
var intOct2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "OCT",
  test: /^[-+]?0[0-7_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 1, 8, opt),
  stringify: (node) => intStringify2(node, 8, "0")
};
var int2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  test: /^[-+]?[0-9][0-9_]*$/,
  resolve: (str, _onError, opt) => intResolve2(str, 0, 10, opt),
  stringify: stringifyNumber
};
var intHex2 = {
  identify: intIdentify3,
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "HEX",
  test: /^[-+]?0x[0-9a-fA-F_]+$/,
  resolve: (str, _onError, opt) => intResolve2(str, 2, 16, opt),
  stringify: (node) => intStringify2(node, 16, "0x")
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/set.js
var YAMLSet = class _YAMLSet extends YAMLMap {
  constructor(schema4) {
    super(schema4);
    this.tag = _YAMLSet.tag;
  }
  add(key) {
    let pair;
    if (isPair(key))
      pair = key;
    else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
      pair = new Pair(key.key, null);
    else
      pair = new Pair(key, null);
    const prev = findPair(this.items, pair.key);
    if (!prev)
      this.items.push(pair);
  }
  /**
   * If `keepPair` is `true`, returns the Pair matching `key`.
   * Otherwise, returns the value of that Pair's key.
   */
  get(key, keepPair) {
    const pair = findPair(this.items, key);
    return !keepPair && isPair(pair) ? isScalar(pair.key) ? pair.key.value : pair.key : pair;
  }
  set(key, value) {
    if (typeof value !== "boolean")
      throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
    const prev = findPair(this.items, key);
    if (prev && !value) {
      this.items.splice(this.items.indexOf(prev), 1);
    } else if (!prev && value) {
      this.items.push(new Pair(key));
    }
  }
  toJSON(_, ctx) {
    return super.toJSON(_, ctx, Set);
  }
  toString(ctx, onComment, onChompKeep) {
    if (!ctx)
      return JSON.stringify(this);
    if (this.hasAllNullValues(true))
      return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
    else
      throw new Error("Set items must all have null values");
  }
  static from(schema4, iterable, ctx) {
    const { replacer } = ctx;
    const set2 = new this(schema4);
    if (iterable && Symbol.iterator in Object(iterable))
      for (let value of iterable) {
        if (typeof replacer === "function")
          value = replacer.call(iterable, value, value);
        set2.items.push(createPair(value, null, ctx));
      }
    return set2;
  }
};
YAMLSet.tag = "tag:yaml.org,2002:set";
var set = {
  collection: "map",
  identify: (value) => value instanceof Set,
  nodeClass: YAMLSet,
  default: false,
  tag: "tag:yaml.org,2002:set",
  createNode: (schema4, iterable, ctx) => YAMLSet.from(schema4, iterable, ctx),
  resolve(map2, onError) {
    if (isMap(map2)) {
      if (map2.hasAllNullValues(true))
        return Object.assign(new YAMLSet(), map2);
      else
        onError("Set items must all have null values");
    } else
      onError("Expected a mapping for this tag");
    return map2;
  }
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/timestamp.js
function parseSexagesimal(str, asBigInt) {
  const sign = str[0];
  const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
  const num = (n) => asBigInt ? BigInt(n) : Number(n);
  const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
  return sign === "-" ? num(-1) * res : res;
}
function stringifySexagesimal(node) {
  let { value } = node;
  let num = (n) => n;
  if (typeof value === "bigint")
    num = (n) => BigInt(n);
  else if (isNaN(value) || !isFinite(value))
    return stringifyNumber(node);
  let sign = "";
  if (value < 0) {
    sign = "-";
    value *= num(-1);
  }
  const _60 = num(60);
  const parts = [value % _60];
  if (value < 60) {
    parts.unshift(0);
  } else {
    value = (value - parts[0]) / _60;
    parts.unshift(value % _60);
    if (value >= 60) {
      value = (value - parts[0]) / _60;
      parts.unshift(value);
    }
  }
  return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
}
var intTime = {
  identify: (value) => typeof value === "bigint" || Number.isInteger(value),
  default: true,
  tag: "tag:yaml.org,2002:int",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
  resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
  stringify: stringifySexagesimal
};
var floatTime = {
  identify: (value) => typeof value === "number",
  default: true,
  tag: "tag:yaml.org,2002:float",
  format: "TIME",
  test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
  resolve: (str) => parseSexagesimal(str, false),
  stringify: stringifySexagesimal
};
var timestamp = {
  identify: (value) => value instanceof Date,
  default: true,
  tag: "tag:yaml.org,2002:timestamp",
  // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
  // may be omitted altogether, resulting in a date format. In such a case, the time part is
  // assumed to be 00:00:00Z (start of day, UTC).
  test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
  resolve(str) {
    const match = str.match(timestamp.test);
    if (!match)
      throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
    const [, year, month, day, hour, minute, second] = match.map(Number);
    const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
    let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
    const tz = match[8];
    if (tz && tz !== "Z") {
      let d = parseSexagesimal(tz, false);
      if (Math.abs(d) < 30)
        d *= 60;
      date -= 6e4 * d;
    }
    return new Date(date);
  },
  stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
};

// node_modules/yaml/browser/dist/schema/yaml-1.1/schema.js
var schema3 = [
  map,
  seq,
  string,
  nullTag,
  trueTag,
  falseTag,
  intBin,
  intOct2,
  int2,
  intHex2,
  floatNaN2,
  floatExp2,
  float2,
  binary,
  merge,
  omap,
  pairs,
  set,
  intTime,
  floatTime,
  timestamp
];

// node_modules/yaml/browser/dist/schema/tags.js
var schemas = /* @__PURE__ */ new Map([
  ["core", schema],
  ["failsafe", [map, seq, string]],
  ["json", schema2],
  ["yaml11", schema3],
  ["yaml-1.1", schema3]
]);
var tagsByName = {
  binary,
  bool: boolTag,
  float,
  floatExp,
  floatNaN,
  floatTime,
  int,
  intHex,
  intOct,
  intTime,
  map,
  merge,
  null: nullTag,
  omap,
  pairs,
  seq,
  set,
  timestamp
};
var coreKnownTags = {
  "tag:yaml.org,2002:binary": binary,
  "tag:yaml.org,2002:merge": merge,
  "tag:yaml.org,2002:omap": omap,
  "tag:yaml.org,2002:pairs": pairs,
  "tag:yaml.org,2002:set": set,
  "tag:yaml.org,2002:timestamp": timestamp
};
function getTags(customTags, schemaName, addMergeTag) {
  const schemaTags = schemas.get(schemaName);
  if (schemaTags && !customTags) {
    return addMergeTag && !schemaTags.includes(merge) ? schemaTags.concat(merge) : schemaTags.slice();
  }
  let tags = schemaTags;
  if (!tags) {
    if (Array.isArray(customTags))
      tags = [];
    else {
      const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
    }
  }
  if (Array.isArray(customTags)) {
    for (const tag of customTags)
      tags = tags.concat(tag);
  } else if (typeof customTags === "function") {
    tags = customTags(tags.slice());
  }
  if (addMergeTag)
    tags = tags.concat(merge);
  return tags.reduce((tags2, tag) => {
    const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
    if (!tagObj) {
      const tagName = JSON.stringify(tag);
      const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
      throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
    }
    if (!tags2.includes(tagObj))
      tags2.push(tagObj);
    return tags2;
  }, []);
}

// node_modules/yaml/browser/dist/schema/Schema.js
var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
var Schema = class _Schema {
  constructor({ compat, customTags, merge: merge2, resolveKnownTags, schema: schema4, sortMapEntries, toStringDefaults }) {
    this.compat = Array.isArray(compat) ? getTags(compat, "compat") : compat ? getTags(null, compat) : null;
    this.name = typeof schema4 === "string" && schema4 || "core";
    this.knownTags = resolveKnownTags ? coreKnownTags : {};
    this.tags = getTags(customTags, this.name, merge2);
    this.toStringOptions = toStringDefaults ?? null;
    Object.defineProperty(this, MAP, { value: map });
    Object.defineProperty(this, SCALAR, { value: string });
    Object.defineProperty(this, SEQ, { value: seq });
    this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
  }
  clone() {
    const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
    copy.tags = this.tags.slice();
    return copy;
  }
};

// node_modules/yaml/browser/dist/stringify/stringifyDocument.js
function stringifyDocument(doc, options) {
  const lines = [];
  let hasDirectives = options.directives === true;
  if (options.directives !== false && doc.directives) {
    const dir = doc.directives.toString(doc);
    if (dir) {
      lines.push(dir);
      hasDirectives = true;
    } else if (doc.directives.docStart)
      hasDirectives = true;
  }
  if (hasDirectives)
    lines.push("---");
  const ctx = createStringifyContext(doc, options);
  const { commentString } = ctx.options;
  if (doc.commentBefore) {
    if (lines.length !== 1)
      lines.unshift("");
    const cs = commentString(doc.commentBefore);
    lines.unshift(indentComment(cs, ""));
  }
  let chompKeep = false;
  let contentComment = null;
  if (doc.contents) {
    if (isNode(doc.contents)) {
      if (doc.contents.spaceBefore && hasDirectives)
        lines.push("");
      if (doc.contents.commentBefore) {
        const cs = commentString(doc.contents.commentBefore);
        lines.push(indentComment(cs, ""));
      }
      ctx.forceBlockIndent = !!doc.comment;
      contentComment = doc.contents.comment;
    }
    const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
    let body = stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
    if (contentComment)
      body += lineComment(body, "", commentString(contentComment));
    if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
      lines[lines.length - 1] = `--- ${body}`;
    } else
      lines.push(body);
  } else {
    lines.push(stringify(doc.contents, ctx));
  }
  if (doc.directives?.docEnd) {
    if (doc.comment) {
      const cs = commentString(doc.comment);
      if (cs.includes("\n")) {
        lines.push("...");
        lines.push(indentComment(cs, ""));
      } else {
        lines.push(`... ${cs}`);
      }
    } else {
      lines.push("...");
    }
  } else {
    let dc = doc.comment;
    if (dc && chompKeep)
      dc = dc.replace(/^\n+/, "");
    if (dc) {
      if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
        lines.push("");
      lines.push(indentComment(commentString(dc), ""));
    }
  }
  return lines.join("\n") + "\n";
}

// node_modules/yaml/browser/dist/doc/Document.js
var Document = class _Document {
  constructor(value, replacer, options) {
    this.commentBefore = null;
    this.comment = null;
    this.errors = [];
    this.warnings = [];
    Object.defineProperty(this, NODE_TYPE, { value: DOC });
    let _replacer = null;
    if (typeof replacer === "function" || Array.isArray(replacer)) {
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const opt = Object.assign({
      intAsBigInt: false,
      keepSourceTokens: false,
      logLevel: "warn",
      prettyErrors: true,
      strict: true,
      stringKeys: false,
      uniqueKeys: true,
      version: "1.2"
    }, options);
    this.options = opt;
    let { version } = opt;
    if (options?._directives) {
      this.directives = options._directives.atDocument();
      if (this.directives.yaml.explicit)
        version = this.directives.yaml.version;
    } else
      this.directives = new Directives({ version });
    this.setSchema(version, options);
    this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
  }
  /**
   * Create a deep copy of this Document and its contents.
   *
   * Custom Node values that inherit from `Object` still refer to their original instances.
   */
  clone() {
    const copy = Object.create(_Document.prototype, {
      [NODE_TYPE]: { value: DOC }
    });
    copy.commentBefore = this.commentBefore;
    copy.comment = this.comment;
    copy.errors = this.errors.slice();
    copy.warnings = this.warnings.slice();
    copy.options = Object.assign({}, this.options);
    if (this.directives)
      copy.directives = this.directives.clone();
    copy.schema = this.schema.clone();
    copy.contents = isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
    if (this.range)
      copy.range = this.range.slice();
    return copy;
  }
  /** Adds a value to the document. */
  add(value) {
    if (assertCollection(this.contents))
      this.contents.add(value);
  }
  /** Adds a value to the document. */
  addIn(path, value) {
    if (assertCollection(this.contents))
      this.contents.addIn(path, value);
  }
  /**
   * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
   *
   * If `node` already has an anchor, `name` is ignored.
   * Otherwise, the `node.anchor` value will be set to `name`,
   * or if an anchor with that name is already present in the document,
   * `name` will be used as a prefix for a new unique anchor.
   * If `name` is undefined, the generated anchor will use 'a' as a prefix.
   */
  createAlias(node, name) {
    if (!node.anchor) {
      const prev = anchorNames(this);
      node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      !name || prev.has(name) ? findNewAnchor(name || "a", prev) : name;
    }
    return new Alias(node.anchor);
  }
  createNode(value, replacer, options) {
    let _replacer = void 0;
    if (typeof replacer === "function") {
      value = replacer.call({ "": value }, "", value);
      _replacer = replacer;
    } else if (Array.isArray(replacer)) {
      const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
      const asStr = replacer.filter(keyToStr).map(String);
      if (asStr.length > 0)
        replacer = replacer.concat(asStr);
      _replacer = replacer;
    } else if (options === void 0 && replacer) {
      options = replacer;
      replacer = void 0;
    }
    const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
    const { onAnchor, setAnchors, sourceObjects } = createNodeAnchors(
      this,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      anchorPrefix || "a"
    );
    const ctx = {
      aliasDuplicateObjects: aliasDuplicateObjects ?? true,
      keepUndefined: keepUndefined ?? false,
      onAnchor,
      onTagObj,
      replacer: _replacer,
      schema: this.schema,
      sourceObjects
    };
    const node = createNode(value, tag, ctx);
    if (flow && isCollection(node))
      node.flow = true;
    setAnchors();
    return node;
  }
  /**
   * Convert a key and a value into a `Pair` using the current schema,
   * recursively wrapping all values as `Scalar` or `Collection` nodes.
   */
  createPair(key, value, options = {}) {
    const k = this.createNode(key, null, options);
    const v = this.createNode(value, null, options);
    return new Pair(k, v);
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  delete(key) {
    return assertCollection(this.contents) ? this.contents.delete(key) : false;
  }
  /**
   * Removes a value from the document.
   * @returns `true` if the item was found and removed.
   */
  deleteIn(path) {
    if (isEmptyPath(path)) {
      if (this.contents == null)
        return false;
      this.contents = null;
      return true;
    }
    return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
  }
  /**
   * Returns item at `key`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  get(key, keepScalar) {
    return isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
  }
  /**
   * Returns item at `path`, or `undefined` if not found. By default unwraps
   * scalar values from their surrounding node; to disable set `keepScalar` to
   * `true` (collections are always returned intact).
   */
  getIn(path, keepScalar) {
    if (isEmptyPath(path))
      return !keepScalar && isScalar(this.contents) ? this.contents.value : this.contents;
    return isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
  }
  /**
   * Checks if the document includes a value with the key `key`.
   */
  has(key) {
    return isCollection(this.contents) ? this.contents.has(key) : false;
  }
  /**
   * Checks if the document includes a value at `path`.
   */
  hasIn(path) {
    if (isEmptyPath(path))
      return this.contents !== void 0;
    return isCollection(this.contents) ? this.contents.hasIn(path) : false;
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  set(key, value) {
    if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, [key], value);
    } else if (assertCollection(this.contents)) {
      this.contents.set(key, value);
    }
  }
  /**
   * Sets a value in this document. For `!!set`, `value` needs to be a
   * boolean to add/remove the item from the set.
   */
  setIn(path, value) {
    if (isEmptyPath(path)) {
      this.contents = value;
    } else if (this.contents == null) {
      this.contents = collectionFromPath(this.schema, Array.from(path), value);
    } else if (assertCollection(this.contents)) {
      this.contents.setIn(path, value);
    }
  }
  /**
   * Change the YAML version and schema used by the document.
   * A `null` version disables support for directives, explicit tags, anchors, and aliases.
   * It also requires the `schema` option to be given as a `Schema` instance value.
   *
   * Overrides all previously set schema options.
   */
  setSchema(version, options = {}) {
    if (typeof version === "number")
      version = String(version);
    let opt;
    switch (version) {
      case "1.1":
        if (this.directives)
          this.directives.yaml.version = "1.1";
        else
          this.directives = new Directives({ version: "1.1" });
        opt = { resolveKnownTags: false, schema: "yaml-1.1" };
        break;
      case "1.2":
      case "next":
        if (this.directives)
          this.directives.yaml.version = version;
        else
          this.directives = new Directives({ version });
        opt = { resolveKnownTags: true, schema: "core" };
        break;
      case null:
        if (this.directives)
          delete this.directives;
        opt = null;
        break;
      default: {
        const sv = JSON.stringify(version);
        throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
      }
    }
    if (options.schema instanceof Object)
      this.schema = options.schema;
    else if (opt)
      this.schema = new Schema(Object.assign(opt, options));
    else
      throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
  }
  // json & jsonArg are only used from toJSON()
  toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
    const ctx = {
      anchors: /* @__PURE__ */ new Map(),
      doc: this,
      keep: !json,
      mapAsMap: mapAsMap === true,
      mapKeyWarned: false,
      maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
    };
    const res = toJS(this.contents, jsonArg ?? "", ctx);
    if (typeof onAnchor === "function")
      for (const { count, res: res2 } of ctx.anchors.values())
        onAnchor(res2, count);
    return typeof reviver === "function" ? applyReviver(reviver, { "": res }, "", res) : res;
  }
  /**
   * A JSON representation of the document `contents`.
   *
   * @param jsonArg Used by `JSON.stringify` to indicate the array index or
   *   property name.
   */
  toJSON(jsonArg, onAnchor) {
    return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
  }
  /** A YAML representation of the document. */
  toString(options = {}) {
    if (this.errors.length > 0)
      throw new Error("Document with errors cannot be stringified");
    if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
      const s = JSON.stringify(options.indent);
      throw new Error(`"indent" option must be a positive integer, not ${s}`);
    }
    return stringifyDocument(this, options);
  }
};
function assertCollection(contents) {
  if (isCollection(contents))
    return true;
  throw new Error("Expected a YAML collection as document contents");
}

// node_modules/yaml/browser/dist/errors.js
var YAMLError = class extends Error {
  constructor(name, pos, code, message) {
    super();
    this.name = name;
    this.code = code;
    this.message = message;
    this.pos = pos;
  }
};
var YAMLParseError = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLParseError", pos, code, message);
  }
};
var YAMLWarning = class extends YAMLError {
  constructor(pos, code, message) {
    super("YAMLWarning", pos, code, message);
  }
};
var prettifyError = (src, lc) => (error) => {
  if (error.pos[0] === -1)
    return;
  error.linePos = error.pos.map((pos) => lc.linePos(pos));
  const { line, col } = error.linePos[0];
  error.message += ` at line ${line}, column ${col}`;
  let ci = col - 1;
  let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
  if (ci >= 60 && lineStr.length > 80) {
    const trimStart = Math.min(ci - 39, lineStr.length - 79);
    lineStr = "\u2026" + lineStr.substring(trimStart);
    ci -= trimStart - 1;
  }
  if (lineStr.length > 80)
    lineStr = lineStr.substring(0, 79) + "\u2026";
  if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
    let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
    if (prev.length > 80)
      prev = prev.substring(0, 79) + "\u2026\n";
    lineStr = prev + lineStr;
  }
  if (/[^ ]/.test(lineStr)) {
    let count = 1;
    const end = error.linePos[1];
    if (end?.line === line && end.col > col) {
      count = Math.max(1, Math.min(end.col - col, 80 - ci));
    }
    const pointer = " ".repeat(ci) + "^".repeat(count);
    error.message += `:

${lineStr}
${pointer}
`;
  }
};

// node_modules/yaml/browser/dist/compose/resolve-props.js
function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
  let spaceBefore = false;
  let atNewline = startOnNewline;
  let hasSpace = startOnNewline;
  let comment = "";
  let commentSep = "";
  let hasNewline = false;
  let reqSpace = false;
  let tab = null;
  let anchor = null;
  let tag = null;
  let newlineAfterProp = null;
  let comma = null;
  let found = null;
  let start = null;
  for (const token of tokens) {
    if (reqSpace) {
      if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
        onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      reqSpace = false;
    }
    if (tab) {
      if (atNewline && token.type !== "comment" && token.type !== "newline") {
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      }
      tab = null;
    }
    switch (token.type) {
      case "space":
        if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
          tab = token;
        }
        hasSpace = true;
        break;
      case "comment": {
        if (!hasSpace)
          onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
        const cb = token.source.substring(1) || " ";
        if (!comment)
          comment = cb;
        else
          comment += commentSep + cb;
        commentSep = "";
        atNewline = false;
        break;
      }
      case "newline":
        if (atNewline) {
          if (comment)
            comment += token.source;
          else if (!found || indicator !== "seq-item-ind")
            spaceBefore = true;
        } else
          commentSep += token.source;
        atNewline = true;
        hasNewline = true;
        if (anchor || tag)
          newlineAfterProp = token;
        hasSpace = true;
        break;
      case "anchor":
        if (anchor)
          onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
        if (token.source.endsWith(":"))
          onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
        anchor = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      case "tag": {
        if (tag)
          onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
        tag = token;
        start ?? (start = token.offset);
        atNewline = false;
        hasSpace = false;
        reqSpace = true;
        break;
      }
      case indicator:
        if (anchor || tag)
          onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
        if (found)
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
        found = token;
        atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
        hasSpace = false;
        break;
      case "comma":
        if (flow) {
          if (comma)
            onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
          comma = token;
          atNewline = false;
          hasSpace = false;
          break;
        }
      // else fallthrough
      default:
        onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
        atNewline = false;
        hasSpace = false;
    }
  }
  const last = tokens[tokens.length - 1];
  const end = last ? last.offset + last.source.length : offset;
  if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
    onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
  }
  if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
    onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
  return {
    comma,
    found,
    spaceBefore,
    comment,
    hasNewline,
    anchor,
    tag,
    newlineAfterProp,
    end,
    start: start ?? end
  };
}

// node_modules/yaml/browser/dist/compose/util-contains-newline.js
function containsNewline(key) {
  if (!key)
    return null;
  switch (key.type) {
    case "alias":
    case "scalar":
    case "double-quoted-scalar":
    case "single-quoted-scalar":
      if (key.source.includes("\n"))
        return true;
      if (key.end) {
        for (const st of key.end)
          if (st.type === "newline")
            return true;
      }
      return false;
    case "flow-collection":
      for (const it of key.items) {
        for (const st of it.start)
          if (st.type === "newline")
            return true;
        if (it.sep) {
          for (const st of it.sep)
            if (st.type === "newline")
              return true;
        }
        if (containsNewline(it.key) || containsNewline(it.value))
          return true;
      }
      return false;
    default:
      return true;
  }
}

// node_modules/yaml/browser/dist/compose/util-flow-indent-check.js
function flowIndentCheck(indent, fc, onError) {
  if (fc?.type === "flow-collection") {
    const end = fc.end[0];
    if (end.indent === indent && (end.source === "]" || end.source === "}") && containsNewline(fc)) {
      const msg = "Flow end indicator should be more indented than parent";
      onError(end, "BAD_INDENT", msg, true);
    }
  }
}

// node_modules/yaml/browser/dist/compose/util-map-includes.js
function mapIncludes(ctx, items, search) {
  const { uniqueKeys } = ctx.options;
  if (uniqueKeys === false)
    return false;
  const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || isScalar(a) && isScalar(b) && a.value === b.value;
  return items.some((pair) => isEqual(pair.key, search));
}

// node_modules/yaml/browser/dist/compose/resolve-block-map.js
var startColMsg = "All mapping items must start at the same column";
function resolveBlockMap({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bm, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLMap;
  const map2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  let offset = bm.offset;
  let commentEnd = null;
  for (const collItem of bm.items) {
    const { start, key, sep: sep3, value } = collItem;
    const keyProps = resolveProps(start, {
      indicator: "explicit-key-ind",
      next: key ?? sep3?.[0],
      offset,
      onError,
      parentIndent: bm.indent,
      startOnNewline: true
    });
    const implicitKey = !keyProps.found;
    if (implicitKey) {
      if (key) {
        if (key.type === "block-seq")
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
        else if ("indent" in key && key.indent !== bm.indent)
          onError(offset, "BAD_INDENT", startColMsg);
      }
      if (!keyProps.anchor && !keyProps.tag && !sep3) {
        commentEnd = keyProps.end;
        if (keyProps.comment) {
          if (map2.comment)
            map2.comment += "\n" + keyProps.comment;
          else
            map2.comment = keyProps.comment;
        }
        continue;
      }
      if (keyProps.newlineAfterProp || containsNewline(key)) {
        onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
      }
    } else if (keyProps.found?.indent !== bm.indent) {
      onError(offset, "BAD_INDENT", startColMsg);
    }
    ctx.atKey = true;
    const keyStart = keyProps.end;
    const keyNode = key ? composeNode2(ctx, key, keyProps, onError) : composeEmptyNode2(ctx, keyStart, start, null, keyProps, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bm.indent, key, onError);
    ctx.atKey = false;
    if (mapIncludes(ctx, map2.items, keyNode))
      onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
    const valueProps = resolveProps(sep3 ?? [], {
      indicator: "map-value-ind",
      next: value,
      offset: keyNode.range[2],
      onError,
      parentIndent: bm.indent,
      startOnNewline: !key || key.type === "block-scalar"
    });
    offset = valueProps.end;
    if (valueProps.found) {
      if (implicitKey) {
        if (value?.type === "block-map" && !valueProps.hasNewline)
          onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
        if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
          onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : composeEmptyNode2(ctx, offset, sep3, null, valueProps, onError);
      if (ctx.schema.compat)
        flowIndentCheck(bm.indent, value, onError);
      offset = valueNode.range[2];
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    } else {
      if (implicitKey)
        onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
      if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      map2.items.push(pair);
    }
  }
  if (commentEnd && commentEnd < offset)
    onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
  map2.range = [bm.offset, offset, commentEnd ?? offset];
  return map2;
}

// node_modules/yaml/browser/dist/compose/resolve-block-seq.js
function resolveBlockSeq({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, bs, onError, tag) {
  const NodeClass = tag?.nodeClass ?? YAMLSeq;
  const seq2 = new NodeClass(ctx.schema);
  if (ctx.atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = bs.offset;
  let commentEnd = null;
  for (const { start, value } of bs.items) {
    const props = resolveProps(start, {
      indicator: "seq-item-ind",
      next: value,
      offset,
      onError,
      parentIndent: bs.indent,
      startOnNewline: true
    });
    if (!props.found) {
      if (props.anchor || props.tag || value) {
        if (value?.type === "block-seq")
          onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
        else
          onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
      } else {
        commentEnd = props.end;
        if (props.comment)
          seq2.comment = props.comment;
        continue;
      }
    }
    const node = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, start, null, props, onError);
    if (ctx.schema.compat)
      flowIndentCheck(bs.indent, value, onError);
    offset = node.range[2];
    seq2.items.push(node);
  }
  seq2.range = [bs.offset, offset, commentEnd ?? offset];
  return seq2;
}

// node_modules/yaml/browser/dist/compose/resolve-end.js
function resolveEnd(end, offset, reqSpace, onError) {
  let comment = "";
  if (end) {
    let hasSpace = false;
    let sep3 = "";
    for (const token of end) {
      const { source, type } = token;
      switch (type) {
        case "space":
          hasSpace = true;
          break;
        case "comment": {
          if (reqSpace && !hasSpace)
            onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
          const cb = source.substring(1) || " ";
          if (!comment)
            comment = cb;
          else
            comment += sep3 + cb;
          sep3 = "";
          break;
        }
        case "newline":
          if (comment)
            sep3 += source;
          hasSpace = true;
          break;
        default:
          onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
      }
      offset += source.length;
    }
  }
  return { comment, offset };
}

// node_modules/yaml/browser/dist/compose/resolve-flow-collection.js
var blockMsg = "Block collections are not allowed within flow collections";
var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
function resolveFlowCollection({ composeNode: composeNode2, composeEmptyNode: composeEmptyNode2 }, ctx, fc, onError, tag) {
  const isMap2 = fc.start.source === "{";
  const fcName = isMap2 ? "flow map" : "flow sequence";
  const NodeClass = tag?.nodeClass ?? (isMap2 ? YAMLMap : YAMLSeq);
  const coll = new NodeClass(ctx.schema);
  coll.flow = true;
  const atRoot = ctx.atRoot;
  if (atRoot)
    ctx.atRoot = false;
  if (ctx.atKey)
    ctx.atKey = false;
  let offset = fc.offset + fc.start.source.length;
  for (let i = 0; i < fc.items.length; ++i) {
    const collItem = fc.items[i];
    const { start, key, sep: sep3, value } = collItem;
    const props = resolveProps(start, {
      flow: fcName,
      indicator: "explicit-key-ind",
      next: key ?? sep3?.[0],
      offset,
      onError,
      parentIndent: fc.indent,
      startOnNewline: false
    });
    if (!props.found) {
      if (!props.anchor && !props.tag && !sep3 && !value) {
        if (i === 0 && props.comma)
          onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        else if (i < fc.items.length - 1)
          onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
        if (props.comment) {
          if (coll.comment)
            coll.comment += "\n" + props.comment;
          else
            coll.comment = props.comment;
        }
        offset = props.end;
        continue;
      }
      if (!isMap2 && ctx.options.strict && containsNewline(key))
        onError(
          key,
          // checked by containsNewline()
          "MULTILINE_IMPLICIT_KEY",
          "Implicit keys of flow sequence pairs need to be on a single line"
        );
    }
    if (i === 0) {
      if (props.comma)
        onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
    } else {
      if (!props.comma)
        onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
      if (props.comment) {
        let prevItemComment = "";
        loop: for (const st of start) {
          switch (st.type) {
            case "comma":
            case "space":
              break;
            case "comment":
              prevItemComment = st.source.substring(1);
              break loop;
            default:
              break loop;
          }
        }
        if (prevItemComment) {
          let prev = coll.items[coll.items.length - 1];
          if (isPair(prev))
            prev = prev.value ?? prev.key;
          if (prev.comment)
            prev.comment += "\n" + prevItemComment;
          else
            prev.comment = prevItemComment;
          props.comment = props.comment.substring(prevItemComment.length + 1);
        }
      }
    }
    if (!isMap2 && !sep3 && !props.found) {
      const valueNode = value ? composeNode2(ctx, value, props, onError) : composeEmptyNode2(ctx, props.end, sep3, null, props, onError);
      coll.items.push(valueNode);
      offset = valueNode.range[2];
      if (isBlock(value))
        onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
    } else {
      ctx.atKey = true;
      const keyStart = props.end;
      const keyNode = key ? composeNode2(ctx, key, props, onError) : composeEmptyNode2(ctx, keyStart, start, null, props, onError);
      if (isBlock(key))
        onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
      ctx.atKey = false;
      const valueProps = resolveProps(sep3 ?? [], {
        flow: fcName,
        indicator: "map-value-ind",
        next: value,
        offset: keyNode.range[2],
        onError,
        parentIndent: fc.indent,
        startOnNewline: false
      });
      if (valueProps.found) {
        if (!isMap2 && !props.found && ctx.options.strict) {
          if (sep3)
            for (const st of sep3) {
              if (st === valueProps.found)
                break;
              if (st.type === "newline") {
                onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                break;
              }
            }
          if (props.start < valueProps.found.offset - 1024)
            onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
        }
      } else if (value) {
        if ("source" in value && value.source?.[0] === ":")
          onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
        else
          onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
      }
      const valueNode = value ? composeNode2(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode2(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
      if (valueNode) {
        if (isBlock(value))
          onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
      } else if (valueProps.comment) {
        if (keyNode.comment)
          keyNode.comment += "\n" + valueProps.comment;
        else
          keyNode.comment = valueProps.comment;
      }
      const pair = new Pair(keyNode, valueNode);
      if (ctx.options.keepSourceTokens)
        pair.srcToken = collItem;
      if (isMap2) {
        const map2 = coll;
        if (mapIncludes(ctx, map2.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        map2.items.push(pair);
      } else {
        const map2 = new YAMLMap(ctx.schema);
        map2.flow = true;
        map2.items.push(pair);
        const endRange = (valueNode ?? keyNode).range;
        map2.range = [keyNode.range[0], endRange[1], endRange[2]];
        coll.items.push(map2);
      }
      offset = valueNode ? valueNode.range[2] : valueProps.end;
    }
  }
  const expectedEnd = isMap2 ? "}" : "]";
  const [ce, ...ee] = fc.end;
  let cePos = offset;
  if (ce?.source === expectedEnd)
    cePos = ce.offset + ce.source.length;
  else {
    const name = fcName[0].toUpperCase() + fcName.substring(1);
    const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
    onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
    if (ce && ce.source.length !== 1)
      ee.unshift(ce);
  }
  if (ee.length > 0) {
    const end = resolveEnd(ee, cePos, ctx.options.strict, onError);
    if (end.comment) {
      if (coll.comment)
        coll.comment += "\n" + end.comment;
      else
        coll.comment = end.comment;
    }
    coll.range = [fc.offset, cePos, end.offset];
  } else {
    coll.range = [fc.offset, cePos, cePos];
  }
  return coll;
}

// node_modules/yaml/browser/dist/compose/compose-collection.js
function resolveCollection(CN2, ctx, token, onError, tagName, tag) {
  const coll = token.type === "block-map" ? resolveBlockMap(CN2, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq(CN2, ctx, token, onError, tag) : resolveFlowCollection(CN2, ctx, token, onError, tag);
  const Coll = coll.constructor;
  if (tagName === "!" || tagName === Coll.tagName) {
    coll.tag = Coll.tagName;
    return coll;
  }
  if (tagName)
    coll.tag = tagName;
  return coll;
}
function composeCollection(CN2, ctx, token, props, onError) {
  const tagToken = props.tag;
  const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
  if (token.type === "block-seq") {
    const { anchor, newlineAfterProp: nl } = props;
    const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
    if (lastProp && (!nl || nl.offset < lastProp.offset)) {
      const message = "Missing newline after block sequence props";
      onError(lastProp, "MISSING_CHAR", message);
    }
  }
  const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
  if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.tagName && expType === "seq") {
    return resolveCollection(CN2, ctx, token, onError, tagName);
  }
  let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
  if (!tag) {
    const kt = ctx.schema.knownTags[tagName];
    if (kt?.collection === expType) {
      ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
      tag = kt;
    } else {
      if (kt) {
        onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
      } else {
        onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
      }
      return resolveCollection(CN2, ctx, token, onError, tagName);
    }
  }
  const coll = resolveCollection(CN2, ctx, token, onError, tagName, tag);
  const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
  const node = isNode(res) ? res : new Scalar(res);
  node.range = coll.range;
  node.tag = tagName;
  if (tag?.format)
    node.format = tag.format;
  return node;
}

// node_modules/yaml/browser/dist/compose/resolve-block-scalar.js
function resolveBlockScalar(ctx, scalar, onError) {
  const start = scalar.offset;
  const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
  if (!header)
    return { value: "", type: null, comment: "", range: [start, start, start] };
  const type = header.mode === ">" ? Scalar.BLOCK_FOLDED : Scalar.BLOCK_LITERAL;
  const lines = scalar.source ? splitLines(scalar.source) : [];
  let chompStart = lines.length;
  for (let i = lines.length - 1; i >= 0; --i) {
    const content = lines[i][1];
    if (content === "" || content === "\r")
      chompStart = i;
    else
      break;
  }
  if (chompStart === 0) {
    const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
    let end2 = start + header.length;
    if (scalar.source)
      end2 += scalar.source.length;
    return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
  }
  let trimIndent = scalar.indent + header.indent;
  let offset = scalar.offset + header.length;
  let contentStart = 0;
  for (let i = 0; i < chompStart; ++i) {
    const [indent, content] = lines[i];
    if (content === "" || content === "\r") {
      if (header.indent === 0 && indent.length > trimIndent)
        trimIndent = indent.length;
    } else {
      if (indent.length < trimIndent) {
        const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
        onError(offset + indent.length, "MISSING_CHAR", message);
      }
      if (header.indent === 0)
        trimIndent = indent.length;
      contentStart = i;
      if (trimIndent === 0 && !ctx.atRoot) {
        const message = "Block scalar values in collections must be indented";
        onError(offset, "BAD_INDENT", message);
      }
      break;
    }
    offset += indent.length + content.length + 1;
  }
  for (let i = lines.length - 1; i >= chompStart; --i) {
    if (lines[i][0].length > trimIndent)
      chompStart = i + 1;
  }
  let value = "";
  let sep3 = "";
  let prevMoreIndented = false;
  for (let i = 0; i < contentStart; ++i)
    value += lines[i][0].slice(trimIndent) + "\n";
  for (let i = contentStart; i < chompStart; ++i) {
    let [indent, content] = lines[i];
    offset += indent.length + content.length + 1;
    const crlf = content[content.length - 1] === "\r";
    if (crlf)
      content = content.slice(0, -1);
    if (content && indent.length < trimIndent) {
      const src = header.indent ? "explicit indentation indicator" : "first line";
      const message = `Block scalar lines must not be less indented than their ${src}`;
      onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
      indent = "";
    }
    if (type === Scalar.BLOCK_LITERAL) {
      value += sep3 + indent.slice(trimIndent) + content;
      sep3 = "\n";
    } else if (indent.length > trimIndent || content[0] === "	") {
      if (sep3 === " ")
        sep3 = "\n";
      else if (!prevMoreIndented && sep3 === "\n")
        sep3 = "\n\n";
      value += sep3 + indent.slice(trimIndent) + content;
      sep3 = "\n";
      prevMoreIndented = true;
    } else if (content === "") {
      if (sep3 === "\n")
        value += "\n";
      else
        sep3 = "\n";
    } else {
      value += sep3 + content;
      sep3 = " ";
      prevMoreIndented = false;
    }
  }
  switch (header.chomp) {
    case "-":
      break;
    case "+":
      for (let i = chompStart; i < lines.length; ++i)
        value += "\n" + lines[i][0].slice(trimIndent);
      if (value[value.length - 1] !== "\n")
        value += "\n";
      break;
    default:
      value += "\n";
  }
  const end = start + header.length + scalar.source.length;
  return { value, type, comment: header.comment, range: [start, end, end] };
}
function parseBlockScalarHeader({ offset, props }, strict, onError) {
  if (props[0].type !== "block-scalar-header") {
    onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
    return null;
  }
  const { source } = props[0];
  const mode = source[0];
  let indent = 0;
  let chomp = "";
  let error = -1;
  for (let i = 1; i < source.length; ++i) {
    const ch = source[i];
    if (!chomp && (ch === "-" || ch === "+"))
      chomp = ch;
    else {
      const n = Number(ch);
      if (!indent && n)
        indent = n;
      else if (error === -1)
        error = offset + i;
    }
  }
  if (error !== -1)
    onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
  let hasSpace = false;
  let comment = "";
  let length = source.length;
  for (let i = 1; i < props.length; ++i) {
    const token = props[i];
    switch (token.type) {
      case "space":
        hasSpace = true;
      // fallthrough
      case "newline":
        length += token.source.length;
        break;
      case "comment":
        if (strict && !hasSpace) {
          const message = "Comments must be separated from other tokens by white space characters";
          onError(token, "MISSING_CHAR", message);
        }
        length += token.source.length;
        comment = token.source.substring(1);
        break;
      case "error":
        onError(token, "UNEXPECTED_TOKEN", token.message);
        length += token.source.length;
        break;
      /* istanbul ignore next should not happen */
      default: {
        const message = `Unexpected token in block scalar header: ${token.type}`;
        onError(token, "UNEXPECTED_TOKEN", message);
        const ts = token.source;
        if (ts && typeof ts === "string")
          length += ts.length;
      }
    }
  }
  return { mode, indent, chomp, comment, length };
}
function splitLines(source) {
  const split = source.split(/\n( *)/);
  const first = split[0];
  const m = first.match(/^( *)/);
  const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
  const lines = [line0];
  for (let i = 1; i < split.length; i += 2)
    lines.push([split[i], split[i + 1]]);
  return lines;
}

// node_modules/yaml/browser/dist/compose/resolve-flow-scalar.js
function resolveFlowScalar(scalar, strict, onError) {
  const { offset, type, source, end } = scalar;
  let _type;
  let value;
  const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
  switch (type) {
    case "scalar":
      _type = Scalar.PLAIN;
      value = plainValue(source, _onError);
      break;
    case "single-quoted-scalar":
      _type = Scalar.QUOTE_SINGLE;
      value = singleQuotedValue(source, _onError);
      break;
    case "double-quoted-scalar":
      _type = Scalar.QUOTE_DOUBLE;
      value = doubleQuotedValue(source, _onError);
      break;
    /* istanbul ignore next should not happen */
    default:
      onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
      return {
        value: "",
        type: null,
        comment: "",
        range: [offset, offset + source.length, offset + source.length]
      };
  }
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, strict, onError);
  return {
    value,
    type: _type,
    comment: re.comment,
    range: [offset, valueEnd, re.offset]
  };
}
function plainValue(source, onError) {
  let badChar = "";
  switch (source[0]) {
    /* istanbul ignore next should not happen */
    case "	":
      badChar = "a tab character";
      break;
    case ",":
      badChar = "flow indicator character ,";
      break;
    case "%":
      badChar = "directive indicator character %";
      break;
    case "|":
    case ">": {
      badChar = `block scalar indicator ${source[0]}`;
      break;
    }
    case "@":
    case "`": {
      badChar = `reserved character ${source[0]}`;
      break;
    }
  }
  if (badChar)
    onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
  return foldLines(source);
}
function singleQuotedValue(source, onError) {
  if (source[source.length - 1] !== "'" || source.length === 1)
    onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
  return foldLines(source.slice(1, -1)).replace(/''/g, "'");
}
function foldLines(source) {
  let first, line;
  try {
    first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
    line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
  } catch {
    first = /(.*?)[ \t]*\r?\n/sy;
    line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
  }
  let match = first.exec(source);
  if (!match)
    return source;
  let res = match[1];
  let sep3 = " ";
  let pos = first.lastIndex;
  line.lastIndex = pos;
  while (match = line.exec(source)) {
    if (match[1] === "") {
      if (sep3 === "\n")
        res += sep3;
      else
        sep3 = "\n";
    } else {
      res += sep3 + match[1];
      sep3 = " ";
    }
    pos = line.lastIndex;
  }
  const last = /[ \t]*(.*)/sy;
  last.lastIndex = pos;
  match = last.exec(source);
  return res + sep3 + (match?.[1] ?? "");
}
function doubleQuotedValue(source, onError) {
  let res = "";
  for (let i = 1; i < source.length - 1; ++i) {
    const ch = source[i];
    if (ch === "\r" && source[i + 1] === "\n")
      continue;
    if (ch === "\n") {
      const { fold, offset } = foldNewline(source, i);
      res += fold;
      i = offset;
    } else if (ch === "\\") {
      let next = source[++i];
      const cc = escapeCodes[next];
      if (cc)
        res += cc;
      else if (next === "\n") {
        next = source[i + 1];
        while (next === " " || next === "	")
          next = source[++i + 1];
      } else if (next === "\r" && source[i + 1] === "\n") {
        next = source[++i + 1];
        while (next === " " || next === "	")
          next = source[++i + 1];
      } else if (next === "x" || next === "u" || next === "U") {
        const length = next === "x" ? 2 : next === "u" ? 4 : 8;
        res += parseCharCode(source, i + 1, length, onError);
        i += length;
      } else {
        const raw = source.substr(i - 1, 2);
        onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        res += raw;
      }
    } else if (ch === " " || ch === "	") {
      const wsStart = i;
      let next = source[i + 1];
      while (next === " " || next === "	")
        next = source[++i + 1];
      if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
        res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
    } else {
      res += ch;
    }
  }
  if (source[source.length - 1] !== '"' || source.length === 1)
    onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
  return res;
}
function foldNewline(source, offset) {
  let fold = "";
  let ch = source[offset + 1];
  while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
    if (ch === "\r" && source[offset + 2] !== "\n")
      break;
    if (ch === "\n")
      fold += "\n";
    offset += 1;
    ch = source[offset + 1];
  }
  if (!fold)
    fold = " ";
  return { fold, offset };
}
var escapeCodes = {
  "0": "\0",
  // null character
  a: "\x07",
  // bell character
  b: "\b",
  // backspace
  e: "\x1B",
  // escape character
  f: "\f",
  // form feed
  n: "\n",
  // line feed
  r: "\r",
  // carriage return
  t: "	",
  // horizontal tab
  v: "\v",
  // vertical tab
  N: "\x85",
  // Unicode next line
  _: "\xA0",
  // Unicode non-breaking space
  L: "\u2028",
  // Unicode line separator
  P: "\u2029",
  // Unicode paragraph separator
  " ": " ",
  '"': '"',
  "/": "/",
  "\\": "\\",
  "	": "	"
};
function parseCharCode(source, offset, length, onError) {
  const cc = source.substr(offset, length);
  const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
  const code = ok ? parseInt(cc, 16) : NaN;
  try {
    return String.fromCodePoint(code);
  } catch {
    const raw = source.substr(offset - 2, length + 2);
    onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
    return raw;
  }
}

// node_modules/yaml/browser/dist/compose/compose-scalar.js
function composeScalar(ctx, token, tagToken, onError) {
  const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar(ctx, token, onError) : resolveFlowScalar(token, ctx.options.strict, onError);
  const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
  let tag;
  if (ctx.options.stringKeys && ctx.atKey) {
    tag = ctx.schema[SCALAR];
  } else if (tagName)
    tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
  else if (token.type === "scalar")
    tag = findScalarTagByTest(ctx, value, token, onError);
  else
    tag = ctx.schema[SCALAR];
  let scalar;
  try {
    const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
    scalar = isScalar(res) ? res : new Scalar(res);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
    scalar = new Scalar(value);
  }
  scalar.range = range;
  scalar.source = value;
  if (type)
    scalar.type = type;
  if (tagName)
    scalar.tag = tagName;
  if (tag.format)
    scalar.format = tag.format;
  if (comment)
    scalar.comment = comment;
  return scalar;
}
function findScalarTagByName(schema4, value, tagName, tagToken, onError) {
  if (tagName === "!")
    return schema4[SCALAR];
  const matchWithTest = [];
  for (const tag of schema4.tags) {
    if (!tag.collection && tag.tag === tagName) {
      if (tag.default && tag.test)
        matchWithTest.push(tag);
      else
        return tag;
    }
  }
  for (const tag of matchWithTest)
    if (tag.test?.test(value))
      return tag;
  const kt = schema4.knownTags[tagName];
  if (kt && !kt.collection) {
    schema4.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
    return kt;
  }
  onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
  return schema4[SCALAR];
}
function findScalarTagByTest({ atKey, directives, schema: schema4 }, value, token, onError) {
  const tag = schema4.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema4[SCALAR];
  if (schema4.compat) {
    const compat = schema4.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema4[SCALAR];
    if (tag.tag !== compat.tag) {
      const ts = directives.tagString(tag.tag);
      const cs = directives.tagString(compat.tag);
      const msg = `Value may be parsed as either ${ts} or ${cs}`;
      onError(token, "TAG_RESOLVE_FAILED", msg, true);
    }
  }
  return tag;
}

// node_modules/yaml/browser/dist/compose/util-empty-scalar-position.js
function emptyScalarPosition(offset, before, pos) {
  if (before) {
    pos ?? (pos = before.length);
    for (let i = pos - 1; i >= 0; --i) {
      let st = before[i];
      switch (st.type) {
        case "space":
        case "comment":
        case "newline":
          offset -= st.source.length;
          continue;
      }
      st = before[++i];
      while (st?.type === "space") {
        offset += st.source.length;
        st = before[++i];
      }
      break;
    }
  }
  return offset;
}

// node_modules/yaml/browser/dist/compose/compose-node.js
var CN = { composeNode, composeEmptyNode };
function composeNode(ctx, token, props, onError) {
  const atKey = ctx.atKey;
  const { spaceBefore, comment, anchor, tag } = props;
  let node;
  let isSrcToken = true;
  switch (token.type) {
    case "alias":
      node = composeAlias(ctx, token, onError);
      if (anchor || tag)
        onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
      break;
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "block-scalar":
      node = composeScalar(ctx, token, tag, onError);
      if (anchor)
        node.anchor = anchor.source.substring(1);
      break;
    case "block-map":
    case "block-seq":
    case "flow-collection":
      try {
        node = composeCollection(CN, ctx, token, props, onError);
        if (anchor)
          node.anchor = anchor.source.substring(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onError(token, "RESOURCE_EXHAUSTION", message);
      }
      break;
    default: {
      const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
      onError(token, "UNEXPECTED_TOKEN", message);
      isSrcToken = false;
    }
  }
  node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
  if (anchor && node.anchor === "")
    onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  if (atKey && ctx.options.stringKeys && (!isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
    const msg = "With stringKeys, all keys must be strings";
    onError(tag ?? token, "NON_STRING_KEY", msg);
  }
  if (spaceBefore)
    node.spaceBefore = true;
  if (comment) {
    if (token.type === "scalar" && token.source === "")
      node.comment = comment;
    else
      node.commentBefore = comment;
  }
  if (ctx.options.keepSourceTokens && isSrcToken)
    node.srcToken = token;
  return node;
}
function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
  const token = {
    type: "scalar",
    offset: emptyScalarPosition(offset, before, pos),
    indent: -1,
    source: ""
  };
  const node = composeScalar(ctx, token, tag, onError);
  if (anchor) {
    node.anchor = anchor.source.substring(1);
    if (node.anchor === "")
      onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
  }
  if (spaceBefore)
    node.spaceBefore = true;
  if (comment) {
    node.comment = comment;
    node.range[2] = end;
  }
  return node;
}
function composeAlias({ options }, { offset, source, end }, onError) {
  const alias = new Alias(source.substring(1));
  if (alias.source === "")
    onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
  if (alias.source.endsWith(":"))
    onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
  const valueEnd = offset + source.length;
  const re = resolveEnd(end, valueEnd, options.strict, onError);
  alias.range = [offset, valueEnd, re.offset];
  if (re.comment)
    alias.comment = re.comment;
  return alias;
}

// node_modules/yaml/browser/dist/compose/compose-doc.js
function composeDoc(options, directives, { offset, start, value, end }, onError) {
  const opts = Object.assign({ _directives: directives }, options);
  const doc = new Document(void 0, opts);
  const ctx = {
    atKey: false,
    atRoot: true,
    directives: doc.directives,
    options: doc.options,
    schema: doc.schema
  };
  const props = resolveProps(start, {
    indicator: "doc-start",
    next: value ?? end?.[0],
    offset,
    onError,
    parentIndent: 0,
    startOnNewline: true
  });
  if (props.found) {
    doc.directives.docStart = true;
    if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
      onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
  }
  doc.contents = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
  const contentEnd = doc.contents.range[2];
  const re = resolveEnd(end, contentEnd, false, onError);
  if (re.comment)
    doc.comment = re.comment;
  doc.range = [offset, contentEnd, re.offset];
  return doc;
}

// node_modules/yaml/browser/dist/compose/composer.js
function getErrorPos(src) {
  if (typeof src === "number")
    return [src, src + 1];
  if (Array.isArray(src))
    return src.length === 2 ? src : [src[0], src[1]];
  const { offset, source } = src;
  return [offset, offset + (typeof source === "string" ? source.length : 1)];
}
function parsePrelude(prelude) {
  let comment = "";
  let atComment = false;
  let afterEmptyLine = false;
  for (let i = 0; i < prelude.length; ++i) {
    const source = prelude[i];
    switch (source[0]) {
      case "#":
        comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
        atComment = true;
        afterEmptyLine = false;
        break;
      case "%":
        if (prelude[i + 1]?.[0] !== "#")
          i += 1;
        atComment = false;
        break;
      default:
        if (!atComment)
          afterEmptyLine = true;
        atComment = false;
    }
  }
  return { comment, afterEmptyLine };
}
var Composer = class {
  constructor(options = {}) {
    this.doc = null;
    this.atDirectives = false;
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
    this.onError = (source, code, message, warning) => {
      const pos = getErrorPos(source);
      if (warning)
        this.warnings.push(new YAMLWarning(pos, code, message));
      else
        this.errors.push(new YAMLParseError(pos, code, message));
    };
    this.directives = new Directives({ version: options.version || "1.2" });
    this.options = options;
  }
  decorate(doc, afterDoc) {
    const { comment, afterEmptyLine } = parsePrelude(this.prelude);
    if (comment) {
      const dc = doc.contents;
      if (afterDoc) {
        doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
      } else if (afterEmptyLine || doc.directives.docStart || !dc) {
        doc.commentBefore = comment;
      } else if (isCollection(dc) && !dc.flow && dc.items.length > 0) {
        let it = dc.items[0];
        if (isPair(it))
          it = it.key;
        const cb = it.commentBefore;
        it.commentBefore = cb ? `${comment}
${cb}` : comment;
      } else {
        const cb = dc.commentBefore;
        dc.commentBefore = cb ? `${comment}
${cb}` : comment;
      }
    }
    if (afterDoc) {
      for (let i = 0; i < this.errors.length; ++i)
        doc.errors.push(this.errors[i]);
      for (let i = 0; i < this.warnings.length; ++i)
        doc.warnings.push(this.warnings[i]);
    } else {
      doc.errors = this.errors;
      doc.warnings = this.warnings;
    }
    this.prelude = [];
    this.errors = [];
    this.warnings = [];
  }
  /**
   * Current stream status information.
   *
   * Mostly useful at the end of input for an empty stream.
   */
  streamInfo() {
    return {
      comment: parsePrelude(this.prelude).comment,
      directives: this.directives,
      errors: this.errors,
      warnings: this.warnings
    };
  }
  /**
   * Compose tokens into documents.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *compose(tokens, forceDoc = false, endOffset = -1) {
    for (const token of tokens)
      yield* this.next(token);
    yield* this.end(forceDoc, endOffset);
  }
  /** Advance the composer by one CST token. */
  *next(token) {
    switch (token.type) {
      case "directive":
        this.directives.add(token.source, (offset, message, warning) => {
          const pos = getErrorPos(token);
          pos[0] += offset;
          this.onError(pos, "BAD_DIRECTIVE", message, warning);
        });
        this.prelude.push(token.source);
        this.atDirectives = true;
        break;
      case "document": {
        const doc = composeDoc(this.options, this.directives, token, this.onError);
        if (this.atDirectives && !doc.directives.docStart)
          this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
        this.decorate(doc, false);
        if (this.doc)
          yield this.doc;
        this.doc = doc;
        this.atDirectives = false;
        break;
      }
      case "byte-order-mark":
      case "space":
        break;
      case "comment":
      case "newline":
        this.prelude.push(token.source);
        break;
      case "error": {
        const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
        const error = new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
        if (this.atDirectives || !this.doc)
          this.errors.push(error);
        else
          this.doc.errors.push(error);
        break;
      }
      case "doc-end": {
        if (!this.doc) {
          const msg = "Unexpected doc-end without preceding document";
          this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
          break;
        }
        this.doc.directives.docEnd = true;
        const end = resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
        this.decorate(this.doc, true);
        if (end.comment) {
          const dc = this.doc.comment;
          this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
        }
        this.doc.range[2] = end.offset;
        break;
      }
      default:
        this.errors.push(new YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
    }
  }
  /**
   * Call at end of input to yield any remaining document.
   *
   * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
   * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
   */
  *end(forceDoc = false, endOffset = -1) {
    if (this.doc) {
      this.decorate(this.doc, true);
      yield this.doc;
      this.doc = null;
    } else if (forceDoc) {
      const opts = Object.assign({ _directives: this.directives }, this.options);
      const doc = new Document(void 0, opts);
      if (this.atDirectives)
        this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
      doc.range = [0, endOffset, endOffset];
      this.decorate(doc, false);
      yield doc;
    }
  }
};

// node_modules/yaml/browser/dist/parse/cst-visit.js
var BREAK2 = /* @__PURE__ */ Symbol("break visit");
var SKIP2 = /* @__PURE__ */ Symbol("skip children");
var REMOVE2 = /* @__PURE__ */ Symbol("remove item");
function visit2(cst, visitor) {
  if ("type" in cst && cst.type === "document")
    cst = { start: cst.start, value: cst.value };
  _visit(Object.freeze([]), cst, visitor);
}
visit2.BREAK = BREAK2;
visit2.SKIP = SKIP2;
visit2.REMOVE = REMOVE2;
visit2.itemAtPath = (cst, path) => {
  let item = cst;
  for (const [field, index] of path) {
    const tok = item?.[field];
    if (tok && "items" in tok) {
      item = tok.items[index];
    } else
      return void 0;
  }
  return item;
};
visit2.parentCollection = (cst, path) => {
  const parent = visit2.itemAtPath(cst, path.slice(0, -1));
  const field = path[path.length - 1][0];
  const coll = parent?.[field];
  if (coll && "items" in coll)
    return coll;
  throw new Error("Parent collection not found");
};
function _visit(path, item, visitor) {
  let ctrl = visitor(item, path);
  if (typeof ctrl === "symbol")
    return ctrl;
  for (const field of ["key", "value"]) {
    const token = item[field];
    if (token && "items" in token) {
      for (let i = 0; i < token.items.length; ++i) {
        const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
        if (typeof ci === "number")
          i = ci - 1;
        else if (ci === BREAK2)
          return BREAK2;
        else if (ci === REMOVE2) {
          token.items.splice(i, 1);
          i -= 1;
        }
      }
      if (typeof ctrl === "function" && field === "key")
        ctrl = ctrl(item, path);
    }
  }
  return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
}

// node_modules/yaml/browser/dist/parse/cst.js
var BOM = "\uFEFF";
var DOCUMENT = "";
var FLOW_END = "";
var SCALAR2 = "";
function tokenType(source) {
  switch (source) {
    case BOM:
      return "byte-order-mark";
    case DOCUMENT:
      return "doc-mode";
    case FLOW_END:
      return "flow-error-end";
    case SCALAR2:
      return "scalar";
    case "---":
      return "doc-start";
    case "...":
      return "doc-end";
    case "":
    case "\n":
    case "\r\n":
      return "newline";
    case "-":
      return "seq-item-ind";
    case "?":
      return "explicit-key-ind";
    case ":":
      return "map-value-ind";
    case "{":
      return "flow-map-start";
    case "}":
      return "flow-map-end";
    case "[":
      return "flow-seq-start";
    case "]":
      return "flow-seq-end";
    case ",":
      return "comma";
  }
  switch (source[0]) {
    case " ":
    case "	":
      return "space";
    case "#":
      return "comment";
    case "%":
      return "directive-line";
    case "*":
      return "alias";
    case "&":
      return "anchor";
    case "!":
      return "tag";
    case "'":
      return "single-quoted-scalar";
    case '"':
      return "double-quoted-scalar";
    case "|":
    case ">":
      return "block-scalar-header";
  }
  return null;
}

// node_modules/yaml/browser/dist/parse/lexer.js
function isEmpty(ch) {
  switch (ch) {
    case void 0:
    case " ":
    case "\n":
    case "\r":
    case "	":
      return true;
    default:
      return false;
  }
}
var hexDigits = new Set("0123456789ABCDEFabcdef");
var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
var flowIndicatorChars = new Set(",[]{}");
var invalidAnchorChars = new Set(" ,[]{}\n\r	");
var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
var Lexer = class {
  constructor() {
    this.atEnd = false;
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    this.buffer = "";
    this.flowKey = false;
    this.flowLevel = 0;
    this.indentNext = 0;
    this.indentValue = 0;
    this.lineEndPos = null;
    this.next = null;
    this.pos = 0;
  }
  /**
   * Generate YAML tokens from the `source` string. If `incomplete`,
   * a part of the last line may be left as a buffer for the next call.
   *
   * @returns A generator of lexical tokens
   */
  *lex(source, incomplete = false) {
    if (source) {
      if (typeof source !== "string")
        throw TypeError("source is not a string");
      this.buffer = this.buffer ? this.buffer + source : source;
      this.lineEndPos = null;
    }
    this.atEnd = !incomplete;
    let next = this.next ?? "stream";
    while (next && (incomplete || this.hasChars(1)))
      next = yield* this.parseNext(next);
  }
  atLineEnd() {
    let i = this.pos;
    let ch = this.buffer[i];
    while (ch === " " || ch === "	")
      ch = this.buffer[++i];
    if (!ch || ch === "#" || ch === "\n")
      return true;
    if (ch === "\r")
      return this.buffer[i + 1] === "\n";
    return false;
  }
  charAt(n) {
    return this.buffer[this.pos + n];
  }
  continueScalar(offset) {
    let ch = this.buffer[offset];
    if (this.indentNext > 0) {
      let indent = 0;
      while (ch === " ")
        ch = this.buffer[++indent + offset];
      if (ch === "\r") {
        const next = this.buffer[indent + offset + 1];
        if (next === "\n" || !next && !this.atEnd)
          return offset + indent + 1;
      }
      return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
    }
    if (ch === "-" || ch === ".") {
      const dt = this.buffer.substr(offset, 3);
      if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
        return -1;
    }
    return offset;
  }
  getLine() {
    let end = this.lineEndPos;
    if (typeof end !== "number" || end !== -1 && end < this.pos) {
      end = this.buffer.indexOf("\n", this.pos);
      this.lineEndPos = end;
    }
    if (end === -1)
      return this.atEnd ? this.buffer.substring(this.pos) : null;
    if (this.buffer[end - 1] === "\r")
      end -= 1;
    return this.buffer.substring(this.pos, end);
  }
  hasChars(n) {
    return this.pos + n <= this.buffer.length;
  }
  setNext(state) {
    this.buffer = this.buffer.substring(this.pos);
    this.pos = 0;
    this.lineEndPos = null;
    this.next = state;
    return null;
  }
  peek(n) {
    return this.buffer.substr(this.pos, n);
  }
  *parseNext(next) {
    switch (next) {
      case "stream":
        return yield* this.parseStream();
      case "line-start":
        return yield* this.parseLineStart();
      case "block-start":
        return yield* this.parseBlockStart();
      case "doc":
        return yield* this.parseDocument();
      case "flow":
        return yield* this.parseFlowCollection();
      case "quoted-scalar":
        return yield* this.parseQuotedScalar();
      case "block-scalar":
        return yield* this.parseBlockScalar();
      case "plain-scalar":
        return yield* this.parsePlainScalar();
    }
  }
  *parseStream() {
    let line = this.getLine();
    if (line === null)
      return this.setNext("stream");
    if (line[0] === BOM) {
      yield* this.pushCount(1);
      line = line.substring(1);
    }
    if (line[0] === "%") {
      let dirEnd = line.length;
      let cs = line.indexOf("#");
      while (cs !== -1) {
        const ch = line[cs - 1];
        if (ch === " " || ch === "	") {
          dirEnd = cs - 1;
          break;
        } else {
          cs = line.indexOf("#", cs + 1);
        }
      }
      while (true) {
        const ch = line[dirEnd - 1];
        if (ch === " " || ch === "	")
          dirEnd -= 1;
        else
          break;
      }
      const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
      yield* this.pushCount(line.length - n);
      this.pushNewline();
      return "stream";
    }
    if (this.atLineEnd()) {
      const sp = yield* this.pushSpaces(true);
      yield* this.pushCount(line.length - sp);
      yield* this.pushNewline();
      return "stream";
    }
    yield DOCUMENT;
    return yield* this.parseLineStart();
  }
  *parseLineStart() {
    const ch = this.charAt(0);
    if (!ch && !this.atEnd)
      return this.setNext("line-start");
    if (ch === "-" || ch === ".") {
      if (!this.atEnd && !this.hasChars(4))
        return this.setNext("line-start");
      const s = this.peek(3);
      if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
        yield* this.pushCount(3);
        this.indentValue = 0;
        this.indentNext = 0;
        return s === "---" ? "doc" : "stream";
      }
    }
    this.indentValue = yield* this.pushSpaces(false);
    if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
      this.indentNext = this.indentValue;
    return yield* this.parseBlockStart();
  }
  *parseBlockStart() {
    const [ch0, ch1] = this.peek(2);
    if (!ch1 && !this.atEnd)
      return this.setNext("block-start");
    if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
      const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
      this.indentNext = this.indentValue + 1;
      this.indentValue += n;
      return "block-start";
    }
    return "doc";
  }
  *parseDocument() {
    yield* this.pushSpaces(true);
    const line = this.getLine();
    if (line === null)
      return this.setNext("doc");
    let n = yield* this.pushIndicators();
    switch (line[n]) {
      case "#":
        yield* this.pushCount(line.length - n);
      // fallthrough
      case void 0:
        yield* this.pushNewline();
        return yield* this.parseLineStart();
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel = 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        return "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "doc";
      case '"':
      case "'":
        return yield* this.parseQuotedScalar();
      case "|":
      case ">":
        n += yield* this.parseBlockScalarHeader();
        n += yield* this.pushSpaces(true);
        yield* this.pushCount(line.length - n);
        yield* this.pushNewline();
        return yield* this.parseBlockScalar();
      default:
        return yield* this.parsePlainScalar();
    }
  }
  *parseFlowCollection() {
    let nl, sp;
    let indent = -1;
    do {
      nl = yield* this.pushNewline();
      if (nl > 0) {
        sp = yield* this.pushSpaces(false);
        this.indentValue = indent = sp;
      } else {
        sp = 0;
      }
      sp += yield* this.pushSpaces(true);
    } while (nl + sp > 0);
    const line = this.getLine();
    if (line === null)
      return this.setNext("flow");
    if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
      const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
      if (!atFlowEndMarker) {
        this.flowLevel = 0;
        yield FLOW_END;
        return yield* this.parseLineStart();
      }
    }
    let n = 0;
    while (line[n] === ",") {
      n += yield* this.pushCount(1);
      n += yield* this.pushSpaces(true);
      this.flowKey = false;
    }
    n += yield* this.pushIndicators();
    switch (line[n]) {
      case void 0:
        return "flow";
      case "#":
        yield* this.pushCount(line.length - n);
        return "flow";
      case "{":
      case "[":
        yield* this.pushCount(1);
        this.flowKey = false;
        this.flowLevel += 1;
        return "flow";
      case "}":
      case "]":
        yield* this.pushCount(1);
        this.flowKey = true;
        this.flowLevel -= 1;
        return this.flowLevel ? "flow" : "doc";
      case "*":
        yield* this.pushUntil(isNotAnchorChar);
        return "flow";
      case '"':
      case "'":
        this.flowKey = true;
        return yield* this.parseQuotedScalar();
      case ":": {
        const next = this.charAt(1);
        if (this.flowKey || isEmpty(next) || next === ",") {
          this.flowKey = false;
          yield* this.pushCount(1);
          yield* this.pushSpaces(true);
          return "flow";
        }
      }
      // fallthrough
      default:
        this.flowKey = false;
        return yield* this.parsePlainScalar();
    }
  }
  *parseQuotedScalar() {
    const quote = this.charAt(0);
    let end = this.buffer.indexOf(quote, this.pos + 1);
    if (quote === "'") {
      while (end !== -1 && this.buffer[end + 1] === "'")
        end = this.buffer.indexOf("'", end + 2);
    } else {
      while (end !== -1) {
        let n = 0;
        while (this.buffer[end - 1 - n] === "\\")
          n += 1;
        if (n % 2 === 0)
          break;
        end = this.buffer.indexOf('"', end + 1);
      }
    }
    const qb = this.buffer.substring(0, end);
    let nl = qb.indexOf("\n", this.pos);
    if (nl !== -1) {
      while (nl !== -1) {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = qb.indexOf("\n", cs);
      }
      if (nl !== -1) {
        end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
      }
    }
    if (end === -1) {
      if (!this.atEnd)
        return this.setNext("quoted-scalar");
      end = this.buffer.length;
    }
    yield* this.pushToIndex(end + 1, false);
    return this.flowLevel ? "flow" : "doc";
  }
  *parseBlockScalarHeader() {
    this.blockScalarIndent = -1;
    this.blockScalarKeep = false;
    let i = this.pos;
    while (true) {
      const ch = this.buffer[++i];
      if (ch === "+")
        this.blockScalarKeep = true;
      else if (ch > "0" && ch <= "9")
        this.blockScalarIndent = Number(ch) - 1;
      else if (ch !== "-")
        break;
    }
    return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
  }
  *parseBlockScalar() {
    let nl = this.pos - 1;
    let indent = 0;
    let ch;
    loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
      switch (ch) {
        case " ":
          indent += 1;
          break;
        case "\n":
          nl = i2;
          indent = 0;
          break;
        case "\r": {
          const next = this.buffer[i2 + 1];
          if (!next && !this.atEnd)
            return this.setNext("block-scalar");
          if (next === "\n")
            break;
        }
        // fallthrough
        default:
          break loop;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("block-scalar");
    if (indent >= this.indentNext) {
      if (this.blockScalarIndent === -1)
        this.indentNext = indent;
      else {
        this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
      }
      do {
        const cs = this.continueScalar(nl + 1);
        if (cs === -1)
          break;
        nl = this.buffer.indexOf("\n", cs);
      } while (nl !== -1);
      if (nl === -1) {
        if (!this.atEnd)
          return this.setNext("block-scalar");
        nl = this.buffer.length;
      }
    }
    let i = nl + 1;
    ch = this.buffer[i];
    while (ch === " ")
      ch = this.buffer[++i];
    if (ch === "	") {
      while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
        ch = this.buffer[++i];
      nl = i - 1;
    } else if (!this.blockScalarKeep) {
      do {
        let i2 = nl - 1;
        let ch2 = this.buffer[i2];
        if (ch2 === "\r")
          ch2 = this.buffer[--i2];
        const lastChar = i2;
        while (ch2 === " ")
          ch2 = this.buffer[--i2];
        if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
          nl = i2;
        else
          break;
      } while (true);
    }
    yield SCALAR2;
    yield* this.pushToIndex(nl + 1, true);
    return yield* this.parseLineStart();
  }
  *parsePlainScalar() {
    const inFlow = this.flowLevel > 0;
    let end = this.pos - 1;
    let i = this.pos - 1;
    let ch;
    while (ch = this.buffer[++i]) {
      if (ch === ":") {
        const next = this.buffer[i + 1];
        if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
          break;
        end = i;
      } else if (isEmpty(ch)) {
        let next = this.buffer[i + 1];
        if (ch === "\r") {
          if (next === "\n") {
            i += 1;
            ch = "\n";
            next = this.buffer[i + 1];
          } else
            end = i;
        }
        if (next === "#" || inFlow && flowIndicatorChars.has(next))
          break;
        if (ch === "\n") {
          const cs = this.continueScalar(i + 1);
          if (cs === -1)
            break;
          i = Math.max(i, cs - 2);
        }
      } else {
        if (inFlow && flowIndicatorChars.has(ch))
          break;
        end = i;
      }
    }
    if (!ch && !this.atEnd)
      return this.setNext("plain-scalar");
    yield SCALAR2;
    yield* this.pushToIndex(end + 1, true);
    return inFlow ? "flow" : "doc";
  }
  *pushCount(n) {
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos += n;
      return n;
    }
    return 0;
  }
  *pushToIndex(i, allowEmpty) {
    const s = this.buffer.slice(this.pos, i);
    if (s) {
      yield s;
      this.pos += s.length;
      return s.length;
    } else if (allowEmpty)
      yield "";
    return 0;
  }
  *pushIndicators() {
    let n = 0;
    loop: while (true) {
      switch (this.charAt(0)) {
        case "!":
          n += yield* this.pushTag();
          n += yield* this.pushSpaces(true);
          continue loop;
        case "&":
          n += yield* this.pushUntil(isNotAnchorChar);
          n += yield* this.pushSpaces(true);
          continue loop;
        case "-":
        // this is an error
        case "?":
        // this is an error outside flow collections
        case ":": {
          const inFlow = this.flowLevel > 0;
          const ch1 = this.charAt(1);
          if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
            if (!inFlow)
              this.indentNext = this.indentValue + 1;
            else if (this.flowKey)
              this.flowKey = false;
            n += yield* this.pushCount(1);
            n += yield* this.pushSpaces(true);
            continue loop;
          }
        }
      }
      break loop;
    }
    return n;
  }
  *pushTag() {
    if (this.charAt(1) === "<") {
      let i = this.pos + 2;
      let ch = this.buffer[i];
      while (!isEmpty(ch) && ch !== ">")
        ch = this.buffer[++i];
      return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
    } else {
      let i = this.pos + 1;
      let ch = this.buffer[i];
      while (ch) {
        if (tagChars.has(ch))
          ch = this.buffer[++i];
        else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
          ch = this.buffer[i += 3];
        } else
          break;
      }
      return yield* this.pushToIndex(i, false);
    }
  }
  *pushNewline() {
    const ch = this.buffer[this.pos];
    if (ch === "\n")
      return yield* this.pushCount(1);
    else if (ch === "\r" && this.charAt(1) === "\n")
      return yield* this.pushCount(2);
    else
      return 0;
  }
  *pushSpaces(allowTabs) {
    let i = this.pos - 1;
    let ch;
    do {
      ch = this.buffer[++i];
    } while (ch === " " || allowTabs && ch === "	");
    const n = i - this.pos;
    if (n > 0) {
      yield this.buffer.substr(this.pos, n);
      this.pos = i;
    }
    return n;
  }
  *pushUntil(test) {
    let i = this.pos;
    let ch = this.buffer[i];
    while (!test(ch))
      ch = this.buffer[++i];
    return yield* this.pushToIndex(i, false);
  }
};

// node_modules/yaml/browser/dist/parse/line-counter.js
var LineCounter = class {
  constructor() {
    this.lineStarts = [];
    this.addNewLine = (offset) => this.lineStarts.push(offset);
    this.linePos = (offset) => {
      let low = 0;
      let high = this.lineStarts.length;
      while (low < high) {
        const mid = low + high >> 1;
        if (this.lineStarts[mid] < offset)
          low = mid + 1;
        else
          high = mid;
      }
      if (this.lineStarts[low] === offset)
        return { line: low + 1, col: 1 };
      if (low === 0)
        return { line: 0, col: offset };
      const start = this.lineStarts[low - 1];
      return { line: low, col: offset - start + 1 };
    };
  }
};

// node_modules/yaml/browser/dist/parse/parser.js
function includesToken(list, type) {
  for (let i = 0; i < list.length; ++i)
    if (list[i].type === type)
      return true;
  return false;
}
function findNonEmptyIndex(list) {
  for (let i = 0; i < list.length; ++i) {
    switch (list[i].type) {
      case "space":
      case "comment":
      case "newline":
        break;
      default:
        return i;
    }
  }
  return -1;
}
function isFlowToken(token) {
  switch (token?.type) {
    case "alias":
    case "scalar":
    case "single-quoted-scalar":
    case "double-quoted-scalar":
    case "flow-collection":
      return true;
    default:
      return false;
  }
}
function getPrevProps(parent) {
  switch (parent.type) {
    case "document":
      return parent.start;
    case "block-map": {
      const it = parent.items[parent.items.length - 1];
      return it.sep ?? it.start;
    }
    case "block-seq":
      return parent.items[parent.items.length - 1].start;
    /* istanbul ignore next should not happen */
    default:
      return [];
  }
}
function getFirstKeyStartProps(prev) {
  if (prev.length === 0)
    return [];
  let i = prev.length;
  loop: while (--i >= 0) {
    switch (prev[i].type) {
      case "doc-start":
      case "explicit-key-ind":
      case "map-value-ind":
      case "seq-item-ind":
      case "newline":
        break loop;
    }
  }
  while (prev[++i]?.type === "space") {
  }
  return prev.splice(i, prev.length);
}
function arrayPushArray(target, source) {
  if (source.length < 1e5)
    Array.prototype.push.apply(target, source);
  else
    for (let i = 0; i < source.length; ++i)
      target.push(source[i]);
}
function fixFlowSeqItems(fc) {
  if (fc.start.type === "flow-seq-start") {
    for (const it of fc.items) {
      if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
        if (it.key)
          it.value = it.key;
        delete it.key;
        if (isFlowToken(it.value)) {
          if (it.value.end)
            arrayPushArray(it.value.end, it.sep);
          else
            it.value.end = it.sep;
        } else
          arrayPushArray(it.start, it.sep);
        delete it.sep;
      }
    }
  }
}
var Parser = class {
  /**
   * @param onNewLine - If defined, called separately with the start position of
   *   each new line (in `parse()`, including the start of input).
   */
  constructor(onNewLine) {
    this.atNewLine = true;
    this.atScalar = false;
    this.indent = 0;
    this.offset = 0;
    this.onKeyLine = false;
    this.stack = [];
    this.source = "";
    this.type = "";
    this.lexer = new Lexer();
    this.onNewLine = onNewLine;
  }
  /**
   * Parse `source` as a YAML stream.
   * If `incomplete`, a part of the last line may be left as a buffer for the next call.
   *
   * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
   *
   * @returns A generator of tokens representing each directive, document, and other structure.
   */
  *parse(source, incomplete = false) {
    if (this.onNewLine && this.offset === 0)
      this.onNewLine(0);
    for (const lexeme of this.lexer.lex(source, incomplete))
      yield* this.next(lexeme);
    if (!incomplete)
      yield* this.end();
  }
  /**
   * Advance the parser by the `source` of one lexical token.
   */
  *next(source) {
    this.source = source;
    if (this.atScalar) {
      this.atScalar = false;
      yield* this.step();
      this.offset += source.length;
      return;
    }
    const type = tokenType(source);
    if (!type) {
      const message = `Not a YAML token: ${source}`;
      yield* this.pop({ type: "error", offset: this.offset, message, source });
      this.offset += source.length;
    } else if (type === "scalar") {
      this.atNewLine = false;
      this.atScalar = true;
      this.type = "scalar";
    } else {
      this.type = type;
      yield* this.step();
      switch (type) {
        case "newline":
          this.atNewLine = true;
          this.indent = 0;
          if (this.onNewLine)
            this.onNewLine(this.offset + source.length);
          break;
        case "space":
          if (this.atNewLine && source[0] === " ")
            this.indent += source.length;
          break;
        case "explicit-key-ind":
        case "map-value-ind":
        case "seq-item-ind":
          if (this.atNewLine)
            this.indent += source.length;
          break;
        case "doc-mode":
        case "flow-error-end":
          return;
        default:
          this.atNewLine = false;
      }
      this.offset += source.length;
    }
  }
  /** Call at end of input to push out any remaining constructions */
  *end() {
    while (this.stack.length > 0)
      yield* this.pop();
  }
  get sourceToken() {
    const st = {
      type: this.type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
    return st;
  }
  *step() {
    const top = this.peek(1);
    if (this.type === "doc-end" && top?.type !== "doc-end") {
      while (this.stack.length > 0)
        yield* this.pop();
      this.stack.push({
        type: "doc-end",
        offset: this.offset,
        source: this.source
      });
      return;
    }
    if (!top)
      return yield* this.stream();
    switch (top.type) {
      case "document":
        return yield* this.document(top);
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return yield* this.scalar(top);
      case "block-scalar":
        return yield* this.blockScalar(top);
      case "block-map":
        return yield* this.blockMap(top);
      case "block-seq":
        return yield* this.blockSequence(top);
      case "flow-collection":
        return yield* this.flowCollection(top);
      case "doc-end":
        return yield* this.documentEnd(top);
    }
    yield* this.pop();
  }
  peek(n) {
    return this.stack[this.stack.length - n];
  }
  *pop(error) {
    const token = error ?? this.stack.pop();
    if (!token) {
      const message = "Tried to pop an empty stack";
      yield { type: "error", offset: this.offset, source: "", message };
    } else if (this.stack.length === 0) {
      yield token;
    } else {
      const top = this.peek(1);
      if (token.type === "block-scalar") {
        token.indent = "indent" in top ? top.indent : 0;
      } else if (token.type === "flow-collection" && top.type === "document") {
        token.indent = 0;
      }
      if (token.type === "flow-collection")
        fixFlowSeqItems(token);
      switch (top.type) {
        case "document":
          top.value = token;
          break;
        case "block-scalar":
          top.props.push(token);
          break;
        case "block-map": {
          const it = top.items[top.items.length - 1];
          if (it.value) {
            top.items.push({ start: [], key: token, sep: [] });
            this.onKeyLine = true;
            return;
          } else if (it.sep) {
            it.value = token;
          } else {
            Object.assign(it, { key: token, sep: [] });
            this.onKeyLine = !it.explicitKey;
            return;
          }
          break;
        }
        case "block-seq": {
          const it = top.items[top.items.length - 1];
          if (it.value)
            top.items.push({ start: [], value: token });
          else
            it.value = token;
          break;
        }
        case "flow-collection": {
          const it = top.items[top.items.length - 1];
          if (!it || it.value)
            top.items.push({ start: [], key: token, sep: [] });
          else if (it.sep)
            it.value = token;
          else
            Object.assign(it, { key: token, sep: [] });
          return;
        }
        /* istanbul ignore next should not happen */
        default:
          yield* this.pop();
          yield* this.pop(token);
      }
      if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
        const last = token.items[token.items.length - 1];
        if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
          if (top.type === "document")
            top.end = last.start;
          else
            top.items.push({ start: last.start });
          token.items.splice(-1, 1);
        }
      }
    }
  }
  *stream() {
    switch (this.type) {
      case "directive-line":
        yield { type: "directive", offset: this.offset, source: this.source };
        return;
      case "byte-order-mark":
      case "space":
      case "comment":
      case "newline":
        yield this.sourceToken;
        return;
      case "doc-mode":
      case "doc-start": {
        const doc = {
          type: "document",
          offset: this.offset,
          start: []
        };
        if (this.type === "doc-start")
          doc.start.push(this.sourceToken);
        this.stack.push(doc);
        return;
      }
    }
    yield {
      type: "error",
      offset: this.offset,
      message: `Unexpected ${this.type} token in YAML stream`,
      source: this.source
    };
  }
  *document(doc) {
    if (doc.value)
      return yield* this.lineEnd(doc);
    switch (this.type) {
      case "doc-start": {
        if (findNonEmptyIndex(doc.start) !== -1) {
          yield* this.pop();
          yield* this.step();
        } else
          doc.start.push(this.sourceToken);
        return;
      }
      case "anchor":
      case "tag":
      case "space":
      case "comment":
      case "newline":
        doc.start.push(this.sourceToken);
        return;
    }
    const bv = this.startBlockValue(doc);
    if (bv)
      this.stack.push(bv);
    else {
      yield {
        type: "error",
        offset: this.offset,
        message: `Unexpected ${this.type} token in YAML document`,
        source: this.source
      };
    }
  }
  *scalar(scalar) {
    if (this.type === "map-value-ind") {
      const prev = getPrevProps(this.peek(2));
      const start = getFirstKeyStartProps(prev);
      let sep3;
      if (scalar.end) {
        sep3 = scalar.end;
        sep3.push(this.sourceToken);
        delete scalar.end;
      } else
        sep3 = [this.sourceToken];
      const map2 = {
        type: "block-map",
        offset: scalar.offset,
        indent: scalar.indent,
        items: [{ start, key: scalar, sep: sep3 }]
      };
      this.onKeyLine = true;
      this.stack[this.stack.length - 1] = map2;
    } else
      yield* this.lineEnd(scalar);
  }
  *blockScalar(scalar) {
    switch (this.type) {
      case "space":
      case "comment":
      case "newline":
        scalar.props.push(this.sourceToken);
        return;
      case "scalar":
        scalar.source = this.source;
        this.atNewLine = true;
        this.indent = 0;
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        yield* this.pop();
        break;
      /* istanbul ignore next should not happen */
      default:
        yield* this.pop();
        yield* this.step();
    }
  }
  *blockMap(map2) {
    const it = map2.items[map2.items.length - 1];
    switch (this.type) {
      case "newline":
        this.onKeyLine = false;
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          it.start.push(this.sourceToken);
        }
        return;
      case "space":
      case "comment":
        if (it.value) {
          map2.items.push({ start: [this.sourceToken] });
        } else if (it.sep) {
          it.sep.push(this.sourceToken);
        } else {
          if (this.atIndentedComment(it.start, map2.indent)) {
            const prev = map2.items[map2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              map2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
    }
    if (this.indent >= map2.indent) {
      const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
      const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
      let start = [];
      if (atNextItem && it.sep && !it.value) {
        const nl = [];
        for (let i = 0; i < it.sep.length; ++i) {
          const st = it.sep[i];
          switch (st.type) {
            case "newline":
              nl.push(i);
              break;
            case "space":
              break;
            case "comment":
              if (st.indent > map2.indent)
                nl.length = 0;
              break;
            default:
              nl.length = 0;
          }
        }
        if (nl.length >= 2)
          start = it.sep.splice(nl[1]);
      }
      switch (this.type) {
        case "anchor":
        case "tag":
          if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start });
            this.onKeyLine = true;
          } else if (it.sep) {
            it.sep.push(this.sourceToken);
          } else {
            it.start.push(this.sourceToken);
          }
          return;
        case "explicit-key-ind":
          if (!it.sep && !it.explicitKey) {
            it.start.push(this.sourceToken);
            it.explicitKey = true;
          } else if (atNextItem || it.value) {
            start.push(this.sourceToken);
            map2.items.push({ start, explicitKey: true });
          } else {
            this.stack.push({
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken], explicitKey: true }]
            });
          }
          this.onKeyLine = true;
          return;
        case "map-value-ind":
          if (it.explicitKey) {
            if (!it.sep) {
              if (includesToken(it.start, "newline")) {
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              } else {
                const start2 = getFirstKeyStartProps(it.start);
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                });
              }
            } else if (it.value) {
              map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start, key: null, sep: [this.sourceToken] }]
              });
            } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
              const start2 = getFirstKeyStartProps(it.start);
              const key = it.key;
              const sep3 = it.sep;
              sep3.push(this.sourceToken);
              delete it.key;
              delete it.sep;
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: start2, key, sep: sep3 }]
              });
            } else if (start.length > 0) {
              it.sep = it.sep.concat(start, this.sourceToken);
            } else {
              it.sep.push(this.sourceToken);
            }
          } else {
            if (!it.sep) {
              Object.assign(it, { key: null, sep: [this.sourceToken] });
            } else if (it.value || atNextItem) {
              map2.items.push({ start, key: null, sep: [this.sourceToken] });
            } else if (includesToken(it.sep, "map-value-ind")) {
              this.stack.push({
                type: "block-map",
                offset: this.offset,
                indent: this.indent,
                items: [{ start: [], key: null, sep: [this.sourceToken] }]
              });
            } else {
              it.sep.push(this.sourceToken);
            }
          }
          this.onKeyLine = true;
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (atNextItem || it.value) {
            map2.items.push({ start, key: fs, sep: [] });
            this.onKeyLine = true;
          } else if (it.sep) {
            this.stack.push(fs);
          } else {
            Object.assign(it, { key: fs, sep: [] });
            this.onKeyLine = true;
          }
          return;
        }
        default: {
          const bv = this.startBlockValue(map2);
          if (bv) {
            if (bv.type === "block-seq") {
              if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                yield* this.pop({
                  type: "error",
                  offset: this.offset,
                  message: "Unexpected block-seq-ind on same line with key",
                  source: this.source
                });
                return;
              }
            } else if (atMapIndent) {
              map2.items.push({ start });
            }
            this.stack.push(bv);
            return;
          }
        }
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *blockSequence(seq2) {
    const it = seq2.items[seq2.items.length - 1];
    switch (this.type) {
      case "newline":
        if (it.value) {
          const end = "end" in it.value ? it.value.end : void 0;
          const last = Array.isArray(end) ? end[end.length - 1] : void 0;
          if (last?.type === "comment")
            end?.push(this.sourceToken);
          else
            seq2.items.push({ start: [this.sourceToken] });
        } else
          it.start.push(this.sourceToken);
        return;
      case "space":
      case "comment":
        if (it.value)
          seq2.items.push({ start: [this.sourceToken] });
        else {
          if (this.atIndentedComment(it.start, seq2.indent)) {
            const prev = seq2.items[seq2.items.length - 2];
            const end = prev?.value?.end;
            if (Array.isArray(end)) {
              arrayPushArray(end, it.start);
              end.push(this.sourceToken);
              seq2.items.pop();
              return;
            }
          }
          it.start.push(this.sourceToken);
        }
        return;
      case "anchor":
      case "tag":
        if (it.value || this.indent <= seq2.indent)
          break;
        it.start.push(this.sourceToken);
        return;
      case "seq-item-ind":
        if (this.indent !== seq2.indent)
          break;
        if (it.value || includesToken(it.start, "seq-item-ind"))
          seq2.items.push({ start: [this.sourceToken] });
        else
          it.start.push(this.sourceToken);
        return;
    }
    if (this.indent > seq2.indent) {
      const bv = this.startBlockValue(seq2);
      if (bv) {
        this.stack.push(bv);
        return;
      }
    }
    yield* this.pop();
    yield* this.step();
  }
  *flowCollection(fc) {
    const it = fc.items[fc.items.length - 1];
    if (this.type === "flow-error-end") {
      let top;
      do {
        yield* this.pop();
        top = this.peek(1);
      } while (top?.type === "flow-collection");
    } else if (fc.end.length === 0) {
      switch (this.type) {
        case "comma":
        case "explicit-key-ind":
          if (!it || it.sep)
            fc.items.push({ start: [this.sourceToken] });
          else
            it.start.push(this.sourceToken);
          return;
        case "map-value-ind":
          if (!it || it.value)
            fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            Object.assign(it, { key: null, sep: [this.sourceToken] });
          return;
        case "space":
        case "comment":
        case "newline":
        case "anchor":
        case "tag":
          if (!it || it.value)
            fc.items.push({ start: [this.sourceToken] });
          else if (it.sep)
            it.sep.push(this.sourceToken);
          else
            it.start.push(this.sourceToken);
          return;
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar": {
          const fs = this.flowScalar(this.type);
          if (!it || it.value)
            fc.items.push({ start: [], key: fs, sep: [] });
          else if (it.sep)
            this.stack.push(fs);
          else
            Object.assign(it, { key: fs, sep: [] });
          return;
        }
        case "flow-map-end":
        case "flow-seq-end":
          fc.end.push(this.sourceToken);
          return;
      }
      const bv = this.startBlockValue(fc);
      if (bv)
        this.stack.push(bv);
      else {
        yield* this.pop();
        yield* this.step();
      }
    } else {
      const parent = this.peek(2);
      if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
        yield* this.pop();
        yield* this.step();
      } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        fixFlowSeqItems(fc);
        const sep3 = fc.end.splice(1, fc.end.length);
        sep3.push(this.sourceToken);
        const map2 = {
          type: "block-map",
          offset: fc.offset,
          indent: fc.indent,
          items: [{ start, key: fc, sep: sep3 }]
        };
        this.onKeyLine = true;
        this.stack[this.stack.length - 1] = map2;
      } else {
        yield* this.lineEnd(fc);
      }
    }
  }
  flowScalar(type) {
    if (this.onNewLine) {
      let nl = this.source.indexOf("\n") + 1;
      while (nl !== 0) {
        this.onNewLine(this.offset + nl);
        nl = this.source.indexOf("\n", nl) + 1;
      }
    }
    return {
      type,
      offset: this.offset,
      indent: this.indent,
      source: this.source
    };
  }
  startBlockValue(parent) {
    switch (this.type) {
      case "alias":
      case "scalar":
      case "single-quoted-scalar":
      case "double-quoted-scalar":
        return this.flowScalar(this.type);
      case "block-scalar-header":
        return {
          type: "block-scalar",
          offset: this.offset,
          indent: this.indent,
          props: [this.sourceToken],
          source: ""
        };
      case "flow-map-start":
      case "flow-seq-start":
        return {
          type: "flow-collection",
          offset: this.offset,
          indent: this.indent,
          start: this.sourceToken,
          items: [],
          end: []
        };
      case "seq-item-ind":
        return {
          type: "block-seq",
          offset: this.offset,
          indent: this.indent,
          items: [{ start: [this.sourceToken] }]
        };
      case "explicit-key-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        start.push(this.sourceToken);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, explicitKey: true }]
        };
      }
      case "map-value-ind": {
        this.onKeyLine = true;
        const prev = getPrevProps(parent);
        const start = getFirstKeyStartProps(prev);
        return {
          type: "block-map",
          offset: this.offset,
          indent: this.indent,
          items: [{ start, key: null, sep: [this.sourceToken] }]
        };
      }
    }
    return null;
  }
  atIndentedComment(start, indent) {
    if (this.type !== "comment")
      return false;
    if (this.indent <= indent)
      return false;
    return start.every((st) => st.type === "newline" || st.type === "space");
  }
  *documentEnd(docEnd) {
    if (this.type !== "doc-mode") {
      if (docEnd.end)
        docEnd.end.push(this.sourceToken);
      else
        docEnd.end = [this.sourceToken];
      if (this.type === "newline")
        yield* this.pop();
    }
  }
  *lineEnd(token) {
    switch (this.type) {
      case "comma":
      case "doc-start":
      case "doc-end":
      case "flow-seq-end":
      case "flow-map-end":
      case "map-value-ind":
        yield* this.pop();
        yield* this.step();
        break;
      case "newline":
        this.onKeyLine = false;
      // fallthrough
      case "space":
      case "comment":
      default:
        if (token.end)
          token.end.push(this.sourceToken);
        else
          token.end = [this.sourceToken];
        if (this.type === "newline")
          yield* this.pop();
    }
  }
};

// node_modules/yaml/browser/dist/public-api.js
function parseOptions(options) {
  const prettyErrors = options.prettyErrors !== false;
  const lineCounter = options.lineCounter || prettyErrors && new LineCounter() || null;
  return { lineCounter, prettyErrors };
}
function parseDocument(source, options = {}) {
  const { lineCounter, prettyErrors } = parseOptions(options);
  const parser = new Parser(lineCounter?.addNewLine);
  const composer = new Composer(options);
  let doc = null;
  for (const _doc of composer.compose(parser.parse(source), true, source.length)) {
    if (!doc)
      doc = _doc;
    else if (doc.options.logLevel !== "silent") {
      doc.errors.push(new YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
      break;
    }
  }
  if (prettyErrors && lineCounter) {
    doc.errors.forEach(prettifyError(source, lineCounter));
    doc.warnings.forEach(prettifyError(source, lineCounter));
  }
  return doc;
}

// src/repository.ts
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var EXCLUDED_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  ".memory",
  ".agents",
  ".idea",
  ".vscode",
  ".svn",
  ".hg",
  ".ds_store",
  ".next",
  ".next-docs",
  ".nuxt",
  ".turbo",
  ".svelte-kit",
  ".astro",
  ".cache",
  ".parcel-cache",
  ".rollup.cache",
  ".vite",
  ".webpack",
  ".rspack",
  ".vercel",
  ".netlify",
  ".output",
  ".yarn",
  ".pnpm-store",
  ".docusaurus",
  ".storybook",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "config",
  ".config",
  "configs",
  ".configs",
  "tmp",
  "temp",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  ".venv",
  "venv",
  "env",
  ".env",
  "__pypackages__",
  ".eggs",
  "site-packages",
  ".gradle",
  ".m2",
  ".mvn",
  ".bloop",
  ".metals",
  ".sbt",
  ".cargo",
  "cmake-build-debug",
  "cmake-build-release",
  "obj",
  "objs",
  ".deps",
  "bin",
  ".vs",
  ".ionide",
  ".bundle",
  ".phpunit.cache",
  ".php-cs-fixer.cache",
  "_build",
  "deps",
  ".build",
  ".swiftpm",
  "deriveddata",
  "pods",
  ".dart_tool",
  ".pub-cache",
  ".pub",
  ".serverless",
  ".aws-sam",
  ".terraform",
  ".terragrunt-cache",
  "cdk.out"
]);
var SECRET_PATTERNS = [
  /^\.(?:aws|gnupg|ssh)$/i,
  /^\.env(?:\.|$)/i,
  /(?:^|[._-])(secrets?|credentials?|tokens?|private[-_]?keys?)(?:[._-]|$)/i,
  /\.(?:pem|p12|pfx|key|keystore)$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i
];
var CODE_EXTENSIONS = /* @__PURE__ */ new Set([
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
  ".vue"
]);
var FEATURE_MARKERS = /* @__PURE__ */ new Set(["domain", "domains", "feature", "features", "module", "modules", "app", "pages", "routes"]);
var MAX_TEXT_SOURCE_BYTES = 2 * 1024 * 1024;
var SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[ps]_[A-Za-z0-9]{30,}\b/,
  /\b(?:password|passwd|client_secret|access_token)\s*[:=]\s*["']?[A-Za-z0-9_+\/=.-]{12,}/i
];
var MANDATORY_ARCHITECTURE_LAYERS = [
  "system-design",
  "domain",
  "security"
];
var CONDITIONAL_ARCHITECTURE_LAYERS = [
  "frontend",
  "gateway-edge",
  "auth",
  "backend",
  "database",
  "cloud-observability"
];
var ALL_ARCHITECTURE_LAYERS = [
  ...MANDATORY_ARCHITECTURE_LAYERS,
  ...CONDITIONAL_ARCHITECTURE_LAYERS
];
function normalizeRelative(path) {
  return path.split(sep).join("/").replace(/^\.\//, "");
}
function isPathInside(parent, candidate) {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
function assertSafeRelativePath(path) {
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
var LOCKFILE_NAMES = /* @__PURE__ */ new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "cargo.lock",
  "gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "flake.lock",
  "bun.lockb",
  "bun.lock",
  "mix.lock",
  "podfile.lock"
]);
function isSecretLike(path) {
  const name = basename(path);
  if (/^\.env\.(?:example|template|sample|schema)$/i.test(name)) return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(name));
}
function containsLikelySecret(content) {
  const text = typeof content === "string" ? content : content.toString("utf8");
  return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}
function isExcludedPath(path) {
  const normalized = normalizeRelative(path);
  const parts = normalized.split("/");
  const last = parts[parts.length - 1]?.toLowerCase();
  if (last && LOCKFILE_NAMES.has(last)) return true;
  return parts.some((part) => {
    const lower = part.toLowerCase();
    if (EXCLUDED_DIRECTORIES.has(lower) || isSecretLike(lower)) return true;
    if (lower.endsWith(".egg-info") || lower.endsWith("-docs") || lower.startsWith("cmake-build-") || lower.startsWith(".venv")) return true;
    return false;
  }) || isSecretLike(normalized);
}
async function git(root, args) {
  try {
    const result = await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    return result.stdout.trim();
  } catch {
    return void 0;
  }
}
async function findProjectRoot(cwd) {
  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  return root ? resolve(root) : resolve(cwd);
}
async function fallbackWalk(root, current = root, output = []) {
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
async function listRepositoryPaths(root) {
  const gitOutput = await git(root, ["ls-files", "-co", "--exclude-standard", "-z"]);
  const paths = gitOutput !== void 0 ? gitOutput.split("\0").filter(Boolean).map(normalizeRelative) : await fallbackWalk(root);
  return [...new Set(paths.filter((path) => !isExcludedPath(path)))].sort();
}
async function inventoryRepository(root) {
  const paths = await listRepositoryPaths(root);
  const files = [];
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
        extension: extname(path).toLowerCase()
      });
    } catch {
    }
  }
  return files;
}
function candidateDirectories(files) {
  const candidates = /* @__PURE__ */ new Map();
  const directCodeByDirectory = /* @__PURE__ */ new Map();
  const add = (path, reason, file) => {
    if (!path || path === "." || isExcludedPath(path)) return;
    if (path.split("/").length > 5) return;
    const record = candidates.get(path) ?? { reasons: /* @__PURE__ */ new Set(), files: /* @__PURE__ */ new Set() };
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
function discoverScopeCandidates(files) {
  const candidates = candidateDirectories(files);
  const rawList = [...candidates.entries()].map(([path, value]) => {
    const markerReason = [...value.reasons].some((reason) => reason.startsWith("Located under"));
    const fileCount = files.filter((file) => file.path === path || file.path.startsWith(`${path}/`)).length;
    return {
      path,
      fileCount,
      confidence: markerReason && fileCount >= 2 ? "high" : fileCount >= 2 ? "medium" : "low",
      reasons: [...value.reasons].sort()
    };
  }).filter((candidate) => candidate.fileCount > 0 && !isExcludedPath(candidate.path)).sort((a, b) => a.path.localeCompare(b.path));
  const scopePaths = new Set(rawList.map((c) => c.path));
  return rawList.filter((candidate) => {
    const parts = candidate.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      if (scopePaths.has(parent) && parent !== candidate.path && candidate.confidence !== "high") {
        return false;
      }
    }
    return true;
  });
}
async function assertNoSymlinkPath(root, target) {
  const rel = relative(root, target);
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Symbolic-link sources are not supported: ${normalizeRelative(rel)}`);
  }
}
async function readResponseLimited(response, limit) {
  const declaredLength = Number(response.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    response.destroy();
    throw new Error(`Source URL exceeds ${limit} bytes`);
  }
  const chunks = [];
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
var privateBlocks = new BlockList();
for (const [sub, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24]
]) privateBlocks.addSubnet(sub, prefix, "ipv4");
privateBlocks.addSubnet("224.0.0.0", 4, "ipv4");
for (const [sub, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
]) privateBlocks.addSubnet(sub, prefix, "ipv6");
function mappedIpv4Address(address) {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (dotted) return dotted;
  return void 0;
}
function isPrivateAddress(input) {
  const address = input.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = mappedIpv4Address(address);
  if (mapped) return isPrivateAddress(mapped);
  const family = isIP(address);
  if (family === 4) return privateBlocks.check(address, "ipv4");
  if (family === 6) return privateBlocks.check(address, "ipv6");
  return true;
}
function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  };
}
async function resolvePublicSourceUrl(input) {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`Unsafe source URL: ${input}`);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error(`Source URL must use a public host: ${input}`);
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error(`Source URL must resolve only to public addresses: ${input}`);
  return { url, addresses: addresses.map(({ address }) => ({ address, family: isIP(address) })) };
}
async function requestPinnedSource(target) {
  return new Promise((resolveResponse, reject) => {
    const request = (target.url.protocol === "https:" ? httpsRequest : httpRequest)(target.url, {
      lookup: createPinnedLookup(target.addresses)
    }, resolveResponse);
    request.setTimeout(15e3, () => request.destroy(new Error(`Source URL timed out: ${target.url}`)));
    request.on("error", reject);
    request.end();
  });
}
async function fetchPublicSource(input) {
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
async function hashFiles(root, paths) {
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
async function fingerprintSource(root, input, fetchRemote = false) {
  if (containsLikelySecret(input)) throw new Error(`Source identifier contains likely secret material: ${input}`);
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if ([...url.searchParams].some(([key, value]) => containsLikelySecret(`${key}=${value}`))) throw new Error(`Source URL contains likely secret material: ${input}`);
    if (!fetchRemote) {
      return {
        resource: input,
        hash: `sha256:${createHash("sha256").update(input).digest("hex")}`
      };
    }
    const buffer2 = await fetchPublicSource(input);
    if (containsLikelySecret(buffer2)) throw new Error(`Source URL contains likely secret material: ${input}`);
    return {
      resource: input,
      hash: `sha256:${createHash("sha256").update(buffer2).digest("hex")}`,
      content: buffer2.toString("utf8")
    };
  }
  const repoPath = input.startsWith("repo://") ? input.slice("repo://".length) : input;
  if (!isAbsolute(repoPath)) assertSafeRelativePath(repoPath);
  const lexicalRoot = resolve(root);
  const canonicalRoot = await realpath(root);
  const absolute = isAbsolute(repoPath) && isPathInside(lexicalRoot, repoPath) ? resolve(canonicalRoot, relative(lexicalRoot, repoPath)) : resolve(canonicalRoot, repoPath);
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
      hash: await hashFiles(canonicalRoot, paths)
    };
  }
  if (!info.isFile() || isSecretLike(canonical)) throw new Error(`Unsupported or secret-like source: ${input}`);
  const relativeFile = relativeCanonical;
  const buffer = await readFile(canonical);
  if (containsLikelySecret(buffer)) throw new Error(`Source contains likely secret material: ${input}`);
  return {
    resource: `repo://${relativeFile}`,
    hash: `sha256:${createHash("sha256").update(buffer).digest("hex")}`,
    content: buffer.length <= MAX_TEXT_SOURCE_BYTES ? buffer.toString("utf8") : void 0
  };
}
async function repositoryHead(root) {
  return git(root, ["rev-parse", "HEAD"]);
}
async function isGitRepository(root) {
  return await git(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}
async function changedRepositoryPaths(root, since) {
  const changes = /* @__PURE__ */ new Set();
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
function mapPathsToScopes(paths, scopes) {
  const ordered = [...scopes].sort((a, b) => b.length - a.length);
  const result = {};
  for (const path of paths) {
    const scope = ordered.find((candidate) => path === candidate || path.startsWith(`${candidate}/`)) ?? ".";
    (result[scope] ??= []).push(path);
  }
  return result;
}
function isTestFilePath(path) {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i.test(path);
}
async function deepScanRepository(root, baseScan) {
  const scan = baseScan ?? await scanRepository(root);
  const filePaths = scan.files.map((file) => file.path);
  const pathSet = new Set(filePaths);
  const languages = /* @__PURE__ */ new Set();
  const frameworks = /* @__PURE__ */ new Set();
  const testingTools = /* @__PURE__ */ new Set();
  const configFiles = /* @__PURE__ */ new Set();
  const infrastructure = /* @__PURE__ */ new Set();
  const entryPoints = /* @__PURE__ */ new Set();
  const apiRoutes = /* @__PURE__ */ new Set();
  const databaseSchemas = /* @__PURE__ */ new Set();
  const domainTypes = /* @__PURE__ */ new Set();
  const uiComponents = /* @__PURE__ */ new Set();
  const packages = [];
  const envVariables = /* @__PURE__ */ new Set();
  const mainDeps = /* @__PURE__ */ new Set();
  const devDeps = /* @__PURE__ */ new Set();
  let packageManager;
  let buildSystem;
  let monorepo;
  for (const file of scan.files) {
    switch (file.extension) {
      case ".ts":
      case ".tsx":
        languages.add("TypeScript");
        break;
      case ".js":
      case ".jsx":
      case ".mjs":
      case ".cjs":
        languages.add("JavaScript");
        break;
      case ".py":
        languages.add("Python");
        break;
      case ".go":
        languages.add("Go");
        break;
      case ".rs":
        languages.add("Rust");
        break;
      case ".java":
        languages.add("Java");
        break;
      case ".kt":
      case ".kts":
        languages.add("Kotlin");
        break;
      case ".rb":
        languages.add("Ruby");
        break;
      case ".php":
        languages.add("PHP");
        break;
      case ".swift":
        languages.add("Swift");
        break;
      case ".ex":
      case ".exs":
        languages.add("Elixir");
        break;
      case ".c":
      case ".cpp":
      case ".cc":
        languages.add("C/C++");
        break;
      case ".cs":
        languages.add("C#");
        break;
    }
  }
  for (const path of filePaths) {
    const base = basename(path).toLowerCase();
    if (base === "tsconfig.json") configFiles.add(path);
    else if (base === "turbo.json") {
      configFiles.add(path);
      monorepo = "Turborepo";
      buildSystem = "Turbo";
    } else if (base === "nx.json") {
      configFiles.add(path);
      monorepo = "Nx";
    } else if (base === "lerna.json") {
      configFiles.add(path);
      monorepo = "Lerna";
    } else if (base === "pnpm-workspace.yaml" || base === "pnpm-workspace.yml") {
      configFiles.add(path);
      if (!monorepo) monorepo = "pnpm Workspaces";
      packageManager = "pnpm";
    } else if (base === "biome.json") configFiles.add(path);
    else if (base.startsWith(".eslintrc") || base === "eslint.config.js" || base === "eslint.config.mjs") configFiles.add(path);
    else if (base === "dockerfile" || base.startsWith("docker-compose")) infrastructure.add(path);
    else if (base === "fly.toml" || base === "render.yaml" || base === "vercel.json" || base === "netlify.toml" || base === "serverless.yml") infrastructure.add(path);
    else if (path.startsWith(".github/workflows/")) infrastructure.add(path);
    if (base === "pnpm-lock.yaml") packageManager = "pnpm";
    else if (base === "yarn.lock") packageManager = "yarn";
    else if (base === "package-lock.json") packageManager = "npm";
    else if (base === "bun.lockb" || base === "bun.lock") packageManager = "bun";
    if (/(?:^|\/)(?:index|main|app|server|cli|layout|page)\.(?:ts|tsx|js|jsx|py|go|rs)$/i.test(path)) {
      if (!isTestFilePath(path)) entryPoints.add(path);
    }
    if (path.endsWith("schema.prisma") || path.includes("drizzle") || path.includes("/db/schema") || path.endsWith(".sql") || path.includes("models/") && CODE_EXTENSIONS.has(extname(path))) {
      databaseSchemas.add(path);
    }
    if (/(?:^|\/)(?:api|routes|controllers|endpoints)\//i.test(path) && CODE_EXTENSIONS.has(extname(path)) && !isTestFilePath(path)) {
      apiRoutes.add(path);
    }
    if (/(?:^|\/)(?:types|interfaces|schemas|dto)\//i.test(path) && CODE_EXTENSIONS.has(extname(path))) {
      domainTypes.add(path);
    }
    if (/(?:^|\/)(?:components|ui|views)\//i.test(path) && CODE_EXTENSIONS.has(extname(path))) {
      uiComponents.add(path);
    }
  }
  const rootPackageJsonPath = resolve(scan.projectRoot, "package.json");
  try {
    const raw = await readFile(rootPackageJsonPath, "utf8");
    const pkg = JSON.parse(raw);
    if (pkg.workspaces && !monorepo) monorepo = "npm/yarn workspaces";
    if (pkg.packageManager) packageManager = pkg.packageManager.split("@")[0];
    const allDeps = { ...pkg.dependencies || {}, ...pkg.devDependencies || {} };
    for (const dep of Object.keys(pkg.dependencies || {})) mainDeps.add(dep);
    for (const dep of Object.keys(pkg.devDependencies || {})) devDeps.add(dep);
    if (allDeps.next) frameworks.add("Next.js");
    if (allDeps.react) frameworks.add("React");
    if (allDeps.vue) frameworks.add("Vue");
    if (allDeps.nuxt) frameworks.add("Nuxt");
    if (allDeps.svelte || allDeps["@sveltejs/kit"]) frameworks.add("Svelte");
    if (allDeps.express) frameworks.add("Express");
    if (allDeps.fastify) frameworks.add("Fastify");
    if (allDeps.nest || allDeps["@nestjs/core"]) frameworks.add("NestJS");
    if (allDeps.hono) frameworks.add("Hono");
    if (allDeps.astro) frameworks.add("Astro");
    if (allDeps.remix || allDeps["@remix-run/react"]) frameworks.add("Remix");
    if (allDeps.tailwindcss) frameworks.add("TailwindCSS");
    if (allDeps.vitest) testingTools.add("Vitest");
    if (allDeps.jest) testingTools.add("Jest");
    if (allDeps.playwright || allDeps["@playwright/test"]) testingTools.add("Playwright");
    if (allDeps.cypress) testingTools.add("Cypress");
    if (allDeps.prisma || allDeps["@prisma/client"]) frameworks.add("Prisma");
    if (allDeps["drizzle-orm"]) frameworks.add("Drizzle ORM");
    if (allDeps.typeorm) frameworks.add("TypeORM");
    if (allDeps.mongoose) frameworks.add("Mongoose");
    if (allDeps.vite && !buildSystem) buildSystem = "Vite";
    if (allDeps.esbuild && !buildSystem) buildSystem = "esbuild";
    if (allDeps.webpack && !buildSystem) buildSystem = "Webpack";
    if (allDeps.tsup && !buildSystem) buildSystem = "tsup";
  } catch {
  }
  if (pathSet.has("pyproject.toml") || pathSet.has("requirements.txt")) {
    languages.add("Python");
    for (const reqPath of ["pyproject.toml", "requirements.txt"]) {
      try {
        const text = await readFile(resolve(scan.projectRoot, reqPath), "utf8");
        if (/django/i.test(text)) frameworks.add("Django");
        if (/fastapi/i.test(text)) frameworks.add("FastAPI");
        if (/flask/i.test(text)) frameworks.add("Flask");
        if (/sqlalchemy/i.test(text)) frameworks.add("SQLAlchemy");
        if (/pytest/i.test(text)) testingTools.add("PyTest");
      } catch {
      }
    }
  }
  for (const path of filePaths) {
    if (path !== "package.json" && basename(path) === "package.json") {
      const dir = dirname(path);
      if (isExcludedPath(dir)) continue;
      try {
        const raw = await readFile(resolve(scan.projectRoot, path), "utf8");
        const pkg = JSON.parse(raw);
        packages.push({
          path: dir,
          name: pkg.name || basename(dir),
          description: pkg.description
        });
      } catch {
        packages.push({ path: dir, name: basename(dir) });
      }
    } else {
      const dir = dirname(path);
      if (dir.startsWith("apps/") || dir.startsWith("packages/") || dir.startsWith("services/")) {
        const parts = dir.split("/");
        if (parts.length >= 2) {
          const pkgPath = parts.slice(0, 2).join("/");
          if (isExcludedPath(pkgPath)) continue;
          if (!packages.some((p) => p.path === pkgPath)) {
            packages.push({ path: pkgPath, name: basename(pkgPath) });
          }
        }
      }
    }
  }
  const envExampleCandidates = filePaths.filter((p) => /^\.env\.(?:example|template|sample|schema)$/i.test(basename(p)));
  for (const envPath of envExampleCandidates) {
    try {
      const text = await readFile(resolve(scan.projectRoot, envPath), "utf8");
      const lines = text.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const match = /^([A-Z0-9_]+)\s*=/i.exec(trimmed);
          if (match) envVariables.add(match[1]);
        }
      }
    } catch {
    }
  }
  return {
    scan,
    techStack: {
      languages: [...languages].sort(),
      packageManager,
      buildSystem,
      frameworks: [...frameworks].sort(),
      monorepo,
      testingTools: [...testingTools].sort()
    },
    architecture: {
      entryPoints: [...entryPoints].sort(),
      apiRoutes: [...apiRoutes].sort(),
      databaseSchemas: [...databaseSchemas].sort(),
      domainTypes: [...domainTypes].sort(),
      uiComponents: [...uiComponents].sort(),
      packages: packages.sort((a, b) => a.path.localeCompare(b.path))
    },
    environment: {
      configFiles: [...configFiles].sort(),
      envVariables: [...envVariables].sort(),
      infrastructure: [...infrastructure].sort()
    },
    dependencies: {
      main: [...mainDeps].sort(),
      dev: [...devDeps].sort()
    }
  };
}
async function scanRepository(root) {
  const projectRoot = await findProjectRoot(root);
  const files = await inventoryRepository(projectRoot);
  const [head, gitRepository] = await Promise.all([repositoryHead(projectRoot), isGitRepository(projectRoot)]);
  const fingerprint = createHash("sha256").update(files.map((file) => `${file.path}:${file.size}:${Math.floor(file.mtimeMs)}`).join("\n")).digest("hex");
  return {
    projectRoot,
    git: gitRepository,
    head,
    files,
    candidates: discoverScopeCandidates(files),
    fingerprint: `sha256:${fingerprint}`
  };
}
function buildTreeHierarchy(files) {
  const rootNode = { name: ".", path: ".", isDir: true, children: /* @__PURE__ */ new Map(), fileCount: 0 };
  for (const file of files) {
    const parts = file.path.split("/");
    let current = rootNode;
    current.fileCount++;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const subPath = parts.slice(0, i + 1).join("/");
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: subPath,
          isDir: !isLast,
          children: /* @__PURE__ */ new Map(),
          fileCount: 0
        });
      }
      current = current.children.get(part);
      current.fileCount++;
      if (isLast) {
        current.isDir = false;
      }
    }
  }
  return rootNode;
}
function getShortDescription(node, deepScan) {
  const p = node.path;
  const base = node.name.toLowerCase();
  if (node.isDir) {
    if (deepScan) {
      const pkg = deepScan.architecture.packages.find((pkg2) => pkg2.path === p);
      if (pkg?.description) return pkg.description;
      if (pkg) return `${pkg.name || node.name} package`;
    }
    if (p === "src" || p === "lib") return "Source code root";
    if (p.endsWith("/components") || p === "components" || p === "ui") return "UI components";
    if (p.endsWith("/routes") || p === "routes" || p === "api" || p.endsWith("/controllers")) return "API routes & handlers";
    if (p.endsWith("/db") || p === "db" || p.endsWith("/models") || p === "models") return "Database models & schemas";
    if (p.endsWith("/types") || p === "types") return "TypeScript type definitions";
    if (p.endsWith("/services") || p === "services") return "Business logic services";
    if (p === "tests" || p === "test" || p === "__tests__" || p.endsWith("/tests")) return "Test suites";
    if (p === "skills" || p.endsWith("/skills")) return "Agent skill modules";
    if (p === "workflows" || p === ".github/workflows") return "CI/CD workflows";
    if (p === "scripts") return "Build & tooling scripts";
    if (p === "public" || p === "assets") return "Static assets";
    if (p === "docs") return "Documentation";
    return void 0;
  }
  if (base === "package.json") return "Project manifest & dependencies";
  if (base === "tsconfig.json") return "TypeScript configuration";
  if (base === "readme.md") return "Project documentation";
  if (base === "agents.md") return "Agent instructions & guidelines";
  if (base === "dockerfile" || base.startsWith("docker-compose")) return "Container configuration";
  if (base === "turbo.json") return "Turborepo configuration";
  if (base === "plugin.json" || base === "hooks.json") return "Plugin & hook definitions";
  if (base === "license") return "License file";
  if (deepScan) {
    if (deepScan.architecture.entryPoints.includes(p)) return "Primary entry point";
    if (deepScan.architecture.databaseSchemas.includes(p)) return "Database schema/model";
    if (deepScan.architecture.apiRoutes.includes(p)) return "API route handler";
    if (deepScan.architecture.uiComponents.includes(p)) return "UI component";
    if (deepScan.architecture.domainTypes.includes(p)) return "Domain type definition";
    if (deepScan.environment.configFiles.includes(p)) return "Configuration file";
    if (deepScan.environment.infrastructure.includes(p)) return "Infrastructure file";
  }
  if (isTestFilePath(p)) return "Unit/Integration test";
  return void 0;
}
function generateTreemapContent(scan, deepScan) {
  const rootNode = buildTreeHierarchy(scan.files);
  const lines = ["```", "."];
  function renderChildren(node, indent, depth = 0) {
    const children = [...node.children.values()].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (depth >= 4 && children.length > 3) {
      const keyItems = children.slice(0, 2);
      const remaining = children.length - 2;
      for (let i = 0; i < keyItems.length; i++) {
        const item = keyItems[i];
        const desc = getShortDescription(item, deepScan);
        lines.push(`${indent}\u251C\u2500\u2500 ${item.name}${item.isDir ? "/" : ""}${desc ? ` # ${desc}` : ""}`);
      }
      lines.push(`${indent}\u2514\u2500\u2500 ... (${remaining} more items)`);
      return;
    }
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isLast = i === children.length - 1;
      const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
      const childIndent = indent + (isLast ? "    " : "\u2502   ");
      const desc = getShortDescription(child, deepScan);
      const descComment = desc ? ` # ${desc}` : "";
      if (child.isDir) {
        if (!child.children.size) continue;
        lines.push(`${indent}${prefix}${child.name}/${descComment}`);
        const subDirs = [...child.children.values()].filter((c) => c.isDir);
        if (subDirs.length === 0 && child.children.size > 5) {
          const files = [...child.children.values()];
          const keyFiles = files.slice(0, 3);
          const remaining = files.length - 3;
          for (let j = 0; j < keyFiles.length; j++) {
            const f = keyFiles[j];
            const fDesc = getShortDescription(f, deepScan);
            lines.push(`${childIndent}\u251C\u2500\u2500 ${f.name}${fDesc ? ` # ${fDesc}` : ""}`);
          }
          lines.push(`${childIndent}\u2514\u2500\u2500 ... (${remaining} more files)`);
        } else {
          renderChildren(child, childIndent, depth + 1);
        }
      } else {
        lines.push(`${indent}${prefix}${child.name}${descComment}`);
      }
    }
  }
  renderChildren(rootNode, "");
  lines.push("```");
  return lines.join("\n");
}
function discoverArchitectureLayers(scan, deepScan) {
  const filePaths = scan.files.map((file) => file.path);
  const detected = /* @__PURE__ */ new Map();
  const mainDeps = new Set(deepScan?.dependencies.main ?? []);
  const devDeps = new Set(deepScan?.dependencies.dev ?? []);
  const allDeps = /* @__PURE__ */ new Set([...mainDeps, ...devDeps]);
  const frameworks = new Set(deepScan?.techStack.frameworks ?? []);
  const pickLayerPaths = (filterFn, limit = 10) => {
    const matched = filePaths.filter((p) => !isTestFilePath(p) && !isSecretLike(p) && filterFn(p));
    if (matched.length <= limit) return matched;
    return matched.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)).slice(0, limit);
  };
  const frontendPaths = pickLayerPaths(
    (p) => /(?:^|\/)(?:components|views|ui|app\/(?:page|layout)|pages|src\/pages|src\/components|frontend|web|client|renderer)\//i.test(p) || /\.(?:vue|svelte|jsx|tsx|html)$/i.test(p) || /(?:^|\/)(?:index\.html|tailwind\.config\.[a-z]+|postcss\.config\.[a-z]+)$/i.test(p)
  );
  const frontendFrameworks = ["React", "Vue", "Svelte", "Next.js", "Nuxt", "Remix", "Astro", "TailwindCSS"];
  const hasFrontendFramework = frontendFrameworks.some((f) => frameworks.has(f));
  const hasFrontendDeps = ["react", "vue", "svelte", "@sveltejs/kit", "next", "nuxt", "astro", "@remix-run/react", "tailwindcss", "solid-js", "alpinejs"].some((d) => allDeps.has(d));
  if (hasFrontendFramework || hasFrontendDeps || deepScan && deepScan.architecture.uiComponents.length > 0 || frontendPaths.length >= 2) {
    const reasons = [];
    if (hasFrontendFramework) reasons.push(`Frontend framework detected: ${[...frameworks].filter((f) => frontendFrameworks.includes(f)).join(", ")}`);
    if (hasFrontendDeps && !hasFrontendFramework) reasons.push("Frontend dependencies present");
    if (deepScan && deepScan.architecture.uiComponents.length > 0) reasons.push(`${deepScan.architecture.uiComponents.length} UI component(s) found`);
    if (frontendPaths.length > 0) reasons.push(`${frontendPaths.length} frontend path(s) identified`);
    detected.set("frontend", {
      layer: "frontend",
      paths: frontendPaths,
      confidence: hasFrontendFramework || deepScan && deepScan.architecture.uiComponents.length >= 2 ? "high" : frontendPaths.length >= 2 ? "medium" : "low",
      reasons
    });
  }
  const gatewayPaths = pickLayerPaths(
    (p) => /(?:^|\/)(?:middleware|proxy|gateway|ingress|edge|routes\/edge|api\/edge)\b/i.test(p) || /(?:^|\/)(?:middleware\.(?:ts|js|mjs)|_middleware\.(?:ts|js)|nginx\.conf|caddyfile|haproxy\.cfg)$/i.test(p)
  );
  const gatewayDeps = ["@cloudflare/workers-types", "http-proxy", "http-proxy-middleware", "cors", "helmet", "express-rate-limit"].some((d) => allDeps.has(d));
  if (gatewayPaths.length > 0 || gatewayDeps) {
    const reasons = [];
    if (gatewayPaths.length > 0) reasons.push(`${gatewayPaths.length} edge/middleware/proxy path(s) found`);
    if (gatewayDeps) reasons.push("Edge/gateway/proxy dependencies found");
    detected.set("gateway-edge", {
      layer: "gateway-edge",
      paths: gatewayPaths,
      confidence: gatewayPaths.length >= 2 ? "high" : gatewayPaths.length === 1 || gatewayDeps ? "medium" : "low",
      reasons
    });
  }
  const authPaths = pickLayerPaths(
    (p) => /(?:^|\/)(?:auth|session|sessions|identity|iam|oauth|tokens?|passport|jwt|cognito|clerk|lucia)\//i.test(p) || /(?:^|\/)(?:auth\.[a-z]+|session\.[a-z]+|jwt\.[a-z]+|passport\.[a-z]+|oauth\.[a-z]+)$/i.test(p)
  );
  const authDeps = [
    "next-auth",
    "@auth/core",
    "@clerk/nextjs",
    "@clerk/clerk-sdk-node",
    "passport",
    "jsonwebtoken",
    "jose",
    "bcrypt",
    "bcryptjs",
    "argon2",
    "lucia",
    "firebase-admin",
    "@supabase/auth-helpers-nextjs",
    "@supabase/supabase-js",
    "auth0"
  ].some((d) => allDeps.has(d));
  if (authPaths.length > 0 || authDeps) {
    const reasons = [];
    if (authDeps) reasons.push("Authentication / identity dependencies detected");
    if (authPaths.length > 0) reasons.push(`${authPaths.length} auth/session path(s) found`);
    detected.set("auth", {
      layer: "auth",
      paths: authPaths,
      confidence: authDeps || authPaths.length >= 2 ? "high" : "medium",
      reasons
    });
  }
  const backendPaths = pickLayerPaths((p) => {
    if (authPaths.includes(p) || gatewayPaths.includes(p)) return false;
    return /(?:^|\/)(?:api|routes|controllers|handlers|endpoints|services|server|backend)\//i.test(p) || /(?:^|\/)(?:server\.[a-z]+|app\.[a-z]+|main\.[a-z]+|index\.[a-z]+)$/i.test(p);
  });
  const backendFrameworks = ["Express", "Fastify", "NestJS", "Hono", "Django", "FastAPI", "Flask"];
  const hasBackendFramework = backendFrameworks.some((f) => frameworks.has(f));
  const hasBackendDeps = ["express", "fastify", "@nestjs/core", "hono", "koa", "hapi", "django", "fastapi", "flask", "actix-web", "axum", "gin"].some((d) => allDeps.has(d));
  const hasApiRoutes = deepScan ? deepScan.architecture.apiRoutes.length > 0 : false;
  const hasApiPaths = backendPaths.some((p) => /(?:^|\/)(?:api|server|backend|controllers|routes)\//i.test(p));
  if (hasBackendFramework || hasBackendDeps || hasApiRoutes || backendPaths.length >= 2 && hasApiPaths || backendPaths.length >= 2 && !detected.has("frontend")) {
    const reasons = [];
    if (hasBackendFramework) reasons.push(`Backend framework detected: ${[...frameworks].filter((f) => backendFrameworks.includes(f)).join(", ")}`);
    if (hasBackendDeps && !hasBackendFramework) reasons.push("Backend server dependencies present");
    if (hasApiRoutes) reasons.push(`${deepScan?.architecture.apiRoutes.length} API route handler(s) found`);
    if (backendPaths.length > 0) reasons.push(`${backendPaths.length} server/controller path(s) found`);
    detected.set("backend", {
      layer: "backend",
      paths: backendPaths,
      confidence: hasBackendFramework || deepScan && deepScan.architecture.apiRoutes.length >= 2 ? "high" : "medium",
      reasons
    });
  }
  const databasePaths = pickLayerPaths(
    (p) => /(?:schema\.prisma|drizzle\.config|[.-]drizzle|\bmigrations?\b|\bmodels?\b|\bentities\b|\bqueries\b|\brepositories\b|db\/(?:schema|migrations?|models?)|database)\//i.test(p) || /\.(?:sql|prisma)$/i.test(p) || /(?:^|\/)(?:schema\.[a-z]+|knexfile\.[a-z]+|ormconfig\.[a-z]+)$/i.test(p)
  );
  const databaseFrameworks = ["Prisma", "Drizzle ORM", "TypeORM", "Mongoose", "SQLAlchemy"];
  const hasDatabaseFramework = databaseFrameworks.some((f) => frameworks.has(f));
  const hasDatabaseDeps = ["@prisma/client", "drizzle-orm", "typeorm", "mongoose", "pg", "mysql2", "sqlite3", "better-sqlite3", "mongodb", "redis", "ioredis", "knex", "sequelize"].some((d) => allDeps.has(d));
  const hasDatabaseSchemas = deepScan ? deepScan.architecture.databaseSchemas.length > 0 : false;
  if (hasDatabaseFramework || hasDatabaseDeps || hasDatabaseSchemas || databasePaths.length > 0) {
    const reasons = [];
    if (hasDatabaseFramework) reasons.push(`Database/ORM framework detected: ${[...frameworks].filter((f) => databaseFrameworks.includes(f)).join(", ")}`);
    if (hasDatabaseDeps && !hasDatabaseFramework) reasons.push("Database client/ORM dependencies present");
    if (hasDatabaseSchemas) reasons.push(`${deepScan?.architecture.databaseSchemas.length} database schema/model(s) found`);
    if (databasePaths.length > 0) reasons.push(`${databasePaths.length} database/migration path(s) found`);
    detected.set("database", {
      layer: "database",
      paths: databasePaths,
      confidence: hasDatabaseFramework || hasDatabaseSchemas || databasePaths.length >= 2 ? "high" : "medium",
      reasons
    });
  }
  const cloudPaths = pickLayerPaths(
    (p) => /(?:^|\/)(?:dockerfile|docker-compose.*|fly\.toml|render\.yaml|vercel\.json|netlify\.toml|serverless\.yml|terraform.*|\.tf|k8s\/|helm\/|cdk\.[a-z]+|\.github\/workflows\/)/i.test(p) || /(?:^|\/)(?:otel|sentry|datadog|prometheus|grafana|telemetry|logging|logger\.[a-z]+|metrics\.[a-z]+|tracer\.[a-z]+)/i.test(p)
  );
  const cloudDeps = ["@opentelemetry/api", "@opentelemetry/sdk-node", "winston", "pino", "morgan", "sentry", "@sentry/node", "@sentry/react", "@sentry/nextjs", "prom-client", "dd-trace"].some((d) => allDeps.has(d));
  const hasInfra = deepScan ? deepScan.environment.infrastructure.length > 0 : false;
  if (cloudPaths.length > 0 || cloudDeps || hasInfra) {
    const reasons = [];
    if (hasInfra) reasons.push(`${deepScan?.environment.infrastructure.length} infrastructure file(s) found`);
    if (cloudDeps) reasons.push("Observability / telemetry / logging dependencies found");
    if (cloudPaths.length > 0) reasons.push(`${cloudPaths.length} cloud / deployment / monitoring path(s) found`);
    detected.set("cloud-observability", {
      layer: "cloud-observability",
      paths: cloudPaths,
      confidence: hasInfra || cloudPaths.length >= 2 ? "high" : "medium",
      reasons
    });
  }
  const domainPaths = pickLayerPaths((p) => {
    if (authPaths.includes(p) || databasePaths.includes(p) || gatewayPaths.includes(p)) return false;
    return /(?:^|\/)(?:domain|domains|entities|aggregates|value-objects|invariants|policies|core|business)\//i.test(p) || (deepScan ? deepScan.architecture.domainTypes.includes(p) : false) || /(?:^|\/)(?:types|interfaces|schemas|dto)\//i.test(p);
  });
  const domainFallbackPaths = domainPaths.length > 0 ? domainPaths : pickLayerPaths((p) => p.startsWith("src/") || p.startsWith("lib/"), 5);
  detected.set("domain", {
    layer: "domain",
    paths: domainFallbackPaths,
    confidence: domainPaths.length >= 2 ? "high" : domainPaths.length === 1 ? "medium" : "low",
    reasons: domainPaths.length > 0 ? [`${domainPaths.length} domain / entity / type path(s) found`] : ["Mandatory DDD domain model & context map layer"]
  });
  const securityPaths = pickLayerPaths((p) => {
    if (authPaths.includes(p)) return false;
    return /(?:^|\/)(?:security|policy|policies|permission|permissions|cors|csp|crypto|guards?|acl|firewall|sanitiz(?:e|er))\b/i.test(p);
  });
  detected.set("security", {
    layer: "security",
    paths: securityPaths.length > 0 ? securityPaths : pickLayerPaths((p) => /(?:^|\/)(?:agents\.md|package\.json|tsconfig\.json)$/i.test(p), 3),
    confidence: securityPaths.length >= 2 ? "high" : securityPaths.length === 1 ? "medium" : "low",
    reasons: securityPaths.length > 0 ? [`${securityPaths.length} security / policy / permission path(s) found`] : ["Mandatory trust boundaries & security architecture layer"]
  });
  const systemDesignPaths = pickLayerPaths(
    (p) => /(?:^|\/)(?:package\.json|tsconfig\.json|agents\.md|readme\.md|dockerfile|turbo\.json|nx\.json|lerna\.json)$/i.test(p) || (deepScan ? deepScan.architecture.entryPoints.includes(p) : false)
  );
  detected.set("system-design", {
    layer: "system-design",
    paths: systemDesignPaths,
    confidence: "high",
    reasons: ["Mandatory top-level system design & component routing layer"]
  });
  const has = (layer) => detected.has(layer);
  detected.get("system-design").upstream = [];
  const systemDownstream = [];
  if (has("frontend")) systemDownstream.push("frontend");
  else if (has("gateway-edge")) systemDownstream.push("gateway-edge");
  else if (has("auth")) systemDownstream.push("auth");
  else if (has("backend")) systemDownstream.push("backend");
  else systemDownstream.push("domain");
  detected.get("system-design").downstream = systemDownstream;
  if (has("frontend")) {
    detected.get("frontend").upstream = has("gateway-edge") ? ["gateway-edge"] : ["system-design"];
    const down = [];
    if (has("gateway-edge")) down.push("gateway-edge");
    else if (has("auth")) down.push("auth");
    else if (has("backend")) down.push("backend");
    else down.push("domain");
    detected.get("frontend").downstream = [...new Set(down)];
  }
  if (has("gateway-edge")) {
    detected.get("gateway-edge").upstream = has("frontend") ? ["frontend"] : ["system-design"];
    const down = [];
    if (has("auth")) down.push("auth");
    if (has("backend")) down.push("backend");
    if (down.length === 0) down.push("domain");
    detected.get("gateway-edge").downstream = down;
  }
  if (has("auth")) {
    const up = [];
    if (has("gateway-edge")) up.push("gateway-edge");
    else if (has("frontend")) up.push("frontend");
    else up.push("system-design");
    detected.get("auth").upstream = up;
    detected.get("auth").downstream = has("backend") ? ["backend"] : ["domain"];
  }
  if (has("backend")) {
    const up = [];
    if (has("auth")) up.push("auth");
    if (has("gateway-edge")) up.push("gateway-edge");
    if (has("frontend") && up.length === 0) up.push("frontend");
    if (up.length === 0) up.push("system-design");
    detected.get("backend").upstream = [...new Set(up)];
    detected.get("backend").downstream = ["domain"];
  }
  const domainUp = [];
  if (has("backend")) domainUp.push("backend");
  else if (has("auth")) domainUp.push("auth");
  else if (has("gateway-edge")) domainUp.push("gateway-edge");
  else if (has("frontend")) domainUp.push("frontend");
  else domainUp.push("system-design");
  detected.get("domain").upstream = [...new Set(domainUp)];
  detected.get("domain").downstream = has("database") ? ["database"] : [];
  if (has("database")) {
    const up = ["domain"];
    if (has("backend")) up.push("backend");
    detected.get("database").upstream = up;
    detected.get("database").downstream = [];
  }
  const secUp = [];
  if (has("gateway-edge")) secUp.push("gateway-edge");
  if (has("auth")) secUp.push("auth");
  if (secUp.length === 0) secUp.push("system-design");
  detected.get("security").upstream = secUp;
  const secDown = [];
  if (has("domain")) secDown.push("domain");
  if (has("backend")) secDown.push("backend");
  detected.get("security").downstream = secDown;
  if (has("cloud-observability")) {
    detected.get("cloud-observability").upstream = [];
    detected.get("cloud-observability").downstream = [];
  }
  const detectedLayers = ALL_ARCHITECTURE_LAYERS.filter((l) => detected.has(l));
  return {
    layers: detected,
    detectedLayers
  };
}

// src/bundle.ts
var MEMORY_DIRECTORY = ".memory";
var MEMORY_VERSION = "0.2";
var RESERVED_FILES = /* @__PURE__ */ new Set(["index.md", "log.md"]);
var MAX_ROOT_INDEX_BYTES = 6e3;
var WARN_ROOT_INDEX_BYTES = 4e3;
var MAX_SCOPE_INDEX_BYTES = 8e3;
var MAX_AUTO_CONTEXT_BYTES = 6e3;
var WARN_DOCUMENT_BYTES = 16e3;
var MAX_ACTIVE_TASKS = 5;
var MAX_GENERATED_LINE_BYTES = 240;
var GOAL_STATUSES = /* @__PURE__ */ new Set([
  "draft",
  "interviewing",
  "awaiting-approval",
  "ready",
  "active",
  "blocked",
  "verifying",
  "complete",
  "archived"
]);
var SOURCE_STATUSES = /* @__PURE__ */ new Set(["new", "integrated", "changed", "stale", "unavailable", "rejected"]);
var GOAL_TRANSITIONS = {
  draft: /* @__PURE__ */ new Set(["interviewing", "archived"]),
  interviewing: /* @__PURE__ */ new Set(["draft", "awaiting-approval", "archived"]),
  "awaiting-approval": /* @__PURE__ */ new Set(["interviewing", "ready", "archived"]),
  ready: /* @__PURE__ */ new Set(["active", "archived"]),
  active: /* @__PURE__ */ new Set(["blocked", "verifying", "archived"]),
  blocked: /* @__PURE__ */ new Set(["active", "archived"]),
  verifying: /* @__PURE__ */ new Set(["active", "blocked", "complete"]),
  complete: /* @__PURE__ */ new Set(["active", "archived"]),
  archived: /* @__PURE__ */ new Set(["draft"])
};
var FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;
var ROOT_CORE_FILES = ["index.md", "goal.md", "progress.md", "tasks.md", "log.md"];
var SCOPE_CORE_FILES = ["agents.md", "log.md"];
var ROOT_ONLY_FILES = /* @__PURE__ */ new Set(["goal.md", "progress.md", "tasks.md"]);
var MAX_CONTEXT_PREVIEW = 2e4;
function normalizeSlash(path) {
  return path.split(sep2).join("/");
}
function nowIso(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function today(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().slice(0, 10);
}
function hashText(content) {
  return `sha256:${createHash2("sha256").update(content).digest("hex")}`;
}
function titleFromPath(path) {
  if (!path || path === ".") return "Project";
  return basename2(path).replace(/[-_.]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
function yamlScalar(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
function parseMarkdown(content) {
  const match = FRONTMATTER_PATTERN.exec(content);
  if (!match) return { data: {}, body: content, hasFrontmatter: false, errors: [] };
  const document = parseDocument(match[1], { customTags: [] });
  const errors = [
    ...document.errors.map((error) => error.message),
    ...document.warnings.filter((warning) => /unresolved tag/i.test(warning.message)).map((warning) => warning.message)
  ];
  let value = {};
  if (errors.length === 0) {
    try {
      value = document.toJS({ maxAliasCount: 0 });
    } catch (error) {
      errors.push(error.message);
    }
  }
  const data = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (errors.length === 0 && value !== null && (typeof value !== "object" || Array.isArray(value))) errors.push("Frontmatter must be a YAML mapping");
  return { data, body: match[2], document, hasFrontmatter: true, errors };
}
function serializeMarkdown(data, body) {
  const document = new Document(data);
  const yaml = document.toString({ lineWidth: 0 }).trimEnd();
  return `---
${yaml}
---
${body.replace(/^\n+/, "").replace(/\s*$/, "")}
`;
}
function updateMarkdownFrontmatter(content, values) {
  const parsed = parseMarkdown(content);
  if (!parsed.hasFrontmatter || parsed.errors.length > 0 || !parsed.document) {
    if (parsed.errors.length > 0) throw new Error(`Invalid YAML frontmatter: ${parsed.errors.join("; ")}`);
    return serializeMarkdown(values, parsed.body);
  }
  if (!isMap(parsed.document.contents)) throw new Error("Frontmatter must be a YAML mapping");
  for (const [key, value] of Object.entries(values)) parsed.document.set(key, value);
  const yaml = parsed.document.toString({ lineWidth: 0 }).trimEnd();
  return `---
${yaml}
---
${parsed.body.replace(/^\n+/, "").replace(/\s*$/, "")}
`;
}
function validateGeneratedMarkers(content) {
  const diagnostics = [];
  const regions = /* @__PURE__ */ new Map();
  const markerPattern = /<!--\s*memory:generated:(start|end)\s+([a-z0-9_-]+)\s*-->/gi;
  let activeRegion;
  for (const match of content.matchAll(markerPattern)) {
    const [, kind, name] = match;
    const region = regions.get(name) ?? { starts: 0, ends: 0, start: -1, end: -1 };
    if (kind.toLowerCase() === "start") {
      region.starts++;
      if (region.start < 0) region.start = match.index;
      if (activeRegion) diagnostics.push(`Generated regions may not overlap or nest ('${activeRegion}' and '${name}')`);
      activeRegion = name;
    } else if (activeRegion !== name) {
      region.ends++;
      if (region.end < 0) region.end = match.index;
      diagnostics.push(`Generated region end '${name}' does not match active region '${activeRegion ?? "none"}'`);
      activeRegion = void 0;
    } else {
      region.ends++;
      if (region.end < 0) region.end = match.index;
      activeRegion = void 0;
    }
    regions.set(name, region);
  }
  if (activeRegion) diagnostics.push(`Generated region '${activeRegion}' is not closed`);
  for (const [name, region] of regions) {
    if (region.starts !== 1 || region.ends !== 1) {
      diagnostics.push(`Generated region '${name}' must contain exactly one start and one end marker`);
      continue;
    }
    if (region.start > region.end) diagnostics.push(`Generated region '${name}' has reversed markers`);
  }
  return diagnostics;
}
function replaceGeneratedRegion(content, name, generated) {
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error(`Invalid generated region name: ${name}`);
  const errors = validateGeneratedMarkers(content);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const startMarker = `<!-- memory:generated:start ${name} -->`;
  const endMarker = `<!-- memory:generated:end ${name} -->`;
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start < 0 || end < 0 || start > end) throw new Error(`Generated region not found: ${name}`);
  const normalized = generated.trim();
  const replacement = normalized ? `${startMarker}
${normalized}
${endMarker}` : `${startMarker}
${endMarker}`;
  return `${content.slice(0, start)}${replacement}${content.slice(end + endMarker.length)}`;
}
function bundlePath(projectRoot) {
  return resolve2(projectRoot, MEMORY_DIRECTORY);
}
function safeBundleFile(projectRoot, relativePath) {
  const safe = assertSafeRelativePath(relativePath);
  const root = bundlePath(projectRoot);
  const target = safe === "." ? root : resolve2(root, safe);
  if (!isPathInside(root, target)) throw new Error(`Path escapes ${MEMORY_DIRECTORY}: ${relativePath}`);
  return target;
}
async function assertNotSymlink(path) {
  try {
    if ((await lstat2(path)).isSymbolicLink()) throw new Error(`Refusing to write through symbolic link: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
async function assertNoBundleParentSymlink(path) {
  let memoryAncestor;
  let probe = dirname2(path);
  while (dirname2(probe) !== probe) {
    if (basename2(probe) === MEMORY_DIRECTORY) {
      memoryAncestor = probe;
      break;
    }
    probe = dirname2(probe);
  }
  if (!memoryAncestor) return;
  let current = dirname2(path);
  while (isPathInside(memoryAncestor, current)) {
    try {
      if ((await lstat2(current)).isSymbolicLink()) throw new Error(`Refusing to write through symbolic-link directory: ${current}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (current === memoryAncestor) break;
    current = dirname2(current);
  }
}
async function atomicWrite(path, content) {
  await assertNoBundleParentSymlink(path);
  await mkdir(dirname2(path), { recursive: true });
  await assertNotSymlink(path);
  let mode = 420;
  try {
    mode = (await stat2(path)).mode & 511;
  } catch {
  }
  const temporary = join2(dirname2(path), `.${basename2(path)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode });
  await rename(temporary, path);
}
async function readIfExists(path) {
  try {
    return await readFile2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function assertWritableBundleVersion(projectRoot, allowMissing = false, allowLegacyMigration = false) {
  const path = join2(bundlePath(projectRoot), "index.md");
  const content = await readIfExists(path);
  if (content === void 0) {
    if (allowMissing) return;
    throw new Error("Project Memory is not initialized");
  }
  const parsed = parseMarkdown(content);
  if (!parsed.hasFrontmatter || parsed.errors.length > 0) throw new Error("Root index has invalid frontmatter; repair it before mutation");
  if (parsed.data.memory_version !== MEMORY_VERSION) {
    if (allowLegacyMigration && parsed.data.memory_version === "0.1") return;
    throw new Error(`Unsupported writable memory_version: ${String(parsed.data.memory_version)} (expected ${MEMORY_VERSION})`);
  }
}
async function assertValidForMutation(projectRoot) {
  const validation = await validateBundle(projectRoot);
  if (!validation.ok) {
    throw new Error(`Refusing to mutate an invalid bundle: ${validation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
  }
}
async function plannedWrite(path, content, dryRun, overwrite = true) {
  const before = await readIfExists(path);
  if (before !== void 0 && !overwrite) return { path, action: "skip", beforeHash: hashText(before), afterHash: hashText(before) };
  if (before === content) return { path, action: "skip", beforeHash: hashText(before), afterHash: hashText(content) };
  if (!dryRun) await atomicWrite(path, content);
  return {
    path,
    action: before === void 0 ? "create" : "update",
    beforeHash: before === void 0 ? void 0 : hashText(before),
    afterHash: hashText(content)
  };
}
function rootIndexTemplate(projectName, timestamp2, head, deepScan, fingerprint, detectedLayers = ["system-design", "domain", "security"]) {
  const stackParts = [];
  if (deepScan?.techStack.languages.length) stackParts.push(deepScan.techStack.languages.join(", "));
  if (deepScan?.techStack.frameworks.length) stackParts.push(deepScan.techStack.frameworks.slice(0, 3).join(", "));
  if (deepScan?.techStack.testingTools.length) stackParts.push(deepScan.techStack.testingTools.slice(0, 2).join(", "));
  const stack = stackParts.length > 0 ? stackParts.join("; ") : "Node.js, TypeScript / JavaScript";
  let shape = "CLI in `bin/`; runtime in `src/`; skills at repository root.";
  if (deepScan?.architecture.packages.length) {
    shape = `Monorepo with ${deepScan.architecture.packages.length} package(s): ${deepScan.architecture.packages.slice(0, 3).map((p) => `\`${p.path}\``).join(", ")}${deepScan.architecture.packages.length > 3 ? "..." : ""}`;
  } else if (deepScan?.architecture.entryPoints.length) {
    shape = `Entry points: ${deepScan.architecture.entryPoints.slice(0, 3).map((e) => `\`${e}\``).join(", ")}`;
  }
  const routeOrder = ["frontend", "gateway-edge", "auth", "backend", "domain", "database"];
  const activeRoute = routeOrder.filter((l) => detectedLayers.includes(l)).map((l) => titleFromPath(l)).join(" \u2192 ") || "Domain";
  return serializeMarkdown({
    memory_version: MEMORY_VERSION,
    architecture_mode: "ddd",
    architecture_index: "/architecture/",
    system_flow: "/architecture/system-design/Flow.md",
    project: projectName,
    summary: `${projectName} project memory root.`,
    active_scope: ".",
    active_objective: "OBJ-001",
    status: "draft",
    title: `${projectName} Project Memory`,
    description: "Executive memory capsule.",
    timestamp: timestamp2,
    repository_head: head ?? null,
    repository_fingerprint: fingerprint ?? null,
    last_scan_at: timestamp2
  }, `# Project Memory

> **TOKEN EFFICIENCY**: DO NOT load all memory files. Read ONLY the single path needed for your task.

## Project
- Purpose: ${projectName} project.
- Stack: ${stack}
- Shape: ${shape}
- DDD: mandatory; context: [Domain flow](/architecture/domain/Flow.md)
- Head/fingerprint: ${head ?? "none"} / ${fingerprint ?? "none"}

## Now
<!-- memory:generated:start active -->
- Objective: [OBJ-001](/goal.md) Project goal.
- Active scope: [Project](/goal.md)
- State: draft
- Next action: Complete interview.
- Blocker: none
<!-- memory:generated:end active -->

## Architecture
- Start: [System flow](/architecture/system-design/Flow.md)
- Domain: [Context map](/architecture/domain/Flow.md)
- Security: [Trust flow](/architecture/security/Flow.md)
- Route: ${activeRoute}
- Full map: [Architecture index](/architecture/)

## Structure & File Tree
\`\`\`text
.memory/
\u251C\u2500\u2500 index.md             # Router (< 4 KB)
\u251C\u2500\u2500 goal.md              # Requirements & AC
\u251C\u2500\u2500 progress.md          # Evidence & status
\u251C\u2500\u2500 tasks.md             # Next action (\u22645)
\u251C\u2500\u2500 log.md               # History
\u251C\u2500\u2500 architecture/        # Dynamic flow contracts
\u2502   \u251C\u2500\u2500 index.md         # Layer registry
\u2502   \u251C\u2500\u2500 system-design/   # Topology & entry
\u2502   \u251C\u2500\u2500 domain/          # DDD invariants
\u2502   \u2514\u2500\u2500 security/        # Trust & auth
\u251C\u2500\u2500 sources/             # Sources & briefs
\u2514\u2500\u2500 <scope>/             # Scope agents.md & log.md
\`\`\`

## Find
| Need | Read / Command |
|---|---|
| Next action | [.memory/tasks.md](/tasks.md) |
| Requirements | [.memory/goal.md](/goal.md) |
| Verification | [.memory/progress.md](/progress.md) |
| Domain logic | [.memory/architecture/domain/Flow.md](/architecture/domain/Flow.md) |
| Code check | \`memory check --for-path <file>\` |
| Search | \`memory search <keywords>\` |
| History | [.memory/log.md](/log.md) |
| Full map | \`memory map\` |

## Active scopes
<!-- memory:generated:start scopes -->
- [Project](/goal.md) \u2014 active
<!-- memory:generated:end scopes -->`);
}
function architectureIndexTemplate(layers, timestamp2) {
  const tableRows = layers.map((layer) => {
    return `| ${layer} | observed | - | - | [${layer}/Flow.md](./${layer}/Flow.md) |`;
  });
  return serializeMarkdown({
    type: "ArchitectureIndex",
    title: "Architecture index",
    description: "Architecture flow directory and domain boundary map.",
    timestamp: timestamp2,
    scope: "."
  }, `# Architecture Index

## Overview
Dynamic architecture map and flow routes across bounded contexts.

## Flow map
<!-- memory:generated:start flows -->
| Layer | Status | Upstream | Downstream | Flow Document |
|---|---|---|---|---|
${tableRows.join("\n")}
<!-- memory:generated:end flows -->

## Canonical layers
- **system-design**: Top-level system structure, entry points, and high-level routing.
- **domain**: Ubiquitous language, bounded contexts, and business invariants.
- **security**: Trust boundaries, security controls, and authentication policy.
- **frontend**: Browser/client presentation, UI components, and client-side state.
- **gateway-edge**: API gateway, proxy, routing, and ingress middleware.
- **auth**: Identity verification, session management, and credential issuance.
- **backend**: Application use cases, API controllers, and service orchestration.
- **database**: Data models, schemas, persistence adapters, and migrations.
- **cloud-observability**: Infrastructure, deployment, metrics, logs, and tracing.
`);
}
function flowTemplate(layer, evidence, fingerprint, timestamp2) {
  const ts = timestamp2 ?? nowIso();
  const repoPaths = evidence?.paths && evidence.paths.length > 0 ? evidence.paths.slice(0, 10) : [];
  const upstream = evidence?.upstream ?? [];
  const downstream = evidence?.downstream ?? [];
  const layerMeta = {
    "system-design": {
      title: "System design flow",
      description: "Top-level component topology, request lifecycle, and entry routing.",
      responsibility: "Orchestrates top-level system entry points and routes requests into subsystem boundaries.",
      route: "Client Request \u2192 Ingress / Gateway \u2192 Application Subsystems \u2192 Domain Core \u2192 Persistence / Infrastructure",
      steps: [
        { step: "1. Entry", input: "User / External Request", owner: "System Gateway", output: "Normalized Payload", failure: "400 Bad Request" },
        { step: "2. Routing", input: "Normalized Payload", owner: "Route Dispatcher", output: "Subsystem Invocation", failure: "404 Not Found" },
        { step: "3. Execution", input: "Subsystem Context", owner: "Domain / App Service", output: "Domain Result", failure: "500 Internal Error" },
        { step: "4. Response", input: "Domain Result", owner: "Response Formatter", output: "Serialized Response", failure: "Transport Error" }
      ],
      context: "System root boundary and subsystem registry.",
      language: "Entry points, Subsystems, Ingress, Router, Context Dispatcher.",
      invariants: "All external requests must enter through recognized gateway/entry points.",
      useCases: "Route request, dispatch commands, aggregate subsystem responses.",
      ports: "System entry point adapters, CLI routers, HTTP gateways.",
      dataClass: "Public perimeter payload; sanitized prior to internal dispatch.",
      trustBoundaries: "Public untrusted perimeter \u2192 authenticated subsystem runtime.",
      auth: "Perimeter validation and header extraction.",
      persistence: "Subsystem-delegated.",
      failureBehavior: "Fail-closed with sanitized error codes.",
      telemetry: "Ingress request counter, duration histogram, panic handler logs.",
      recovery: "Graceful process restart and health check probes."
    },
    "domain": {
      title: "Domain flow",
      description: "Core DDD model, context boundaries, ubiquitous language, and business invariants.",
      responsibility: "Encapsulates business rules, invariants, and ubiquitous language isolated from infrastructure concerns.",
      route: "Application Command / Query \u2192 Domain Port \u2192 Domain Entity / Aggregate \u2192 Business Rule Evaluation \u2192 Domain Event / Result",
      steps: [
        { step: "1. Invariant Validation", input: "Command / Input Values", owner: "Domain Aggregate", output: "Validated Entities", failure: "Invariant Violation" },
        { step: "2. State Transition", input: "Validated Command", owner: "Domain Model", output: "Updated State", failure: "Business Rule Error" },
        { step: "3. Port Notification", input: "Domain Outcome", owner: "Domain Port", output: "Emitted Event / Result", failure: "Infrastructure Error" }
      ],
      context: "Core Business Domain (Single Bounded Context or Root Context).",
      language: "Aggregate, Entity, Value Object, Invariant, Domain Port, Domain Event.",
      invariants: "State transitions must maintain model invariants; no direct database mutations bypass domain logic.",
      useCases: "Execute business transaction, apply domain rules, evaluate policies.",
      ports: "Repository interface, Event Publisher port, Notification port.",
      dataClass: "Domain state; internal high-integrity data.",
      trustBoundaries: "Application service boundary \u2192 isolated domain model.",
      auth: "Domain permission verification and policy invariants.",
      persistence: "Decoupled domain repositories (implemented in infrastructure/database).",
      failureBehavior: "Domain exception / invariant rejection with explicit failure reason.",
      telemetry: "Domain event counters, business rule violation alerts.",
      recovery: "Transaction rollback and idempotent retry."
    },
    "security": {
      title: "Security and trust flow",
      description: "Trust boundaries, authentication policies, permission verification, and data classification.",
      responsibility: "Enforces trust boundaries, cryptographic controls, authentication checks, and authorization policies across all routes.",
      route: "Untrusted Input \u2192 Trust Boundary Check \u2192 Identity Verification \u2192 Permission Evaluation \u2192 Sanitized Execution",
      steps: [
        { step: "1. Perimeter Check", input: "Raw Request / Payload", owner: "Security Guard", output: "Sanitized Input", failure: "403 Forbidden" },
        { step: "2. Identity Check", input: "Credentials / Token", owner: "Identity Provider", output: "Verified Subject", failure: "401 Unauthorized" },
        { step: "3. Authorization", input: "Subject & Permission Scope", owner: "Policy Engine", output: "Access Grant", failure: "403 Forbidden" }
      ],
      context: "Security & Trust Boundary Context.",
      language: "Principal, Token, Permission, Trust Boundary, Cipher, Policy Guard.",
      invariants: "Never execute unauthenticated or unauthorized operations across trust borders; secrets must never be exposed.",
      useCases: "Validate token, verify RBAC/ABAC permissions, enforce CSP/CORS, sanitize inputs.",
      ports: "Policy enforcement point (PEP), Secret manager port.",
      dataClass: "Confidential credentials, encryption keys, authorization tokens.",
      trustBoundaries: "Untrusted boundary \u2192 Perimeter guard \u2192 Authenticated domain.",
      auth: "Signature verification, token expiry check, revocation list check.",
      persistence: "Encrypted key storage or external IAM / secret manager.",
      failureBehavior: "Immediate reject (401/403) with generic error message.",
      telemetry: "Authentication failure rate, suspicious activity alerts, audit trail log.",
      recovery: "Session revocation, rate limiting, credential rotation."
    },
    "frontend": {
      title: "Frontend flow",
      description: "Client presentation, user interaction, UI components, and state management.",
      responsibility: "Manages user interface rendering, client state transitions, and asynchronous communication with backend services.",
      route: "User Interaction \u2192 Component Event Handler \u2192 Client State Store \u2192 API Client \u2192 DOM Render",
      steps: [
        { step: "1. User Event", input: "DOM Interaction", owner: "UI Component", output: "Action Dispatch", failure: "Client Validation Error" },
        { step: "2. State Mutation", input: "Action", owner: "State Store", output: "Updated Reactive State", failure: "State Sync Failure" },
        { step: "3. Network Sync", input: "Server Request", owner: "API Client", output: "Async Response", failure: "Network / HTTP Error" }
      ],
      context: "Frontend Presentation & Client UI Context.",
      language: "Component, View, Client State, Action, Hook, Render Pipeline.",
      invariants: "UI states must remain deterministic and reflect valid underlying domain state.",
      useCases: "Render user views, capture form input, manage client-side navigation.",
      ports: "HTTP API client, Local storage adapter, WebSocket bridge.",
      dataClass: "User presentation data and client session cache.",
      trustBoundaries: "User browser environment \u2192 API gateway / edge.",
      auth: "Client bearer token storage and refresh loop.",
      persistence: "Browser cache, local storage, indexedDB.",
      failureBehavior: "Visual error toast / error boundary fallback.",
      telemetry: "Client web vitals (CWV), unhandled JS error tracking.",
      recovery: "Optimistic UI rollback and automated reconnection."
    },
    "gateway-edge": {
      title: "Gateway and edge routing flow",
      description: "Reverse proxy, ingress termination, rate limiting, and edge request dispatch.",
      responsibility: "Terminates public network traffic, enforces ingress rate limits, and routes requests to appropriate downstream services.",
      route: "Inbound HTTP Traffic \u2192 Edge TLS / Firewall \u2192 Rate Limiter \u2192 Reverse Proxy \u2192 Upstream Target",
      steps: [
        { step: "1. Ingress Termination", input: "Public TCP/HTTP Request", owner: "Edge Server", output: "Decrypted Request", failure: "TLS Handshake Failure" },
        { step: "2. Rate Limiting", input: "Client IP / Token", owner: "Rate Limiter", output: "Traffic Clearance", failure: "429 Too Many Requests" },
        { step: "3. Upstream Dispatch", input: "Cleared Request", owner: "Proxy Router", output: "Upstream Forwarding", failure: "502 Bad Gateway" }
      ],
      context: "Gateway & Edge Routing Context.",
      language: "Ingress, Reverse Proxy, Upstream, Route Rule, Rate Limit, Edge Worker.",
      invariants: "Malformed or oversized payloads must be terminated before entering internal network.",
      useCases: "Terminate TLS, proxy upstream requests, enforce IP rate limits, route by path.",
      ports: "HTTP Reverse Proxy, DNS resolver, CDN edge cache.",
      dataClass: "Inbound raw HTTP stream.",
      trustBoundaries: "Public Internet \u2192 Private VPC / backend cluster.",
      auth: "Perimeter token inspection and API key verification.",
      persistence: "Transient connection cache and rate limit state (Redis/KV).",
      failureBehavior: "Standard HTTP gateway status codes (429, 502, 504).",
      telemetry: "Edge request rates, response latency percentiles, upstream error rates.",
      recovery: "Upstream health checking and failover to secondary endpoints."
    },
    "auth": {
      title: "Authentication flow",
      description: "Identity verification, token issuance, session lifecycle, and credential validation.",
      responsibility: "Authenticates principal identities, manages session tokens, and validates cryptographic credentials.",
      route: "Credential Submission \u2192 Credential Validation \u2192 Subject Resolution \u2192 Session / Token Issuance \u2192 Authenticated Context",
      steps: [
        { step: "1. Credential Ingestion", input: "Login / Token Payload", owner: "Auth Controller", output: "Raw Credentials", failure: "400 Bad Request" },
        { step: "2. Identity Verification", input: "Credentials", owner: "Identity Validator", output: "Verified Principal", failure: "401 Invalid Credentials" },
        { step: "3. Token Issuance", input: "Verified Principal", owner: "Token Service", output: "Signed JWT / Session", failure: "Token Signing Error" }
      ],
      context: "Identity & Authentication Context.",
      language: "Principal, Subject, Session, Refresh Token, Credential, Password Hash.",
      invariants: "Passwords must be hashed using strong one-way algorithms; tokens must be cryptographically signed with short TTL.",
      useCases: "User login, session refresh, OAuth code exchange, logout revocation.",
      ports: "User credential repository, Hash provider, Token signer.",
      dataClass: "Confidential credentials, password hashes, session records.",
      trustBoundaries: "Public login endpoint \u2192 Identity verification boundary.",
      auth: "Multi-factor authentication (MFA) and cryptographic signature checks.",
      persistence: "User account table, Redis session store.",
      failureBehavior: "Exponential backoff on failed attempts; timing-safe comparisons.",
      telemetry: "Login success/failure metrics, brute-force attempt alerts.",
      recovery: "Account recovery workflow and emergency session invalidation."
    },
    "backend": {
      title: "Backend application flow",
      description: "HTTP controllers, application use cases, service orchestration, and domain dispatch.",
      responsibility: "Receives transport requests, executes application use cases, coordinates transaction boundaries, and returns responses.",
      route: "HTTP Route Match \u2192 Controller / Handler \u2192 Application Use Case \u2192 Domain Execution \u2192 DTO Serialization",
      steps: [
        { step: "1. Request Handling", input: "HTTP Request", owner: "Route Handler", output: "Parsed DTO", failure: "400 Bad Request" },
        { step: "2. Use Case Execution", input: "Validated DTO", owner: "Application Service", output: "Domain Operation", failure: "Business Exception" },
        { step: "3. Output Mapping", input: "Domain Result", owner: "Presenter / Serializer", output: "HTTP Response DTO", failure: "500 Serialization Error" }
      ],
      context: "Application Orchestration Context.",
      language: "Controller, Route Handler, Application Service, Use Case, DTO, Presenter.",
      invariants: "Controllers must not contain business logic; dependencies must point inwards toward domain.",
      useCases: "Coordinate multi-aggregate transactions, dispatch domain commands, query read models.",
      ports: "HTTP Server router, Domain port callers, Transaction manager.",
      dataClass: "Application request/response DTOs.",
      trustBoundaries: "Transport layer \u2192 Application use case layer.",
      auth: "Route-level authorization middleware.",
      persistence: "Transaction coordinator delegating to repository interfaces.",
      failureBehavior: "Catch domain exceptions and map to standardized error envelopes.",
      telemetry: "Controller execution latency, HTTP status code distribution.",
      recovery: "Database transaction rollback and idempotent retry queues."
    },
    "database": {
      title: "Database and persistence flow",
      description: "Entity relational mapping, query execution, migration management, and persistence adapters.",
      responsibility: "Executes ACID persistence transactions, manages database connections, and maps database records to domain entities.",
      route: "Domain Repository Invocation \u2192 Persistence Adapter \u2192 Query / ORM Layer \u2192 Database Engine \u2192 Hydrated Entity",
      steps: [
        { step: "1. Query Preparation", input: "Domain Entity / Query Criteria", owner: "Repository Adapter", output: "SQL / Query Statement", failure: "Query Build Error" },
        { step: "2. DB Execution", input: "Query Statement", owner: "DB Driver / Pool", output: "Raw Record Set", failure: "DB Connection / Constraint Error" },
        { step: "3. Entity Hydration", input: "Raw Record Set", owner: "Entity Mapper", output: "Hydrated Domain Model", failure: "Mapping Error" }
      ],
      context: "Persistence & Data Access Infrastructure Context.",
      language: "Schema, Migration, Repository Adapter, ORM, Connection Pool, Record.",
      invariants: "Database constraints enforce relational integrity; migrations are versioned and reversible.",
      useCases: "Persist aggregate state, execute relational queries, manage schema migrations.",
      ports: "Database driver connection pool, ORM mapper.",
      dataClass: "Persistent system of record data.",
      trustBoundaries: "Internal private network database connection.",
      auth: "Database credential pooling with minimum required privileges.",
      persistence: "Relational/Document database storage engine.",
      failureBehavior: "Transaction abort, pool reconnection on connection drop.",
      telemetry: "Query latency histograms, connection pool utilization, slow query logs.",
      recovery: "Automated transaction retry and read-replica failover."
    },
    "cloud-observability": {
      title: "Cloud infrastructure and observability flow",
      description: "Telemetry instrumentation, distributed tracing, structured logging, deployment, and monitoring.",
      responsibility: "Collects runtime metrics, traces distributed operations, ships structured logs, and monitors service health.",
      route: "Runtime Event / Trace Span \u2192 Telemetry Exporter \u2192 Ingestion Pipeline \u2192 Storage / Dashboard \u2192 Alert Rule Evaluation",
      steps: [
        { step: "1. Telemetry Capture", input: "Runtime Operation / Metric", owner: "Instrumentation Hook", output: "OpenTelemetry Span / Metric", failure: "Dropped Event" },
        { step: "2. Log / Trace Export", input: "Structured Log Record", owner: "Telemetry Pipeline", output: "Batched Ingestion Payload", failure: "Export Timeout" },
        { step: "3. Alerting", input: "Aggregated Metrics", owner: "Monitoring Engine", output: "Alert Notification", failure: "Alert Delivery Failure" }
      ],
      context: "Cloud Infrastructure & Telemetry Context.",
      language: "Metric, Span, Trace, Structured Log, Prometheus, OpenTelemetry, Dashboard.",
      invariants: "Sensitive data / PII must be redacted from all telemetry streams before export.",
      useCases: "Export application traces, ship JSON logs, aggregate SLA/SLO metrics, trigger alert webhooks.",
      ports: "OTel collector exporter, Log appender transport, Metrics registry.",
      dataClass: "Operational metrics, sanitized trace context, application logs.",
      trustBoundaries: "Application runtime \u2192 Cloud monitoring / observability backend.",
      auth: "Telemetry collector API keys / IAM instance roles.",
      persistence: "Time-series database and log archival buckets.",
      failureBehavior: "Non-blocking asynchronous telemetry export (never block application critical path).",
      telemetry: "Self-monitoring metrics: export queue depth, drop counters.",
      recovery: "Local telemetry ring buffer on network partition."
    }
  };
  const meta = layerMeta[layer] ?? {
    title: `${titleFromPath(layer)} flow`,
    description: `Architecture flow for ${layer}.`,
    responsibility: `Manages operations and boundaries for ${layer}.`,
    route: "Input \u2192 Processing \u2192 Domain \u2192 Output",
    steps: [{ step: "1. Process", input: "Input", owner: layer, output: "Output", failure: "Error" }],
    context: `${layer} context.`,
    language: `${layer} terms.`,
    invariants: `Invariants for ${layer}.`,
    useCases: `Use cases for ${layer}.`,
    ports: "Adapters.",
    dataClass: "Internal data.",
    trustBoundaries: "Subsystem boundary.",
    auth: "Authentication checks.",
    persistence: "Persistence mechanism.",
    failureBehavior: "Graceful error handling.",
    telemetry: "Logs and metrics.",
    recovery: "Recovery strategies."
  };
  const stepsTable = [
    "| Step | Input | Owner | Output | Failure |",
    "|---|---|---|---|---|",
    ...meta.steps.map((s) => `| ${s.step} | ${s.input} | ${s.owner} | ${s.output} | ${s.failure} |`)
  ].join("\n");
  const anchorsContent = repoPaths.length > 0 ? repoPaths.map((p) => `- [\`${p}\`](repo://${p})`).join("\n") : "- No direct code anchors detected.";
  let mermaidBlock = "";
  if (layer === "system-design") {
    mermaidBlock = `
\`\`\`mermaid
graph LR
  Client["Client / User"] --> Ingress["Ingress / Entry"]
  Ingress --> App["App Subsystems"]
  App --> Domain["Domain Core"]
  Domain --> Storage["Persistence / Infrastructure"]
\`\`\`
`;
  }
  const body = `# ${meta.title}

## Responsibility
${meta.responsibility}

## Route
${meta.route}
${mermaidBlock}
## Steps
${stepsTable}

## Domain contract
- Context: ${meta.context}
- Language: ${meta.language}
- Invariants: ${meta.invariants}
- Application use cases: ${meta.useCases}
- Domain ports: ${meta.ports}

## Data & trust
- Data classification: ${meta.dataClass}
- Trust boundaries: ${meta.trustBoundaries}
- Authorization: ${meta.auth}
- Persistence: ${meta.persistence}

## Failure & observability
- Failure behavior: ${meta.failureBehavior}
- Logs/metrics/traces: ${meta.telemetry}
- Recovery: ${meta.recovery}

## Code anchors
<!-- memory:generated:start anchors -->
${anchorsContent}
<!-- memory:generated:end anchors -->

## Decisions & unknowns
- Confirmed initial baseline.`;
  return serializeMarkdown({
    type: "Flow",
    title: meta.title,
    description: meta.description,
    layer,
    scope: ".",
    status: "observed",
    repo_paths: repoPaths,
    upstream,
    downstream,
    provenance: "observed",
    repository_fingerprint: fingerprint ?? null,
    timestamp: ts
  }, body);
}
function indexTemplate(title) {
  return `# ${title}

## Child directories

<!-- memory:generated:start children -->
<!-- memory:generated:end children -->

## Documents

<!-- memory:generated:start documents -->
<!-- memory:generated:end documents -->

## Source files

<!-- memory:generated:start files -->
<!-- memory:generated:end files -->

## Tests

<!-- memory:generated:start tests -->
<!-- memory:generated:end tests -->
`;
}
function goalTemplate(scope, timestamp2, initialContext) {
  const title = titleFromPath(scope);
  let body = `# Goal

## Motivation

Pending interview.

## User & outcome

## Success measures

## Scope & non-goals

## Confirmed wants

## Must-not rules

## Requirements

## Acceptance criteria

Use stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.

## Constraints & dependencies
`;
  if (initialContext) {
    body += `
### Context from AGENTS.md

${initialContext}
`;
  }
  body += `
## Decisions & reversals

## Questions & unresolved

## Interview coverage

- **Decisions:** 0 / ${scope === "." ? "10\u201320" : "10\u201315"}
- **State:** pending

## Citations`;
  return serializeMarkdown({
    type: "Goal",
    title: `${title} goal`,
    description: `Goal for ${scope === "." ? "project" : scope}.`,
    timestamp: timestamp2,
    scope,
    status: "draft",
    provenance: initialContext ? "observed" : "unresolved",
    uid: randomUUID()
  }, body);
}
function progressTemplate(scope, timestamp2) {
  const title = titleFromPath(scope);
  return serializeMarkdown({
    type: "Progress",
    title: `${title} progress`,
    description: `Progress for ${scope === "." ? "project" : scope}.`,
    timestamp: timestamp2,
    scope,
    goal: "./goal.md",
    uid: randomUUID()
  }, `# Progress

## Current state

Not started.

## Completed work

## Current work

## Blockers & drift

## Acceptance evidence

| Criterion | Status | Evidence |
|---|---|---|

## Latest verification

## Next action

- **Action:** Complete interview.
- **Reason:** Intent pending approval.
- **Requirement:** Unresolved.
- **Likely files:** Unknown.
- **Verification:** User approval.
- **Approval:** pending

## Handoff

Continue interview.`);
}
function tasksTemplate(scope, timestamp2) {
  const title = titleFromPath(scope);
  return serializeMarkdown({
    type: "Tasks",
    title: `${title} tasks`,
    description: `Task breakdown for ${scope === "." ? "project" : scope} formatted with ADHD and project-memory principles.`,
    timestamp: timestamp2,
    scope,
    uid: randomUUID()
  }, `# Tasks

## Single next action

- **Action:** Define project requirements & task list.
- **File / Command:** Edit \`.memory/tasks.md\` or run \`/memory-init\`.
- **Time estimate:** [5 min]

## Current state

Step 0 of 0 done: Pending task breakdown. Next: Define initial tasks.

## Active tasks (Do Now)

> [!NOTE]
> Maximum 5 active items. Numbered single-bounded steps only.

1. [ ] **Define project requirements** \`[15 min]\` (REQ-001) \u2014 Specify main features in \`goal.md\`
2. [ ] **Scaffold feature scopes** \`[10 min]\` (REQ-002) \u2014 Set up tracked scopes in \`.memory/\`

## Backlog (Do Later)

- [ ] **Acceptance criteria verification** \`[30 min]\` (AC-001) \u2014 Map test evidence paths

## Completed tasks summary

- **Total completed:** 0
- **Summary:** No tasks completed yet.
`);
}
function logTemplate(scope, timestamp2) {
  return `# ${titleFromPath(scope)} History

## ${today(timestamp2)}

### Initialization
- **Update:** Initialized \`${scope}\` memory.
- **Evidence:** System init.
`;
}
function allDirectoryPrefixes(scope) {
  if (scope === ".") return [];
  const parts = scope.split("/");
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}
function scopeDirectory(projectRoot, scope) {
  return scope === "." ? bundlePath(projectRoot) : safeBundleFile(projectRoot, scope);
}
function relativeChangePath(projectRoot, absolute) {
  return normalizeSlash(relative2(projectRoot, absolute));
}
function buildDeepGoalContent(scope, timestamp2, initialContext, deepScan) {
  const title = titleFromPath(scope);
  const tech = deepScan.techStack;
  const arch = deepScan.architecture;
  const env = deepScan.environment;
  let body = `# Goal

## Auto-Detected Architecture & Tech Stack

`;
  if (tech.languages.length > 0) body += `- **Languages:** ${tech.languages.join(", ")}
`;
  if (tech.frameworks.length > 0) body += `- **Frameworks & Libraries:** ${tech.frameworks.join(", ")}
`;
  if (tech.monorepo) body += `- **Monorepo Structure:** ${tech.monorepo}
`;
  if (tech.packageManager) body += `- **Package Manager:** ${tech.packageManager}
`;
  if (tech.buildSystem) body += `- **Build System:** ${tech.buildSystem}
`;
  if (tech.testingTools.length > 0) body += `- **Testing Stack:** ${tech.testingTools.join(", ")}
`;
  if (arch.packages.length > 0) {
    body += `
### Monorepo Packages & Features

`;
    for (const pkg of arch.packages) {
      body += `- **\`${pkg.path}\`**: ${pkg.name || titleFromPath(pkg.path)}${pkg.description ? ` \u2014 ${pkg.description}` : ""}
`;
    }
  }
  if (arch.entryPoints.length > 0) {
    body += `
### Primary Entry Points

`;
    for (const ep of arch.entryPoints.slice(0, 10)) body += `- \`${ep}\`
`;
  }
  if (arch.databaseSchemas.length > 0) {
    body += `
### Database Schemas & Models

`;
    for (const schema4 of arch.databaseSchemas.slice(0, 10)) body += `- \`${schema4}\`
`;
  }
  if (arch.apiRoutes.length > 0) {
    body += `
### Discovered API Surface

`;
    for (const route of arch.apiRoutes.slice(0, 15)) body += `- \`${route}\`
`;
  }
  if (env.envVariables.length > 0) {
    body += `
### Required Environment Variables

`;
    for (const varName of env.envVariables.slice(0, 20)) body += `- \`${varName}\`
`;
  }
  if (env.configFiles.length > 0 || env.infrastructure.length > 0) {
    body += `
### Tooling & Infrastructure Configurations

`;
    for (const config of [...env.configFiles, ...env.infrastructure].slice(0, 15)) body += `- \`${config}\`
`;
  }
  body += `
## Motivation

Deep codebase ingestion scan performed during project initialization.

## User & outcome

## Success measures

## Scope & non-goals

## Confirmed wants

## Must-not rules

## Requirements

## Acceptance criteria

Use stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.

## Constraints & dependencies
`;
  if (initialContext) {
    body += `
### Context from AGENTS.md

${initialContext}
`;
  }
  body += `
## Decisions & reversals

## Questions & unresolved

## Interview coverage

- **Decisions:** 0 / 10\u201320
- **State:** pending

## Citations`;
  return serializeMarkdown({
    type: "Goal",
    title: `${title} goal`,
    description: `Goal for project.`,
    timestamp: timestamp2,
    scope: ".",
    status: "draft",
    provenance: "observed",
    uid: randomUUID()
  }, body);
}
function buildScopeAgentsContent(scope, timestamp2, deepScan) {
  const title = titleFromPath(scope);
  let archSummary = "";
  if (deepScan) {
    const scopeFiles = deepScan.scan.files.filter((f) => f.path.startsWith(`${scope}/`));
    const entryPoints = deepScan.architecture.entryPoints.filter((e) => e.startsWith(`${scope}/`));
    const apiRoutes = deepScan.architecture.apiRoutes.filter((r) => r.startsWith(`${scope}/`));
    const schemas2 = deepScan.architecture.databaseSchemas.filter((s) => s.startsWith(`${scope}/`));
    archSummary = `Auto-scaffolded scope for \`${scope}\` (${scopeFiles.length} files).

`;
    if (entryPoints.length > 0) {
      archSummary += `### Entry Points

`;
      for (const ep of entryPoints) archSummary += `- \`${ep}\`
`;
      archSummary += `
`;
    }
    if (apiRoutes.length > 0) {
      archSummary += `### API Routes

`;
      for (const route of apiRoutes) archSummary += `- \`${route}\`
`;
      archSummary += `
`;
    }
    if (schemas2.length > 0) {
      archSummary += `### Schemas & Models

`;
      for (const schema4 of schemas2) archSummary += `- \`${schema4}\`
`;
      archSummary += `
`;
    }
  } else {
    archSummary = `Tracked scope for \`${scope}\`.

`;
  }
  const body = `# ${title} Agents

> Combined instructions, architecture summary, goal requirements, progress, and tasks for \`${scope}\`.

## Scope Architecture & Summary

${archSummary.trimEnd()}

## Goal & Requirements

### Motivation
Pending interview.

### User & outcome

### Success measures

### Scope & non-goals

### Confirmed wants

### Must-not rules

### Requirements

### Acceptance criteria
Use stable IDs in the \`AC-NNN\` form. Each criterion must be independently verifiable.

### Constraints & dependencies

## Current State & Progress

### Current state
Not started.

### Blockers & drift
none

### Acceptance evidence
| Criterion | Status | Evidence |
|---|---|---|

## Tasks & Action Items

### Single next action
- **Action:** Define scope requirements & task breakdown.
- **File / Command:** Edit \`.memory/${scope}/agents.md\`.
- **Time estimate:** [5 min]
- **Requirement:** Unresolved
- **Likely files:** \`${scope}/\`
- **Verification:** User approval
- **Approval:** pending

### Active tasks (Do Now)
> [!NOTE]
> Maximum 5 active items. Numbered single-bounded steps only.

1. [ ] **Define scope requirements** \`[10 min]\` (REQ-001) \u2014 Specify main features for \`${scope}\`
2. [ ] **Verify scope boundaries** \`[10 min]\` (REQ-002) \u2014 Confirm inputs, outputs, and dependencies

### Backlog (Do Later)
- [ ] **Acceptance criteria verification** \`[20 min]\` (AC-001) \u2014 Map test evidence paths

### Completed tasks summary
- **Total completed:** 0
- **Summary:** No tasks completed yet.
`;
  return serializeMarkdown({
    type: "Agents",
    title: `${title} agents`,
    description: `Combined agent instructions, goal, progress, and tasks for ${scope}.`,
    timestamp: timestamp2,
    scope,
    status: "draft",
    provenance: deepScan ? "observed" : "unresolved",
    uid: randomUUID()
  }, body);
}
async function initializeBundle(projectRoot, scopes = [], options = {}) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const dryRun = options.dryRun ?? false;
  const date = options.now ?? /* @__PURE__ */ new Date();
  const timestamp2 = nowIso(date);
  const head = await repositoryHead(root);
  await assertWritableBundleVersion(root, true);
  if (await readIfExists(join2(bundlePath(root), "index.md")) !== void 0) await assertValidForMutation(root);
  const isDeep = options.deep ?? true;
  const deepScan = isDeep ? await deepScanRepository(root) : void 0;
  let normalizedScopes = [...new Set(scopes.map(assertSafeRelativePath).filter((scope) => scope !== "." && !isExcludedPath(scope)))].sort();
  if (isDeep && deepScan && scopes.length === 0) {
    const autoCandidates = deepScan.scan.candidates.filter((candidate) => candidate.confidence === "high" || candidate.confidence === "medium").map((candidate) => candidate.path);
    const packageScopes = deepScan.architecture.packages.map((pkg) => pkg.path);
    const discovered = [.../* @__PURE__ */ new Set([...autoCandidates, ...packageScopes])].map(assertSafeRelativePath).filter((scope) => scope !== "." && !isExcludedPath(scope)).sort();
    normalizedScopes = [.../* @__PURE__ */ new Set([...normalizedScopes, ...discovered])].sort();
  }
  for (const scope of normalizedScopes) {
    await assertNoBundleParentSymlink(join2(scopeDirectory(root, scope), "agents.md"));
  }
  const unmanagedAgents = await readUnmanagedAgentsContent(root);
  const changes = [];
  const initialScan = deepScan ? deepScan.scan : await scanRepository(root);
  const discovery = discoverArchitectureLayers(initialScan, deepScan);
  const rootGoalContent = deepScan ? buildDeepGoalContent(".", timestamp2, unmanagedAgents, deepScan) : goalTemplate(".", timestamp2, unmanagedAgents);
  const rootFiles = /* @__PURE__ */ new Map([
    [join2(memoryRoot, "index.md"), rootIndexTemplate(options.projectName ?? basename2(root), timestamp2, head, deepScan, initialScan.fingerprint, discovery.detectedLayers)],
    [join2(memoryRoot, "goal.md"), rootGoalContent],
    [join2(memoryRoot, "progress.md"), progressTemplate(".", timestamp2)],
    [join2(memoryRoot, "tasks.md"), tasksTemplate(".", timestamp2)],
    [join2(memoryRoot, "log.md"), logTemplate(".", date)],
    [join2(memoryRoot, "sources", "index.md"), indexTemplate("Sources")],
    [join2(memoryRoot, "architecture", "index.md"), architectureIndexTemplate(discovery.detectedLayers, timestamp2)]
  ]);
  const layersToScaffold = [
    ...MANDATORY_ARCHITECTURE_LAYERS,
    ...CONDITIONAL_ARCHITECTURE_LAYERS.filter((layer) => discovery.layers.has(layer))
  ];
  for (const layer of layersToScaffold) {
    const evidence = discovery.layers.get(layer);
    rootFiles.set(
      join2(memoryRoot, "architecture", layer, "Flow.md"),
      flowTemplate(layer, evidence, initialScan.fingerprint, timestamp2)
    );
  }
  for (const [path, content] of rootFiles) changes.push({ ...await plannedWrite(path, content, dryRun, false), path: relativeChangePath(root, path) });
  const tracked = [".", ...normalizedScopes];
  for (const scope of normalizedScopes) {
    const directory = scopeDirectory(root, scope);
    const scopeAgentsContent = buildScopeAgentsContent(scope, timestamp2, deepScan);
    const files = /* @__PURE__ */ new Map([
      [join2(directory, "agents.md"), scopeAgentsContent],
      [join2(directory, "log.md"), logTemplate(scope, date)]
    ]);
    for (const [path, content] of files) changes.push({ ...await plannedWrite(path, content, dryRun, false), path: relativeChangePath(root, path) });
  }
  if (!dryRun) {
    const agentsChange = await syncAgentsFile(root);
    const freshScan = await scanRepository(root);
    changes.push(...(await syncIndexes(root, freshScan, { dryRun, now: date })).map((change) => ({ ...change, path: relativeChangePath(root, resolve2(root, change.path)) })));
    changes.push({ ...agentsChange, path: "AGENTS.md" });
  }
  return { root, bundle: memoryRoot, scopes: tracked, changes };
}
async function walkMemory(root, current = root, files = [], diagnostics = []) {
  let entries;
  try {
    entries = await readdir2(current, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return { files, diagnostics };
    throw error;
  }
  for (const entry of entries) {
    if (entry.name === ".lock" || entry.name.endsWith(".tmp")) continue;
    const absolute = join2(current, entry.name);
    if (entry.isSymbolicLink()) {
      diagnostics.push({ severity: "error", code: "symlink", path: normalizeSlash(relative2(root, absolute)), message: "Symbolic links are not allowed inside the bundle" });
      continue;
    }
    if (entry.isDirectory()) await walkMemory(root, absolute, files, diagnostics);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return { files, diagnostics };
}
async function documentMetadata(path) {
  const content = await readIfExists(path);
  if (!content) return { title: titleFromPath(basename2(path, extname2(path))), description: "" };
  const parsed = parseMarkdown(content);
  const fallback = titleFromPath(basename2(path, extname2(path)));
  return {
    title: typeof parsed.data.title === "string" ? parsed.data.title : fallback,
    description: typeof parsed.data.description === "string" ? parsed.data.description : "",
    type: typeof parsed.data.type === "string" ? parsed.data.type : void 0,
    status: typeof parsed.data.status === "string" ? parsed.data.status : void 0
  };
}
function markdownEntry(label, target, description = "") {
  return `- [${label}](${target})${description ? ` \u2014 ${description}` : ""}`;
}
function directChildren(directory, allDirectories) {
  return [...allDirectories].filter((candidate) => dirname2(candidate) === directory && candidate !== directory).sort();
}
function scopeFromMemoryDirectory(memoryRoot, directory) {
  const rel = normalizeSlash(relative2(memoryRoot, directory));
  return rel || ".";
}
function isTestFile(path) {
  return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i.test(path);
}
function sourceFileLines(scope, scan, tests) {
  if (!scan || scope === "." || scope === "sources" || scope.startsWith("sources/")) return [];
  const direct = scan.files.filter((file) => normalizeSlash(dirname2(file.path)) === scope && isTestFile(file.path) === tests);
  return direct.map((file) => {
    return markdownEntry(basename2(file.path), `repo://${file.path}`, `${file.extension || "file"}, ${file.size} bytes`);
  });
}
async function discoverTrackedScopes(projectRoot) {
  const memoryRoot = bundlePath(projectRoot);
  const walk = await walkMemory(memoryRoot);
  const directories = /* @__PURE__ */ new Set();
  if (await readIfExists(join2(memoryRoot, "goal.md")) !== void 0 && await readIfExists(join2(memoryRoot, "progress.md")) !== void 0 && await readIfExists(join2(memoryRoot, "log.md")) !== void 0) {
    directories.add(".");
  }
  for (const file of walk.files) {
    const directory = dirname2(file);
    if (directory === memoryRoot) continue;
    if (isPathInside(join2(memoryRoot, "architecture"), directory) || isPathInside(join2(memoryRoot, "sources"), directory)) continue;
    const base = basename2(file);
    if (base === "agents.md") {
      if (await readIfExists(join2(directory, "log.md")) !== void 0) {
        directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
      }
    } else if (base === "goal.md") {
      if (await readIfExists(join2(directory, "progress.md")) !== void 0 && await readIfExists(join2(directory, "log.md")) !== void 0) {
        directories.add(scopeFromMemoryDirectory(memoryRoot, directory));
      }
    }
  }
  return [...directories].sort((a, b) => a === "." ? -1 : b === "." ? 1 : a.localeCompare(b));
}
async function generateDocumentsList(files, dir, pathPrefix, emptyMessage) {
  const directDocuments = files.filter((file) => dirname2(file) === dir && !RESERVED_FILES.has(basename2(file)));
  const documentLines = await Promise.all(directDocuments.sort().map(async (file) => {
    const metadata = await documentMetadata(file);
    return markdownEntry(metadata.title, `${pathPrefix}${basename2(file)}`, metadata.description);
  }));
  return documentLines.join("\n") || emptyMessage;
}
function computeScopeFingerprint(scan, scope) {
  if (!scan) return void 0;
  return hashText(
    scan.files.filter((file) => scope === "." || file.path.startsWith(`${scope}/`)).map((file) => `${file.path}:${file.size}:${file.mtimeMs}`).join("\n")
  );
}
function applySourceFingerprint(content, sourceFingerprint) {
  const marker = `<!-- memory:source-fingerprint ${sourceFingerprint} -->`;
  const clean = content.replace(/<!-- memory:source-fingerprint [^>]+ -->\n?/, "");
  return `${clean.trimEnd()}

${marker}
`;
}
async function syncIndexes(projectRoot, scan, options = {}) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const archDir = join2(memoryRoot, "architecture");
  const dryRun = options.dryRun ?? false;
  await assertWritableBundleVersion(root, true, true);
  const walk = await walkMemory(memoryRoot);
  if (walk.files.length === 0) throw new Error(`Project Memory is not initialized at ${memoryRoot}`);
  const directories = /* @__PURE__ */ new Set([memoryRoot]);
  for (const file of walk.files) {
    let current = dirname2(file);
    while (isPathInside(memoryRoot, current)) {
      directories.add(current);
      if (current === memoryRoot) break;
      current = dirname2(current);
    }
  }
  const scopes = await discoverTrackedScopes(root);
  const changes = [];
  const fallbackHead = scan?.head ?? await repositoryHead(root);
  const snapshot = dryRun ? void 0 : await captureBundle(root);
  const discovery = scan ? discoverArchitectureLayers(scan) : void 0;
  try {
    for (const directory of [...directories].sort()) {
      const scope = scopeFromMemoryDirectory(memoryRoot, directory);
      const isArchRoot = directory === archDir;
      const isArchLayer = dirname2(directory) === archDir;
      if (isArchLayer) {
        const layer = basename2(directory);
        const flowPath = join2(directory, "Flow.md");
        let flowContent = await readIfExists(flowPath);
        if (flowContent) {
          const parsedFlow = parseMarkdown(flowContent);
          const evidence = discovery?.layers.get(layer);
          const anchorLines = evidence && evidence.paths.length > 0 ? evidence.paths.slice(0, 10).map((p) => `- [\`${p}\`](repo://${p})`).join("\n") : "- No direct code anchors detected.";
          if (flowContent.includes("<!-- memory:generated:start anchors -->")) {
            flowContent = replaceGeneratedRegion(flowContent, "anchors", anchorLines);
          }
          const flowValues = {};
          if (scan && scan.fingerprint !== parsedFlow.data.repository_fingerprint) {
            flowValues.repository_fingerprint = scan.fingerprint;
            flowValues.timestamp = nowIso(options.now);
          }
          if (evidence) {
            if (evidence.upstream && (!Array.isArray(parsedFlow.data.upstream) || parsedFlow.data.upstream.length === 0)) {
              flowValues.upstream = evidence.upstream;
            }
            if (evidence.downstream && (!Array.isArray(parsedFlow.data.downstream) || parsedFlow.data.downstream.length === 0)) {
              flowValues.downstream = evidence.downstream;
            }
            if (CONDITIONAL_ARCHITECTURE_LAYERS.includes(layer) && !discovery?.detectedLayers.includes(layer)) {
              if (parsedFlow.data.status !== "stale") flowValues.status = "stale";
            } else if (discovery?.detectedLayers.includes(layer)) {
              const nextStatus = parsedFlow.data.status === "confirmed" ? "confirmed" : "observed";
              if (parsedFlow.data.status !== nextStatus) flowValues.status = nextStatus;
            }
          }
          if (Object.keys(flowValues).length > 0) {
            flowContent = updateMarkdownFrontmatter(flowContent, flowValues);
          }
          const change2 = await plannedWrite(flowPath, flowContent, dryRun, true);
          changes.push({ ...change2, path: relativeChangePath(root, flowPath) });
        }
        continue;
      }
      const indexPath = join2(directory, "index.md");
      let content = await readIfExists(indexPath);
      if (!content) {
        if (directory === memoryRoot) {
          content = rootIndexTemplate(basename2(root), nowIso(options.now), fallbackHead, void 0, scan?.fingerprint, discovery?.detectedLayers);
        } else if (isArchRoot) {
          content = architectureIndexTemplate(discovery?.detectedLayers ?? [...MANDATORY_ARCHITECTURE_LAYERS], nowIso(options.now));
        } else if (directory === join2(memoryRoot, "sources")) {
          content = indexTemplate("Sources");
        } else {
          const agentsPath = join2(directory, "agents.md");
          let agentsContent = await readIfExists(agentsPath);
          const sourceFingerprint2 = computeScopeFingerprint(scan, scope);
          if (agentsContent && sourceFingerprint2) {
            agentsContent = applySourceFingerprint(agentsContent, sourceFingerprint2);
            const change2 = await plannedWrite(agentsPath, agentsContent, dryRun, true);
            changes.push({ ...change2, path: relativeChangePath(root, agentsPath) });
          }
          continue;
        }
      }
      if (directory === memoryRoot) {
        const rootParsed = parseMarkdown(content);
        if (!rootParsed.hasFrontmatter || rootParsed.errors.length > 0) throw new Error("Root index.md must contain valid frontmatter");
        const activeScope = typeof rootParsed.data.active_scope === "string" ? rootParsed.data.active_scope : ".";
        let nextClean = "Not set.";
        let blockerClean = "none";
        let goalStatus = typeof rootParsed.data.status === "string" ? rootParsed.data.status : "draft";
        let objectiveId = typeof rootParsed.data.active_objective === "string" ? rootParsed.data.active_objective : "OBJ-001";
        let objectiveTitle = "";
        if (activeScope === ".") {
          const progressPath = join2(memoryRoot, "progress.md");
          const progress = await readIfExists(progressPath);
          const next = progress ? extractSection(progress, "Next action").trim() : "No active next action.";
          nextClean = next ? next.replace(/\n+/g, " ") : "Not set.";
          const blockers = progress ? extractSection(progress, "Blockers & drift").trim() : "";
          blockerClean = blockers && !/^(?:none|n\/a|not blocked)\.?$/i.test(blockers) ? blockers.replace(/\n+/g, " ") : "none";
          const goalPath = join2(memoryRoot, "goal.md");
          const goalContent = await readIfExists(goalPath);
          const goalParsed = goalContent ? parseMarkdown(goalContent) : void 0;
          if (goalParsed?.data.status) goalStatus = String(goalParsed.data.status);
          if (goalContent) {
            const objMatch = /^##\s+([A-Z0-9_-]+)(?:\s+[—–-]\s+(.+))?$/m.exec(goalContent);
            if (objMatch) {
              objectiveId = objMatch[1];
              objectiveTitle = objMatch[2] ? ` ${objMatch[2].trim()}` : "";
            } else if (goalParsed?.data.title && typeof goalParsed.data.title === "string" && !goalParsed.data.title.toLowerCase().endsWith("goal")) {
              objectiveTitle = ` ${goalParsed.data.title}`;
            }
          }
        } else {
          const agentsPath = join2(scopeDirectory(root, activeScope), "agents.md");
          const agentsContent = await readIfExists(agentsPath);
          if (agentsContent) {
            const agentsParsed = parseMarkdown(agentsContent);
            if (agentsParsed.data.status) goalStatus = String(agentsParsed.data.status);
            const next = extractSection(agentsContent, "Single next action") || extractSection(agentsContent, "Single Next Action") || extractSection(agentsContent, "Next action");
            nextClean = next ? next.replace(/\n+/g, " ") : "Not set.";
            const blockers = extractSection(agentsContent, "Blockers & drift") || extractSection(agentsContent, "Blockers & Drift");
            blockerClean = blockers && !/^(?:none|n\/a|not blocked)\.?$/i.test(blockers) ? blockers.replace(/\n+/g, " ") : "none";
            if (agentsParsed.data.title && typeof agentsParsed.data.title === "string") {
              objectiveTitle = ` ${agentsParsed.data.title}`;
            }
          }
        }
        const goalLink = activeScope === "." ? "/goal.md" : `/${activeScope}/agents.md`;
        const scopeLink = activeScope === "." ? "/goal.md" : `/${activeScope}/agents.md`;
        const scopeLabel = activeScope === "." ? "Project" : activeScope;
        const activeText = `- Objective: [${objectiveId}](${goalLink})${objectiveTitle}
- Active scope: [${scopeLabel}](${scopeLink})
- State: ${goalStatus}
- Next action: ${nextClean}
- Blocker: ${blockerClean}`;
        if (content.includes("<!-- memory:generated:start active -->")) {
          content = replaceGeneratedRegion(content, "active", activeText);
        } else if (content.includes("<!-- memory:generated:start focus -->")) {
          content = replaceGeneratedRegion(content, "focus", activeText);
        }
        const sortedScopes = [...scopes];
        const activeIdx = sortedScopes.indexOf(activeScope);
        if (activeIdx > -1) {
          sortedScopes.splice(activeIdx, 1);
          sortedScopes.unshift(activeScope);
        }
        const visibleScopes = sortedScopes.slice(0, 5);
        const remainingCount = sortedScopes.length - visibleScopes.length;
        const scopeLines = [];
        for (const trackedScope of visibleScopes) {
          const docPath = trackedScope === "." ? join2(memoryRoot, "goal.md") : join2(scopeDirectory(root, trackedScope), "agents.md");
          const metadata = await documentMetadata(docPath);
          const target = trackedScope === "." ? "/goal.md" : `/${trackedScope}/agents.md`;
          const label = trackedScope === "." ? "Project" : trackedScope;
          const status = metadata.status ? `(${metadata.status})` : "";
          const isActive = trackedScope === activeScope ? " \u2014 active" : "";
          const desc = metadata.description && !metadata.description.startsWith("Goal for ") && !metadata.description.startsWith("Combined agent") ? ` \u2014 ${metadata.description}` : "";
          scopeLines.push(`- [${label}](${target})${status ? ` ${status}` : ""}${isActive}${desc}`.replace(/\s+/g, " ").trim());
        }
        if (remainingCount > 0) {
          scopeLines.push(`- ... (${remainingCount} more tracked scope(s))`);
        }
        if (content.includes("<!-- memory:generated:start scopes -->")) {
          content = replaceGeneratedRegion(content, "scopes", scopeLines.join("\n") || "- No tracked scopes.");
        }
        if (content.includes("<!-- memory:generated:start treemap -->")) {
          content = replaceGeneratedRegion(content, "treemap", "");
        }
        if (content.includes("<!-- memory:generated:start documents -->")) {
          content = replaceGeneratedRegion(
            content,
            "documents",
            await generateDocumentsList(walk.files, memoryRoot, "/", "- No root documents.")
          );
        }
        if (content.includes("<!-- memory:generated:start sources -->")) {
          content = replaceGeneratedRegion(
            content,
            "sources",
            await generateDocumentsList(walk.files, join2(memoryRoot, "sources"), "/sources/", "- No sources registered.")
          );
        }
        const rootUpdates = {};
        if (rootParsed.data.memory_version !== MEMORY_VERSION) rootUpdates.memory_version = MEMORY_VERSION;
        if (rootParsed.data.architecture_mode !== "ddd") rootUpdates.architecture_mode = "ddd";
        if (rootParsed.data.architecture_index !== "/architecture/") rootUpdates.architecture_index = "/architecture/";
        if (rootParsed.data.system_flow !== "/architecture/system-design/Flow.md") rootUpdates.system_flow = "/architecture/system-design/Flow.md";
        if (scan && ((scan.head ?? null) !== rootParsed.data.repository_head || scan.fingerprint !== rootParsed.data.repository_fingerprint)) {
          rootUpdates.repository_head = scan.head ?? null;
          rootUpdates.repository_fingerprint = scan.fingerprint;
          rootUpdates.last_scan_at = nowIso(options.now);
          rootUpdates.timestamp = nowIso(options.now);
        }
        if (Object.keys(rootUpdates).length > 0) {
          content = updateMarkdownFrontmatter(content, rootUpdates);
        }
      } else if (isArchRoot) {
        const archLayers = ALL_ARCHITECTURE_LAYERS.filter(
          (l) => walk.files.some((f) => f === join2(archDir, l, "Flow.md"))
        );
        const flowRows = [];
        for (const l of archLayers) {
          const flowFile = join2(archDir, l, "Flow.md");
          const flowDoc = await readIfExists(flowFile);
          if (flowDoc) {
            const parsedFlow = parseMarkdown(flowDoc);
            const status = typeof parsedFlow.data.status === "string" ? parsedFlow.data.status : "observed";
            const up = Array.isArray(parsedFlow.data.upstream) && parsedFlow.data.upstream.length > 0 ? parsedFlow.data.upstream.join(", ") : "none";
            const down = Array.isArray(parsedFlow.data.downstream) && parsedFlow.data.downstream.length > 0 ? parsedFlow.data.downstream.join(", ") : "none";
            flowRows.push(`| ${l} | ${status} | ${up} | ${down} | [${l}/Flow.md](./${l}/Flow.md) |`);
          }
        }
        if (content.includes("<!-- memory:generated:start flows -->")) {
          content = replaceGeneratedRegion(
            content,
            "flows",
            flowRows.length > 0 ? `| Layer | Status | Upstream | Downstream | Flow Document |
|---|---|---|---|---|
${flowRows.join("\n")}` : "| Layer | Status | Upstream | Downstream | Flow Document |\n|---|---|---|---|---|"
          );
        }
      } else {
        if (content.includes("<!-- memory:generated:start children -->")) {
          const childLines = directChildren(directory, directories).map((child) => {
            const label = basename2(child);
            return markdownEntry(titleFromPath(label), `./${label}/`);
          });
          content = replaceGeneratedRegion(content, "children", childLines.join("\n") || "- No child directories.");
        }
        if (content.includes("<!-- memory:generated:start documents -->")) {
          content = replaceGeneratedRegion(
            content,
            "documents",
            await generateDocumentsList(walk.files, directory, "./", "- No documents.")
          );
        }
        if (content.includes("<!-- memory:generated:start files -->")) {
          const fileLines = sourceFileLines(scope, scan, false);
          content = replaceGeneratedRegion(content, "files", fileLines.join("\n") || "- No direct source files.");
        }
        if (content.includes("<!-- memory:generated:start tests -->")) {
          const testLines = sourceFileLines(scope, scan, true);
          content = replaceGeneratedRegion(content, "tests", testLines.join("\n") || "- No direct tests.");
        }
      }
      const sourceFingerprint = computeScopeFingerprint(scan, scope);
      if (sourceFingerprint && directory !== memoryRoot && !isArchRoot && !isArchLayer) {
        content = applySourceFingerprint(content, sourceFingerprint);
      }
      const change = await plannedWrite(indexPath, content, dryRun, true);
      changes.push({ ...change, path: relativeChangePath(root, indexPath) });
    }
    return changes;
  } catch (error) {
    if (snapshot) await restoreBundle(root, snapshot);
    throw error;
  }
}
function slugify(value) {
  const base = value.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (base || "source").slice(0, 70);
}
async function findSourceByResource(projectRoot, resource) {
  const sourcesRoot = safeBundleFile(projectRoot, "sources");
  const walk = await walkMemory(sourcesRoot);
  for (const path of walk.files) {
    if (basename2(path) === "index.md") continue;
    const content = await readFile2(path, "utf8");
    const parsed = parseMarkdown(content);
    if (parsed.data.resource === resource) return { path, content };
  }
  return void 0;
}
function sourceTemplate(title, resource, hash, timestamp2) {
  return serializeMarkdown({
    type: "Source",
    title,
    description: `Source record for ${resource}.`,
    resource,
    timestamp: timestamp2,
    registered_at: timestamp2,
    checked_at: timestamp2,
    integrated_at: null,
    source_hash: hash,
    previous_hashes: [],
    integration_status: "new",
    affected_documents: [],
    uid: randomUUID()
  }, `# Source summary

Pending integration.

## Extracted claims

## Affected documents

## Contradictions and questions

## Citations

- [Raw source](${resource})`);
}
async function updateSourceRecord(root, existing, resource, hash, contentPreview, eventTitle, dryRun = false) {
  const parsed = parseMarkdown(existing.content);
  const timestamp2 = nowIso();
  const previousHash = parsed.data.source_hash;
  const changed = previousHash !== hash;
  const status = changed ? "changed" : parsed.data.integration_status === "integrated" ? "integrated" : "new";
  const previousHashes = Array.isArray(parsed.data.previous_hashes) ? [...parsed.data.previous_hashes] : [];
  if (changed && typeof previousHash === "string" && !previousHashes.some((entry) => typeof entry === "object" && entry !== null && entry.hash === previousHash)) {
    previousHashes.push({ hash: previousHash, observed_at: parsed.data.checked_at ?? parsed.data.timestamp ?? timestamp2 });
  }
  const next = updateMarkdownFrontmatter(existing.content, {
    timestamp: changed ? timestamp2 : parsed.data.timestamp,
    checked_at: timestamp2,
    source_hash: hash,
    previous_hashes: previousHashes,
    integration_status: status,
    integrated_at: changed ? null : parsed.data.integrated_at
  });
  const path = normalizeSlash(relative2(root, existing.path));
  const event = { type: "source-change", title: eventTitle, resource, previous_hash: previousHash, source_hash: hash, source_record: path };
  if (changed) assertSafeEvent(event);
  if (!dryRun && next !== existing.content) await atomicWrite(existing.path, next);
  if (!dryRun && changed) await recordEvent(root, ".", event);
  if (!dryRun) await syncIndexes(root);
  return {
    path,
    resource,
    hash,
    status,
    changed,
    needsIntegration: status === "new" || status === "changed",
    affectedDocuments: Array.isArray(parsed.data.affected_documents) ? parsed.data.affected_documents.filter((item) => typeof item === "string") : [],
    contentPreview: contentPreview?.slice(0, MAX_CONTEXT_PREVIEW)
  };
}
async function registerSource(projectRoot, input, options = {}) {
  const root = resolve2(projectRoot);
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const fingerprint = await fingerprintSource(root, input, options.fetchRemote ?? /^https?:\/\//i.test(input));
  const existing = await findSourceByResource(root, fingerprint.resource);
  const timestamp2 = nowIso();
  if (existing) {
    return updateSourceRecord(root, existing, fingerprint.resource, fingerprint.hash, fingerprint.content, "Source fingerprint changed", options.dryRun);
  }
  const sourceName = fingerprint.resource.startsWith("repo://") ? basename2(fingerprint.resource.slice("repo://".length)) : new URL(fingerprint.resource).hostname + new URL(fingerprint.resource).pathname;
  const suffix = fingerprint.hash.slice("sha256:".length, "sha256:".length + 8);
  const path = safeBundleFile(root, `sources/${slugify(sourceName)}-${suffix}.md`);
  const content = sourceTemplate(titleFromPath(sourceName), fingerprint.resource, fingerprint.hash, timestamp2);
  const registrationEvent = {
    type: "source-registration",
    title: "Source registered",
    resource: fingerprint.resource,
    source_hash: fingerprint.hash,
    source_record: normalizeSlash(relative2(root, path))
  };
  assertSafeEvent(registrationEvent);
  if (!options.dryRun) {
    await atomicWrite(path, content);
    await recordEvent(root, ".", registrationEvent);
    await syncIndexes(root);
  }
  return {
    path: normalizeSlash(relative2(root, path)),
    resource: fingerprint.resource,
    hash: fingerprint.hash,
    status: "new",
    changed: true,
    needsIntegration: true,
    affectedDocuments: [],
    contentPreview: fingerprint.content?.slice(0, MAX_CONTEXT_PREVIEW)
  };
}
async function registerTextSource(projectRoot, name, text, kind = "input", options = {}) {
  const root = resolve2(projectRoot);
  if (!name.trim() || !text.trim()) throw new Error("Text sources require a non-empty name and content");
  if (containsLikelySecret(text)) throw new Error("Text source contains likely secret material");
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("Text source exceeds 2097152 bytes");
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const resource = `${kind}://${slugify(name)}`;
  const hash = `sha256:${createHash2("sha256").update(text).digest("hex")}`;
  const timestamp2 = nowIso();
  const existing = await findSourceByResource(root, resource);
  if (existing) {
    return updateSourceRecord(root, existing, resource, hash, text, "Text source changed", options.dryRun);
  }
  const suffix = hash.slice("sha256:".length, "sha256:".length + 8);
  const path = safeBundleFile(root, `sources/${kind}-${slugify(name)}-${suffix}.md`);
  if (!options.dryRun) {
    await atomicWrite(path, sourceTemplate(titleFromPath(name), resource, hash, timestamp2));
    await recordEvent(root, ".", { type: "source-registration", title: "Text source registered", resource, source_hash: hash, source_record: normalizeSlash(relative2(root, path)) });
    await syncIndexes(root);
  }
  return {
    path: normalizeSlash(relative2(root, path)),
    resource,
    hash,
    status: "new",
    changed: true,
    needsIntegration: true,
    affectedDocuments: [],
    contentPreview: text.slice(0, MAX_CONTEXT_PREVIEW)
  };
}
async function refreshRegisteredSources(projectRoot, options = {}) {
  const root = resolve2(projectRoot);
  await assertWritableBundleVersion(root);
  await assertValidForMutation(root);
  const sourcesRoot = safeBundleFile(root, "sources");
  const walk = await walkMemory(sourcesRoot);
  const results = [];
  for (const path of walk.files.sort()) {
    if (basename2(path) === "index.md") continue;
    const content = await readFile2(path, "utf8");
    const parsed = parseMarkdown(content);
    if (parsed.data.type !== "Source" || typeof parsed.data.resource !== "string") continue;
    const resource = parsed.data.resource;
    const affectedDocuments = Array.isArray(parsed.data.affected_documents) ? parsed.data.affected_documents.filter((item) => typeof item === "string") : [];
    const previousStatus = typeof parsed.data.integration_status === "string" && SOURCE_STATUSES.has(parsed.data.integration_status) ? parsed.data.integration_status : "new";
    const nonFileResource = /^[a-z][a-z0-9+.-]*:/i.test(resource) && !/^(?:https?|repo):/i.test(resource);
    if (nonFileResource || /^https?:\/\//i.test(resource) && !options.fetchRemote) {
      results.push({
        path: normalizeSlash(relative2(root, path)),
        resource,
        hash: typeof parsed.data.source_hash === "string" ? parsed.data.source_hash : "unknown",
        status: previousStatus,
        changed: false,
        needsIntegration: previousStatus === "new" || previousStatus === "changed" || previousStatus === "stale",
        affectedDocuments
      });
      continue;
    }
    try {
      const fingerprint = await fingerprintSource(root, resource, options.fetchRemote ?? false);
      const previousHash = parsed.data.source_hash;
      const changed = previousHash !== fingerprint.hash;
      const status = changed ? "changed" : previousStatus === "unavailable" ? "new" : previousStatus;
      const previousHashes = Array.isArray(parsed.data.previous_hashes) ? [...parsed.data.previous_hashes] : [];
      if (changed && typeof previousHash === "string" && !previousHashes.some((entry) => typeof entry === "object" && entry !== null && entry.hash === previousHash)) {
        previousHashes.push({ hash: previousHash, observed_at: parsed.data.checked_at ?? parsed.data.timestamp ?? nowIso() });
      }
      const next = changed || previousStatus === "unavailable" ? updateMarkdownFrontmatter(content, {
        timestamp: nowIso(),
        checked_at: nowIso(),
        source_hash: fingerprint.hash,
        previous_hashes: previousHashes,
        integration_status: status,
        integrated_at: changed ? null : parsed.data.integrated_at,
        last_error: null
      }) : content;
      if (!options.dryRun && next !== content) await atomicWrite(path, next);
      if (!options.dryRun && changed) {
        await recordEvent(root, ".", {
          type: "source-change",
          title: "Source fingerprint changed",
          resource,
          previous_hash: previousHash,
          source_hash: fingerprint.hash,
          affected_documents: affectedDocuments
        });
      }
      results.push({
        path: normalizeSlash(relative2(root, path)),
        resource,
        hash: fingerprint.hash,
        status,
        changed,
        needsIntegration: status === "new" || status === "changed" || status === "stale",
        affectedDocuments,
        contentPreview: changed ? fingerprint.content?.slice(0, MAX_CONTEXT_PREVIEW) : void 0
      });
    } catch (error) {
      const changed = previousStatus !== "unavailable";
      const next = changed ? updateMarkdownFrontmatter(content, { timestamp: nowIso(), checked_at: nowIso(), integration_status: "unavailable", last_error: error.message }) : content;
      if (!options.dryRun && next !== content) await atomicWrite(path, next);
      if (!options.dryRun && changed) {
        await recordEvent(root, ".", { type: "source-unavailable", title: "Source unavailable", resource, affected_documents: affectedDocuments });
      }
      results.push({
        path: normalizeSlash(relative2(root, path)),
        resource,
        hash: typeof parsed.data.source_hash === "string" ? parsed.data.source_hash : "unknown",
        status: "unavailable",
        changed,
        needsIntegration: true,
        affectedDocuments
      });
    }
  }
  if (!options.dryRun && results.some((result) => result.changed)) await syncIndexes(root);
  return results;
}
function assertSafeEvent(event) {
  if (containsLikelySecret(JSON.stringify(event))) throw new Error("Refusing to record likely secret material in history");
  for (const [key, value] of Object.entries(event)) {
    if (/(?:password|passwd|secret|credential|access[_-]?token|private[_-]?key)/i.test(key) && value !== void 0 && value !== null && value !== "[redacted]") {
      throw new Error(`Refusing to record secret-like event field: ${key}`);
    }
  }
}
function formatEvent(event) {
  assertSafeEvent(event);
  const title = typeof event.title === "string" ? event.title : typeof event.type === "string" ? event.type : "Update";
  const id = typeof event.id === "string" ? event.id : `evt-${(/* @__PURE__ */ new Date()).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`;
  const lines = [`### ${title} \u2014 \`${id}\``];
  for (const [key, value] of Object.entries(event)) {
    if (key === "title" || key === "type" || key === "id" || value === void 0 || value === null) continue;
    const label = key.replace(/[_-]+/g, " ").replace(/^./, (character) => character.toUpperCase());
    const rendered = Array.isArray(value) ? value.map(yamlScalar).join(", ") : yamlScalar(value);
    lines.push(`- **${label}:** ${rendered}`);
  }
  return lines.join("\n");
}
function prependLogEntry(content, date, entry) {
  const dateHeading = `## ${date}`;
  const headingIndex = content.indexOf(dateHeading);
  if (headingIndex >= 0) {
    const insertion = headingIndex + dateHeading.length;
    return `${content.slice(0, insertion)}

${entry}
${content.slice(insertion).replace(/^\n+/, "\n")}`;
  }
  const firstDate = content.search(/^## \d{4}-\d{2}-\d{2}\s*$/m);
  if (firstDate >= 0) return `${content.slice(0, firstDate)}${dateHeading}

${entry}

${content.slice(firstDate)}`;
  return `${content.trimEnd()}

${dateHeading}

${entry}
`;
}
async function recordEvent(projectRoot, scope, event, options = {}) {
  await assertWritableBundleVersion(projectRoot);
  await assertValidForMutation(projectRoot);
  const safeScope = assertSafeRelativePath(scope || ".");
  const path = join2(scopeDirectory(projectRoot, safeScope), "log.md");
  const content = await readIfExists(path);
  if (!content) throw new Error(`Tracked scope does not contain log.md: ${scope}`);
  const next = prependLogEntry(content, today(options.now), formatEvent(event));
  const change = await plannedWrite(path, next, options.dryRun ?? false, true);
  return { ...change, path: relativeChangePath(projectRoot, path) };
}
function extractSection(content, heading) {
  const pattern = new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = pattern.exec(content);
  if (!match) return "";
  const rest = content.slice(match.index + match[0].length).replace(/^\s+/, "");
  const next = rest.search(/^#{2,3}\s+/m);
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}
async function readScopeDocuments(directory, isRoot) {
  if (isRoot) {
    const [goal2, progress2] = await Promise.all([
      readIfExists(join2(directory, "goal.md")),
      readIfExists(join2(directory, "progress.md"))
    ]);
    return { goal: goal2, progress: progress2 };
  }
  const agents = await readIfExists(join2(directory, "agents.md"));
  if (agents) {
    return { goal: agents, progress: agents, agents };
  }
  const [goal, progress] = await Promise.all([
    readIfExists(join2(directory, "goal.md")),
    readIfExists(join2(directory, "progress.md"))
  ]);
  return { goal, progress };
}
async function checkCompletionReadiness(projectRoot, scope = ".", evidenceRoot = projectRoot) {
  const root = resolve2(projectRoot);
  const canonicalEvidenceRoot = await realpath2(evidenceRoot);
  const safeScope = assertSafeRelativePath(scope);
  const directory = scopeDirectory(root, safeScope);
  const docs = await readScopeDocuments(directory, safeScope === ".");
  if (!docs.goal || !docs.progress) {
    return {
      ready: false,
      criteria: [],
      verified: [],
      missing: [safeScope === "." ? "Tracked scope is missing goal.md or progress.md" : "Tracked scope is missing agents.md"]
    };
  }
  const goal = docs.goal;
  const progress = docs.progress;
  const criteria = [...new Set(extractSection(goal, "Acceptance criteria").match(/\bAC-\d{3}\b/g) ?? [])].sort();
  const evidenceSection = extractSection(progress, "Acceptance evidence");
  const verified = [];
  const missing = [];
  if (criteria.length === 0) missing.push("Goal has no stable acceptance criterion IDs (expected AC-001, AC-002, ...)");
  for (const criterion of criteria) {
    const row = evidenceSection.split("\n").find((line) => line.includes(`| ${criterion} |`) || line.includes(`|${criterion}|`));
    if (!row) {
      missing.push(`${criterion} has no evidence row`);
      continue;
    }
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    const status = cells[1] ?? "";
    const evidence = cells.slice(2).join(" | ");
    if (!/^(?:verified|passed|complete|done)$/i.test(status)) missing.push(`${criterion} status is not verified`);
    else {
      const references = [...evidence.matchAll(/repo:\/\/([^\s)`\]]+)/g)].flatMap((match) => {
        try {
          return [decodeURIComponent(match[1].split(/[?#]/, 1)[0])];
        } catch {
          return [];
        }
      });
      let linkedEvidence = false;
      for (const reference of references) {
        try {
          const path = resolve2(canonicalEvidenceRoot, assertSafeRelativePath(reference));
          const canonical = await realpath2(path);
          const info = await lstat2(path);
          if (isPathInside(canonicalEvidenceRoot, canonical) && !isExcludedPath(reference) && info.isFile() && !info.isSymbolicLink()) linkedEvidence = true;
        } catch {
        }
      }
      if (!linkedEvidence) missing.push(`${criterion} has no existing repo:// evidence file`);
      else verified.push(criterion);
    }
  }
  return { ready: missing.length === 0, criteria, verified, missing };
}
async function getMemoryStatus(projectRoot, scope) {
  const root = resolve2(projectRoot);
  const rootIndex = await readIfExists(join2(bundlePath(root), "index.md"));
  if (!rootIndex) {
    const validation = await validateBundle(root);
    return { initialized: false, root, sourceCounts: {}, validation };
  }
  const rootParsed = parseMarkdown(rootIndex);
  const activeScope = scope ? assertSafeRelativePath(scope) : typeof rootParsed.data.active_scope === "string" ? rootParsed.data.active_scope : ".";
  const directory = scopeDirectory(root, activeScope);
  let goalStatus;
  let nextAction;
  let blockers;
  const docs = await readScopeDocuments(directory, activeScope === ".");
  if (docs.agents) {
    const parsed = parseMarkdown(docs.agents);
    goalStatus = typeof parsed.data.status === "string" ? parsed.data.status : void 0;
    nextAction = extractSection(docs.agents, "Single next action") || extractSection(docs.agents, "Single Next Action") || extractSection(docs.agents, "Next action") || void 0;
    blockers = extractSection(docs.agents, "Blockers & drift") || extractSection(docs.agents, "Blockers & Drift") || extractSection(docs.agents, "Blockers and drift") || void 0;
  } else {
    goalStatus = docs.goal ? parseMarkdown(docs.goal).data.status : void 0;
    nextAction = docs.progress ? extractSection(docs.progress, "Next action") : void 0;
    blockers = docs.progress ? extractSection(docs.progress, "Blockers & drift") || extractSection(docs.progress, "Blockers and drift") : void 0;
  }
  const sourceCounts = {};
  const sourceWalk = await walkMemory(join2(bundlePath(root), "sources"));
  for (const path of sourceWalk.files) {
    if (basename2(path) === "index.md") continue;
    const parsed = parseMarkdown(await readFile2(path, "utf8"));
    const status = typeof parsed.data.integration_status === "string" ? parsed.data.integration_status : "unknown";
    sourceCounts[status] = (sourceCounts[status] ?? 0) + 1;
  }
  return {
    initialized: true,
    root,
    activeScope,
    goalStatus: typeof goalStatus === "string" ? goalStatus : void 0,
    nextAction,
    blockers,
    sourceCounts,
    validation: await validateBundle(root)
  };
}
function resolveMemoryLink(memoryRoot, from, target) {
  const raw = target.split("#")[0].split("?")[0];
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return void 0;
  let clean;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    return "__escape__";
  }
  const absolute = clean.startsWith("/") ? resolve2(memoryRoot, clean.slice(1)) : resolve2(dirname2(from), clean);
  if (!isPathInside(memoryRoot, absolute)) return "__escape__";
  return absolute;
}
async function exists(path) {
  try {
    await stat2(path);
    return true;
  } catch {
    return false;
  }
}
function formatMemoryContext(indexContent) {
  return `[PROJECT MEMORY] (ON-DEMAND RETRIEVAL ONLY)
Persistent project truth is in .memory/. DO NOT load all memory files into context!
Load ONLY the single relevant document required for your specific task:
\u2022 Need next action: Read .memory/tasks.md (or active scope's agents.md).
\u2022 Editing code: Run \`memory check --for-path <file>\` to discover the exact governing Flow/agents.md.
\u2022 Domain logic: Read .memory/architecture/domain/Flow.md (enforce DDD business invariants).
\u2022 Verify work: Read .memory/progress.md.
\u2022 Search memory: Run \`memory search <keywords>\` for targeted snippets instead of reading entire files.
Ask rather than guess; semantic changes require explicit user approval. Detailed memory is loaded strictly on demand.

ACTIVE INDEX
${indexContent}`;
}
function formatMemoryBudgetError(path, byteLength, budget) {
  return `[PROJECT MEMORY ERROR]
${path} exceeds the byte budget (${byteLength} > ${budget} bytes).
Automatic context injection was suppressed to prevent token budget blowup and partial truncation.
Run \`memory compact --dry-run\` or reduce index size to restore automatic injection.`;
}
async function buildMemoryContext(projectRoot, options) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const rootIndexPath = join2(memoryRoot, "index.md");
  const rootIndex = await readIfExists(rootIndexPath);
  if (!rootIndex) {
    throw new Error("Project Memory root index.md not found");
  }
  const budget = options?.budget ?? MAX_AUTO_CONTEXT_BYTES;
  const indexBytes = Buffer.byteLength(rootIndex, "utf8");
  if (indexBytes > budget) {
    return formatMemoryBudgetError(".memory/index.md", indexBytes, budget);
  }
  let fullContent = rootIndex;
  if (options?.scope && options.scope !== ".") {
    const safeScope = assertSafeRelativePath(options.scope);
    const scopeIndexPath = join2(memoryRoot, ...safeScope.split("/"), "index.md");
    const scopeIndex = await readIfExists(scopeIndexPath);
    if (scopeIndex) {
      const scopeBytes = Buffer.byteLength(scopeIndex, "utf8");
      if (indexBytes + scopeBytes > budget) {
        return formatMemoryBudgetError(`.memory/${safeScope}/index.md (combined with root index)`, indexBytes + scopeBytes, budget);
      }
      fullContent = `${rootIndex}

<!-- scope:${safeScope} -->
${scopeIndex}`;
    }
  }
  if (options?.toon) {
    const parsed = parseMarkdown(rootIndex);
    const toonObj = {
      project: parsed.data.project ?? parsed.data.title ?? "Project",
      active_scope: parsed.data.active_scope ?? ".",
      active_objective: parsed.data.active_objective ?? parsed.data.status ?? "in_progress",
      index_bytes: indexBytes,
      budget,
      index: fullContent
    };
    return JSON.stringify(toonObj, null, 2);
  }
  return formatMemoryContext(fullContent);
}
function validateGoalLikeFrontmatter(parsed, rel, docType, expectedScope, diagnostics) {
  const status = parsed.data.status;
  if (typeof status !== "string" || !GOAL_STATUSES.has(status)) {
    diagnostics.push({ severity: "error", code: "goal-status", path: rel, message: `Invalid goal status: ${String(status)}` });
  }
  for (const field of ["title", "description", "timestamp", "scope"]) {
    if (typeof parsed.data[field] !== "string") {
      diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `${docType} requires '${field}'` });
    }
  }
  if (parsed.data.scope !== expectedScope) {
    diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `${docType} scope must be '${expectedScope}'` });
  }
}
function isMissingRequiredNextActionField(nextAction) {
  const requiredNextActionFields = ["Action", "Requirement", "Likely files", "Verification", "Approval"];
  return requiredNextActionFields.some((field) => {
    const value = new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]+)`, "i").exec(nextAction)?.[1].trim();
    return !value || /^(?:unknown|unresolved|none|pending|n\/a)\.?$/i.test(value);
  });
}
function checkActiveTasksBudget(content, rel, diagnostics) {
  const activeSection = extractAnySection(content, "Active tasks (Do Now)") || extractAnySection(content, "Active tasks");
  if (activeSection) {
    const taskLines = activeSection.split("\n").filter((l) => /^\s*(?:\d+\.|\*|-)\s*\[[ xX ]?\]/i.test(l) || /^\s*\d+\.\s+\*\*/.test(l));
    if (taskLines.length > MAX_ACTIVE_TASKS) {
      diagnostics.push({ severity: "error", code: "budget-active-tasks", path: rel, message: `Active tasks exceeds limit of ${MAX_ACTIVE_TASKS} items (${taskLines.length} tasks found)` });
    }
  }
}
var STOP_WORDS = /* @__PURE__ */ new Set([
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "am",
  "an",
  "and",
  "any",
  "are",
  "aren't",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can't",
  "cannot",
  "could",
  "couldn't",
  "did",
  "didn't",
  "do",
  "does",
  "doesn't",
  "doing",
  "don't",
  "down",
  "during",
  "each",
  "few",
  "for",
  "from",
  "further",
  "had",
  "hadn't",
  "has",
  "hasn't",
  "have",
  "haven't",
  "having",
  "he",
  "he'd",
  "he'll",
  "he's",
  "her",
  "here",
  "here's",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "how's",
  "i",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "if",
  "in",
  "into",
  "is",
  "isn't",
  "it",
  "it's",
  "its",
  "itself",
  "let's",
  "me",
  "more",
  "most",
  "mustn't",
  "my",
  "myself",
  "no",
  "nor",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "ought",
  "our",
  "ours",
  "ourselves",
  "out",
  "over",
  "own",
  "same",
  "shan't",
  "she",
  "she'd",
  "she'll",
  "she's",
  "should",
  "shouldn't",
  "so",
  "some",
  "such",
  "than",
  "that",
  "that's",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "there's",
  "these",
  "they",
  "they'd",
  "they'll",
  "they're",
  "they've",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "up",
  "very",
  "was",
  "wasn't",
  "we",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "were",
  "weren't",
  "what",
  "what's",
  "when",
  "when's",
  "where",
  "where's",
  "which",
  "while",
  "who",
  "who's",
  "whom",
  "why",
  "why's",
  "with",
  "won't",
  "would",
  "wouldn't",
  "you",
  "you'd",
  "you'll",
  "you're",
  "you've",
  "your",
  "yours",
  "yourself",
  "yourselves"
]);
function tokenize(text) {
  if (!text) return [];
  const words = text.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
  return words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}
async function validateBundle(projectRoot, options) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const diagnostics = [];
  const walk = await walkMemory(memoryRoot);
  diagnostics.push(...walk.diagnostics);
  if (walk.files.length === 0) {
    diagnostics.push({ severity: "error", code: "not-initialized", path: MEMORY_DIRECTORY, message: "Project Memory is not initialized" });
    return { ok: false, diagnostics, counts: { documents: 0, scopes: 0, sources: 0, errors: 1, warnings: 0 } };
  }
  const rootIndexPath = join2(memoryRoot, "index.md");
  let declaredActiveScope;
  const rootIndex = await readIfExists(rootIndexPath);
  if (!rootIndex) diagnostics.push({ severity: "error", code: "missing-root-index", path: ".memory/index.md", message: "Root index.md is required" });
  else {
    const parsed = parseMarkdown(rootIndex);
    if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "root-frontmatter", path: ".memory/index.md", message: parsed.errors.join("; ") || "Root index requires frontmatter" });
    else {
      if (parsed.data.memory_version !== MEMORY_VERSION) diagnostics.push({ severity: "error", code: "version", path: ".memory/index.md", message: `Expected memory_version ${MEMORY_VERSION}` });
      if (parsed.data.architecture_mode !== "ddd") diagnostics.push({ severity: "error", code: "architecture-mode", path: ".memory/index.md", message: "Root index requires architecture_mode: ddd" });
      if (typeof parsed.data.architecture_index !== "string") diagnostics.push({ severity: "error", code: "architecture-index", path: ".memory/index.md", message: "Root index requires architecture_index" });
      if (typeof parsed.data.system_flow !== "string") diagnostics.push({ severity: "error", code: "system-flow", path: ".memory/index.md", message: "Root index requires system_flow" });
      declaredActiveScope = typeof parsed.data.active_scope === "string" ? parsed.data.active_scope : void 0;
      if (!declaredActiveScope) diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: "Root index requires active_scope" });
    }
  }
  const archDir = join2(memoryRoot, "architecture");
  const archIndexPath = join2(archDir, "index.md");
  if (!await exists(archIndexPath)) {
    diagnostics.push({ severity: "error", code: "missing-architecture-index", path: ".memory/architecture/index.md", message: "Architecture index (/architecture/index.md) is required" });
  }
  for (const layer of MANDATORY_ARCHITECTURE_LAYERS) {
    const flowPath = join2(archDir, layer, "Flow.md");
    if (!await exists(flowPath)) {
      diagnostics.push({ severity: "error", code: "missing-mandatory-flow", path: `.memory/architecture/${layer}/Flow.md`, message: `Mandatory architecture flow ${layer}/Flow.md is required` });
    }
  }
  if (await exists(archDir)) {
    try {
      const archEntries = await readdir2(archDir, { withFileTypes: true });
      for (const entry of archEntries) {
        if (entry.isDirectory()) {
          const layerDirPath = join2(archDir, entry.name);
          const layerFiles = await readdir2(layerDirPath);
          if (!layerFiles.includes("Flow.md")) {
            diagnostics.push({ severity: "error", code: "invalid-flow-file", path: `.memory/architecture/${entry.name}`, message: `Architecture layer directory '${entry.name}' must contain exact Flow.md` });
          }
        }
      }
    } catch {
    }
  }
  let currentScan;
  try {
    currentScan = await scanRepository(root);
  } catch {
  }
  const fileGraph = /* @__PURE__ */ new Map();
  const scopeDirectories = /* @__PURE__ */ new Set();
  let sourceCount = 0;
  for (const path of walk.files) {
    const rel = normalizeSlash(relative2(root, path));
    const name = basename2(path);
    const content = await readFile2(path, "utf8");
    const byteLength = Buffer.byteLength(content, "utf8");
    for (const markerError of validateGeneratedMarkers(content)) diagnostics.push({ severity: "error", code: "markers", path: rel, message: markerError });
    const generatedMatches = content.matchAll(/<!--\s*memory:generated:start[^\n]*\n([\s\S]*?)<!--\s*memory:generated:end/g);
    for (const match of generatedMatches) {
      for (const line of match[1].split("\n")) {
        if (Buffer.byteLength(line, "utf8") > MAX_GENERATED_LINE_BYTES) {
          diagnostics.push({ severity: "warning", code: "budget-generated-line", path: rel, message: `Generated line exceeds ${MAX_GENERATED_LINE_BYTES} bytes (${Buffer.byteLength(line, "utf8")} bytes)` });
          break;
        }
      }
    }
    const parsed = parseMarkdown(content);
    const reserved = RESERVED_FILES.has(name);
    const rootIndexFile = path === rootIndexPath;
    if (rootIndexFile) {
      if (byteLength > MAX_ROOT_INDEX_BYTES) {
        diagnostics.push({ severity: "error", code: "budget-root-index", path: rel, message: `Root index exceeds ${MAX_ROOT_INDEX_BYTES} bytes budget (${byteLength} bytes)` });
      } else if (byteLength > WARN_ROOT_INDEX_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-root-index", path: rel, message: `Root index exceeds ${WARN_ROOT_INDEX_BYTES} bytes target (${byteLength} bytes)` });
      }
    } else if (name === "index.md") {
      if (byteLength > MAX_SCOPE_INDEX_BYTES) {
        diagnostics.push({ severity: "error", code: "budget-scope-index", path: rel, message: `Scope index exceeds ${MAX_SCOPE_INDEX_BYTES} bytes budget (${byteLength} bytes)` });
      }
    }
    if (!reserved && !rootIndexFile) {
      if (!parsed.hasFrontmatter || parsed.errors.length > 0) diagnostics.push({ severity: "error", code: "frontmatter", path: rel, message: parsed.errors.join("; ") || "Document requires YAML frontmatter" });
      else if (typeof parsed.data.type !== "string" || !parsed.data.type.trim()) diagnostics.push({ severity: "error", code: "type", path: rel, message: "Document frontmatter requires a non-empty type" });
    }
    if (parsed.data.trust_tier !== void 0) {
      const tier = parsed.data.trust_tier;
      if (typeof tier !== "string" || !["generated", "verified", "human_authored"].includes(tier)) {
        diagnostics.push({ severity: "error", code: "invalid-trust-tier", path: rel, message: `Invalid trust_tier: '${String(tier)}'. Must be 'generated', 'verified', or 'human_authored'` });
      }
    }
    if (parsed.data.generated !== void 0) {
      const gen = parsed.data.generated;
      if (!gen || typeof gen !== "object" || typeof gen.by !== "string" || !gen.by.trim() || typeof gen.at !== "string" || !gen.at.trim() || Number.isNaN(Date.parse(gen.at))) {
        diagnostics.push({ severity: "error", code: "invalid-generated-metadata", path: rel, message: "Generated metadata requires non-empty 'by' and valid ISO date 'at'" });
      }
    }
    if (parsed.data.verified !== void 0) {
      const ver = parsed.data.verified;
      if (!ver || typeof ver !== "object" || typeof ver.by !== "string" || !ver.by.trim() || typeof ver.at !== "string" || !ver.at.trim() || Number.isNaN(Date.parse(ver.at))) {
        diagnostics.push({ severity: "error", code: "invalid-verified-metadata", path: rel, message: "Verified metadata requires non-empty 'by' and valid ISO date 'at'" });
      }
    }
    if (parsed.data.code_refs !== void 0) {
      if (!Array.isArray(parsed.data.code_refs) || parsed.data.code_refs.some((r) => typeof r !== "string" || !r.trim())) {
        diagnostics.push({ severity: "error", code: "invalid-code-refs", path: rel, message: "code_refs must be an array of non-empty string glob patterns" });
      }
    }
    if (parsed.data.governance !== void 0) {
      if (typeof parsed.data.governance !== "string" || !["hold", "active", "deprecated"].includes(parsed.data.governance)) {
        diagnostics.push({ severity: "error", code: "invalid-governance", path: rel, message: `Invalid governance value: '${String(parsed.data.governance)}'. Must be 'hold', 'active', or 'deprecated'` });
      }
    }
    if (options?.drift && typeof parsed.data.description === "string") {
      const desc = parsed.data.description.trim();
      if (desc.length < 10) {
        diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description is too short (< 10 characters)" });
      } else if (/^(TODO|TBD|Placeholder|Draft|None)$/i.test(desc)) {
        diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description contains a generic placeholder" });
      } else if (parsed.body.length > 100) {
        const descTokens = tokenize(desc);
        const bodyTokens = new Set(tokenize(parsed.body));
        const matchedTokens = descTokens.filter((t) => bodyTokens.has(t));
        if (descTokens.length >= 3 && matchedTokens.length === 0) {
          diagnostics.push({ severity: "warning", code: "description-drift", path: rel, message: "Description drifted: no matching keywords found in document content" });
        }
      }
    }
    if (name === "Flow.md" && (rel.startsWith(".memory/architecture/") || rel.startsWith("architecture/"))) {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `Flow.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      if (parsed.data.type !== "Flow") {
        diagnostics.push({ severity: "error", code: "flow-type", path: rel, message: "Flow document requires type: Flow" });
      }
      const layer = parsed.data.layer;
      const parentDirName = basename2(dirname2(path));
      if (typeof layer !== "string" || !ALL_ARCHITECTURE_LAYERS.includes(layer)) {
        diagnostics.push({ severity: "error", code: "flow-layer", path: rel, message: `Invalid architecture layer: ${String(layer)}` });
      } else if (layer !== parentDirName) {
        diagnostics.push({ severity: "error", code: "flow-layer-mismatch", path: rel, message: `Flow layer '${layer}' does not match directory '${parentDirName}'` });
      }
      if (typeof parsed.data.scope !== "string") {
        diagnostics.push({ severity: "error", code: "flow-scope", path: rel, message: "Flow requires scope" });
      }
      if (typeof parsed.data.status !== "string") {
        diagnostics.push({ severity: "error", code: "flow-status", path: rel, message: "Flow requires status" });
      }
      if (typeof parsed.data.provenance !== "string") {
        diagnostics.push({ severity: "error", code: "flow-provenance", path: rel, message: "Flow requires provenance" });
      }
      if (Array.isArray(parsed.data.upstream)) {
        for (const up of parsed.data.upstream) {
          if (typeof up === "string" && !ALL_ARCHITECTURE_LAYERS.includes(up)) {
            diagnostics.push({ severity: "warning", code: "unknown-flow-layer", path: rel, message: `Unknown upstream layer: ${up}` });
          }
        }
      }
      if (Array.isArray(parsed.data.downstream)) {
        for (const down of parsed.data.downstream) {
          if (typeof down === "string" && !ALL_ARCHITECTURE_LAYERS.includes(down)) {
            diagnostics.push({ severity: "warning", code: "unknown-flow-layer", path: rel, message: `Unknown downstream layer: ${down}` });
          }
        }
      }
      if (layer === "domain") {
        if (/- Context:\s*$/m.test(content) || /- Invariants:\s*$/m.test(content)) {
          diagnostics.push({ severity: "warning", code: "empty-domain-contract", path: rel, message: "Domain Flow requires non-empty context and invariants in Domain contract" });
        }
      }
      if (Array.isArray(parsed.data.repo_paths)) {
        for (const repoPath of parsed.data.repo_paths) {
          if (typeof repoPath === "string") {
            const targetPath = resolve2(root, repoPath);
            if (!await exists(targetPath)) {
              diagnostics.push({ severity: "warning", code: "stale-repo-path", path: rel, message: `Repository path no longer exists: ${repoPath}` });
            }
          }
        }
      }
      if (currentScan && typeof parsed.data.repository_fingerprint === "string" && parsed.data.repository_fingerprint !== currentScan.fingerprint) {
        diagnostics.push({ severity: "warning", code: "stale-flow-fingerprint", path: rel, message: "Flow fingerprint is stale; run memory sync to refresh" });
      }
    }
    const isSubfolder = dirname2(path) !== memoryRoot;
    if (isSubfolder && ROOT_ONLY_FILES.has(name)) {
      diagnostics.push({ severity: "error", code: "root-only-file", path: rel, message: `${name} is only allowed in root .memory/, not in subfolders` });
    }
    if (name === "goal.md") {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `goal.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      if (!isSubfolder) scopeDirectories.add(dirname2(path));
      validateGoalLikeFrontmatter(parsed, rel, "Goal", scopeFromMemoryDirectory(memoryRoot, dirname2(path)), diagnostics);
      if (parsed.data.status === "active") {
        const progress = await readIfExists(join2(dirname2(path), "progress.md"));
        const headingCount = progress?.match(/^##\s+Next action\s*$/gim)?.length ?? 0;
        const nextAction = progress ? extractSection(progress, "Next action") : "";
        if (headingCount !== 1 || !nextAction || isMissingRequiredNextActionField(nextAction)) {
          diagnostics.push({ severity: "error", code: "next-action", path: rel, message: "Active goals require exactly one approved, evidence-linked Next action with Action, Requirement, Likely files, Verification, and Approval" });
        }
      }
    }
    if (name === "agents.md" && isSubfolder) {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `agents.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
      scopeDirectories.add(dirname2(path));
      validateGoalLikeFrontmatter(parsed, rel, "Agents", scopeFromMemoryDirectory(memoryRoot, dirname2(path)), diagnostics);
      if (parsed.data.status === "active") {
        const nextAction = extractAnySection(content, "Single next action") || extractAnySection(content, "Single Next Action") || extractAnySection(content, "Next action");
        if (!nextAction || isMissingRequiredNextActionField(nextAction)) {
          diagnostics.push({ severity: "error", code: "next-action", path: rel, message: "Active agents scope requires an approved, evidence-linked Single next action with Action, Requirement, Likely files, Verification, and Approval" });
        }
      }
      checkActiveTasksBudget(content, rel, diagnostics);
    }
    if (parsed.data.type === "Progress" || name === "progress.md") {
      if (byteLength > WARN_DOCUMENT_BYTES) {
        diagnostics.push({ severity: "warning", code: "budget-document-size", path: rel, message: `progress.md exceeds ${WARN_DOCUMENT_BYTES} bytes recommended limit (${byteLength} bytes)` });
      }
    }
    if (name === "tasks.md" || parsed.data.type === "Tasks") {
      checkActiveTasksBudget(content, rel, diagnostics);
    }
    if (parsed.data.type === "Progress") {
      for (const field of ["title", "description", "timestamp", "scope"]) {
        if (typeof parsed.data[field] !== "string") diagnostics.push({ severity: "error", code: "managed-field", path: rel, message: `Progress requires '${field}'` });
      }
      const expectedScope = scopeFromMemoryDirectory(memoryRoot, dirname2(path));
      if (parsed.data.scope !== expectedScope) diagnostics.push({ severity: "error", code: "scope-mismatch", path: rel, message: `Progress scope must be '${expectedScope}'` });
    }
    if (parsed.data.type === "Source") {
      sourceCount++;
      if (typeof parsed.data.resource !== "string" || typeof parsed.data.source_hash !== "string") diagnostics.push({ severity: "error", code: "source-fields", path: rel, message: "Source requires resource and source_hash" });
      if (typeof parsed.data.integration_status !== "string" || !SOURCE_STATUSES.has(parsed.data.integration_status)) diagnostics.push({ severity: "error", code: "source-status", path: rel, message: `Invalid source integration_status: ${String(parsed.data.integration_status)}` });
      if (parsed.data.integration_status === "changed" || parsed.data.integration_status === "stale") diagnostics.push({ severity: options?.strict ? "error" : "warning", code: "stale-source", path: rel, message: `Source needs integration (${parsed.data.integration_status})` });
      if (parsed.data.integration_status === "integrated") {
        if (typeof parsed.data.integrated_at !== "string") diagnostics.push({ severity: "warning", code: "integration-time", path: rel, message: "Integrated source should record integrated_at" });
        if (!Array.isArray(parsed.data.affected_documents) || parsed.data.affected_documents.length === 0) diagnostics.push({ severity: "warning", code: "source-impact", path: rel, message: "Integrated source should list affected_documents" });
      }
    }
    const docLinks = /* @__PURE__ */ new Set();
    const links = content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const link of links) {
      const target = resolveMemoryLink(memoryRoot, path, link[1].trim());
      if (!target) continue;
      if (target === "__escape__") diagnostics.push({ severity: "error", code: "link-escape", path: rel, message: `Link escapes bundle: ${link[1]}` });
      else if (!await exists(target) && !await exists(join2(target, "index.md")) && !await exists(join2(target, "agents.md"))) diagnostics.push({ severity: options?.strict ? "error" : "warning", code: "broken-link", path: rel, message: `Broken link: ${link[1]}` });
      else docLinks.add(target);
    }
    fileGraph.set(path, docLinks);
  }
  const reachable = /* @__PURE__ */ new Set();
  const queue = [];
  if (await exists(rootIndexPath)) {
    reachable.add(rootIndexPath);
    queue.push(rootIndexPath);
  }
  if (await exists(archIndexPath)) {
    reachable.add(archIndexPath);
    queue.push(archIndexPath);
  }
  while (queue.length > 0) {
    const current = queue.shift();
    const targets = fileGraph.get(current);
    if (targets) {
      for (const t of targets) {
        let resolved = t;
        if (await exists(join2(t, "index.md"))) resolved = join2(t, "index.md");
        else if (await exists(join2(t, "agents.md"))) resolved = join2(t, "agents.md");
        if (!reachable.has(resolved)) {
          reachable.add(resolved);
          queue.push(resolved);
        }
      }
    }
  }
  for (const filePath of walk.files) {
    const fileName = basename2(filePath);
    if (fileName === "log.md" || isPathInside(join2(memoryRoot, "sources"), filePath) || ROOT_CORE_FILES.includes(fileName)) {
      continue;
    }
    if (!reachable.has(filePath)) {
      const relDoc = normalizeSlash(relative2(root, filePath));
      diagnostics.push({
        severity: options?.strict ? "error" : "warning",
        code: "orphan-document",
        path: relDoc,
        message: `Document is orphaned: not linked or reachable from root index.md (${relDoc})`
      });
    }
  }
  if (declaredActiveScope) {
    let safeActiveScope;
    try {
      safeActiveScope = assertSafeRelativePath(declaredActiveScope);
    } catch {
      diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: `Unsafe active_scope: ${declaredActiveScope}` });
    }
    if (safeActiveScope) {
      const activeDirectory = scopeDirectory(root, safeActiveScope);
      if (!scopeDirectories.has(activeDirectory)) diagnostics.push({ severity: "error", code: "active-scope", path: ".memory/index.md", message: `active_scope is not tracked: ${declaredActiveScope}` });
    }
  }
  for (const directory of scopeDirectories) {
    if (directory === memoryRoot) {
      for (const file of ROOT_CORE_FILES) {
        if (!await exists(join2(directory, file))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: normalizeSlash(relative2(root, directory)), message: `Root memory is missing ${file}` });
      }
    } else {
      for (const file of SCOPE_CORE_FILES) {
        if (!await exists(join2(directory, file))) diagnostics.push({ severity: "error", code: "incomplete-scope", path: normalizeSlash(relative2(root, directory)), message: `Tracked scope is missing ${file}` });
      }
    }
  }
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  return {
    ok: errors === 0,
    diagnostics,
    counts: { documents: walk.files.length, scopes: scopeDirectories.size, sources: sourceCount, errors, warnings }
  };
}
var AGENTS_START = "<!-- memory:start -->";
var AGENTS_END = "<!-- memory:end -->";
var AGENTS_BLOCK = `${AGENTS_START}
Project memory lives in \`.memory/\`. Keep all documents ultra-short, compact, concise, and token-efficient.
Before any work in \`.memory/\`, check and read \`.memory/index.md\`, then route through System Flow (\`.memory/architecture/system-design/Flow.md\`) \u2192 relevant layer Flow \u2192 matching scope's goal and progress.
Apply the mandatory DDD gate before implementation: declare bounded context, ubiquitous language, and business invariants in domain logic.
Always keep \`index.md\`, relevant \`Flow.md\`, and \`AGENTS.md\` updated when project requirements, architecture, or scope change.
Treat user-confirmed wants, must-not rules, and acceptance criteria as requirements.
Ask instead of guessing when intent is missing, inferred, stale, or contradictory.
When a source changes, integrate it into the existing wiki instead of merely indexing it.
After meaningful work, record evidence, update progress and one next action, and append \`log.md\` using concise entries.
Use \`memory_apply\` when available, otherwise the \`memory\` CLI, for generated regions; do not rewrite history.
${AGENTS_END}`;
var extractAnySection = extractSection;
function migrateLegacyScopeToAgents(scope, timestamp2, goalContent, progressContent, tasksContent, existingAgents) {
  if (existingAgents) return existingAgents;
  const title = titleFromPath(scope);
  const goalParsed = goalContent ? parseMarkdown(goalContent) : void 0;
  const status = typeof goalParsed?.data.status === "string" ? goalParsed.data.status : "draft";
  const provenance = typeof goalParsed?.data.provenance === "string" ? goalParsed.data.provenance : "observed";
  const motivation = goalContent ? extractAnySection(goalContent, "Motivation") || "" : "";
  const reqs = goalContent ? extractAnySection(goalContent, "Requirements") || "" : "";
  const ac = goalContent ? extractAnySection(goalContent, "Acceptance criteria") || "" : "";
  const nonGoals = goalContent ? extractAnySection(goalContent, "Scope & non-goals") || extractAnySection(goalContent, "Scope and non-goals") || "" : "";
  const constraints = goalContent ? extractAnySection(goalContent, "Constraints & dependencies") || extractAnySection(goalContent, "Constraints and dependencies") || "" : "";
  const archSummary = goalContent ? extractAnySection(goalContent, "Scope Architecture") || extractAnySection(goalContent, "Auto-Detected Architecture") || "" : "";
  const currentState = progressContent ? extractAnySection(progressContent, "Current state") || "" : "";
  const blockers = progressContent ? extractAnySection(progressContent, "Blockers & drift") || extractAnySection(progressContent, "Blockers and drift") || "" : "";
  const evidence = progressContent ? extractAnySection(progressContent, "Acceptance evidence") || "" : "";
  const nextAction = (progressContent ? extractAnySection(progressContent, "Next action") : "") || (tasksContent ? extractAnySection(tasksContent, "Single next action") : "");
  const activeTasks = tasksContent ? extractAnySection(tasksContent, "Active tasks (Do Now)") || extractAnySection(tasksContent, "Active tasks") || "" : "";
  const backlog = tasksContent ? extractAnySection(tasksContent, "Backlog (Do Later)") || extractAnySection(tasksContent, "Backlog") || "" : "";
  const completedTasks = tasksContent ? extractAnySection(tasksContent, "Completed tasks summary") || extractAnySection(tasksContent, "Completed tasks") || "" : "";
  let body = `# ${title} Agents

> Combined instructions, architecture summary, goal requirements, progress, and tasks for \`${scope}\`.

`;
  body += `## Scope Architecture & Summary

${archSummary || `Auto-migrated scope for \`${scope}\`.`}

`;
  body += `## Goal & Requirements

`;
  if (motivation) body += `### Motivation

${motivation}

`;
  if (nonGoals) body += `### Scope & non-goals

${nonGoals}

`;
  if (reqs) body += `### Requirements

${reqs}

`;
  body += `### Acceptance criteria

${ac || "Use stable IDs in the `AC-NNN` form. Each criterion must be independently verifiable."}

`;
  if (constraints) body += `### Constraints & dependencies

${constraints}

`;
  body += `## Current State & Progress

`;
  body += `### Current state

${currentState || "Active development."}

`;
  body += `### Blockers & drift

${blockers || "none"}

`;
  body += `### Acceptance evidence

${evidence || "| Criterion | Status | Evidence |\n|---|---|---|"}

`;
  body += `## Tasks & Action Items

`;
  if (nextAction) {
    body += `### Single next action

${nextAction.includes("- **Action:**") ? nextAction : `- **Action:** ${nextAction}
- **File / Command:** Edit \`.memory/${scope}/agents.md\`
- **Time estimate:** [15 min]
- **Requirement:** Migrated
- **Likely files:** \`${scope}/\`
- **Verification:** User review
- **Approval:** approved`}

`;
  } else {
    body += `### Single next action

- **Action:** Continue scope execution.
- **File / Command:** Edit \`.memory/${scope}/agents.md\`
- **Time estimate:** [15 min]
- **Requirement:** Migrated
- **Likely files:** \`${scope}/\`
- **Verification:** User review
- **Approval:** approved

`;
  }
  if (activeTasks) {
    body += `### Active tasks (Do Now)
> [!NOTE]
> Maximum 5 active items. Numbered single-bounded steps only.

${activeTasks}

`;
  } else {
    body += `### Active tasks (Do Now)
> [!NOTE]
> Maximum 5 active items. Numbered single-bounded steps only.

1. [ ] **Scope review** \`[15 min]\` (REQ-001) \u2014 Review migrated scope items

`;
  }
  if (backlog) body += `### Backlog (Do Later)

${backlog}

`;
  if (completedTasks) body += `### Completed tasks summary

${completedTasks}
`;
  return serializeMarkdown({
    type: "Agents",
    title: `${title} agents`,
    description: `Combined agent instructions, goal, progress, and tasks for ${scope}.`,
    timestamp: timestamp2,
    scope,
    status,
    provenance,
    uid: randomUUID()
  }, body);
}
async function migrateBundle(projectRoot, options = {}) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const dryRun = options.dryRun ?? false;
  const date = options.now ?? /* @__PURE__ */ new Date();
  const timestamp2 = nowIso(date);
  const rootIndexPath = join2(memoryRoot, "index.md");
  const rootIndexContent = await readIfExists(rootIndexPath);
  if (!rootIndexContent) throw new Error(`Project Memory is not initialized at ${memoryRoot}`);
  const initialParsed = parseMarkdown(rootIndexContent);
  if (!initialParsed.hasFrontmatter || initialParsed.errors.length > 0) {
    throw new Error("Root index has invalid frontmatter; repair it before migration");
  }
  const walk = await walkMemory(memoryRoot);
  const legacySubfolderFiles = walk.files.filter((file) => {
    const dir = dirname2(file);
    if (dir === memoryRoot || isPathInside(join2(memoryRoot, "architecture"), dir) || isPathInside(join2(memoryRoot, "sources"), dir)) return false;
    const base = basename2(file);
    return ROOT_ONLY_FILES.has(base) || base === "index.md";
  });
  const is02 = initialParsed.data.memory_version === "0.2";
  if (is02 && legacySubfolderFiles.length === 0) {
    const val = await validateBundle(root);
    return { root, version: "0.2", changes: [], validation: val };
  }
  const snapshot = dryRun ? void 0 : await captureBundle(root);
  const changes = [];
  try {
    const scan = await scanRepository(root);
    const deepScan = await deepScanRepository(root, scan);
    const discovery = discoverArchitectureLayers(scan, deepScan);
    const archDir = join2(memoryRoot, "architecture");
    const archIndexPath = join2(archDir, "index.md");
    if (await readIfExists(archIndexPath) === void 0) {
      const archIndexContent = architectureIndexTemplate(discovery.detectedLayers, timestamp2);
      const change = await plannedWrite(archIndexPath, archIndexContent, dryRun, false);
      changes.push({ ...change, path: relativeChangePath(root, archIndexPath) });
    }
    for (const layer of discovery.detectedLayers) {
      const flowPath = join2(archDir, layer, "Flow.md");
      if (await readIfExists(flowPath) === void 0) {
        const evidence = discovery.layers.get(layer);
        const content = flowTemplate(layer, evidence, scan.fingerprint, timestamp2);
        const change = await plannedWrite(flowPath, content, dryRun, false);
        changes.push({ ...change, path: relativeChangePath(root, flowPath) });
      }
    }
    const subfolderDirs = /* @__PURE__ */ new Set();
    for (const file of walk.files) {
      const dir = dirname2(file);
      if (dir === memoryRoot || isPathInside(join2(memoryRoot, "architecture"), dir) || isPathInside(join2(memoryRoot, "sources"), dir)) continue;
      subfolderDirs.add(dir);
    }
    for (const subDir of subfolderDirs) {
      const scope = scopeFromMemoryDirectory(memoryRoot, subDir);
      const legacyGoal = join2(subDir, "goal.md");
      const legacyProgress = join2(subDir, "progress.md");
      const legacyTasks = join2(subDir, "tasks.md");
      const legacyIndex = join2(subDir, "index.md");
      const agentsPath = join2(subDir, "agents.md");
      const logPath = join2(subDir, "log.md");
      const [goalContent, progressContent, tasksContent, existingAgents, existingLog] = await Promise.all([
        readIfExists(legacyGoal),
        readIfExists(legacyProgress),
        readIfExists(legacyTasks),
        readIfExists(agentsPath),
        readIfExists(logPath)
      ]);
      const hasLegacy = goalContent !== void 0 || progressContent !== void 0 || tasksContent !== void 0 || await readIfExists(legacyIndex) !== void 0;
      if (hasLegacy || existingAgents === void 0 && existingLog !== void 0) {
        const agentsContent = migrateLegacyScopeToAgents(
          scope,
          timestamp2,
          goalContent,
          progressContent,
          tasksContent,
          existingAgents
        );
        const agentsChange2 = await plannedWrite(agentsPath, agentsContent, dryRun, Boolean(existingAgents));
        changes.push({ ...agentsChange2, path: relativeChangePath(root, agentsPath) });
        let logContent = existingLog ?? logTemplate(scope, date);
        logContent = prependLogEntry(
          logContent,
          today(date),
          `### Migration: Scope Restructure
- **Update:** Migrated legacy subfolder files (goal.md, progress.md, tasks.md) into unified \`agents.md\`.
- **Evidence:** Automated \`memory migrate\` data shift.
`
        );
        const logChange = await plannedWrite(logPath, logContent, dryRun, Boolean(existingLog));
        changes.push({ ...logChange, path: relativeChangePath(root, logPath) });
        for (const legacyFile of [legacyGoal, legacyProgress, legacyTasks, legacyIndex]) {
          if (await readIfExists(legacyFile) !== void 0) {
            if (!dryRun) await rm(legacyFile, { force: true });
            changes.push({ path: relativeChangePath(root, legacyFile), action: "update" });
          }
        }
      }
      for (const prefix of allDirectoryPrefixes(scope)) {
        if (prefix === scope) continue;
        const prefixIndex = join2(safeBundleFile(root, prefix), "index.md");
        if (await readIfExists(prefixIndex) !== void 0) {
          if (!dryRun) await rm(prefixIndex, { force: true });
          changes.push({ path: relativeChangePath(root, prefixIndex), action: "update" });
        }
      }
    }
    let updatedRootIndex = rootIndexContent;
    updatedRootIndex = updateMarkdownFrontmatter(updatedRootIndex, {
      memory_version: "0.2",
      architecture_mode: "ddd",
      architecture_index: "/architecture/",
      system_flow: "/architecture/system-design/Flow.md",
      repository_head: scan.head ?? null,
      repository_fingerprint: scan.fingerprint,
      last_scan_at: timestamp2,
      timestamp: timestamp2
    });
    const routeOrder = ["frontend", "gateway-edge", "auth", "backend", "domain", "database"];
    const activeRoute = routeOrder.filter((l) => discovery.detectedLayers.includes(l)).map((l) => titleFromPath(l)).join(" \u2192 ") || "Domain";
    if (!updatedRootIndex.includes("## Architecture")) {
      const archSection = `
## Architecture
- Start: [System flow](/architecture/system-design/Flow.md)
- Domain: [Context map](/architecture/domain/Flow.md)
- Security: [Trust flow](/architecture/security/Flow.md)
- Route: ${activeRoute}
- Full map: [Architecture index](/architecture/)
`;
      if (updatedRootIndex.includes("## Find")) {
        updatedRootIndex = updatedRootIndex.replace("## Find", `${archSection}
## Find`);
      } else if (updatedRootIndex.includes("## Map")) {
        updatedRootIndex = updatedRootIndex.replace("## Map", `${archSection}
## Find
| Need | Read |
|---|---|
| Approved intent | goal.md |
| Current work/evidence | progress.md |
| Next actions | tasks.md |
| Code/data route | architecture/.../Flow.md |
| Decisions/history | log.md |
| Provenance | sources/ |
| Full repository tree | \`memory map\` |
`);
      } else if (updatedRootIndex.includes("## Scopes")) {
        updatedRootIndex = updatedRootIndex.replace("## Scopes", `${archSection}
## Scopes`);
      } else {
        updatedRootIndex += archSection;
      }
    }
    const rootChange = await plannedWrite(rootIndexPath, updatedRootIndex, dryRun, true);
    changes.push({ ...rootChange, path: relativeChangePath(root, rootIndexPath) });
    const syncChanges = await syncIndexes(root, scan, { dryRun, now: date });
    changes.push(...syncChanges);
    const agentsChange = await syncAgentsFile(root, { dryRun });
    changes.push(agentsChange);
    const validation = dryRun ? { ok: true, diagnostics: [], counts: { documents: 0, scopes: 0, sources: 0, errors: 0, warnings: 0 } } : await validateBundle(root);
    if (!validation.ok) {
      throw new Error(`Migration produced invalid bundle: ${validation.diagnostics.filter((d) => d.severity === "error").map((d) => `${d.path ?? "bundle"}: ${d.message}`).join("; ")}`);
    }
    return {
      root,
      version: "0.2",
      changes,
      validation
    };
  } catch (error) {
    if (snapshot) await restoreBundle(root, snapshot);
    throw error;
  }
}
async function readUnmanagedAgentsContent(projectRoot) {
  const path = resolve2(projectRoot, "AGENTS.md");
  const content = await readIfExists(path);
  if (!content) return void 0;
  let unmanaged = content;
  const starts = unmanaged.indexOf(AGENTS_START);
  const ends = unmanaged.indexOf(AGENTS_END);
  if (starts !== -1 && ends !== -1 && ends > starts) {
    unmanaged = unmanaged.slice(0, starts) + unmanaged.slice(ends + AGENTS_END.length);
  }
  unmanaged = unmanaged.trim();
  return unmanaged.length > 0 ? unmanaged : void 0;
}
async function syncAgentsFile(projectRoot, options = {}) {
  const path = resolve2(projectRoot, "AGENTS.md");
  await assertNotSymlink(path);
  const before = await readIfExists(path);
  let next;
  if (before === void 0) {
    const user = options.userContent?.trim();
    next = user ? `${user}

${AGENTS_BLOCK}
` : `${AGENTS_BLOCK}
`;
  } else {
    const starts = before.split(AGENTS_START).length - 1;
    const ends = before.split(AGENTS_END).length - 1;
    let prefix = "";
    let suffix = "";
    if (starts === 0 && ends === 0) {
      prefix = before.trimEnd() ? `${before.trimEnd()}

` : "";
    } else if (starts !== 1 || ends !== 1 || before.indexOf(AGENTS_START) > before.indexOf(AGENTS_END)) {
      throw new Error("AGENTS.md contains malformed or duplicate Project Memory markers");
    } else {
      prefix = before.slice(0, before.indexOf(AGENTS_START));
      suffix = before.slice(before.indexOf(AGENTS_END) + AGENTS_END.length);
    }
    if (options.userContent !== void 0) {
      prefix = options.userContent.trim() ? `${options.userContent.trim()}

` : "";
    }
    next = `${prefix}${AGENTS_BLOCK}${suffix}`;
  }
  const change = await plannedWrite(path, next, options.dryRun ?? false, true);
  return { ...change, path: "AGENTS.md" };
}
async function assertExpectedHash(path, expected) {
  if (!expected) return;
  const content = await readIfExists(path);
  const actual = content === void 0 ? void 0 : hashText(content);
  if (actual !== expected) throw new Error(`Document changed since the plan was created: ${path}`);
}
async function captureBundle(projectRoot) {
  const root = bundlePath(projectRoot);
  const walk = await walkMemory(root);
  const snapshot = /* @__PURE__ */ new Map();
  for (const path of walk.files) snapshot.set(path, await readFile2(path, "utf8"));
  return snapshot;
}
async function restoreBundle(projectRoot, snapshot) {
  const root = bundlePath(projectRoot);
  const current = await walkMemory(root);
  for (const path of current.files) {
    if (!snapshot.has(path)) await rm(path, { force: true });
  }
  for (const [path, content] of snapshot) await atomicWrite(path, content);
}
function operationRequiresApproval(operation) {
  if (operation.semantic || (operation.path ? basename2(operation.path) === "goal.md" || basename2(operation.path) === "agents.md" : false)) return true;
  if (["write_document", "update_frontmatter"].includes(operation.action)) {
    const path = operation.path?.replace(/\\/g, "/").replace(/^\.\//, "") ?? "";
    if (path === "progress.md" || path.endsWith("/progress.md")) return false;
    if (path.startsWith("sources/")) return operation.action === "write_document";
    return true;
  }
  if (operation.action !== "append_log") return false;
  const eventType = String(operation.event?.type ?? operation.event?.category ?? "").toLowerCase();
  return ["completion", "contradiction-resolution", "correction", "decision", "preference", "reversal", "scope"].includes(eventType);
}
async function validateGoalStatusTransition(projectRoot, target, previousStatus, nextStatus, evidenceRoot) {
  if (typeof previousStatus === "string" && typeof nextStatus === "string") {
    if (previousStatus !== nextStatus && !GOAL_TRANSITIONS[previousStatus]?.has(nextStatus)) {
      throw new Error(`Invalid goal lifecycle transition: ${previousStatus} -> ${nextStatus}`);
    }
    if (nextStatus === "complete" && previousStatus !== "complete") {
      const scope = scopeFromMemoryDirectory(bundlePath(projectRoot), dirname2(target));
      const readiness = await checkCompletionReadiness(projectRoot, scope, evidenceRoot);
      if (!readiness.ready) throw new Error(`Completion evidence is incomplete: ${readiness.missing.join("; ")}`);
    }
  }
}
async function applyMemoryPlan(projectRoot, plan, options = {}) {
  if (!plan || !Array.isArray(plan.operations) || plan.operations.length === 0) throw new Error("Memory plan requires at least one operation");
  const supportedActions = /* @__PURE__ */ new Set(["write_document", "update_frontmatter", "replace_generated", "append_log", "sync_indexes"]);
  for (const operation of plan.operations) {
    if (!operation || !supportedActions.has(operation.action)) throw new Error(`Unsupported memory operation: ${String(operation?.action)}`);
  }
  if (options.dryRun) {
    const stagingRoot = await mkdtemp(join2(tmpdir(), "project-memory-dry-run-"));
    try {
      await cp(bundlePath(projectRoot), bundlePath(stagingRoot), { recursive: true, verbatimSymlinks: true });
      return await applyMemoryPlan(stagingRoot, plan, { dryRun: false, scan: options.scan, evidenceRoot: options.evidenceRoot ?? projectRoot });
    } finally {
      await rm(stagingRoot, { recursive: true, force: true });
    }
  }
  const beforeValidation = await validateBundle(projectRoot);
  if (!beforeValidation.ok) {
    throw new Error(`Refusing to mutate an invalid bundle: ${beforeValidation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
  }
  const changes = [];
  const semanticMutation = plan.operations.some(operationRequiresApproval);
  if (semanticMutation && !plan.approved) throw new Error("Semantic memory changes require explicit user approval");
  if (semanticMutation && !plan.approvalReason?.trim()) throw new Error("Approved semantic changes require an approval reason");
  const snapshot = options.dryRun ? void 0 : await captureBundle(projectRoot);
  try {
    for (const operation of plan.operations) {
      if (operation.action === "sync_indexes") {
        changes.push(...await syncIndexes(projectRoot, options.scan, { dryRun: options.dryRun }));
        continue;
      }
      if (operation.action === "append_log") {
        if (!operation.event) throw new Error("append_log requires event");
        changes.push(await recordEvent(projectRoot, operation.scope ?? ".", operation.event, { dryRun: options.dryRun }));
        continue;
      }
      if (!operation.path) throw new Error(`${operation.action} requires path`);
      const target = safeBundleFile(projectRoot, operation.path);
      await assertExpectedHash(target, operation.expectedHash);
      const existing = await readIfExists(target);
      if (operation.action === "write_document") {
        if (basename2(target) === "index.md") throw new Error("Write index content through generated regions or sync_indexes");
        if (basename2(target) === "log.md") throw new Error("History is append-only; use append_log");
        if (typeof operation.content !== "string") throw new Error("write_document requires content");
        if (containsLikelySecret(operation.content)) throw new Error("Refusing to write likely secret material to Project Memory");
        const parsed = parseMarkdown(operation.content);
        if (!RESERVED_FILES.has(basename2(target)) && (!parsed.hasFrontmatter || parsed.errors.length > 0 || typeof parsed.data.type !== "string")) throw new Error("Non-reserved documents require valid frontmatter with type");
        if (normalizeSlash(relative2(bundlePath(projectRoot), target)).startsWith("sources/")) {
          if (!existing) throw new Error("Create source records with record_source or memory record");
          const previous = parseMarkdown(existing);
          if (previous.data.type !== "Source" || parsed.data.type !== "Source") throw new Error("Source record type cannot be changed");
          for (const field of ["resource", "source_hash", "registered_at", "uid"]) {
            if (parsed.data[field] !== previous.data[field]) throw new Error(`Source record '${field}' is immutable`);
          }
        }
        const isGoalDoc = basename2(target) === "goal.md" || basename2(target) === "agents.md";
        if (isGoalDoc && parsed.data.status === "complete") throw new Error("Complete goals with update_frontmatter so approved criteria cannot be replaced");
        if (isGoalDoc && existing && typeof parsed.data.status === "string") {
          await validateGoalStatusTransition(projectRoot, target, parseMarkdown(existing).data.status, parsed.data.status, options.evidenceRoot);
        }
        const change = await plannedWrite(target, operation.content.endsWith("\n") ? operation.content : `${operation.content}
`, options.dryRun ?? false, true);
        changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
      } else if (operation.action === "update_frontmatter") {
        if (!existing) throw new Error(`Document not found: ${operation.path}`);
        if (!operation.values) throw new Error("update_frontmatter requires values");
        if (containsLikelySecret(JSON.stringify(operation.values))) throw new Error("Refusing to write likely secret material to Project Memory");
        const existingParsed = parseMarkdown(existing);
        if (existingParsed.data.type === "Source") {
          for (const field of ["type", "resource", "source_hash", "registered_at", "uid"]) {
            if (field in operation.values && operation.values[field] !== existingParsed.data[field]) throw new Error(`Source record '${field}' is immutable`);
          }
        }
        const isGoalDoc = basename2(target) === "goal.md" || basename2(target) === "agents.md";
        if (isGoalDoc && typeof operation.values.status === "string") {
          await validateGoalStatusTransition(projectRoot, target, existingParsed.data.status, operation.values.status, options.evidenceRoot);
        }
        const managedValues = { ...operation.values, timestamp: nowIso() };
        if (existingParsed.data.type === "Source" && operation.values.integration_status === "integrated" && managedValues.integrated_at === void 0) {
          managedValues.integrated_at = nowIso();
        }
        const next = updateMarkdownFrontmatter(existing, managedValues);
        const change = await plannedWrite(target, next, options.dryRun ?? false, true);
        changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
      } else if (operation.action === "replace_generated") {
        if (!existing) throw new Error(`Document not found: ${operation.path}`);
        if (!operation.region || operation.content === void 0) throw new Error("replace_generated requires region and content");
        if (containsLikelySecret(operation.content)) throw new Error("Refusing to write likely secret material to Project Memory");
        const next = replaceGeneratedRegion(existing, operation.region, operation.content);
        const change = await plannedWrite(target, next, options.dryRun ?? false, true);
        changes.push({ ...change, path: relativeChangePath(projectRoot, target) });
      }
    }
    const validation = options.dryRun ? void 0 : await validateBundle(projectRoot);
    if (validation && !validation.ok) throw new Error(`Memory plan produced invalid bundle: ${validation.diagnostics.filter((item) => item.severity === "error").map((item) => `${item.path ?? "bundle"}: ${item.message}`).join("; ")}`);
    return { changes, validation };
  } catch (error) {
    if (snapshot) await restoreBundle(projectRoot, snapshot);
    throw error;
  }
}
async function withBundleLock(projectRoot, callback) {
  const root = bundlePath(projectRoot);
  await mkdir(root, { recursive: true });
  const lockPath = join2(root, ".lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 384);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const info = await stat2(lockPath);
    if (Date.now() - info.mtimeMs <= 5 * 6e4) throw new Error("Another Project Memory update is in progress");
    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx", 384);
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, started: nowIso() }));
    return await callback();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
async function generateMemoryMap(projectRoot) {
  const root = resolve2(projectRoot);
  const scan = await scanRepository(root);
  const deepScan = await deepScanRepository(root, scan);
  return generateTreemapContent(scan, deepScan);
}
function matchesGlobPattern(pattern, targetPath) {
  const normPattern = normalizeSlash(pattern).replace(/^\.?\//, "");
  const normTarget = normalizeSlash(targetPath).replace(/^\.?\//, "");
  if (normPattern === normTarget) return true;
  if (normTarget.startsWith(normPattern.endsWith("/") ? normPattern : `${normPattern}/`)) {
    return true;
  }
  const escaped = normPattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "___GLOBSTAR___").replace(/\*/g, "[^/]*").replace(/___GLOBSTAR___/g, ".*");
  return new RegExp(`^${escaped}$`).test(normTarget);
}
async function checkPathGovernance(projectRoot, targetPath) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const relTarget = normalizeSlash(relative2(root, resolve2(root, targetPath))).replace(/^\.?\//, "");
  const walk = await walkMemory(memoryRoot);
  const governingDocuments = [];
  const holds = [];
  const constraints = [];
  for (const filePath of walk.files) {
    const relFile = normalizeSlash(relative2(root, filePath));
    const content = await readFile2(filePath, "utf8");
    const parsed = parseMarkdown(content);
    const data = parsed.data;
    let isGoverning = false;
    const codeRefs = Array.isArray(data.code_refs) ? data.code_refs.filter((r) => typeof r === "string") : [];
    for (const ref of codeRefs) {
      if (matchesGlobPattern(ref, relTarget)) {
        isGoverning = true;
        break;
      }
    }
    if (!isGoverning && Array.isArray(data.repo_paths)) {
      for (const repoPath of data.repo_paths) {
        if (typeof repoPath === "string" && matchesGlobPattern(repoPath, relTarget)) {
          isGoverning = true;
          break;
        }
      }
    }
    if (!isGoverning && basename2(filePath) === "agents.md" && dirname2(filePath) !== memoryRoot) {
      const scope = scopeFromMemoryDirectory(memoryRoot, dirname2(filePath));
      if (relTarget === scope || relTarget.startsWith(`${scope}/`)) {
        isGoverning = true;
      }
    }
    if (isGoverning) {
      const docType = typeof data.type === "string" ? data.type : basename2(filePath) === "agents.md" ? "Agents" : "Document";
      const title = typeof data.title === "string" ? data.title : basename2(filePath);
      const governance = typeof data.governance === "string" ? data.governance : void 0;
      const governanceReason = typeof data.governance_reason === "string" ? data.governance_reason : void 0;
      governingDocuments.push({
        path: relFile,
        type: docType,
        title,
        codeRefs: codeRefs.length > 0 ? codeRefs : void 0,
        governance,
        governanceReason
      });
      if (governance === "hold") {
        holds.push({ path: relFile, reason: governanceReason });
      }
      const constraintLines = content.split("\n").filter((line) => {
        const trimmed = line.trim();
        return /^-?\s*(MUST|MUST NOT|NEVER|INVARIANT|Constraint):/i.test(trimmed) || /^- \*\*Invariant\*\*/i.test(trimmed) || /^- \*\*Constraint\*\*/i.test(trimmed);
      });
      for (const line of constraintLines) {
        const clean = line.replace(/^[-*]\s+/, "").trim();
        if (!constraints.includes(clean)) constraints.push(clean);
      }
    }
  }
  let overallGovernance = "untracked";
  if (holds.length > 0) {
    overallGovernance = "hold";
  } else if (governingDocuments.length > 0) {
    const hasActive = governingDocuments.some((d) => d.governance === "active" || !d.governance);
    const allDeprecated = governingDocuments.every((d) => d.governance === "deprecated");
    overallGovernance = allDeprecated ? "deprecated" : hasActive ? "active" : "active";
  }
  return {
    targetPath: relTarget,
    governance: overallGovernance,
    holds,
    governingDocuments,
    constraints
  };
}
async function searchMemory(projectRoot, query, options) {
  const root = resolve2(projectRoot);
  const memoryRoot = bundlePath(root);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  const walk = await walkMemory(memoryRoot);
  const limit = options?.limit ?? 10;
  const targetScopeDir = options?.scope ? scopeDirectory(root, options.scope) : void 0;
  const docIndices = [];
  for (const filePath of walk.files) {
    if (targetScopeDir && !isPathInside(targetScopeDir, filePath)) continue;
    const content = await readFile2(filePath, "utf8");
    const parsed = parseMarkdown(content);
    const data = parsed.data;
    const title = typeof data.title === "string" ? data.title : basename2(filePath);
    const type = typeof data.type === "string" ? data.type : "Document";
    const description = typeof data.description === "string" ? data.description : "";
    const tags = Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === "string") : [];
    const titleTokens = tokenize(title);
    const descTokens = tokenize(description);
    const tagsTokens = tags.flatMap((t) => tokenize(t));
    const bodyTokens = tokenize(parsed.body);
    const tokenCounts = /* @__PURE__ */ new Map();
    for (const t of titleTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 3);
    for (const t of descTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 2);
    for (const t of tagsTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 2);
    for (const t of bodyTokens) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
    const dl = titleTokens.length + descTokens.length + tagsTokens.length + bodyTokens.length;
    docIndices.push({
      path: filePath,
      relPath: normalizeSlash(relative2(root, filePath)),
      title,
      type,
      description,
      tags,
      content,
      body: parsed.body,
      tokenCounts,
      dl
    });
  }
  if (docIndices.length === 0) return [];
  const N = docIndices.length;
  const avgdl = docIndices.reduce((acc, d) => acc + d.dl, 0) / N;
  const k1 = 1.2;
  const b = 0.75;
  const idf = /* @__PURE__ */ new Map();
  for (const q of queryTokens) {
    const df = docIndices.filter((d) => (d.tokenCounts.get(q) ?? 0) > 0).length;
    idf.set(q, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }
  const results = [];
  for (const doc of docIndices) {
    let score = 0;
    let primaryMatchToken;
    for (const q of queryTokens) {
      const tf = doc.tokenCounts.get(q) ?? 0;
      if (tf > 0) {
        if (!primaryMatchToken) primaryMatchToken = q;
        const qIdf = idf.get(q) ?? 0;
        const termScore = qIdf * (tf * (k1 + 1) / (tf + k1 * (1 - b + b * (doc.dl / (avgdl || 1)))));
        score += termScore;
      }
    }
    if (score > 0) {
      let matchedField = "body";
      if (primaryMatchToken && tokenize(doc.title).includes(primaryMatchToken)) {
        matchedField = "title";
      } else if (primaryMatchToken && tokenize(doc.description).includes(primaryMatchToken)) {
        matchedField = "description";
      } else if (primaryMatchToken && doc.tags.some((tag) => tokenize(tag).includes(primaryMatchToken))) {
        matchedField = "tags";
      }
      let snippet = "";
      if (primaryMatchToken) {
        const regex = new RegExp(`\\b(${primaryMatchToken})\\b`, "i");
        const match = doc.content.match(regex);
        if (match && match.index !== void 0) {
          const start = Math.max(0, match.index - 75);
          const end = Math.min(doc.content.length, match.index + 125);
          const raw = doc.content.slice(start, end).replace(/\r?\n/g, " ").trim();
          snippet = `${start > 0 ? "... " : ""}${raw}${end < doc.content.length ? " ..." : ""}`;
        }
      }
      if (!snippet) {
        snippet = doc.description || doc.body.slice(0, 150).replace(/\r?\n/g, " ").trim();
      }
      results.push({
        path: doc.path,
        relPath: doc.relPath,
        title: doc.title,
        type: doc.type,
        score,
        matchedField,
        snippet
      });
    }
  }
  results.sort((a, b2) => b2.score - a.score);
  return results.slice(0, limit);
}

// src/cli.ts
var HELP = `Project Memory CLI

Usage:
  memory <command> [options]

  Commands:
  scan                 Inspect repository files and propose tracked scopes
  init                 Create .memory and optional tracked scopes (deep scan by default)
  scaffold             Add one or more tracked scopes
  migrate              Safely upgrade legacy Project Memory bundles to 0.2
  sync                 Detect changed sources and refresh generated indexes
  status               Show goal, source freshness, blockers, and next action
  search               Lexical BM25 search across all .memory documents
  check                Inspect governance holds, constraints, and scope for a code path
  context              Emit the exact context agents should receive
  map                  Generate on-demand codebase treemap & architecture layout
  record               Register a source and/or append a history event
  validate             Validate format, links, lifecycle, and freshness
  agents-sync          Add or repair the managed AGENTS.md block
  apply                Apply a structured memory plan

Common options:
  --root <path>         Project root (default: current directory/Git root)
  --scope <path>        Tracked scope; repeat for multiple scopes
  --for-path <path>     Target repository file path for check command
  --query <text>        Search query keywords (optional; positional query supported)
  --limit <number>      Maximum search results to return (default: 10)
  --drift               Check description and semantic drift during validate
  --strict              Elevate broken links and orphans to errors during validate
  --budget <bytes>      Byte budget for context command (default: 6000)
  --deep                Perform deep codebase ingestion scan during init (default)
  --shallow             Perform skeleton init without deep codebase scan
  --source <path|url>   Approved source; repeat for multiple sources
  --source-text <text>  Approved brief or conversation text (not stored raw)
  --source-text-file <path> Read approved text from a file
  --source-name <name>  Stable name for a text source
  --source-kind <kind>  conversation, brief, or input
  --event <json>        History event object
  --event-file <path>   Read a history event JSON object from a file
  --plan <json>         Structured memory plan for apply
  --plan-file <path>    Read a structured memory plan from a file
  --dry-run             Show changes without writing
  --check               Check whether sync would change files
  --fetch-remote        Refresh URL sources during sync
  --toon                Emit compact Token-Oriented Object Notation (TOON) for AI agents
  --json                Emit JSON
  --help                Show this help
`;
function parseArguments(argv) {
  const { values: flags2, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      root: { type: "string" },
      scope: { type: "string", multiple: true },
      "for-path": { type: "string" },
      query: { type: "string" },
      limit: { type: "string" },
      drift: { type: "boolean" },
      strict: { type: "boolean" },
      budget: { type: "string" },
      deep: { type: "boolean" },
      source: { type: "string", multiple: true },
      "source-text": { type: "string" },
      "source-text-file": { type: "string" },
      "source-name": { type: "string" },
      "source-kind": { type: "string" },
      event: { type: "string" },
      "event-file": { type: "string" },
      plan: { type: "string" },
      "plan-file": { type: "string" },
      "dry-run": { type: "boolean" },
      check: { type: "boolean" },
      "fetch-remote": { type: "boolean" },
      toon: { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean" }
    }
  });
  return { command: positionals[0], positional: positionals.slice(1), flags: flags2 };
}
var flag = (args, name) => typeof args.flags[name] === "string" ? args.flags[name] : Array.isArray(args.flags[name]) ? args.flags[name].at(-1) : void 0;
var flags = (args, name) => Array.isArray(args.flags[name]) ? args.flags[name] : typeof args.flags[name] === "string" ? [args.flags[name]] : [];
var enabled = (args, name) => args.flags[name] === true;
function formatToon(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "results:none";
    if (value[0] && typeof value[0] === "object" && "score" in value[0] && "snippet" in value[0]) {
      const items = value;
      const lines = items.map((item) => `  ${item.score.toFixed(2)}|${item.relPath}|${item.title}|${item.snippet.replace(/\n/g, " ")}`);
      return `search_results[score|path|title|snippet]:
${lines.join("\n")}`;
    }
  }
  if (typeof value !== "object") return String(value);
  const object = value;
  if ("targetPath" in object && "governance" in object && "governingDocuments" in object) {
    const res = object;
    const lines = [
      `path:${res.targetPath}|governance:${res.governance}|holds:${res.holds.length}|docs:${res.governingDocuments.length}`
    ];
    if (res.holds.length > 0) {
      lines.push("holds[path|reason]:");
      for (const h of res.holds) lines.push(`  ${h.path}|${h.reason ?? "none"}`);
    }
    if (res.governingDocuments.length > 0) {
      lines.push("docs[path|type|governance]:");
      for (const d of res.governingDocuments) lines.push(`  ${d.path}|${d.type}|${d.governance ?? "active"}`);
    }
    if (res.constraints.length > 0) {
      lines.push("constraints:");
      for (const c of res.constraints) lines.push(`  - ${c}`);
    }
    return lines.join("\n");
  }
  if ("diagnostics" in object && "counts" in object) {
    const counts = object.counts;
    const diagnostics = object.diagnostics ?? [];
    const head = `ok:${object.ok}|docs:${counts.documents ?? 0}|scopes:${counts.scopes ?? 0}|sources:${counts.sources ?? 0}|errors:${counts.errors ?? 0}|warnings:${counts.warnings ?? 0}`;
    if (diagnostics.length === 0) return `${head}
diagnostics:none`;
    const diagLines = diagnostics.slice(0, 30).map((d) => `  ${d.severity}|${d.path ?? "bundle"}|${d.message}`);
    return `${head}
diagnostics[severity|path|message]:
${diagLines.join("\n")}`;
  }
  if ("candidates" in object && "files" in object) {
    const filesCount = Array.isArray(object.files) ? object.files.length : 0;
    const candidates = object.candidates ?? [];
    const head = `root:${object.projectRoot}|git:${object.git}|files:${filesCount}|fingerprint:${object.fingerprint}`;
    if (candidates.length === 0) return `${head}
candidates:none`;
    const rows = candidates.map((c) => `  ${c.path}|${c.confidence}|${c.fileCount}`);
    return `${head}
candidates[path|confidence|files]:
${rows.join("\n")}`;
  }
  if ("initialized" in object && "sourceCounts" in object) {
    const sc = object.sourceCounts ?? {};
    const countsStr = Object.entries(sc).map(([k, v]) => `${k}:${v}`).join(" ");
    const val = object.validation;
    const valStr = val ? `ok:${val.ok}(err:${val.counts?.errors ?? 0},warn:${val.counts?.warnings ?? 0})` : "none";
    const lines = [
      `init:${object.initialized}|root:${object.root}${object.activeScope ? `|scope:${object.activeScope}` : ""}`,
      `goal:${object.goalStatus ?? "none"}${object.nextAction ? `|next:${object.nextAction}` : ""}`,
      `sources:${countsStr}|val:${valStr}`
    ];
    if (object.blockers) lines.push(`blockers:${object.blockers}`);
    return lines.join("\n");
  }
  if ("changes" in object && Array.isArray(object.changes)) {
    const changes = object.changes;
    if (changes.length === 0) return "changes:none";
    return `changes[action|path]:
${changes.map((c) => `  ${c.action}|${c.path}`).join("\n")}`;
  }
  if ("treemap" in object) {
    const head = `root:${object.root ?? object.projectRoot}|files:${object.files ?? object.filesCount ?? 0}`;
    return `${head}
${object.treemap}`;
  }
  return Object.entries(object).map(([k, v]) => v && typeof v === "object" ? `${k}:${JSON.stringify(v)}` : `${k}:${v}`).join(" | ");
}
function summarize(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "No results found.";
    if (value[0] && typeof value[0] === "object" && "score" in value[0] && "snippet" in value[0]) {
      const items = value;
      const lines = [`Found ${items.length} matching document(s):`];
      for (const item of items) {
        lines.push(`- [${item.score.toFixed(2)}] ${item.relPath} (${item.title}) [${item.matchedField}]`);
        lines.push(`  Snippet: ${item.snippet.replace(/\s+/g, " ").trim()}`);
      }
      return lines.join("\n");
    }
  }
  if (typeof value !== "object") return String(value);
  const object = value;
  if ("targetPath" in object && "governance" in object && "governingDocuments" in object) {
    const res = object;
    const lines = [
      `Path: ${res.targetPath}`,
      `Governance: ${res.governance.toUpperCase()}`
    ];
    if (res.holds.length > 0) {
      lines.push(`\u26A0\uFE0F ACTIVE HOLDS (${res.holds.length}):`);
      for (const h of res.holds) lines.push(`- ${h.path}: ${h.reason ?? "Subsystem frozen by governance"}`);
    }
    if (res.governingDocuments.length > 0) {
      lines.push(`Governing Documents (${res.governingDocuments.length}):`);
      for (const doc of res.governingDocuments) {
        lines.push(`- ${doc.path} (${doc.type}) [${doc.governance ?? "active"}]`);
      }
    }
    if (res.constraints.length > 0) {
      lines.push(`Constraints & Invariants (${res.constraints.length}):`);
      for (const c of res.constraints) lines.push(`- ${c}`);
    }
    return lines.join("\n");
  }
  if ("diagnostics" in object && "counts" in object) {
    const counts = object.counts;
    const diagnostics = object.diagnostics;
    const lines = [`${object.ok ? "valid" : "invalid"}: ${counts.errors ?? 0} error(s), ${counts.warnings ?? 0} warning(s)`];
    for (const item of diagnostics.slice(0, 30)) lines.push(`- ${item.severity}: ${item.path ?? "bundle"}: ${item.message}`);
    if (diagnostics.length > 30) lines.push(`- ${diagnostics.length - 30} more diagnostic(s)`);
    return lines.join("\n");
  }
  if ("candidates" in object && "files" in object) {
    const candidates = object.candidates;
    return [
      `Scanned ${object.files.length} file(s) in ${object.projectRoot}`,
      `Repository fingerprint: ${object.fingerprint}`,
      "Candidate scopes:",
      ...candidates.map((candidate) => `- ${candidate.path} (${candidate.confidence}, ${candidate.fileCount} files)`)
    ].join("\n");
  }
  if ("changes" in object && Array.isArray(object.changes)) {
    const changes = object.changes;
    return changes.length === 0 ? "No changes." : changes.map((change) => `- ${change.action}: ${change.path}`).join("\n");
  }
  return JSON.stringify(value, null, 2);
}
async function rootFor(args) {
  return findProjectRoot(resolve3(flag(args, "root") ?? process.cwd()));
}
async function storedRepositoryHead(root) {
  try {
    const parsed = parseMarkdown(await readFile3(resolve3(root, ".memory", "index.md"), "utf8"));
    return typeof parsed.data.repository_head === "string" ? parsed.data.repository_head : void 0;
  } catch {
    return void 0;
  }
}
async function runCli(argv, io = {
  stdout: (text) => process.stdout.write(`${text}
`),
  stderr: (text) => process.stderr.write(`${text}
`)
}) {
  let args;
  try {
    args = parseArguments(argv);
  } catch (error) {
    const message = error.message;
    io.stderr(argv.includes("--json") ? JSON.stringify({ error: message }) : message);
    return 2;
  }
  if (enabled(args, "help") || !args.command || args.command === "help") {
    io.stdout(HELP.trimEnd());
    return 0;
  }
  const json = enabled(args, "json");
  const dryRun = enabled(args, "dry-run") || enabled(args, "check");
  try {
    const root = await rootFor(args);
    let result;
    switch (args.command) {
      case "scan": {
        result = await scanRepository(root);
        break;
      }
      case "init":
      case "scaffold": {
        const requested = [...flags(args, "scope"), ...args.positional].filter(Boolean);
        const shallow = enabled(args, "shallow");
        const deep = !shallow;
        const scan = await scanRepository(root);
        const mutate = () => initializeBundle(root, requested, { dryRun, projectName: basename3(root), deep });
        const initialized = dryRun ? await mutate() : await withBundleLock(root, mutate);
        result = { ...initialized, candidates: scan.candidates };
        break;
      }
      case "migrate": {
        const mutate = () => migrateBundle(root, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "sync": {
        const scan = await scanRepository(root);
        const since = await storedRepositoryHead(root);
        const changed = await changedRepositoryPaths(root, since);
        const scopes = flags(args, "scope");
        const knownScopes = scopes.length > 0 ? scopes : await discoverTrackedScopes(root);
        const mutate = async () => {
          const sources = await refreshRegisteredSources(root, { dryRun, fetchRemote: enabled(args, "fetch-remote") });
          const changes = await syncIndexes(root, scan, { dryRun });
          const agents = await syncAgentsFile(root, { dryRun });
          const validation = await validateBundle(root);
          return { changedPaths: changed, affectedScopes: mapPathsToScopes(changed, knownScopes), sources, changes: [...changes, agents], validation };
        };
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "status": {
        result = await getMemoryStatus(root, flag(args, "scope") ?? args.positional[0]);
        break;
      }
      case "context": {
        const scope = flag(args, "scope") ?? args.positional[0];
        const budgetStr = flag(args, "budget");
        const budget = budgetStr ? parseInt(budgetStr, 10) : void 0;
        const toon2 = enabled(args, "toon");
        const context = await buildMemoryContext(root, { scope, budget, toon: toon2 });
        if (context.startsWith("[PROJECT MEMORY ERROR]")) {
          io.stderr(json ? JSON.stringify({ error: context }) : context);
          return 1;
        }
        if (json) {
          result = { context, scope: scope ?? ".", budget: budget ?? MAX_AUTO_CONTEXT_BYTES };
        } else {
          io.stdout(context);
          return 0;
        }
        break;
      }
      case "map": {
        const treemap = await generateMemoryMap(root);
        if (json) {
          const scan = await scanRepository(root);
          result = {
            projectRoot: root,
            fingerprint: scan.fingerprint,
            filesCount: scan.files.length,
            treemap
          };
        } else if (enabled(args, "toon")) {
          const scan = await scanRepository(root);
          result = {
            root,
            files: scan.files.length,
            treemap
          };
        } else {
          io.stdout(treemap);
          return 0;
        }
        break;
      }
      case "record": {
        const sourceInputs = [...flags(args, "source")];
        if (args.positional.length > 0 && sourceInputs.length === 0 && !flag(args, "event")) sourceInputs.push(args.positional[0]);
        const scope = flag(args, "scope") ?? ".";
        const sourceTextFile = flag(args, "source-text-file");
        const sourceText = flag(args, "source-text") ?? (sourceTextFile ? await readFile3(resolve3(sourceTextFile), "utf8") : void 0);
        const sourceName = flag(args, "source-name") ?? (sourceTextFile ? basename3(sourceTextFile) : "approved-input");
        const sourceKindValue = flag(args, "source-kind") ?? "input";
        if (!["conversation", "brief", "input"].includes(sourceKindValue)) throw new Error("--source-kind must be conversation, brief, or input");
        const sourceKind = sourceKindValue;
        const eventFile = flag(args, "event-file");
        const eventText = flag(args, "event") ?? (eventFile ? await readFile3(resolve3(eventFile), "utf8") : void 0);
        const event = eventText ? JSON.parse(eventText) : void 0;
        if (sourceInputs.length === 0 && !sourceText && !event) throw new Error("record requires --source, --source-text, --source-text-file, or --event");
        const mutate = async () => {
          const sources = [];
          for (const source of sourceInputs) sources.push(await registerSource(root, source, { dryRun, fetchRemote: /^https?:\/\//i.test(source) }));
          if (sourceText) sources.push(await registerTextSource(root, sourceName, sourceText, sourceKind, { dryRun }));
          const history = event ? await recordEvent(root, scope, event, { dryRun }) : void 0;
          return { sources, history };
        };
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "search": {
        const query = [flag(args, "query"), ...args.positional].filter(Boolean).join(" ");
        if (!query.trim()) throw new Error("search requires a query string");
        const limitStr = flag(args, "limit");
        const limit = limitStr ? parseInt(limitStr, 10) : 10;
        const scope = flag(args, "scope");
        result = await searchMemory(root, query, { limit, scope });
        break;
      }
      case "check": {
        const targetPath = flag(args, "for-path") ?? args.positional[0];
        if (!targetPath) throw new Error("check requires --for-path <path> or positional path");
        result = await checkPathGovernance(root, targetPath);
        break;
      }
      case "validate": {
        const drift = enabled(args, "drift");
        const strict = enabled(args, "strict");
        result = await validateBundle(root, { drift, strict });
        break;
      }
      case "agents-sync": {
        const mutate = () => syncAgentsFile(root, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      case "apply": {
        const planFile = flag(args, "plan-file");
        const planText = flag(args, "plan") ?? (planFile ? await readFile3(resolve3(planFile), "utf8") : void 0);
        if (!planText) throw new Error("apply requires --plan <json> or --plan-file <path>");
        const plan = JSON.parse(planText);
        const mutate = () => applyMemoryPlan(root, plan, { dryRun });
        result = dryRun ? await mutate() : await withBundleLock(root, mutate);
        break;
      }
      default:
        io.stderr(`Unknown command: ${args.command}

${HELP}`);
        return 2;
    }
    const toon = enabled(args, "toon");
    io.stdout(json ? JSON.stringify(result, null, 2) : toon ? formatToon(result) : summarize(result));
    if (args.command === "validate" && !result.ok) return 1;
    if (args.command === "sync" && enabled(args, "check")) {
      const syncResult = result;
      if (syncResult.changes?.some((change) => change.action !== "skip") || syncResult.sources?.some((source) => source.changed || source.needsIntegration)) return 1;
    }
    return 0;
  } catch (error) {
    io.stderr(json ? JSON.stringify({ error: error.message }) : `Error: ${error.message}`);
    return 1;
  }
}
var isMain = process.argv[1] && (["memory", "memory.mjs"].includes(basename3(process.argv[1])) || import.meta.url === pathToFileURL(resolve3(process.argv[1])).href);
if (isMain) process.exitCode = await runCli(process.argv.slice(2));
export {
  formatToon,
  runCli
};
