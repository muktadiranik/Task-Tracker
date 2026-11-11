import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";
import { validateTaskBody } from "./task-input.js";

function taskIdFrom(pathId) {
  if (!ObjectId.isValid(pathId)) {
    throw new HttpError(400, "Task ID must be 24 hexadecimal characters.");
  }
  return new ObjectId(pathId);
}

async function listTutorialTasks(tasks) {
  return tasks.find({}).sort({ createdAt: -1, _id: -1 }).toArray();
}

export function createTaskRouter(tasks, {
  basePath = "/api/tasks",
  taskFilter = () => ({}),
  listTasks = listTutorialTasks,
} = {}) {
  const router = Router();

  router.post("/", async (req, res) => {
    const input = validateTaskBody(req.body, { requireTitle: true });
    const now = new Date();
    const task = {
      ...taskFilter(res),
      title: input.title,
      completed: input.completed ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await tasks.insertOne(task);
    res.location(`${basePath}/${insertedId.toHexString()}`);
    res.status(201).json({ ...task, _id: insertedId });
  });

  router.get("/", async (req, res) => {
    res.status(200).json(await listTasks(tasks, req.query, taskFilter(res)));
  });

  router.get("/:id", async (req, res) => {
    const _id = taskIdFrom(req.params.id);
    const task = await tasks.findOne({ _id, ...taskFilter(res) });
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(200).json(task);
  });

  router.patch("/:id", async (req, res) => {
    const _id = taskIdFrom(req.params.id);
    const changes = validateTaskBody(req.body);
    const task = await tasks.findOneAndUpdate(
      { _id, ...taskFilter(res) },
      { $set: changes, $currentDate: { updatedAt: true } },
      { returnDocument: "after" },
    );
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(200).json(task);
  });

  router.delete("/:id", async (req, res) => {
    const _id = taskIdFrom(req.params.id);
    const { deletedCount } = await tasks.deleteOne({ _id, ...taskFilter(res) });
    if (deletedCount === 0) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(204).end();
  });

  return router;
}
