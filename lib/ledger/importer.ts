import {inflateRawSync} from "node:zlib";
import {posix} from "node:path";

export type Sheet={name:string;rows:(string|null)[][]};
export type ImportRecord={
 client?:string;organization?:string;email?:string;phone?:string;address?:string;gstin?:string;
 project_name?:string;amount?:number;assigned_by?:string;invoice?:string;
 invoice_total?:number;invoice_date?:string;invoice_status?:string;
 payment_state?:string;paid_date?:string;source_paid?:boolean;
 payment_amount?:number;payment_method?:string;payment_reference?:string;kind?:"payment";
 invoice_document?:string;notes?:string;
};
const MAX=10000;
const xmlText=(v:string)=>v.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(amp|lt|gt|quot|apos);/gi,(_,hex,dec,named)=>{
 if(hex||dec){const n=parseInt(hex||dec,hex?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):""}
 return ({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"} as Record<string,string>)[String(named).toLowerCase()]||"";
});
const attr=(tag:string,name:string)=>{
 const m=tag.match(new RegExp("(?:\\s|^)"+name+"\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')","i"));
 return xmlText(m?.[1]??m?.[2]??"");
};
function zip(buffer:Buffer){
 if(buffer.length<22)throw new Error("Not a valid XLSX workbook.");
 let end=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break}
 if(end<0)throw new Error("Workbook ZIP directory missing.");
 const count=buffer.readUInt16LE(end+10),start=buffer.readUInt32LE(end+16);
 if(count>500)throw new Error("Workbook has too many internal entries.");
 let p=start,total=0;
 const entries=new Map<string,Buffer>();
 for(let i=0;i<count;i++){
  if(p+46>buffer.length||buffer.readUInt32LE(p)!==0x02014b50)throw new Error("Invalid XLSX directory.");
  const flags=buffer.readUInt16LE(p+8),method=buffer.readUInt16LE(p+10);
  const compressed=buffer.readUInt32LE(p+20),expanded=buffer.readUInt32LE(p+24);
  const nameSize=buffer.readUInt16LE(p+28),extraSize=buffer.readUInt16LE(p+30),commentSize=buffer.readUInt16LE(p+32);
  const local=buffer.readUInt32LE(p+42),name=buffer.toString("utf8",p+46,p+46+nameSize);
  p+=46+nameSize+extraSize+commentSize;
  if(!name.startsWith("xl/")||name.endsWith("/"))continue;
  if(flags&1||method!==0&&method!==8)throw new Error("Unsupported or encrypted XLSX.");
  if(expanded>36*1024*1024||total+expanded>36*1024*1024)throw new Error("Workbook is too large when decompressed.");
  if(local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw new Error("Invalid XLSX entry.");
  const off=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
  if(off+compressed>buffer.length)throw new Error("Truncated XLSX archive.");
  const bytes=buffer.subarray(off,off+compressed);
  const uncompressed=method===0?Buffer.from(bytes):inflateRawSync(bytes,{maxOutputLength:36*1024*1024});
  if(uncompressed.length!==expanded)throw new Error("XLSX size mismatch.");
  total+=uncompressed.length;entries.set(name,uncompressed);
 }
 return entries;
}
const fragments=(xml:string)=>[...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>xmlText(m[1])).join("");
export function readXlsx(buffer:Buffer):Sheet[]{
 const entries=zip(buffer);
 const book=entries.get("xl/workbook.xml")?.toString("utf8");
 const rels=entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
 if(!book||!rels)throw new Error("Missing XLSX workbook metadata.");
 const strings=[...(entries.get("xl/sharedStrings.xml")?.toString("utf8")??"").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>fragments(m[1]));
 const links=new Map<string,string>();
 for(const rel of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)){
  const target=attr(rel[1],"Target"),name=attr(rel[1],"Id");
  const resolved=target.startsWith("/")?target.slice(1):posix.normalize("xl/"+target);
  if(name&&resolved.startsWith("xl/worksheets/"))links.set(name,resolved);
 }
 const result:Sheet[]=[];
 for(const meta of book.matchAll(/<sheet\b([^>]*?)\/?>/g)){
  const name=attr(meta[1],"name")||"Sheet",location=links.get(attr(meta[1],"r:id"));
  const xml=location&&entries.get(location)?.toString("utf8");if(!xml)continue;
  const rows:(string|null)[][]=[];
  for(const match of xml.matchAll(/<row\b([^>]*?)>([\s\S]*?)<\/row>/g)){
   const rowNumber=Number(attr(match[1],"r"))||rows.length+1;
   if(rowNumber>MAX)throw new Error("Sheet has more than 10,000 rows.");
   const row:(string|null)[]=[];let next=0;
   for(const cell of match[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
    const ref=attr(cell[1],"r").match(/^([A-Z]{1,3})\d+$/i)?.[1]?.toUpperCase();
    const index=ref?[...ref].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1:next;
    if(index>99||index<0)continue;next=index+1;
    const kind=attr(cell[1],"t"),body=cell[2]??"";
    const raw=xmlText(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1]??"");
    const value=kind==="s"?strings[Number(raw)]??"":kind==="inlineStr"?fragments(body):kind==="b"?(raw==="1"?"TRUE":"FALSE"):raw;
    row[index]=value.trim().slice(0,20000)||null;
   }
   rows[rowNumber-1]=row;
  }
  result.push({name,rows});
 }
 if(!result.length)throw new Error("No readable worksheets found.");
 return result;
}
export function readCsv(text:string):Sheet[]{
 text=text.replace(/^\uFEFF/,"");
 const first=text.split(/\r?\n/,1)[0];
 const separator=first.includes("\t")?"\t":first.split(";").length>first.split(",").length?";":",";
 const rows:(string|null)[][]=[];let row:(string|null)[]=[],value="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted}
  else if(c===separator&&!quoted){row.push(value.trim()||null);value=""}
  else if((c==="\n"||c==="\r")&&!quoted){
   if(c==="\r"&&text[i+1]==="\n")i++;
   row.push(value.trim()||null);rows.push(row);row=[];value="";
   if(rows.length>MAX)throw new Error("CSV has more than 10,000 rows.");
  }else value+=c;
 }
 if(quoted)throw new Error("CSV has an unfinished quoted cell.");
 if(value||row.length){row.push(value.trim()||null);rows.push(row)}
 return [{name:"Uploaded data",rows}];
}
const norm=(s:string|null|undefined)=>String(s??"").trim().toLowerCase().replace(/\s+/g," ");
const key=(s:string|null|undefined)=>norm(s).replace(/[^a-z0-9]/g,"");
function column(name:string):keyof ImportRecord|null{
 const n=key(name);
 if(!n)return null;
 if(/^organisation$|^organization$|^businessunit$|^entity$/.test(n))return "organization";
 if(/assignedby|^poc$|pointofcontact/.test(n))return "assigned_by";
 if(/invoicetotal|totalinvoice|invoicedamount|billtotal/.test(n))return "invoice_total";
 if(/paymentamount|amountreceived|paidamount|receivedamount|receiptamount/.test(n))return "payment_amount";
 if(/paymentmode|paymentmethod|modeofpayment|paidvia|paymenttype/.test(n))return "payment_method";
 if(/paymentreference|paymentref|transactionid|transactionref|^utr$|^utrnumber$|bankreference/.test(n))return "payment_reference";
 if(/paymentdate|paidon|receiveddate|datepaid/.test(n))return "paid_date";
 if(/invoicedate|issuedate|^date$|billdate/.test(n))return "invoice_date";
 if(/invoiceno|invoicenumber|^invoice$|billnumber|invoiceid/.test(n))return "invoice";
 if(/invoicepdf|invoicedocument|invoicefile/.test(n))return "invoice_document";
 if(/^payment$|paymentstatus|paidstatus/.test(n))return "payment_state";
 if(/^status$|^stauts$|invoicestatus|billstatus/.test(n))return "invoice_status";
 if(/^amount$|^rate$|projectfee|^fee$|^price$|^cost$|charge/.test(n))return "amount";
 if(/^client$|clientname|customer|companyname|^company$|^party$/.test(n))return "client";
 if(/project|workname|servicename|^service$|^description$|^task$|^job$/.test(n))return "project_name";
 if(n==="name")return "client";
 if(/email|mailid/.test(n))return "email";
 if(/phone|mobile|contactno|telephone/.test(n))return "phone";
 if(/address|location/.test(n))return "address";
 if(/gstin|gstnumber|gstno/.test(n))return "gstin";
 if(/note|comment|remark/.test(n))return "notes";
 return null;
}
function header(rows:(string|null)[][]){
 let chosen:{i:number;map:Partial<Record<keyof ImportRecord,number>>;score:number}|null=null;
 for(let i=0;i<Math.min(15,rows.length);i++){
  const map:Partial<Record<keyof ImportRecord,number>>={};let count=0;
  (rows[i]??[]).forEach((cell,j)=>{const c=column(cell??"");if(c&&map[c]===undefined){map[c]=j;count++}});
  const good=map.project_name!==undefined||map.client!==undefined||
   (map.invoice!==undefined&&map.payment_amount!==undefined&&map.paid_date!==undefined);
  const score=count*2+(map.amount!==undefined?2:0)+(map.invoice!==undefined?2:0);
  if(good&&(count>=2||(count===1&&map.client!==undefined))&&(!chosen||score>chosen.score))chosen={i,map,score};
 }
 return chosen;
}
export function parseMoney(value:string|null|undefined):number|null{
 const s=String(value??"").trim();
 if(!s||/^(?:n\/?a|na|[-–—])$/i.test(s))return null;
 const cleaned=s.replace(/(?:INR|Rs\.?|₹|\s|,|\/-|[()])/gi,"");
 const m=cleaned.match(/^-?\d+(?:\.\d{1,2})?/);
 if(!m)return null;
 const n=Number(m[0]);return Number.isFinite(n)?n:null;
}
export function parseDate(value:string|null|undefined):string|null{
 const v=String(value??"").trim();if(!v)return null;
 const serial=Number(v);
 if(/^\d+(?:\.\d+)?$/.test(v)&&serial>=20000&&serial<90000)
  return new Date(Date.UTC(1899,11,30)+Math.round(serial)*86400000).toISOString().slice(0,10);
 let m=v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
 if(m){const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));return d.getUTCFullYear()===+m[1]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[3]?d.toISOString().slice(0,10):null}
 m=v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
 if(m){const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1]?d.toISOString().slice(0,10):null}
 return null;
}
const invoice=(s:string|null|undefined)=>{
 const v=String(s??"").trim();return /^(?:n\/?a|none|[-–—])$/i.test(v)?"":v.replace(/^inv\.\s*/i,"").slice(0,48);
};
const priority=(n:string)=>/master.*all.*time/i.test(n)?120:/master/i.test(n)?100:/current.*fy/i.test(n)?80:/pending|unpaid/i.test(n)?60:/notes/i.test(n)?0:40;
export function normalizeUpload(sheets:Sheet[],organisation:string){
 const found:{r:ImportRecord;score:number;row:number}[]=[];
 const noteRows=new Map<string,string>();const warnings:string[]=[];let owner="";
 for(const sheet of sheets){
  for(const row of sheet.rows.slice(0,4)){
   const val=(row??[]).find(x=>/^for:\s*.+/i.test(x??""));
   if(val){const next=String(val).replace(/^for:\s*/i,"").trim();if(owner&&norm(owner)!==norm(next))throw new Error("Conflicting workbook organisation labels.");owner=next}
  }
  const h=header(sheet.rows);if(!h)continue;
  const get=(r:(string|null)[],k:keyof ImportRecord)=>h.map[k]===undefined?null:r[h.map[k]!]??null;
  let current="",target:number|null=null,spent=0;
  for(let i=h.i+1;i<sheet.rows.length;i++){
   const raw=sheet.rows[i]??[];if(!raw.some(Boolean))continue;
   const specifiedOrg=String(get(raw,"organization")??"").trim();
   if(specifiedOrg&&norm(specifiedOrg)!==norm(organisation))
    throw new Error('Row '+(i+1)+' is labelled for "'+specifiedOrg+'", not "'+organisation+'". No rows were imported.');
   const name=String(get(raw,"project_name")??"").trim();
   let client=String(get(raw,"client")??"").trim();
   if(/^notes?$/i.test(sheet.name)&&h.map.notes!==undefined&&name){
    const n=get(raw,"notes");if(n)noteRows.set(norm(name),String(n));continue;
   }
   const paymentValue=parseMoney(get(raw,"payment_amount"));
   const paymentDate=parseDate(get(raw,"paid_date"));
   if(!name&&!client&&paymentValue===null)continue;
   if(!client&&name.includes("_")&&name.indexOf("_")<80)client=name.split("_")[0].trim();
   const rawInvoice=get(raw,"invoice");
   if(rawInvoice&&invoice(rawInvoice)){current=invoice(rawInvoice);target=parseMoney(get(raw,"invoice_total"));spent=0}
   else if(rawInvoice&&/^(?:n\/?a|none)$/i.test(rawInvoice)){current="";target=null;spent=0}
   else if(current&&target!==null&&spent>=target){current="";target=null;spent=0}
   else if(current&&target===null&&!rawInvoice){
    warnings.push(sheet.name+" row "+(i+1)+": invoice number was blank without an earlier invoice total; left unbilled to avoid guessing.");
    current="";
   }
   if(paymentValue!==null){
    const paymentInvoice=invoice(rawInvoice);
    if(paymentValue<=0||!paymentInvoice||!paymentDate){
     warnings.push(sheet.name+" row "+(i+1)+": payment needs positive amount, an explicit invoice and payment date; no transaction was added.");
    }else{
     const method=String(get(raw,"payment_method")??"").trim();
     const reference=String(get(raw,"payment_reference")??"").trim();
     found.push({r:{kind:"payment",invoice:paymentInvoice,client:client||undefined,
      payment_amount:paymentValue,paid_date:paymentDate,payment_method:method||"other",
      payment_reference:reference||undefined},score:priority(sheet.name),row:i});
    }
   }
   if(!name&&!client)continue;
   const record:ImportRecord={};
   if(client)record.client=client.slice(0,200);
   if(name)record.project_name=name.slice(0,500);
   for(const key of ["email","phone","address","gstin","assigned_by","notes"] as const){
    const v=get(raw,key);if(v)record[key]=String(v).trim();
   }
   const amount=parseMoney(get(raw,"amount"));
   if(amount!==null){if(amount<0){warnings.push(sheet.name+" row "+(i+1)+": negative amount skipped.");continue}record.amount=amount}
   if(current)record.invoice=current;
   if(rawInvoice&&invoice(rawInvoice)){
    const total=parseMoney(get(raw,"invoice_total"));if(total!==null)record.invoice_total=total;
    const date=parseDate(get(raw,"invoice_date"));if(date)record.invoice_date=date;
    const paidOn=parseDate(get(raw,"paid_date"));if(paidOn)record.paid_date=paidOn;
    const payment=get(raw,"payment_state"),status=get(raw,"invoice_status"),doc=get(raw,"invoice_document");
    if(payment){record.payment_state=payment;record.source_paid=paymentValue!==null&&paymentDate?false:/^(paid|yes|true)$/i.test(payment)}
    if(status)record.invoice_status=status;
    if(doc)record.invoice_document=doc;
   }
   found.push({r:record,score:priority(sheet.name),row:i});
   if(current&&amount!==null)spent+=amount;
  }
 }
 if(owner&&norm(owner)!==norm(organisation))
  throw new Error('Workbook is labelled for "'+owner+'", but you selected "'+organisation+'". Choose the matching organisation.');
 found.sort((a,b)=>b.score-a.score||a.row-b.row);
 const records=new Map<string,ImportRecord>();
 for(const item of found){
  const r=item.r;
  const k=r.kind==="payment"?"p:"+norm(r.invoice)+":"+norm(r.paid_date)+":"+String(r.payment_amount)+":"+norm(r.payment_reference):
    r.project_name?"w:"+norm(r.client)+":"+norm(r.project_name):"c:"+norm(r.client);
  const existing=records.get(k);
  if(!existing)records.set(k,r);
  else for(const [name,value] of Object.entries(r)){
   const field=name as keyof ImportRecord;
   if((existing as Record<string,unknown>)[field]===undefined)
    (existing as Record<string,unknown>)[field]=value;
   else if(field==="invoice"&&value!==existing.invoice)
    warnings.push("Conflicting invoice for "+(r.project_name||r.client)+". Review manually.");
  }
 }
 for(const rec of records.values()){
  const note=noteRows.get(norm(rec.project_name));if(note&&!rec.notes)rec.notes=note;
 }
 if(!records.size)throw new Error("No recognizable data rows. Include a client or project name plus an Amount, Email or Invoice column.");
 return {records:[...records.values()],warnings:warnings.slice(0,40),declaredOrganisation:owner||null,detectedSheets:sheets.map(x=>x.name)};
}
