"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, FileSpreadsheet, FileText, RefreshCw, Sparkles, Upload } from "lucide-react";
import {
  analyzeImportSource,
  inferImportMapping,
  normalizeAmount,
  normalizeDate,
  parseSpreadsheet,
  valueFor,
  type ImportAnalysis,
  type ImportMapping,
  type ImportSource,
} from "@/lib/finance/importer";
import { importInvoiceRows } from "@/lib/finance/repository";
import type { Status } from "@/lib/finance/domain";
import { ALL_ORGANIZATIONS_ID } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/client";

type Organization = { id:string; name?:string|null; status?:string|null };

const supabase=createClient();
const fieldLabels:Record<keyof ImportMapping,string>={
  organization:"Organisation",client:"Client",project:"Project",invoiceNumber:"Invoice number",
  issueDate:"Issue date",dueDate:"Due date",amount:"Amount",status:"Status",
  paymentDate:"Payment date",paymentAmount:"Payment amount",description:"Description",
};
const requiredFields:Array<keyof ImportMapping>=["client","issueDate","amount"];

const clean=(v:unknown)=>String(v??"").trim();
const norm=(v:unknown)=>clean(v).toLowerCase().replace(/[_-]+/g," ").replace(/\\s+/g," ");

export function ImportCenter({organizations,activeOrganizationId,onComplete}:{organizations:Organization[];activeOrganizationId:string|null;onComplete:()=>void}) {
  const [source,setSource]=useState<ImportSource|null>(null);
  const [sources,setSources]=useState<ImportSource[]>([]);
  const [analysis,setAnalysis]=useState<ImportAnalysis|null>(null);
  const [mapping,setMapping]=useState<ImportMapping>({});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [history,setHistory]=useState<any[]>([]);
  const [duplicates,setDuplicates]=useState<Set<string>>(new Set());
  const [resolutions,setResolutions]=useState<Record<number,"skip"|"auto">>({});
  const [reviewMapping,setReviewMapping]=useState(false);
  const [showAllRows,setShowAllRows]=useState(false);

  const activeOrgs=organizations.filter(o=>!["dissolved","discontinued"].includes(String(o.status)));
  const selectedRows=source?.rows??[];

  async function loadHistory(){
    let q=supabase.from("import_batches").select("*").order("created_at",{ascending:false}).limit(8);
    if(activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID)q=q.eq("organization_id",activeOrganizationId);
    const {data}=await q;setHistory(data||[]);
  }
  useEffect(()=>{void loadHistory()},[activeOrganizationId]);

  function resolveOrg(value:unknown){
    const raw=norm(value);
    if(raw){
      const exact=activeOrgs.find(o=>norm(o.name)===raw);
      if(exact)return exact;
      const partial=activeOrgs.find(o=>raw.includes(norm(o.name))||norm(o.name).includes(raw));
      if(partial)return partial;
    }
    if(activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID)return activeOrgs.find(o=>o.id===activeOrganizationId);
    if(activeOrgs.length===1)return activeOrgs[0];
    return undefined;
  }

  const validation=useMemo(()=>selectedRows.map((row,index)=>{
    const org=resolveOrg(valueFor(row,mapping.organization));
    const client=clean(valueFor(row,mapping.client));
    const project=clean(valueFor(row,mapping.project));
    const invoiceNumber=clean(valueFor(row,mapping.invoiceNumber));
    const issueDate=normalizeDate(valueFor(row,mapping.issueDate));
    const dueDate=normalizeDate(valueFor(row,mapping.dueDate));
    const amount=normalizeAmount(valueFor(row,mapping.amount));
    const paymentDate=normalizeDate(valueFor(row,mapping.paymentDate));
    const paymentAmount=normalizeAmount(valueFor(row,mapping.paymentAmount));
    const duplicate=Boolean(org&&invoiceNumber&&duplicates.has(`${org.id}:${invoiceNumber}`));
    const errors:string[]=[];
    const warnings:string[]=[];
    if(!org)errors.push("Organisation");
    if(!client)errors.push("Client");
    if(!issueDate)errors.push("Issue date");
    if(amount==null||amount<0)errors.push("Amount");
    if(dueDate&&issueDate&&dueDate<issueDate)warnings.push("Due date before issue date");
    if(paymentDate&&!paymentAmount)warnings.push("Payment date without payment amount");
    if(paymentAmount!=null&&amount!=null&&paymentAmount>amount)errors.push("Payment > invoice");
    if(duplicate&&!resolutions[index])errors.push("Duplicate");
    return {index,row,org,client,project,invoiceNumber,issueDate,dueDate,amount,paymentDate,paymentAmount,duplicate,errors,warnings,skipped:resolutions[index]==="skip"};
  }),[selectedRows,mapping,activeOrgs,activeOrganizationId,duplicates,resolutions]);

  const ready=validation.filter(v=>!v.skipped&&v.errors.length===0);
  const skipped=validation.filter(v=>v.skipped);
  const blocked=validation.filter(v=>!v.skipped&&v.errors.length>0);
  const warningCount=validation.reduce((n,v)=>n+v.warnings.length,0);

  useEffect(()=>{
    if(!selectedRows.length||!mapping.invoiceNumber){setDuplicates(new Set());return;}
    const values=[...new Set(selectedRows.map(row=>clean(valueFor(row,mapping.invoiceNumber))).filter(Boolean))];
    if(!values.length){setDuplicates(new Set());return;}
    let cancelled=false;
    supabase.from("invoices").select("organization_id,invoice_number").in("invoice_number",values).then(({data})=>{
      if(!cancelled)setDuplicates(new Set((data||[]).map(row=>`${row.organization_id}:${row.invoice_number}`)));
    });
    return()=>{cancelled=true};
  },[selectedRows,mapping.invoiceNumber]);

  async function load(file:File){
    setBusy(true);setMessage("");setResolutions({});setReviewMapping(false);
    try{
      const parsed=await parseSpreadsheet(file);
      const ranked=[...parsed].sort((a,b)=>(b.rows.length*b.confidence)-(a.rows.length*a.confidence));
      const first=ranked[0]??null;
      setSources(ranked);setSource(first);
      if(first){
        const next=analyzeImportSource(first);
        const smartMapping={...next.mapping};
        if(!smartMapping.organization&&(activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID||activeOrgs.length===1))smartMapping.organization="__ACTIVE_ORGANISATION__";
        setAnalysis({...next,mapping:smartMapping});setMapping(smartMapping);
      }
      if(!first)setMessage("No readable worksheet was found.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not analyse this spreadsheet.");}
    finally{setBusy(false);}
  }

  function switchSheet(next:ImportSource){
    setSource(next);setResolutions({});setShowAllRows(false);
    const nextAnalysis=analyzeImportSource(next);
    const smartMapping={...nextAnalysis.mapping};
    if(!smartMapping.organization&&(activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID||activeOrgs.length===1))smartMapping.organization="__ACTIVE_ORGANISATION__";
    setAnalysis({...nextAnalysis,mapping:smartMapping});setMapping(smartMapping);
  }

  function displayHeader(key?:string){
    if(key==="__ACTIVE_ORGANISATION__")return activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID?activeOrgs.find(o=>o.id===activeOrganizationId)?.name||"Current organisation":"Single active organisation";
    return key||"Not mapped";
  }

  async function commit(){
    if(!ready.length||blocked.length)return;
    setBusy(true);setMessage("");
    const normalized=ready.map(v=>({
      organizationId:v.org!.id,
      clientName:v.client,
      projectName:v.project||undefined,
      invoiceNumber:resolutions[v.index]==="auto"?undefined:v.invoiceNumber||undefined,
      issueDate:v.issueDate,
      dueDate:v.dueDate||undefined,
      amount:v.amount!,
      description:clean(valueFor(v.row,mapping.description))||undefined,
      status:(["draft","sent","partially_paid","paid","void"].includes(clean(valueFor(v.row,mapping.status)).toLowerCase())?clean(valueFor(v.row,mapping.status)).toLowerCase():"draft") as Status,
      paymentDate:v.paymentDate||undefined,
      paymentAmount:v.paymentAmount??undefined,
    }));
    const {data:userData}=await supabase.auth.getUser();
    if(!userData.user){setMessage("Your session expired. Sign in again.");setBusy(false);return;}
    const batch=await supabase.from("import_batches").insert({
      organization_id:activeOrganizationId&&activeOrganizationId!==ALL_ORGANIZATIONS_ID?activeOrganizationId:null,
      created_by:userData.user.id,source_name:source?.name||"Spreadsheet",source_type:"spreadsheet",status:"importing",
      total_rows:selectedRows.length,ready_rows:ready.length,skipped_rows:skipped.length,blocked_rows:blocked.length,
      metadata:{sheets:sources.map(s=>s.sheet),mapping,analysis},
    }).select("id").single();
    if(batch.error||!batch.data){setMessage(batch.error?.message||"Could not create import batch.");setBusy(false);return;}
    await supabase.from("import_batch_rows").insert(validation.map(v=>({
      batch_id:batch.data.id,row_number:v.index+1,source_data:v.row as any,
      normalized_data:ready.find(x=>x.index===v.index)?normalized.find((_,i)=>ready[i]?.index===v.index)||{}:{},
      status:v.skipped?"skipped":v.errors.length?"blocked":v.duplicate&&resolutions[v.index]==="auto"?"resolved":"ready",
      issue_codes:v.errors,resolution:resolutions[v.index]?{duplicate:resolutions[v.index]}:{},
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
    setMessage(`Import complete: ${result.created} records created · ${skipped.length} skipped.`);
    setBusy(false);await loadHistory();onComplete();
  }

  return <div className="import-page">
    <div className="import-head">
      <div><span className="eyebrow">DATA INTAKE</span><h1>Smart import</h1><p>Drop the source in. MinBooks analyses its structure, maps the financial fields, resolves ownership and stops only where a human decision is actually required.</p></div>
      {source&&<button className="secondary" onClick={()=>{setSource(null);setSources([]);setAnalysis(null);setMapping({});setMessage("");setResolutions({})}}><RefreshCw size={14}/>Start over</button>}
    </div>

    {!source?<>
      <section className="smart-import-drop">
        <div className="smart-import-orb"><Sparkles size={22}/></div>
        <div><span className="eyebrow">AUTOMATIC ANALYSIS</span><h2>Import a spreadsheet. We’ll figure it out.</h2><p>CSV, XLS and XLSX are read locally first. MinBooks detects headers, dates, amounts, invoice fields and organisation ownership before anything is written.</p></div>
        <label className="primary import-picker"><Upload size={15}/>Choose file<input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f)}} hidden/></label>
        {busy&&<span className="import-status">Analysing workbook…</span>}
        {message&&<div className="auth-message">{message}</div>}
      </section>
      <section className="data-panel import-history"><div className="data-panel-head"><div><span className="eyebrow">History</span><h2>Import runs</h2><p>Every committed batch remains auditable.</p></div></div>{history.length?history.map(b=><div className="import-history-row" key={b.id}><span><b>{b.source_name}</b><small>{new Date(b.created_at).toLocaleString("en-IN")}</small></span><strong>{b.imported_rows} imported</strong><em className={b.status}>{b.status.replaceAll("_"," ")}</em></div>):<div className="empty-state"><FileText size={18}/><b>No import runs yet.</b><span>Completed and reviewed imports will appear here.</span></div>}</section>
    </>:<div className="smart-import-workflow">
      <section className="smart-import-hero">
        <div className="smart-file-icon"><FileSpreadsheet size={20}/></div>
        <div className="smart-import-file"><strong>{source.name}</strong><span>{selectedRows.length.toLocaleString()} records · {sources.length} sheet{sources.length===1?"":"s"} · {source.headerDetected?"header detected":"headerless sheet"}</span></div>
        <div className="smart-import-score"><span>Analysis confidence</span><strong>{Math.round((analysis?.confidence??source.confidence*100))}%</strong></div>
      </section>

      {sources.length>1&&<div className="smart-sheet-strip">{sources.map(s=><button key={s.sheet} className={s.sheet===source.sheet?"active":""} onClick={()=>switchSheet(s)}>{s.sheet}<small>{s.rows.length} rows</small></button>)}</div>}

      <section className="smart-analysis-grid">
        <div className="data-panel smart-analysis-panel"><div className="data-panel-head"><div><span className="eyebrow">Machine analysis</span><h2>What MinBooks found</h2></div><Sparkles size={16}/></div>
          <div className="smart-analysis-list">
            <div><span>Source shape</span><b>{source.headerDetected?"Structured table":"Headerless / irregular"}</b></div>
            <div><span>Header row</span><b>{source.headerDetected?`Row ${source.headerRow+1}`:"Not reliable"}</b></div>
            <div><span>Fields mapped</span><b>{Object.keys(mapping).filter(k=>mapping[k as keyof ImportMapping]&&mapping[k as keyof ImportMapping]!=="__ACTIVE_ORGANISATION__").length} / {Object.keys(fieldLabels).length}</b></div>
            <div><span>Rows excluded</span><b>{source.skippedRows}</b></div>
          </div>
        </div>
        <div className="data-panel smart-mapping-panel"><div className="data-panel-head"><div><span className="eyebrow">Automatic mapping</span><h2>Financial fields</h2></div><button className="text-action" onClick={()=>setReviewMapping(v=>!v)}>{reviewMapping?"Hide":"Review mapping"} <ChevronDown size={13}/></button></div>
          <div className="smart-mapping-chips">{(Object.keys(fieldLabels) as (keyof ImportMapping)[]).map(field=>{const value=mapping[field];return <button key={field} className={value?"mapped":"unmapped"} onClick={()=>setReviewMapping(true)}><span>{fieldLabels[field]}{requiredFields.includes(field)?" *":""}</span><b>{displayHeader(value)}</b></button>})}</div>
          {reviewMapping&&<div className="smart-mapping-editor">{(Object.keys(fieldLabels) as (keyof ImportMapping)[]).map(field=><label key={field}><span>{fieldLabels[field]}{requiredFields.includes(field)?" *":""}</span><select value={mapping[field]??""} onChange={e=>setMapping(m=>({...m,[field]:e.target.value||undefined}))}><option value="">Not mapped</option>{field==="organization"&&<option value="__ACTIVE_ORGANISATION__">Use current organisation automatically</option>}{source.headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>}
        </div>
      </section>

      <section className="data-panel smart-reconciliation"><div className="data-panel-head"><div><span className="eyebrow">Reconciliation</span><h2>{ready.length} ready · {blocked.length} need attention</h2></div><div className={blocked.length?"import-ready warning":"import-ready"}>{blocked.length?<><AlertTriangle size={14}/>Review exceptions</>:<><Check size={14}/>Ready to import</>}</div></div>
        <div className="smart-reconciliation-summary"><div><strong>{ready.length}</strong><span>Ready</span></div><div><strong>{blocked.length}</strong><span>Exceptions</span></div><div><strong>{skipped.length}</strong><span>Skipped</span></div><div><strong>{warningCount}</strong><span>Warnings</span></div></div>
        <div className="smart-row-list">
          {(showAllRows?validation:validation.slice(0,8)).map(v=><div className={"smart-row "+(v.errors.length?"blocked":"")} key={v.index}>
            <span className="smart-row-number">{v.index+1}</span>
            <div><strong>{v.client||"Client missing"}</strong><small>{v.project||"No project"} · {v.invoiceNumber||"Invoice number will be allocated"}</small></div>
            <span className="smart-row-org">{v.org?.name||"Organisation unresolved"}</span>
            <strong className="smart-row-amount">{v.amount==null?"—":v.amount.toLocaleString("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0})}</strong>
            <span className={"smart-row-state "+(v.skipped?"skip":v.errors.length?"error":"ok")}>{v.errors.length?v.errors[0]:v.warnings.length?v.warnings[0]:"Ready"}</span>
            {v.duplicate&&!v.skipped&&<div className="smart-row-actions"><button className="mini-resolution" onClick={()=>setResolutions(x=>{const n={...x};if(n[v.index]==="auto")delete n[v.index];else n[v.index]="auto";return n})}>{resolutions[v.index]==="auto"?"Auto-number selected":"Auto-number"}</button><button className="mini-resolution" onClick={()=>setResolutions(x=>{const n={...x};if(n[v.index]==="skip")delete n[v.index];else n[v.index]="skip";return n})}>{resolutions[v.index]==="skip"?"Skipped":"Skip"}</button></div>}
          </div>)}
        </div>
        {validation.length>8&&<button className="secondary smart-show-all" onClick={()=>setShowAllRows(v=>!v)}>{showAllRows?"Show first 8":"Review all "+validation.length+" rows"}</button>}
      </section>

      <section className="smart-import-footer">
        <div><span>Import plan</span><strong>{ready.length} records will be created</strong><small>{blocked.length?blocked.length+" exceptions must be resolved before commit.":warningCount?warningCount+" non-blocking warnings will be preserved in the audit trail.":"No unresolved exceptions."}</small></div>
        <button className="primary smart-commit" disabled={busy||!ready.length||blocked.length>0} onClick={()=>void commit()}>{busy?"Importing…":<>Import {ready.length} records <ArrowRight size={15}/></>}</button>
      </section>
      {message&&<div className={message.startsWith("Import complete")?"auth-success":"auth-message"}>{message}</div>}
    </div>}
  </div>;
}
