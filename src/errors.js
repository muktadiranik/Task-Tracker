export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(error, _req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON." });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body exceeds 16 KB." });
  }

  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ error: "Invalid request." });
  }

  console.error(`Request failed (${error.name}).`);
  return res.status(500).json({ error: "Internal server error." });
}
