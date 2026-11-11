# 5. Validate input and return JSON errors

Make the task routes check incoming data before storing it. Give clients a consistent JSON error body of the form `{"error":"A short message."}`.

## Create `src/task-input.js`

```js
import { HttpError } from "./errors.js";

export function validateTaskBody(body, { requireTitle = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Body must be a JSON object.");
  }

  const keys = Object.keys(body);
  if (keys.some((key) => key !== "title" && key !== "completed")) {
    throw new HttpError(400, "Only title and completed are allowed.");
  }

  if (keys.length === 0 && !requireTitle) {
    throw new HttpError(400, "Supply at least one field to update.");
  }

  const input = {};
  if (requireTitle || Object.hasOwn(body, "title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, "Title must be a string of 1 to 120 characters.");
    }
    input.title = title;
  }

  if (Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      throw new HttpError(400, "Completed must be a boolean.");
    }
    input.completed = body.completed;
  }

  return input;
}
```

On POST, the title is required. On PATCH, the client must provide at least one field. A title is trimmed and must contain 1 to 120 characters after trimming. `completed` must be a JSON boolean when supplied. `Object.hasOwn()` checks whether the client included a field, so `false` is accepted as an update.

## Edit `src/tasks.js`

Add this import next to the `HttpError` import.

```js
import { validateTaskBody } from "./task-input.js";
```

In the POST handler, replace `const input = req.body;` with the line below.

```js
const input = validateTaskBody(req.body, { requireTitle: true });
```

In the PATCH handler, keep the line that reads the ID. Replace the four lines that build `changes` from `req.body` with the line below.

```js
const changes = validateTaskBody(req.body);
```

The existing `taskIdFrom()` function raises `400` for malformed IDs before querying MongoDB. A well-formed ID that has no matching task results in `404`.

## Edit `src/errors.js` and `src/app.js`

Append this function after the `HttpError` class in `src/errors.js`.

```js
export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON." });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body exceeds 16 KB." });
  }

  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: "Invalid request." });
  }

  console.error(`Request failed (${error.name}).`);
  return res.status(500).json({ error: "Internal server error." });
}
```

Express 5 forwards a thrown error or a rejected promise from an async route to **error-handling middleware**. Express recognizes this middleware by its four parameters. If a response has already started, `next(error)` passes control to Express's default handler. Unexpected errors, including failed MongoDB operations, produce a generic `500` response. The server logs the error type while keeping internal details out of the client response. [Express error handling](https://expressjs.com/en/guide/error-handling/) · [JSON parser errors](https://expressjs.com/en/resources/middleware/body-parser/#errors)

In `src/app.js`, import the error class and handler. Add the unmatched-route handler after the task router, and register `errorHandler` last. The file should look like this at the end of the basic API lessons.

```js
import express from "express";
import { errorHandler, HttpError } from "./errors.js";
import { createTaskRouter } from "./tasks.js";

export function createApp(tasks) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(express.json({ limit: "16kb", strict: false }));
  app.use("/api/tasks", createTaskRouter(tasks));

  app.use(() => {
    throw new HttpError(404, "Route not found.");
  });
  app.use(errorHandler);

  return app;
}
```

## Check the error responses

Restart with `npm start`, then run these requests in a second terminal.

**Bash or WSL**

```bash
curl -i -w '\n' http://127.0.0.1:3000/api/tasks/bad-id
curl -i -w '\n' http://127.0.0.1:3000/api/tasks/000000000000000000000000
curl -i -w '\n' http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' --data-binary '{"title":" "}'
```

**PowerShell**

```powershell
curl.exe -i -w '\n' http://127.0.0.1:3000/api/tasks/bad-id
curl.exe -i -w '\n' http://127.0.0.1:3000/api/tasks/000000000000000000000000
'{"title":" "}' | curl.exe -i -w '\n' http://127.0.0.1:3000/api/tasks -H 'Content-Type: application/json' --data-binary '@-'
```

| Request | Status | Response body |
| --- | --- | --- |
| Malformed ID | `400` | `{"error":"Task ID must be 24 hexadecimal characters."}` |
| Well-formed ID absent from your practice database | `404` | `{"error":"Task not found."}` |
| Blank title | `400` | `{"error":"Title must be a string of 1 to 120 characters."}` |

If you started the tutorial's Docker container in lesson 1, you can check a runtime database failure. Leave the API running, run `docker stop task-tracker-mongo`, then run `curl -i http://127.0.0.1:3000/api/tasks`. After a short wait, expect `500` and `{"error":"Internal server error."}`. Run `docker start task-tracker-mongo` and repeat the request after MongoDB starts. Expect `200` again. Lesson 6 also includes an automated failure check that requires only the HTTP server.

[Next: Test the API and try a filtering exercise](06-testing.md)
