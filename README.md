# Finance Workspace

A private, organisation-led finance and client/project billing application built with Next.js, React, Supabase, and PDF-Lib. The active administration interface lives at /admin.

## Initial records — workbook only

The one-time opening dataset was extracted from the uploaded Excel workbook with tabs for the all-time master ledger, current financial year, pending invoices, and a notes tab. It **replaces** the previous PDF-only seed. The PDF is no longer a source of data.

The live Supabase finance tables were reset on 8 November 2026, while preserving Supabase Auth identities and authorised workspace membership. No live spreadsheet connection exists: the opening records are ordinary database rows.

| Organisation | Opening clients | Work entries | Invoices | Status |
| --- | ---: | ---: | ---: | --- |
| Kumar Aman | 1 (Elle India) | 31 | 8 | Active |
| The Minimical Co. | 0 | 0 | 0 | Active |
| Enchated Vows | 0 | 0 | 0 | Active |
| Smilebox Studios | 0 | 0 | 0 | Dissolved |

Kumar Aman's original invoice groups: 21 (₹4,000, paid), 43 (₹6,000, paid), 106 (₹16,500, paid), 160 (₹19,500, paid), 166 (₹3,000, paid), 180 (₹21,000, unpaid), 195 (₹12,000, unpaid), 220 (₹12,000, unpaid). Opening total invoiced: **₹94,000**. Marked settled: **₹49,000**. Opening balance: **₹45,000**. Historical paid statuses are stored separately from real payment transactions. Where the workbook does not supply a payment date or method, neither is fabricated.

The separate note about a ₹2,000 Bridgerton discount that has not yet been adjusted is retained as a work-item note. An unknown work amount stays blank, not zero; the free/collaboration entry is not turned into an invoice. Invoice 220 retains its source issue date of 24 November 2026.

The initial workbook import/reset is a deliberate **one-time operation** and is NOT replayed during deployment or from a file link. Financial records added or edited thereafter live in Supabase. Migration files contain schema and access controls, not the customer's private workbook contents.

## Organisation-specific workspace

Switch between organisations using the organisation selector. Screens, records, invoice numbers, clients, documents, and import histories are scoped to the selected organisation. The interface offers overview, work, invoices, payments, clients, documents, reports, settings, responsive navigation, search and CSV exports.

Create or update clients and work items. Compose invoices with a client, existing unbilled work and/or custom items, quantities, rates, optional tax, issue and due dates, and notes. New invoices begin as **Draft**, and can be marked **Sent** after actual delivery. Drafts do not count toward issued receivables, and a payment cannot be recorded against a draft. Member-only generated invoice PDFs show the correct organisation, client, amounts, dates, tax, bank details if configured, and reconciliation warnings. The PDF is a generated record, not a claim that an original external document was uploaded.

Record verified payments with actual dates, methods, amounts and references. The backend rejects overpayment, payments to source-settled invoices, and payments to drafts. Receipt PDFs are generated only from recorded payment transactions; a historical "paid" status without a dated transaction does not produce a fabricated receipt. The report distinguishes invoiced totals, settlements, amounts due and invoice discrepancies.

Upload PDF/image documents to the private Supabase Storage bucket. Downloads use short-lived signed URLs and member access checks. The existing Kumar Aman / Elle India read-only portal at /portal/elle-india is password protected and disabled by default. Portal password changes revoke old sessions; draft invoices are excluded. A multi-client portal for the other organisations is **not yet implemented** and should not be represented as available.

## One-click import (every organisation)

Use **Import data** at the top of any organisation. Choose an .xlsx, .csv or .tsv file (up to 12 MB). The server reads the upload **one time** and automatically recognizes common headings across multiple worksheets:

- Client/customer name, email, phone, address and GSTIN
- Project/work/service name, assignee, amounts and notes
- Invoice number, total, issue date, status and document reference
- Explicit payment amount, date, method, invoice and transaction reference

The server normalises common currency and Excel date formats, deduplicates overlapping worksheets, checks workbook organisation labels, and sends parsed records to an atomic Supabase import function. Existing clients/projects update by scoped identity; new records are created. It can derive an invoice total from the work items only when **every item is priced**. Transaction payments require an actual date and an explicit invoice. Unknown details, ambiguous associations, and potentially overpaying rows are flagged or left unimported rather than invented. Re-uploading the exact same file does not duplicate it (SHA-256 idempotency). Results display counts, warnings and issues.

Upload files are not saved as a live database and have no ongoing spreadsheet link. Import batches store only a file hash, file name and results. New data thereafter is queried solely from Supabase.

**Limits:** Header detection is heuristic rather than universally intelligent. Arbitrary financial sheet layouts, conflicting invoice assignments, tax-heavy workbooks, and unmatched payments may need an explicit review or a cleaner spreadsheet. There is no automatic background sync, AI interpretation of every possible workbook, or guarantee that every unmatched row is safe to import.

## Setup

Node.js 24 is required.

~~~sh
npm ci
npm test
npm run build
npm run dev
~~~

Environment:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SERVICE_ROLE_KEY (server-only; never put in browser bundles)

Run migrations in order, including **supabase/migrations/20261108000100_organisation_finance_and_one_click_import.sql** after the original tracker foundation. Supabase RLS and the private workspace membership helper protect business records. Administration still requires a valid authenticated workspace member.

## Verification & deployment status

Automated GitHub Actions on main run Node installation, tests, TypeScript/Next.js builds. Database integration checks for invoice creation, editing, draft payment restrictions, overpayment and importer idempotency were executed in transactions that rolled back, so the four opening organisations remained unchanged.

Production domain activation and authenticated graphical click-testing require access to the actual production deployment. A build passing is not a guarantee that an external hosting service deployed the new commit. Previous orphaned files under the old private storage paths also require a supported Storage API cleanup; the old live tracker and legacy business-table rows were cleared.

The finance source and migrations are versioned on main; no feature branch was created.
