import test from "node:test";
import assert from "node:assert/strict";
import { detectHeaderRow, inferImportMapping, normalizeAmount, normalizeDate, fingerprint, parseSpreadsheet } from "../lib/finance/importer";

test("import mapping recognises common invoice headers without reusing one source column",()=>{
  const mapping=inferImportMapping(["Organisation","Client Name","Invoice No","Invoice Date","Due Date","Grand Total","Paid Amount"]);
  assert.equal(mapping.organization,"Organisation");
  assert.equal(mapping.client,"Client Name");
  assert.equal(mapping.invoiceNumber,"Invoice No");
  assert.equal(mapping.issueDate,"Invoice Date");
  assert.equal(mapping.dueDate,"Due Date");
  assert.equal(mapping.amount,"Grand Total");
  assert.equal(mapping.paymentAmount,"Paid Amount");
  assert.equal(new Set(Object.values(mapping)).size,Object.values(mapping).length);
});

test("header detection chooses a semantic heading row instead of the first data row",()=>{
  const matrix=[
    ["Elle India - Projects, Invoices & Tracker","","",""],
    ["Client","Invoice Number","Issue Date","Amount"],
    ["Ekta","INV-42","02/10/2026","₹10,000"],
  ];
  const detected=detectHeaderRow(matrix);
  assert.equal(detected.index,1);
});

test("import normalisation handles Indian amounts and dates",()=>{
  assert.equal(normalizeAmount("₹1,25,000.50"),125000.5);
  assert.equal(normalizeDate("02/10/2026"),"2026-10-02");
  assert.equal(normalizeDate("2026-10-02"),"2026-10-02");
});

test("import fingerprints remain deterministic",()=>{
  const row={Organisation:"Minimical",Client:"Acme",Invoice:"INV-42","Invoice Date":"02/10/2026",Amount:"₹10,000"};
  const mapping={organization:"Organisation",client:"Client",invoiceNumber:"Invoice",issueDate:"Invoice Date",amount:"Amount"};
  assert.equal(fingerprint(row,mapping),"minimical|acme|inv 42|2026-10-02|10000");
});
