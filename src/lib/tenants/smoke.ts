import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { hashSync } from "bcryptjs";
import AdmZip from "adm-zip";

// Own both server and data so this suite can never use a deployed database.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "intentloop-tenants-"));
const dbPath = path.join(dataDir, "prd.db");
const env = {
  ...process.env,
  DATA_DIR: dataDir,
  DATABASE_URL: dbPath,
  INVITE_CODE: "cowork-smoke-invite",
  COWORK_INVITE_CODE: "cowork-smoke-invite",
  PROCUREMENT_INVITE_CODE: "procurement-smoke-invite",
  COOKIE_SECURE: "false",
};
const password = "tenant-smoke-password";
const email = "legacy@example.test";
const migration = () => execFileSync(process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "src/lib/db/migrate.ts"], { env, stdio: "pipe" });

async function main() {
  // Simulate an existing single-team database before the tenant migration.
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, avatar_color TEXT NOT NULL, role TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      color TEXT NOT NULL DEFAULT '#6366f1', status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `);
  legacy.prepare("INSERT INTO users (id,email,password_hash,display_name,avatar_color,role) VALUES (?,?,?,?,?,?)")
    .run("legacy-user", email, hashSync(password, 4), "Cowork Legacy", "#123456", "admin");
  legacy.prepare("INSERT INTO projects (id,name,created_by) VALUES (?,?,?)")
    .run("legacy-project", "Cowork historical project", "legacy-user");
  legacy.close();
  migration();
  migration();
  const coworkDb = new DatabaseSync(dbPath);
  const procurementDir = path.join(dataDir, "tenants", "procurement");
  const procurementDb = new DatabaseSync(path.join(procurementDir, "prd.db"));
  assert.equal(coworkDb.prepare("SELECT count(*) AS c FROM users").get()?.c, 1);
  assert.equal(coworkDb.prepare("SELECT role FROM users WHERE id='legacy-user'").get()?.role, "admin");
  assert.equal(procurementDb.prepare("SELECT count(*) AS c FROM users").get()?.c, 0);
  // Existing session cookies with no tenant selection must still resolve to Cowork.
  coworkDb.prepare("INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)")
    .run("legacy-session", "legacy-user", Date.now() + 600_000);

  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address() as net.AddressInfo;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${address.port}`;
  let output = "";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(address.port)], { env });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  const request = (url: string, cookie = "", method = "GET", body?: unknown) => fetch(`${base}${url}`, {
    method, redirect: url.startsWith("/proto/") ? "follow" : "manual", headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = async (url: string, cookie = "", method = "GET", body?: unknown, status = 200) => {
    const response = await request(url, cookie, method, body);
    assert.equal(response.status, status, `${method} ${url}: ${await response.clone().text()}`);
    return response.json();
  };
  const cookieFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const login = async (tenantId: string) => {
    const response = await request("/api/auth/login", "", "POST", { email, password, tenantId });
    assert.equal(response.status, 200);
    assert.ok(cookieFrom(response).includes(`prd_tenant=${tenantId}`));
    return cookieFrom(response);
  };
  const asset = async (cookie: string, projectId: string, type: string, filename: string, content: string | Buffer) => {
    const form = new FormData();
    form.set("assetType", type);
    form.set("title", filename);
    form.set("file", new Blob([typeof content === "string" ? content : new Uint8Array(content)]), filename);
    const response = await fetch(`${base}/api/solutions/${projectId}/assets`, { method: "POST", headers: { Cookie: cookie }, body: form });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(output);
      try { ready = (await request("/login")).status === 200; } catch { /* Wait for the owned server to listen. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, output);
    const loginHtml = await (await request("/login")).text();
    assert.ok(loginHtml.includes("招采需求空间") && loginHtml.includes("Cowork需求空间"));
    await json("/api/projects", "", "GET", undefined, 401);
    assert.equal((await json("/api/projects", "prd_session=legacy-session")).projects[0].id, "legacy-project");
    await json("/api/auth/login", "", "POST", { email, password, tenantId: "procurement" }, 401);
    await json("/api/auth/login", "", "POST", { email, password, tenantId: "../../cowork" }, 400);
    await json("/api/auth/login", "", "POST", { email, password }, 400);
    await json("/api/auth/register", "", "POST", { email, password, displayName: "Procurement Admin", tenantId: "procurement", inviteCode: env.INVITE_CODE }, 403);
    const registered = await request("/api/auth/register", "", "POST", { email, password, displayName: "Procurement Admin", tenantId: "procurement", inviteCode: env.PROCUREMENT_INVITE_CODE });
    assert.equal(registered.status, 200, await registered.clone().text());
    const procurementUser = (await registered.json()).user;
    assert.equal(procurementUser.role, "admin");
    assert.notEqual(procurementUser.id, "legacy-user");
    const procurementCookie = cookieFrom(registered);
    const coworkCookie = await login("cowork");
    await login("procurement");
    await json("/api/projects", procurementCookie.replace("prd_tenant=procurement", "prd_tenant=cowork"), "GET", undefined, 401);
    await json("/api/projects", coworkCookie.replace("prd_tenant=cowork", "prd_tenant=invalid"), "GET", undefined, 401);
    assert.equal((await json("/api/projects", procurementCookie)).projects.length, 0);
    const procurementProject = (await json("/api/projects", procurementCookie, "POST", { name: "Procurement private project" }, 201)).project;
    await json("/api/documents", procurementCookie, "POST", { projectId: "legacy-project", title: "blocked", type: "md" }, 404);
    const coworkMd = await asset(coworkCookie, "legacy-project", "prd", "cowork.md", "# Cowork confidential content");
    const procurementMd = await asset(procurementCookie, procurementProject.id, "prd", "procurement.md", "# Procurement confidential content");
    const coworkProto = await asset(coworkCookie, "legacy-project", "prototype", "cowork.html", "<h1>Cowork confidential prototype</h1>");
    const zip = new AdmZip();
    zip.addFile("index.html", Buffer.from('<link rel="stylesheet" href="style.css"><h1>Procurement confidential prototype</h1>'));
    zip.addFile("style.css", Buffer.from("h1 { color: red; }"));
    const procurementProto = await asset(procurementCookie, procurementProject.id, "prototype", "procurement.zip", zip.toBuffer());
    const coworkAppendix = await asset(coworkCookie, "legacy-project", "appendix", "cowork.txt", "Cowork confidential attachment");
    const procurementAppendix = await asset(procurementCookie, procurementProject.id, "appendix", "procurement.txt", "Procurement confidential attachment");
    const versionId = (value: { versionId: string }) => value.versionId;
    const comment = (await json(`/api/documents/${coworkMd.document.id}/comments`, coworkCookie, "POST", { versionId: versionId(coworkMd), body: "Cowork confidential review", anchor: { type: "doc" } }, 201)).comment;
    await json(`/api/documents/${coworkMd.document.id}/comments`, procurementCookie, "POST", { versionId: versionId(coworkMd), body: "blocked", anchor: { type: "doc" } }, 404);
    for (const [ownCookie, otherCookie, projectId, md, proto, appendix] of [
      [coworkCookie, procurementCookie, "legacy-project", coworkMd, coworkProto, coworkAppendix],
      [procurementCookie, coworkCookie, procurementProject.id, procurementMd, procurementProto, procurementAppendix],
    ] as const) {
      const resourceUrls = [
        `/api/projects/${projectId}`,
        `/api/documents/${md.document.id}`,
        `/api/documents/${md.document.id}/versions/${versionId(md)}`,
        `/api/documents/${md.document.id}/versions/${versionId(md)}/download`,
        `/api/appendices/${appendix.document.id}/download`,
        `/api/solutions/${projectId}/review-context`,
        `/proto/${proto.document.id}/${versionId(proto)}/index.html`,
      ];
      for (const url of resourceUrls) {
        assert.equal((await request(url, ownCookie)).status, 200, url);
        assert.equal((await request(url, otherCookie)).status, 404, url);
      }
      await json(`/api/projects/${projectId}`, otherCookie, "PATCH", { name: "blocked" }, 404);
      await json(`/api/projects/${projectId}`, otherCookie, "DELETE", undefined, 404);
      await json(`/api/documents/${md.document.id}`, otherCookie, "PATCH", { title: "blocked" }, 404);
      await json(`/api/documents/${md.document.id}`, otherCookie, "DELETE", undefined, 404);
      await json(`/api/documents/${md.document.id}/versions/${versionId(md)}/rollback`, otherCookie, "POST", undefined, 404);
      assert.equal((await request(`/solutions/${projectId}`, otherCookie)).status, 404);
      const protoUrl = `/proto/${proto.document.id}/${versionId(proto)}/index.html`;
      const prototype = await request(protoUrl, ownCookie);
      assert.equal(new URL(prototype.url).origin, base, "Preview redirects must retain the browser's origin");
      assert.ok(prototype.headers.get("content-security-policy")?.includes("sandbox"));
      assert.equal((await request(protoUrl)).status, 401);
    }
    const styleUrl = `/proto/${procurementProto.document.id}/${versionId(procurementProto)}/style.css`;
    const signedStyle = await request(styleUrl, procurementCookie);
    assert.equal(signedStyle.status, 200);
    assert.equal((await fetch(signedStyle.url)).status, 200, "Sandbox assets must work without application cookies");
    const grantId = new URL(signedStyle.url).pathname.split("/")[4];
    assert.ok(grantId && !signedStyle.url.includes(procurementCookie.split(";")[0].split("=")[1]));
    assert.equal((await fetch(signedStyle.url.replace("/~/procurement/", "/~/cowork/"))).status, 401);
    assert.equal((await fetch(signedStyle.url.replace(procurementProto.document.id, coworkProto.document.id))).status, 401);
    procurementDb.prepare("UPDATE prototype_grants SET expires_at = ? WHERE id = ?").run(Date.now() - 1, grantId);
    assert.equal((await fetch(signedStyle.url)).status, 401, "Expired preview credentials must be rejected");
    assert.equal((await request(styleUrl, coworkCookie)).status, 404);
    await json(`/api/comments/${comment.id}`, procurementCookie, "PATCH", { body: "blocked" }, 404);
    await json(`/api/comments/${comment.id}`, procurementCookie, "DELETE", undefined, 404);
    await json(`/api/comments/${comment.id}/resolve`, procurementCookie, "POST", {}, 404);
    await json("/api/users/legacy-user/role", procurementCookie, "PATCH", { role: "visitor" }, 404);
    for (const route of ["/projects", "/docs", "/board", "/permissions"]) {
      const own = await (await request(route, coworkCookie)).text();
      const other = await (await request(route, procurementCookie)).text();
      assert.ok(own.includes('data-tenant-id="cowork"'));
      assert.ok(other.includes('data-tenant-id="procurement"'));
      assert.ok(!own.includes("Procurement confidential") && !own.includes("Procurement Admin"), route);
      assert.ok(!other.includes("Cowork confidential") && !other.includes("Cowork Legacy"), route);
    }
    // Interleaved requests must never switch a shared global database or directory.
    await Promise.all(Array.from({ length: 16 }, async (_, i) => {
      const cookie = i % 2 ? procurementCookie : coworkCookie;
      const projects = (await json("/api/projects", cookie)).projects;
      assert.deepEqual(projects.map((p: { id: string }) => p.id), [i % 2 ? procurementProject.id : "legacy-project"]);
    }));
    assert.ok(fs.existsSync(path.join(dataDir, "repos", coworkMd.document.id, ".git")));
    assert.ok(fs.existsSync(path.join(procurementDir, "repos", procurementMd.document.id, ".git")));
    assert.ok(!fs.existsSync(path.join(dataDir, "repos", procurementMd.document.id)));
    assert.ok(!fs.existsSync(path.join(procurementDir, "repos", coworkMd.document.id)));
    assert.deepEqual(coworkDb.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(procurementDb.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(coworkDb.prepare("SELECT name FROM projects WHERE id='legacy-project'").get()?.name, "Cowork historical project");
    const activePreview = await request(styleUrl, procurementCookie);
    const logout = await request("/api/auth/logout", procurementCookie, "POST");
    assert.equal(logout.status, 200);
    await json("/api/projects", procurementCookie, "GET", undefined, 401);
    assert.equal((await fetch(activePreview.url)).status, 401, "Logout must revoke preview credentials");
    assert.equal((await request("/api/projects", coworkCookie)).status, 200);
    const counts = [coworkDb, procurementDb].map((db) => db.prepare("SELECT count(*) AS c FROM documents").get()?.c);
    migration();
    assert.deepEqual([coworkDb, procurementDb].map((db) => db.prepare("SELECT count(*) AS c FROM documents").get()?.c), counts);
    console.log("Tenant smoke passed: legacy migration, login, invitations, both-way API/page/file isolation, sandbox headers, concurrent requests and logout.");
  } catch (error) {
    console.error(output.slice(-12000));
    throw error;
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
    coworkDb.close();
    procurementDb.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
