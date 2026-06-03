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
  });
  const gbkBody = await gbkResponse.text();
  if (!gbkBody.includes("插件市场")) {
    throw new Error("Expected GBK prototype HTML to be decoded before injection");
  }
  if (gbkBody.includes("����")) {
    throw new Error("Expected GBK prototype HTML to avoid replacement-character mojibake");
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
