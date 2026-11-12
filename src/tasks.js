import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";
import { validateTaskBody } from "./task-input.js";

export function parseObjectId(value, label) {
  if (typeof value !== "string" || !ObjectId.isValid(value)) {
    throw new HttpError(400, `${label} must be 24 hexadecimal characters.`);
  }
  return new ObjectId(value);
}

async function listTutorialTasks(tasks) {
  return tasks.find({}).sort({ createdAt: -1, _id: -1 }).toArray();
}

export function createTaskRouter(tasks, {
  basePath = () => "/api/tasks",
  taskFilter = () => ({}),
  listTasks = listTutorialTasks,
  authorizeDelete = (_req, _res, next) => next(),
  validateBody = validateTaskBody,
  presentTask = (task) => task,
} = {}) {
  const router = Router();

  router.post("/", async (req, res) => {
    const input = validateBody(req.body, { requireTitle: true });
    const now = new Date();
    const task = {
      ...taskFilter(res),
      completed: false,
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await tasks.insertOne(task);
    res.location(`${basePath(res)}/${insertedId.toHexString()}`);
    res.status(201).json(presentTask({ ...task, _id: insertedId }));
  });

  router.get("/", async (req, res) => {
    res.status(200).json(await listTasks(tasks, req.query, taskFilter(res)));
  });

  router.get("/:id", async (req, res) => {
    const _id = parseObjectId(req.params.id, "Task ID");
    const task = await tasks.findOne({ _id, ...taskFilter(res) });
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(200).json(presentTask(task));
  });

  router.patch("/:id", async (req, res) => {
    const _id = parseObjectId(req.params.id, "Task ID");
    const changes = validateBody(req.body);
    const task = await tasks.findOneAndUpdate(
      { _id, ...taskFilter(res) },
      { $set: changes, $currentDate: { updatedAt: true } },
      { returnDocument: "after" },
    );
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(200).json(presentTask(task));
  });

  router.delete("/:id", authorizeDelete, async (req, res) => {
    const _id = parseObjectId(req.params.id, "Task ID");
    const { deletedCount } = await tasks.deleteOne({ _id, ...taskFilter(res) });
    if (deletedCount === 0) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(204).end();
  });

  return router;
}
