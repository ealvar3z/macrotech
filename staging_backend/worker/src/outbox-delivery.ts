/** Provider-neutral delivery contract. No Gmail calls or credentials here.
 * A timeout after sending is UNKNOWN, not permission to send a duplicate.
 */
export type Job = {
  status: 'PENDING' | 'RETRY' | 'SENDING' | 'SENT' | 'UNCERTAIN' | 'DEAD';
  attempts: number; nextAttemptAt: number; leaseOwner: string | null; leaseUntil: number;
  providerMessageId?: string; lastErrorCode?: string;
};
export interface JobStore {
  transact<T>(id: string, work: (job: Job) => { job: Job; result: T }): Promise<T>;
}
export type DeliveryResult = { outcome: 'SENT'; providerMessageId: string } |
  { outcome: 'NOT_SENT'; retryable: boolean } | { outcome: 'UNKNOWN' };

export async function deliverJob(store: JobStore, jobId: string, owner: string,
  send: (idempotencyKey: string) => Promise<DeliveryResult>, clock = Date.now) {
  const claim = await store.transact(jobId, job => {
    if (['SENT', 'UNCERTAIN', 'DEAD'].includes(job.status)) return { job, result: false };
    if (job.leaseUntil > clock() || job.nextAttemptAt > clock()) return { job, result: false };
    // A dead worker may have sent mail but failed to store its acknowledgement.
    if (job.status === 'SENDING') return { job: { ...job, status: 'UNCERTAIN', leaseOwner: null, leaseUntil: 0,
      lastErrorCode: 'ACKNOWLEDGEMENT_UNKNOWN' }, result: false };
    if (job.attempts >= 5) return { job: { ...job, status: 'DEAD', lastErrorCode: 'MAX_ATTEMPTS' }, result: false };
    return { job: { ...job, status: 'SENDING', attempts: job.attempts + 1, leaseOwner: owner,
      leaseUntil: clock() + 300000 }, result: true };
  });
  if (!claim) return 'NOT_CLAIMED';
  let result: DeliveryResult;
  try { result = await send(jobId); } catch { result = { outcome: 'UNKNOWN' }; }
  return store.transact(jobId, job => {
    // Fencing: a late worker cannot overwrite a later lease/reconciliation.
    if (job.leaseOwner !== owner || job.status !== 'SENDING') return { job, result: 'FENCED' };
    const base = { ...job, leaseOwner: null, leaseUntil: 0 };
    if (result.outcome === 'SENT') return { job: { ...base, status: 'SENT', providerMessageId: result.providerMessageId }, result: 'SENT' };
    if (result.outcome === 'UNKNOWN') return { job: { ...base, status: 'UNCERTAIN', lastErrorCode: 'ACKNOWLEDGEMENT_UNKNOWN' }, result: 'UNCERTAIN' };
    const status = result.retryable && job.attempts < 5 ? 'RETRY' : 'DEAD';
    return { job: { ...base, status, nextAttemptAt: clock() + Math.min(3600000, 30000 * 2 ** job.attempts), lastErrorCode: 'PROVIDER_REJECTED' }, result: status };
  });
}
