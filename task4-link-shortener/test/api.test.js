const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../server");

const dbFile = path.join(os.tmpdir(), `links-test-${Date.now()}.db`);
const app = createApp(dbFile);
let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  server.close();
  app.close();
  fs.rmSync(dbFile, { force: true });
});

const post = (url, body) =>
  fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("rejects an invalid URL", async () => {
  const res = await post("/api/shorten", { url: "not a url" });
  assert.strictEqual(res.status, 400);
});

test("rejects non-http protocols", async () => {
  const res = await post("/api/shorten", { url: "javascript:alert(1)" });
  assert.strictEqual(res.status, 400);
});

test("creates a short link with a random 6 character code", async () => {
  const res = await post("/api/shorten", { url: "https://example.com/some/long/path" });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.match(data.code, /^[A-Za-z0-9]{6}$/);
  assert.ok(data.shortUrl.endsWith("/" + data.code));
});

test("supports a custom alias and blocks duplicates", async () => {
  const first = await post("/api/shorten", { url: "https://example.com", alias: "my-link" });
  assert.strictEqual(first.status, 201);
  const second = await post("/api/shorten", { url: "https://example.org", alias: "my-link" });
  assert.strictEqual(second.status, 409);
});

test("rejects bad and reserved aliases", async () => {
  assert.strictEqual((await post("/api/shorten", { url: "https://example.com", alias: "a" })).status, 400);
  assert.strictEqual((await post("/api/shorten", { url: "https://example.com", alias: "bad alias!" })).status, 400);
  assert.strictEqual((await post("/api/shorten", { url: "https://example.com", alias: "api" })).status, 400);
});

test("redirects to the original URL and counts clicks", async () => {
  await post("/api/shorten", { url: "https://example.com/target", alias: "go-test" });
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${base}/go-test`, { redirect: "manual" });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get("location"), "https://example.com/target");
  }
  const res = await fetch(`${base}/api/links/go-test/analytics`);
  const data = await res.json();
  assert.strictEqual(data.totalClicks, 3);
  assert.strictEqual(data.lastSevenDays.length, 7);
  assert.strictEqual(data.lastSevenDays.at(-1).clicks, 3);
  assert.strictEqual(data.topReferrers[0].referrer, "direct");
});

test("records the referrer host", async () => {
  await post("/api/shorten", { url: "https://example.com/r", alias: "ref-test" });
  await fetch(`${base}/ref-test`, { redirect: "manual", headers: { Referer: "https://news.example.net/page" } });
  const data = await (await fetch(`${base}/api/links/ref-test/analytics`)).json();
  assert.strictEqual(data.topReferrers[0].referrer, "news.example.net");
});

test("returns 404 for unknown codes", async () => {
  assert.strictEqual((await fetch(`${base}/doesnotexist`)).status, 404);
  assert.strictEqual((await fetch(`${base}/api/links/doesnotexist/analytics`)).status, 404);
});

test("lists links with click counts and deletes a link", async () => {
  const links = await (await fetch(`${base}/api/links`)).json();
  const go = links.find((l) => l.code === "go-test");
  assert.strictEqual(go.clicks, 3);
  const del = await fetch(`${base}/api/links/go-test`, { method: "DELETE" });
  assert.strictEqual(del.status, 200);
  assert.strictEqual((await fetch(`${base}/go-test`)).status, 404);
});
