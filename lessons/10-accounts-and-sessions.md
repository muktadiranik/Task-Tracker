# 10. Add accounts and sessions

Let people register, sign in, and sign out. **Authentication** verifies who sent a request. In the next lesson, **authorization** uses that identity to decide which tasks the requester can access.

## Create `src/auth.js`

Copy [`src/auth.js`](../src/auth.js) into your practice project. Read the three routes and the session middleware in order.

1. **Register.** Validate the email and password. Lowercase the email consistently. Use `randomBytes(16)` to make a different **salt**, or random input, for each password. Use asynchronous `scrypt` to derive a password hash, then store the salt and hash alongside the email. Return only the account ID and email. The database enforces uniqueness even if two requests register the same email concurrently.
2. **Sign in.** Look up the account by email. Derive a key again with the stored salt and compare the two byte sequences with `timingSafeEqual()`. The unknown-account path still does a key derivation. On success, issue a random token. Return it once and store only its SHA-256 digest, account ID, and expiration time. The app uses a 24-hour session.
3. **Authenticate a request.** Read the token from `Authorization: Bearer <token>`. A bearer token is a credential that grants access to whoever holds it. Hash it and look for a matching session whose expiration is in the future. Store the session in `res.locals`, which Express creates for each response.
4. **Sign out.** Require an active session and delete that session document. The same token will then get `401`. A sign-in on another device creates its own session.

`promisify(scrypt)` adapts the callback-based API to promises. Node's asynchronous scrypt uses the thread pool, so the JavaScript thread can keep serving requests while the hash is calculated. The memory and CPU cost makes scrypt appropriate for human-chosen passwords. SHA-256 is appropriate for the independently generated 256-bit tokens used here. [Node.js crypto API](https://nodejs.org/api/crypto.html) · [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## Create `src/workspace.js`

Start with just the account routes.

```js
import { Router } from "express";
import { createAuth } from "./auth.js";

export async function createWorkspace(db) {
  const users = db.collection("users");
  const sessions = db.collection("sessions");

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);

  const router = Router();
  router.use("/auth", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use("/auth", createAuth(users, sessions).router);
  return router;
}
```

A unique index rejects a second document with the same email. The **time-to-live index** on `expiresAt` cleans up expired sessions in the background. The query in `requireSession()` checks the timestamp on every request because cleanup can happen after the expiration time. [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)

## Wire the router into Express

In `src/app.js`, change the signature to `export function createApp(tasks, { workspace } = {})`. After mounting `/api/tasks` and before the unmatched-route handler, add the following.

```js
if (workspace) {
  app.use("/api", workspace);
}
```

In `src/server.js`, add `import { createWorkspace } from "./workspace.js";`. In `start()`, replace the two lines that assign `tasks` and `server` with this block.

```js
const { db } = connection;
const workspace = await createWorkspace(db);
const app = createApp(db.collection("tasks"), { workspace });
const server = createServer(app);
```

The server waits for the indexes before accepting requests. Keep the existing listening and shutdown code below this block.

## Check registration, sign-in, and sign-out

Restart with `npm start`. In a second terminal, run the commands for your shell. Use these example credentials only for the local tutorial. Run registration once per database. If you already registered, go straight to sign-in.

**Bash or WSL**

```bash
base=http://127.0.0.1:3000
account='{"email":"learner@example.test","password":"local tutorial passphrase"}'
curl -i -w '\n' "$base/api/auth/register" -H 'Content-Type: application/json' --data-binary "$account"
```

```bash
token=$(curl -fsS "$base/api/auth/login" -H 'Content-Type: application/json' --data-binary "$account" |
  node --input-type=module -e 'import { readFileSync } from "node:fs"; process.stdout.write(JSON.parse(readFileSync(0, "utf8")).token)')
```

```bash
curl -i -w '\n' -X POST "$base/api/auth/logout" -H "Authorization: Bearer $token"
curl -i -w '\n' -X POST "$base/api/auth/logout" -H "Authorization: Bearer $token"
```

**PowerShell**

```powershell
$base = 'http://127.0.0.1:3000'
$account = @{ email = 'learner@example.test'; password = 'local tutorial passphrase' } | ConvertTo-Json -Compress
$account | curl.exe -i -w '\n' "$base/api/auth/register" -H 'Content-Type: application/json' --data-binary '@-'
```

```powershell
$token = (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body $account).token
```

```powershell
curl.exe -i -w '\n' -X POST "$base/api/auth/logout" -H "Authorization: Bearer $token"
curl.exe -i -w '\n' -X POST "$base/api/auth/logout" -H "Authorization: Bearer $token"
```

Expect `201 Created` from registration, a token saved in the shell variable after sign-in, and `204 No Content` from sign-out. The second sign-out should return `401 Unauthorized` with `{"error":"Supply a valid session token."}`. Sign in again before using the private tasks endpoints.

[Continue to private tasks and MongoDB queries](11-private-tasks-and-queries.md)
