import { HttpError } from "./errors.js";

export function validateTaskBody(body, { requireTitle = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Body must be a JSON object.");
  }

  const keys = Object.keys(body);
  if (keys.some((key) => key !== "title" && key !== "completed")) {
    throw new HttpError(400, "Only title and completed are allowed.");
  }

  if (keys.length === 0 && !requireTitle) {
    throw new HttpError(400, "Supply at least one field to update.");
  }

  const input = {};
  if (requireTitle || Object.hasOwn(body, "title")) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, "Title must be a string of 1 to 120 characters.");
    }
    input.title = title;
  }

  if (Object.hasOwn(body, "completed")) {
    if (typeof body.completed !== "boolean") {
      throw new HttpError(400, "Completed must be a boolean.");
    }
    input.completed = body.completed;
  }

  return input;
}
