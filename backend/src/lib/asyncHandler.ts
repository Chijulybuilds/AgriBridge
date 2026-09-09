import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Forwards rejected promises from an async route handler to Express.
 *
 * Express 4 does not await handlers, so a promise rejection inside one is an
 * unhandled rejection rather than a request error. Without this, a Zod
 * validation failure or a database error in an async controller never reaches
 * errorHandler: the client's request hangs until it times out, and the process
 * logs an unhandled rejection instead of returning 400 or 500.
 */
export function asyncHandler(
  handler: (req: any, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
