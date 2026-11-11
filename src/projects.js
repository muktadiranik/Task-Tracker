import { Router } from "express";
import { HttpError } from "./errors.js";
import { listTaskPage } from "./task-queries.js";
import { createTaskRouter, parseObjectId } from "./tasks.js";

function requireProjectOwner(_req, res, next) {
  if (!res.locals.project.ownerId.equals(res.locals.session.userId)) {
    throw new HttpError(403, "Only the project owner can do that.");
  }
  next();
}

export function createProjectsRouter({ projects, tasks, users }) {
  const router = Router();
  const projectRoutes = Router();

  router.post("/", async (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 120) {
      throw new HttpError(400, "Name must be a string of 1 to 120 characters.");
    }

    const ownerId = res.locals.session.userId;
    const project = { name, ownerId, memberIds: [ownerId], createdAt: new Date() };
    const { insertedId } = await projects.insertOne(project);
    res.location(`/api/projects/${insertedId.toHexString()}`);
    res.status(201).json({ ...project, _id: insertedId });
  });

  router.get("/", async (_req, res) => {
    const list = await projects.find({ memberIds: res.locals.session.userId })
      .sort({ _id: -1 }).toArray();
    res.json(list);
  });

  router.use("/:projectId", async (req, res, next) => {
    const _id = parseObjectId(req.params.projectId, "Project ID");
    const project = await projects.findOne({ _id, memberIds: res.locals.session.userId });
    if (!project) {
      throw new HttpError(404, "Project not found.");
    }
    res.locals.project = project;
    next();
  }, projectRoutes);

  projectRoutes.get("/", (_req, res) => {
    res.json(res.locals.project);
  });

  projectRoutes.put("/members/:userId", requireProjectOwner, async (req, res) => {
    const memberId = parseObjectId(req.params.userId, "User ID");
    const account = await users.findOne({ _id: memberId }, { projection: { _id: 1 } });
    if (!account) {
      throw new HttpError(404, "Account not found.");
    }

    const project = await projects.findOneAndUpdate(
      { _id: res.locals.project._id, ownerId: res.locals.session.userId },
      { $addToSet: { memberIds: memberId } },
      { returnDocument: "after" },
    );
    if (!project) {
      throw new HttpError(404, "Project not found.");
    }
    res.json(project);
  });

  projectRoutes.put("/tasks/:id/assignee", async (req, res) => {
    const _id = parseObjectId(req.params.id, "Task ID");
    const project = res.locals.project;
    const assigneeId = req.body?.assigneeId === null
      ? null
      : parseObjectId(req.body?.assigneeId, "Assignee ID");

    if (assigneeId && !project.memberIds.some((memberId) => memberId.equals(assigneeId))) {
      throw new HttpError(400, "Assignee must belong to this project.");
    }

    const assignment = assigneeId ? { $set: { assigneeId } } : { $unset: { assigneeId: "" } };
    const task = await tasks.findOneAndUpdate(
      { _id, projectId: project._id },
      { ...assignment, $currentDate: { updatedAt: true } },
      { returnDocument: "after" },
    );
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.json(task);
  });

  projectRoutes.use("/tasks", createTaskRouter(tasks, {
    basePath: (res) => `/api/projects/${res.locals.project._id.toHexString()}/tasks`,
    taskFilter: (res) => ({ projectId: res.locals.project._id }),
    listTasks: listTaskPage,
    authorizeDelete: requireProjectOwner,
  }));

  return router;
}
