import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { connectToDatabase } from "../src/db.js";
import { createWorkspace } from "../src/workspace.js";

const testUri = process.env.MONGODB_TEST_URI;

test("shared projects enforce owner, member, and outsider permissions", {
  skip: testUri ? false : "Set MONGODB_TEST_URI to test shared projects.",
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

  const workspace = await createWorkspace(db);
  const server = createApp(db.collection("tasks"), { workspace }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, status, { token, method = "GET", body } = {}) {
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(base + path, { method, headers, body: JSON.stringify(body) });
    assert.equal(response.status, status, `${method} ${path}`);
    return {
      json: status === 204 ? undefined : await response.json(),
      location: response.headers.get("location"),
    };
  }

  async function register(email) {
    const body = { email, password: "a tutorial passphrase" };
    const account = await request("/api/auth/register", 201, { method: "POST", body });
    const session = await request("/api/auth/login", 200, { method: "POST", body });
    return { id: account.json._id, token: session.json.token };
  }

  const owner = await register("project-owner@example.test");
  const member = await register("project-member@example.test");
  const outsider = await register("project-outsider@example.test");
  const projectsPath = "/api/projects";
  const created = await request(projectsPath, 201, {
    token: owner.token, method: "POST", body: { name: "  Release plan  " },
  });
  const project = created.json;
  const projectPath = `${projectsPath}/${project._id}`;
  const tasksPath = `${projectPath}/tasks`;
  assert.equal(created.location, projectPath);
  assert.equal(project.name, "Release plan");
  assert.equal(project.ownerId, owner.id);
  assert.deepEqual(project.memberIds, [owner.id]);

  await request(projectsPath, 401);
  await request(projectPath, 404, { token: member.token });
  const addMember = () => request(`${projectPath}/members/${member.id}`, 200, {
    token: owner.token, method: "PUT",
  });
  await addMember();

  const task = await request(tasksPath, 201, {
    token: owner.token, method: "POST", body: { title: "Write release notes" },
  });
  const taskPath = `${tasksPath}/${task.json._id}`;
  assert.equal(task.location, taskPath);
  assert.equal(task.json.projectId, project._id);

  await t.test("owners can manage membership and delete project tasks", async () => {
    const additions = await Promise.all([addMember(), addMember()]);
    for (const result of additions) {
      assert.deepEqual(result.json.memberIds, [owner.id, member.id]);
    }
    await request(`${projectPath}/members/000000000000000000000000`, 404, {
      token: owner.token, method: "PUT",
    });
    const projects = await request(projectsPath, 200, { token: owner.token });
    assert.deepEqual(projects.json.map((item) => item._id), [project._id]);

    const disposable = await request(tasksPath, 201, {
      token: member.token, method: "POST", body: { title: "Temporary draft" },
    });
    await request(disposable.location, 204, { token: owner.token, method: "DELETE" });
    await request(disposable.location, 404, { token: member.token });
  });

  await t.test("members can create, assign, and complete tasks within their project", async () => {
    const projects = await request(projectsPath, 200, { token: member.token });
    assert.deepEqual(projects.json.map((item) => item._id), [project._id]);
    const details = await request(projectPath, 200, { token: member.token });
    assert.deepEqual(details.json.memberIds, [owner.id, member.id]);

    const second = await request(tasksPath, 201, {
      token: member.token, method: "POST", body: { title: "Update screenshots" },
    });
    const page = await request(`${tasksPath}?limit=1`, 200, { token: member.token });
    assert.equal(page.json.nextCursor, second.json._id);
    const remaining = await request(`${tasksPath}?limit=1&before=${page.json.nextCursor}`, 200, {
      token: member.token,
    });
    assert.deepEqual(remaining.json.items.map((item) => item._id), [task.json._id]);

    const assigned = await request(`${taskPath}/assignee`, 200, {
      token: member.token, method: "PUT", body: { assigneeId: member.id },
    });
    assert.equal(assigned.json.assigneeId, member.id);
    await request(`${taskPath}/assignee`, 400, {
      token: member.token, method: "PUT", body: { assigneeId: outsider.id },
    });
    await request(`${taskPath}/assignee`, 400, {
      token: member.token, method: "PUT", body: {},
    });
    const completed = await request(taskPath, 200, {
      token: member.token, method: "PATCH", body: { completed: true },
    });
    assert.equal(completed.json.completed, true);
    assert.equal(completed.json.assigneeId, member.id);
    const filtered = await request(`${tasksPath}?completed=true`, 200, { token: owner.token });
    assert.deepEqual(filtered.json.items.map((item) => item._id), [task.json._id]);
    const cleared = await request(`${taskPath}/assignee`, 200, {
      token: owner.token, method: "PUT", body: { assigneeId: null },
    });
    assert.equal(Object.hasOwn(cleared.json, "assigneeId"), false);
    assert.equal(cleared.json.completed, true);

    await request(`${projectPath}/members/${outsider.id}`, 403, {
      token: member.token, method: "PUT",
    });
    await request(second.location, 403, { token: member.token, method: "DELETE" });
  });

  await t.test("outsiders cannot see or change projects they do not belong to", async () => {
    const other = await request(projectsPath, 201, {
      token: outsider.token, method: "POST", body: { name: "Other project" },
    });
    const projects = await request(projectsPath, 200, { token: outsider.token });
    assert.deepEqual(projects.json.map((item) => item._id), [other.json._id]);
    const checks = [
      [projectPath, "GET"],
      [tasksPath, "GET"],
      [tasksPath, "POST", { title: "Outsider task" }],
      [taskPath, "GET"],
      [taskPath, "PATCH", { completed: false }],
      [taskPath, "DELETE"],
      [`${taskPath}/assignee`, "PUT", { assigneeId: outsider.id }],
      [`${projectPath}/members/${outsider.id}`, "PUT"],
    ];
    for (const [path, method, body] of checks) {
      const result = await request(path, 404, { token: outsider.token, method, body });
      assert.deepEqual(result.json, { error: "Project not found." });
    }

    const wrongPath = `${other.location}/tasks/${task.json._id}`;
    const wrongProject = await request(wrongPath, 404, { token: outsider.token });
    assert.deepEqual(wrongProject.json, { error: "Task not found." });
    await request(`${wrongPath}/assignee`, 404, {
      token: outsider.token, method: "PUT", body: { assigneeId: outsider.id },
    });
    const original = await request(taskPath, 200, { token: owner.token });
    assert.equal(original.json.title, "Write release notes");
  });
});
