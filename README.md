# Learn Node.js by building a Task Tracker API

Start with basic JavaScript and build an Express API backed by MongoDB. Then work with Node.js modules, the event loop, worker threads, native HTTP, and streams. The final app adds accounts, private tasks, shared projects with assignments, comments, and checklists, an export CLI, and a readiness probe.

## Build your first API

1. [Set up Node.js, npm, and MongoDB](lessons/01-setup.md)
2. [Serve your first HTTP response](lessons/02-express-server.md)
3. [Connect to MongoDB](lessons/03-mongodb.md)
4. [Create, read, update, and delete tasks](lessons/04-task-crud.md)
5. [Validate input and return JSON errors](lessons/05-validation-and-errors.md)
6. [Test the API and try a filtering exercise](lessons/06-testing.md)

## Learn the Node.js runtime

7. [Work with modules, npm, files, and buffers](lessons/07-node-runtime.md)
8. [Understand asynchronous work, events, and worker threads](lessons/08-async-and-concurrency.md)
9. [Use native HTTP and fetch](lessons/09-native-http.md)

## Extend and run the API

10. [Add accounts and sessions](lessons/10-accounts-and-sessions.md)
11. [Scope tasks by owner, paginate results, and calculate stats](lessons/11-private-tasks-and-queries.md)
12. [Stream task exports with a Node.js CLI](lessons/12-streaming-export.md)
13. [Test, debug, and run the service](lessons/13-testing-and-operations.md)
14. [Build the Shared Projects capstone](lessons/14-shared-projects.md)
15. [Manage everyday project work](lessons/15-everyday-project-workflows.md)

This workspace contains the completed app. Build along in a separate practice folder to try each lesson in order. Lessons 1–6 build the basic API, and lessons 10–15 extend it.

## Run the finished API

Install Node.js 24 LTS and start a local MongoDB server or configure an Atlas cluster using [lesson 1](lessons/01-setup.md).

```bash
npm ci
cp .env.example .env
```

In PowerShell, use `Copy-Item .env.example .env` for the copy. If you chose Atlas, open `.env` and replace `MONGODB_URI` with your cluster's connection string. The example settings already point to a local server on port 27017.

```bash
npm start
```

Leave the app running. In a second terminal, run `curl -i http://127.0.0.1:3000/health` (`curl.exe` in PowerShell). Expect HTTP `200` and `{"status":"ok"}`.

## API at a glance

| Method | Path | Successful response |
| --- | --- | --- |
| GET | `/health` | `200` and the HTTP server status |
| GET | `/ready` | `200` when MongoDB responds, or `503` when unavailable |
| POST | `/api/tasks` | `201` and the new task |
| GET | `/api/tasks` | `200` and an array of tasks, newest first |
| GET | `/api/tasks/:id` | `200` and one task |
| PATCH | `/api/tasks/:id` | `200` and the updated task |
| DELETE | `/api/tasks/:id` | `204` with an empty body |

The advanced routes use separate account and task collections. Keep the basic `/api/tasks` routes on loopback for the exercises.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Get a session token |
| POST | `/api/auth/logout` | Revoke the current token |
| GET | `/api/me` | Look up your own account ID and email |
| GET, POST | `/api/me/tasks` | List or create tasks for the signed-in user |
| GET, PATCH, DELETE | `/api/me/tasks/:id` | Read, update, or delete one owned task |
| GET | `/api/me/stats` | Count the signed-in user's completed and pending tasks |
| GET | `/api/me/project-tasks` | Find your assigned tasks across active projects |
| GET, POST | `/api/projects` | List active or archived projects, or create one |
| GET, PATCH | `/api/projects/:projectId` | Read a project, or edit, archive, or restore it as the owner |
| GET | `/api/projects/:projectId/stats` | Count project tasks by status and find overdue work |
| PUT, DELETE | `/api/projects/:projectId/members/:userId` | Project owners add or remove an existing account |
| GET, POST | `/api/projects/:projectId/tasks` | Search, filter, or create project tasks |
| GET, PATCH, DELETE | `/api/projects/:projectId/tasks/:id` | Read or update a project task, or delete it as the owner |
| PUT | `/api/projects/:projectId/tasks/:id/assignee` | Assign a task to a project participant or clear its assignment |
| POST | `/api/projects/:projectId/tasks/:id/comments` | Add a comment |
| PATCH, DELETE | `/api/projects/:projectId/tasks/:id/comments/:commentId` | Edit or remove a comment |
| POST | `/api/projects/:projectId/tasks/:id/checklist` | Add a checklist item |
| PATCH, DELETE | `/api/projects/:projectId/tasks/:id/checklist/:itemId` | Edit, complete, or remove a checklist item |

See [lesson 15](lessons/15-everyday-project-workflows.md) for task fields, query parameters, and the comment and checklist paths. Run `npm test` for the HTTP checks. Set `MONGODB_TEST_URI` to a local or dedicated test deployment to also run the MongoDB tests. Each creates and drops a uniquely named database.
