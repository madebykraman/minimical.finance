import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("RLS migration uses security-definer membership helper",()=>{const s=readFileSync("supabase/migrations/20261001000100_harden_workspace_access.sql","utf8");assert.match(s,/security definer/i);assert.match(s,/private\.is_workspace_member/);});
test("portal authentication remains session based",()=>{const s=readFileSync("app/api/client-portal/data/route.ts","utf8");assert.match(s,/portal_session/);assert.match(s,/hashPortalSession/);});


test("global chrome is organisation-led rather than product-branded",()=>{
 for(const path of ["components/finance/FinanceShell.tsx","components/finance/FinanceWorkspace.tsx","app/layout.tsx"]){
  const s=readFileSync(path,"utf8");
  assert.doesNotMatch(s,/MinBooks|by Minimical|minimical\.finance/i,path);
 }
});


test("user-facing finance surfaces never expose legacy product branding",()=>{
 const paths=[
  "components/finance/FinanceShell.tsx",
  "components/finance/FinanceWorkspace.tsx",
  "components/finance/FinanceViews.tsx",
  "app/layout.tsx",
  "lib/finance/invoice-pdf.ts",
 ];
 for(const path of paths){
  const s=readFileSync(path,"utf8");
  assert.doesNotMatch(s,/\bMinBooks\b|by Minimical|minimical\.finance|\bFinOS\b/,path);
 }
});

test("aggregate organisation scope is handled before UUID filtering in shared views",()=>{
 const s=readFileSync("components/finance/FinanceViews.tsx","utf8");
 assert.match(s,/isAllOrganizationsScope\(organizationId\)/);
 assert.match(s,/isAllOrganizationsScope\(activeOrganizationId\)/);
});


test("admin and statement period keys stay aligned",()=>{
 const views=readFileSync("components/finance/FinanceViews.tsx","utf8");
 const statement=readFileSync("app/api/clients/[id]/statement/route.ts","utf8");
 for(const key of ["month","3months","6months","fy","all"]){
  assert.ok(views.includes('"' + key + '"'), key + " missing from admin period controls");
  if(key!=="all")assert.ok(statement.includes('"' + key + '"'), key + " missing from statement route");
 }
 assert.doesNotMatch(views,/"quarter"|"half"|"year"/);
});


test("portal invoice payload exposes adjustment without internal invoice notes",()=>{
 const migration=readFileSync("supabase/migrations/20261005033655_portal_invoice_adjustment_visibility.sql","utf8");
 assert.match(migration,/'adjustment',i\.adjustment_note/);
 assert.doesNotMatch(migration,/'notes',i\.notes/);
 const page=readFileSync("app/portal/[slug]/invoice/[id]/page.tsx","utf8");
 assert.match(page,/data\.adjustment/);
});


test("portal data route returns protected organisation identity",()=>{
 const s=readFileSync("app/api/client-portal/data/route.ts","utf8");
 assert.match(s,/get_client_portal_organization/);
 assert.match(s,/organization:organization\|\|\{\}/);
 assert.match(s,/hashPortalSession/);
});
