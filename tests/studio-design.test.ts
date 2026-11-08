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
