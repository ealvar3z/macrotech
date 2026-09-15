export interface QCodeParts {
  year: number;
  employeeCode: string;
  sequence: number;
}

export interface ProposedQCode {
  qCode: string;
  sequence: number;
  priorMaximum: number;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2099;
const MAX_SEQUENCE = 9999;

function normalizedEmployeeCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new RangeError("Employee Q-Code prefix must contain exactly three letters.");
  }
  return normalized;
}

function validatedYear(value: number): number {
  if (!Number.isInteger(value) || value < MIN_YEAR || value > MAX_YEAR) {
    throw new RangeError("Q-Code year must be a four-digit year from 2000 through 2099.");
  }
  return value;
}

function validatedSequence(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEQUENCE) {
    throw new RangeError("Q-Code sequence must be an integer from 1 through 9999.");
  }
  return value;
}

export function formatQCode(parts: QCodeParts): string {
  const year = validatedYear(parts.year);
  const employeeCode = normalizedEmployeeCode(parts.employeeCode);
  const sequence = validatedSequence(parts.sequence);
  const shortYear = String(year % 100).padStart(2, "0");

  return `${shortYear}Q${employeeCode}${String(sequence).padStart(4, "0")}`;
}

/**
 * Reads both the new four-digit format and older one-to-four-digit codes.
 * A small set of observed legacy revision suffixes is accepted only so a
 * migration/bootstrap scan cannot accidentally reuse their base sequence.
 * New revisions must be stored in a separate field and must not change the
 * base Q Code.
 */
export function parseExistingQCode(value: string): QCodeParts | null {
  const normalized = value.trim().toUpperCase();
  const match = /^(\d{2})Q([A-Z]{3})(\d{1,4})(?:\.\d+|\s+R\d+|-R\d+|\s+REV\d+(?:-\d+)?)?$/.exec(normalized);
  if (!match) return null;

  const shortYear = Number(match[1]);
  const sequence = Number(match[3]);
  if (sequence < 1 || sequence > MAX_SEQUENCE) return null;

  return {
    year: 2000 + shortYear,
    employeeCode: match[2]!,
    sequence
  };
}

/**
 * Produces a proposal for local analysis and migration planning.
 * Production allocation must use a single Firestore transaction against one
 * counter document per year and employee; callers must never allocate by
 * scanning the Tracker at request time.
 */
export function proposeNextQCode(
  existingValues: Iterable<string>,
  yearValue: number,
  employeeCodeValue: string
): ProposedQCode {
  const year = validatedYear(yearValue);
  const employeeCode = normalizedEmployeeCode(employeeCodeValue);
  const targetPrefix = `${String(year % 100).padStart(2, "0")}Q${employeeCode}`;
  let priorMaximum = 0;

  for (const value of existingValues) {
    const parsed = parseExistingQCode(value);
    if (parsed?.year === year && parsed.employeeCode === employeeCode) {
      priorMaximum = Math.max(priorMaximum, parsed.sequence);
    } else if (!parsed && value.trim().toUpperCase().includes(targetPrefix)) {
      throw new RangeError(
        `Unrecognized historical Q-Code value for ${targetPrefix}; manual review is required before bootstrap.`
      );
    }
  }

  if (priorMaximum >= MAX_SEQUENCE) {
    throw new RangeError(`Q-Code sequence is exhausted for ${year} ${employeeCode}.`);
  }

  const sequence = priorMaximum + 1;
  return {
    qCode: formatQCode({ year, employeeCode, sequence }),
    sequence,
    priorMaximum
  };
}
