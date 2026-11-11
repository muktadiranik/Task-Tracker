import { Router } from "express";
import { createAuth } from "./auth.js";
import { createProjectsRouter } from "./projects.js";
import { listTaskPage, taskStats } from "./task-queries.js";
import { createTaskRouter } from "./tasks.js";

export async function createWorkspace(db) {
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const tasks = db.collection("private_tasks");
  const projects = db.collection("projects");
  const projectTasks = db.collection("project_tasks");

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    tasks.createIndexes([
      { key: { ownerId: 1, _id: -1 } },
      { key: { ownerId: 1, completed: 1, _id: -1 } },
    ]),
    projects.createIndex({ memberIds: 1, _id: -1 }),
    projectTasks.createIndexes([
      { key: { projectId: 1, _id: -1 } },
      { key: { projectId: 1, completed: 1, _id: -1 } },
    ]),
  ]);

  const auth = createAuth(users, sessions);
  const router = Router();
  const privateRoutes = Router();

  router.use(["/auth", "/me", "/projects"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/auth", auth.router);
  router.use("/me", auth.requireSession, privateRoutes);
  router.use("/projects", auth.requireSession, createProjectsRouter({
    projects,
    tasks: projectTasks,
    users,
  }));

  privateRoutes.get("/stats", async (_req, res) => {
    res.json(await taskStats(tasks, res.locals.session.userId));
  });
  privateRoutes.use("/tasks", createTaskRouter(tasks, {
    basePath: () => "/api/me/tasks",
    taskFilter: (res) => ({ ownerId: res.locals.session.userId }),
    listTasks: listTaskPage,
  }));

  return router;
}
