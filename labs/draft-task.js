import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [title, filename = "draft-task.json"] = process.argv.slice(2);

try {
  if (!title?.trim()) {
    throw new Error('Usage: node labs/draft-task.js "Task title" [filename]');
  }

  const path = resolve(filename);
  const task = { title: title.trim(), completed: false };
  await writeFile(path, JSON.stringify(task, null, 2) + "\n", { flag: "wx" });
  const bytes = await readFile(path);
  console.log(`Saved ${bytes.length} bytes to ${path}`);
  console.log(bytes.toString("utf8"));
} catch (error) {
  console.error(error.code === "EEXIST" ? "The output file already exists." : error.message);
  process.exitCode = 1;
}
