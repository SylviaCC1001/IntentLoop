import assert from "node:assert/strict";
import {
  createPrototypePageKey,
  createPrototypeElementAnchor,
  isPrototypeAnchorInContext,
  normalizePrototypeRect,
} from "./index";

const rect = normalizePrototypeRect(
  { x: 120, y: 96, w: 240, h: 72 },
  { w: 1200, h: 720 }
);

assert.deepEqual(rect, { x: 10, y: 13.333, w: 20, h: 10 });

const anchor = createPrototypeElementAnchor({
  versionId: "version-1",
  pagePath: "/proto/doc/version/index.html?review=1",
  viewKey: "view:assistant",
  viewport: { w: 1200, h: 720 },
  rect,
  dom: {
    selector: "button#submit-primary",
    xpath: "/html/body/main/button[1]",
    tagName: "button",
    id: "submit-primary",
    className: "primary cta",
    role: "button",
    text: "提交审批",
    fingerprint: "button#submit-primary|提交审批",
  },
});

assert.equal(anchor.type, "element");
assert.equal(anchor.kind, "prototype-element");
assert.equal(anchor.selector, "button#submit-primary");
assert.ok(anchor.domAnchor);
assert.equal(anchor.domAnchor.selector, "button#submit-primary");
assert.equal(anchor.domAnchor.xpath, "/html/body/main/button[1]");
assert.equal(anchor.domAnchor.tagName, "button");
assert.equal(anchor.domAnchor.fingerprint, "button#submit-primary|提交审批");
assert.deepEqual(anchor.bbox, rect);
assert.deepEqual(anchor.viewport, { w: 1200, h: 720 });
assert.equal(anchor.pagePath, "/proto/doc/version/index.html?review=1");
assert.equal(anchor.viewKey, "view:assistant");
assert.equal(
  anchor.pageKey,
  createPrototypePageKey("/proto/doc/version/index.html?review=1", "view:assistant")
);
assert.match(anchor.textHash, /^version-1:\/proto\/doc\/version\/index\.html\?review=1::view:assistant:/);
assert.match(anchor.preview, /button/);
assert.match(anchor.preview, /提交审批/);

assert.equal(
  isPrototypeAnchorInContext(anchor, {
    pagePath: "/proto/doc/version/index.html?review=1",
    viewKey: "view:assistant",
    pageKey: createPrototypePageKey(
      "/proto/doc/version/index.html?review=1",
      "view:assistant"
    ),
    viewport: { w: 1200, h: 720 },
  }),
  true
);

assert.equal(
  isPrototypeAnchorInContext(anchor, {
    pagePath: "/proto/doc/version/index.html?review=1",
    viewKey: "view:market",
    pageKey: createPrototypePageKey(
      "/proto/doc/version/index.html?review=1",
      "view:market"
    ),
    viewport: { w: 1200, h: 720 },
  }),
  false
);

console.log("Prototype annotation helpers smoke passed");
