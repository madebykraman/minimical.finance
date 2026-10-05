import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("uploaded documents have project linkage and atomic registration",()=>{
  const linkage=readFileSync("supabase/migrations/20261005062325_documents_project_linkage.sql","utf8");
  const registration=readFileSync("supabase/migrations/20261005062506_uploaded_document_registration.sql","utf8");
  assert.match(linkage,/project_id uuid references public\.projects/);
  assert.match(registration,/register_uploaded_document/);
  assert.match(registration,/register_uploaded_document_version/);
  assert.match(registration,/visible_to_client,false/);
  assert.match(registration,/document_versions/);
  assert.match(registration,/Only uploaded files accept replacement versions/);
});

test("documents UI supports upload, project association and replacement versions",()=>{
  const view=readFileSync("components/finance/FinanceViews.tsx","utf8");
  assert.match(view,/Upload document/);
  assert.match(view,/uploaded_file/);
  assert.match(view,/p_project_id/);
  assert.match(view,/register_uploaded_document/);
  assert.match(view,/register_uploaded_document_version/);
  assert.match(view,/Upload new version/);
  assert.match(view,/25 MB/);
});

test("manual files remain separate from canonical financial PDF generation",()=>{
  const view=readFileSync("components/finance/FinanceViews.tsx","utf8");
  const repository=readFileSync("lib/finance/repository.ts","utf8");
  assert.match(view,/document_type==="uploaded_file"/);
  assert.match(repository,/\/api\/invoices\//);
  assert.match(repository,/\/api\/payments\//);
});
