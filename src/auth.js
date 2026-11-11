import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router } from "express";
import { MongoServerError } from "mongodb";
import { HttpError } from "./errors.js";

const deriveKey = promisify(scrypt);
const keyLength = 64;
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const sessionLifetimeMs = 24 * 60 * 60 * 1000;

function credentials(body) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = body?.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Supply a valid email address.");
  }
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new HttpError(400, "Password must be 12 to 128 characters.");
  }
  return { email, password };
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAuth(users, sessions) {
  const router = Router();

  router.post("/register", async (req, res) => {
    const { email, password } = credentials(req.body);
    const salt = randomBytes(16).toString("hex");
    const passwordHash = await deriveKey(password, salt, keyLength, scryptOptions);

    try {
      const { insertedId } = await users.insertOne({
        email,
        salt,
        passwordHash: passwordHash.toString("hex"),
      });
      res.status(201).json({ _id: insertedId, email });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new HttpError(409, "An account with that email already exists.");
      }
      throw error;
    }
  });

  router.post("/login", async (req, res) => {
    const { email, password } = credentials(req.body);
    const user = await users.findOne({ email });
    const actual = await deriveKey(password, user?.salt ?? "no-account", keyLength, scryptOptions);
    const expected = user ? Buffer.from(user.passwordHash, "hex") : Buffer.alloc(keyLength);
    if (!timingSafeEqual(actual, expected) || !user) {
      throw new HttpError(401, "Email or password is incorrect.");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + sessionLifetimeMs);
    await sessions.insertOne({ _id: hashToken(token), userId: user._id, expiresAt });
    res.json({ token, expiresAt });
  });

  async function requireSession(req, res, next) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get("Authorization") ?? "");
    if (match) {
      const session = await sessions.findOne({
        _id: hashToken(match[1]),
        expiresAt: { $gt: new Date() },
      });
      if (session) {
        res.locals.session = session;
        return next();
      }
    }
    res.set("WWW-Authenticate", "Bearer");
    throw new HttpError(401, "Supply a valid session token.");
  }

  router.post("/logout", requireSession, async (_req, res) => {
    await sessions.deleteOne({ _id: res.locals.session._id });
    res.status(204).end();
  });

  return { router, requireSession };
}
