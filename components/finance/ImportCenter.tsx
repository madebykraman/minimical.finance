"use client";

import { useMemo, useState } from "react";
import { Check, FileSpreadsheet, Upload, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { inferImportMapping, normalizeAmount, normalizeDate, parseSpreadsheet, valueFor, type ImportMapping, type ImportSource } from "@/lib/finance/importer";
import { importInvoiceRows } from "@/lib/finance/repository";
import type { Status } from "@/lib/finance/domain";

type Organization = { id:string; name?:string|null; status?:string|null };

const fields:Array<[keyof ImportMapping,string,boolean]>=([
  ["organization","Organisation",false],
  ["client","Client",true],
  ["project","Project",false],
  ["invoiceNumber","Invoice number",false],
  ["issueDate","Issue date",true],
  ["dueDate","Due date",false],
  ["amount","Amount",true],
  ["status","Status",false],
  ["description","Description",false],
  ["paymentDate","Payment date",false],
  ["paymentAmount","Payment amount",false],
]);

export function ImportCenter({organizations,activeOrganizationId,onComplete}:{organizations:Organization[];activeOrganizationId:string|null;onComplete:()=>void}) {
  const [source,setSource]=useState<ImportSource|null>(null);
  const [sheetNames,setSheetNames]=useState<string[]>([]);
  const [sources,setSources]=useState<ImportSource[]>([]);
  const [mapping,setMapping]=useState<ImportMapping>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [results,setResults]=useState<{ok:number;failed:number}>({ok:0,failed:0});

  const activeOrgs=organizations.filter(o=>!["dissolved","discontinued"].includes(String(o.status)));
  const selectedRows=source?.rows??[];

  const preview=useMemo(()=>selectedRows.slice(0,8),[selectedRows]);
  const validation=useMemo(()=>selectedRows.map((row,index)=>{
    const orgName=String(valueFor(row,mapping.organization)).trim();
    const org=orgName ? activeOrgs.find(o=>String(o.name).trim().toLowerCase()===orgName.toLowerCase()) : activeOrgs.find(o=>o.id===activeOrganizationId);
    const amount=normalizeAmount(valueFor(row,mapping.amount));
    const issueDate=normalizeDate(valueFor(row,mapping.issueDate));
    const client=String(valueFor(row,mapping.client)).trim();
    const errors:string[]=[];
    if(!org) errors.push("Organisation");
    if(!client) errors.push("Client");
    if(!issueDate) errors.push("Issue date");
    if(amount==null || amount<0) errors.push("Amount");
    return {index,row,org,amount,issueDate,client,errors};
  }),[selectedRows,mapping,activeOrgs,activeOrganizationId]);

  const valid=validation.filter(v=>v.errors.length===0);
  const invalid=validation.length-valid.length;

  async function load(file:File) {
    setBusy(true); setMessage(""); setResults({ok:0,failed:0});
    try {
      const parsed=await parseSpreadsheet(file);
      setSources(parsed); setSheetNames(parsed.map(s=>s.sheet));
      const first=parsed[0]??null;
      setSource(first);
      setMapping(first ? inferImportMapping(first.headers) : {});
      if(!first) setMessage("No readable worksheet was found.");
    } catch(e) {
      setMessage(e instanceof Error ? e.message : "Could not read this spreadsheet.");
    } finally { setBusy(false); }
  }

  async function commit() {
    if(!valid.length) return;
    setBusy(true); setMessage("");
    const rows=valid.map(v=>({
      organizationId:v.org!.id,
      clientName:v.client,
      projectName:String(valueFor(v.row,mapping.project)).trim() || undefined,
      invoiceNumber:String(valueFor(v.row,mapping.invoiceNumber)).trim() || undefined,
      issueDate:v.issueDate,
      dueDate:normalizeDate(valueFor(v.row,mapping.dueDate)) || undefined,
      amount:v.amount!,
      description:String(valueFor(v.row,mapping.description)).trim() || undefined,
      status:(["draft","sent","partially_paid","paid","void"].includes(String(valueFor(v.row,mapping.status)).toLowerCase()) ? String(valueFor(v.row,mapping.status)).toLowerCase() : "draft") as Status,
      paymentDate:normalizeDate(valueFor(v.row,mapping.paymentDate)) || undefined,
      paymentAmount:normalizeAmount(valueFor(v.row,mapping.paymentAmount)) ?? undefined,
    }));
    const imported=await importInvoiceRows(rows);
    const failed=imported.filter(r=>r.error).length;
    setResults({ok:imported.length-failed,failed});
    setMessage(failed ? "Import completed with row-level failures. Review the result before re-running." : "Import completed successfully.");
    setBusy(false);
    if(!failed) onComplete();
  }

  return <div className="import-page">
    <div className="import-head">
      <div><span className="eyebrow">DATA INTAKE</span><h1>Import records</h1><p>Bring invoices from another invoicing system or spreadsheet without making the source your new source of truth.</p></div>
      {source&&<button className="secondary" onClick={()=>{setSource(null);setSources([]);setMessage("");}}><RefreshCw size={14}/>Start over</button>}
    </div>

    {!source ? <section className="import-dropzone">
      <div className="import-icon"><FileSpreadsheet size={22}/></div>
      <h2>Drop a CSV or Excel file</h2>
      <p>CSV, XLS and XLSX are parsed locally first. Nothing is written until you confirm the import.</p>
      <label className="primary import-picker"><Upload size={15}/>Choose file<input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f)}} hidden/></label>
      {busy&&<span className="import-status">Reading workbook…</span>}
      {message&&<div className="auth-message">{message}</div>}
    </section> : <div className="import-workflow">
      <section className="data-panel import-panel">
        <div className="data-panel-head"><div><h2>{source.name}</h2><p>{source.rows.length.toLocaleString()} rows · {sheetNames.length} sheet{sheetNames.length===1?"":"s"}</p></div><div className="import-sheet-tabs">{sources.map(s=><button key={s.sheet} className={s.sheet===source.sheet?"active":""} onClick={()=>{setSource(s);setMapping(inferImportMapping(s.headers))}}>{s.sheet}</button>)}</div></div>
        <div className="import-map-grid">
          {fields.map(([key,label,required])=><label key={key}><span>{label}{required?" *":""}</span><select value={mapping[key]??""} onChange={e=>setMapping(m=>({...m,[key]:e.target.value||undefined}))}><option value="">Not mapped</option>{source.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}
        </div>
      </section>

      <section className="data-panel import-panel">
        <div className="data-panel-head"><div><h2>Validation</h2><p>{valid.length} ready · {invalid} need attention</p></div><div className="import-ready">{invalid===0&&valid.length>0?<><Check size={14}/>Ready to import</>:<><AlertTriangle size={14}/>Fix mappings</>}</div></div>
        <div className="import-preview">
          <div className="import-preview-head"><span>Row</span><span>Organisation</span><span>Client</span><span>Invoice</span><span>Amount</span><span>Result</span></div>
          {preview.map((row,i)=>{const v=validation[i];return <div className="import-preview-row" key={i}><span>{i+1}</span><span>{v.org?.name||"—"}</span><span>{v.client||"—"}</span><span>{String(valueFor(row,mapping.invoiceNumber))||"Auto"}</span><strong>{v.amount==null?"—":v.amount.toLocaleString("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2})}</strong><em className={v.errors.length?"error":"ok"}>{v.errors.length?v.errors.join(", "):"Ready"}</em></div>})}
          {!preview.length&&<div className="empty-state">No rows in this sheet.</div>}
        </div>
      </section>

      <section className="import-summary">
        <div><span>Source</span><strong>{source.name}</strong></div>
        <div><span>Rows</span><strong>{selectedRows.length}</strong></div>
        <div><span>Ready</span><strong>{valid.length}</strong></div>
        <div><span>Blocked</span><strong>{invalid}</strong></div>
        <button className="primary" disabled={busy||!valid.length} onClick={()=>void commit()}>{busy?"Importing…":<>Import {valid.length} records <ArrowRight size={14}/></>}</button>
      </section>
      {message&&<div className={results.failed?"auth-message":"auth-success"}>{message} {results.ok||results.failed?<span>{results.ok} created · {results.failed} failed</span>:null}</div>}
    </div>}
  </div>;
}
