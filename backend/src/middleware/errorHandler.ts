import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";

/** 404 for unmatched routes. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

/** Central error handler — keeps controllers free of repetitive try/catch shape. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    console.error("[error] validation failed", err.flatten());
    res
      .status(400)
      .json({ error: "Invalid request payload", details: err.flatten() });
    return;
  }

  // Errors that carry their own status are expected outcomes, not server faults.
  // Log them at a lower volume: no stack trace for a rejected signature.
  if (err instanceof HttpError) {
    console.warn(`[${err.status}] ${err.message}`);
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error(
    "[error]",
    err instanceof Error ? (err.stack ?? err.message) : err,
  );

  // Unexpected failures are logged in full but reported opaquely: raw messages
  // from a database driver or RPC client can disclose internal topology.
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";

  res.status(500).json({ error: message });
}
