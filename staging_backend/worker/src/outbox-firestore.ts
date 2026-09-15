import type { Firestore } from 'firebase-admin/firestore';
import type { Job, JobStore } from './outbox-delivery.js';
export function notificationJobs(db: Firestore): JobStore {
  return { transact: (id, work) => db.runTransaction(async tx => {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid notification ID.');
    const ref = db.collection('notificationOutbox').doc(id), snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error('Notification not found.');
    const data = snapshot.data()!, result = work(data as Job);
    tx.set(ref, { ...data, ...result.job });
    return result.result;
  }) };
}
