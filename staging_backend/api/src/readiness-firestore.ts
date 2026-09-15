import type { Firestore } from 'firebase-admin/firestore';
import type { TransactionStore } from './readiness-workflow.js';

/** Uses application default credentials in a deployed runtime; no key files. */
export function firestoreTransactions(db: Firestore): TransactionStore {
  return { run: work => db.runTransaction(async transaction => work({
    get: async path => (await transaction.get(db.doc(path))).data(),
    create: (path, value) => { transaction.create(db.doc(path), value); },
    set: (path, value) => { transaction.set(db.doc(path), value); }
  })) };
}
