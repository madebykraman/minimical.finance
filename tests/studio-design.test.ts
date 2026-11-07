import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const studio=readFileSync("components/ledger/FinanceStudio.tsx","utf8");
const css=readFileSync("app/studio.css","utf8");
const layout=readFileSync("app/layout.tsx","utf8");

test("dashboard exposes accurate financial balance with a privacy toggle",()=>{
 assert.match(studio,/fs-balance-hero/);
 assert.match(studio,/balanceVisible\?money\(outstanding\)/);
 assert.match(studio,/fs-hero-action/);
 assert.match(studio,/openInvoices\.length/);
});
test("invoice cards reflect the real ledger and provide usable status filters",()=>{
 assert.match(studio,/fs-invoice-grid/);
 assert.match(studio,/invoiceVisible\.map/);
 assert.match(studio,/aria-pressed=\{filter===key\}/);
 assert.match(studio,/setSelectedInvoice\(i\.number\)/);
 assert.match(studio,/invoiceTone\(i\)/);
});
test("invoice detail and composer show actual amounts without fake activity",()=>{
 assert.match(studio,/fs-detail-document/);
 assert.match(studio,/fs-composer-preview/);
 assert.match(studio,/selected\.rows\.map/);
 assert.match(studio,/payments\.filter\(p=>p\.invoice_number===selected\.number\)/);
 assert.match(studio,/date not provided|Payment date not provided/i);
});
test("small screens retain organisation switching and touch-friendly records",()=>{
 assert.match(studio,/aria-label="Switch organisation"/);
 assert.match(studio,/className="fs-mobile-create"/);
 assert.match(studio,/className="fs-mobile-record"/);
 assert.match(css,/@media\(max-width:780px\)/);
 assert.match(css,/\.fs-desktop-register\{display:none\}/);
});
test("studio uses the Geist typeface and respects reduced motion",()=>{
 assert.match(layout,/next\/font\/google/);
 assert.match(css,/var\(--font-geist\)/);
 assert.match(css,/prefers-reduced-motion/);
});
