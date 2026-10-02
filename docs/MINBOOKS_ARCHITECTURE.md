# MinBooks — Product Architecture

MinBooks is the single product target of this repository. FinBooksOS and min-books-internal are reference material only and are not modified.

## Product boundary
- Canonical codebase: minimical.finance
- Product: MinBooks
- Production host: finance.minimical.online
- Authenticated product surface: /admin
- Root surface: product entry + authentication
- Client surface: password-protected portal links
- One application, one financial source of truth

## Domain model
User → Workspace → Organisations → Clients → Projects → Documents → Transactions.

An organisation is the legal/commercial identity used for document generation and numbering. A freelancer/individual operation is represented as an organisation. The workspace can contain multiple organisations and can switch between them from the main shell.

The aggregate scope is read-oriented and represents all organisations together. Creating or editing a financial document always requires an explicit organisation.

## Documents
Invoices, receipts and account statements are first-class document types. They share financial data but have separate document schemas/renderers. Issued documents are historical records and must not silently change when source entities are edited.

The approved invoice PDF template is a first-class renderer input. Other document renderers are independent so a receipt or statement never inherits invoice-specific geometry accidentally.

## Financial integrity boundary

Financial invariants are enforced at the database boundary, not only in the browser. Invoice client/project relationships must resolve to the same organisation; project/client relationships must agree; invoice numbers are unique within an organisation; payments cannot exceed the calculated invoice balance; payment and invoice-content changes synchronise invoice status; and payment recording plus its activity entry use a database function.

The browser remains responsible for interaction, validation feedback and workflow orchestration. It is not the authority for financial integrity.

## Canonical document and transaction layer

Issued invoices now create an immutable `invoice_versions` snapshot containing the invoice, organisation identity, client, project, line items and payment state at issue time. The snapshot is content-hashed and referenced by the canonical invoice document record. Subsequent PDF generation reads the issued snapshot rather than silently rendering a changed live invoice.

Receipts are organisation-scoped and sequential through the database. Payments carry their organisation identity and a receipt issuance timestamp. Account statements use the database `statement_ledger` function so internal reporting and future client-portal rendering can consume the same transaction model.

`documents` is the register; `document_versions` is the generated-file history. The document register can therefore distinguish an issued-but-not-yet-rendered document from a generated immutable file version. PDF renderers remain separate by document type.

## Import architecture
1. Read CSV/XLS/XLSX locally without mutating the financial database.
2. Inspect the workbook as a matrix and detect the most likely semantic header row instead of assuming row 1 is the header.
3. Classify the source as structured or headerless/irregular and score analysis confidence.
4. Infer financial fields with one-to-one column assignment; never reuse a source column simply because it is the closest textual match.
5. Inspect values as well as headings for date, amount, invoice-number, status and other semantic signals.
6. Resolve organisation ownership against the current workspace; use the active organisation automatically when that is unambiguous.
7. Normalize client/project/invoice/payment data and distinguish new entities from unresolved entities.
8. Detect existing invoice duplicates and duplicates inside the import batch; offer deterministic auto-number or skip resolution.
9. Show the operator only the remaining exceptions, with mapping review available as an advanced override rather than the default workflow.
10. Reconcile ready/skipped/blocked/warning counts and commit only after explicit confirmation.
11. Persist the source, analysis, row-level decisions and final outcome in the import register.

The importer is intentionally “analyse → reconcile exceptions → commit”, not “fill a mapping form”. It is designed for phone-first review and desktop batch work.

## Visual system
- Geist Sans and Geist Mono are the product-wide typography contract, including generated PDFs.
- The interface uses a dark-only, dense information language with strong hierarchy, restrained purple accents, semantic tokens and fixed mobile navigation.
- OpenSource UI is used as an implementation reference for production-ready interaction components; the download-state control is adapted locally so the dependency surface remains small and editable.
- ObsidianUI informs the composable, minimal panel and navigation architecture.
- Uiverse informs selective micro-interaction patterns and control treatments rather than a wholesale visual skin.
- Designeer, Swiped.design, Recent.design, Grainient.supply and the other supplied references are treated as design-intelligence inputs for hierarchy, motion, texture and composition. They are not runtime dependencies.
- Visual elements must explain or accelerate a financial task. Decorative charts and ornamental dashboard noise remain excluded.

## UX doctrine
- Mobile is a first-class workflow, not a collapsed desktop layout.
- Primary mobile navigation is fixed to the viewport edge and never floats over content.
- Invoice creation is a task flow, not a cramped desktop drawer.
- Client pages are relationship workspaces, not oversized card grids.
- Typography is information hierarchy: readable body text, restrained metadata, monospaced financial identifiers.
- Empty, loading, validation, success and failure states are explicit.
- Charts exist only where they answer an operational question.
- Visual references from FinBooksOS, OpenSource UI, ObsidianUI and Uiverse are translated into MinBooks components rather than copied as a visual collage.

OpenSource UI documents its components as MIT licensed and free for personal/commercial use; ObsidianUI describes its source as MIT licensed; Uiverse states its UI elements are MIT licensed. These references are used for component patterns and interaction ideas, not as a visual copy target.

## Product phases
P0 — Rebuild foundation: routing, auth boundary, organisation scope, shell, navigation, design tokens, entity linking.
P1 — Core operations: invoice creation/editing, client/project workspaces, payments, receipts, statements, import workflow.
P2 — Document system: template registry, renderer parity, document versions, storage and delivery. Canonical invoice snapshots, receipt numbering and the shared statement ledger are now implemented; persistent PDF storage/delivery remains in this phase.
P3 — Client portal: secure access, invoices, receipts, statements, shared documents.
P4 — SaaS: workspace onboarding, plans, multi-user roles, billing, tenant isolation.
P5 — Hardening: accessibility, responsive regression, RLS verification, backups, observability, production deployment.

## Hard exclusions
- No second active product repository.
- No branch proliferation; main is the active development branch.
- No floating bottom navigation.
- No decorative financial charts.
- No live invoice preview driving data-entry correctness.
- No UI-owned financial calculations.
