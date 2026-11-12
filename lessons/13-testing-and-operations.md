# 13. Test, debug, and run the service

Add a database readiness probe, run the full integration suite, and see how a process manager can run the API on Linux.

## Add a readiness endpoint

In `src/app.js`, add `checkDatabase` beside `workspace` in the options argument to `createApp()`. After the `/health` handler, add this block.

```js
if (checkDatabase) {
  app.get("/ready", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      await checkDatabase();
    } catch {
      throw new HttpError(503, "Database unavailable.");
    }
    res.status(200).json({ status: "ready" });
  });
}
```

In `src/server.js`, pass the database check to the app. The abort signal limits the time spent on the probe.

```js
const app = createApp(db.collection("tasks"), {
  workspace,
  checkDatabase: () => db.command({ ping: 1 }, { signal: AbortSignal.timeout(2000) }),
});
```

`/health` is a **liveness probe** that confirms the HTTP process can answer. `/ready` is a **readiness probe** that checks MongoDB and returns `503` when the database is unavailable. A load balancer can use readiness to decide where to send traffic. On SIGTERM, the shutdown code from lesson 3 stops accepting requests, lets ongoing requests finish, and closes the MongoDB client. [Express health checks and graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/)

## Run the expanded test suite

Copy [`test/workspace.test.js`](../test/workspace.test.js) into the practice project's `test` directory. Keep the original `test/api.test.js`. Run the tests from the project root.

```bash
npm test
```

The HTTP-only tests exercise validation and a simulated database failure. At the end of this lesson, expect four passing tests and two skipped integration tests with `MONGODB_TEST_URI` unset. Set the test URI as described in lesson 6 and expect six passing tests. The added integration test signs in two accounts and proves one cannot read, update, or delete the other's tasks. It also checks paging, counts, logout, and expiration against a real database. The finished workspace includes the [capstone tests](14-shared-projects.md#test-all-three-roles) and [workflow tests](15-everyday-project-workflows.md#run-the-integration-tests).

Run the workspace tests directly for a narrower feedback loop. The built-in coverage report shows which source lines the selected tests ran.

```bash
node --env-file-if-exists=.env --test --experimental-test-coverage test/workspace.test.js
```

[Node.js test runner](https://nodejs.org/api/test.html)

## Debug a request

Stop the current API first. For day-to-day changes, start with `node --watch --env-file-if-exists=.env src/server.js` so Node restarts when source files change. To inspect execution, use this command instead.

```bash
node --inspect --env-file-if-exists=.env src/server.js
```

Attach a debugger to the local inspector on port 9229. Set a breakpoint in `listTaskPage()`, then call the list endpoint with `limit=1`. Inspect `filter`, `pageSize`, and `items` as you step through. Keep the inspector bound to loopback. For performance debugging, record a profile with `--cpu-prof` during a local test run and open the resulting `.cpuprofile` in a debugger. [Node.js CLI options](https://nodejs.org/api/cli.html) · [Node.js debugger](https://nodejs.org/api/debugger.html)

## Run the API under a Linux process manager

On a Linux host with Node.js 24 and systemd, put the project in `/srv/task-tracker` and run `npm ci --omit=dev` there. Create a dedicated `tasktracker` service account and give it read access to the project and its private `.env`. Set the deployment's MongoDB URI, database name, and port in that file. The database user needs permission to create indexes during startup and to read and write the app's collections.

As an administrator, create `/etc/systemd/system/task-tracker.service`. Adjust `ExecStart` if your Node executable is installed at a different absolute path. The process manager restarts the service on failure and allows 20 seconds for graceful shutdown. [systemd service units](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)

```ini
[Unit]
Description=Task Tracker API
After=network-online.target
Wants=network-online.target

[Service]
User=tasktracker
WorkingDirectory=/srv/task-tracker
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file=.env src/server.js
Restart=on-failure
TimeoutStopSec=20s

[Install]
WantedBy=multi-user.target
```

Run `sudo systemctl daemon-reload` and `sudo systemctl enable --now task-tracker`. Read startup logs with `sudo journalctl -u task-tracker -n 30`. The app listens on loopback. To make it available remotely, put a TLS reverse proxy in front of the advanced `/api/auth/*` and `/api/me/*` routes. Keep the unauthenticated tutorial routes internal, rate-limit sign-in and registration at the proxy, and keep tokens, passwords, and connection URIs out of logs. [Express security best practices](https://expressjs.com/en/advanced/best-practice-security.html)

## Check liveness and readiness

With the local app or managed service running, use these commands on the machine hosting it. In PowerShell, replace `curl` with `curl.exe`.

```bash
curl -i -w '\n' http://127.0.0.1:3000/health
curl -i -w '\n' http://127.0.0.1:3000/ready
```

Expect `200` from both routes and `{"status":"ready"}` from `/ready`. If you are using the local tutorial Docker container, stop MongoDB temporarily as in lesson 5. Repeat the requests and expect `200` from liveness and `503` with `{"error":"Database unavailable."}` from readiness. Restart MongoDB and check that readiness returns `200` again.

[Continue to the Shared Projects capstone](14-shared-projects.md)
