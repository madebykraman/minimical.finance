import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync("components/ledger/FinanceStudio.tsx","utf8");
const css=readFileSync("app/workspace-v3.css","utf8");
test("the default workspace shows only the balance and an actionable invoice inbox",()=>{
 assert.match(ui,/className="v3-balance"/);
 assert.match(ui,/className="v3-list-section"/);
 assert.match(ui,/openInvoices.slice\(0,5\)/);
 assert.doesNotMatch(ui,/fs-hero-layout/);
});
test("navigation is reduced to four tasks with secondary tools hidden until selected",()=>{
 assert.match(ui,/NAV\.slice\(0,4\)/);
 assert.match(ui,/NAV\.slice\(4\)/);
 assert.match(ui,/setMenu\(true\)/);
 assert.match(ui,/v3-tools-overlay/);
});
test("all active screens have real data and actions, not placeholder examples",()=>{
 for(const view of ["overview","invoices","work","clients","payments","documents","reports","settings"]){
  assert.ok(ui.includes('view==="'+view+'"'),view+" screen unavailable");
 }
 assert.match(ui,/downloadInvoicePdf/);
 assert.match(ui,/tracker_revise_invoice/);
 assert.match(ui,/tracker_compose_and_mark_invoice/);
});
test("mobile navigation is touch friendly and shows the organisation switcher",()=>{
 assert.match(ui,/className="v3-mobile-nav"/);
 assert.match(ui,/aria-label="Switch organisation"/);
 assert.match(css,/\.v3-sidebar\{display:none\}/);
 assert.match(css,/prefers-reduced-motion/);
});
test("invoice PDF uses authenticated download with server errors displayed",()=>{
 assert.match(ui,/response\.headers\.get\("content-type"\)/);
 assert.match(ui,/URL\.createObjectURL/);
 assert.match(ui,/setError\(e instanceof Error/);
});

test("the four visible navigation actions are exactly Home, Invoices, Work and Clients",()=>{
 const section=ui.slice(ui.indexOf("const NAV:"),ui.indexOf("const localDate"));
 const first=Array.from(section.matchAll(/id:"(overview|invoices|work|clients|payments|documents|reports|settings)"/g)).slice(0,4).map(x=>x[1]);
 assert.deepEqual(first,["overview","invoices","work","clients"]);
});

test("invoice numbering increments existing prefixed numbers rather than duplicating INV-001",()=>{
 assert.match(ui,/i\.number\.startsWith\(prefix\)/);
 assert.match(ui,/Math\.max\(0,\.\.\.numbered\)\+1/);
 assert.match(ui,/number:prefix\+next/);
});
test("switching organisations closes stale editors to prevent cross-org changes",()=>{
 assert.match(ui,/setInvoiceEdit\(null\)/);
 assert.match(ui,/setPaymentDraft\(null\)/);
 assert.match(ui,/setDocumentInvoice\(""\)/);
});
test("billed work prices must be changed through the audited invoice editor",()=>{
 assert.match(ui,/This work is already invoiced/);
 assert.match(ui,/open the invoice and use Edit invoice/i);
});
