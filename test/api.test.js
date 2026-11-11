import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { connectToDatabase } from "../src/db.js";

async function startApp(t, tasks) {
  const server = createApp(tasks).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("health and unknown routes return JSON", async (t) => {
  const base = await startApp(t);
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const missing = await fetch(`${base}/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Route not found." });
});

test("invalid IDs and bodies are rejected before accessing MongoDB", async (t) => {
  const base = await startApp(t);
  const validId = "507f1f77bcf86cd799439011";
  const cases = [
    ["GET", "/invalid-id", undefined, 400, "Task ID must be 24 hexadecimal characters."],
    ["POST", "", '{"title":', 400, "Malformed JSON."],
    ["POST", "", "[]", 400, "Body must be a JSON object."],
    ["POST", "", "{}", 400, "Title must be a string of 1 to 120 characters."],
    ["POST", "", '{"title":" "}', 400, "Title must be a string of 1 to 120 characters."],
    ["POST", "", '{"title":"Test","completed":"false"}', 400, "Completed must be a boolean."],
    ["POST", "", '{"title":"Test","extra":true}', 400, "Only title and completed are allowed."],
    ["PATCH", `/${validId}`, "{}", 400, "Supply at least one field to update."],
    ["POST", "", JSON.stringify({ title: "a".repeat(17000) }), 413, "Request body exceeds 16 KB."],
  ];

  for (const [method, path, body, status, message] of cases) {
    const response = await fetch(`${base}/api/tasks${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: message });
  }
});

test("unexpected database failures return a generic JSON error", async (t) => {
  const tasks = {
    find() {
      throw new Error("Private database details");
    },
  };
  const base = await startApp(t, tasks);
  const response = await fetch(`${base}/api/tasks`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Internal server error." });
});

const testUri = process.env.MONGODB_TEST_URI;

test("CRUD writes and reads tasks in a disposable MongoDB database", {
  skip: testUri ? false : "Set MONGODB_TEST_URI to run the MongoDB integration test.",
}, async (t) => {
  const databaseName = `task_tracker_test_${randomUUID().replaceAll("-", "")}`;
  const { client, db } = await connectToDatabase(testUri, databaseName);
  t.after(async () => {
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });

  const base = await startApp(t, db.collection("tasks"));
  const url = `${base}/api/tasks`;
  const headers = { "Content-Type": "application/json" };

  const create = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "  Learn MongoDB  " }),
  });
  assert.equal(create.status, 201);
  const task = await create.json();
  const taskUrl = `${url}/${task._id}`;
  assert.equal(create.headers.get("location"), `/api/tasks/${task._id}`);
  assert.match(task._id, /^[0-9a-f]{24}$/);
  assert.equal(task.title, "Learn MongoDB");
  assert.equal(task.completed, false);
  assert.ok(Number.isFinite(Date.parse(task.createdAt)));
  assert.equal(task.updatedAt, task.createdAt);

  const list = await fetch(url);
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [task]);

  const read = await fetch(taskUrl);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), task);

  const patch = await fetch(taskUrl, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ completed: true }),
  });
  assert.equal(patch.status, 200);
  const updated = await patch.json();
  assert.equal(updated.completed, true);
  assert.equal(updated.title, task.title);
  assert.equal(updated.createdAt, task.createdAt);
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(task.updatedAt));

  const remove = await fetch(taskUrl, { method: "DELETE" });
  assert.equal(remove.status, 204);
  assert.equal(await remove.text(), "");

  const missing = await fetch(taskUrl);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Task not found." });
});
