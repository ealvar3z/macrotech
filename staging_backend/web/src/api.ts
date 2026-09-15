import { auth } from "./firebase";
import type {
  ApiErrorBody,
  ApprovalView,
  CreateApprovalInput,
  PilotTrackerSubmissionInput,
  PilotTrackerSubmissionResult,
  QuotationDraftPayload,
  QuotationDraftView
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly code?: string
  ) {
    super(message);
  }
}

async function authHeaders(includeJson = true): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Sign in is required.", 401, undefined, "AUTH_REQUIRED");

  const idToken = await user.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
    ...(includeJson ? { "Content-Type": "application/json" } : {})
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Preserve a safe generic message for non-JSON proxy or network responses.
  }

  throw new ApiError(
    body.error?.message ?? "The request could not be completed.",
    response.status,
    body.error?.requestId ?? response.headers.get("x-request-id") ?? undefined,
    body.error?.code
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", 408, undefined, "REQUEST_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getApproval(id: string): Promise<ApprovalView> {
  const response = await fetchWithTimeout(
    `/api/v1/approvals/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: await authHeaders(false),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<ApprovalView>(response);
}

export async function submitDecision(
  id: string,
  action: "APPROVE" | "RETURN",
  comment: string,
  requestId: string,
  expectedSnapshotHash: string
): Promise<{ status: ApprovalView["status"] }> {
  const response = await fetchWithTimeout(
    `/api/v1/approvals/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify({ action, comment, requestId, expectedSnapshotHash }),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<{ status: ApprovalView["status"] }>(response);
}

export async function openQuotation(id: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new ApiError("Sign in is required.", 401);

  // Open immediately from the user click so iOS/Safari does not classify
  // the eventual PDF viewer as an async pop-up.
  const viewer = window.open("about:blank", "_blank");

  try {
    const token = await user.getIdToken();
    const response = await fetchWithTimeout(
      `/api/v1/approvals/${encodeURIComponent(id)}/quotation`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      },
      60_000
    );

    if (!response.ok) {
      viewer?.close();
      await parseResponse<never>(response);
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    if (viewer) {
      viewer.opener = null;
      viewer.location.replace(url);
    } else {
      // A strict browser may still block the new window. Preserve functionality
      // by opening the authenticated PDF blob in the current tab.
      window.location.assign(url);
    }

    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    viewer?.close();
    throw error;
  }
}

export async function createApproval(input: CreateApprovalInput): Promise<{ id: string; status: ApprovalView["status"]; approvalUrl: string }> {
  // A lost acknowledgement must retry the same operation, including after reload.
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const key = `macrotech-submit-${auth.currentUser?.uid}-${digest}`;
  const submissionId = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, submissionId);
  const headers = new Headers(await authHeaders(true));
  headers.set('X-Idempotency-Key', submissionId);
  const response = await fetchWithTimeout(
    `/api/v1/approvals`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<{ id: string; status: ApprovalView["status"]; approvalUrl: string }>(response);
}

export async function submitPilotTrackerEntry(
  input: PilotTrackerSubmissionInput
): Promise<PilotTrackerSubmissionResult> {
  const response = await fetchWithTimeout(
    "/api/v1/pilot-tracker/entries",
    {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify(input),
      cache: "no-store"
    },
    60_000
  );
  return parseResponse<PilotTrackerSubmissionResult>(response);
}


export async function listQuotationDrafts(): Promise<QuotationDraftView[]> {
  const response = await fetchWithTimeout(
    "/api/v1/quotation-drafts",
    {
      method: "GET",
      headers: await authHeaders(false),
      cache: "no-store"
    },
    30_000
  );
  const result = await parseResponse<{ drafts: QuotationDraftView[] }>(response);
  return result.drafts;
}

export async function createQuotationDraft(): Promise<QuotationDraftView> {
  const response = await fetchWithTimeout(
    "/api/v1/quotation-drafts",
    {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify({}),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<QuotationDraftView>(response);
}

export async function getQuotationDraft(id: string): Promise<QuotationDraftView> {
  const response = await fetchWithTimeout(
    `/api/v1/quotation-drafts/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: await authHeaders(false),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<QuotationDraftView>(response);
}

export async function saveQuotationDraft(
  id: string,
  payload: QuotationDraftPayload,
  clientRevision: number
): Promise<QuotationDraftView> {
  const response = await fetchWithTimeout(
    `/api/v1/quotation-drafts/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: await authHeaders(true),
      body: JSON.stringify({ payload, clientRevision }),
      cache: "no-store"
    },
    30_000
  );
  return parseResponse<QuotationDraftView>(response);
}

export async function deleteQuotationDraft(id: string): Promise<void> {
  const response = await fetchWithTimeout(
    `/api/v1/quotation-drafts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: await authHeaders(false),
      cache: "no-store"
    },
    30_000
  );
  if (response.status === 204) return;
  await parseResponse<never>(response);
}

export async function generateQuotationDraft(id: string): Promise<QuotationDraftView> {
  const response = await fetchWithTimeout(
    `/api/v1/quotation-drafts/${encodeURIComponent(id)}/generate`,
    {
      method: "POST",
      headers: await authHeaders(true),
      body: JSON.stringify({}),
      cache: "no-store"
    },
    60_000
  );
  return parseResponse<QuotationDraftView>(response);
}
