import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const path of ["app/api/invoices/[id]/pdf/route.ts","app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts","app/api/client-portal/[slug]/receipt/[paymentId]/route.ts"]) {
 test("PDF route uses the shared Geist renderer: "+path,()=>{const s=readFileSync(path,"utf8");assert.doesNotMatch(s,/DejaVu/i);assert.match(s,/Geist-Regular\.ttf/);});
}
test("statement PDF route delegates to the shared Geist renderer",()=>{
  const route=readFileSync("app/api/client-portal/[slug]/statement/route.ts","utf8");
  const renderer=readFileSync("lib/finance/statement-pdf.ts","utf8");
  assert.doesNotMatch(route,/DejaVu/i);
  assert.match(route,/renderStatementPdf/);
  assert.match(renderer,/Geist-Regular\.ttf/);
  assert.match(renderer,/Geist-SemiBold\.ttf/);
  assert.match(renderer,/GeistMono-Regular\.ttf/);
});
test("canonical invoice never truncates contents",()=>{const s=readFileSync("app/api/invoices/[id]/pdf/route.ts","utf8");assert.doesNotMatch(s,/contents\.slice\(0,\s*4\)/);});

test("PDF font preparation is deterministic",()=>{
 const s=readFileSync("scripts/prepare-pdf-font.mjs","utf8");
 assert.match(s,/geist/);
 assert.match(s,/Geist-Regular\.ttf/);
 assert.match(s,/Geist-SemiBold\.ttf/);
 assert.match(s,/GeistMono-Regular\.ttf/);
});


test("financial PDF renderers never hard-code account identity",()=>{
 const paths=[
  "app/api/invoices/[id]/pdf/route.ts",
  "app/api/client-portal/[slug]/invoice/[id]/pdf/route.ts",
  "app/api/payments/[id]/receipt/route.ts",
  "app/api/client-portal/[slug]/receipt/[paymentId]/route.ts",
  "lib/finance/statement-pdf.ts",
 ];
 for(const path of paths){
  const s=readFileSync(path,"utf8");
  assert.doesNotMatch(s,/framedbyaman@gmail\.com/i,path);
  assert.doesNotMatch(s,/87095\s*39814/i,path);
  assert.doesNotMatch(s,/Kumar Aman/i,path);
 }
});
