import { once } from "node:events";
import { createServer } from "node:http";
import { createApp } from "./app.js";
import { connectToDatabase } from "./db.js";
import { createWorkspace } from "./workspace.js";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "task_tracker";

async function start() {
  if (!uri) {
    console.error("Set MONGODB_URI in .env or in your environment.");
    process.exitCode = 1;
    return;
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("Set PORT to an integer from 1 to 65535.");
    process.exitCode = 1;
    return;
  }

  let client;
  try {
    const connection = await connectToDatabase(uri, databaseName);
    client = connection.client;
    const { db } = connection;
    const workspace = await createWorkspace(db);
    const app = createApp(db.collection("tasks"), {
      workspace,
      checkDatabase: () => db.command({ ping: 1 }, { signal: AbortSignal.timeout(2000) }),
    });
    const server = createServer(app);
    const listening = once(server, "listening");
    server.listen(port, host);
    await listening;
    console.log(`Connected to MongoDB. API listening at http://${host}:${port}`);

    function stop() {
      server.close(async () => {
        try {
          await client.close();
        } catch (error) {
          console.error(`Could not close MongoDB connection (${error.name}).`);
          process.exitCode = 1;
        }
      });
    }

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    process.exitCode = 1;
    console.error(`Could not start the API (${error.code ?? error.name}). Check the MongoDB settings and port.`);
    await client?.close();
  }
}

await start();
