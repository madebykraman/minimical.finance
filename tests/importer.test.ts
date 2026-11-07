import test from "node:test";
import assert from "node:assert/strict";
import {readCsv,readXlsx,parseMoney,parseDate,normalizeUpload} from "../lib/ledger/importer";

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

test("imports an explicit invoice payment separately from work",()=>{
 const file=readCsv("Invoice No.,Payment Amount,Payment Date,Payment Method,Payment Reference\nINV-003,₹500,08-11-2026,UPI,TX-123\n");
 const data=normalizeUpload(file,"The Minimical Co.");
 assert.equal(data.records.length,1);
 assert.equal(data.records[0].kind,"payment");
 assert.equal(data.records[0].payment_amount,500);
 assert.equal(data.records[0].paid_date,"2026-11-08");
 assert.equal(data.records[0].invoice,"INV-003");
});
test("an ambiguous payment without its date is not silently imported",()=>{
 const file=readCsv("Client,Project,Amount,Invoice No.,Payment Amount\nElle India,Work A,2000,INV-003,₹500\n");
 const data=normalizeUpload(file,"Kumar Aman");
 assert.equal(data.records.length,1);
 assert.equal(data.records[0].kind,undefined);
 assert.ok(data.warnings.some(w=>w.includes("payment needs")));
});
function miniZip(files:Record<string,string>):Buffer{
 const locals:Buffer[]=[],centrals:Buffer[]=[];
 let offset=0;
 for(const [file,data] of Object.entries(files)){
  const name=Buffer.from(file),body=Buffer.from(data);
  const local=Buffer.alloc(30+name.length);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);
  local.writeUInt16LE(name.length,26);name.copy(local,30);
  locals.push(local,body);
  const central=Buffer.alloc(46+name.length);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);name.copy(central,46);
  centrals.push(central);offset+=local.length+body.length;
 }
 const dir=Buffer.concat(centrals),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(centrals.length,8);end.writeUInt16LE(centrals.length,10);
 end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
test("reads actual XLSX archive structure with inline text and value cells",()=>{
 const sheet='<worksheet><sheetData>'+
  '<row r="1"><c r="A1" t="inlineStr"><is><t>Client</t></is></c><c r="B1" t="inlineStr"><is><t>Project</t></is></c><c r="C1" t="inlineStr"><is><t>Amount</t></is></c></row>'+
  '<row r="2"><c r="A2" t="inlineStr"><is><t>Sample client</t></is></c><c r="B2" t="inlineStr"><is><t>Service 1</t></is></c><c r="C2"><v>3500</v></c></row>'+
  '</sheetData></worksheet>';
 const workbook=miniZip({
  "xl/workbook.xml":'<workbook><sheets><sheet name="Clients and projects" sheetId="1" r:id="rId1"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels":'<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  "xl/worksheets/sheet1.xml":sheet
 });
 const parsed=readXlsx(workbook);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].rows[1][1],"Service 1");
 const result=normalizeUpload(parsed,"Enchated Vows");
 assert.equal(result.records[0].amount,3500);
 assert.equal(result.records[0].client,"Sample client");
});
