import test from "node:test";
import assert from "node:assert/strict";
import { hashPortalPassword, verifyPortalPassword, hashPortalSession } from "../lib/portal/auth";

test("portal passwords are salted and verifiable",()=>{
 const stored=hashPortalPassword("A-strong-portal-password-2026");
 assert.match(stored,/^scrypt\$16384\$8\$1\$/);
 assert.equal(verifyPortalPassword("A-strong-portal-password-2026",stored),true);
 assert.equal(verifyPortalPassword("wrong-password",stored),false);
});
test("portal sessions are one-way hashes",()=>{
 const hash=hashPortalSession("session-token");
 assert.equal(hash.length,64);
 assert.notEqual(hash,"session-token");
});


test("password rotation revokes portal sessions and tokens",()=>{
 const migration=readFileSync("supabase/migrations/20261005061045_rotate_client_portal_password_sessions.sql","utf8");
 assert.match(migration,/delete from public\.client_portal_sessions/);
 assert.match(migration,/update public\.client_portal_tokens/);
 assert.match(migration,/password_rotated/);
 const route=readFileSync("app/api/client-portal/[id]/password/route.ts","utf8");
 assert.match(route,/rotate_client_portal_password/);
});

test("client admin generates tokenized portal access instead of copying a bare slug",()=>{
 const view=readFileSync("components/finance/FinanceViews.tsx","utf8");
 assert.match(view,/\/api\/client-portal\/\"\+clientId\+\"\/token/);
 assert.match(view,/Generate secure link/);
 assert.match(view,/Prepare email invite/);
 assert.doesNotMatch(view,/window\.location\.origin\+\"\/portal\/\"\+client\.portal_slug;await navigator\.clipboard/);
});


test("portal section visibility is enforced server-side",()=>{
 const migration=readFileSync("supabase/migrations/20261005061513_enforce_portal_section_visibility.sql","utf8");
 assert.match(migration,/case when coalesce\(v_client\.show_projects,true\)/);
 assert.match(migration,/case when coalesce\(v_client\.show_documents,true\)/);
 assert.match(migration,/visible_to_client=true/);
});

test("portal access revocation disables access and invalidates sessions and tokens",()=>{
 const migration=readFileSync("supabase/migrations/20261005061338_revoke_client_portal_access.sql","utf8");
 assert.match(migration,/portal_enabled=false/);
 assert.match(migration,/delete from public\.client_portal_sessions/);
 assert.match(migration,/update public\.client_portal_tokens/);
 assert.match(migration,/access_revoked/);
});
