import { HttpError } from './errors.js';

export function assertMember(user: Record<string, unknown> | undefined, email: string, roles: string[]) {
  if (!user || user.active !== true || typeof user.email !== 'string' || user.email.toLowerCase() !== email.toLowerCase() || !roles.includes(String(user.role)))
    throw new HttpError(403, 'ROLE_REQUIRED', 'Active server-managed membership is required for this action.');
}
export function assertReviewPolicy(ownerUid: string, actorUid: string, allowSelfApproval: unknown) {
  if (ownerUid === actorUid && allowSelfApproval !== true)
    throw new HttpError(403, 'SELF_APPROVAL', 'Self-approval requires explicit administrator policy.');
}
