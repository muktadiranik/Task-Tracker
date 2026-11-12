import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { createApp } from "../src/app.js";
import { connectToDatabase } from "../src/db.js";
import { createWorkspace } from "../src/workspace.js";

const uri = process.env.MONGODB_TEST_URI;

test("project task management", {
  skip: uri ? false : "Set MONGODB_TEST_URI to test project task management.",
}, async (t) => {
  const name = `task_tracker_test_${randomUUID().replaceAll("-", "")}`;
  const { client, db } = await connectToDatabase(uri, name);
  t.after(async () => {
    try {
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });
  const workspace = await createWorkspace(db);
  const server = createApp(db.collection("tasks"), { workspace }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function send(method, path, token, body) {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(base + path, { method, headers, body: JSON.stringify(body) });
    const json = response.status === 204 ? undefined : await response.json();
    return { status: response.status, json };
  }

  async function request(method, path, token, status, body) {
    const result = await send(method, path, token, body);
    assert.equal(result.status, status, `${method} ${path}: ${JSON.stringify(result.json)}`);
    return result.json;
  }

  async function account(email) {
    const body = { email, password: "a tutorial passphrase" };
    const { _id: id } = await request("POST", "/api/auth/register", undefined, 201, body);
    const { token } = await request("POST", "/api/auth/login", undefined, 200, body);
    return { id, token };
  }

  const [owner, member, outsider] = await Promise.all([
    account("workflow-owner@example.test"),
    account("workflow-member@example.test"),
    account("workflow-outsider@example.test"),
  ]);
  const project = await request("POST", "/api/projects", owner.token, 201, {
    name: "Release", description: "Ship the next version",
  });
  const projectPath = `/api/projects/${project._id}`;
  const tasksPath = `${projectPath}/tasks`;
  await request("PUT", `${projectPath}/members/${member.id}`, owner.token, 200);
  const task = await request("POST", tasksPath, member.token, 201, {
    title: "C++ (release)",
    description: "Check the production build",
    dueOn: "2000-02-29",
    priority: "high",
    status: "in_progress",
    labels: [" Release ", "release", "qa"],
  });
  const taskPath = `${tasksPath}/${task._id}`;
  assert.deepEqual(task.labels, ["release", "qa"]);
  assert.equal(task.completed, false);

  await t.test("task fields, search, filters, sorting, and stats include legacy tasks", async () => {
    const account = await request("GET", "/api/me", member.token, 200);
    assert.deepEqual(account, { _id: member.id, email: "workflow-member@example.test" });
    await request("GET", "/api/me/project-tasks", undefined, 401);
    await request("PATCH", taskPath, member.token, 400, { dueOn: "2025-02-29" });
    await request("PATCH", taskPath, member.token, 400, { status: "done", completed: false });
    await request("PATCH", taskPath, member.token, 400, { priority: "important" });
    await request("PATCH", taskPath, member.token, 400, { labels: [" "] });
    await request("GET", `${tasksPath}?sort=random`, owner.token, 400);

    const legacy = await db.collection("project_tasks").insertOne({
      title: "Old task", completed: true, projectId: new ObjectId(project._id),
    });
    const legacyId = legacy.insertedId.toHexString();
    const assigned = await request("PUT", `${taskPath}/assignee`, owner.token, 200, {
      assigneeId: member.id,
    });
    assert.equal(assigned.assigneeId, member.id);
    const work = await request("GET", "/api/me/project-tasks", member.token, 200);
    assert.deepEqual(work.items.map((item) => item._id), [task._id]);
    const otherWork = await request("GET", `/api/me/project-tasks?assigneeId=${member.id}`, owner.token, 200);
    assert.deepEqual(otherWork.items, []);
    const filtered = await request(
      "GET",
      `${tasksPath}?q=C%2B%2B%20%28release%29&label=QA&status=in_progress&priority=high&overdue=true&dueBefore=2001-01-01&assigneeId=${member.id}`,
      owner.token,
      200,
    );
    assert.deepEqual(filtered.items.map((item) => item._id), [task._id]);
    const description = await request("GET", `${tasksPath}?q=PRODUCTION`, owner.token, 200);
    assert.deepEqual(description.items.map((item) => item._id), [task._id]);
    const literal = await request("GET", `${tasksPath}?q=.*`, owner.token, 200);
    assert.deepEqual(literal.items, []);
    const done = await request("GET", `${tasksPath}?status=done&priority=medium&assigneeId=unassigned&overdue=false`, owner.token, 200);
    assert.deepEqual(done.items.map((item) => [item._id, item.status, item.priority]), [
      [legacyId, "done", "medium"],
    ]);

    const page = await request("GET", `${tasksPath}?sort=oldest&limit=1`, owner.token, 200);
    const next = await request("GET", `${tasksPath}?sort=oldest&limit=1&before=${page.nextCursor}`, owner.token, 200);
    assert.deepEqual([...page.items, ...next.items].map((item) => item._id), [task._id, legacyId].sort());
    assert.equal(next.nextCursor, null);

    const stats = await request("GET", `${projectPath}/stats`, member.token, 200);
    assert.deepEqual(stats, {
      total: 2, completed: 1, overdue: 1, byStatus: { todo: 0, in_progress: 1, blocked: 0, done: 1 },
    });
    await request("GET", `${projectPath}/stats`, outsider.token, 404);
    const completed = await request("PATCH", taskPath, member.token, 200, { status: "done" });
    assert.equal(completed.completed, true);
    const reopened = await request("PATCH", taskPath, member.token, 200, { completed: false });
    assert.equal(reopened.status, "todo");
  });

  await t.test("comments and checklists preserve concurrent writes and enforce comment permissions", async () => {
    const commentsPath = `${taskPath}/comments`;
    const [comment, ownerComment] = await Promise.all([
      request("POST", commentsPath, member.token, 201, { text: "Ready for review" }),
      request("POST", commentsPath, owner.token, 201, { text: "Thanks" }),
    ]);
    const path = `${commentsPath}/${comment._id}`;
    await request("PATCH", path, owner.token, 403, { text: "Changed by owner" });
    await request("DELETE", `${commentsPath}/${ownerComment._id}`, member.token, 403);
    await request("POST", commentsPath, outsider.token, 404, { text: "Outsider" });
    const edited = await request("PATCH", path, member.token, 200, { text: "Reviewed" });
    assert.equal(edited.text, "Reviewed");
    assert.equal(edited.authorId, member.id);

    const checklistPath = `${taskPath}/checklist`;
    const item = await request("POST", checklistPath, member.token, 201, { title: "Run tests" });
    const itemPath = `${checklistPath}/${item._id}`;
    const checked = await request("PATCH", itemPath, owner.token, 200, {
      title: "Run integration tests", completed: true,
    });
    assert.deepEqual(checked, { _id: item._id, title: "Run integration tests", completed: true });
    const details = await request("GET", taskPath, owner.token, 200);
    assert.deepEqual(details.comments.map((entry) => entry._id).sort(), [comment._id, ownerComment._id].sort());
    assert.deepEqual(details.checklist, [checked]);
    const list = await request("GET", `${tasksPath}?q=C%2B%2B`, owner.token, 200);
    assert.equal(Object.hasOwn(list.items[0], "comments"), false);
    assert.equal(Object.hasOwn(list.items[0], "checklist"), false);
    await request("DELETE", path, owner.token, 204);
    await request("DELETE", itemPath, member.token, 204);
    await request("PATCH", itemPath, member.token, 404, { completed: false });
    await request("PATCH", path, member.token, 404, { text: "Deleted" });

    await db.collection("project_tasks").updateOne({ _id: new ObjectId(task._id) }, {
      $set: {
        checklist: Array.from({ length: 49 }, (_, index) => ({
          _id: new ObjectId(), title: `Item ${index}`, completed: false,
        })),
      },
    });
    const writes = await Promise.all([
      send("POST", checklistPath, member.token, { title: "One" }),
      send("POST", checklistPath, owner.token, { title: "Two" }),
    ]);
    assert.deepEqual(writes.map((result) => result.status).sort(), [201, 409]);
    const capped = await request("GET", taskPath, owner.token, 200);
    assert.equal(capped.checklist.length, 50);
  });

  await t.test("owners can archive and restore a project and revoke a member's access", async () => {
    await request("PATCH", projectPath, member.token, 403, { archived: true });
    const archived = await request("PATCH", projectPath, owner.token, 200, {
      archived: true, name: "Release archive",
    });
    assert.equal(archived.name, "Release archive");
    assert.equal(archived.archived, true);
    assert.deepEqual(await request("GET", "/api/projects", owner.token, 200), []);
    const archivedProjects = await request("GET", "/api/projects?archived=true", member.token, 200);
    assert.deepEqual(archivedProjects.map((item) => item._id), [project._id]);
    const archivedWork = await request("GET", "/api/me/project-tasks", member.token, 200);
    assert.deepEqual(archivedWork.items, []);
    await request("GET", taskPath, member.token, 200);
    await request("POST", tasksPath, member.token, 409, { title: "Archived" });
    await request("POST", `${taskPath}/comments`, member.token, 409, { text: "Archived" });
    await request("DELETE", taskPath, owner.token, 409);

    await request("PATCH", projectPath, owner.token, 200, { archived: false });
    await request("PATCH", taskPath, member.token, 200, { status: "blocked" });
    await request("DELETE", `${projectPath}/members/${owner.id}`, owner.token, 409);
    await request("DELETE", `${projectPath}/members/${owner.id}`, member.token, 403);
    await request("DELETE", `${projectPath}/members/${member.id}`, owner.token, 204);
    await request("DELETE", `${projectPath}/members/${member.id}`, owner.token, 204);
    await request("GET", taskPath, member.token, 404);
    const formerWork = await request("GET", "/api/me/project-tasks", member.token, 200);
    assert.deepEqual(formerWork.items, []);
    await request("PUT", `${taskPath}/assignee`, owner.token, 400, { assigneeId: member.id });
    const historical = await request("GET", taskPath, owner.token, 200);
    assert.equal(historical.assigneeId, member.id);
    const reassigned = await request("PUT", `${taskPath}/assignee`, owner.token, 200, {
      assigneeId: owner.id,
    });
    assert.equal(reassigned.assigneeId, owner.id);
  });
});
