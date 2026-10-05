import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile viewport and final responsive layer are explicit",()=>{
  const layout=readFileSync("app/layout.tsx","utf8");
  const css=readFileSync("app/globals.css","utf8");
  assert.match(layout,/viewportFit:\s*"cover"/);
  assert.match(css,/Authoritative phone\/tablet correction layer/);
  const final=css.slice(css.indexOf("Authoritative phone/tablet correction layer"));
  assert.match(final,/\.mobile-nav\s*\{[\s\S]*left:0!important;[\s\S]*right:0!important;[\s\S]*bottom:0!important;/);
  assert.match(final,/border-radius:0!important/);
  assert.match(final,/overflow-x:hidden/);
  assert.match(final,/input,select,textarea\{font-size:16px!important\}/);
  assert.match(final,/grid-template-columns:1fr!important/);
});

test("mobile dialogs use bottom-sheet geometry instead of squeezed desktop panels",()=>{
  const css=readFileSync("app/globals.css","utf8");
  const final=css.slice(css.indexOf("Authoritative phone/tablet correction layer"));
  assert.match(final,/\.overlay\{[\s\S]*align-items:flex-end!important/);
  assert.match(final,/max-height:calc\(94dvh - env\(safe-area-inset-top\)\)!important/);
  assert.match(final,/border-radius:18px 18px 0 0!important/);
  assert.match(final,/\.invoice-composer \.editor-content-row\{[\s\S]*grid-template-rows:auto auto!important/);
});

test("financial mutations generate their canonical PDFs",()=>{
  const repo=readFileSync("lib/finance/repository.ts","utf8");
  const views=readFileSync("components/finance/FinanceViews.tsx","utf8");
  assert.match(repo,/issue_invoice/);
  assert.match(repo,/\/api\/invoices\/.*\/pdf/);
  assert.match(repo,/record_invoice_payment/);
  assert.match(repo,/\/api\/payments\/.*\/receipt/);
  assert.match(views,/Generate pending/);
  assert.match(views,/generateDocument\(doc/);
});
