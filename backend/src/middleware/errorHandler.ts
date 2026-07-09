import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

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

  const message = err instanceof Error ? err.message : "Internal server error";
  console.error(
    "[error]",
    err instanceof Error ? (err.stack ?? err.message) : err,
  );
  res.status(500).json({ error: message });
}
