import type { User } from "firebase/auth";
import { ApiError, submitPilotTrackerEntry } from "./api";
import type { PilotTrackerItemInput, PilotTrackerSubmissionInput } from "./types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requestId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function dueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function itemHtml(index: number): string {
  const number = index + 1;
  return `<section class="tracker-item" data-item-index="${index}">
    <div class="tracker-item-header">
      <div><div class="eyebrow">Line Item</div><strong>Item ${number}</strong></div>
      <button class="remove-item secondary compact-button" type="button" ${index === 0 ? "disabled" : ""}>Remove</button>
    </div>
    <div class="form-grid tracker-item-grid">
      <label class="field"><span>Item Number *</span><input data-field="itemNumber" maxlength="40" value="${number}" required></label>
      <label class="field"><span>UOM *</span><input data-field="uom" maxlength="30" value="PC" required></label>
      <label class="field field-wide"><span>Description / RFQ *</span><input data-field="description" maxlength="500" value="Pilot item ${number}" required></label>
      <label class="field field-wide"><span>Our Offer *</span><input data-field="offer" maxlength="500" value="Synthetic product model MT-${number}00" required></label>
      <label class="field field-wide"><span>Supplier / Email *</span><input data-field="supplier" maxlength="300" value="Test Supplier / supplier@example.com" required></label>
      <label class="field"><span>Quantity *</span><input data-field="quantity" type="number" min="0.000001" step="any" value="1" required></label>
      <label class="field"><span>Currency *</span><select data-field="currency" required><option value="PHP">PHP</option><option value="USD" selected>USD</option><option value="EUR">EUR</option></select></label>
      <label class="field"><span>Unit Price *</span><input data-field="unitPrice" type="number" min="0" step="any" value="1000" required></label>
      <label class="field"><span>Forex Rate *</span><input data-field="forexRate" type="number" min="0.000001" step="any" value="58.5" required></label>
      <label class="field"><span>Supplier Delivery</span><input data-field="supplierDeliveryPeriod" maxlength="120" value="4-6 weeks"></label>
      <label class="field"><span>Macrotech Delivery</span><input data-field="macrotechDeliveryPeriod" maxlength="120" value="8-10 weeks"></label>
      <details class="tracker-advanced field-wide">
        <summary>Additional costing fields</summary>
        <div class="form-grid tracker-advanced-grid">
          <label class="field"><span>Freight Cost</span><input data-field="freightCost" type="number" min="0" step="any" value="0"></label>
          <label class="field"><span>Packing Cost</span><input data-field="packingCost" type="number" min="0" step="any" value="0"></label>
          <label class="field"><span>Bank Charges</span><input data-field="bankCharges" type="number" min="0" step="any" value="0"></label>
          <label class="field"><span>Other Charges</span><input data-field="otherCharges" type="number" min="0" step="any" value="0"></label>
          <label class="field"><span>Duty Rate (%)</span><input data-field="dutyRatePercent" type="number" min="0" max="100" step="any" value="8"></label>
          <label class="field"><span>Mark-Up Multiplier</span><input data-field="markupMultiplier" type="number" min="0" max="100" step="any" value="1.75"></label>
          <label class="field field-wide"><span>Mark-Up Remarks</span><input data-field="markupRemarks" maxlength="300" value="Pilot values only"></label>
          <label class="field field-wide"><span>Additional Remarks</span><input data-field="additionalRemarks" maxlength="500" value="Not connected to the live Master Tracker"></label>
        </div>
      </details>
    </div>
  </section>`;
}

function numberValue(item: HTMLElement, field: string): number {
  const value = item.querySelector<HTMLInputElement>(`[data-field="${field}"]`)?.value ?? "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a valid number.`);
  return number;
}

function textValue(item: HTMLElement, field: string): string {
  return (item.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${field}"]`)?.value ?? "").trim();
}

function readItems(): PilotTrackerItemInput[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".tracker-item")).map(item => ({
    itemNumber: textValue(item, "itemNumber"),
    description: textValue(item, "description"),
    offer: textValue(item, "offer"),
    supplier: textValue(item, "supplier"),
    uom: textValue(item, "uom"),
    quantity: numberValue(item, "quantity"),
    currency: textValue(item, "currency"),
    unitPrice: numberValue(item, "unitPrice"),
    freightCost: numberValue(item, "freightCost"),
    packingCost: numberValue(item, "packingCost"),
    bankCharges: numberValue(item, "bankCharges"),
    otherCharges: numberValue(item, "otherCharges"),
    supplierDeliveryPeriod: textValue(item, "supplierDeliveryPeriod"),
    forexRate: numberValue(item, "forexRate"),
    dutyRatePercent: numberValue(item, "dutyRatePercent"),
    markupMultiplier: numberValue(item, "markupMultiplier"),
    macrotechDeliveryPeriod: textValue(item, "macrotechDeliveryPeriod"),
    markupRemarks: textValue(item, "markupRemarks"),
    additionalRemarks: textValue(item, "additionalRemarks")
  }));
}

export function renderTrackerTest(app: HTMLDivElement, user: User): void {
  app.innerHTML = `<div class="shell submit-shell">
    <header class="topbar">
      <div><div class="brand">Macrotech</div><div class="product">Automated Tracker Fill • Pilot</div></div>
      <div class="account">${esc(user.email ?? "Signed in with Google")}</div>
    </header>
    <main class="container tracker-container">
      <div class="test-banner"><strong>Dummy Tracker Test Only</strong><span>This creates a new four-digit Q Code and fills only the separate Dummy Tracker. It does not use Gmail or write to the live 2026 TR.</span></div>
      <form id="tracker-form">
        <section class="card form-card">
          <div class="section-heading"><div><div class="eyebrow">Step 1</div><div class="section-title">Quotation Information</div></div></div>
          <div class="tracker-form-body form-grid">
            <label class="field"><span>Pilot Employee Code</span><input id="employee-code" maxlength="3" value="TST" readonly aria-readonly="true"></label>
            <label class="field"><span>Quotation Due Date *</span><input id="quotation-due-date" type="date" value="${dueDate()}" required></label>
            <label class="field"><span>RFQ / Inquiry Reference *</span><input id="tracker-rfq" maxlength="200" value="PILOT-RFQ-0002" required></label>
            <label class="field"><span>CO SBM</span><input id="co-sbm" maxlength="40" value="SBM"></label>
            <label class="field field-wide"><span>Company / Customer *</span><input id="tracker-customer" maxlength="300" value="PILOT CUSTOMER - NOT LIVE" required></label>
            <label class="field field-wide"><span>Buyer / Email</span><input id="tracker-buyer" maxlength="300" value="Test Buyer / test.buyer@example.com"></label>
          </div>
        </section>
        <section class="card form-card">
          <div class="section-heading tracker-lines-heading">
            <div><div class="eyebrow">Step 2</div><div class="section-title">Quotation Line Items</div></div>
            <button id="add-item" class="secondary compact-button" type="button">Add Line Item</button>
          </div>
          <div id="tracker-items">${itemHtml(0)}</div>
        </section>
        <div id="tracker-message" class="message" role="status" aria-live="polite"></div>
        <button id="submit-tracker" class="primary submit-button tracker-submit" type="submit">Generate Q Code & Fill Dummy Tracker</button>
      </form>
    </main>
  </div>`;

  const form = document.querySelector<HTMLFormElement>("#tracker-form")!;
  const items = document.querySelector<HTMLDivElement>("#tracker-items")!;
  const addItem = document.querySelector<HTMLButtonElement>("#add-item")!;
  const button = document.querySelector<HTMLButtonElement>("#submit-tracker")!;
  const message = document.querySelector<HTMLDivElement>("#tracker-message")!;
  let currentRequestId = requestId();

  addItem.addEventListener("click", () => {
    const count = items.querySelectorAll(".tracker-item").length;
    if (count >= 25) return;
    items.insertAdjacentHTML("beforeend", itemHtml(count));
  });

  items.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.classList.contains("remove-item")) return;
    target.closest(".tracker-item")?.remove();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    addItem.disabled = true;
    button.textContent = "Generating and filling…";
    message.className = "message muted";
    message.textContent = "Reserving the Q Code and writing the Dummy Tracker row(s)…";

    try {
      const submission: PilotTrackerSubmissionInput = {
        requestId: currentRequestId,
        employeeCode: document.querySelector<HTMLInputElement>("#employee-code")!.value.trim(),
        quotationDueDate: document.querySelector<HTMLInputElement>("#quotation-due-date")!.value,
        rfqReference: document.querySelector<HTMLInputElement>("#tracker-rfq")!.value.trim(),
        customer: document.querySelector<HTMLInputElement>("#tracker-customer")!.value.trim(),
        buyer: document.querySelector<HTMLInputElement>("#tracker-buyer")!.value.trim(),
        coSbm: document.querySelector<HTMLInputElement>("#co-sbm")!.value.trim(),
        items: readItems()
      };
      const result = await submitPilotTrackerEntry(submission);
      const trackerUrl = String(import.meta.env.VITE_PILOT_TRACKER_URL ?? "").trim();
      app.innerHTML = `<main class="container">
        <section class="center-card success-card">
          <div class="brand-lockup">Macrotech</div>
          <div class="success-mark">✓</div>
          <h1>Dummy Tracker Filled</h1>
          <p>The Q Code was reserved and ${result.itemCount} ${result.itemCount === 1 ? "row was" : "rows were"} written without using Gmail or the live Master Tracker.</p>
          <div class="submission-summary">
            <div class="detail"><div class="detail-label">Q Code</div><div class="detail-value">${esc(result.qCode)}</div></div>
            <div class="detail"><div class="detail-label">Sheet</div><div class="detail-value">${esc(result.sheetName)}</div></div>
            <div class="detail"><div class="detail-label">Rows</div><div class="detail-value">${esc(result.rowRange)}</div></div>
          </div>
          ${trackerUrl ? `<a class="primary link-button" href="${esc(trackerUrl)}" target="_blank" rel="noopener">Open Dummy Tracker</a>` : ""}
        </section>
      </main>`;
      currentRequestId = requestId();
    } catch (error) {
      const messageText = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "The Dummy Tracker test could not be completed.";
      message.className = "message error";
      message.textContent = messageText;
      button.disabled = false;
      addItem.disabled = false;
      button.textContent = "Generate Q Code & Fill Dummy Tracker";
    }
  });
}
