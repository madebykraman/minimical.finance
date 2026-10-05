import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("migration verification is deterministic and fail-closed",()=>{
 const s=readFileSync("supabase/migrations/20261001001300_organisation_integrity_and_branding.sql","utf8");
 assert.match(s,/Cannot enforce organisation assignment/);
 assert.match(s,/unassigned_invoice_count/);
 assert.match(s,/orphaned_organisation_count/);
});


test("safe import rollback is fail-closed",()=>{
 const s=readFileSync("supabase/migrations/20261005034255_safe_import_batch_rollback.sql","utf8");
 assert.match(s,/status <> 'draft'/);
 assert.match(s,/has payments/);
 assert.match(s,/has documents/);
 assert.match(s,/has issued versions/);
 assert.match(s,/changed after the import completed/);
 assert.match(s,/rolled_back/);
 assert.match(s,/created_invoices/);
});


test("issued invoice saves create immutable versions and pending PDF records",()=>{
 const s=readFileSync("supabase/migrations/20261005044055_enforce_invoice_issue_versioning_on_save.sql","utf8");
 assert.match(s,/perform public\.issue_invoice\(p_invoice_id\)/);
 assert.match(s,/invoice_reissued/);
 assert.match(s,/invoice_versions/);
 assert.match(s,/issued_version=v_next_version/);
 assert.match(s,/document_type[\s\S]*invoice_pdf/);
 assert.match(s,/status[\s\S]*pending/);
 assert.match(s,/cannot be returned to draft/i);
});

test("canonical financial documents are private until explicitly shared",()=>{
 const first=readFileSync("supabase/migrations/20261005044554_explicit_client_document_sharing.sql","utf8");
 const reissue=readFileSync("supabase/migrations/20261005044627_explicit_reissued_document_sharing.sql","utf8");
 assert.match(first,/false, 'Canonical issued invoice'/);
 assert.match(first,/false,'Canonical payment receipt'/);
 assert.match(first,/visible_to_client=false/);
 assert.match(reissue,/false,'Canonical issued invoice'/);
});
