import "./styles.css";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { ApiError, createApproval, getApproval, openQuotation, submitDecision } from "./api";
import type { ApprovalStatus, ApprovalView, DataChecks, DataCheckState } from "./types";
import { renderTrackerTest } from "./tracker-test";
import { isWorkspacePath, renderWorkspace } from "./workspace";

const appElement = document.querySelector<HTMLDivElement>("#app");
if (!appElement) throw new Error("Missing #app root.");
const app = appElement;

function approvalIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/a\/([A-Za-z0-9_-]{20,80})\/?$/);
  return match?.[1] ?? null;
}

function isTrackerTestPath(): boolean {
  return /^\/tracker-test\/?$/.test(window.location.pathname);
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function detail(label: string, value: string): string {
  return `<div class="detail"><div class="detail-label">${esc(label)}</div><div class="detail-value">${esc(value || "-")}</div></div>`;
}

function formatMoney(value: number | null, currency: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not provided";

  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${currency || "PHP"} ${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function formatPercent(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not provided";
  return `${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}%`;
}

function formatDiscount(percent: number | null, amount: number | null, currency: string): string {
  const percentText = formatPercent(percent);
  const amountText = formatMoney(amount, currency);
  if (percentText !== "Not provided" && amountText !== "Not provided") return `${percentText} (${amountText})`;
  return percentText !== "Not provided" ? percentText : amountText;
}

function statusPresentation(status: ApprovalStatus): { label: string; className: string } {
  if (status === "APPROVED") return { label: "Approved", className: "approved" };
  if (status === "RETURNED_FOR_CORRECTION") return { label: "Returned for Correction", className: "returned" };
  return { label: "Pending Review", className: "pending" };
}

function dataCheckPresentation(state: DataCheckState): { label: string; className: string } {
  if (state === "PASSED") return { label: "Passed", className: "check-passed" };
  if (state === "ATTENTION_REQUIRED") return { label: "Attention Required", className: "check-attention" };
  return { label: "Not Run", className: "check-not-run" };
}

function overallDataCheckState(checks: DataChecks): DataCheckState {
  const states = [checks.requiredFields, checks.calculationsVat, checks.templateFidelity, checks.fileNaming];
  if (checks.warnings.length > 0 || states.includes("ATTENTION_REQUIRED")) return "ATTENTION_REQUIRED";
  if (states.every(state => state === "PASSED")) return "PASSED";
  return "NOT_RUN";
}

function dataCheckRow(label: string, hint: string, state: DataCheckState): string {
  const presentation = dataCheckPresentation(state);
  return `<div class="check-row">
    <div><div class="check-name">${esc(label)}</div><div class="check-hint">${esc(hint)}</div></div>
    <span class="check-status ${presentation.className}">${esc(presentation.label)}</span>
  </div>`;
}

function renderMessage(title: string, message: string, actionHtml = ""): void {
  app.innerHTML = `
    <main class="container">
      <section class="center-card" aria-live="polite">
        <div class="brand-lockup">Macrotech</div>
        <h1>${esc(title)}</h1>
        <p>${esc(message)}</p>
        ${actionHtml}
      </section>
    </main>`;
}

function humanApiError(error: unknown): { title: string; message: string } {
  if (error instanceof ApiError) {
    if (error.code === "WRONG_APPROVER") {
      return { title: "Different Google account required", message: error.message };
    }
    if (error.code === "INVALID_SESSION" || error.status === 401) {
      return { title: "Sign in required", message: "Sign in again with the Google account assigned to this approval." };
    }
    if (error.status === 404) {
      return {
        title: "Approval not found",
        message: "This approval link is no longer available. Ask the preparer to confirm the approval reference."
      };
    }
    if (error.code === "FINAL_DECISION_EXISTS" || error.code === "IDEMPOTENCY_CONFLICT") {
      return { title: "Decision already recorded", message: error.message };
    }
    return {
      title: "Unable to complete request",
      message: `${error.message}${error.requestId ? ` Reference: ${error.requestId}` : ""}`
    };
  }
  return {
    title: "Unable to complete request",
    message: "Please try again. If the problem continues, contact the quotation administrator."
  };
}

function newDecisionRequestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function performGoogleSignIn(): Promise<void> {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch {
    renderSignIn("Sign-in did not complete. Your browser may have blocked or closed the Google sign-in window.");
  }
}

function renderSignIn(message = "Use the Google account assigned to this quotation approval."): void {
  renderMessage(
    "Sign in to review",
    message,
    `<button id="sign-in" class="primary" type="button">Continue with Google</button>`
  );
  document.querySelector<HTMLButtonElement>("#sign-in")?.addEventListener("click", () => void performGoogleSignIn());
}

function signedInAs(user: User): string {
  return user.email ? `Signed in as ${user.email}` : "Signed in with Google";
}


type DecisionAction = "APPROVE" | "RETURN";

function confirmDecision(options: {
  action: DecisionAction;
  qCode: string;
  totalAmount: string;
  discount: string;
  totalAfterDiscount: string;
  markup: string;
  dutiesAndTaxes: string;
  safetyFactor: string;
  dataChecksLabel: string;
  requesterComment: string;
}): Promise<boolean> {
  return new Promise(resolve => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const approving = options.action === "APPROVE";
    const title = approving ? "Confirm Approval" : "Confirm Return for Correction";
    const prompt = approving
      ? "Review the commercial details below before recording the final approval."
      : "Review the commercial details below before returning this quotation for correction.";
    const confirmLabel = approving ? "Confirm Approval" : "Confirm Return";

    overlay.innerHTML = `
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <div class="confirm-header">
          <div class="eyebrow">Macrotech Quotation Approval</div>
          <h2 id="confirm-title">${esc(title)}</h2>
          <p id="confirm-description">${esc(prompt)}</p>
        </div>
        <div class="confirm-grid">
          <div class="confirm-field confirm-field-wide"><span>Q Code</span><strong>${esc(options.qCode)}</strong></div>
          <div class="confirm-field"><span>Total Amount</span><strong>${esc(options.totalAmount)}</strong></div>
          <div class="confirm-field"><span>Mark-Up</span><strong>${esc(options.markup)}</strong></div>
          ${options.discount !== "Not provided" ? `<div class="confirm-field"><span>Discount</span><strong>${esc(options.discount)}</strong></div>` : ""}
          ${options.totalAfterDiscount !== "Not provided" ? `<div class="confirm-field"><span>Total After Discount</span><strong>${esc(options.totalAfterDiscount)}</strong></div>` : ""}
          <div class="confirm-field"><span>Duties and Taxes</span><strong>${esc(options.dutiesAndTaxes)}</strong></div>
          <div class="confirm-field"><span>Safety Factor</span><strong>${esc(options.safetyFactor)}</strong></div>
          <div class="confirm-field confirm-field-wide"><span>Data Checks</span><strong>${esc(options.dataChecksLabel)}</strong></div>
          <div class="confirm-field confirm-field-wide requester-confirm-comment"><span>Requester Comment</span><div>${esc(options.requesterComment)}</div></div>
        </div>
        <div class="confirm-final-note">This decision will be final.</div>
        <div class="confirm-actions">
          <button id="confirm-cancel" class="confirm-cancel" type="button">Cancel</button>
          <button id="confirm-submit" class="confirm-submit ${approving ? "confirm-approve" : "confirm-return"}" type="button">${esc(confirmLabel)}</button>
        </div>
      </section>`;

    document.body.appendChild(overlay);
    const cancelButton = overlay.querySelector<HTMLButtonElement>("#confirm-cancel")!;
    const submitButton = overlay.querySelector<HTMLButtonElement>("#confirm-submit")!;

    const close = (confirmed: boolean) => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      previousFocus?.focus();
      resolve(confirmed);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };

    overlay.addEventListener("click", event => {
      if (event.target === overlay) close(false);
    });
    cancelButton.addEventListener("click", () => close(false));
    submitButton.addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKeyDown);
    cancelButton.focus();
  });
}

async function renderApproval(id: string): Promise<void> {
  try {
    const record = await getApproval(id);
    const finalDecision = record.status !== "PENDING_REVIEW";
    const status = statusPresentation(record.status);
    const currentUser = auth.currentUser;
    const commercial = record.commercial;
    const totalAmount = formatMoney(commercial.totalAmount, commercial.currency);
    const markup = formatPercent(commercial.markupPercent);
    const discount = formatDiscount(commercial.discountPercent, commercial.discountAmount, commercial.currency);
    const totalAfterDiscount = formatMoney(commercial.totalAfterDiscount, commercial.currency);
    const vatLabel = commercial.vatRatePercent === null
      ? "VAT"
      : `VAT (${formatPercent(commercial.vatRatePercent)})`;
    const dataChecks = record.dataChecks;
    const overallChecks = dataCheckPresentation(overallDataCheckState(dataChecks));

    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div>
            <div class="brand">Macrotech</div>
            <div class="product">Quotation Approval System</div>
          </div>
          <div class="account">${esc(currentUser ? signedInAs(currentUser) : "")}</div>
        </header>
        <main class="container">
          <div class="status ${status.className}">${esc(status.label)}</div>
          <section class="card">
            <div class="hero">
              <div class="eyebrow">Quotation</div>
              <div class="qcode">${esc(record.qCode || "Not assigned")}</div>
            </div>
            ${detail("Customer", record.customer)}
            ${detail("Revision", record.revision)}
            ${detail("Source Type", record.sourceType)}
            ${detail("Source Reference", record.sourceReference)}
            ${detail("RFQ / Inquiry", record.rfqInquiry)}
            ${detail("Prepared By", record.requesterName || record.requesterEmail)}
            ${detail("Assigned Approver", record.approverEmail)}
          </section>

          <section class="card commercial-card" aria-label="Commercial review">
            <div class="section-heading">
              <div>
                <div class="eyebrow">Internal approval information</div>
                <div class="section-title">Commercial Review</div>
              </div>
              <span class="internal-badge">Internal</span>
            </div>
            <div class="commercial-metrics">
              <div class="commercial-metric">
                <span>Total Amount</span>
                <strong>${esc(totalAmount)}</strong>
              </div>
              <div class="commercial-metric">
                <span>Markup</span>
                <strong>${esc(markup)}</strong>
              </div>
            </div>
            ${detail("Subtotal", formatMoney(commercial.subtotal, commercial.currency))}
            ${detail(vatLabel, formatMoney(commercial.vatAmount, commercial.currency))}
            ${discount !== "Not provided" ? detail("Discount", discount) : ""}
            ${totalAfterDiscount !== "Not provided" ? detail("Total After Discount", totalAfterDiscount) : ""}
            ${detail("Duties and Taxes", commercial.dutiesAndTaxes || "Not provided")}
            ${detail("Safety Factor", commercial.safetyFactor || "Not provided")}
            ${detail("Delivery", commercial.delivery || "Not provided")}
            <div class="commercial-note">Markup is internal review information and is not intended for the customer-facing quotation.</div>
          </section>

          <section class="card requester-comment-card">
            <div class="section-heading"><div><div class="eyebrow">Submitted by requester</div><div class="section-title">Requester Comment</div></div></div>
            <div class="comment-display">${esc(record.requesterComment || "No comment provided")}</div>
          </section>

          <section class="card checks-card" aria-label="Quotation data checks">
            <div class="section-heading">
              <div>
                <div class="eyebrow">Pre-approval validation</div>
                <div class="section-title">Quotation Data Checks</div>
              </div>
              <span class="check-status ${overallChecks.className}">${esc(overallChecks.label)}</span>
            </div>
            ${dataCheckRow("Required Fields", "Customer, item, price, supplier, delivery and terms", dataChecks.requiredFields)}
            ${dataCheckRow("Calculations & VAT", "Totals, formulas and applicable VAT treatment", dataChecks.calculationsVat)}
            ${dataCheckRow("Template Fidelity", "Approved quotation format and required sections", dataChecks.templateFidelity)}
            ${dataCheckRow("File Naming", "Expected quotation file naming convention", dataChecks.fileNaming)}
            ${dataChecks.warnings.length > 0
              ? `<div class="check-warnings"><strong>Items requiring attention</strong><ul>${dataChecks.warnings.map(warning => `<li>${esc(warning)}</li>`).join("")}</ul></div>`
              : overallDataCheckState(dataChecks) === "NOT_RUN"
                ? `<div class="check-note">Automated validation results have not been supplied yet. The quotation generator will populate these checks before employee-wide release.</div>`
                : `<div class="check-note">No validation warnings were reported for this quotation snapshot.</div>`}
          </section>

          ${record.quotationAvailable
            ? `<button id="open-quotation" class="action-link" type="button">Open Full Quotation</button>`
            : `<section class="card"><div class="comment-card muted">Quotation PDF has not been attached yet.</div></section>`}

          ${finalDecision
            ? `<section class="card decision" aria-live="polite">
                 <span class="muted">Decision completed</span>
                 <strong>${esc(status.label)}</strong>
                 <div>${esc(record.decisionByEmail || "")}</div>
                 ${record.decisionComment ? `<p>${esc(record.decisionComment)}</p>` : ""}
               </section>`
            : `<section class="card comment-card">
                 <label for="comment">Approval comment</label>
                 <textarea id="comment" maxlength="2000" placeholder="Optional for approval. Required when returning for correction."></textarea>
                 <div id="message" class="message" role="status" aria-live="polite"></div>
               </section>
               <div class="fixed-actions" aria-label="Approval actions">
                 <button id="return" class="return" type="button">Return for Correction</button>
                 <button id="approve" class="approve" type="button">Approve Quotation</button>
               </div>`}

          <div class="ref">Approval reference: ${esc(record.id)}</div>
        </main>
      </div>`;

    document.querySelector<HTMLButtonElement>("#open-quotation")?.addEventListener("click", async event => {
      const button = event.currentTarget as HTMLButtonElement;
      const original = button.textContent ?? "Open Full Quotation";
      button.disabled = true;
      button.textContent = "Opening quotation…";
      try {
        await openQuotation(id);
      } catch (error) {
        const details = humanApiError(error);
        window.alert(`${details.title}\n\n${details.message}`);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    });

    if (!finalDecision) {
      const approve = document.querySelector<HTMLButtonElement>("#approve")!;
      const ret = document.querySelector<HTMLButtonElement>("#return")!;
      const comment = document.querySelector<HTMLTextAreaElement>("#comment")!;
      const message = document.querySelector<HTMLDivElement>("#message")!;

      const setBusy = (busy: boolean, action?: "APPROVE" | "RETURN") => {
        approve.disabled = busy;
        ret.disabled = busy;
        approve.textContent = busy && action === "APPROVE" ? "Saving…" : "Approve Quotation";
        ret.textContent = busy && action === "RETURN" ? "Saving…" : "Return for Correction";
      };

      const decide = async (action: "APPROVE" | "RETURN") => {
        const text = comment.value.trim();
        if (action === "RETURN" && !text) {
          message.className = "message error";
          message.textContent = "Please enter what needs to be corrected.";
          comment.focus();
          return;
        }

        const confirmed = await confirmDecision({
          action,
          qCode: record.qCode || "Not assigned",
          totalAmount,
          discount,
          totalAfterDiscount,
          markup,
          dutiesAndTaxes: commercial.dutiesAndTaxes || "Not provided",
          safetyFactor: commercial.safetyFactor || "Not provided",
          dataChecksLabel: overallChecks.label,
          requesterComment: record.requesterComment || "No comment provided"
        });
        if (!confirmed) return;

        setBusy(true, action);
        message.className = "message muted";
        message.textContent = "Saving decision…";

        try {
          const operationKey = `macrotech-decision-${auth.currentUser?.uid}-${id}-${record.snapshotHash}-${action}-${text}`;
          const operationId = sessionStorage.getItem(operationKey) || newDecisionRequestId();
          sessionStorage.setItem(operationKey, operationId);
          await submitDecision(id, action, text, operationId, record.snapshotHash);
          await renderApproval(id);
        } catch (error) {
          if (error instanceof ApiError && (error.code === "FINAL_DECISION_EXISTS" || error.code === "IDEMPOTENCY_CONFLICT")) {
            await renderApproval(id);
            return;
          }

          const details = humanApiError(error);
          message.className = "message error";
          message.textContent = details.message;
          setBusy(false);
        }
      };

      approve.addEventListener("click", () => void decide("APPROVE"));
      ret.addEventListener("click", () => void decide("RETURN"));
    }
  } catch (error) {
    const details = humanApiError(error);
    const wrongAccount = error instanceof ApiError && error.code === "WRONG_APPROVER";
    const invalidSession = error instanceof ApiError && (error.code === "INVALID_SESSION" || error.status === 401);

    renderMessage(
      details.title,
      details.message,
      wrongAccount || invalidSession
        ? `<button id="switch-account" class="primary" type="button">Switch Google account</button>`
        : `<button id="retry-load" class="secondary" type="button">Try again</button>`
    );

    document.querySelector<HTMLButtonElement>("#switch-account")?.addEventListener("click", async () => {
      await signOut(auth);
      await performGoogleSignIn();
    });
    document.querySelector<HTMLButtonElement>("#retry-load")?.addEventListener("click", () => void renderApproval(id));
  }
}


function numberOrNull(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function renderSubmission(user: User): void {
  app.innerHTML = `
    <div class="shell submit-shell">
      <header class="topbar">
        <div><div class="brand">Macrotech</div><div class="product">Approval Test • Requester</div></div>
        <div class="account">${esc(signedInAs(user))}</div>
      </header>
      <main class="container submit-container">
        <div class="test-banner"><strong>Approval Workflow Test</strong><span>This form creates only an approval test record. Try the new <a href="/workspace">Employee Workspace</a> for private autosaved drafts, or use the separate <a href="/tracker-test">Automated Tracker Fill Test</a>.</span></div>
        <section class="card form-card">
          <div class="section-heading"><div><div class="eyebrow">Step 1</div><div class="section-title">Submit for Approval</div></div></div>
          <form id="approval-form">
            <div class="form-grid">
              <label class="field"><span>Q Code *</span><input id="qcode" maxlength="80" value="25QLPR053" required></label>
              <label class="field"><span>Customer *</span><input id="customer" maxlength="300" value="TVI Resource Development Phils. Inc." required></label>
              <label class="field"><span>RFQ / Inquiry</span><input id="rfq" maxlength="200" value="B-25-12329"></label>
              <label class="field"><span>Approver Google Email *</span><input id="approver" type="email" value="kelvinkcastro12@gmail.com" required></label>
              <label class="field"><span>Total Amount (PHP)</span><input id="total" inputmode="decimal" placeholder="179928.00"></label>
              <label class="field"><span>Mark-Up (%)</span><input id="markup" inputmode="decimal" placeholder="65"></label>
              <label class="field"><span>Discount (%)</span><input id="discount" type="number" min="0" max="100" step="any" placeholder="e.g. 5"></label>
              <label class="field"><span>Duties and Taxes</span><input id="duties" maxlength="200" placeholder="e.g. Included / ₱15,000 / 8%"></label>
              <label class="field"><span>Safety Factor</span><input id="safety" maxlength="120" placeholder="e.g. 10%"></label>
              <label class="field field-wide"><span>Delivery</span><input id="delivery" maxlength="200" placeholder="e.g. 10-12 weeks or earlier"></label>
              <label class="field field-wide"><span>Comment for Approver</span><textarea id="requester-comment" maxlength="2000" placeholder="Add context the approver should see before making a decision."></textarea></label>
            </div>
            <div id="submit-message" class="message" role="status" aria-live="polite"></div>
            <button id="submit-approval" class="primary submit-button" type="submit">Submit for Approval</button>
          </form>
        </section>
      </main>
    </div>`;

  const form = document.querySelector<HTMLFormElement>("#approval-form")!;
  const button = document.querySelector<HTMLButtonElement>("#submit-approval")!;
  const message = document.querySelector<HTMLDivElement>("#submit-message")!;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    button.textContent = "Submitting…";
    message.className = "message muted";
    message.textContent = "Creating approval request and notification…";

    const qCode = (document.querySelector<HTMLInputElement>("#qcode")!.value).trim();
    const customer = (document.querySelector<HTMLInputElement>("#customer")!.value).trim();
    const rfq = (document.querySelector<HTMLInputElement>("#rfq")!.value).trim();
    const approverEmail = (document.querySelector<HTMLInputElement>("#approver")!.value).trim();
    const totalAmount = numberOrNull(document.querySelector<HTMLInputElement>("#total")!.value);
    const markupPercent = numberOrNull(document.querySelector<HTMLInputElement>("#markup")!.value);
    const discountPercent = numberOrNull(document.querySelector<HTMLInputElement>("#discount")!.value);
    const discountAmount = totalAmount !== null && discountPercent !== null
      ? Math.round((totalAmount * discountPercent / 100 + Number.EPSILON) * 100) / 100
      : null;
    const totalAfterDiscount = totalAmount !== null && discountAmount !== null
      ? Math.round((totalAmount - discountAmount + Number.EPSILON) * 100) / 100
      : null;
    const dutiesAndTaxes = document.querySelector<HTMLInputElement>("#duties")!.value.trim();
    const safetyFactor = document.querySelector<HTMLInputElement>("#safety")!.value.trim();
    const delivery = document.querySelector<HTMLInputElement>("#delivery")!.value.trim();
    const requesterComment = document.querySelector<HTMLTextAreaElement>("#requester-comment")!.value.trim();

    try {
      const created = await createApproval({
        qCode,
        sourceType: "Q_CODE",
        sourceReference: rfq,
        rfqInquiry: rfq,
        revision: "",
        customer,
        requesterName: user.displayName || "",
        approverEmail,
        requesterComment,
        quotationStorageObject: "",
        commercial: {
          currency: "PHP",
          subtotal: null,
          vatRatePercent: null,
          vatAmount: null,
          totalAmount,
          discountPercent,
          discountAmount,
          totalAfterDiscount,
          markupPercent,
          dutiesAndTaxes,
          safetyFactor,
          delivery
        },
        dataChecks: {
          requiredFields: "NOT_RUN",
          calculationsVat: "NOT_RUN",
          templateFidelity: "NOT_RUN",
          fileNaming: "NOT_RUN",
          warnings: []
        }
      });

      app.innerHTML = `
        <main class="container">
          <section class="center-card success-card">
            <div class="brand-lockup">Macrotech</div>
            <div class="success-mark">✓</div>
            <h1>Submitted for Approval</h1>
            <p>The approval request was created. The notification worker will send the approver the commercial review and your comment.</p>
            <div class="submission-summary">${detail("Q Code", qCode)}${detail("Approver", approverEmail)}${detail("Total Amount", formatMoney(totalAmount, "PHP"))}${discountPercent !== null ? detail("Discount", formatDiscount(discountPercent, discountAmount, "PHP")) : ""}${totalAfterDiscount !== null ? detail("Total After Discount", formatMoney(totalAfterDiscount, "PHP")) : ""}${detail("Mark-Up", formatPercent(markupPercent))}${detail("Duties and Taxes", dutiesAndTaxes || "Not provided")}${detail("Safety Factor", safetyFactor || "Not provided")}</div>
            <a class="primary link-button" href="${esc(created.approvalUrl)}">Open Approval Test</a>
          </section>
        </main>`;
    } catch (error) {
      const details = humanApiError(error);
      message.className = "message error";
      message.textContent = details.message;
      button.disabled = false;
      button.textContent = "Submit for Approval";
    }
  });
}

function renderSubmissionSignIn(): void {
  renderMessage(
    "Approval Workflow Test",
    "Sign in with the requester Google account to submit a test quotation for approval.",
    `<button id="sign-in" class="primary" type="button">Continue with Google</button>`
  );
  document.querySelector<HTMLButtonElement>("#sign-in")?.addEventListener("click", () => void performGoogleSignIn());
}

const approvalId = approvalIdFromPath();
const trackerTest = isTrackerTestPath();
const workspace = isWorkspacePath();

if (workspace) {
  renderMessage("Loading Employee Workspace", "Please wait…");
  onAuthStateChanged(auth, user => {
    if (!user) {
      renderMessage(
        "Employee Workspace",
        "Sign in with your Macrotech Google account to access My Quotations and private autosaved drafts.",
        `<button id="sign-in" class="primary" type="button">Continue with Google</button>`
      );
      document.querySelector<HTMLButtonElement>("#sign-in")?.addEventListener("click", () => void performGoogleSignIn());
      return;
    }
    void renderWorkspace(app, user);
  });
} else if (trackerTest) {
  renderMessage("Loading Tracker test", "Please wait…");
  onAuthStateChanged(auth, user => {
    if (!user) {
      renderMessage(
        "Automated Tracker Fill Test",
        "Sign in with the requester Google account to generate a pilot Q Code and fill the Dummy Tracker.",
        `<button id="sign-in" class="primary" type="button">Continue with Google</button>`
      );
      document.querySelector<HTMLButtonElement>("#sign-in")?.addEventListener("click", () => void performGoogleSignIn());
      return;
    }
    renderTrackerTest(app, user);
  });
} else if (!approvalId) {

  renderMessage("Loading approval test", "Please wait…");
  onAuthStateChanged(auth, user => {
    if (!user) {
      renderSubmissionSignIn();
      return;
    }
    renderSubmission(user);
  });
} else {
  renderMessage("Checking approval", "Please wait…");

  onAuthStateChanged(auth, async user => {
    if (!user) {
      renderSignIn();
      return;
    }
    await renderApproval(approvalId);
  });
}
