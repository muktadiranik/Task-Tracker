import express from "express";
import { errorHandler, HttpError } from "./errors.js";
import { createTaskRouter } from "./tasks.js";

export function createApp(tasks, { workspace, checkDatabase } = {}) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  if (checkDatabase) {
    app.get("/ready", async (_req, res) => {
      res.set("Cache-Control", "no-store");
      try {
        await checkDatabase();
      } catch {
        throw new HttpError(503, "Database unavailable.");
      }
      res.status(200).json({ status: "ready" });
    });
  }

  app.use(express.json({ limit: "16kb", strict: false }));
  app.use("/api/tasks", createTaskRouter(tasks));
  if (workspace) {
    app.use("/api", workspace);
  }

  app.use(() => {
    throw new HttpError(404, "Route not found.");
  });
  app.use(errorHandler);

  return app;
}
