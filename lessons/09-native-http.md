# 9. Use native HTTP and fetch

Build a minimal server without a framework and a client that calls it. Compare the pieces with the Express app from lesson 2.

## Create `labs/http-server.js`

```js
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Route not found." }));
});

server.listen(3001, "127.0.0.1", () => {
  console.log("Listening at http://127.0.0.1:3001");
});
```

The callback receives the incoming request and the response you can write. The response needs both headers and an end signal. The example matches the raw request URL exactly. Express handles details such as query strings, path parameters, and reusable middleware. [Anatomy of an HTTP transaction](https://nodejs.org/learn/http/anatomy-of-an-http-transaction)

## Create `labs/http-client.js`

```js
const path = process.argv[2] ?? "/health";
const url = new URL(path, "http://127.0.0.1:3001");

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.error}`);
  }
  console.log(data.status);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
```

Node's built-in `fetch()` returns a response for HTTP errors such as `404`. Check `response.ok` for a successful status. A network failure or timeout rejects the promise. The abort signal limits how long the client waits, including while it reads the response body. [Fetching data with Node.js](https://nodejs.org/en/learn/getting-started/fetch) · [AbortSignal](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)

## Check the server and client

Run `node labs/http-server.js` in one terminal. In a second terminal run these commands.

```bash
node labs/http-client.js
node labs/http-client.js /missing
```

Expect `ok` from the first command and `HTTP 404: Route not found.` with exit status `1` from the second. Stop the lab server with Ctrl+C before you continue.

[Continue to accounts and sessions](10-accounts-and-sessions.md)
