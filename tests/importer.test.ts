import test from "node:test";
import assert from "node:assert/strict";
import {readCsv,parseMoney,parseDate,normalizeUpload} from "../lib/ledger/importer";

test("reads Indian currency and worksheet dates",()=>{
 assert.equal(parseMoney("₹5,000/-"),5000);
 assert.equal(parseMoney("N/A"),null);
 assert.equal(parseMoney("₹0 (Free/Collab)"),0);
 assert.equal(parseDate("46296"),"2026-10-01");
 assert.equal(parseDate("24-10-2026"),"2026-10-24");
 assert.equal(parseDate("29-02-2026"),null);
});
test("imports a generic client file without a mapping form",()=>{
 const file=readCsv("Client Name,Email,Phone\nAcme Studio,hello@example.com,1234567890\nOther,hi@example.com,\n");
 const data=normalizeUpload(file,"Enchated Vows");
 assert.equal(data.records.length,2);
 assert.equal(data.records[0].client,"Acme Studio");
 assert.equal(data.records[0].email,"hello@example.com");
});
test("recognizes the master-ledger layout, Notes, duplicates, and unbilled work",()=>{
 const sheets=[
 {name:"Master Sheet (All TIme Data",rows:[
 ["Header"],["For: Kumar Aman"],[],
 ["Assigned by/POC","Name / Project","Amount","Payment","Date","Invoice No.","Invoice Total ₹","Stauts"],
 ["Ekta","Elle India_Bridgerton_Video Editing","₹5,000/-","Unpaid","46296","Inv. 180","₹5000","Sent"],
 [null,"Elle India_Fossae_Video Editing","₹5,000/-",null,null,null,null,null]
 ]},
 {name:"PendingUnpaid Invoices",rows:[
 ["Assigned by/POC","Name / Project","Amount","Payment","Date","Invoice No.","Invoice Total ₹","Stauts"],
 ["Ekta","Elle India_Bridgerton_Video Editing","₹5,000/-","Unpaid","46296","Inv. 180","₹5000","Sent"]
 ]},
 {name:"Notes",rows:[["notes"],[],["Assigned by/POC","Name / Project","Amount","Notes"],
 ["Ekta","Elle India_Bridgerton_Video Editing","₹5,000/-","Client reduced price."]]}
 ];
 const result=normalizeUpload(sheets,"Kumar Aman");
 assert.equal(result.records.length,2);
 assert.equal(result.records[0].invoice,"180");
 assert.equal(result.records[0].notes,"Client reduced price.");
 assert.equal(result.records[1].invoice,undefined);
 assert.throws(()=>normalizeUpload(sheets,"The Minimical Co."),/matching organisation/);
});
test("does not mistake payment amounts for new invoices",()=>{
 const r=normalizeUpload(readCsv("Client,Project,Payment Amount\nAcme,A,1000\n"),"Acme");
 assert.equal(r.records[0].amount,undefined);
});
