import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("RLS migration uses security-definer membership helper",()=>{const s=readFileSync("supabase/migrations/20261001000100_harden_workspace_access.sql","utf8");assert.match(s,/security definer/i);assert.match(s,/private\.is_workspace_member/);});
test("portal authentication remains session based",()=>{const s=readFileSync("app/api/client-portal/data/route.ts","utf8");assert.match(s,/portal_session/);assert.match(s,/hashPortalSession/);});
