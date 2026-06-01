import type { CommentAnchor } from "@/lib/db/schema";

export type PrototypeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PrototypeViewport = {
  w: number;
  h: number;
};

export type PrototypePageContext = {
  pagePath: string;
  viewKey?: string;
  pageKey: string;
  viewport: PrototypeViewport;
};

export type PrototypeDomAnchor = {
  selector: string;
  xpath?: string;
  tagName: string;
  id?: string;
  className?: string;
  role?: string;
  text?: string;
  fingerprint: string;
};

export type PrototypeElementHit = {
  pagePath: string;
  viewKey?: string;
  pageKey: string;
  viewport: PrototypeViewport;
  rect: PrototypeRect;
  dom: PrototypeDomAnchor;
};

type CreatePrototypeElementAnchorInput = {
  versionId: string;
  pagePath: string;
  viewKey?: string;
  pageKey?: string;
  viewport: PrototypeViewport;
  rect: PrototypeRect;
  dom: PrototypeDomAnchor;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundPercent(value: number) {
  return Number(value.toFixed(3));
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

export function createPrototypePageKey(pagePath: string, viewKey?: string) {
  return viewKey ? `${pagePath}::${viewKey}` : pagePath;
}

export function isPrototypeAnchorInContext(
  anchor: CommentAnchor,
  context: PrototypePageContext | null
) {
  if (!context || anchor.type !== "element") return false;
  if (anchor.kind !== "prototype-element" && anchor.kind !== "prototype-rect") {
    return false;
  }

  const anchorPageKey = anchor.pageKey || createPrototypePageKey(anchor.pagePath || "", anchor.viewKey);
  if (anchor.pageKey || anchor.viewKey) {
    return anchorPageKey === context.pageKey;
  }

  return !anchor.pagePath || anchor.pagePath === context.pagePath;
}

export function normalizePrototypeRect(
  rect: { x: number; y: number; w: number; h: number },
  viewport: PrototypeViewport
): PrototypeRect {
  const viewportWidth = Math.max(1, viewport.w);
  const viewportHeight = Math.max(1, viewport.h);

  return {
    x: roundPercent(clamp((rect.x / viewportWidth) * 100, 0, 100)),
    y: roundPercent(clamp((rect.y / viewportHeight) * 100, 0, 100)),
    w: roundPercent(clamp((rect.w / viewportWidth) * 100, 0, 100)),
    h: roundPercent(clamp((rect.h / viewportHeight) * 100, 0, 100)),
  };
}

export function createPrototypeElementAnchor({
  versionId,
  pagePath,
  viewKey,
  pageKey,
  viewport,
  rect,
  dom,
}: CreatePrototypeElementAnchorInput): Extract<CommentAnchor, { type: "element" }> {
  const normalizedText = normalizeText(dom.text);
  const tagLabel = dom.tagName.toLowerCase();
  const identityLabel = normalizedText || dom.id || dom.role || dom.selector;
  const preview = truncate(`${tagLabel} · ${identityLabel}`, 80);
  const resolvedPageKey = pageKey || createPrototypePageKey(pagePath, viewKey);

  return {
    type: "element",
    kind: "prototype-element",
    selector: dom.selector,
    textHash: `${versionId}:${resolvedPageKey}:${dom.fingerprint}`,
    preview,
    pagePath,
    viewKey,
    pageKey: resolvedPageKey,
    viewport,
    bbox: rect,
    domAnchor: dom,
  };
}
