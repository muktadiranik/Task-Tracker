import { ObjectId } from "mongodb";
import { HttpError } from "./errors.js";

export async function listTaskPage(tasks, { completed, limit = "20", before }, scope, {
  direction = -1,
  projection,
} = {}) {
  if (typeof limit !== "string" || !/^(?:[1-9][0-9]?|100)$/.test(limit)) {
    throw new HttpError(400, "Limit must be an integer from 1 to 100.");
  }

  const filter = { ...scope };
  if (completed !== undefined) {
    if (completed !== "true" && completed !== "false") {
      throw new HttpError(400, "Completed must be true or false.");
    }
    filter.completed = completed === "true";
  }
  if (before !== undefined) {
    if (typeof before !== "string" || !ObjectId.isValid(before)) {
      throw new HttpError(400, "Before must be a 24-character task ID.");
    }
    const comparison = direction === 1 ? "$gt" : "$lt";
    filter._id = { [comparison]: new ObjectId(before) };
  }

  const pageSize = Number(limit);
  const items = await tasks.find(filter, { projection }).sort({ _id: direction })
    .limit(pageSize + 1).toArray();
  const hasMore = items.length > pageSize;
  if (hasMore) {
    items.pop();
  }
  const nextCursor = hasMore ? items.at(-1)._id.toHexString() : null;
  return { items, nextCursor };
}

export async function taskStats(tasks, ownerId) {
  const groups = await tasks.aggregate([
    { $match: { ownerId } },
    { $group: { _id: "$completed", count: { $sum: 1 } } },
  ]).toArray();

  const completed = groups.find((group) => group._id === true)?.count ?? 0;
  const pending = groups.find((group) => group._id === false)?.count ?? 0;
  return { total: completed + pending, completed, pending };
}
