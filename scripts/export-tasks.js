import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";

async function* taskLines(endpoint, token) {
  do {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Task API returned HTTP ${response.status}.`);
    }

    const { items, nextCursor } = await response.json();
    for (const task of items) {
      yield `${JSON.stringify(task)}\n`;
    }
    if (!nextCursor) {
      return;
    }
    endpoint.searchParams.set("before", nextCursor);
  } while (true);
}

async function main() {
  const { values } = parseArgs({
    options: {
      completed: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log("Usage: node scripts/export-tasks.js [--completed true|false]");
    return;
  }

  const token = process.env.TASK_TRACKER_TOKEN;
  if (!token) {
    throw new Error("Set TASK_TRACKER_TOKEN to a session token.");
  }
  if (values.completed !== undefined && !["true", "false"].includes(values.completed)) {
    throw new Error("--completed must be true or false.");
  }

  const endpoint = new URL("/api/me/tasks", process.env.TASK_TRACKER_URL ?? "http://127.0.0.1:3000");
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) {
    throw new Error("Use HTTPS for a remote Task Tracker API.");
  }
  if (values.completed !== undefined) {
    endpoint.searchParams.set("completed", values.completed);
  }

  await pipeline(Readable.from(taskLines(endpoint, token)), process.stdout);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
