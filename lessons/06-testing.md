# 6. Test the API

Walk one task through the entire API with curl, then run automated tests. The same checks can catch regressions after you change the code.

## Run the API through a CRUD cycle

Start the app with `npm start`. Use a second terminal for the following commands. The examples assume port 3000. The `-i` flag shows the HTTP status line, headers, and any response body.

### Create a task

**Bash or WSL**

```bash
base=http://127.0.0.1:3000
curl -i -w '\n' "$base/api/tasks" -H 'Content-Type: application/json' --data-binary '{"title":"Write my first API test"}'
```

**PowerShell**

```powershell
$base = 'http://127.0.0.1:3000'
'{"title":"Write my first API test"}' | curl.exe -i -w '\n' "$base/api/tasks" -H 'Content-Type: application/json' --data-binary '@-'
```

Expect `201 Created`, a `Location` header of the form `/api/tasks/<id>`, and a body like the example below. Your ID and timestamps will be different.

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "title": "Write my first API test",
  "completed": false,
  "createdAt": "2026-11-12T00:00:00.000Z",
  "updatedAt": "2026-11-12T00:00:00.000Z"
}
```

### Read, update, and delete the same task

In the same terminal, run the command that asks for the task ID. Paste the `_id` value from the response without the quotes, then press Enter. Run the remaining commands in order.

**Bash or WSL**

```bash
read -r -p 'Paste the new task ID: ' id
```

```bash
curl -i -w '\n' "$base/api/tasks"
curl -i -w '\n' "$base/api/tasks/$id"
curl -i -w '\n' -X PATCH "$base/api/tasks/$id" -H 'Content-Type: application/json' --data-binary '{"completed":true}'
curl -i -w '\n' -X DELETE "$base/api/tasks/$id"
curl -i -w '\n' "$base/api/tasks/$id"
```

**PowerShell**

```powershell
$id = Read-Host 'Paste the new task ID'
```

```powershell
curl.exe -i -w '\n' "$base/api/tasks"
curl.exe -i -w '\n' "$base/api/tasks/$id"
'{"completed":true}' | curl.exe -i -w '\n' -X PATCH "$base/api/tasks/$id" -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i -w '\n' -X DELETE "$base/api/tasks/$id"
curl.exe -i -w '\n' "$base/api/tasks/$id"
```

| Command | Expected status and body |
| --- | --- |
| List tasks | `200 OK` with an array containing the created task and any earlier tasks |
| Read one task | `200 OK` with the task you just created |
| Mark it complete | `200 OK` with the same task, `"completed":true`, and a refreshed `updatedAt` |
| Delete the task | `204 No Content` with an empty body |
| Read it again | `404 Not Found` with `{"error":"Task not found."}` |

### Send invalid JSON

**Bash or WSL**

```bash
curl -i -w '\n' "$base/api/tasks" -H 'Content-Type: application/json' --data-binary '{"title":'
```

**PowerShell**

```powershell
'{"title":' | curl.exe -i -w '\n' "$base/api/tasks" -H 'Content-Type: application/json' --data-binary '@-'
```

Expect `400 Bad Request` and `{"error":"Malformed JSON."}`.

## Add and run the automated tests

Create the `test` folder in your practice project and copy the finished [`test/api.test.js`](../test/api.test.js) into it. The npm script from lesson 1 runs Node.js's built-in test runner. Each **assertion** checks that the actual result matches what the test expects. This excerpt checks the HTTP status and the JSON body of `/health`.

```js
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), { status: "ok" });
```

The tests start their own HTTP servers on available ports. The HTTP-only tests cover the health endpoint, invalid requests, and a simulated database failure. Run them with this command.

```bash
npm test
```

In the practice project, expect three passing tests and one skipped CRUD test if `MONGODB_TEST_URI` is unset. The CRUD **integration test** runs the HTTP routes against a real MongoDB server. It creates a uniquely named `task_tracker_test_…` database and drops that database when it finishes. If you're running this from the finished workspace, [lesson 13](13-testing-and-operations.md) describes the full suite.

To enable the integration test, add the following line to your local `.env` and run `npm test` again. Expect four passing tests.

```dotenv
MONGODB_TEST_URI=mongodb://127.0.0.1:27017
```

For a remote test server, use a dedicated deployment and credentials that can create, write to, and drop a temporary database. The test reads `MONGODB_TEST_URI` independently of the app's `MONGODB_URI`.

## Exercise on filtering completed tasks

In `src/tasks.js`, edit the `GET /` handler to read `req.query.completed`. A **query string** is the part of a URL after `?`. Use an empty MongoDB filter when the query parameter is absent, `{ completed: true }` for the string `"true"`, and `{ completed: false }` for the string `"false"`. For any other value, throw an `HttpError` with status `400`.

Restart the server and create two tasks. Mark one as complete, then run `curl -i 'http://127.0.0.1:3000/api/tasks?completed=true'` or use `curl.exe` in PowerShell. Check that the completed task appears and the incomplete task is absent. Try `completed=false`, `completed=maybe`, and the URL without a query string to check the other cases.

[Continue to the Node.js runtime](07-node-runtime.md)
