# 14. Build the Shared Projects capstone

Let several accounts work on the same task list. Lesson 11 checked whether a task belonged to the signed-in user. Here, the API first checks whether the user belongs to the project, then checks their role for actions reserved for the owner.

| Action | Owner | Member | Signed-in outsider |
| --- | --- | --- | --- |
| See the project, its roster, and its tasks | Yes | Yes | `404` |
| Create a task, update it, or change its assignment | Yes | Yes | `404` |
| Add an existing account to the project | Yes | `403` | `404` |
| Delete a project task | Yes | `403` | `404` |

A signed-in user can create a project and becomes its owner. A request without a valid session gets `401`. A valid session with no membership gets the same `404` as a request for an unknown project. A project member who tries an owner-only action gets `403`.

## Create `src/projects.js`

Copy [`src/projects.js`](../src/projects.js) into your practice project. Read the router in this order.

1. **Create and list projects.** The server takes the owner ID from the session and adds it to `memberIds`, the project's roster. A project list queries that array for the signed-in user's ID.
2. **Load the project.** The `/:projectId` middleware checks the ID and queries for the project and the current user's membership together. It puts the result in `res.locals.project` for the routes below it.
3. **Add a member.** The owner supplies an existing account's ID. The database update includes both the project ID and the owner ID. MongoDB's `$addToSet` updates the project document without adding a duplicate if a request is retried. This capstone uses an add-only roster. [MongoDB `$addToSet`](https://www.mongodb.com/docs/manual/reference/operator/update/addtoset/)
4. **Assign a task.** Send an `assigneeId` from the roster, including the owner if desired. Send `null` to clear the assignment. The server updates a task only when both its task ID and its `projectId` match. An unassigned task has no `assigneeId` field.
5. **Reuse task CRUD.** The router from lesson 11 applies `projectId` to all project task operations. The capstone passes `requireProjectOwner` as `authorizeDelete`, so the shared router checks the owner's role before deleting. A separate assignment endpoint handles its own validation.

The two filters answer different questions. Finding a project by `{ _id, memberIds: userId }` establishes access to that project. Finding a task by `{ _id, projectId }` establishes that the task is part of that project. A task ID from another project fails the second query even if the caller owns the project in the URL.

## Wire it into `src/workspace.js`

Replace the lesson 11 version with the [completed `src/workspace.js`](../src/workspace.js). It mounts the router at `/api/projects` behind `auth.requireSession`. It also creates indexes before the app begins listening.

- The `projects` collection stores names, owners, and rosters. MongoDB indexes the `memberIds` array for membership lookups. This is a **multikey index**. [MongoDB multikey indexes](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-multikey/)
- The `project_tasks` collection stores tasks and their optional assignments. Its indexes start with `projectId` and support the same cursor pagination and `completed` filter from lesson 11.

For the Linux setup in lesson 13, add `/api/projects` and its subpaths to the routes served by your TLS proxy.

## Try a shared task

Start the app with `npm start`. In a second terminal, use the registration and sign-in commands from [lesson 10](10-accounts-and-sessions.md#check-registration-sign-in-and-sign-out) with three different email addresses. Save their tokens as `ownerToken`, `memberToken`, and `outsiderToken`. Save the member's account `_id` as `memberId`. Keep the sessions active during this check.

The curl walkthrough uses Bash or WSL. The automated check below works from either Bash or PowerShell.

Create a project as the owner. Expect `201` with a project `_id`. Paste that ID when prompted in the next block.

```bash
base=http://127.0.0.1:3000
curl -i -w '\n' "$base/api/projects" -H "Authorization: Bearer $ownerToken" -H 'Content-Type: application/json' --data-binary '{"name":"Release plan"}'
```

```bash
read -r -p 'Project ID: ' projectId
project="$base/api/projects/$projectId"
curl -i -w '\n' -X PUT "$project/members/$memberId" -H "Authorization: Bearer $ownerToken"
curl -i -w '\n' "$project/tasks" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"title":"Write release notes"}'
```

Expect `200` with the updated roster, then `201` with a task `_id`. Paste the task ID in the next block. As a member, assign the task to yourself and mark it complete. Then try to delete it as a member and read it as an outsider.

```bash
read -r -p 'Task ID: ' taskId
task="$project/tasks/$taskId"
curl -i -w '\n' -X PUT "$task/assignee" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary "{\"assigneeId\":\"$memberId\"}"
curl -i -w '\n' -X PATCH "$task" -H "Authorization: Bearer $memberToken" -H 'Content-Type: application/json' --data-binary '{"completed":true}'
curl -i -w '\n' -X DELETE "$task" -H "Authorization: Bearer $memberToken"
curl -i -w '\n' "$task" -H "Authorization: Bearer $outsiderToken"
```

Expect `200` with the member's `assigneeId`, then `200` with both that assignee and `"completed":true`. The delete returns `403`, and the outsider's read returns `404`.

## Test all three roles

Copy [`test/projects.test.js`](../test/projects.test.js) into your practice project's `test` folder. The test registers three separate accounts through the HTTP API and checks the project and task routes against a disposable MongoDB database. It covers repeat member additions, owner-only actions, assignment and completion, and attempts to use a task ID under the wrong project.

Set `MONGODB_TEST_URI` as in [lesson 6](06-testing.md#add-and-run-the-automated-tests) and run the capstone test.

```bash
node --env-file-if-exists=.env --test test/projects.test.js
```

Expect a passing parent test with three passing subtests for the owner, member, and outsider. Run `npm test` to check the earlier lessons as well. The full suite reports ten passes including the three role subtests.
