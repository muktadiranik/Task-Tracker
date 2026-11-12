import {
  presentProjectTask, readChoice, readDate, readText, taskPriorities, taskStatuses,
} from "./project-task-fields.js";
import { listTaskPage } from "./task-queries.js";
import { parseObjectId } from "./tasks.js";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function listProjectTaskPage(tasks, query, scope) {
  const { q, status, priority, label, assigneeId, dueBefore, overdue, sort = "newest" } = query;
  const direction = readChoice(sort, ["newest", "oldest"], "Sort") === "oldest" ? 1 : -1;
  const filter = { ...scope };
  const conditions = [];

  if (status !== undefined) {
    readChoice(status, taskStatuses, "Status");
    const matches = [{ status }];
    if (status === "todo" || status === "done") {
      matches.push({ status: null, completed: status === "done" });
    }
    conditions.push({ $or: matches });
  }
  if (priority !== undefined) {
    readChoice(priority, taskPriorities, "Priority");
    filter.priority = priority === "medium" ? { $in: ["medium", null] } : priority;
  }
  if (label !== undefined) filter.labels = readText(label, "Label", 30).toLowerCase();
  if (assigneeId !== undefined) {
    const id = assigneeId === "unassigned" ? null : parseObjectId(assigneeId, "Assignee ID");
    conditions.push({ assigneeId: id });
  }
  if (dueBefore !== undefined) {
    filter.dueOn = { $type: "string", $lt: readDate(dueBefore, "Due before") };
  }
  if (overdue !== undefined) {
    readChoice(overdue, ["true", "false"], "Overdue");
    const matches = { completed: false, dueOn: { $type: "string", $lt: today() } };
    conditions.push(overdue === "true" ? matches : { $nor: [matches] });
  }
  if (q !== undefined) {
    const term = readText(q, "Search text", 120);
    const pattern = term.replace(/[$.*+?^(){}|[\]\\]/g, "\\$&");
    const search = { $regex: pattern, $options: "i" };
    conditions.push({ $or: [{ title: search }, { description: search }] });
  }
  if (conditions.length > 0) filter.$and = conditions;

  const page = await listTaskPage(tasks, query, filter, {
    direction,
    projection: { comments: 0, checklist: 0 },
  });
  return { ...page, items: page.items.map(presentProjectTask) };
}

export async function projectTaskStats(tasks, projectId) {
  const groups = await tasks.aggregate([
    { $match: { projectId } },
    {
      $group: {
        _id: { $ifNull: ["$status", { $cond: ["$completed", "done", "todo"] }] },
        count: { $sum: 1 },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$completed", false] },
                  { $eq: [{ $type: "$dueOn" }, "string"] },
                  { $lt: ["$dueOn", today()] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]).toArray();

  const byStatus = Object.fromEntries(taskStatuses.map((status) => [status, 0]));
  let total = 0;
  let overdue = 0;
  for (const group of groups) {
    byStatus[group._id] = group.count;
    total += group.count;
    overdue += group.overdue;
  }
  return { total, completed: byStatus.done, overdue, byStatus };
}
