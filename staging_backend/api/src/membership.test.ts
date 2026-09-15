import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMember, assertReviewPolicy } from './membership.js';
test('legacy API cannot use bootstrap email or mere assignment as authority', () => {
  for (const user of [undefined, { role: 'approver' }, { role: 'approver', active: false, email: 'a@example.invalid' }, { role: 'preparer', active: true, email: 'a@example.invalid' }])
    assert.throws(() => assertMember(user, 'a@example.invalid', ['approver', 'admin']));
  assert.doesNotThrow(() => assertMember({ role: 'approver', active: true, email: 'a@example.invalid' }, 'A@example.invalid', ['approver']));
});
test('self review policy fails closed and does not accept truthy strings', () => {
  for (const policy of [undefined, false, 'true', 1]) assert.throws(() => assertReviewPolicy('same', 'same', policy));
  assert.doesNotThrow(() => assertReviewPolicy('same', 'same', true));
});
