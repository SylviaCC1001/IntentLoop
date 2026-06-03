import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function isUnsafeSegment(segment: string) {
  return (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.includes("\0") ||
    path.isAbsolute(segment)
  );
}

function annotationAgentScript() {
  return `<script data-intentloop-agent-script="true">
;(() => {
  if (window.__prdHubPrototypeAnnotationAgent) return;
  window.__prdHubPrototypeAnnotationAgent = true;
  document.documentElement.dataset.prdHubPrototypeAgent = "ready";
  const SOURCE = "intentloop-prototype-agent";
  const HOST = "intentloop-prototype-host";
  const INTERACTIVE = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[tabindex]:not([tabindex='-1'])",
    "[onclick]",
    "[data-prototype-annotate]"
  ].join(",");
  const STRUCTURAL = [
    "[data-prototype-annotate]",
    "article",
    "li",
    "[class*='card']",
    "[class*='item']",
    "[class*='row']"
  ].join(",");
  let enabled = false;
  let textEditEnabled = false;
  let lastHoverKey = "";
  let hoverEditElement = null;
  let editingElement = null;
  let currentContext = null;
  let lastContextKey = "";
  let resolveTimer = 0;
  const commentAnchors = new Map();
  const textEdits = new Map();

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function round(value) {
    return Number(value.toFixed(3));
  }

  function textOf(element) {
    return (element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120);
  }

  function pagePath() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function createPageKey(path, viewKey) {
    return viewKey ? path + "::" + viewKey : path;
  }

  function viewport() {
    return {
      w: Math.max(1, window.innerWidth || document.documentElement.clientWidth),
      h: Math.max(1, window.innerHeight || document.documentElement.clientHeight)
    };
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  }

  function partFor(element) {
    const tag = element.tagName.toLowerCase();
    if (element.id) return tag + "#" + cssEscape(element.id);
    for (const attr of ["data-testid", "data-test", "data-qa", "name", "aria-label", "title"]) {
      const value = element.getAttribute(attr);
      if (value) return tag + "[" + attr + "=" + JSON.stringify(value) + "]";
    }
    let index = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === element.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }
    return tag + ":nth-of-type(" + index + ")";
  }

  function selectorFor(element) {
    if (element.id) return element.tagName.toLowerCase() + "#" + cssEscape(element.id);
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      parts.unshift(partFor(current));
      const selector = parts.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch {}
      current = current.parentElement;
    }
    return parts.join(" > ") || element.tagName.toLowerCase();
  }

  function xpathFor(element) {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tag = current.tagName.toLowerCase();
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index += 1;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + "[" + index + "]");
      current = current.parentElement;
    }
    return "/" + parts.join("/");
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity || "1") === 0) return false;
    const rect = element.getBoundingClientRect();
    const size = viewport();
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < size.w && rect.top < size.h;
  }

  function keyForElement(element, prefix) {
    for (const attr of ["data-view", "data-page", "data-route", "data-state", "aria-current"]) {
      const value = element.getAttribute(attr);
      if (value) return prefix + ":" + attr + "=" + value;
    }
    if (element.id) return prefix + ":#" + element.id;
    const text = textOf(element).slice(0, 80);
    return text ? prefix + ":" + text : undefined;
  }

  function activeViewKey() {
    const selectors = [
      ".modal.show[id]",
      "[data-prototype-view].active",
      "[data-view].active",
      "[data-page].active",
      "[data-route].active",
      ".view.active[id]",
      "[role='tabpanel'][aria-hidden='false'][id]",
      "[aria-current='page']"
    ];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (isVisible(element)) {
          const key = keyForElement(element, "view");
          if (key) return key;
        }
      }
    }
    return undefined;
  }

  function contextForPage() {
    const path = pagePath();
    const viewKey = activeViewKey();
    return {
      pagePath: path,
      viewKey,
      pageKey: createPageKey(path, viewKey),
      viewport: viewport()
    };
  }

  function contextKey(context) {
    return context.pageKey + "@" + context.viewport.w + "x" + context.viewport.h;
  }

  function post(type, payload) {
    window.parent.postMessage(Object.assign({ source: SOURCE, type }, payload || {}), "*");
  }

  function updateContext(force) {
    const next = contextForPage();
    const nextKey = contextKey(next);
    currentContext = next;
    if (force || nextKey !== lastContextKey) {
      lastContextKey = nextKey;
      post("context", { context: next });
    }
    return next;
  }

  function scheduleResolve() {
    window.clearTimeout(resolveTimer);
    resolveTimer = window.setTimeout(() => {
      updateContext(false);
      postResolvedMarkers();
    }, 80);
  }

  function pickTarget(raw) {
    if (!raw || !(raw instanceof Element)) return null;
    let best = null;
    let bestScore = -Infinity;
    const size = viewport();
    let current = raw;
    while (current && current instanceof Element && current !== document.documentElement && current !== document.body) {
      if (isVisible(current)) {
        const rect = current.getBoundingClientRect();
        const areaRatio = (rect.width * rect.height) / Math.max(1, size.w * size.h);
        const interactive =
          current.matches(INTERACTIVE) ||
          window.getComputedStyle(current).cursor === "pointer";
        const structural = current.matches(STRUCTURAL);
        const hasIdentity =
          Boolean(current.id) ||
          current.hasAttribute("data-testid") ||
          current.hasAttribute("data-test") ||
          current.hasAttribute("data-qa") ||
          current.hasAttribute("aria-label");
        const hasText = textOf(current).length > 0;
        let score = -20;
        if (interactive) score = 100;
        else if (current.hasAttribute("data-prototype-annotate")) score = 90;
        else if (structural) score = 54;
        else if (hasIdentity) score = 46;
        else if (hasText) score = 28;
        if (current === raw) score += 8;
        if (hasIdentity) score += 8;
        if (areaRatio > 0.55 && !interactive) score -= 50;
        if (rect.width < 6 || rect.height < 6) score -= 30;
        if (score > bestScore) {
          best = current;
          bestScore = score;
        }
      }
      current = current.parentElement;
    }
    return bestScore >= 20 ? best : null;
  }

  function rectForElement(element) {
    const rect = element.getBoundingClientRect();
    const size = viewport();
    return {
      x: round(clamp((rect.left / size.w) * 100, 0, 100)),
      y: round(clamp((rect.top / size.h) * 100, 0, 100)),
      w: round(clamp((rect.width / size.w) * 100, 0, 100)),
      h: round(clamp((rect.height / size.h) * 100, 0, 100))
    };
  }

  function domForElement(element) {
    const selector = selectorFor(element);
    const role = element.getAttribute("role") || undefined;
    const text = textOf(element);
    const tagName = element.tagName.toLowerCase();
    const className = typeof element.className === "string" ? element.className.trim().slice(0, 120) : undefined;
    const id = element.id || undefined;
    const fingerprint = [tagName, id ? "#" + id : "", role ? "[" + role + "]" : "", text].join("|");
    return {
      selector,
      xpath: xpathFor(element),
      tagName,
      id,
      className,
      role,
      text,
      fingerprint
    };
  }

  function hitForElement(element, context) {
    const dom = domForElement(element);
    return {
      pagePath: context.pagePath,
      viewKey: context.viewKey,
      pageKey: context.pageKey,
      viewport: context.viewport,
      rect: rectForElement(element),
      dom
    };
  }

  function hitForPoint(clientX, clientY) {
    const raw = document.elementFromPoint(clientX, clientY);
    const element = pickTarget(raw);
    if (!element) return null;
    return hitForElement(element, updateContext(false));
  }

  function ensureAgentStyle() {
    if (document.querySelector("style[data-intentloop-agent-style]")) return;
    const style = document.createElement("style");
    style.setAttribute("data-intentloop-agent-style", "true");
    style.textContent = [
      "[data-intentloop-edit-target='true']{outline:2px solid #2563eb!important;outline-offset:2px!important;cursor:text!important;}",
      "[data-intentloop-editing='true']{outline:2px solid #2563eb!important;outline-offset:2px!important;background:rgba(37,99,235,.08)!important;cursor:text!important;}"
    ].join("\\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function hasDirectText(element) {
    return Array.from(element.childNodes).some((node) => {
      return node.nodeType === Node.TEXT_NODE && Boolean((node.textContent || "").replace(/\\s+/g, " ").trim());
    });
  }

  function isTextEditableElement(element) {
    if (!element || !(element instanceof HTMLElement)) return false;
    const tag = element.tagName.toLowerCase();
    if (["script", "style", "noscript", "meta", "link", "svg", "canvas", "iframe", "html", "body"].includes(tag)) {
      return false;
    }
    if (element.matches("input, textarea, select, option")) return false;
    if (element.closest("[data-intentloop-agent-script], [data-intentloop-agent-style]")) return false;
    return isVisible(element) && textOf(element).length > 0;
  }

  function pickTextEditTarget(raw) {
    if (!raw || !(raw instanceof Element)) return null;
    let current = raw;
    while (current && current instanceof Element && current !== document.documentElement && current !== document.body) {
      if (isTextEditableElement(current) && (hasDirectText(current) || current.children.length === 0)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function clearTextEditHover() {
    if (hoverEditElement) {
      hoverEditElement.removeAttribute("data-intentloop-edit-target");
      hoverEditElement = null;
    }
  }

  function setTextEditHover(element) {
    if (hoverEditElement === element) return;
    clearTextEditHover();
    hoverEditElement = element;
    hoverEditElement.setAttribute("data-intentloop-edit-target", "true");
  }

  function selectElementContents(element) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function postTextEditDirty() {
    post("text-edit-dirty", { editCount: textEdits.size });
  }

  function finishTextEdit(keepChanges) {
    if (!editingElement) return;
    const record = editingElement;
    editingElement = null;
    const element = record.element;
    const nextText = element.innerText || element.textContent || "";
    if (!keepChanges) {
      element.textContent = record.originalText;
    }
    if (record.previousContentEditable === null) {
      element.removeAttribute("contenteditable");
    } else {
      element.setAttribute("contenteditable", record.previousContentEditable);
    }
    element.removeAttribute("data-intentloop-editing");
    if (keepChanges && nextText !== record.originalText) {
      const selector = selectorFor(element);
      const xpath = xpathFor(element);
      textEdits.set(selector + "::" + xpath, {
        selector,
        xpath,
        oldText: record.originalText,
        newText: nextText
      });
      postTextEditDirty();
      scheduleResolve();
    }
  }

  function startTextEdit(element) {
    if (!element || editingElement?.element === element) return;
    finishTextEdit(true);
    ensureAgentStyle();
    clearTextEditHover();
    editingElement = {
      element,
      originalText: element.innerText || element.textContent || "",
      previousContentEditable: element.getAttribute("contenteditable")
    };
    element.setAttribute("contenteditable", "plaintext-only");
    element.setAttribute("data-intentloop-editing", "true");
    element.focus({ preventScroll: true });
    selectElementContents(element);
  }

  function onTextEditMouseMove(event) {
    if (!textEditEnabled || editingElement) return;
    const target = pickTextEditTarget(document.elementFromPoint(event.clientX, event.clientY));
    if (target) {
      setTextEditHover(target);
    } else {
      clearTextEditHover();
    }
  }

  function onTextEditClick(event) {
    if (!textEditEnabled) return false;
    const target = pickTextEditTarget(document.elementFromPoint(event.clientX, event.clientY));
    if (!target) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    startTextEdit(target);
    return true;
  }

  function onTextEditKeyDown(event) {
    if (!editingElement) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finishTextEdit(false);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      finishTextEdit(true);
    }
  }

  function onTextEditFocusOut(event) {
    if (editingElement && event.target === editingElement.element) {
      window.setTimeout(() => finishTextEdit(true), 0);
    }
  }

  function doctypeString() {
    const doctype = document.doctype;
    if (!doctype) return "<!doctype html>\\n";
    let value = "<!DOCTYPE " + doctype.name;
    if (doctype.publicId) value += " PUBLIC \\"" + doctype.publicId + "\\"";
    if (doctype.systemId) value += " \\"" + doctype.systemId + "\\"";
    return value + ">\\n";
  }

  function serializeCleanHtml() {
    finishTextEdit(true);
    clearTextEditHover();
    const clone = document.documentElement.cloneNode(true);
    clone.removeAttribute("data-intentloop-prototype-agent");
    clone.querySelectorAll("[data-intentloop-agent-script], [data-intentloop-agent-style]").forEach((node) => node.remove());
    clone.querySelectorAll("[data-intentloop-edit-target], [data-intentloop-editing]").forEach((element) => {
      element.removeAttribute("data-intentloop-edit-target");
      element.removeAttribute("data-intentloop-editing");
      element.removeAttribute("contenteditable");
    });
    return doctypeString() + clone.outerHTML;
  }

  function querySelectorSafe(selector) {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function elementFromXPath(xpath) {
    if (!xpath) return null;
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue instanceof Element ? result.singleNodeValue : null;
    } catch {
      return null;
    }
  }

  function anchorMatchesContext(anchor, context) {
    if (!anchor || anchor.type !== "element") return false;
    const anchorPageKey = anchor.pageKey || createPageKey(anchor.pagePath || "", anchor.viewKey);
    if (anchor.pageKey || anchor.viewKey) return anchorPageKey === context.pageKey;
    return !anchor.pagePath || anchor.pagePath === context.pagePath;
  }

  function acceptResolvedElement(element, anchor) {
    if (!element || !isVisible(element)) return false;
    const expected = anchor && anchor.domAnchor && anchor.domAnchor.tagName;
    return !expected || element.tagName.toLowerCase() === String(expected).toLowerCase();
  }

  function resolveAnchorElement(anchor, context) {
    if (!anchorMatchesContext(anchor, context)) return null;
    const candidates = [
      anchor.domAnchor && querySelectorSafe(anchor.domAnchor.selector),
      querySelectorSafe(anchor.selector),
      anchor.domAnchor && anchor.domAnchor.id ? document.getElementById(anchor.domAnchor.id) : null,
      anchor.domAnchor && elementFromXPath(anchor.domAnchor.xpath)
    ];
    for (const element of candidates) {
      if (acceptResolvedElement(element, anchor)) return element;
    }
    return null;
  }

  function postResolvedMarkers() {
    const context = currentContext || updateContext(false);
    const markers = [];
    commentAnchors.forEach((anchor, id) => {
      if (!anchor || anchor.kind !== "prototype-element") return;
      const element = resolveAnchorElement(anchor, context);
      if (!element) return;
      markers.push({
        id,
        target: hitForElement(element, context)
      });
    });
    post("markers", { context, markers });
  }

  function onMouseMove(event) {
    if (textEditEnabled) {
      onTextEditMouseMove(event);
      return;
    }
    if (!enabled) return;
    const target = hitForPoint(event.clientX, event.clientY);
    if (!target) {
      if (lastHoverKey) post("clear-hover", null);
      lastHoverKey = "";
      return;
    }
    const key = target.dom.fingerprint + ":" + JSON.stringify(target.rect);
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    post("hover", { target });
  }

  function onClick(event) {
    if (textEditEnabled && onTextEditClick(event)) return;
    if (!enabled) return;
    const target = hitForPoint(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    post("select", { target });
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== HOST) return;
    if (data.type === "set-text-edit-enabled") {
      textEditEnabled = Boolean(data.enabled);
      if (textEditEnabled) {
        enabled = false;
        lastHoverKey = "";
        post("clear-hover");
        ensureAgentStyle();
      } else {
        clearTextEditHover();
        finishTextEdit(true);
      }
      postTextEditDirty();
      scheduleResolve();
      return;
    }
    if (data.type === "serialize-html") {
      post("serialized-html", {
        requestId: data.requestId,
        html: serializeCleanHtml(),
        editCount: textEdits.size
      });
      return;
    }
    if (data.type === "set-enabled") {
      enabled = Boolean(data.enabled);
      if (!enabled) {
        lastHoverKey = "";
        post("clear-hover");
      }
      scheduleResolve();
      return;
    }
    if (data.type === "sync-comments") {
      commentAnchors.clear();
      if (Array.isArray(data.comments)) {
        data.comments.forEach((item) => {
          if (item && typeof item.id === "string" && item.anchor) {
            commentAnchors.set(item.id, item.anchor);
          }
        });
      }
      scheduleResolve();
    }
  });
  window.addEventListener("mousemove", onMouseMove, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onTextEditKeyDown, true);
  window.addEventListener("focusout", onTextEditFocusOut, true);
  window.addEventListener("scroll", () => {
    if (enabled) post("clear-hover");
    if (textEditEnabled) clearTextEditHover();
    scheduleResolve();
  }, true);
  window.addEventListener("hashchange", scheduleResolve);
  window.addEventListener("popstate", scheduleResolve);
  window.addEventListener("resize", scheduleResolve);
  const observer = new MutationObserver(scheduleResolve);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "aria-current", "aria-selected"],
    childList: true,
    subtree: true
  });
  const readyContext = updateContext(true);
  post("ready", { context: readyContext });
  postResolvedMarkers();
})();
</script>`;
}

function injectAnnotationAgent(html: string) {
  const script = annotationAgentScript();
  if (html.includes("__prdHubPrototypeAnnotationAgent")) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, (match) => `${script}${match}`);
  }
  return `${html}${script}`;
}

function normalizeHtmlCharset(charset: string | null) {
  if (!charset) return null;
  const normalized = charset.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (normalized === "utf8") return "utf-8";
  if (normalized === "gbk" || normalized === "gb2312") return "gb18030";
  return normalized;
}

function detectHtmlCharset(rawBody: Buffer) {
  const head = rawBody.subarray(0, 4096).toString("latin1");
  const direct = head.match(/<meta\s+[^>]*charset=["']?\s*([^"'\s/>]+)/i)?.[1];
  if (direct) return normalizeHtmlCharset(direct);

  const contentType = head.match(/<meta\s+[^>]*content=["'][^"']*charset=([^;"'\s>]+)/i)?.[1];
  return normalizeHtmlCharset(contentType ?? null);
}

function decodeHtmlBody(rawBody: Buffer) {
  const candidates = [detectHtmlCharset(rawBody), "utf-8", "gb18030"].filter(
    (value, index, list): value is string => Boolean(value) && list.indexOf(value) === index
  );

  for (const encoding of candidates) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(rawBody);
    } catch {
      // Try the next likely encoding.
    }
  }

  return rawBody.toString("utf-8");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;
  if (!pathParts.length || pathParts.some(isUnsafeSegment)) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }

  const dataDir = process.env.DATA_DIR || "./data";
  const root = path.resolve(dataDir, "prototypes");
  let filePath = path.resolve(root, ...pathParts);
  const relativePath = path.relative(root, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const stats = fs.statSync(filePath);
  if (stats.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const rawBody = fs.readFileSync(filePath);
  const body =
    ext === ".html" || ext === ".htm"
      ? Buffer.from(injectAnnotationAgent(decodeHtmlBody(rawBody)), "utf-8")
      : rawBody;

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentTypes[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
