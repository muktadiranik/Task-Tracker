# 7. Work with the Node.js runtime

Build a small command-line program that saves a task draft to a file. Use it to learn how Node.js loads modules, reads arguments, handles bytes, and reports errors.

## Modules and packages

A **module** is a file with its own scope. An **ES module** uses `export` to share values and `import` to use them. The prefix `node:` identifies a module built into Node.js. A path starting with `./` or `../` refers to your own file. A bare name such as `express` refers to an installed package. Include the `.js` extension in relative ES module imports.

The project sets `"type": "module"` in `package.json`, so Node treats its `.js` files as ES modules. You may also encounter CommonJS code that uses `require()` and `module.exports`. A `.cjs` file always uses CommonJS and a `.mjs` file always uses ES modules. [Node.js packages and module formats](https://nodejs.org/api/packages.html#determining-module-system)

`npm install` can add dependencies and update the lockfile. Use `npm ci` in a fresh checkout to install the exact lockfile versions. Use `npm install -D` for tooling that is only needed to develop or test a project. In this guide, the test runner is built into Node.js. [npm ci documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

## Create `labs/draft-task.js`

Create a `labs` folder in your practice project. Add this file inside it.

```js
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
```

`process.argv` starts with the Node executable and script path. `slice(2)` gives you the arguments you typed. `process.env` is where you read environment variables such as the MongoDB URI. Both are available through the built-in `process` object. [Node.js process API](https://nodejs.org/api/process.html)

`resolve()` turns a path into an absolute path relative to the current working directory. The file methods return promises, so `await` pauses this program until the operation finishes. The `wx` flag creates a new file and fails if one already exists. Use a fresh filename for a second successful run. [Node.js filesystem API](https://nodejs.org/api/fs.html)

`readFile()` without an encoding returns a **Buffer**, a sequence of bytes. Decoding those bytes as UTF-8 gives you text. For a title with accented letters or emoji, the byte count can be larger than the number of characters you see. Use streams for data too large to hold comfortably in memory. [Node.js Buffer API](https://nodejs.org/api/buffer.html)

## Check the file program

```bash
node labs/draft-task.js "Plan a café visit" draft-task.json
node labs/draft-task.js "Try again" draft-task.json
```

The first command prints the saved JSON and its byte count. The second prints `The output file already exists.` and exits with status `1`. Verify the file still contains the first task.

[Continue to asynchronous work](08-async-and-concurrency.md)
