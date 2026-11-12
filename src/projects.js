import { Router } from "express";
import { HttpError } from "./errors.js";
import { presentProjectTask, readChoice, readText, validateProjectTaskBody } from "./project-task-fields.js";
import { listProjectTaskPage, projectTaskStats } from "./project-task-queries.js";
import { createTaskCollaborationRouter } from "./task-collaboration.js";
import { createTaskRouter, parseObjectId } from "./tasks.js";

function requireProjectOwner(_req, res, next) {
  if (!res.locals.project.ownerId.equals(res.locals.session.userId)) {
    throw new HttpError(403, "Only the project owner can do that.");
  }
  next();
}

function projectSettings(body, creating = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Body must be a JSON object.");
  }
  const changes = {};
  if (creating || body.name !== undefined) changes.name = readText(body.name, "Name", 120);
  if (body.description !== undefined) {
    changes.description = readText(body.description, "Description", 2000, 0);
  }
  if (!creating && body.archived !== undefined) {
    if (typeof body.archived !== "boolean") throw new HttpError(400, "Archived must be a boolean.");
    changes.archived = body.archived;
  }
  if (Object.keys(changes).length === 0) {
    throw new HttpError(400, "Supply a name, description, or archived value.");
  }
  return changes;
}

export function createProjectsRouter({ projects, tasks, users }) {
  const router = Router();
  const projectRoutes = Router();

  router.post("/", async (req, res) => {
    const settings = projectSettings(req.body, true);
    const ownerId = res.locals.session.userId;
    const project = { ...settings, ownerId, memberIds: [ownerId], archived: false, createdAt: new Date() };
    const { insertedId } = await projects.insertOne(project);
    res.location(`/api/projects/${insertedId.toHexString()}`);
    res.status(201).json({ ...project, _id: insertedId });
  });

  router.get("/", async (req, res) => {
    const { archived = "false" } = req.query;
    readChoice(archived, ["true", "false"], "Archived");
    const list = await projects.find({
      memberIds: res.locals.session.userId,
      archived: archived === "true" ? true : { $ne: true },
    }).sort({ _id: -1 }).toArray();
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

  projectRoutes.get("/stats", async (_req, res) => {
    res.json(await projectTaskStats(tasks, res.locals.project._id));
  });

  projectRoutes.patch("/", requireProjectOwner, async (req, res) => {
    const changes = projectSettings(req.body);
    const project = await projects.findOneAndUpdate(
      { _id: res.locals.project._id, ownerId: res.locals.session.userId },
      { $set: changes, $currentDate: { updatedAt: true } },
      { returnDocument: "after" },
    );
    if (!project) throw new HttpError(404, "Project not found.");
    res.json(project);
  });

  projectRoutes.use((req, res, next) => {
    if (res.locals.project.archived && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      throw new HttpError(409, "Restore the project before making changes.");
    }
    next();
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

  projectRoutes.delete("/members/:userId", requireProjectOwner, async (req, res) => {
    const memberId = parseObjectId(req.params.userId, "User ID");
    const { _id, ownerId } = res.locals.project;
    if (ownerId.equals(memberId)) {
      throw new HttpError(409, "The project owner must remain a member.");
    }
    await projects.updateOne({ _id, ownerId }, { $pull: { memberIds: memberId } });
    res.status(204).end();
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
    res.json(presentProjectTask(task));
  });

  projectRoutes.use("/tasks/:taskId", createTaskCollaborationRouter(tasks));
  projectRoutes.use("/tasks", createTaskRouter(tasks, {
    basePath: (res) => `/api/projects/${res.locals.project._id.toHexString()}/tasks`,
    taskFilter: (res) => ({ projectId: res.locals.project._id }),
    listTasks: listProjectTaskPage,
    authorizeDelete: requireProjectOwner,
    validateBody: validateProjectTaskBody,
    presentTask: presentProjectTask,
  }));

  return router;
}
