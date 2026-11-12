import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";
import { readText } from "./project-task-fields.js";
import { validateTaskBody } from "./task-input.js";
import { parseObjectId } from "./tasks.js";

function taskScope(req, res) {
  return {
    _id: parseObjectId(req.params.taskId, "Task ID"),
    projectId: res.locals.project._id,
  };
}

async function appendItem(tasks, scope, field, item, limit) {
  const result = await tasks.updateOne(
    { ...scope, [`${field}.${limit - 1}`]: { $exists: false } },
    { $push: { [field]: item }, $currentDate: { updatedAt: true } },
  );
  if (result.matchedCount === 0) {
    const task = await tasks.findOne(scope, { projection: { _id: 1 } });
    if (!task) throw new HttpError(404, "Task not found.");
    throw new HttpError(409, `This task already has ${limit} ${field === "comments" ? "comments" : "checklist items"}.`);
  }
}

async function rejectCommentChange(tasks, scope, commentId) {
  const task = await tasks.findOne(
    { ...scope, "comments._id": commentId },
    { projection: { _id: 1 } },
  );
  if (!task) throw new HttpError(404, "Comment not found.");
  throw new HttpError(403, "You do not have permission to change this comment.");
}

export function createTaskCollaborationRouter(tasks) {
  const router = Router({ mergeParams: true });

  router.post("/comments", async (req, res) => {
    const scope = taskScope(req, res);
    const comment = {
      _id: new ObjectId(),
      text: readText(req.body?.text, "Comment", 1000),
      authorId: res.locals.session.userId,
      createdAt: new Date(),
    };
    await appendItem(tasks, scope, "comments", comment, 100);
    res.status(201).json(comment);
  });

  router.patch("/comments/:commentId", async (req, res) => {
    const scope = taskScope(req, res);
    const _id = parseObjectId(req.params.commentId, "Comment ID");
    const authorId = res.locals.session.userId;
    const text = readText(req.body?.text, "Comment", 1000);
    const task = await tasks.findOneAndUpdate(
      { ...scope, comments: { $elemMatch: { _id, authorId } } },
      {
        $set: { "comments.$.text": text },
        $currentDate: { "comments.$.updatedAt": true, updatedAt: true },
      },
      { returnDocument: "after" },
    );
    if (!task) await rejectCommentChange(tasks, scope, _id);
    res.json(task.comments.find((comment) => comment._id.equals(_id)));
  });

  router.delete("/comments/:commentId", async (req, res) => {
    const scope = taskScope(req, res);
    const _id = parseObjectId(req.params.commentId, "Comment ID");
    const authorId = res.locals.session.userId;
    const comment = res.locals.project.ownerId.equals(authorId) ? { _id } : { _id, authorId };
    const result = await tasks.updateOne(
      { ...scope, comments: { $elemMatch: comment } },
      { $pull: { comments: comment }, $currentDate: { updatedAt: true } },
    );
    if (result.matchedCount === 0) await rejectCommentChange(tasks, scope, _id);
    res.status(204).end();
  });

  router.post("/checklist", async (req, res) => {
    const scope = taskScope(req, res);
    const input = validateTaskBody(req.body, { requireTitle: true });
    const item = { _id: new ObjectId(), completed: false, ...input };
    await appendItem(tasks, scope, "checklist", item, 50);
    res.status(201).json(item);
  });

  router.patch("/checklist/:itemId", async (req, res) => {
    const scope = taskScope(req, res);
    const _id = parseObjectId(req.params.itemId, "Checklist item ID");
    const input = validateTaskBody(req.body);
    const changes = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [`checklist.$.${key}`, value]),
    );
    const task = await tasks.findOneAndUpdate(
      { ...scope, "checklist._id": _id },
      { $set: changes, $currentDate: { updatedAt: true } },
      { returnDocument: "after" },
    );
    if (!task) throw new HttpError(404, "Checklist item not found.");
    res.json(task.checklist.find((item) => item._id.equals(_id)));
  });

  router.delete("/checklist/:itemId", async (req, res) => {
    const scope = taskScope(req, res);
    const _id = parseObjectId(req.params.itemId, "Checklist item ID");
    const result = await tasks.updateOne(
      { ...scope, "checklist._id": _id },
      { $pull: { checklist: { _id } }, $currentDate: { updatedAt: true } },
    );
    if (result.matchedCount === 0) throw new HttpError(404, "Checklist item not found.");
    res.status(204).end();
  });

  return router;
}
