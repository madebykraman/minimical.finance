import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const path of ["app/api/invoices/[id]/pdf/route.ts","app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts","app/api/client-portal/[slug]/statement/route.ts","app/api/client-portal/[slug]/receipt/[paymentId]/route.ts"]) {
 test("PDF uses Geist: "+path,()=>{const s=readFileSync(path,"utf8");assert.doesNotMatch(s,/DejaVu/i);assert.match(s,/Geist-Regular\.ttf/);});
}
test("canonical invoice never truncates contents",()=>{const s=readFileSync("app/api/invoices/[id]/pdf/route.ts","utf8");assert.doesNotMatch(s,/contents\.slice\(0,\s*4\)/);});
