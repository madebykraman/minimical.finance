"use client";

import { useMemo, useState } from "react";
import { Check, FileSpreadsheet, Upload, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { inferImportMapping, normalizeAmount, normalizeDate, parseSpreadsheet, valueFor, type ImportMapping, type ImportSource } from "@/lib/finance/importer";
import { importInvoiceRows } from "@/lib/finance/repository";
import type { Status } from "@/lib/finance/domain";
import { ALL_ORGANIZATIONS_ID } from "@/lib/finance/types";

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
  const [history,setHistory]=useState<any[]>([]);
  const [duplicates,setDuplicates]=useState<Set<string>>(new Set());
  const [resolutions,setResolutions]=useState<Record<number,"skip"|"auto">>({});

  const activeOrgs=organizations.filter(o=>!["dissolved","discontinued"].includes(String(o.status)));
  const selectedRows=source?.rows??[];
  const preview=useMemo(()=>selectedRows.slice(0,8),[selectedRows]);

  async function loadHistory(){
    let q=supabase.from("import_batches").select("*").order("created_at",{ascending:false}).limit(8);
    if(activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID) q=q.eq("organization_id",activeOrganizationId);
    const {data}=await q;setHistory(data||[]);
  }
  useEffect(()=>{void loadHistory()},[activeOrganizationId]);

  useEffect(()=>{
    if(!selectedRows.length||!mapping.invoiceNumber)return setDuplicates(new Set());
    const values=selectedRows.map(row=>String(valueFor(row,mapping.invoiceNumber)).trim()).filter(Boolean);
    if(!values.length)return setDuplicates(new Set());
    let cancelled=false;
    supabase.from("invoices").select("organization_id,invoice_number").in("invoice_number",values).then(({data})=>{
      if(cancelled)return;
      setDuplicates(new Set((data||[]).map(row=>`${row.organization_id}:${row.invoice_number}`)));
    });
    return()=>{cancelled=true};
  },[selectedRows,mapping.invoiceNumber,mapping.organization,activeOrganizationId]);

  const validation=useMemo(()=>selectedRows.map((row,index)=>{
    const orgName=String(valueFor(row,mapping.organization)).trim();
    const org=orgName
      ? activeOrgs.find(o=>String(o.name).trim().toLowerCase()===orgName.toLowerCase())
      : activeOrganizationId && activeOrganizationId!==ALL_ORGANIZATIONS_ID
        ? activeOrgs.find(o=>o.id===activeOrganizationId)
        : undefined;
    const amount=normalizeAmount(valueFor(row,mapping.amount));
    const issueDate=normalizeDate(valueFor(row,mapping.issueDate));
    const client=String(valueFor(row,mapping.client)).trim();
    const invoiceNumber=String(valueFor(row,mapping.invoiceNumber)).trim();
    const duplicate=Boolean(org&&invoiceNumber&&duplicates.has(`${org.id}:${invoiceNumber}`));
    const errors:string[]=[];
    if(!org)errors.push("Organisation");
    if(!client)errors.push("Client");
    if(!issueDate)errors.push("Issue date");
    if(amount==null||amount<0)errors.push("Amount");
    if(duplicate&&!resolutions[index])errors.push("Duplicate");
    return {index,row,org,amount,issueDate,client,invoiceNumber,duplicate,errors,skipped:resolutions[index]==="skip"};
  }),[selectedRows,mapping,activeOrgs,activeOrganizationId,duplicates,resolutions]);

  const ready=validation.filter(v=>!v.skipped&&v.errors.length===0);
  const skipped=validation.filter(v=>v.skipped);
  const blocked=validation.filter(v=>!v.skipped&&v.errors.length>0);

  async function load(file:File){
    setBusy(true);setMessage("");setResolutions({});
    try{
      const parsed=await parseSpreadsheet(file);
      setSources(parsed);setSheetNames(parsed.map(s=>s.sheet));
      const first=parsed[0]??null;setSource(first);setMapping(first?inferImportMapping(first.headers):{});
      if(!first)setMessage("No readable worksheet was found.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not read this spreadsheet.");}
    finally{setBusy(false);}
  }

  async function commit(){
    if(!ready.length)return;
    setBusy(true);setMessage("");
    const normalized=ready.map(v=>({
      organizationId:v.org!.id,
      clientName:v.client,
      projectName:String(valueFor(v.row,mapping.project)).trim()||undefined,
      invoiceNumber:resolutions[v.index]==="auto"?undefined:v.invoiceNumber||undefined,
      issueDate:v.issueDate,
      dueDate:normalizeDate(valueFor(v.row,mapping.dueDate))||undefined,
      amount:v.amount!,
      description:String(valueFor(v.row,mapping.description)).trim()||undefined,
      status:(["draft","sent","partially_paid","paid","void"].includes(String(valueFor(v.row,mapping.status)).toLowerCase())?String(valueFor(v.row,mapping.status)).toLowerCase():"draft") as Status,
      paymentDate:normalizeDate(valueFor(v.row,mapping.paymentDate))||undefined,
      paymentAmount:normalizeAmount(valueFor(v.row,mapping.paymentAmount))??undefined,
    }));
    const {data:userData}=await supabase.auth.getUser();
    if(!userData.user){setMessage("Your session expired. Sign in again.");setBusy(false);return;}
    const batch=await supabase.from("import_batches").insert({
      organization_id:activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID?activeOrganizationId:null,
      created_by:userData.user.id,
      source_name:source?.name||"Spreadsheet",
      source_type:"spreadsheet",
      status:"importing",
      total_rows:selectedRows.length,
      ready_rows:ready.length,
      skipped_rows:skipped.length,
      blocked_rows:blocked.length,
      metadata:{sheets:sheetNames,mapping},
    }).select("id").single();
    if(batch.error||!batch.data){setMessage(batch.error?.message||"Could not create import batch.");setBusy(false);return;}
    await supabase.from("import_batch_rows").insert(validation.map(v=>({
      batch_id:batch.data.id,
      row_number:v.index+1,
      source_data:v.row as any,
      normalized_data:ready.some(x=>x.index===v.index)?(normalized.find((_,i)=>ready[i]?.index===v.index)||{}):{},
      status:v.skipped?"skipped":v.errors.length?"blocked":v.duplicate&&resolutions[v.index]==="auto"?"resolved":"ready",
      issue_codes:v.errors,
      resolution:resolutions[v.index]?{duplicate:resolutions[v.index]}:{},
    })));
    const result=await importInvoiceRows(normalized);
    if(!result.ok){
      await supabase.from("import_batches").update({status:"completed_with_errors",completed_at:new Date().toISOString(),blocked_rows:blocked.length+ready.length}).eq("id",batch.data.id);
      await supabase.from("import_batch_rows").update({status:"failed"}).eq("batch_id",batch.data.id).in("status",["ready","resolved"]);
      setMessage(`Import failed atomically: ${result.error||"unknown error"}. No partial rows were written.`);
      setBusy(false);await loadHistory();return;
    }
    await supabase.from("import_batch_rows").update({status:"imported"}).eq("batch_id",batch.data.id).in("status",["ready","resolved"]);
    await supabase.from("import_batches").update({status:"completed",imported_rows:result.created,completed_at:new Date().toISOString()}).eq("id",batch.data.id);
    setMessage(`Import reconciled successfully: ${result.created} created · ${skipped.length} skipped · ${blocked.length} blocked.`);
    setBusy(false);await loadHistory();onComplete();
  }

  return <div className="import-page">
    <div className="import-head">
      <div><span className="eyebrow">DATA INTAKE</span><h1>Import & reconcile</h1><p>Map source data, resolve organisation ownership and duplicates, then commit the batch atomically.</p></div>
      {source&&<button className="secondary" onClick={()=>{setSource(null);setSources([]);setMessage("");setResolutions({})}}><RefreshCw size={14}/>Start over</button>}
    </div>
    {!source?<>
      <section className="import-dropzone"><div className="import-icon"><FileSpreadsheet size={22}/></div><h2>Drop a CSV or Excel file</h2><p>CSV, XLS and XLSX are parsed locally first. Nothing is written until you confirm reconciliation.</p><label className="primary import-picker"><Upload size={15}/>Choose file<input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f)}} hidden/></label>{busy&&<span className="import-status">Reading workbook…</span>}{message&&<div className="auth-message">{message}</div>}</section>
      <section className="data-panel import-history"><div className="data-panel-head"><div><h2>Import history</h2><p>Persisted reconciliation batches and outcomes.</p></div></div>{history.length?history.map(b=><div className="import-history-row" key={b.id}><span><b>{b.source_name}</b><small>{new Date(b.created_at).toLocaleString("en-IN")}</small></span><strong>{b.imported_rows} imported</strong><em className={b.status}>{b.status.replaceAll("_"," ")}</em></div>):<div className="empty-state"><FileText size={18}/><b>No import batches yet.</b><span>Completed and reviewed imports will appear here.</span></div>}</section>
    </>:<div className="import-workflow">
      <section className="data-panel import-panel"><div className="data-panel-head"><div><h2>{source.name}</h2><p>{source.rows.length.toLocaleString()} rows · {sheetNames.length} sheet{sheetNames.length===1?"":"s"}</p></div><div className="import-sheet-tabs">{sources.map(s=><button key={s.sheet} className={s.sheet===source.sheet?"active":""} onClick={()=>{setSource(s);setMapping(inferImportMapping(s.headers));setResolutions({})}}>{s.sheet}</button>)}</div></div>
        <div className="import-map-grid">{fields.map(([key,label,required])=><label key={key}><span>{label}{required?" *":""}</span><select value={mapping[key]??""} onChange={e=>setMapping(m=>({...m,[key]:e.target.value||undefined}))}><option value="">Not mapped</option>{source.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
      </section>
      <section className="data-panel import-panel"><div className="data-panel-head"><div><h2>Reconciliation</h2><p>{ready.length} ready · {skipped.length} skipped · {blocked.length} blocked</p></div><div className={blocked.length?"import-ready warning":"import-ready"}>{blocked.length?<><AlertTriangle size={14}/>Resolve blockers</>:<><Check size={14}/>Ready to commit</>}</div></div>
        <div className="import-preview"><div className="import-preview-head"><span>Row</span><span>Organisation</span><span>Client</span><span>Invoice</span><span>Amount</span><span>Resolution</span></div>
        {preview.map((row,i)=>{const v=validation[i];return <div className="import-preview-row" key={i}><span>{i+1}</span><span>{v.org?.name||"—"}</span><span>{v.client||"—"}</span><span>{v.invoiceNumber||"Auto"}</span><strong>{v.amount==null?"—":v.amount.toLocaleString("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2})}</strong><em className={v.skipped?"skip":v.errors.length?"error":"ok"}>{v.duplicate&&!v.skipped?<><button type="button" className="mini-resolution" onClick={()=>setResolutions(x=>({...x,[i]:x[i]==="auto"?undefined:"auto"}))}>{resolutions[i]==="auto"?"Auto-number":"Duplicate · resolve"}</button><button type="button" className="mini-resolution" onClick={()=>setResolutions(x=>({...x,[i]:x[i]==="skip"?undefined:"skip"}))}>{resolutions[i]==="skip"?"Skipped":"Skip"}</button></>:v.errors.length?v.errors.join(", "):v.skipped?"Skipped":"Ready"}</em></div>})}
        {!preview.length&&<div className="empty-state">No rows in this sheet.</div>}</div>
      </section>
      <section className="import-summary"><div><span>Source</span><strong>{source.name}</strong></div><div><span>Rows</span><strong>{selectedRows.length}</strong></div><div><span>Ready</span><strong>{ready.length}</strong></div><div><span>Blocked</span><strong>{blocked.length}</strong></div><div><span>Skipped</span><strong>{skipped.length}</strong></div><button className="primary" disabled={busy||!ready.length||blocked.length>0} onClick={()=>void commit()}>{busy?"Importing…":<>Commit ${ready.length} records <ArrowRight size={14}/></>}</button></section>
      {message&&<div className={message.startsWith("Import reconciled")?"auth-success":"auth-message"}>{message}</div>}
    </div>}
  </div>;
}
