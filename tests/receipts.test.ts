import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("receipts are scoped to an authenticated organisation payment",()=>{
 const route=readFileSync("app/api/payments/[id]/receipt/route.ts","utf8");
 assert.match(route,/workspaceUser\(\)/);
 assert.match(route,/eq\("organization_id",orgId\)/);
 assert.match(route,/payment\.invoice_number/);
 assert.match(route,/Cache-Control/);
});
test("payment history provides a receipt for individually recorded payments",()=>{
 const view=readFileSync("components/ledger/FinanceStudio.tsx","utf8");
 assert.match(view,/\/api\/payments\//);
 assert.match(view,/Download receipt/);
});
