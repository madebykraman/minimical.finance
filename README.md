# Finance — Kumar Aman

A rebuilt, private finance workspace with a minimal read-only client portal, designed specifically around the *Elle India - Projects, Invoices & Tracker | Pending/Unpaid Invoices* source PDF.

## Scope and source integrity

The PDF is the **only initial business dataset**. A one-time reset loads 19 work rows, three unpaid invoice groups (180, 195 and 220), a reported pending balance of INR 45,000 as of 24 October 2026, and the explicit names and dates exactly as supplied. Blank values stay blank. New records can subsequently be created by an authorised user.

The printed totals are 21,000 / 12,000 / 12,000. The grouped work amounts add to 23,000 / 10,000 / 12,000 respectively. **Both are stored separately.** Do not silently reconcile or reissue invoice source documents. Invoice 220 is dated **24 November 2026** in the PDF (future relative to the initial import date).

The source references an invoice file named `INV_180-Kumar Aman-Video Editing.pdf`; only the tracker PDF was attached, not that invoice document. App-generated PDFs are explicitly marked as tracker summaries, not originals.

## Features

- Single-purpose overview, work register, invoice register, payments, client records, documents, reports and settings.
- Search, filter, create/edit work, new invoices from unbilled work, record payments, add/edit clients.
- Source-total discrepancy alerts, paid/outstanding calculations, CSV export.
- Private file uploads, short-lived signed downloads and on-demand invoice summary PDFs.
- Password-protected, read-only client portal at `/portal/elle-india`, disabled until the admin enables it. Password changes revoke active sessions.
- Member-authorized administration, Supabase RLS, server-side access checks and responsive desktop/mobile layouts.

## Development

Requires Node 24 and Supabase credentials configured in the deployment environment:

```sh
npm ci
npm test
npm run build
npm run dev
```

- `NEXT_PUBLIC_SUPABASE_URL` — public URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public key
- `SUPABASE_SERVICE_ROLE_KEY` — private server-only key (for secure documents and portal)

Never expose a service-role key to client code.

Existing Supabase authentication and `workspace_members` membership are deliberately preserved when resetting business data. RLS protects new tracker tables using the existing `private.is_workspace_member()` predicate.

The old application's source files and routes were removed from the new code tree. Historical migrations remain for traceability, and the new schema migration describes the tracker tables. The production data reset is a **one-time manual operation** and is not re-run on deploy.
