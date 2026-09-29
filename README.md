# minimical.finance

Internal finance and invoicing OS for Minimical.

## Current build
- Supabase-backed invoice records; no spreadsheet/local-state source of truth
- Authenticated workspace with Supabase Auth
- Overview dashboard with billed, collected, outstanding and collection-rate KPIs
- Invoice search and status filters
- Invoice detail editor
- Structured invoice Contents: service, adjustment and note rows
- Priced and unpriced/TBD contents
- Source-total mismatch warnings
- Payment recording with balance validation and automatic partial/paid status
- Payments ledger
- Client/project aggregation
- Print-to-PDF invoice output
- Existing Elle tracker data migrated into Supabase
- GitHub Actions build verification workflow

## Stack

Next.js App Router + TypeScript + Supabase + @supabase/ssr + Lucide.

## Local environment

Copy .env.example to .env.local and fill:

    NEXT_PUBLIC_SUPABASE_URL=https://aemshepgkvjlblpjezmx.supabase.co
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable key>

Never add a service-role key to the browser app or commit secrets.

## Vercel deployment

1. Import madebykraman/minimical.finance into Vercel.
2. Framework preset: Next.js. The repository root is the project root.
3. Add these Production environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
4. Use the values from the Supabase project dashboard. The URL is the project URL shown in .env.example.
5. Deploy the main branch.
6. Open the deployed app and create/sign in to the private finance account.
7. In Supabase Auth, make sure the deployed site URL is configured as the site URL/redirect URL if email confirmation or password-reset flows are enabled.

The database is already provisioned and seeded; deployment should not require running SQL manually.

## Data model

clients → projects → invoices → invoice_contents, with payments, documents and activity_log attached where needed.

Invoice totals are calculated from priced contents. Unpriced contents remain visible but contribute ₹0 until priced. This is intentional so unknown work is not silently treated as billed revenue.

## Important source-history handling

- Invoice 180 retains its recorded ₹10,000 source total while its structured contents calculate to ₹13,000; the UI surfaces this mismatch.
- Invoice 186 contains ₹4,000 of priced work plus three unpriced/TBD items.
- Invoice 172 retains the ₹2,000 Bridgerton reduction as adjustment context.
- Paid invoices have payment records, even when the original tracker did not contain an exact payment date.

## Security

All finance tables have Row Level Security enabled and are accessible through the authenticated role only. The database security advisor currently reports no security lints.

## Before expanding the product

Next logical modules are: document storage, proper invoice PDF generation, client/project CRUD, activity timeline, reporting, recurring invoices, and optional email delivery.