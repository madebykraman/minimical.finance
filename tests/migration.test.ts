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
