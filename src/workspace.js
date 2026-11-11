import { Router } from "express";
import { createAuth } from "./auth.js";
import { listPrivateTasks, taskStats } from "./task-queries.js";
import { createTaskRouter } from "./tasks.js";

export async function createWorkspace(db) {
  const users = db.collection("users");
  const sessions = db.collection("sessions");
  const tasks = db.collection("private_tasks");

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    tasks.createIndexes([
      { key: { ownerId: 1, _id: -1 } },
      { key: { ownerId: 1, completed: 1, _id: -1 } },
    ]),
  ]);

  const auth = createAuth(users, sessions);
  const router = Router();
  const privateRoutes = Router();

  router.use(["/auth", "/me"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/auth", auth.router);
  router.use("/me", auth.requireSession, privateRoutes);

  privateRoutes.get("/stats", async (_req, res) => {
    res.json(await taskStats(tasks, res.locals.session.userId));
  });
  privateRoutes.use("/tasks", createTaskRouter(tasks, {
    basePath: "/api/me/tasks",
    taskFilter: (res) => ({ ownerId: res.locals.session.userId }),
    listTasks: listPrivateTasks,
  }));

  return router;
}
