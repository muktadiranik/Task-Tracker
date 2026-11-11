# 2. Serve your first HTTP response

Build a server with one endpoint, `GET /health`. A client such as curl sends an **HTTP request** with a method and a path. Your server sends a **response** with a status code and an optional body. Together, a method and path identify a **route**.

## Create `src/app.js`

Create the `src` folder and add this file.

```js
import express from "express";

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
```

Express matches a GET request for `/health` to the function you passed to `app.get()`. That function is the **route handler**. The first argument, `_req`, contains the request. The underscore signals that this handler has no use for it. The second argument, `res`, lets the handler send a response. HTTP status `200` means the request succeeded.

JSON is a text format for exchanging data. `res.json()` converts your JavaScript object into JSON and labels the response with the appropriate `Content-Type` header. A **header** carries information about the request or response. You'll use **middleware**, functions that run as a request moves through Express, to read JSON request bodies in lesson 4. [Express API reference](https://expressjs.com/en/api/)

## Create `src/server.js`

```js
import { createApp } from "./app.js";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, host, () => {
  console.log(`API listening at http://${host}:${port}`);
});
```

`127.0.0.1` is the address of your own machine. A **port** identifies which program should receive the request. This example listens on port 3000 by default. The npm start script loads settings from `.env` when that file exists. Node.js makes those values available through `process.env` as strings, so the code converts the port to a number. [Node.js command-line options](https://nodejs.org/api/cli.html#--env-file-if-existsfile)

## Check your server

In the project folder, run `npm start`. Keep that terminal open. In a second terminal, run the command below. In PowerShell, type `curl.exe` in place of `curl`. The `-i` flag shows the response headers and status line.

```bash
curl -i http://127.0.0.1:3000/health
```

Expect HTTP `200 OK` and this response body.

```json
{"status":"ok"}
```

Press Ctrl+C in the server terminal before editing the app in the next lesson.

[Next: Connect to MongoDB](03-mongodb.md)
