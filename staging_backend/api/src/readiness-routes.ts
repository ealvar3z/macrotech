import { Router } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from './auth.js';
import { firestoreTransactions } from './readiness-firestore.js';
import { ReadinessWorkflow, type Identity } from './readiness-workflow.js';
import { HttpError } from './errors.js';

export function readinessRoutes(db: Firestore) {
  const router = Router(), service = new ReadinessWorkflow(firestoreTransactions(db));
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
  const actor = (req: AuthenticatedRequest): Identity => ({ uid: req.actor!.uid, email: req.actor!.email!, verified: req.actor!.email_verified === true });
  const execute = (work: (req: AuthenticatedRequest) => Promise<unknown>) =>
    async (req: AuthenticatedRequest, res: any, next: any) => {
      try { res.json(await work(req)); }
      catch (error) {
        next(error instanceof z.ZodError ? new HttpError(400, 'VALIDATION_ERROR', 'Invalid workflow input.') : error);
      }
    };
  const save = z.object({ requestId: z.uuid(), expectedVersion: z.number().int().nonnegative(), snapshot: z.unknown() }).strict();
  const recall = z.object({ requestId: z.uuid(), expectedVersion: z.number().int().nonnegative(), reason: z.string() }).strict();
  const revise = recall.omit({ reason: true });
  const po = revise.extend({ number: z.string(), accepted: z.record(z.string(), z.string()) });
  router.get('/desktop/current-user', execute(req => service.currentUser(actor(req))));
  router.post('/desktop/submissions', execute(req => service.submitDesktop(actor(req), req.body)));
  router.get('/desktop/quotations/:id', execute(req => service.read(actor(req), String(req.params.id))));
  router.post('/desktop/approvals/:id/decision', execute(req => service.decide(actor(req), String(req.params.id), req.body)));
  router.get('/quotations/:id', execute(req => service.read(actor(req), String(req.params.id))));
  router.put('/quotations/:id', execute(req => {
    const body = save.parse(req.body);
    return service.save(actor(req), String(req.params.id), body.requestId, body.expectedVersion, body.snapshot);
  }));
  router.post('/submissions', execute(req => service.submit(actor(req), req.body)));
  router.post('/approvals/:id/decision', execute(req => service.decide(actor(req), String(req.params.id), req.body)));
  router.post('/quotations/:id/recall', execute(req => {
    const body = recall.parse(req.body); return service.recall(actor(req), String(req.params.id), body.requestId, body.expectedVersion, body.reason);
  }));
  router.post('/quotations/:id/revise', execute(req => {
    const body = revise.parse(req.body); return service.revise(actor(req), String(req.params.id), body.requestId, body.expectedVersion);
  }));
  router.post('/quotations/:id/customer-po', execute(req => {
    const body = po.parse(req.body); return service.recordPO(actor(req), String(req.params.id), body.requestId, body.expectedVersion, body.number, body.accepted);
  }));
  return router;
}
