# Windows build and remaining manual checks

No Windows executable was compiled or executed in this environment. This is a source prerelease, not a signed installer. Do not replace the recoverable v0.8.0 folder or import real business records.

## Build safely

1. Extract the entire ZIP into a new, short local path such as `C:\MacrotechTest\v0100`. Keep v0.8.0 and v0.9.0 separately. Check the external ZIP SHA-256 and run `python -B evidence/check_manifest.py` to verify the source manifest before building.
2. Read `build_windows_exe.ps1`. It downloads a private Python/Node build environment and installs packages; those downloads need your normal network/security approval. Do not bypass company controls, disable antivirus or add exclusions. The current builder's uv bootstrap uses a latest-download URL; pin and verify its checksum before treating the build as reproducible/releasable.
3. In an approved Windows PowerShell environment run `./build_windows_exe.ps1`, or use the supplied BUILD WINDOWS EXE.cmd only after reviewing its policy flags. The builder checks version, rebuilds the dashboard, runs offline unit tests, packages via PyInstaller and runs the EXE self-test.
4. Build/dependency downloads are not cloud deployment. Do not start Firebase, cloud scripts or Gmail authorization. Stop on any sign-in, consent, billing or protected workflow prompt.
5. A successful build creates `READY_TO_TEST/Macrotech Quotation Pilot Demo/`. Keep the whole directory, not just the EXE. Review the builder's output hash. Verify Windows WebView2 is installed through an approved method.
6. Run manual application tests with internet disconnected and a disposable Windows test profile. Do not copy credential/token files or old runtime databases. Verify Settings → About shows **0.10.1-online-alpha.1**.

## Offline acceptance checklist

- [ ] Launch/relaunch at 100%, 125%, 150% scaling; test small laptop resolution and maximize/restore. Logo, dialogs and controls remain usable.
- [ ] Create a synthetic customer/quotation with two buyer requirements and multiple supplier options. No real customer contacts or mail addresses.
- [ ] Expand/collapse buyer → offer → supplier repeatedly; focus does not jump, edits persist, collapsed controls do not trap keyboard focus.
- [ ] Reopen quotations and confirm every quotation line starts collapsed; only the selected line expands.
- [ ] Open every confirmation dialog at several scale factors; the background dims smoothly without shifting or resizing, and background scrolling is locked.
- [ ] Change selected supplier and compare exact costs/forex/markup/VAT with a hand calculation. Alternates remain internally available.
- [ ] Enter no discount, zero, a valid percent, 100%, negative, >100, blank and invalid text; confirm requested versus approved discount is clear and totals reconcile.
- [ ] Save, navigate immediately, close/reopen and retry after an error. A stale edit cannot overwrite a newer save. Errors remain visible without scrolling.
- [ ] Delete only an eligible unsubmitted draft, including cancel/confirm. Submitted, approved, archived/ineligible and PO records cannot be deleted through draft actions.
- [ ] Employee navigation exposes no Master Tracker/admin control. Do not click connection/import/sync controls.
- [ ] Double-click Send for approval: one local Q-Code, one pending record and one receipt. This is simulation only; local codes must never be promoted into production.
- [ ] Switch simulated roles; test approval, identical retry and conflicting retry. Self-approval is denied unless deliberately permitted in the disposable demo policy.
- [ ] Reject/return with a reason, create corrected revision, and verify original snapshot persists. Recall then attempt approval from an old view; stale operation fails.
- [ ] Internally approved quotation is not customer PO accepted. Record partial quantities, reject over-quantities, and complete the remaining acceptance as a separate action.
- [ ] Confirm active approvals and customer-PO workflows cannot be archived; eligible records require a reason and confirmation, appear under Show archived, and can be restored by an authorized user.
- [ ] Approved section shows only appropriate final PDF, customer compose, revision and PO actions; none sends mail in this build.
- [ ] Open email preview at laptop and narrow/mobile widths. Conditional discount, total and Approve/Reject/View Record are familiar, readable and inert. Escape/Close works.
- [ ] Native file picker: add/remove valid extra attachments; reject disguised executable, oversize, unsafe Office file and missing/tampered managed copy. Preview must not send them.
- [ ] Generate one-line and many-line draft/final PDFs; inspect/print preview all pages. Supplier names, alternatives, internal notes/costs and employee approval comments stay out of customer documents.
- [ ] Final PDF contains approved discount/total and low-ink Terms as the final section, with no clipping/blank surprise pages. Original commercial terms remain unchanged.
- [ ] Confirm draft PDFs save under Documents\Macrotech Quotations\Draft Quotations\<Q-Code> and approved PDFs under Approved Quotations\<Q-Code>; Open and Show in Folder work.
- [ ] Compare one submitted quotation across application, approval email preview, customer preview, PDF, approval record and PO comparison; all monetary values match exactly.
- [ ] Inspect the PDF header: centered integrated official logo, address, phone, website, email and centered QUOTATION title. Verify the intro, Next Step, appreciation and exact original cancellation notice.
- [ ] Restart after simulated interrupted save/submission; no lost pending quotation or duplicate receipt. Check local audit entries and error status.
- [ ] Confirm real email remains disabled, no real OAuth flow launches, and neither Tracker is read/written.

Record OS/WebView2/build versions, failing steps and screenshots with sensitive information removed. Do not paste credentials. Passing this checklist still does not certify real authentication, shared concurrency or mail delivery; those require separately approved staging tests.
