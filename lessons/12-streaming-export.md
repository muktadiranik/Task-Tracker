# 12. Stream tasks to a file with a Node.js CLI

Write a command-line client that exports the signed-in user's tasks as **NDJSON**, one JSON object per line. It loads one API page at a time and can filter by completion status.

## Create `scripts/export-tasks.js`

Create a `scripts` folder in your practice project and copy [`scripts/export-tasks.js`](../scripts/export-tasks.js). Follow the data from the request to the output.

1. `parseArgs()` reads the optional `--completed` argument. The program reads its session token from `TASK_TRACKER_TOKEN`. The base URL defaults to the local API and can be configured with `TASK_TRACKER_URL`.
2. An **async generator** uses `fetch()` to request a page. It yields each task as a JSON line, then requests another page if there is a cursor. Its state includes the current page and the cursor.
3. `Readable.from()` turns the generator into a readable stream. `pipeline()` connects that stream to standard output and propagates errors to the surrounding `try/catch`. A pipe or file redirection gives the shell a place to write the result.

When a consumer writes slowly, a stream can pause reading from its source. This is **backpressure**. Without it, unread data can accumulate in memory. The export still buffers one JSON page per request, so the API's page-size limit matters. The CLI reports failures to standard error and returns a nonzero exit code. If it fails midway, treat the output as a partial export and rerun it. [Node.js streams](https://nodejs.org/api/stream.html) · [Node.js parseArgs](https://nodejs.org/api/util.html#utilparseargsconfig)

## Check the export

Keep the API running and sign in using lesson 10 if your token has expired. With the two private tasks from lesson 11, try exporting just the completed task. The following commands write to standard output first so you can see the JSON line.

**Bash or WSL**

```bash
TASK_TRACKER_TOKEN="$token" node scripts/export-tasks.js --completed true
TASK_TRACKER_TOKEN="$token" node scripts/export-tasks.js > tasks.ndjson
wc -l tasks.ndjson
```

**PowerShell**

```powershell
$env:TASK_TRACKER_TOKEN = $token
node scripts/export-tasks.js --completed true
cmd.exe /d /c 'node scripts/export-tasks.js > tasks.ndjson'
(Get-Content tasks.ndjson).Count
Remove-Item Env:TASK_TRACKER_TOKEN
```

Expect one line with `"title":"Write an index"` and `"completed":true` from the filtered export. The file should contain two lines for a fresh account. The PowerShell example uses `cmd.exe` for byte-preserving file redirection. Choose a fresh output filename if you want to keep a previous export.

[Continue to testing, debugging, and running the service](13-testing-and-operations.md)
