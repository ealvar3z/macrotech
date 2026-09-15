import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth, db } from "./firebase.js";
import { config } from "./config.js";
import { HttpError } from "./errors.js";
import { assertMember } from './membership.js';

export interface AuthenticatedRequest extends Request {
  actor?: DecodedIdToken;
}

function bearer(req: Request): string {
  const header = req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) throw new HttpError(401, "AUTH_REQUIRED", "Sign in is required.");
  return match[1];
}

function isInvalidAuthTokenError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  return new Set([
    "auth/argument-error",
    "auth/id-token-expired",
    "auth/id-token-revoked",
    "auth/invalid-id-token",
    "auth/user-disabled",
    "auth/user-not-found"
  ]).has(code);
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let decoded: DecodedIdToken;
    try {
      // checkRevoked=true is intentional. The runtime service account therefore
      // requires roles/firebaseauth.viewer in addition to Firestore/Storage access.
      decoded = await adminAuth.verifyIdToken(bearer(req), true);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isInvalidAuthTokenError(error)) {
        throw new HttpError(401, "INVALID_SESSION", "Your sign-in session is no longer valid. Sign in again.");
      }
      throw error;
    }

    if (!decoded.email || decoded.email_verified !== true) {
      throw new HttpError(403, "VERIFIED_EMAIL_REQUIRED", "A verified Google email is required.");
    }

    req.actor = decoded;
    next();
  } catch (error) {
    next(error);
  }
}

export function actorEmail(req: AuthenticatedRequest): string {
  const email = req.actor?.email?.trim().toLowerCase();
  if (!email) throw new HttpError(401, "AUTH_REQUIRED", "Sign in is required.");
  return email;
}

export function actorDisplayName(req: AuthenticatedRequest): string {
  const name = req.actor?.name?.trim();
  return name && name.length <= 200 ? name : "";
}

export async function requirePreparer(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = actorEmail(req);

    const uid = req.actor!.uid;
    const user = await db.collection("users").doc(uid).get();
    assertMember(user.data(), email, ['preparer', 'admin']);

    next();
  } catch (error) {
    next(error);
  }
}

export async function requireApprover(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const user = await db.collection('users').doc(req.actor!.uid).get();
    assertMember(user.data(), actorEmail(req), ['approver', 'admin']);
    next();
  } catch (error) { next(error); }
}
