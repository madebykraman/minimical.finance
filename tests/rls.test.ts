import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("workspace access policies use membership helper",()=>{
 const s=readFileSync("supabase/migrations/20261001000100_harden_workspace_access.sql","utf8");
 assert.match(s,/private\.is_workspace_member/);
 assert.match(s,/to authenticated/i);
});
test("organisation invoice assignment is enforced",()=>{
 const s=readFileSync("supabase/migrations/20261001001300_organisation_integrity_and_branding.sql","utf8");
 assert.match(s,/alter table public\.invoices[\s\S]*alter column organization_id set not null/i);
 assert.match(s,/organisation_migration_status/);
});
test("portal SECURITY DEFINER functions are not directly executable by workspace users",()=>{
 const s=readFileSync("supabase/migrations/20261001001500_harden_portal_function_grants.sql","utf8");
 assert.match(s,/revoke execute on function public\.log_client_portal_activity[\\s\\S]*from authenticated/i);
 assert.match(s,/revoke execute on function public\.update_client_portal_profile[\\s\\S]*from authenticated/i);
});
