/**
 * Errors carrying an intended HTTP status.
 *
 * Without these, every thrown Error became a 500, so a rejected signature or a
 * burned nonce reported itself as a server fault. Clients could not tell "you
 * must sign in again" from "the backend is broken".
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** 401 — the caller is not authenticated, or the proof they offered failed. */
export class AuthError extends HttpError {
  constructor(message: string) {
    super(401, message);
    this.name = 'AuthError';
  }
}

/** 400 — the request itself is malformed or references something invalid. */
export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

/** 404 — the addressed resource does not exist. */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}
