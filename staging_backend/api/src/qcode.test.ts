import assert from "node:assert/strict";
import test from "node:test";
import { formatQCode, parseExistingQCode, proposeNextQCode } from "./qcode.js";

test("formats new Q Codes with a four-digit annual employee sequence", () => {
  assert.equal(formatQCode({ year: 2026, employeeCode: "JCG", sequence: 1 }), "26QJCG0001");
  assert.equal(formatQCode({ year: 2026, employeeCode: "jcg", sequence: 140 }), "26QJCG0140");
  assert.equal(formatQCode({ year: 2027, employeeCode: " LPR ", sequence: 1 }), "27QLPR0001");
});

test("rejects invalid employee prefixes, years, and sequence numbers", () => {
  assert.throws(() => formatQCode({ year: 2026, employeeCode: "JC", sequence: 1 }), RangeError);
  assert.throws(() => formatQCode({ year: 1999, employeeCode: "JCG", sequence: 1 }), RangeError);
  assert.throws(() => formatQCode({ year: 2026, employeeCode: "JCG", sequence: 0 }), RangeError);
  assert.throws(() => formatQCode({ year: 2026, employeeCode: "JCG", sequence: 10000 }), RangeError);
});

test("reads legacy sequence widths without rewriting historical codes", () => {
  assert.deepEqual(parseExistingQCode("25QIAN69"), { year: 2025, employeeCode: "IAN", sequence: 69 });
  assert.deepEqual(parseExistingQCode("25QJCG109"), { year: 2025, employeeCode: "JCG", sequence: 109 });
  assert.deepEqual(parseExistingQCode("25QGEO0198"), { year: 2025, employeeCode: "GEO", sequence: 198 });
});

test("recognizes observed legacy revision suffixes for collision prevention", () => {
  assert.equal(parseExistingQCode("26QFGP049.1")?.sequence, 49);
  assert.equal(parseExistingQCode("26QPJR003 R1")?.sequence, 3);
  assert.equal(parseExistingQCode("26QLPR094-R1")?.sequence, 94);
  assert.equal(parseExistingQCode("25QLPR056 REV1-1")?.sequence, 56);
});

test("does not guess malformed cells containing multiple or rearranged Q Codes", () => {
  assert.equal(parseExistingQCode("26QDPA025 / 26QDPA049"), null);
  assert.equal(parseExistingQCode("REV_26GEO022"), null);
  assert.equal(parseExistingQCode("not a q code"), null);
});

test("bootstrap proposal stops on an unrecognized value from the requested series", () => {
  assert.throws(
    () => proposeNextQCode(["26QDPA0103", "26QDPA025 / 26QDPA049"], 2026, "DPA"),
    /manual review is required/
  );
});

test("an unrelated malformed series does not block the requested employee", () => {
  const result = proposeNextQCode(["26QDPA025 / 26QDPA049", "26QJCG0140"], 2026, "JCG");
  assert.equal(result.qCode, "26QJCG0141");
});

test("proposes the next code per employee and year using four digits", () => {
  const result = proposeNextQCode(
    ["26QJCG0001", "26QJCG0140", "26QLPR0185", "25QJCG0200"],
    2026,
    "JCG"
  );

  assert.deepEqual(result, { qCode: "26QJCG0141", sequence: 141, priorMaximum: 140 });
});

test("repeated Q Codes for multiple line items do not consume new sequences", () => {
  const result = proposeNextQCode(["26QJCG0140", "26QJCG0140", "26QJCG0140"], 2026, "JCG");
  assert.equal(result.qCode, "26QJCG0141");
});

test("an employee sequence starts at 0001 each year", () => {
  const result = proposeNextQCode(["26QLPR0185"], 2027, "LPR");
  assert.equal(result.qCode, "27QLPR0001");
});

test("different employees have independent annual sequences", () => {
  const result = proposeNextQCode(["26QJCG0140", "26QLPR0185"], 2026, "LPR");
  assert.equal(result.qCode, "26QLPR0186");
});

test("sequence 9999 cannot roll into a fifth digit", () => {
  assert.throws(
    () => proposeNextQCode(["26QJCG9999"], 2026, "JCG"),
    /sequence is exhausted/
  );
});
