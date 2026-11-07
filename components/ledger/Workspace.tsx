"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {
  LayoutDashboard,BriefcaseBusiness,ReceiptText,Wallet,UsersRound,Files,ChartNoAxesColumn,
  Settings2,Search,Plus,ChevronRight,ChevronDown,ArrowDownToLine,ArrowUpRight,
  MoreHorizontal,X,LogOut,RefreshCw,AlertCircle,CheckCircle2,FileText,
  CalendarDays,Menu,Trash2,PenLine,ShieldCheck,ExternalLink,Check,Filter,
  FilePlus2,IndianRupee,ClipboardList,LockKeyhole,UploadCloud
} from "lucide-react";
import {browserClient} from "@/lib/supabase/browser";
import {
  type TrackerRow,type TrackerPayment,type TrackerClient,type Snapshot,
  type InvoiceGroup,invoiceGroups,money,dateLabel,titleFromSource,csv,sum
} from "@/lib/tracker";

type View="overview"|"work"|"invoices"|"payments"|"clients"|"documents"|"reports"|"settings";
type TrackerDocument={id:string;file_name:string;size_bytes:number;mime_type:string;invoice_number:string|null;client_id:string|null;visible_to_client:boolean;created_at:string};
const NAV:{id:View;name:string;icon:typeof LayoutDashboard}[]=[
  {id:"overview",name:"Overview",icon:LayoutDashboard},
  {id:"work",name:"Work",icon:BriefcaseBusiness},
  {id:"invoices",name:"Invoices",icon:ReceiptText},
  {id:"payments",name:"Payments",icon:Wallet},
  {id:"clients",name:"Clients",icon:UsersRound},
  {id:"documents",name:"Documents",icon:Files},
  {id:"reports",name:"Reports",icon:ChartNoAxesColumn},
  {id:"settings",name:"Settings",icon:Settings2}
];
type WorkDraft={id?:string;project_name:string;amount:string;assigned_by:string;work_status:"open"|"complete"|"archived";client_id:string;notes:string;invoice_number:string};
type ClientDraft={id?:string;name:string;email:string;phone:string;notes:string};
type PaymentDraft={invoice_number:string;amount:string;paid_on:string;method:TrackerPayment["method"];reference:string;notes:string};
type NewInvoiceDraft={number:string;total:string;date:string;rowIds:string[]};
const freshWork=():WorkDraft=>({project_name:"",amount:"",assigned_by:"",work_status:"open",client_id:"",notes:"",invoice_number:""});
const freshPayment=():PaymentDraft=>({invoice_number:"",amount:"",paid_on:new Date().toISOString().slice(0,10),method:"bank_transfer",reference:"",notes:""});
const freshInvoice=():NewInvoiceDraft=>({number:"",total:"",date:new Date().toISOString().slice(0,10),rowIds:[]});
const integer=(value:string)=>value.trim()!==""&&Number.isFinite(Number(value))&&Number(value)>=0;
const download=(filename:string,body:string,type="text/csv;charset=utf-8")=>{
  const url=URL.createObjectURL(new Blob([body],{type}));
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function Empty({title,detail,action}:{title:string;detail:string;action?:React.ReactNode}){
  return <div className="empty"><div className="empty-icon"><ClipboardList size={21}/></div><strong>{title}</strong><p>{detail}</p>{action}</div>;
}
function Pill({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"blue"|"green"|"amber"}){
  return <span className={"pill pill-"+tone}>{children}</span>;
}
function Caption({children}:{children:React.ReactNode}){return <span className="muted-label">{children}</span>}
function Panel({title,sub,action,children}:{title:string;sub?:string;action?:React.ReactNode;children:React.ReactNode}){
  return <section className="panel"><div className="panel-header"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action}</div>{children}</section>;
}
function Modal({title,sub,close,children}:{title:string;sub?:string;close:()=>void;children:React.ReactNode}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")close();if(e.key==="Tab"&&ref.current){const all=[...ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];const first=all[0],last=all[all.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
    document.addEventListener("keydown",onKey);ref.current?.querySelector<HTMLElement>("button")?.focus();
    return()=>{document.removeEventListener("keydown",onKey);previous?.focus()};
  },[close]);
  return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
    <div className="dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
      <header className="dialog-header"><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div><button className="icon-button" onClick={close} aria-label="Close"><X size={18}/></button></header>
      <div className="dialog-content">{children}</div>
    </div>
  </div>;
}
export default function Workspace({initialView,email}:{initialView:View;email:string}){
  const router=useRouter();
  const supabase=useMemo(()=>browserClient(),[]);
  const [view,setView]=useState<View>(initialView);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [rows,setRows]=useState<TrackerRow[]>([]);
  const [payments,setPayments]=useState<TrackerPayment[]>([]);
  const [clients,setClients]=useState<TrackerClient[]>([]);
  const [documents,setDocuments]=useState<TrackerDocument[]>([]);
  const [portalEnabled,setPortalEnabled]=useState(false);
  const [loading,setLoading]=useState(true),[working,setWorking]=useState(false);
  const [error,setError]=useState(""),[toast,setToast]=useState("");
  const [search,setSearch]=useState(""),[filter,setFilter]=useState("all");
  const [mobileMenu,setMobileMenu]=useState(false);
  const [workDraft,setWorkDraft]=useState<WorkDraft|null>(null);
  const [clientDraft,setClientDraft]=useState<ClientDraft|null>(null);
  const [paymentDraft,setPaymentDraft]=useState<PaymentDraft|null>(null);
  const [invoiceDraft,setInvoiceDraft]=useState<NewInvoiceDraft|null>(null);
  const [selectedInvoice,setSelectedInvoice]=useState<string|null>(null);
  const [portalPassword,setPortalPassword]=useState(""),[portalBusy,setPortalBusy]=useState(false);
  const [documentInvoice,setDocumentInvoice]=useState(""),[documentClient,setDocumentClient]=useState("");
  const [documentVisibility,setDocumentVisibility]=useState(false);
  const [uploadBusy,setUploadBusy]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const fetchId=useRef(0);
  const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(""),4500)};
  const load=useCallback(async()=>{
    const id=++fetchId.current;setError("");
    try{
      const [s,r,p,c,d]=await Promise.all([
        supabase.from("tracker_snapshots").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle(),
        supabase.from("tracker_rows").select("*").order("row_order"),
        supabase.from("tracker_payments").select("*").order("paid_on",{ascending:false}),
        supabase.from("tracker_clients").select("*").order("name"),
        supabase.from("tracker_documents").select("*").order("created_at",{ascending:false})
      ]);
      if(id!==fetchId.current)return;
      const bad=[s.error,r.error,p.error,c.error,d.error].filter(Boolean);
      if(bad.length)throw new Error(bad.map(x=>x?.message).join(" · "));
      setSnapshot((s.data??null) as Snapshot|null);
      setRows((r.data??[]) as TrackerRow[]);
      setPayments((p.data??[]) as TrackerPayment[]);
      setClients((c.data??[]) as TrackerClient[]);
      setDocuments((d.data??[]) as TrackerDocument[]);
    }catch(e){if(id===fetchId.current)setError(e instanceof Error?e.message:"Could not load your finance workspace.");}
    finally{if(id===fetchId.current)setLoading(false);}
  },[supabase]);
  useEffect(()=>{void load();return()=>{fetchId.current++}},[load]);
  useEffect(()=>{setView(initialView);setFilter("all");setSearch("");setMobileMenu(false)},[initialView]);
  useEffect(()=>{fetch("/api/portal/config").then(r=>r.ok?r.json():null).then(d=>{if(d)setPortalEnabled(Boolean(d.enabled))}).catch(()=>{});},[]);

  const invoices=useMemo(()=>invoiceGroups(rows,payments),[rows,payments]);
  const clientName=clients.find(x=>x.from_source_pdf)?.name||clients[0]?.name||"Elle India";
  const totalDue=sum(invoices.map(x=>x.balance));
  const totalPaid=sum(payments.map(x=>Number(x.amount)));
  const unbilled=rows.filter(x=>!x.invoice_number);
  const discrepancies=invoices.filter(x=>Math.abs(x.discrepancy)>.001);
  const q=search.toLowerCase().trim();
  const current=selectedInvoice?invoices.find(i=>i.number===selectedInvoice):undefined;
  const nav=(id:View)=>{setView(id);setSearch("");setFilter("all");setMobileMenu(false);setSelectedInvoice(null);router.push(id==="overview"?"/admin":"/admin/"+id,{scroll:false})};
  async function mutation(run:()=>Promise<void>,message:string){
    setWorking(true);setError("");
    try{await run();await load();notify(message);}
    catch(e){setError(e instanceof Error?e.message:"The change could not be saved. Please retry.");}
    finally{setWorking(false);}
  }
  function ensure(error:unknown){if(error){const e=error as {message?:string};throw new Error(e.message||"Database request failed.");}}
  function workEditor(row?:TrackerRow){
    setWorkDraft(row?{id:row.id,project_name:row.project_name,amount:row.amount===null?"":String(row.amount),assigned_by:row.assigned_by??"",work_status:row.work_status,client_id:row.client_id??"",notes:row.notes??"",invoice_number:row.invoice_number??""}: {...freshWork(),client_id:clients[0]?.id??""});
  }
  async function saveWork(e:FormEvent){
    e.preventDefault();if(!workDraft||!snapshot)return;
    const draft=workDraft;
    if(!draft.project_name.trim()){setError("Project name is required.");return;}
    if(draft.amount&&!integer(draft.amount)){setError("Use a valid non-negative amount.");return;}
    await mutation(async()=>{
      const entry={
        project_name:draft.project_name.trim(),amount:draft.amount===""?null:Number(draft.amount),
        assigned_by:draft.assigned_by.trim()||null,work_status:draft.work_status,
        client_id:draft.client_id||null,notes:draft.notes.trim()||null,
        invoice_number:draft.invoice_number||null,updated_at:new Date().toISOString()
      };
      if(draft.id){const {error}=await supabase.from("tracker_rows").update(entry).eq("id",draft.id);ensure(error);}
      else{
        const {error}=await supabase.from("tracker_rows").insert({...entry,snapshot_id:snapshot.id,row_order:Math.max(0,...rows.map(r=>r.row_order))+1,from_source_pdf:false});
        ensure(error);
      }
      setWorkDraft(null);
    },draft.id?"Work updated.":"Work added.");
  }
  async function removeWork(id:string){
    if(!window.confirm("Delete this work record? This cannot be undone."))return;
    await mutation(async()=>{const {error}=await supabase.from("tracker_rows").delete().eq("id",id);ensure(error);setWorkDraft(null);},"Work removed.");
  }
  async function saveClient(e:FormEvent){
    e.preventDefault();if(!clientDraft)return;
    const draft=clientDraft;if(!draft.name.trim()){setError("Client name is required.");return;}
    await mutation(async()=>{
      const payload={name:draft.name.trim(),email:draft.email.trim()||null,phone:draft.phone.trim()||null,notes:draft.notes.trim()||null};
      if(draft.id){const {error}=await supabase.from("tracker_clients").update(payload).eq("id",draft.id);ensure(error);}
      else{const {error}=await supabase.from("tracker_clients").insert({...payload,from_source_pdf:false});ensure(error);}
      setClientDraft(null);
    },draft.id?"Client updated.":"Client added.");
  }
  async function removeClient(id:string){
    if(!window.confirm("Remove this client? Work records will retain their names but lose the client link."))return;
    await mutation(async()=>{const {error}=await supabase.from("tracker_clients").delete().eq("id",id);ensure(error);setClientDraft(null);},"Client removed.");
  }
  async function savePayment(e:FormEvent){
    e.preventDefault();if(!paymentDraft)return;
    const d=paymentDraft,g=invoices.find(x=>x.number===d.invoice_number);
    const amount=Number(d.amount);
    if(!g||!Number.isFinite(amount)||amount<=0||amount>g.balance+.001){setError("Payment must be greater than zero and no more than the invoice balance.");return;}
    await mutation(async()=>{
      const {error}=await supabase.from("tracker_payments").insert({
        invoice_number:d.invoice_number,amount,paid_on:d.paid_on,
        method:d.method,reference:d.reference.trim()||null,notes:d.notes.trim()||null
      });ensure(error);setPaymentDraft(null);
    },"Payment recorded.");
  }
  async function removePayment(id:string){
    if(!window.confirm("Delete this payment? The invoice balance will increase."))return;
    await mutation(async()=>{const {error}=await supabase.from("tracker_payments").delete().eq("id",id);ensure(error);},"Payment removed.");
  }
  async function createInvoice(e:FormEvent){
    e.preventDefault();if(!invoiceDraft)return;
    const d=invoiceDraft;const nr=d.number.trim().replace(/^#|^Inv\.?\s*/i,"");
    if(!nr||invoices.some(x=>x.number.toLowerCase()===nr.toLowerCase())){setError("Enter a unique invoice number.");return;}
    if(!d.rowIds.length){setError("Choose at least one uninvoiced work item.");return;}
    const total=d.total===""?sum(rows.filter(r=>d.rowIds.includes(r.id)).map(r=>Number(r.amount||0))):Number(d.total);
    if(!Number.isFinite(total)||total<0){setError("Invoice total must be a valid non-negative amount.");return;}
    await mutation(async()=>{
      const {error}=await supabase.rpc("tracker_create_invoice",{
        p_number:nr,p_date:d.date,p_total:total,p_row_ids:d.rowIds
      });
      ensure(error);
      setInvoiceDraft(null);
    },"Invoice created.");
  }
  async function setWorkStatus(id:string,status:TrackerRow["work_status"]){
    await mutation(async()=>{const {error}=await supabase.from("tracker_rows").update({work_status:status,updated_at:new Date().toISOString()}).eq("id",id);ensure(error);},"Work status updated.");
  }
  async function uploadDocument(file:File){
    setUploadBusy(true);setError("");
    try{
      const data=new FormData();data.set("file",file);if(documentInvoice)data.set("invoice_number",documentInvoice);
      if(documentClient)data.set("client_id",documentClient);data.set("visible_to_client",String(documentVisibility));
      const res=await fetch("/api/documents",{method:"POST",body:data});
      const json=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(json.error||"Upload failed.");
      await load();notify("Document uploaded.");
    }catch(e){setError(e instanceof Error?e.message:"Upload failed.");}
    finally{setUploadBusy(false);if(fileRef.current)fileRef.current.value="";}
  }
  async function removeDocument(id:string){
    if(!window.confirm("Permanently delete this document and its stored file?"))return;
    await mutation(async()=>{
      const res=await fetch("/api/documents/"+encodeURIComponent(id),{method:"DELETE"});
      const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||"Could not remove document.");
    },"Document deleted.");
  }
  async function savePortal(e:FormEvent){
    e.preventDefault();if(portalPassword&&portalPassword.length<12){setError("Client portal password must be at least 12 characters.");return;}
    setPortalBusy(true);setError("");
    try{
      const res=await fetch("/api/portal/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:portalEnabled,password:portalPassword})});
      const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||"Portal settings could not be saved.");
      setPortalPassword("");notify("Client portal settings saved.");
    }catch(e){setError(e instanceof Error?e.message:"Settings failed.");}
    finally{setPortalBusy(false);}
  }
  function downloadWorkCsv(){
    download("elle-india-work.csv",csv([
      ["Row","Project","Assigned by","Amount INR","Invoice","Work status","Source PDF"],
      ...rows.map(r=>[r.row_order,r.project_name,r.assigned_by,r.amount,r.invoice_number,r.work_status,r.from_source_pdf?"Yes":"No"])
    ]));
  }
  function downloadPaymentsCsv(){
    download("elle-india-payments.csv",csv([
      ["Invoice","Amount INR","Paid on","Method","Reference","Notes"],
      ...payments.map(p=>[p.invoice_number,p.amount,p.paid_on,p.method,p.reference,p.notes])
    ]));
  }
  const filteredRows=rows.filter(r=>{
    if(filter==="unbilled"&&r.invoice_number)return false;
    if(filter==="billed"&&!r.invoice_number)return false;
    if(filter==="complete"&&r.work_status!=="complete")return false;
    return !q||[r.project_name,r.assigned_by,r.invoice_number,r.notes].join(" ").toLowerCase().includes(q);
  });
  const filteredInvoices=invoices.filter(i=>!q||[i.number,i.sourceStatus,...i.rows.map(r=>r.project_name)].join(" ").toLowerCase().includes(q));
  const filteredPayments=payments.filter(p=>!q||[p.invoice_number,p.reference,p.method].join(" ").toLowerCase().includes(q));
  const isFirstParty=view==="overview"||view==="work"||view==="invoices"||view==="payments";
  if(loading)return <div className="workspace-loading"><div className="loading-icon">f.</div><strong>Opening finance workspace</strong><p>Reading secure financial records…</p><div className="loading-track"><div/></div></div>;
  return <div className="app-shell">
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand"><div className="brand-symbol">f.</div><div><strong>{snapshot?.owner_name||"Finance"}</strong><span>FINANCE WORKSPACE</span></div></div>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-links">
        {NAV.map(({id,name,icon:Icon})=><button key={id} type="button" aria-current={view===id?"page":undefined} className={"sidebar-link "+(view===id?"active":"")} onClick={()=>nav(id)}><Icon size={17} strokeWidth={1.85}/><span>{name}</span>{view===id&&<span className="active-dot"/>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="source-mini"><span className="source-dot"/><div><strong>PDF-backed</strong><small>{snapshot?dateLabel(snapshot.balance_as_of):"No source loaded"}</small></div></div>
        <button className="sidebar-account" onClick={()=>nav("settings")}><div className="account-avatar">{email.slice(0,1).toUpperCase()}</div><div><strong>My account</strong><span>{email}</span></div><ChevronRight size={15}/></button>
      </div>
    </aside>
    <div className="app-main">
      <header className="app-topbar">
        <div className="topbar-left">
          <button type="button" className="mobile-menu-button" aria-label="Open menu" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(true)}><Menu size={21}/></button>
          <span className="breadcrumb-base">Workspace</span><ChevronRight size={14} className="breadcrumb-arrow"/>
          <span className="breadcrumb-current">{NAV.find(n=>n.id===view)?.name}</span>
        </div>
        <div className="topbar-right">
          <div className="topbar-source"><span className="source-dot"/>Source: PDF</div>
          <button type="button" className="icon-button refresh-button" disabled={working} onClick={()=>{setLoading(true);void load()}} title="Refresh" aria-label="Refresh"><RefreshCw size={17}/></button>
        </div>
      </header>
      <main className="workspace-content">
        {error&&<div className="error-bar" role="alert"><AlertCircle size={17}/><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Dismiss"><X size={17}/></button></div>}
        {!snapshot&&<div className="error-bar"><AlertCircle size={18}/>No source tracker is present in the database. Import the PDF seed migration before using this workspace.</div>}
        {view==="overview"&&<>
          <div className="page-title-row"><div><p className="page-kicker">FINANCIAL SNAPSHOT</p><h1>Overview</h1><p className="page-subtitle">A clear view of work and money for {clientName}.</p></div><button className="button button-primary" onClick={()=>workEditor()}><Plus size={16}/>New work</button></div>
          <div className="hero-card">
            <div className="hero-content"><p className="hero-eyebrow">OUTSTANDING BALANCE</p><strong>{money(totalDue)}</strong><div className="hero-meta"><span><span className="hero-pulse"/> {invoices.filter(i=>i.balance>0).length} invoices with a balance</span><span className="hero-divider"/>As of {snapshot?dateLabel(snapshot.balance_as_of):"—"}</div></div>
            <div className="hero-aside"><Caption>PDF REPORTED BALANCE</Caption><strong>{money(snapshot?.reported_pending??0)}</strong><p>{snapshot&&Math.abs(Number(snapshot.reported_pending)-totalDue)>.001?"Current balance differs from the original PDF.":"Matches source before any new payments."}</p></div>
          </div>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-card-top"><Caption>INVOICE TOTALS</Caption><ReceiptText size={17}/></div><strong>{money(sum(invoices.map(i=>i.total)))}</strong><span>{invoices.length} invoices recorded</span></div>
            <div className="stat-card"><div className="stat-card-top"><Caption>PAYMENTS RECEIVED</Caption><Wallet size={17}/></div><strong>{money(totalPaid)}</strong><span>{payments.length} payment records</span></div>
            <div className="stat-card"><div className="stat-card-top"><Caption>WORK ITEMS</Caption><BriefcaseBusiness size={17}/></div><strong>{rows.length}</strong><span>{unbilled.length} not assigned to an invoice</span></div>
          </div>
          {discrepancies.length>0&&<div className="reconcile-note"><AlertCircle size={19}/><div><strong>Source totals need review</strong><p>{discrepancies.map(i=>"Invoice "+i.number+": items "+money(i.lineTotal)+" vs PDF "+money(i.total)).join(" · ")}. Both values are preserved.</p></div><button className="text-button" onClick={()=>nav("invoices")}>Review <ArrowUpRight size={15}/></button></div>}
          <div className="overview-grid">
            <Panel title="Invoices" sub="The complete outstanding register" action={<button className="text-button" onClick={()=>nav("invoices")}>View all <ArrowUpRight size={15}/></button>}>
              <div className="list-items">{invoices.map(i=><button key={i.number} className="overview-line" onClick={()=>{nav("invoices");setSelectedInvoice(i.number)}}><span className="line-icon"><ReceiptText size={17}/></span><span className="line-main"><strong>Invoice #{i.number}</strong><small>{dateLabel(i.date)} · {i.rows.length} work items</small></span><span className="line-right"><strong>{money(i.balance)}</strong><small>{i.balance<=0?"Paid":"Unpaid"}</small></span><ChevronRight size={16} className="row-chevron"/></button>)}</div>
            </Panel>
            <Panel title="Unbilled work" sub="Work that has not been assigned to an invoice" action={<button className="text-button" onClick={()=>nav("work")}>Manage <ArrowUpRight size={15}/></button>}>
              <div className="list-items">{unbilled.length?unbilled.slice(0,6).map(r=><button key={r.id} className="overview-line" onClick={()=>workEditor(r)}><span className="line-icon"><BriefcaseBusiness size={17}/></span><span className="line-main"><strong>{titleFromSource(r.project_name)}</strong><small>{r.assigned_by||"No assignee supplied"}</small></span><span className="line-right"><strong>{money(r.amount)}</strong><small>Unbilled</small></span><ChevronRight size={16} className="row-chevron"/></button>):<Empty title="All work is invoiced" detail="Unbilled work will appear here."/>}</div>
            </Panel>
          </div>
        </>}
        {view==="work"&&<>
          <div className="page-title-row"><div><p className="page-kicker">PROJECT TRACKER</p><h1>Work</h1><p className="page-subtitle">{rows.length} projects and editing assignments in one place.</p></div><div className="page-actions"><button className="button" onClick={downloadWorkCsv}><ArrowDownToLine size={16}/>Export</button><button className="button button-primary" onClick={()=>workEditor()}><Plus size={16}/>Add work</button></div></div>
          <div className="filter-bar">
            <div className="search-field"><Search size={17}/><input aria-label="Search projects" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search work, assignee or invoice…"/></div>
            <div className="filter-tabs">{[["all","All"],["unbilled","Unbilled"],["billed","Invoiced"],["complete","Complete"]].map(([id,name])=><button key={id} className={filter===id?"selected":""} onClick={()=>setFilter(id)}>{name}</button>)}</div>
          </div>
          <Panel title="Work register" sub="Only PDF-derived records are included in the initial dataset" action={<span className="panel-count">{filteredRows.length} records</span>}>
            <div className="table-scroller"><table className="data-table"><thead><tr><th>WORK</th><th>ASSIGNED BY</th><th>INVOICE</th><th>AMOUNT</th><th>STATUS</th><th aria-label="Open"/></tr></thead><tbody>
              {filteredRows.map(r=><tr key={r.id} onClick={()=>workEditor(r)} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter")workEditor(r)}} className="table-clickable"><td><div className="cell-title">{titleFromSource(r.project_name)}</div><div className="cell-sub">{r.from_source_pdf?"Imported from PDF":"Added in workspace"}</div></td><td>{r.assigned_by||<span className="muted">Not supplied</span>}</td><td>{r.invoice_number?<Pill tone="blue">#{r.invoice_number}</Pill>:<span className="muted">Unbilled</span>}</td><td className="money-cell">{money(r.amount)}</td><td><Pill tone={r.work_status==="complete"?"green":"neutral"}>{r.work_status}</Pill></td><td><ChevronRight size={16}/></td></tr>)}
            </tbody></table></div>
            {!filteredRows.length&&<Empty title="No work matches" detail="Try a different filter or create a work record."/>}
          </Panel>
        </>}
        {view==="invoices"&&<>
          <div className="page-title-row"><div><p className="page-kicker">BILLING</p><h1>Invoices</h1><p className="page-subtitle">PDF totals, linked work and payments—without guessed dates.</p></div><div className="page-actions"><button className="button" onClick={()=>download("elle-india-invoices.csv",csv([["Invoice","PDF total INR","Item total INR","Paid INR","Balance INR","Issue date","Source state"],...invoices.map(i=>[i.number,i.total,i.lineTotal,i.paid,i.balance,i.date,i.sourceStatus])]))}><ArrowDownToLine size={16}/>Export</button><button className="button button-primary" onClick={()=>setInvoiceDraft(freshInvoice())}><Plus size={16}/>New invoice</button></div></div>
          <div className="invoice-metrics"><div><Caption>OPEN BALANCE</Caption><strong>{money(totalDue)}</strong></div><div><Caption>RECEIVED</Caption><strong>{money(totalPaid)}</strong></div><div><Caption>INVOICES</Caption><strong>{invoices.length}</strong></div></div>
          <div className="filter-bar"><div className="search-field"><Search size={17}/><input aria-label="Search invoices" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find an invoice or work item…"/></div></div>
          <div className="invoice-list">
            {filteredInvoices.map(i=><button key={i.number} className="invoice-row" onClick={()=>setSelectedInvoice(i.number)}>
              <span className="invoice-row-icon"><ReceiptText size={21}/></span><span className="invoice-row-main"><strong>Invoice #{i.number}</strong><small>{dateLabel(i.date)} · {i.rows.length} work items</small></span>
              <span className="invoice-row-status"><Pill tone={i.balance<=0?"green":"amber"}>{i.balance<=0?"Paid":i.paid>0?"Partial":"Unpaid"}</Pill>{Math.abs(i.discrepancy)>.001&&<small className="orange-text">Source mismatch</small>}</span>
              <span className="invoice-row-money"><strong>{money(i.total)}</strong><small>{money(i.balance)} due</small></span><ChevronRight size={18} className="row-chevron"/>
            </button>)}
            {!filteredInvoices.length&&<Empty title="No invoices found" detail="Choose different search terms, or create an invoice from unbilled work."/>}
          </div>
        </>}
        {view==="payments"&&<>
          <div className="page-title-row"><div><p className="page-kicker">COLLECTIONS</p><h1>Payments</h1><p className="page-subtitle">Record only actual received payments. The PDF provides none.</p></div><div className="page-actions"><button className="button" onClick={downloadPaymentsCsv}><ArrowDownToLine size={16}/>Export</button><button className="button button-primary" onClick={()=>setPaymentDraft(freshPayment())}><Plus size={16}/>Record payment</button></div></div>
          <div className="stat-grid stat-grid-payment"><div className="stat-card"><Caption>RECEIVED</Caption><strong>{money(totalPaid)}</strong><span>Across {payments.length} recorded payments</span></div><div className="stat-card"><Caption>REMAINING</Caption><strong>{money(totalDue)}</strong><span>Across {invoices.filter(i=>i.balance>0).length} invoices</span></div></div>
          <Panel title="Payment history" sub="No payment dates are inferred from the source PDF" action={<span className="panel-count">{payments.length} payments</span>}>
            {payments.length?<div className="list-items">{filteredPayments.map(p=><div className="payment-row" key={p.id}><span className="line-icon"><Wallet size={18}/></span><div className="line-main"><strong>{money(p.amount)}</strong><small>Invoice #{p.invoice_number} · {dateLabel(p.paid_on)}</small></div><div className="line-right"><strong>{p.method.replaceAll("_"," ")}</strong><small>{p.reference||"No reference"}</small></div><button className="icon-button danger-icon" onClick={()=>void removePayment(p.id)} title="Delete payment" aria-label="Delete payment"><Trash2 size={16}/></button></div>)}</div>:<Empty title="No payments recorded" detail="The PDF marks all three invoice groups as unpaid. Record a payment when funds arrive." action={<button className="button button-primary" onClick={()=>setPaymentDraft(freshPayment())}><Plus size={16}/>Record first payment</button>}/>}
          </Panel>
        </>}
        {view==="clients"&&<>
          <div className="page-title-row"><div><p className="page-kicker">RELATIONSHIPS</p><h1>Clients</h1><p className="page-subtitle">Client identities drawn only from the tracker, with new contacts added manually.</p></div><button className="button button-primary" onClick={()=>setClientDraft({name:"",email:"",phone:"",notes:""})}><Plus size={16}/>Add client</button></div>
          <div className="client-grid">{clients.map(c=><button className="client-card" key={c.id} onClick={()=>setClientDraft({id:c.id,name:c.name,email:c.email||"",phone:c.phone||"",notes:c.notes||""})}>
            <span className="client-avatar">{c.name.slice(0,1).toUpperCase()}</span><span className="client-card-body"><strong>{c.name}</strong><small>{c.from_source_pdf?"Identified in uploaded PDF":"Added to workspace"}</small></span><ChevronRight size={17}/><span className="client-stats"><span>{rows.filter(r=>r.client_id===c.id).length} work items</span><span>{invoices.filter(i=>i.rows.some(r=>r.client_id===c.id)).length} invoices</span></span>
          </button>)}</div>
          {!clients.length&&<Empty title="No client records" detail="Add the client named in your source tracker."/>}
          <div className="information-note"><ShieldCheck size={19}/><p>Only “Elle India” appears in the PDF. Legacy client companies and contact details have not been imported.</p></div>
        </>}
        {view==="documents"&&<>
          <div className="page-title-row"><div><p className="page-kicker">FILES</p><h1>Documents</h1><p className="page-subtitle">Generate invoice summaries and keep uploaded files private.</p></div><button className="button button-primary" onClick={()=>fileRef.current?.click()} disabled={uploadBusy}><UploadCloud size={16}/>{uploadBusy?"Uploading…":"Upload file"}</button></div>
          <div className="document-upload-bar">
            <div><strong>Upload a private document</strong><p>PDF or image, up to 15 MB. By default, only workspace members can see it.</p></div>
            <label className="field-label small-field">Invoice (optional)<select value={documentInvoice} onChange={e=>setDocumentInvoice(e.target.value)}><option value="">No invoice</option>{invoices.map(i=><option key={i.number} value={i.number}>#{i.number}</option>)}</select></label>
            <label className="field-label small-field">Client (optional)<select value={documentClient} onChange={e=>setDocumentClient(e.target.value)}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="checkline"><input type="checkbox" checked={documentVisibility} onChange={e=>setDocumentVisibility(e.target.checked)}/>Share with client portal</label>
            <input ref={fileRef} type="file" hidden accept=".pdf,image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadDocument(f)}}/>
          </div>
          <Panel title="Uploaded files" sub="Secure private storage" action={<span className="panel-count">{documents.length} files</span>}>
            {documents.length?<div className="list-items">{documents.map(d=><div className="document-row" key={d.id}><span className="line-icon"><FileText size={18}/></span><div className="line-main"><strong>{d.file_name}</strong><small>{(d.size_bytes/1024).toFixed(0)} KB · {dateLabel(d.created_at.slice(0,10))} · {d.visible_to_client?"Shared with client":"Private"}</small></div><a className="button button-small" href={"/api/documents/"+d.id} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={15}/>Open</a><button className="icon-button danger-icon" aria-label={"Delete "+d.file_name} onClick={()=>void removeDocument(d.id)}><Trash2 size={16}/></button></div>)}</div>:<Empty title="No files uploaded" detail="Use Upload file to attach a private PDF or image."/>}
          </Panel>
          <Panel title="Invoice summaries" sub="Generated from the current tracker, not copies of the original invoice PDFs">
            <div className="list-items">{invoices.map(i=><a key={i.number} className="overview-line" href={"/api/invoices/"+encodeURIComponent(i.number)+"/pdf"} target="_blank" rel="noopener noreferrer"><span className="line-icon"><ReceiptText size={17}/></span><span className="line-main"><strong>Invoice #{i.number} · Summary PDF</strong><small>{dateLabel(i.date)} · {money(i.total)} source total</small></span><ArrowDownToLine size={18}/></a>)}</div>
          </Panel>
          <div className="information-note"><AlertCircle size={19}/><p>The PDF references {invoices.find(i=>i.document)?.document||"an original invoice file"}, but that referenced invoice PDF was not uploaded with the tracker. Generated summaries are clearly labelled.</p></div>
        </>}
        {view==="reports"&&<>
          <div className="page-title-row"><div><p className="page-kicker">INSIGHTS</p><h1>Reports</h1><p className="page-subtitle">Straightforward financial reporting from the current records.</p></div><button className="button" onClick={()=>download("elle-india-finance.csv",csv([["Invoice","PDF total INR","Line items INR","Payments INR","Balance INR","Date"],...invoices.map(i=>[i.number,i.total,i.lineTotal,i.paid,i.balance,i.date])]))}><ArrowDownToLine size={16}/>Download CSV</button></div>
          <div className="stat-grid"><div className="stat-card"><Caption>TOTAL INVOICED</Caption><strong>{money(sum(invoices.map(i=>i.total)))}</strong></div><div className="stat-card"><Caption>AMOUNT RECEIVED</Caption><strong>{money(totalPaid)}</strong></div><div className="stat-card"><Caption>OUTSTANDING</Caption><strong>{money(totalDue)}</strong></div></div>
          <div className="overview-grid">
            <Panel title="Outstanding by invoice" sub="Proportional to the printed invoice totals">
              <div className="chart-bars">{invoices.map(i=><div className="chart-row" key={i.number}><span>#{i.number}</span><div className="chart-track"><div style={{width:(totalDue?Math.max(0,i.balance)/totalDue*100:0)+"%"}}/></div><strong>{money(i.balance)}</strong></div>)}</div>
            </Panel>
            <Panel title="Source reconciliation" sub="Amounts reported in the PDF">
              <div className="report-list">{invoices.map(i=><div key={i.number}><div><strong>Invoice #{i.number}</strong><small>Item total {money(i.lineTotal)}</small></div><div><strong>{money(i.total)}</strong>{i.discrepancy?<small className="orange-text">Difference {money(i.discrepancy)}</small>:<small>Matches</small>}</div></div>)}</div>
            </Panel>
          </div>
          <div className="information-note"><AlertCircle size={19}/><p>The PDF’s pending balance is dated {snapshot?dateLabel(snapshot.balance_as_of):"—"}. Invoice 220 has a later date. This report preserves source chronology instead of silently correcting it.</p></div>
        </>}
        {view==="settings"&&<>
          <div className="page-title-row"><div><p className="page-kicker">PREFERENCES</p><h1>Settings</h1><p className="page-subtitle">Workspace identity, client access and secure account settings.</p></div></div>
          <Panel title="Source of truth" sub="Initial source dataset"><div className="settings-summary"><div><Caption>OWNER</Caption><strong>{snapshot?.owner_name||"—"}</strong></div><div><Caption>SOURCE</Caption><strong>{snapshot?.source_file_name||"No PDF registered"}</strong></div><div><Caption>BALANCE DATE</Caption><strong>{snapshot?dateLabel(snapshot.balance_as_of):"—"}</strong></div><div><Caption>REPORTED BALANCE</Caption><strong>{money(snapshot?.reported_pending)}</strong></div></div></Panel>
          <Panel title="Client portal" sub="A minimal invoice view protected by a password">
            <form onSubmit={savePortal} className="settings-form">
              <label className="switchline"><input type="checkbox" checked={portalEnabled} onChange={e=>setPortalEnabled(e.target.checked)}/><span><strong>Enable client access</strong><small>Invite your client to a read-only portal</small></span></label>
              <label className="field-label">Portal password (new or replacement)<input autoComplete="new-password" type="password" minLength={12} value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder="At least 12 characters"/></label>
              <div className="settings-actions"><button type="submit" disabled={portalBusy} className="button button-primary">{portalBusy?"Saving…":"Save access settings"}</button><a className="button" href="/portal/elle-india" target="_blank" rel="noopener noreferrer">Open client view <ExternalLink size={16}/></a></div>
              <p className="form-hint">Changing or disabling client access revokes existing sessions. Set a password before enabling access.</p>
            </form>
          </Panel>
          <Panel title="My account" sub="Only authorised members can manage the workspace">
            <div className="settings-summary"><div><Caption>SIGNED IN</Caption><strong>{email}</strong></div><div><Caption>ACCESS</Caption><strong>Workspace member <ShieldCheck size={15}/></strong></div></div>
            <div className="settings-actions inset"><button className="button" onClick={()=>void supabase.auth.signOut().then(()=>window.location.assign("/"))}><LogOut size={16}/>Sign out</button></div>
          </Panel>
        </>}
        <footer className="app-footer"><span>Private finance workspace</span><span>Source-tracked · {snapshot?dateLabel(snapshot.balance_as_of):"No source"}</span></footer>
      </main>
    </div>
    <nav className="mobile-bottom" aria-label="Mobile navigation">
      {NAV.slice(0,4).map(({id,name,icon:Icon})=><button key={id} type="button" onClick={()=>nav(id)} className={view===id?"active":""}><Icon size={19}/><span>{name}</span></button>)}
      <button type="button" onClick={()=>setMobileMenu(true)}><MoreHorizontal size={19}/><span>More</span></button>
    </nav>
    {mobileMenu&&<div className="overlay mobile-menu-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMobileMenu(false)}}><div className="mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Navigation"><div className="dialog-header"><h2>Navigate</h2><button className="icon-button" aria-label="Close" onClick={()=>setMobileMenu(false)}><X size={19}/></button></div><div className="mobile-menu-list">{NAV.map(({id,name,icon:Icon})=><button key={id} className={view===id?"active":""} onClick={()=>nav(id)}><Icon size={19}/>{name}<ChevronRight size={16}/></button>)}</div></div></div>}
    {toast&&<div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    {workDraft&&<Modal title={workDraft.id?"Edit work":"New work"} sub="Project details" close={()=>setWorkDraft(null)}>
      <form className="form-stack" onSubmit={saveWork}>
        <label className="field-label">Project / work name<input autoFocus required value={workDraft.project_name} onChange={e=>setWorkDraft({...workDraft,project_name:e.target.value})}/></label>
        <div className="form-two"><label className="field-label">Amount (INR, optional)<input type="number" min="0" step=".01" placeholder="Not supplied" value={workDraft.amount} onChange={e=>setWorkDraft({...workDraft,amount:e.target.value})}/></label><label className="field-label">Assigned by<input value={workDraft.assigned_by} placeholder="Not supplied" onChange={e=>setWorkDraft({...workDraft,assigned_by:e.target.value})}/></label></div>
        <div className="form-two"><label className="field-label">Client<select value={workDraft.client_id} onChange={e=>setWorkDraft({...workDraft,client_id:e.target.value})}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="field-label">Status<select value={workDraft.work_status} onChange={e=>setWorkDraft({...workDraft,work_status:e.target.value as WorkDraft["work_status"]})}><option value="open">Open</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label></div>
        <label className="field-label">Invoice group<select value={workDraft.invoice_number} disabled={!!(workDraft.id&&rows.find(r=>r.id===workDraft.id)?.from_source_pdf&&rows.find(r=>r.id===workDraft.id)?.invoice_number)} onChange={e=>setWorkDraft({...workDraft,invoice_number:e.target.value})}><option value="">Not invoiced</option>{invoices.map(i=><option key={i.number} value={i.number}>#{i.number}</option>)}</select></label>
        <label className="field-label">Notes<textarea rows={3} value={workDraft.notes} onChange={e=>setWorkDraft({...workDraft,notes:e.target.value})} placeholder="Optional notes"/></label>
        {workDraft.id&&rows.find(r=>r.id===workDraft.id)?.from_source_pdf&&<div className="information-note small-note"><AlertCircle size={16}/><p>Imported from the PDF. Edits are tracked by the updated date; the original document remains the authoritative historical source.</p></div>}
        <div className="dialog-actions">{workDraft.id&&<button type="button" className="button button-danger" onClick={()=>void removeWork(workDraft.id!)} disabled={working}><Trash2 size={16}/>Delete</button>}<span className="flex-spacer"/><button type="button" className="button" onClick={()=>setWorkDraft(null)}>Cancel</button><button className="button button-primary" disabled={working}>{working?"Saving…":"Save work"}</button></div>
      </form>
    </Modal>}
    {clientDraft&&<Modal title={clientDraft.id?"Edit client":"New client"} close={()=>setClientDraft(null)}>
      <form className="form-stack" onSubmit={saveClient}><label className="field-label">Client name<input autoFocus required value={clientDraft.name} onChange={e=>setClientDraft({...clientDraft,name:e.target.value})}/></label><div className="form-two"><label className="field-label">Email<input type="email" value={clientDraft.email} onChange={e=>setClientDraft({...clientDraft,email:e.target.value})}/></label><label className="field-label">Phone<input type="tel" value={clientDraft.phone} onChange={e=>setClientDraft({...clientDraft,phone:e.target.value})}/></label></div><label className="field-label">Notes<textarea rows={4} value={clientDraft.notes} onChange={e=>setClientDraft({...clientDraft,notes:e.target.value})}/></label><div className="dialog-actions">{clientDraft.id&&<button type="button" className="button button-danger" onClick={()=>void removeClient(clientDraft.id!)}><Trash2 size={16}/>Delete</button>}<span className="flex-spacer"/><button type="button" className="button" onClick={()=>setClientDraft(null)}>Cancel</button><button className="button button-primary" disabled={working}>Save client</button></div></form>
    </Modal>}
    {paymentDraft&&<Modal title="Record payment" sub="Only record funds actually received" close={()=>setPaymentDraft(null)}>
      <form className="form-stack" onSubmit={savePayment}><label className="field-label">Invoice<select required value={paymentDraft.invoice_number} onChange={e=>setPaymentDraft({...paymentDraft,invoice_number:e.target.value})}><option value="">Choose an invoice</option>{invoices.filter(i=>i.balance>0).map(i=><option key={i.number} value={i.number}>Invoice #{i.number} · {money(i.balance)} remaining</option>)}</select></label>
        <div className="form-two"><label className="field-label">Amount received (INR)<input required type="number" min=".01" step=".01" value={paymentDraft.amount} onChange={e=>setPaymentDraft({...paymentDraft,amount:e.target.value})}/></label><label className="field-label">Date received<input required type="date" value={paymentDraft.paid_on} onChange={e=>setPaymentDraft({...paymentDraft,paid_on:e.target.value})}/></label></div><div className="form-two"><label className="field-label">Payment method<select value={paymentDraft.method} onChange={e=>setPaymentDraft({...paymentDraft,method:e.target.value as PaymentDraft["method"]})}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label><label className="field-label">Reference<input value={paymentDraft.reference} onChange={e=>setPaymentDraft({...paymentDraft,reference:e.target.value})}/></label></div><label className="field-label">Notes<textarea rows={3} value={paymentDraft.notes} onChange={e=>setPaymentDraft({...paymentDraft,notes:e.target.value})}/></label>
        <div className="dialog-actions"><span className="flex-spacer"/><button type="button" className="button" onClick={()=>setPaymentDraft(null)}>Cancel</button><button className="button button-primary" disabled={working}>Record payment</button></div>
      </form>
    </Modal>}
    {invoiceDraft&&<Modal title="Create invoice" sub="Assign existing uninvoiced work" close={()=>setInvoiceDraft(null)}><form className="form-stack" onSubmit={createInvoice}><div className="form-two"><label className="field-label">Invoice number<input autoFocus required value={invoiceDraft.number} onChange={e=>setInvoiceDraft({...invoiceDraft,number:e.target.value})}/></label><label className="field-label">Issue date<input required type="date" value={invoiceDraft.date} onChange={e=>setInvoiceDraft({...invoiceDraft,date:e.target.value})}/></label></div><label className="field-label">Invoice total (INR; blank = item sum)<input type="number" min="0" step=".01" value={invoiceDraft.total} onChange={e=>setInvoiceDraft({...invoiceDraft,total:e.target.value})} placeholder="Calculated from selected work"/></label><div className="field-label">Select uninvoiced work</div><div className="invoice-work-choices">{unbilled.length?unbilled.map(r=><label key={r.id} className="check-row"><input type="checkbox" checked={invoiceDraft.rowIds.includes(r.id)} onChange={e=>setInvoiceDraft({...invoiceDraft,rowIds:e.target.checked?[...invoiceDraft.rowIds,r.id]:invoiceDraft.rowIds.filter(id=>id!==r.id)})}/><span>{titleFromSource(r.project_name)}</span><strong>{money(r.amount)}</strong></label>):<div className="empty-small">No uninvoiced work. Add work first.</div>}</div><p className="form-hint">Selected item sum: {money(sum(rows.filter(r=>invoiceDraft.rowIds.includes(r.id)).map(r=>Number(r.amount||0))))}</p><div className="dialog-actions"><span className="flex-spacer"/><button type="button" className="button" onClick={()=>setInvoiceDraft(null)}>Cancel</button><button className="button button-primary" disabled={working||!invoiceDraft.rowIds.length}>Create invoice</button></div></form></Modal>}
    {current&&<Modal title={"Invoice #"+current.number} sub={dateLabel(current.date)+" · "+current.rows.length+" work items"} close={()=>setSelectedInvoice(null)}>
      <div className="invoice-detail-hero"><div><Caption>PRINTED INVOICE TOTAL</Caption><strong>{money(current.total)}</strong><Pill tone={current.balance<=0?"green":"amber"}>{current.balance<=0?"Paid":current.paid>0?"Partially paid":"Unpaid"}</Pill></div><div className="detail-balance"><Caption>REMAINING</Caption><strong>{money(current.balance)}</strong></div></div>
      <div className="detail-list"><div><span>Invoice date</span><strong>{dateLabel(current.date)}</strong></div><div><span>Source state</span><strong>{current.sourceStatus}</strong></div><div><span>Payment state in PDF</span><strong>{current.paymentState}</strong></div><div><span>Recorded payments</span><strong>{money(current.paid)}</strong></div></div>
      <h3 className="dialog-section-heading">Included work</h3><div className="detail-item-list">{current.rows.map(r=><div key={r.id}><span><strong>{titleFromSource(r.project_name)}</strong><small>{r.assigned_by||"Assignee not supplied"}</small></span><b>{money(r.amount)}</b></div>)}</div>
      {Math.abs(current.discrepancy)>.001&&<div className="reconcile-note small-note"><AlertCircle size={18}/><div><strong>Source discrepancy</strong><p>Work items total {money(current.lineTotal)} but the PDF prints {money(current.total)}. Neither has been silently changed.</p></div></div>}
      {current.document&&<div className="information-note small-note"><FileText size={17}/><p>Source references: {current.document}. This referenced PDF file was not attached.</p></div>}
      <div className="dialog-actions"><a className="button" href={"/api/invoices/"+encodeURIComponent(current.number)+"/pdf"} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={16}/>Summary PDF</a><span className="flex-spacer"/>{current.balance>0&&<button type="button" className="button button-primary" onClick={()=>{setSelectedInvoice(null);setPaymentDraft({...freshPayment(),invoice_number:current.number})}}><Plus size={16}/>Record payment</button>}</div>
    </Modal>}
  </div>;
}