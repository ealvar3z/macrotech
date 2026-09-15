import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverJob, type Job, type JobStore } from './outbox-delivery.js';
function fixture() {
  let job: Job = { status: 'PENDING', attempts: 0, nextAttemptAt: 0, leaseOwner: null, leaseUntil: 0 }, now = 100;
  const store: JobStore = { transact: async (_id, fn) => { const result = fn(structuredClone(job)); job = result.job; return result.result; } };
  return { store, clock: () => now, advance: () => { now += 4000000; }, get: () => job,
    set: (value: Job) => { job = value; } };
}
test('parallel outbox claims invoke provider once with stable event ID', async () => {
  const f = fixture(); let sent = 0;
  await Promise.all(Array.from({ length: 20 }, (_, i) => deliverJob(f.store, 'mock-event', String(i), async key => {
    assert.equal(key, 'mock-event'); sent++; return { outcome: 'SENT', providerMessageId: 'mock-message' };
  }, f.clock)));
  assert.equal(sent, 1); assert.equal(f.get().status, 'SENT');
});
test('definite provider rejection retries with backoff and bounded attempts', async () => {
  const f = fixture(); let attempts = 0;
  const send = async () => { attempts++; return { outcome: 'NOT_SENT' as const, retryable: true }; };
  for (let i = 0; i < 5; i++) {
    await deliverJob(f.store, 'event', 'owner', send, f.clock);
    await deliverJob(f.store, 'event', 'owner', send, f.clock);
    f.advance();
  }
  assert.equal(attempts, 5); assert.equal(f.get().status, 'DEAD');
});
test('lost acknowledgement is uncertain, never blindly resent or logged with secret text', async () => {
  const f = fixture(); let attempts = 0;
  const send = async () => { attempts++; throw new Error('Mock credential-like provider detail MUST NOT BE STORED'); };
  await deliverJob(f.store, 'event', 'owner', send, f.clock); f.advance();
  await deliverJob(f.store, 'event', 'owner2', send, f.clock);
  assert.equal(attempts, 1); assert.equal(f.get().status, 'UNCERTAIN');
  assert(!JSON.stringify(f.get()).includes('credential-like'));
});
test('expired sending lease requires reconciliation and stale owner is fenced', async () => {
  const f = fixture(); let resolve!: (value: any) => void;
  const slow = deliverJob(f.store, 'event', 'slow', () => new Promise(r => { resolve = r; }), f.clock);
  await Promise.resolve(); await Promise.resolve(); f.advance();
  await deliverJob(f.store, 'event', 'new', async () => { throw Error('Must not send twice'); }, f.clock);
  resolve({ outcome: 'SENT', providerMessageId: 'mock' });
  assert.equal(await slow, 'FENCED'); assert.equal(f.get().status, 'UNCERTAIN');
});
