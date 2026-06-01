import fs from "fs";
import path from "path";

const smokeDataDir = path.join(process.cwd(), "data", "proto-smoke-test");
const prototypeDir = path.join(smokeDataDir, "prototypes", "doc", "version");
fs.rmSync(smokeDataDir, { recursive: true, force: true });
fs.mkdirSync(prototypeDir, { recursive: true });
fs.writeFileSync(
  path.join(prototypeDir, "index.html"),
  "<!doctype html><title>Prototype</title><body><button id=\"go\">Go</button></body>",
  "utf-8"
);
process.env.DATA_DIR = smokeDataDir;

async function main() {
  const { GET } = await import("./[...path]/route");
  const response = await GET(new Request("http://localhost/proto/doc/version/index.html"), {
    params: Promise.resolve({ path: ["doc", "version", "index.html"] }),
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200 for prototype file, received ${response.status}`);
  }

  const body = await response.text();
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
    "data-prd-hub-agent-script",
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

  const blocked = await GET(new Request("http://localhost/proto/..%2F.env"), {
    params: Promise.resolve({ path: ["..", ".env"] }),
  });
  if (blocked.status !== 400) {
    throw new Error(`Expected traversal request to be blocked, received ${blocked.status}`);
  }

  console.log("Proto smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
