import type { User } from "firebase/auth";
import {
  ApiError,
  createQuotationDraft,
  deleteQuotationDraft,
  generateQuotationDraft,
  getQuotationDraft,
  listQuotationDrafts,
  saveQuotationDraft
} from "./api";
import type {
  QuotationDraftItem,
  QuotationDraftPayload,
  QuotationDraftSupplierOption,
  QuotationDraftView
} from "./types";

function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function blankSupplierOption(index: number): QuotationDraftSupplierOption {
  return {
    id: index === 0 ? "supplier-1" : crypto.randomUUID(),
    supplier: "",
    currency: "USD",
    unitPrice: null,
    freightCost: 0,
    packingCost: 0,
    bankCharges: 0,
    otherCharges: 0,
    supplierDeliveryPeriod: "",
    availability: "",
    internalNotes: "",
    forexRate: null,
    dutyRatePercent: 8
  };
}

function blankItem(index: number): QuotationDraftItem {
  const supplier = blankSupplierOption(0);
  return {
    itemNumber: String(index + 1),
    description: "",
    offer: "",
    uom: "PC",
    quantity: 1,
    supplierOptions: [supplier],
    selectedSupplierOptionId: supplier.id,
    markupMultiplier: 1.75,
    macrotechDeliveryPeriod: "",
    markupRemarks: "",
    additionalRemarks: ""
  };
}

function supplierOptionHtml(
  option: QuotationDraftSupplierOption,
  index: number,
  selected: boolean,
  locked: boolean,
  radioName: string,
  optionCount: number
): string {
  const disabled = locked ? " disabled" : "";
  const numberValue = (value: number | null): string => value === null ? "" : String(value);
  return `<section class="supplier-option" data-option-id="${esc(option.id)}">
    <div class="supplier-option-head">
      <label class="supplier-select"><input type="radio" name="${esc(radioName)}" data-supplier-select value="${esc(option.id)}"${selected ? " checked" : ""}${disabled}><span>Use for quotation</span></label>
      <div class="supplier-option-title">Supplier Option ${index + 1}</div>
      ${locked ? "" : `<button class="secondary compact-button remove-supplier-option" type="button"${optionCount === 1 ? " disabled" : ""}>Remove Supplier</button>`}
    </div>
    <div class="form-grid supplier-option-grid">
      <label class="field field-wide"><span>Supplier / Name / Email *</span><input data-supplier-field="supplier" maxlength="300" value="${esc(option.supplier)}"${disabled}></label>
      <label class="field"><span>Currency *</span><input data-supplier-field="currency" maxlength="3" value="${esc(option.currency)}" placeholder="USD"${disabled}></label>
      <label class="field"><span>Unit Price *</span><input data-supplier-field="unitPrice" type="number" min="0" step="any" value="${esc(numberValue(option.unitPrice))}"${disabled}></label>
      <label class="field"><span>Supplier Delivery / Lead Time</span><input data-supplier-field="supplierDeliveryPeriod" maxlength="120" value="${esc(option.supplierDeliveryPeriod)}"${disabled}></label>
      <label class="field"><span>Availability</span><input data-supplier-field="availability" maxlength="160" value="${esc(option.availability)}" placeholder="e.g. In stock, 5 available, made to order"${disabled}></label>
      <label class="field field-wide"><span>Internal Supplier Notes</span><textarea data-supplier-field="internalNotes" maxlength="2000" placeholder="Internal comparison notes. Never sent to the customer."${disabled}>${esc(option.internalNotes)}</textarea></label>
      <details class="tracker-advanced field-wide">
        <summary>Supplier costing details</summary>
        <div class="form-grid tracker-advanced-grid">
          <label class="field"><span>Forex Rate *</span><input data-supplier-field="forexRate" type="number" min="0.000001" step="any" value="${esc(numberValue(option.forexRate))}"${disabled}></label>
          <label class="field"><span>Freight Cost</span><input data-supplier-field="freightCost" type="number" min="0" step="any" value="${esc(numberValue(option.freightCost))}"${disabled}></label>
          <label class="field"><span>Packing Cost</span><input data-supplier-field="packingCost" type="number" min="0" step="any" value="${esc(numberValue(option.packingCost))}"${disabled}></label>
          <label class="field"><span>Bank Charges</span><input data-supplier-field="bankCharges" type="number" min="0" step="any" value="${esc(numberValue(option.bankCharges))}"${disabled}></label>
          <label class="field"><span>Other Charges</span><input data-supplier-field="otherCharges" type="number" min="0" step="any" value="${esc(numberValue(option.otherCharges))}"${disabled}></label>
          <label class="field"><span>Duty Rate (%)</span><input data-supplier-field="dutyRatePercent" type="number" min="0" max="100" step="any" value="${esc(numberValue(option.dutyRatePercent))}"${disabled}></label>
        </div>
      </details>
    </div>
  </section>`;
}

function itemHtml(item: QuotationDraftItem, index: number, locked: boolean): string {
  const disabled = locked ? " disabled" : "";
  const numberValue = (value: number | null): string => value === null ? "" : String(value);
  const radioName = `selected-supplier-${crypto.randomUUID()}`;
  return `<section class="tracker-item workspace-item" data-item-index="${index}">
    <div class="tracker-item-head">
      <div><div class="eyebrow">Line Item ${index + 1}</div><div class="section-title small">Quotation Item</div></div>
      ${index > 0 && !locked ? `<button class="secondary compact-button remove-workspace-item" type="button">Remove</button>` : ""}
    </div>
    <div class="form-grid tracker-item-grid">
      <label class="field"><span>Item Number *</span><input data-field="itemNumber" maxlength="40" value="${esc(item.itemNumber)}"${disabled}></label>
      <label class="field"><span>UOM *</span><input data-field="uom" maxlength="30" value="${esc(item.uom)}"${disabled}></label>
      <label class="field field-wide"><span>Description / RFQ *</span><input data-field="description" maxlength="500" value="${esc(item.description)}"${disabled}></label>
      <label class="field field-wide"><span>Our Offer *</span><input data-field="offer" maxlength="500" value="${esc(item.offer)}"${disabled}></label>
      <label class="field"><span>Quantity *</span><input data-field="quantity" type="number" min="0.000001" step="any" value="${esc(numberValue(item.quantity))}"${disabled}></label>
      <div class="supplier-options-field field-wide">
        <div class="supplier-options-heading"><div><strong>Supplier Options</strong><span>Select exactly one option to drive customer pricing. Alternates stay hidden from the customer and are retained as internal Tracker comparison rows.</span></div>${locked ? "" : `<button class="secondary compact-button add-supplier-option" type="button">Add Supplier Option</button>`}</div>
        <div class="supplier-options">${item.supplierOptions.map((option, optionIndex) => supplierOptionHtml(option, optionIndex, option.id === item.selectedSupplierOptionId, locked, radioName, item.supplierOptions.length)).join("")}</div>
        <div class="supplier-ranking-note">Ready for future cheapest, fastest, landed-cost, and preferred-supplier indicators. No automatic ranking is applied in this pilot.</div>
      </div>
      <details class="tracker-advanced field-wide item-quotation-settings">
        <summary>Quotation costing and remarks</summary>
        <div class="form-grid tracker-advanced-grid">
          <label class="field"><span>Mark-Up Multiplier</span><input data-field="markupMultiplier" type="number" min="0" max="100" step="any" value="${esc(numberValue(item.markupMultiplier))}"${disabled}></label>
          <label class="field"><span>Macrotech Delivery</span><input data-field="macrotechDeliveryPeriod" maxlength="120" value="${esc(item.macrotechDeliveryPeriod)}"${disabled}></label>
          <label class="field field-wide"><span>Mark-Up Remarks</span><input data-field="markupRemarks" maxlength="300" value="${esc(item.markupRemarks)}"${disabled}></label>
          <label class="field field-wide"><span>Additional Remarks</span><input data-field="additionalRemarks" maxlength="500" value="${esc(item.additionalRemarks)}" placeholder="Discount notes may stay here when applicable."${disabled}></label>
        </div>
      </details>
    </div>
  </section>`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The request could not be completed.";
}

function pathDraftId(): string | null {
  const match = window.location.pathname.match(/^\/workspace\/([0-9a-f-]{36})\/?$/i);
  return match?.[1] ?? null;
}

export function isWorkspacePath(): boolean {
  return /^\/workspace(?:\/[0-9a-f-]{36})?\/?$/i.test(window.location.pathname);
}

export async function renderWorkspace(app: HTMLDivElement, user: User): Promise<void> {
  const draftId = pathDraftId();
  if (draftId) {
    await renderDraftEditor(app, user, draftId);
    return;
  }
  await renderWorkspaceList(app, user);
}

async function renderWorkspaceList(app: HTMLDivElement, user: User): Promise<void> {
  app.innerHTML = `<main class="container"><section class="center-card"><div class="brand-lockup">Macrotech</div><h1>Loading My Quotations</h1><p>Please wait…</p></section></main>`;
  try {
    const drafts = await listQuotationDrafts();
    const rows = drafts.length === 0
      ? `<div class="workspace-empty"><strong>No quotations yet.</strong><span>Create your first private draft. It will auto-save while you work.</span></div>`
      : `<div class="workspace-table-wrap"><table class="workspace-table"><thead><tr><th>Q Code</th><th>Customer</th><th>RFQ / Inquiry</th><th>Status</th><th>Last saved</th></tr></thead><tbody>${drafts.map(draft => `<tr class="workspace-row" data-draft-id="${esc(draft.id)}" tabindex="0"><td>${esc(draft.qCode ?? "Not assigned")}</td><td>${esc(draft.payload.customer || "Untitled quotation")}</td><td>${esc(draft.payload.rfqReference || "—")}</td><td><span class="workspace-status ${draft.status === "GENERATED" ? "generated" : "draft"}">${draft.status === "GENERATED" ? "Generated" : "Draft"}</span></td><td>${esc(displayDate(draft.updatedAt ?? draft.createdAt))}</td></tr>`).join("")}</tbody></table></div>`;

    app.innerHTML = `<div class="shell submit-shell">
      <header class="topbar"><div><div class="brand">Macrotech</div><div class="product">Employee Workspace • Multi-Supplier Pilot</div></div><div class="account">${esc(user.email ?? "Signed in")}</div></header>
      <main class="container workspace-container">
        <div class="workspace-hero"><div><div class="eyebrow">Employee Workspace</div><h1>My Quotations</h1><p>Work here instead of editing the Master Tracker directly. Drafts are private to your signed-in account and save online automatically.</p></div><button id="new-quotation" class="primary" type="button">New Quotation</button></div>
        <div class="test-banner"><strong>Pilot boundary</strong><span>Generated quotations still write only to the separate Dummy Tracker. The live Master Tracker remains untouched.</span></div>
        <section class="card workspace-list-card">${rows}</section>
      </main>
    </div>`;

    document.querySelector<HTMLButtonElement>("#new-quotation")?.addEventListener("click", async () => {
      const button = document.querySelector<HTMLButtonElement>("#new-quotation")!;
      button.disabled = true;
      button.textContent = "Creating…";
      try {
        const draft = await createQuotationDraft();
        window.location.assign(`/workspace/${draft.id}`);
      } catch (error) {
        button.disabled = false;
        button.textContent = "New Quotation";
        window.alert(errorMessage(error));
      }
    });

    document.querySelectorAll<HTMLElement>(".workspace-row").forEach(row => {
      const open = () => {
        const id = row.dataset.draftId;
        if (id) window.location.assign(`/workspace/${id}`);
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  } catch (error) {
    app.innerHTML = `<main class="container"><section class="center-card"><div class="brand-lockup">Macrotech</div><h1>Unable to load My Quotations</h1><p>${esc(errorMessage(error))}</p><a class="secondary link-button" href="/">Back</a></section></main>`;
  }
}

function nullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSupplierOption(element: HTMLElement): QuotationDraftSupplierOption {
  const text = (field: string): string => (element.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-supplier-field="${field}"]`)?.value ?? "").trim();
  const num = (field: string): number | null => nullableNumber(element.querySelector<HTMLInputElement>(`[data-supplier-field="${field}"]`)?.value ?? "");
  return {
    id: element.dataset.optionId ?? "",
    supplier: text("supplier"),
    currency: text("currency"),
    unitPrice: num("unitPrice"),
    freightCost: num("freightCost"),
    packingCost: num("packingCost"),
    bankCharges: num("bankCharges"),
    otherCharges: num("otherCharges"),
    supplierDeliveryPeriod: text("supplierDeliveryPeriod"),
    availability: text("availability"),
    internalNotes: text("internalNotes"),
    forexRate: num("forexRate"),
    dutyRatePercent: num("dutyRatePercent")
  };
}

function readItem(element: HTMLElement): QuotationDraftItem {
  const text = (field: string): string => (element.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${field}"]`)?.value ?? "").trim();
  const num = (field: string): number | null => nullableNumber(element.querySelector<HTMLInputElement>(`[data-field="${field}"]`)?.value ?? "");
  return {
    itemNumber: text("itemNumber"),
    description: text("description"),
    offer: text("offer"),
    uom: text("uom"),
    quantity: num("quantity"),
    supplierOptions: Array.from(element.querySelectorAll<HTMLElement>(".supplier-option")).map(readSupplierOption),
    selectedSupplierOptionId: element.querySelector<HTMLInputElement>("[data-supplier-select]:checked")?.value ?? "",
    markupMultiplier: num("markupMultiplier"),
    macrotechDeliveryPeriod: text("macrotechDeliveryPeriod"),
    markupRemarks: text("markupRemarks"),
    additionalRemarks: text("additionalRemarks")
  };
}

function readPayload(): QuotationDraftPayload {
  return {
    employeeCode: document.querySelector<HTMLInputElement>("#workspace-employee-code")!.value.trim(),
    quotationDueDate: document.querySelector<HTMLInputElement>("#workspace-due-date")!.value,
    rfqReference: document.querySelector<HTMLInputElement>("#workspace-rfq")!.value.trim(),
    customer: document.querySelector<HTMLInputElement>("#workspace-customer")!.value.trim(),
    buyer: document.querySelector<HTMLInputElement>("#workspace-buyer")!.value.trim(),
    coSbm: document.querySelector<HTMLInputElement>("#workspace-co-sbm")!.value.trim(),
    items: Array.from(document.querySelectorAll<HTMLElement>(".workspace-item")).map(readItem)
  };
}

async function renderDraftEditor(app: HTMLDivElement, user: User, draftId: string): Promise<void> {
  app.innerHTML = `<main class="container"><section class="center-card"><div class="brand-lockup">Macrotech</div><h1>Loading quotation</h1><p>Please wait…</p></section></main>`;
  try {
    let draft = await getQuotationDraft(draftId);
    const locked = draft.status === "GENERATED";
    const payload = draft.payload;
    app.innerHTML = `<div class="shell submit-shell">
      <header class="topbar"><div><div class="brand">Macrotech</div><div class="product">Employee Workspace • Multi-Supplier Pilot</div></div><div class="account">${esc(user.email ?? "Signed in")}</div></header>
      <main class="container tracker-container workspace-editor-container">
        <div class="workspace-editor-head"><a class="workspace-back" href="/workspace">← My Quotations</a><div class="autosave-state ${locked ? "locked" : "saved"}" id="autosave-state">${locked ? "Generated • Locked" : "Saved"}</div></div>
        <div class="test-banner"><strong>${locked ? `Generated ${esc(draft.qCode ?? "")}` : "Private Draft"}</strong><span>${locked ? `This snapshot is locked. Dummy Tracker ${esc(draft.trackerRowRange ?? "")} was updated.` : "Your draft saves online automatically after you pause typing. It does not update the Dummy Tracker until you generate it."}</span></div>
        <form id="workspace-form">
          <section class="card form-card">
            <div class="section-heading"><div><div class="eyebrow">Quotation</div><div class="section-title">Quotation Information</div></div></div>
            <div class="tracker-form-body form-grid">
              <label class="field"><span>Pilot Employee Code</span><input id="workspace-employee-code" maxlength="3" value="${esc(payload.employeeCode)}" readonly aria-readonly="true"></label>
              <label class="field"><span>Quotation Due Date *</span><input id="workspace-due-date" type="date" value="${esc(payload.quotationDueDate)}"${locked ? " disabled" : ""}></label>
              <label class="field"><span>RFQ / Inquiry Reference *</span><input id="workspace-rfq" maxlength="200" value="${esc(payload.rfqReference)}"${locked ? " disabled" : ""}></label>
              <label class="field"><span>CO SBM</span><input id="workspace-co-sbm" maxlength="40" value="${esc(payload.coSbm)}"${locked ? " disabled" : ""}></label>
              <label class="field field-wide"><span>Company / Customer *</span><input id="workspace-customer" maxlength="300" value="${esc(payload.customer)}"${locked ? " disabled" : ""}></label>
              <label class="field field-wide"><span>Buyer / Email</span><input id="workspace-buyer" maxlength="300" value="${esc(payload.buyer)}"${locked ? " disabled" : ""}></label>
            </div>
          </section>
          <section class="card form-card">
            <div class="section-heading tracker-lines-heading"><div><div class="eyebrow">Line Items</div><div class="section-title">Quotation Line Items</div></div>${locked ? "" : `<button id="workspace-add-item" class="secondary compact-button" type="button">Add Line Item</button>`}</div>
            <div id="workspace-items">${payload.items.map((item, index) => itemHtml(item, index, locked)).join("")}</div>
          </section>
          <div id="workspace-message" class="message" role="status" aria-live="polite"></div>
          <div class="workspace-actions">
            ${locked ? `<a class="primary link-button" href="/workspace">Back to My Quotations</a>` : `<button id="workspace-save" class="secondary" type="button">Save Draft</button><button id="workspace-delete" class="danger-outline" type="button">Delete Draft</button><button id="workspace-generate" class="primary" type="button">Generate & Update Dummy Tracker</button>`}
          </div>
        </form>
      </main>
    </div>`;

    if (locked) return;

    const form = document.querySelector<HTMLFormElement>("#workspace-form")!;
    const items = document.querySelector<HTMLDivElement>("#workspace-items")!;
    const addButton = document.querySelector<HTMLButtonElement>("#workspace-add-item")!;
    const saveButton = document.querySelector<HTMLButtonElement>("#workspace-save")!;
    const deleteButton = document.querySelector<HTMLButtonElement>("#workspace-delete")!;
    const generateButton = document.querySelector<HTMLButtonElement>("#workspace-generate")!;
    const message = document.querySelector<HTMLDivElement>("#workspace-message")!;
    const autosaveState = document.querySelector<HTMLDivElement>("#autosave-state")!;
    let clientRevision = draft.clientRevision;
    let saveTimer: number | null = null;
    let saveChain: Promise<void> = Promise.resolve();
    let dirty = false;

    const setSaveState = (state: "saving" | "saved" | "error", text: string) => {
      autosaveState.className = `autosave-state ${state}`;
      autosaveState.textContent = text;
    };

    const performSave = async (): Promise<void> => {
      if (!dirty) return;
      dirty = false;
      const payloadSnapshot = readPayload();
      clientRevision += 1;
      const revision = clientRevision;
      setSaveState("saving", "Saving…");
      try {
        draft = await saveQuotationDraft(draftId, payloadSnapshot, revision);
        if (!dirty) setSaveState("saved", "Saved");
      } catch (error) {
        dirty = true;
        setSaveState("error", "Save failed");
        message.className = "message error";
        message.textContent = `Autosave failed: ${errorMessage(error)}`;
        throw error;
      }
    };

    const queueSave = (delay = 750) => {
      dirty = true;
      setSaveState("saving", "Unsaved changes…");
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        saveChain = saveChain.then(performSave).catch(() => undefined);
      }, delay);
    };

    const flushSave = async (): Promise<void> => {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      saveChain = saveChain.then(performSave);
      await saveChain;
    };

    form.addEventListener("input", event => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
        queueSave(500);
      }
    });
    form.addEventListener("change", () => queueSave(100));
    form.addEventListener("focusout", () => {
      if (dirty) queueSave(150);
    });

    addButton.addEventListener("click", () => {
      const count = items.querySelectorAll(".workspace-item").length;
      if (count >= 25) return;
      items.insertAdjacentHTML("beforeend", itemHtml(blankItem(count), count, false));
      queueSave(50);
    });

    items.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;

      if (target.classList.contains("remove-workspace-item")) {
        target.closest(".workspace-item")?.remove();
        queueSave(50);
        return;
      }

      if (target.classList.contains("add-supplier-option")) {
        const item = target.closest<HTMLElement>(".workspace-item");
        const supplierOptions = item?.querySelector<HTMLElement>(".supplier-options");
        if (!item || !supplierOptions) return;
        const count = supplierOptions.querySelectorAll(".supplier-option").length;
        if (count >= 10) return;
        const radioName = item.querySelector<HTMLInputElement>("[data-supplier-select]")?.name ?? `selected-supplier-${crypto.randomUUID()}`;
        supplierOptions.insertAdjacentHTML(
          "beforeend",
          supplierOptionHtml(blankSupplierOption(count), count, false, false, radioName, count + 1)
        );
        supplierOptions.querySelectorAll<HTMLButtonElement>(".remove-supplier-option").forEach(button => {
          button.disabled = false;
        });
        queueSave(50);
        return;
      }

      if (target.classList.contains("remove-supplier-option")) {
        const item = target.closest<HTMLElement>(".workspace-item");
        const options = item?.querySelector<HTMLElement>(".supplier-options");
        const option = target.closest<HTMLElement>(".supplier-option");
        if (!item || !options || !option || options.querySelectorAll(".supplier-option").length <= 1) return;
        const removedWasSelected = Boolean(option.querySelector<HTMLInputElement>("[data-supplier-select]")?.checked);
        option.remove();
        const remaining = Array.from(options.querySelectorAll<HTMLElement>(".supplier-option"));
        remaining.forEach((entry, optionIndex) => {
          const title = entry.querySelector<HTMLElement>(".supplier-option-title");
          if (title) title.textContent = `Supplier Option ${optionIndex + 1}`;
          const remove = entry.querySelector<HTMLButtonElement>(".remove-supplier-option");
          if (remove) remove.disabled = remaining.length === 1;
        });
        if (removedWasSelected) {
          const replacement = remaining[0]?.querySelector<HTMLInputElement>("[data-supplier-select]");
          if (replacement) replacement.checked = true;
        }
        queueSave(50);
      }
    });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      message.textContent = "";
      try {
        dirty = true;
        await flushSave();
      } catch {
        // Error is already surfaced by performSave.
      } finally {
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete this private draft? This cannot be undone.")) return;
      deleteButton.disabled = true;
      try {
        await deleteQuotationDraft(draftId);
        window.location.assign("/workspace");
      } catch (error) {
        deleteButton.disabled = false;
        message.className = "message error";
        message.textContent = errorMessage(error);
      }
    });

    generateButton.addEventListener("click", async () => {
      if (!window.confirm("Generate this pilot quotation now? A Q Code will be reserved and the Dummy Tracker will be updated. The generated snapshot will then be locked.")) return;
      generateButton.disabled = true;
      saveButton.disabled = true;
      deleteButton.disabled = true;
      message.className = "message muted";
      message.textContent = "Saving the final draft, reserving the Q Code, and updating the Dummy Tracker…";
      try {
        dirty = true;
        await flushSave();
        const generated = await generateQuotationDraft(draftId);
        app.innerHTML = `<main class="container"><section class="center-card success-card"><div class="brand-lockup">Macrotech</div><div class="success-mark">✓</div><h1>Quotation Generated</h1><p>Your draft was saved, a Q Code was reserved, and the separate Dummy Tracker was updated.</p><div class="submission-summary"><div class="detail"><div class="detail-label">Q Code</div><div class="detail-value">${esc(generated.qCode ?? "")}</div></div><div class="detail"><div class="detail-label">Tracker rows</div><div class="detail-value">${esc(generated.trackerRowRange ?? "")}</div></div><div class="detail"><div class="detail-label">Status</div><div class="detail-value">Generated & Locked</div></div></div><a class="primary link-button" href="/workspace">Back to My Quotations</a></section></main>`;
      } catch (error) {
        generateButton.disabled = false;
        saveButton.disabled = false;
        deleteButton.disabled = false;
        message.className = "message error";
        message.textContent = errorMessage(error);
      }
    });
  } catch (error) {
    app.innerHTML = `<main class="container"><section class="center-card"><div class="brand-lockup">Macrotech</div><h1>Quotation unavailable</h1><p>${esc(errorMessage(error))}</p><a class="secondary link-button" href="/workspace">Back to My Quotations</a></section></main>`;
  }
}
