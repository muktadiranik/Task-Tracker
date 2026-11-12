import { fileURLToPath } from "node:url";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { errorHandler, HttpError } from "./errors.js";
import { createTaskRouter } from "./tasks.js";

const frontendPath = fileURLToPath(new URL("../client/dist/", import.meta.url));
const openapiPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));
const swaggerOptions = {
  customSiteTitle: "Task Tracker API",
  swaggerOptions: { url: "/api-docs/openapi.yaml", validatorUrl: null },
};

export function createApp(tasks, { workspace, checkDatabase } = {}) {
  const app = express();

  app.get("/api-docs/openapi.yaml", (_req, res) => {
    res.type("application/yaml").sendFile(openapiPath);
  });
  app.use("/api-docs", swaggerUi.serveFiles(null, swaggerOptions), swaggerUi.setup(null, swaggerOptions));

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

  app.use(express.static(frontendPath));

  app.use(() => {
    throw new HttpError(404, "Route not found.");
  });
  app.use(errorHandler);

  return app;
}
