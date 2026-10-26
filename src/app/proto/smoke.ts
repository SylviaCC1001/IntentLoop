import fs from "fs";
import path from "path";
import assert from "node:assert/strict";
import vm from "node:vm";
import { injectStorageCompatibility } from "../../lib/prototypes/storage";

const smokeDataDir = path.join(process.cwd(), "data", "proto-smoke-test");
const prototypeDir = path.join(smokeDataDir, "prototypes", "doc", "version");
fs.rmSync(smokeDataDir, { recursive: true, force: true });
fs.mkdirSync(prototypeDir, { recursive: true });
fs.writeFileSync(
  path.join(prototypeDir, "index.html"),
  "<!doctype html><title>Prototype</title><body><button id=\"go\">Go</button></body>",
  "utf-8"
);
fs.writeFileSync(
  path.join(prototypeDir, "gbk.html"),
  Buffer.concat([
    Buffer.from('<!doctype html><meta charset="gbk"><title>', "ascii"),
    Buffer.from([0xb2, 0xe5, 0xbc, 0xfe, 0xca, 0xd0, 0xb3, 0xa1]),
    Buffer.from("</title><body>", "ascii"),
    Buffer.from([0xb2, 0xe5, 0xbc, 0xfe, 0xca, 0xd0, 0xb3, 0xa1]),
    Buffer.from("</body>", "ascii"),
  ])
);
process.env.DATA_DIR = smokeDataDir;

async function main() {
  // Reproduce a prototype that reads storage synchronously during startup.
  const startup = `<script>window.sessionStorage.setItem("closed", 1);
    window.startupPreference = window.sessionStorage.getItem("closed");</script>`;
  for (const html of [
    `<!doctype html><html><head>${startup}</head><body></body></html>`,
    `<!doctype html>${startup}`,
    `${startup}<script>const markup = "<head>";</script>`,
  ]) {
    const prepared = injectStorageCompatibility(html);
    const window: Record<string, unknown> = {};
    for (const name of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() { throw new Error("SecurityError: sandboxed storage"); },
      });
    }
    const context = vm.createContext({ window });
    const scripts = [...prepared.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    for (const script of scripts) vm.runInContext(script[1], context);
    assert.equal(window.startupPreference, "1");
    const session = window.sessionStorage as Storage;
    const local = window.localStorage as Storage;
    assert.equal(local.getItem("closed"), null, "Storage types must stay separate");
    assert.equal(session.length, 1);
    assert.equal(session.key(0), "closed");
    assert.equal(session.key(1), null);
    session.removeItem("closed");
    assert.equal(session.getItem("closed"), null);
    session.setItem("other", "value");
    session.clear();
    assert.equal(session.length, 0);
    vm.runInContext(scripts[0][1], context);
    assert.equal(window.sessionStorage, session, "Repeated injection must retain this window's storage");
    assert.equal(injectStorageCompatibility(prepared), prepared);
    if (html.startsWith("<!doctype")) assert.ok(prepared.startsWith("<!doctype html>"));
  }
  const native = { getItem: () => "saved" };
  const nativeWindow = { localStorage: native, sessionStorage: native };
  const bootstrap = injectStorageCompatibility("").match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
  vm.runInNewContext(bootstrap, { window: nativeWindow });
  assert.equal(nativeWindow.localStorage, native, "Working browser storage must remain unchanged");
  assert.equal(nativeWindow.sessionStorage, native);

  const { servePrototype: GET } = await import("../../lib/prototypes/serve");
  const response = await GET(new Request("http://localhost/proto/doc/version/index.html"), {
    params: Promise.resolve({ path: ["doc", "version", "index.html"] }),
  }, smokeDataDir);

  if (response.status !== 200) {
    throw new Error(`Expected 200 for prototype file, received ${response.status}`);
  }

  const body = await response.text();
  assert.ok(body.includes('data-intentloop-storage-script="true"'));
  assert.ok(response.headers.get("content-security-policy")?.includes("sandbox"));
  assert.ok(!response.headers.get("content-security-policy")?.includes("allow-same-origin"));
  if (!body.includes("<title>Prototype</title>")) {
    throw new Error("Expected prototype HTML body");
  }
  if (!body.includes("__prdHubPrototypeAnnotationAgent")) {
    throw new Error("Expected prototype HTML response to include annotation agent");
  }
  if (!body.includes("prdHubPrototypeAgent")) {
    throw new Error("Expected injected agent script to expose a DOM-ready marker");
  }
  for (const marker of [
    "sync-comments",
    "markers",
    "viewKey",
    "MutationObserver",
    "set-text-edit-enabled",
    "text-edit-dirty",
    "serialize-html",
    "data-intentloop-agent-script",
  ]) {
    if (!body.includes(marker)) {
      throw new Error(`Expected injected agent script to include ${marker}`);
    }
  }
  if (body.includes("\\</body>")) {
    throw new Error("Expected injected agent script to preserve replacement tokens");
  }
  if (!body.includes('replace(/[^a-zA-Z0-9_-]/g, "\\\\$&")')) {
    throw new Error("Expected CSS.escape fallback to remain executable");
  }

  const gbkResponse = await GET(new Request("http://localhost/proto/doc/version/gbk.html"), {
    params: Promise.resolve({ path: ["doc", "version", "gbk.html"] }),
  }, smokeDataDir);
  const gbkBody = await gbkResponse.text();
  if (!gbkBody.includes("插件市场")) {
    throw new Error("Expected GBK prototype HTML to be decoded before injection");
  }
  if (gbkBody.includes("����")) {
    throw new Error("Expected GBK prototype HTML to avoid replacement-character mojibake");
  }

  const blocked = await GET(new Request("http://localhost/proto/..%2F.env"), {
    params: Promise.resolve({ path: ["..", ".env"] }),
  }, smokeDataDir);
  if (blocked.status !== 400) {
    throw new Error(`Expected traversal request to be blocked, received ${blocked.status}`);
  }

  console.log("Proto smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
