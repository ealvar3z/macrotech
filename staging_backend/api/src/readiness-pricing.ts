import { z } from 'zod';

// Decimal strings retain the desktop's exact forex/cost values. All operations
// use rational BigInts; only monetary outputs round half-up to integer cents.
const decimal = z.string().regex(/^\d{1,12}(?:\.\d{1,9})?$/);
const text = z.string().trim().min(1).max(4000);
const option = z.object({
  id: text, supplier: text, offer: z.string().max(4000).default(''),
  co_sbm: z.enum(['CO', 'SBM', 'N/A']), currency: z.enum(['PHP', 'USD', 'EUR']),
  unit_price: decimal, freight_cost: decimal, packing_cost: decimal,
  bank_charges: decimal, other_charges: decimal, forex_rate: decimal,
  duty_rate: decimal, markup_multiplier: decimal, safety_factor_rate: decimal,
  cost_basis_mode: z.enum(['IMPORTED', 'LOCAL', 'OVERRIDE']), cost_basis_override: decimal,
  macrotech_delivery: z.string().max(2000).default(''),
  supplier_delivery: z.string().max(2000).default(''),
  internal_notes: z.string().max(4000).default(''), availability: z.string().max(2000).default('')
});
export const snapshotSchema = z.object({
  customer: text, buyer: text, rfq_reference: text,
  billing_address: z.string().max(4000).default(''), delivery_address: z.string().max(4000).default(''),
  customer_tin: z.string().max(200).default(''), buyer_email: z.string().max(320).default(''),
  employee_comments: z.string().max(4000).default(''),
  discount_requested_percent: decimal,
  terms_version: z.number().int().positive(), terms_text: text,
  items: z.array(z.object({
    item_no: text, description: text, uom: text, quantity: decimal,
    macrotech_offer: z.string().max(4000).default(''),
    macrotech_delivery: z.string().max(2000).default(''),
    selected_supplier_id: text, supplier_options: z.array(option).min(1).max(10)
  })).min(1).max(25)
});
export type Snapshot = z.infer<typeof snapshotSchema>;
type R = { n: bigint; d: bigint };
function r(value: string): R {
  const [whole, fraction = ''] = value.split('.');
  return { n: BigInt(whole! + fraction), d: 10n ** BigInt(fraction.length) };
}
export function compareDecimal(a: string, b: string): number {
  decimal.parse(a); decimal.parse(b);
  const x = r(a), y = r(b), difference = x.n * y.d - y.n * x.d;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
const add = (a: R, b: R): R => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const mul = (a: R, b: R): R => ({ n: a.n * b.n, d: a.d * b.d });
const div = (a: R, b: R): R => ({ n: a.n * b.d, d: a.d * b.n });
function cents(a: R): number {
  const result = Number((a.n * 200n + a.d) / (2n * a.d));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) throw new Error('Monetary limit exceeded.');
  return result;
}
export function discountCents(total: number, percent: string): number {
  decimal.parse(percent);
  if (Number(percent) > 100) throw new Error('Discount must be between 0 and 100%.');
  const p = r(percent);
  return Number((BigInt(total) * p.n * 2n + 100n * p.d) / (200n * p.d));
}
export function priceSnapshot(input: unknown) {
  const snapshot = snapshotSchema.parse(input);
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 400_000) throw new Error('Quotation snapshot exceeds safe document size.');
  if (new Set(snapshot.items.map(item => item.item_no)).size !== snapshot.items.length) throw new Error('Duplicate item numbers.');
  let rawSubtotal = r('0');
  const items = snapshot.items.map(item => {
    if (Number(item.quantity) <= 0) throw new Error('Positive quantity required.');
    const ids = item.supplier_options.map(s => s.id);
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate supplier IDs.');
    for (const s of item.supplier_options) {
      if (Number(s.forex_rate) <= 0 || Number(s.markup_multiplier) <= 0) throw new Error('Positive forex and markup required.');
      if (s.currency === 'PHP' && Number(s.forex_rate) !== 1) throw new Error('PHP forex must equal one.');
      if (s.cost_basis_mode === 'LOCAL' && s.currency !== 'PHP') throw new Error('Local costing requires PHP.');
    }
    const s = item.supplier_options.find(s => s.id === item.selected_supplier_id);
    if (!s) throw new Error('Select exactly one supplier.');
    let cost = mul(r(item.quantity), r(s.unit_price));
    for (const fee of [s.freight_cost, s.packing_cost, s.bank_charges, s.other_charges]) cost = add(cost, r(fee));
    if (s.cost_basis_mode !== 'LOCAL') {
      cost = mul(mul(mul(cost, r(s.forex_rate)), add(r('1'), r(s.duty_rate))), add(r('1'), r(s.safety_factor_rate)));
      if (s.cost_basis_mode === 'OVERRIDE' && Number(s.cost_basis_override) > 0) cost = r(s.cost_basis_override);
    }
    const vatIn = mul(cost, r(s.markup_multiplier));
    const vatEx = div(vatIn, r('1.12'));
    if (cents(vatIn) <= 0) throw new Error('Complete positive cost basis required.');
    rawSubtotal = add(rawSubtotal, vatEx);
    // Deliberate allowlist: neither selected nor alternate supplier identities,
    // sourcing costs, internal notes or markup leak into customer documents.
    return { itemNo: item.item_no, buyerRequirement: item.description,
      offer: item.macrotech_offer || s.offer || item.description, quantity: item.quantity, uom: item.uom,
      delivery: item.macrotech_delivery || s.macrotech_delivery || 'To be confirmed',
      unitVatExCents: cents(div(vatEx, r(item.quantity))), lineVatExCents: cents(vatEx), lineVatInCents: cents(vatIn),
      markupMultiplier: s.markup_multiplier, dutyRate: s.duty_rate, safetyFactorRate: s.safety_factor_rate };
  });
  const totalCents = cents(mul(rawSubtotal, r('1.12')));
  const discount = discountCents(totalCents, snapshot.discount_requested_percent);
  return { snapshot, customer: { customer: snapshot.customer, buyer: snapshot.buyer, buyerEmail: snapshot.buyer_email,
    billingAddress: snapshot.billing_address, deliveryAddress: snapshot.delivery_address, customerTin: snapshot.customer_tin,
    rfqReference: snapshot.rfq_reference, items, subtotalCents: cents(rawSubtotal),
    vatCents: cents(mul(rawSubtotal, r('0.12'))), totalCents, requestedDiscountCents: discount,
    proposedFinalCents: totalCents - discount, termsVersion: snapshot.terms_version, termsText: snapshot.terms_text } };
}
