# 11. Scope tasks by owner, paginate results, and calculate stats

Give each account its own tasks. Reuse the CRUD handlers from lesson 4, then add a filtered, paginated list and a summary of completed and pending tasks.

## Update `src/tasks.js` to reuse CRUD

Replace your file with [`src/tasks.js`](../src/tasks.js). The router now accepts three options.

| Option | Basic tutorial route | Private route |
| --- | --- | --- |
| `basePath` | `/api/tasks` | `/api/me/tasks` |
| `taskFilter(res)` | Empty filter | `{ ownerId: res.locals.session.userId }` |
| `listTasks()` | Array ordered by creation time | Filtered page with a continuation cursor |

If you completed the optional filter exercise in lesson 6, carry that logic into `listTutorialTasks(tasks, query)`. Use `query.completed` where the old handler used `req.query.completed`.

On create, the server derives the owner from the authenticated session. On reads, updates, and deletes, include the owner and task ID in the same MongoDB query. The client supplies the task ID. The middleware supplies the owner.

```js
const task = await tasks.findOne({ _id, ...taskFilter(res) });
```

A task belonging to a different user produces the same `404` as a missing task. Update and delete use the same filter. The private router uses the `private_tasks` collection, and the earlier `/api/tasks` examples still use the original `tasks` collection.

## Create `src/task-queries.js`

Copy [`src/task-queries.js`](../src/task-queries.js). `listPrivateTasks()` validates query parameters before building a MongoDB filter. It allows `completed=true` or `completed=false`, a `limit` from 1 to 100 with a default of 20, and a `before` cursor that is a task ID. Keep the same completion filter as you follow the cursor.

The endpoint sorts by descending `_id`. The next page uses `_id: { $lt: previousCursor }` to pick up after the last item you saw. It reads one extra result to determine whether there is another page. The response contains `{ items, nextCursor }`, and `nextCursor` is `null` on the last page. This ordering uses a unique key and represents approximate creation order. Pages are live queries, so concurrent edits or deletions can affect what later pages contain.

`taskStats()` uses an **aggregation pipeline**, a sequence of operations MongoDB runs on documents. `$match` selects the signed-in user's tasks. `$group` groups them by `completed` and counts documents in each group. The application fills in zero counts when a group is absent. [MongoDB aggregation stages](https://www.mongodb.com/docs/manual/reference/mql/aggregation-stages/)

## Replace `src/workspace.js` to mount the private router

Copy the full [`src/workspace.js`](../src/workspace.js). Notice that every request under `/me` passes through `auth.requireSession` before it can reach the task or stats handlers. The task index on `ownerId` and `_id` supports the unfiltered list. A second **compound index** adds `completed` between those fields so MongoDB can narrow results by status and still return them in cursor order. Indexes improve reads and take storage and write work to maintain. [MongoDB driver guide to indexes](https://www.mongodb.com/docs/drivers/node/current/indexes/)

## Check private tasks, a filtered page, and stats

Restart with `npm start`. Sign in again using lesson 10 so your second terminal has a fresh token in `token`. Use the commands for your shell.

**Bash or WSL**

```bash
curl -i -w '\n' "$base/api/me/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary '{"title":"Write an index","completed":true}'
curl -i -w '\n' "$base/api/me/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary '{"title":"Review the query plan"}'
curl -i -w '\n' "$base/api/me/tasks?limit=1" -H "Authorization: Bearer $token"
curl -i -w '\n' "$base/api/me/tasks?completed=true" -H "Authorization: Bearer $token"
curl -i -w '\n' "$base/api/me/stats" -H "Authorization: Bearer $token"
```

**PowerShell**

```powershell
'{"title":"Write an index","completed":true}' | curl.exe -i -w '\n' "$base/api/me/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary '@-'
'{"title":"Review the query plan"}' | curl.exe -i -w '\n' "$base/api/me/tasks" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i -w '\n' "$base/api/me/tasks?limit=1" -H "Authorization: Bearer $token"
curl.exe -i -w '\n' "$base/api/me/tasks?completed=true" -H "Authorization: Bearer $token"
curl.exe -i -w '\n' "$base/api/me/stats" -H "Authorization: Bearer $token"
```

Expect `201` for each create and `200` for the two lists and stats. In a fresh account, the first list returns one task and a `nextCursor`. Follow it using `?limit=1&before=<nextCursor>`, substituting the cursor from the response. The filtered list contains only the completed task, and stats returns `{"total":2,"completed":1,"pending":1}`. Try the stats request without the `Authorization` header and check for `401`.

[Continue to streams and the export CLI](12-streaming-export.md)
