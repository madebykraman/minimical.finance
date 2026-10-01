import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("migration verification is deterministic and fail-closed",()=>{
 const s=readFileSync("supabase/migrations/20261001001300_organisation_integrity_and_branding.sql","utf8");
 assert.match(s,/Cannot enforce organisation assignment/);
 assert.match(s,/unassigned_invoice_count/);
 assert.match(s,/orphaned_organisation_count/);
});
