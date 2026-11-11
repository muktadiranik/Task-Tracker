import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { connectToDatabase } from "../src/db.js";
import { createWorkspace } from "../src/workspace.js";

async function startServer(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("readiness reports database failure while the process stays live", async (t) => {
  let available = true;
  const app = createApp(undefined, {
    async checkDatabase() {
      if (!available) throw new Error("Offline");
    },
  });
  const base = await startServer(t, app);
  const ready = await fetch(`${base}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "ready" });

  available = false;
  const unavailable = await fetch(`${base}/ready`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "Database unavailable." });
  const live = await fetch(`${base}/health`);
  assert.equal(live.status, 200);
  await live.json();
});

const testUri = process.env.MONGODB_TEST_URI;

test("private tasks enforce session validity and ownership across routes", {
  skip: testUri ? false : "Set MONGODB_TEST_URI to test accounts and private tasks.",
}, async (t) => {
  const name = `task_tracker_test_${randomUUID().replaceAll("-", "")}`;
  const { client, db } = await connectToDatabase(testUri, name);
  t.after(async () => {
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });

  const workspace = await createWorkspace(db);
  const base = await startServer(t, createApp(db.collection("tasks"), { workspace }));

  async function request(path, status, { token, method = "GET", body } = {}) {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(`${base}${path}`, { method, headers, body: JSON.stringify(body) });
    assert.equal(response.status, status, `${method} ${path}`);
    const json = status === 204 ? undefined : await response.json();
    return { json, headers: response.headers };
  }

  const password = "a tutorial passphrase";
  const alice = { email: "alice@example.test", password };
  const bob = { email: "bob@example.test", password };
  const account = await request("/api/auth/register", 201, { method: "POST", body: alice });
  assert.deepEqual(Object.keys(account.json).sort(), ["_id", "email"]);
  await request("/api/auth/register", 409, {
    method: "POST", body: { ...alice, email: "ALICE@EXAMPLE.TEST" },
  });
  const bobAccount = await request("/api/auth/register", 201, { method: "POST", body: bob });
  await request("/api/auth/login", 401, {
    method: "POST", body: { ...alice, password: "an incorrect passphrase" },
  });
  const login = await request("/api/auth/login", 200, { method: "POST", body: alice });
  assert.equal(login.headers.get("cache-control"), "no-store");
  assert.match(login.json.token, /^[A-Za-z0-9_-]{43}$/);
  const aliceToken = login.json.token;
  const { json: bobLogin } = await request("/api/auth/login", 200, { method: "POST", body: bob });
  const bobToken = bobLogin.token;

  const missing = await request("/api/me/tasks", 401);
  assert.equal(missing.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual((await request("/api/me/stats", 200, { token: aliceToken })).json, {
    total: 0, completed: 0, pending: 0,
  });

  const tasksPath = "/api/me/tasks";
  const first = await request(tasksPath, 201, {
    token: aliceToken, method: "POST", body: { title: "First" },
  });
  const second = await request(tasksPath, 201, {
    token: aliceToken, method: "POST", body: { title: "Second", completed: true },
  });
  await request(tasksPath, 201, {
    token: bobToken, method: "POST", body: { title: "Bob's task", completed: true },
  });
  const firstPath = `${tasksPath}/${first.json._id}`;
  assert.equal(first.headers.get("location"), firstPath);
  await request(firstPath, 404, { token: bobToken });
  await request(firstPath, 404, { token: bobToken, method: "PATCH", body: { completed: true } });
  await request(firstPath, 404, { token: bobToken, method: "DELETE" });
  await request(firstPath, 200, { token: aliceToken });
  const publicTasks = await request("/api/tasks", 200);
  assert.deepEqual(publicTasks.json, []);

  const page = await request(`${tasksPath}?limit=1`, 200, { token: aliceToken });
  assert.deepEqual(page.json.items.map((task) => task._id), [second.json._id]);
  assert.equal(page.json.nextCursor, second.json._id);
  const next = await request(`${tasksPath}?limit=1&before=${page.json.nextCursor}`, 200, {
    token: aliceToken,
  });
  assert.deepEqual(next.json.items.map((task) => task._id), [first.json._id]);
  assert.equal(next.json.nextCursor, null);
  const completed = await request(`${tasksPath}?completed=true`, 200, { token: aliceToken });
  assert.deepEqual(completed.json.items.map((task) => task._id), [second.json._id]);
  await request(`${tasksPath}?limit=101`, 400, { token: aliceToken });
  await request(`${tasksPath}?completed=true&completed=false`, 400, { token: aliceToken });
  await request(`${tasksPath}?before=invalid`, 400, { token: aliceToken });
  assert.deepEqual((await request("/api/me/stats", 200, { token: aliceToken })).json, {
    total: 2, completed: 1, pending: 1,
  });

  const patched = await request(firstPath, 200, {
    token: aliceToken, method: "PATCH", body: { completed: true },
  });
  assert.equal(patched.json.completed, true);
  await request(firstPath, 204, { token: aliceToken, method: "DELETE" });
  await request(firstPath, 404, { token: aliceToken });

  await request("/api/auth/logout", 204, { token: aliceToken, method: "POST" });
  await request(tasksPath, 401, { token: aliceToken });
  const bobUser = await db.collection("users").findOne({ email: bobAccount.json.email });
  const session = await db.collection("sessions").findOne({ userId: bobUser._id });
  assert.match(session._id, /^[a-f0-9]{64}$/);
  await db.collection("sessions").updateOne({ _id: session._id }, { $set: { expiresAt: new Date() } });
  await request(tasksPath, 401, { token: bobToken });
});
