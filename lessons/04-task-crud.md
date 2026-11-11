# 4. Create, read, update, and delete tasks

Add five routes for **CRUD**, which stands for create, read, update, and delete. Each task stores a title, a boolean `completed` flag, and the dates it was created and last updated. New tasks default to incomplete.

| Request | MongoDB operation | Result |
| --- | --- | --- |
| `POST /api/tasks` | `insertOne()` | `201 Created` and the saved task |
| `GET /api/tasks` | `find().sort().toArray()` | `200 OK` and an array, newest first |
| `GET /api/tasks/:id` | `findOne()` | `200 OK` and the matching task |
| `PATCH /api/tasks/:id` | `findOneAndUpdate()` | `200 OK` and the updated task |
| `DELETE /api/tasks/:id` | `deleteOne()` | `204 No Content` |

## Create `src/errors.js`

The routes need a way to pass a status code and message to Express. Add this class now. You'll add a JSON error handler in lesson 5.

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
```

## Create `src/tasks.js`

A router groups routes that share a path prefix. Here the paths start with `/` inside the router. When you mount it at `/api/tasks`, `router.get("/:id", …)` matches requests such as `GET /api/tasks/507f1f77bcf86cd799439011`. The segment captured by `:id` is available as `req.params.id`.

```js
import { Router } from "express";
import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";

function taskIdFrom(pathId) {
  if (!ObjectId.isValid(pathId)) {
    throw new HttpError(400, "Task ID must be 24 hexadecimal characters.");
  }
  return new ObjectId(pathId);
}

export function createTaskRouter(tasks) {
  const router = Router();

  router.post("/", async (req, res) => {
    const input = req.body;
    const now = new Date();
    const task = {
      title: input.title,
      completed: input.completed ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await tasks.insertOne(task);
    res.location(`/api/tasks/${insertedId.toHexString()}`);
    res.status(201).json({ ...task, _id: insertedId });
  });

  router.get("/", async (_req, res) => {
    const list = await tasks.find({}).sort({ createdAt: -1, _id: -1 }).toArray();
    res.status(200).json(list);
  });

  router.get("/:id", async (req, res) => {
    const _id = taskIdFrom(req.params.id);
    const task = await tasks.findOne({ _id });
    if (!task) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(200).json(task);
  });

  router.patch("/:id", async (req, res) => {
    const _id = taskIdFrom(req.params.id);
    const { title, completed } = req.body;
    const changes = {};
    if (title !== undefined) changes.title = title;
    if (completed !== undefined) changes.completed = completed;
    const task = await tasks.findOneAndUpdate(
      { _id },
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
    const { deletedCount } = await tasks.deleteOne({ _id });
    if (deletedCount === 0) {
      throw new HttpError(404, "Task not found.");
    }
    res.status(204).end();
  });

  return router;
}
```

`insertOne()` returns the new document's ID. The response's `Location` header points to the new task. In the list route, `find({})` matches every document. `sort()` puts the latest first, with the ID breaking ties, and `toArray()` collects the matches for the response.

The first argument to `findOneAndUpdate()` is a **filter**, which describes what to match. `$set` changes the supplied fields, and `$currentDate` lets MongoDB set the update timestamp. `returnDocument: "after"` returns the document after the update. MongoDB applies the changes and returns the updated task in one operation. [MongoDB CRUD quick reference](https://www.mongodb.com/docs/drivers/node/current/reference/quick-reference/) · [Compound operations](https://www.mongodb.com/docs/drivers/node/current/crud/compound-operations/)

## Edit `src/app.js`

Add the router import and replace `createApp()` with `createApp(tasks)`. Before `return app`, add the two `app.use()` calls shown here.

```js
import express from "express";
import { createTaskRouter } from "./tasks.js";

export function createApp(tasks) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(express.json({ limit: "16kb", strict: false }));
  app.use("/api/tasks", createTaskRouter(tasks));

  return app;
}
```

`express.json()` is middleware. It parses a request marked `Content-Type: application/json` and makes the parsed value available as `req.body`. Express runs middleware in the order you register it, so place the JSON parser before the task router. Use well-formed task objects for this lesson. The next lesson adds checks for what those objects can contain.

## Check creation and listing

Restart the server with `npm start`. In a second terminal, send a title to the create route, then list all tasks.

**Bash or WSL**

```bash
curl -i -w '\n' http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' --data-binary '{"title":"Learn MongoDB"}'
curl -i -w '\n' http://127.0.0.1:3000/api/tasks
```

**PowerShell**

```powershell
'{"title":"Learn MongoDB"}' | curl.exe -i -w '\n' http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i -w '\n' http://127.0.0.1:3000/api/tasks
```

`--data-binary` sends a request body and makes curl use POST by default. In PowerShell, `@-` tells curl to read that body from the pipeline. The `-w '\n'` flag adds a newline after each response so consecutive responses are easier to read.

Expect `201 Created` with a task containing the title, `completed: false`, both timestamps, and an `_id`. The list request should return `200 OK` and an array containing the new task.

[Next: Validate input and return JSON errors](05-validation-and-errors.md)
