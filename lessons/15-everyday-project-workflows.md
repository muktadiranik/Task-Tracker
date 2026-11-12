# 15. Manage everyday project work

Turn the shared task list into a workspace for planning, reviewing, and tracking a release. Use the project and accounts from [lesson 14](14-shared-projects.md).

## Find the implementation

- [`src/project-task-fields.js`](../src/project-task-fields.js) validates task details and gives older tasks the same fields in API responses.
- [`src/project-task-queries.js`](../src/project-task-queries.js) builds search filters, reuses cursor pagination, and counts work by status.
- [`src/task-collaboration.js`](../src/task-collaboration.js) adds comments and checklist items to a task.
- [`src/projects.js`](../src/projects.js) wires the routes into the project membership and owner checks. [`src/workspace.js`](../src/workspace.js) adds the current account and assigned-work views.

The lesson 14 build instructions already copy these modules. For a practice project using an earlier version of the capstone, copy the files above and the current [`src/tasks.js`](../src/tasks.js) and [`src/task-queries.js`](../src/task-queries.js). Restart with `npm start`.

## Plan work with descriptions, priorities, labels, and due dates

Send these fields when you create or update a project task. The shared validator still requires a title for a new task.

| Field | Accepted values |
| --- | --- |
| `description` | Text up to 2,000 characters. An empty string clears it. |
| `priority` | `low`, `medium`, `high`, or `urgent`. Defaults to `medium`. |
| `status` | `todo`, `in_progress`, `blocked`, or `done`. |
| `dueOn` | A calendar date in `YYYY-MM-DD` format or `null` to clear it. |
| `labels` | Up to 10 labels, each 1 to 30 characters. The server trims, lowercases, and deduplicates them. |

A change to `status` also writes `completed` in the same database update. A task is complete when its status is `done`. A legacy request that sets `completed: true` moves the task to `done`, and `completed: false` moves it to `todo`. Older tasks without `status` are read using their stored `completed` value. When both fields are supplied, they must agree.

In Bash or WSL, use the `task`, `project`, `base`, `memberToken`, and `ownerToken` variables from lesson 14.

```bash
curl -i -w '\n' -X PATCH "$task" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"description":"Verify the release build","priority":"high","status":"in_progress","dueOn":"2000-01-01","labels":["Release","QA"]}'
```

Expect `200` with `"status":"in_progress"`, `"completed":false`, and labels `["release","qa"]`. The example uses a past date so the overdue filter is easy to check.

## Search, filter, and review progress

Project task lists accept the following query parameters. Use the same filters and sort order when following `nextCursor` with `before`.

| Query | What it does |
| --- | --- |
| `q` | Searches titles and descriptions for literal text, ignoring case. |
| `status`, `completed`, `priority`, `label` | Filters by workflow or classification. |
| `assigneeId` | Takes an account ID or `unassigned`. |
| `dueBefore` | Finds tasks due before the supplied date, excluding that date. |
| `overdue` | Accepts `true` or `false`. Open tasks dated before today in UTC are overdue. |
| `sort`, `limit`, `before` | Pages by task ID in `newest` or `oldest` order. |

The query builder always includes the project scope. It escapes search punctuation so a query such as `C++` is interpreted as literal text. The project summary groups tasks by workflow status and counts overdue work. The assigned-work endpoint searches the signed-in user's tasks across their active projects and accepts the same filters. [MongoDB regex queries](https://www.mongodb.com/docs/manual/reference/operator/query/regex/) · [MongoDB aggregation groups](https://www.mongodb.com/docs/manual/reference/operator/aggregation/group/)

```bash
curl -i -w '\n' --get "$project/tasks" -H "Authorization: Bearer $memberToken" --data-urlencode 'q=release build' --data-urlencode 'priority=high' --data-urlencode 'overdue=true'
curl -i -w '\n' "$project/stats" -H "Authorization: Bearer $memberToken"
curl -i -w '\n' "$base/api/me/project-tasks" -H "Authorization: Bearer $memberToken"
curl -i -w '\n' "$base/api/me" -H "Authorization: Bearer $memberToken"
```

Expect the release task in the filtered page and, if it is still assigned to the member, in their assigned-work view. In the project with just that task, stats show one in progress and one overdue. The account route returns the member's email and account ID.

## Discuss tasks and track checklist items

Members can post comments. The author can edit or delete their comment, and the project owner can remove any comment. Project participants can add, edit, complete, or remove checklist items. These items are stored inside the task document. A conditional `$push` keeps concurrent additions from exceeding the per-task limits of 100 comments and 50 checklist items. A positional update changes one matching array entry at a time. Read the individual task to see its comments and checklist. [MongoDB single-document atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)

| Method | Path relative to a task | Body |
| --- | --- | --- |
| POST | `/comments` | `{"text":"Ready for review"}` |
| PATCH | `/comments/:commentId` | `{"text":"Reviewed"}` |
| DELETE | `/comments/:commentId` | Empty |
| POST | `/checklist` | `{"title":"Run the integration tests"}` |
| PATCH | `/checklist/:itemId` | `{"completed":true}`, a new `title`, or both |
| DELETE | `/checklist/:itemId` | Empty |

```bash
curl -i -w '\n' "$task/comments" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"text":"Ready for review"}'
curl -i -w '\n' "$task/checklist" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"title":"Run the integration tests"}'
curl -i -w '\n' "$task" -H "Authorization: Bearer $memberToken"
```

Expect `201` for both additions and `200` with both entries on the task. Use the returned checklist item ID with the PATCH route to mark the item complete.

## Archive a project and manage its members

Owners use `PATCH /api/projects/:projectId` to rename a project, edit its description, or set `archived` to `true` or `false`. Archived projects appear in `GET /api/projects?archived=true`. Members can read archived projects, and task and membership writes return `409` until the owner restores the project.

An owner can remove a member using `DELETE /api/projects/:projectId/members/:userId`. This revokes access for subsequent requests and removes that project's tasks from the former member's assigned-work view. A task keeps its previous assignee ID for reference until a current participant reassigns it or clears the assignment. New assignments must target the current roster. The project owner stays on the roster.

```bash
curl -i -w '\n' -X PATCH "$project" -H "Authorization: Bearer $ownerToken" -H 'Content-Type: application/json' --data-binary '{"archived":true}'
curl -i -w '\n' "$base/api/projects?archived=true" -H "Authorization: Bearer $memberToken"
curl -i -w '\n' "$project/tasks" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"title":"Try an archived write"}'
curl -i -w '\n' -X PATCH "$project" -H "Authorization: Bearer $ownerToken" -H 'Content-Type: application/json' --data-binary '{"archived":false}'
```

Expect `200` for archiving, listing, and restoring. The create request while archived returns `409`.

## Run the integration tests

Copy [`test/project-features.test.js`](../test/project-features.test.js) into your practice project's `test` folder. Set `MONGODB_TEST_URI` as in [lesson 6](06-testing.md#add-and-run-the-automated-tests). This command works in Bash and PowerShell.

```bash
node --env-file-if-exists=.env --test test/project-features.test.js
```

Expect four passes, including the three subtests. The test covers legacy records, search and pagination, simultaneous checklist writes, comment permissions, archiving, and membership removal. Run `npm test` for the full suite, which reports 14 passes with MongoDB configured.
