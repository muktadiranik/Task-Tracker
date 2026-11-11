# 8. Understand asynchronous work and concurrency

Observe how timers and events run while JavaScript waits for I/O. Then move a small CPU calculation into a worker thread.

## Event loop, promises, and events

Node.js runs JavaScript callbacks on an **event loop**. While the app waits for a network response or a file operation, it can handle other work. Node delegates work to the operating system or a thread pool depending on the operation. A long synchronous JavaScript calculation occupies the event loop and delays other requests. An `async` function still runs its synchronous code on that thread. [Node.js event loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick) · [Blocking and non-blocking work](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)

An `EventEmitter` calls its registered listeners synchronously when you call `emit()`. A promise represents one eventual result. An event emitter can notify listeners many times. `once(emitter, name)` bridges the two by returning a promise for the next event. Register it before emitting the event. [Node.js events API](https://nodejs.org/api/events.html)

Create `labs/async-order.js`.

```js
import { EventEmitter, once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const events = new EventEmitter();
events.on("saved", (title) => console.log("listener", title));
const saved = once(events, "saved");

const saveTask = async () => {
  await delay(30);
  events.emit("saved", "Read the event loop guide");
};

const saving = saveTask();
console.log("synchronous work");
const [[title]] = await Promise.all([saved, saving]);
console.log("after await", title);
```

`Promise.all()` waits for multiple promises and preserves the input order in its result. It rejects when one of them rejects. If started operations have side effects, the rejection alone leaves those operations running. Use sequential `await` when one step depends on another, and bound concurrency when processing large batches so you avoid flooding a connection pool.

## Use a worker thread for CPU work

Create `labs/calculate-worker.js`.

```js
import { parentPort, workerData } from "node:worker_threads";

let sum = 0;
for (let number = 1; number <= workerData; number++) {
  sum += number;
}
parentPort.postMessage(sum);
```

Create `labs/run-worker.js`.

```js
import { once } from "node:events";
import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("./calculate-worker.js", import.meta.url), {
  workerData: 1_000_000,
});
const [sum] = await once(worker, "message");
console.log(sum);
```

A **worker thread** runs its own JavaScript and sends results through messages. In practice, consider a reusable worker pool for recurring CPU-heavy jobs. Node's built-in asynchronous I/O already handles waiting for files and network traffic. [Node.js worker threads](https://nodejs.org/api/worker_threads.html)

## Check the order and worker result

```bash
node labs/async-order.js
node labs/run-worker.js
```

Expect the async program to print `synchronous work`, then the listener, then `after await`. The worker program prints `500000500000`.

[Continue to native HTTP and fetch](09-native-http.md)
