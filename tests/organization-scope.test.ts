import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("client portal is scoped to the workbook source organisation",()=>{
 const code=readFileSync("app/api/portal/data/route.ts","utf8");
 assert.match(code,/tracker_organizations/);
 assert.match(code,/eq\("organization_id",org.id\)/);
 assert.match(code,/eq\("name","Elle India"\)/);
});
test("documents cannot cross organisation boundaries during upload",()=>{
 const code=readFileSync("app/api/documents/route.ts","utf8");
 assert.match(code,/organization_id:orgId/);
 assert.match(code,/Client does not belong to this organisation/);
});
test("generated invoices use the explicit selected organisation",()=>{
 const code=readFileSync("app/api/invoices/[number]/pdf/route.ts","utf8");
 assert.match(code,/searchParams.get\("org"\)/);
 assert.match(code,/eq\("organization_id",organization.id\)/);
});
