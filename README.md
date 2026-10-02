# MinBooks

MinBooks is a private, authenticated finance workspace for invoicing, payments, documents, client records and financial reporting.

Production: https://finance.minimical.online

## Product
- Organisation-aware finance workspace
- Invoice creation, editing and status management
- Structured line items with pricing and provenance
- Payment recording and balance validation
- Client and project workspaces
- Receipts, statements and invoice PDFs
- Document history and version tracking
- Spreadsheet/CSV invoice import and reconciliation
- Aggregate multi-organisation reporting
- Password-protected client portal
- Responsive desktop and mobile interface

## Stack
Next.js App Router, TypeScript, React, Supabase, Supabase SSR, Lucide, PDF-Lib and Geist.

The UI uses source-level adaptations of selected open-source component patterns where they improve a real workflow. See [UI library integration](docs/UI_LIBRARY_INTEGRATION.md).

## Development
Create a local environment file from `.env.example` and provide the required Supabase values.

```bash
npm install
npm run dev
```

Production builds:

```bash
npm run build
npm test
```

## Environment
Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional server-only credential:
- `SUPABASE_SERVICE_ROLE_KEY`

Never commit credentials, tokens, private keys or production secrets. Store deployment credentials in the deployment platform's environment/secret store. GitHub recommends environment variables or secret-management systems rather than hardcoding authentication credentials.

## Deployment
The canonical production hostname is:

https://finance.minimical.online

Deployment configuration and credentials are intentionally kept outside this public project documentation.

## Security
MinBooks is intended to run behind authenticated access with database-enforced access controls.

Security-sensitive operational configuration is not documented in this repository. Do not add:
- Supabase service-role keys
- API tokens
- passwords
- database credentials
- private deployment credentials
- private customer or financial records
- internal migration/recovery notes containing operational secrets

For repository security, enable secret scanning/push protection where available and keep sensitive configuration in GitHub/deployment secrets.

## License
Private product code. See the repository's access and licensing terms.