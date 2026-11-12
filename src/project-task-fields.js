import { HttpError } from "./errors.js";
import { validateTaskBody } from "./task-input.js";

export const taskStatuses = ["todo", "in_progress", "blocked", "done"];
export const taskPriorities = ["low", "medium", "high", "urgent"];

export function readText(value, label, max, min = 1) {
  const text = typeof value === "string" ? value.trim() : "";
  if (typeof value !== "string" || text.length < min || text.length > max) {
    throw new HttpError(400, `${label} must be a string of ${min} to ${max} characters.`);
  }
  return text;
}

export function readDate(value, label) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value) {
      return value;
    }
  }
  throw new HttpError(400, `${label} must be a real date in YYYY-MM-DD format.`);
}

export function readChoice(value, choices, label) {
  if (!choices.includes(value)) {
    throw new HttpError(400, `${label} must be one of ${choices.join(", ")}.`);
  }
  return value;
}

export function validateProjectTaskBody(body, { requireTitle = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Body must be a JSON object.");
  }
  const { description, priority, status, dueOn, labels, ...basic } = body;
  const input = requireTitle || Object.keys(basic).length > 0
    ? validateTaskBody(basic, { requireTitle })
    : {};

  if (description !== undefined) input.description = readText(description, "Description", 2000, 0);
  if (priority !== undefined) input.priority = readChoice(priority, taskPriorities, "Priority");
  if (dueOn !== undefined) input.dueOn = dueOn === null ? null : readDate(dueOn, "Due date");
  if (labels !== undefined) {
    if (!Array.isArray(labels) || labels.length > 10) {
      throw new HttpError(400, "Supply up to 10 labels as an array.");
    }
    input.labels = [...new Set(labels.map((label) => readText(label, "Label", 30).toLowerCase()))];
  }

  if (status !== undefined) {
    input.status = readChoice(status, taskStatuses, "Status");
    const completed = status === "done";
    if (input.completed !== undefined && input.completed !== completed) {
      throw new HttpError(400, "Status and completed must agree.");
    }
    input.completed = completed;
  } else if (input.completed !== undefined) {
    input.status = input.completed ? "done" : "todo";
  }

  if (Object.keys(input).length === 0) {
    throw new HttpError(400, "Supply at least one field to update.");
  }
  return input;
}

export function presentProjectTask(task) {
  return {
    description: "",
    priority: "medium",
    dueOn: null,
    labels: [],
    ...task,
    status: task.status ?? (task.completed ? "done" : "todo"),
  };
}
