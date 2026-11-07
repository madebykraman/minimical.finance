"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {
 LayoutDashboard,BriefcaseBusiness,ReceiptText,Wallet,UsersRound,Files,ChartNoAxesColumn,
 Settings2,Search,Plus,ChevronRight,ChevronDown,ArrowDownToLine,ArrowUpRight,
 X,LogOut,RefreshCw,AlertCircle,CheckCircle2,FileText,Menu,Trash2,PenLine,
 ShieldCheck,ExternalLink,UploadCloud,MoreHorizontal,Building2,CalendarDays,
 Check,FilePlus2,Clock3,Filter,ListFilter,LockKeyhole
} from "lucide-react";
import {browserClient} from "@/lib/supabase/browser";
import {
 type TrackerRow,type TrackerPayment,type TrackerClient,type Snapshot,type InvoiceGroup,
 invoiceGroups,money,dateLabel,titleFromSource,csv,sum
} from "@/lib/tracker";

type View="overview"|"work"|"invoices"|"payments"|"clients"|"documents"|"reports"|"settings";
type Organisation={
 id:string;name:string;status:"active"|"dissolved";legal_name:string|null;
 email:string|null;phone:string|null;address:string|null;gstin:string|null;pan:string|null;
 bank_name:string|null;bank_account:string|null;bank_ifsc:string|null;
 invoice_prefix:string;invoice_footer:string|null;
};
type Document={id:string;file_name:string;size_bytes:number;mime_type:string;invoice_number:string|null;client_id:string|null;visible_to_client:boolean;created_at:string};
type Batch={id:string;file_label:string;created_at:string;imported_count:number;updated_count:number;skipped_count:number;flagged_count:number};
type ImportOutcome={created:number;updated:number;skipped:number;flagged:number;rows:number;already_imported?:boolean;warnings?:string[];issues?:{row:number;reason:string}[];detectedSheets?:string[];organisation?:string};
type WorkDraft={id?:string;project_name:string;amount:string;assigned_by:string;client_id:string;notes:string;work_status:TrackerRow["work_status"]};
type ClientDraft={id?:string;name:string;email:string;phone:string;address:string;gstin:string;notes:string};
type PaymentDraft={invoice_number:string;amount:string;paid_on:string;method:TrackerPayment["method"];reference:string;notes:string};
type InvoiceDraft={number:string;date:string;total:string;rowIds:string[]};
const NAV:{id:View;label:string;icon:typeof LayoutDashboard}[]=[
 {id:"overview",label:"Overview",icon:LayoutDashboard},
 {id:"work",label:"Work",icon:BriefcaseBusiness},
 {id:"invoices",label:"Invoices",icon:ReceiptText},
 {id:"payments",label:"Payments",icon:Wallet},
 {id:"clients",label:"Clients",icon:UsersRound},
 {id:"documents",label:"Documents",icon:Files},
 {id:"reports",label:"Reports",icon:ChartNoAxesColumn},
 {id:"settings",label:"Settings",icon:Settings2}
];
const localDate=()=>{
 const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
};
const newWork=():WorkDraft=>({project_name:"",amount:"",assigned_by:"",client_id:"",notes:"",work_status:"open"});
const newClient=():ClientDraft=>({name:"",email:"",phone:"",address:"",gstin:"",notes:""});
const newPayment=():PaymentDraft=>({invoice_number:"",amount:"",paid_on:localDate(),method:"bank_transfer",reference:"",notes:""});
const amountValid=(n:string)=>n.trim()!==""&&Number.isFinite(Number(n))&&Number(n)>=0;
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"finance";
function saveCsv(filename:string,data:(string|number|null|undefined)[][]){
 const url=URL.createObjectURL(new Blob(["\uFEFF"+csv(data)],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
 window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Status({children,tone="neutral"}:{children:ReactNode;tone?:"neutral"|"success"|"warn"|"info"|"danger"}){
 return <span className={"fs-status fs-status-"+tone}>{children}</span>;
}
function Empty({title,description,action}:{title:string;description:string;action?:ReactNode}){
 return <div className="fs-empty"><div className="fs-empty-symbol"><FileText size={21}/></div><strong>{title}</strong><p>{description}</p>{action}</div>;
}
function Card({title,description,action,children}:{title:string;description?:string;action?:ReactNode;children:ReactNode}){
 return <section className="fs-card"><div className="fs-card-head"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</div>{children}</section>;
}
function Dialog({title,subtitle,close,children}:{title:string;subtitle?:string;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement|null;
  const key=(e:KeyboardEvent)=>{
   if(e.key==="Escape")close();
   if(e.key==="Tab"&&ref.current){
    const controls=[...ref.current.querySelectorAll<HTMLElement>('input:not([disabled]),button:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
    if(!controls.length)return;
    if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls[controls.length-1].focus()}
    else if(!e.shiftKey&&document.activeElement===controls[controls.length-1]){e.preventDefault();controls[0].focus()}
   }
  };
  document.addEventListener("keydown",key);
  ref.current?.querySelector<HTMLElement>("input,button")?.focus();
  return()=>{document.removeEventListener("keydown",key);before?.focus()};
 },[close]);
 return <div className="fs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
  <section className="fs-dialog" ref={ref} role="dialog" aria-modal="true" aria-label={title}>
   <div className="fs-dialog-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="fs-icon" type="button" onClick={close} aria-label="Close"><X size={20}/></button></div>
   <div className="fs-dialog-content">{children}</div>
  </section>
 </div>;
}
function Metric({label,value,detail,icon:Icon,emphasis=false}:{label:string;value:string;detail:string;icon:typeof LayoutDashboard;emphasis?:boolean}){
 return <div className={"fs-metric"+(emphasis?" fs-metric-emphasis":"")}><div className="fs-metric-top"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{detail}</small></div>;
}
export default function FinanceStudio({initialView,email}:{initialView:View;email:string}){
 const router=useRouter();
 const supabase=useMemo(()=>browserClient(),[]);
 const [view,setView]=useState<View>(initialView);
 const [organisations,setOrganisations]=useState<Organisation[]>([]);
 const [organizationId,setOrganizationId]=useState("");
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [rows,setRows]=useState<TrackerRow[]>([]);
 const [payments,setPayments]=useState<TrackerPayment[]>([]);
 const [clients,setClients]=useState<TrackerClient[]>([]);
 const [documents,setDocuments]=useState<Document[]>([]);
 const [imports,setImports]=useState<Batch[]>([]);
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[importing,setImporting]=useState(false);
 const [error,setError]=useState(""),[toast,setToast]=useState("");
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("all");
 const [menu,setMenu]=useState(false);
 const [workDraft,setWorkDraft]=useState<WorkDraft|null>(null),[clientDraft,setClientDraft]=useState<ClientDraft|null>(null);
 const [paymentDraft,setPaymentDraft]=useState<PaymentDraft|null>(null),[invoiceDraft,setInvoiceDraft]=useState<InvoiceDraft|null>(null);
 const [selectedInvoice,setSelectedInvoice]=useState<string|null>(null);
 const [organisationDraft,setOrganisationDraft]=useState<Organisation|null>(null);
 const [uploadOutcome,setUploadOutcome]=useState<ImportOutcome|null>(null);
 const [documentInvoice,setDocumentInvoice]=useState(""),[documentClient,setDocumentClient]=useState("");
 const [documentVisibility,setDocumentVisibility]=useState(false),[documentBusy,setDocumentBusy]=useState(false);
 const [portalEnabled,setPortalEnabled]=useState(false),[portalPassword,setPortalPassword]=useState(""),[portalBusy,setPortalBusy]=useState(false);
 const importInput=useRef<HTMLInputElement>(null),documentInput=useRef<HTMLInputElement>(null),fetchId=useRef(0);
 const activeOrg=organisations.find(x=>x.id===organizationId);
 const flash=(m:string)=>{setToast(m);window.setTimeout(()=>setToast(""),4200)};
 const load=useCallback(async()=>{
  if(!organizationId)return;
  const seq=++fetchId.current;
  setError("");
  try{
   const [s,r,p,c,d,b]=await Promise.all([
    supabase.from("tracker_snapshots").select("*").eq("organization_id",organizationId).limit(1).maybeSingle(),
    supabase.from("tracker_rows").select("*").eq("organization_id",organizationId).order("row_order"),
    supabase.from("tracker_payments").select("*").eq("organization_id",organizationId).order("paid_on",{ascending:false}),
    supabase.from("tracker_clients").select("*").eq("organization_id",organizationId).order("name"),
    supabase.from("tracker_documents").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
    supabase.from("tracker_import_batches").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(8)
   ]);
   if(seq!==fetchId.current)return;
   const all=[s.error,r.error,p.error,c.error,d.error,b.error].filter(Boolean);
   if(all.length)throw new Error(all.map(x=>x?.message).join(" • "));
   setSnapshot((s.data??null) as Snapshot|null);
   setRows((r.data??[]) as TrackerRow[]);
   setPayments((p.data??[]) as TrackerPayment[]);
   setClients((c.data??[]) as TrackerClient[]);
   setDocuments((d.data??[]) as Document[]);
   setImports((b.data??[]) as Batch[]);
  }catch(e){if(seq===fetchId.current)setError(e instanceof Error?e.message:"Could not open this organisation.");}
  finally{if(seq===fetchId.current)setLoading(false)}
 },[organizationId,supabase]);
 useEffect(()=>{
  let alive=true;
  Promise.resolve(supabase.from("tracker_organizations").select("*").order("name")).then(({data,error})=>{
   if(!alive)return;
   if(error)throw error;
   const list=(data??[]) as Organisation[];
   setOrganisations(list);
   const preferred=window.localStorage.getItem("finance.org");
   const selection=list.find(x=>x.id===preferred)||list.find(x=>x.name==="Kumar Aman")||list[0];
   if(selection)setOrganizationId(selection.id);
   else{setLoading(false);setError("No organisations are configured.")}
  }).catch(e=>{if(alive){setError(e instanceof Error?e.message:"Organisation list unavailable.");setLoading(false)}});
  return()=>{alive=false};
 },[supabase]);
 useEffect(()=>{if(organizationId){setLoading(true);void load()}return()=>{fetchId.current++}},[organizationId,load]);
 useEffect(()=>{setView(initialView);setSearch("");setFilter("all");setMenu(false)},[initialView]);
 useEffect(()=>{
  if(activeOrg?.name!=="Kumar Aman"){setPortalEnabled(false);return}
  fetch("/api/portal/config").then(r=>r.ok?r.json():null).then(d=>{if(d)setPortalEnabled(Boolean(d.enabled))}).catch(()=>{});
 },[activeOrg?.name]);
 const invoices=useMemo(()=>invoiceGroups(rows,payments),[rows,payments]);
 const clientLabel=(id:string|null|undefined)=>clients.find(c=>c.id===id)?.name||"Unassigned";
 const orgName=activeOrg?.name||"Finance";
 const invoiceClient=(i:InvoiceGroup)=>{
  const ids=[...new Set(i.rows.map(r=>r.client_id).filter(Boolean))];
  return ids.length===1?clientLabel(ids[0]):ids.length>1?"Multiple clients":"No client";
 };
 const invoiced=sum(invoices.map(i=>i.total));
 const collected=sum(invoices.map(i=>i.paid));
 const outstanding=sum(invoices.map(i=>i.balance));
 const openInvoices=invoices.filter(i=>i.balance>0);
 const unbilled=rows.filter(x=>!x.invoice_number&&x.work_status!=="archived");
 const q=search.toLowerCase().trim();
 const selected=selectedInvoice?invoices.find(i=>i.number===selectedInvoice):null;
 const setOrganisation=(id:string)=>{
  if(id===organizationId)return;
  window.localStorage.setItem("finance.org",id);
  setOrganizationId(id);setRows([]);setPayments([]);setClients([]);setDocuments([]);setImports([]);
  setSnapshot(null);setSelectedInvoice(null);setSearch("");setFilter("all");setError("");setMenu(false);
 };
 const navigate=(next:View)=>{
  setView(next);setSearch("");setFilter("all");setSelectedInvoice(null);setMenu(false);
  router.push(next==="overview"?"/admin":"/admin/"+next,{scroll:false});
 };
 const mutation=async(fn:()=>Promise<void>,message:string,success?:()=>void)=>{
  setWorking(true);setError("");
  try{await fn();success?.();await load();flash(message)}
  catch(e){setError(e instanceof Error?e.message:"Could not save your changes.")}
  finally{setWorking(false)}
 };
 const ensure=(e:unknown)=>{if(e)throw new Error((e as {message?:string}).message||"Database request failed.")};
 const addWork=(row?:TrackerRow)=>setWorkDraft(row?{
  id:row.id,project_name:row.project_name,amount:row.amount==null?"":String(row.amount),
  assigned_by:row.assigned_by??"",client_id:row.client_id??"",notes:row.notes??"",work_status:row.work_status
 }:{...newWork(),client_id:clients.length===1?clients[0].id:""});
 const addClient=(client?:TrackerClient)=>setClientDraft(client?{
  id:client.id,name:client.name,email:client.email??"",phone:client.phone??"",
  address:client.address??"",gstin:client.gstin??"",notes:client.notes??""
 }:newClient());
 const openInvoiceForm=()=>{
  const numbered=invoices.map(i=>Number(i.number)).filter(Number.isInteger);
  const next=String(Math.max(0,...numbered)+1);
  setInvoiceDraft({number:activeOrg?.invoice_prefix?activeOrg.invoice_prefix+next:next,date:localDate(),total:"",rowIds:[]});
 };
 const startImport=()=>importInput.current?.click();
 async function importFile(file:File){
  if(!organizationId)return;
  setImporting(true);setError("");
  try{
   const form=new FormData();form.set("organization_id",organizationId);form.set("file",file);
   const res=await fetch("/api/import",{method:"POST",body:form});
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(data.error||"The file could not be imported.");
   setUploadOutcome(data as ImportOutcome);
   await load();
   flash(data.already_imported?"This file was previously imported.":"Import completed.");
  }catch(e){setError(e instanceof Error?e.message:"Import failed.")}
  finally{setImporting(false);if(importInput.current)importInput.current.value=""}
 }
 async function saveWork(e:FormEvent){
  e.preventDefault();if(!workDraft||!snapshot||!organizationId)return;
  const d=workDraft;
  if(!d.project_name.trim()||d.amount&&!amountValid(d.amount)){setError("Provide a work name and a non-negative amount.");return}
  const value={project_name:d.project_name.trim(),amount:d.amount===""?null:Number(d.amount),
   assigned_by:d.assigned_by.trim()||null,client_id:d.client_id||null,notes:d.notes.trim()||null,
   work_status:d.work_status,updated_at:new Date().toISOString()};
  await mutation(async()=>{
   const {error}=d.id?await supabase.from("tracker_rows").update(value).eq("id",d.id).eq("organization_id",organizationId):
    await supabase.from("tracker_rows").insert({...value,organization_id:organizationId,snapshot_id:snapshot.id,
     row_order:Math.max(0,...rows.map(r=>r.row_order))+1,from_source_pdf:false,source_kind:"created_in_app"});
   ensure(error);
  },d.id?"Work updated.":"Work created.",()=>setWorkDraft(null));
 }
 async function deleteWork(id:string){
  const row=rows.find(x=>x.id===id);
  if(row?.invoice_number){setError("Invoiced work cannot be deleted from this screen. Preserve the invoice history.");return}
  if(!window.confirm("Permanently delete this uninvoiced work item?"))return;
  await mutation(async()=>{
   const {error}=await supabase.from("tracker_rows").delete().eq("id",id).eq("organization_id",organizationId);
   ensure(error);
  },"Work removed.",()=>setWorkDraft(null));
 }
 async function saveClient(e:FormEvent){
  e.preventDefault();if(!clientDraft||!organizationId)return;
  const d=clientDraft;if(!d.name.trim()){setError("Client name is required.");return}
  const data={name:d.name.trim(),email:d.email.trim()||null,phone:d.phone.trim()||null,
   address:d.address.trim()||null,gstin:d.gstin.trim()||null,notes:d.notes.trim()||null};
  await mutation(async()=>{
   const {error}=d.id?await supabase.from("tracker_clients").update(data).eq("id",d.id).eq("organization_id",organizationId):
    await supabase.from("tracker_clients").insert({...data,organization_id:organizationId,from_source_pdf:false});
   ensure(error);
  },d.id?"Client updated.":"Client added.",()=>setClientDraft(null));
 }
 async function savePayment(e:FormEvent){
  e.preventDefault();if(!paymentDraft)return;
  const d=paymentDraft,g=invoices.find(i=>i.number===d.invoice_number),n=Number(d.amount);
  if(!g||!Number.isFinite(n)||n<=0||n>g.balance+.001){setError("Amount must be greater than zero and at most the available invoice balance.");return}
  await mutation(async()=>{
   const {error}=await supabase.from("tracker_payments").insert({
    organization_id:organizationId,invoice_number:d.invoice_number,amount:n,paid_on:d.paid_on,
    method:d.method,reference:d.reference.trim()||null,notes:d.notes.trim()||null
   });ensure(error);
  },"Payment saved.",()=>setPaymentDraft(null));
 }
 async function deletePayment(id:string){
  if(!window.confirm("Remove this payment? The invoice balance will increase."))return;
  await mutation(async()=>{
   const {error}=await supabase.from("tracker_payments").delete().eq("id",id).eq("organization_id",organizationId);ensure(error);
  },"Payment removed.");
 }
 async function createInvoice(e:FormEvent){
  e.preventDefault();if(!invoiceDraft)return;
  const d=invoiceDraft,selectedRows=rows.filter(r=>d.rowIds.includes(r.id));
  const total=d.total.trim()===""?sum(selectedRows.map(x=>Number(x.amount??0))):Number(d.total);
  const clientIds=[...new Set(selectedRows.map(x=>x.client_id).filter(Boolean))];
  if(!d.number.trim()||!selectedRows.length||!Number.isFinite(total)||total<0){setError("Choose work, a valid number and a non-negative invoice total.");return}
  if(clientIds.length>1){setError("One invoice cannot contain work from different clients. Select one client.");return}
  if(selectedRows.some(x=>x.amount==null)&&d.total.trim()===""){setError("Some work has no amount. Enter the invoice total explicitly.");return}
  await mutation(async()=>{
   const {error}=await supabase.rpc("tracker_create_organisation_invoice",{
    p_organization_id:organizationId,p_number:d.number.trim(),p_date:d.date,p_total:total,p_row_ids:d.rowIds
   });ensure(error);
  },"Invoice created. Open it to generate its PDF.",()=>setInvoiceDraft(null));
 }
 async function saveOrganisation(e:FormEvent){
  e.preventDefault();if(!organisationDraft)return;
  const d=organisationDraft;
  const payload={legal_name:d.legal_name?.trim()||null,email:d.email?.trim()||null,phone:d.phone?.trim()||null,
   address:d.address?.trim()||null,gstin:d.gstin?.trim()||null,pan:d.pan?.trim()||null,
   bank_name:d.bank_name?.trim()||null,bank_account:d.bank_account?.trim()||null,bank_ifsc:d.bank_ifsc?.trim()||null,
   invoice_prefix:d.invoice_prefix?.trim()||"",invoice_footer:d.invoice_footer?.trim()||null,updated_at:new Date().toISOString()};
  await mutation(async()=>{
   const {error}=await supabase.from("tracker_organizations").update(payload).eq("id",organizationId);ensure(error);
   setOrganisations(prev=>prev.map(o=>o.id===organizationId?{...o,...payload}:o));
  },"Organisation settings updated.",()=>setOrganisationDraft(null));
 }
 async function uploadDocument(file:File){
  if(!organizationId)return;setDocumentBusy(true);setError("");
  try{
   const body=new FormData();body.set("file",file);body.set("organization_id",organizationId);
   if(documentInvoice)body.set("invoice_number",documentInvoice);
   if(documentClient)body.set("client_id",documentClient);
   body.set("visible_to_client",String(documentVisibility&&!!documentClient));
   const res=await fetch("/api/documents",{method:"POST",body});
   const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||"Upload failed");
   await load();flash("Document securely uploaded.");
  }catch(e){setError(e instanceof Error?e.message:"Upload failed")}
  finally{setDocumentBusy(false);if(documentInput.current)documentInput.current.value=""}
 }
 async function deleteDocument(id:string){
  if(!window.confirm("Permanently delete this document and its stored file?"))return;
  await mutation(async()=>{
   const res=await fetch("/api/documents/"+encodeURIComponent(id),{method:"DELETE"});
   const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||"Could not delete document.");
  },"Document deleted.");
 }
 async function savePortal(e:FormEvent){
  e.preventDefault();if(activeOrg?.name!=="Kumar Aman")return;
  if(portalPassword&&portalPassword.length<12){setError("Use at least 12 characters.");return}
  setPortalBusy(true);setError("");
  try{
   const res=await fetch("/api/portal/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:portalEnabled,password:portalPassword})});
   const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||"Could not save portal.");
   setPortalPassword("");flash("Client access saved.");
  }catch(e){setError(e instanceof Error?e.message:"Portal update failed.");}
  finally{setPortalBusy(false)}
 }
 const workVisible=rows.filter(r=>{
  if(filter==="unbilled"&&r.invoice_number)return false;
  if(filter==="invoiced"&&!r.invoice_number)return false;
  if(filter==="complete"&&r.work_status!=="complete")return false;
  return !q||[r.project_name,r.assigned_by,r.invoice_number,clientLabel(r.client_id)].join(" ").toLowerCase().includes(q);
 });
 const invoiceVisible=invoices.filter(i=>!q||[i.number,invoiceClient(i),...i.rows.map(r=>r.project_name)].join(" ").toLowerCase().includes(q));
 const paymentsVisible=payments.filter(p=>!q||[p.invoice_number,p.method,p.reference].join(" ").toLowerCase().includes(q));
 const pageTitle=NAV.find(x=>x.id===view)?.label||"Finance";
 const downloadWork=()=>saveCsv(slug(orgName)+"-work.csv",[
  ["Project","Client","Assigned by","Amount INR","Invoice number","Work status","Notes"],
  ...rows.map(r=>[r.project_name,clientLabel(r.client_id),r.assigned_by,r.amount,r.invoice_number,r.work_status,r.notes])
 ]);
 const downloadInvoices=()=>saveCsv(slug(orgName)+"-invoices.csv",[
  ["Invoice","Client","Issue date","Invoice total INR","Work item total INR","Paid INR","Outstanding INR","Settlement"],
  ...invoices.map(i=>[i.number,invoiceClient(i),i.date,i.total,i.lineTotal,i.paid,i.balance,i.sourceSettled?"Marked paid in opening records":i.paid?"Partial":"Unpaid"])
 ]);
 const pdfUrl=(number:string)=>"/api/invoices/"+encodeURIComponent(number)+"/pdf?org="+encodeURIComponent(organizationId);
 return <div className="fs-root">
  <aside className="fs-sidebar">
   <div className="fs-brand"><div className="fs-brand-mark">f<span>.</span></div><div><strong>Finance</strong><small>WORKSPACE</small></div></div>
   <div className="fs-organisation"><label htmlFor="fs-org">ORGANISATION</label><div className="fs-organisation-input">
    <Building2 size={16}/><select id="fs-org" value={organizationId} onChange={e=>setOrganisation(e.target.value)} aria-label="Active organisation">
     {organisations.map(o=><option key={o.id} value={o.id}>{o.name}{o.status==="dissolved"?" (dissolved)":""}</option>)}
    </select><ChevronDown size={14}/></div>
    {activeOrg?.status==="dissolved"&&<Status tone="warn">Dissolved organisation</Status>}
   </div>
   <div className="fs-sidebar-kicker">WORKSPACE</div>
   <nav className="fs-nav" aria-label="Main navigation">
    {NAV.map(({id,label,icon:Icon})=><button type="button" className={"fs-nav-link"+(view===id?" active":"")} key={id}
      aria-current={view===id?"page":undefined} onClick={()=>navigate(id)}><Icon size={18}/><span>{label}</span></button>)}
   </nav>
   <div className="fs-side-spacer"/>
   <div className="fs-side-foot"><span className="fs-secure"><ShieldCheck size={15}/>Private workspace</span>
    <button className="fs-account" type="button" onClick={()=>navigate("settings")}><span className="fs-avatar">{email.charAt(0).toUpperCase()}</span><span><strong>My account</strong><small title={email}>{email}</small></span><ChevronRight size={15}/></button>
   </div>
  </aside>
  <div className="fs-main">
   <header className="fs-topbar">
    <div className="fs-topbar-left"><button className="fs-icon fs-menu-toggle" type="button" onClick={()=>setMenu(true)} aria-label="Open navigation"><Menu size={21}/></button>
     <span className="fs-crumb">{orgName}</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div>
    <div className="fs-topbar-actions">
     <button className="fs-icon fs-refresh" type="button" aria-label="Refresh data" title="Refresh data" disabled={loading||working} onClick={()=>{setLoading(true);void load()}}><RefreshCw size={17}/></button>
     <button className="fs-button fs-button-primary" disabled={!organizationId||importing} type="button" onClick={startImport}><UploadCloud size={17}/><span>{importing?"Importing…":"Import data"}</span></button>
    </div>
   </header>
   <main className="fs-content" aria-live="polite">
    {error&&<div className="fs-alert fs-alert-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button type="button" className="fs-icon" aria-label="Dismiss error" onClick={()=>setError("")}><X size={17}/></button></div>}
    {loading?<div className="fs-loading"><div className="fs-loader"/><strong>Loading {orgName}</strong><p>Retrieving your private finance data.</p></div>:
    <>
    {view==="overview"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">YOUR FINANCES</p><h1>{orgName}</h1><p>Invoices, work and payments—clearly organised.</p></div><div className="fs-heading-actions"><button type="button" className="fs-button" onClick={()=>addWork()}><Plus size={16}/>New work</button><button type="button" className="fs-button fs-button-primary" onClick={openInvoiceForm}><ReceiptText size={16}/>New invoice</button></div></div>
     <div className="fs-metrics">
      <Metric label="Outstanding" value={money(outstanding)} detail={openInvoices.length+" open invoices"} icon={Wallet} emphasis/>
      <Metric label="Total invoiced" value={money(invoiced)} detail={invoices.length+" invoices"} icon={ReceiptText}/>
      <Metric label="Marked paid / collected" value={money(collected)} detail="Includes historical paid status" icon={CheckCircle2}/>
      <Metric label="Work items" value={String(rows.length)} detail={unbilled.length+" not yet invoiced"} icon={BriefcaseBusiness}/>
     </div>
     {activeOrg?.status==="dissolved"&&<div className="fs-alert fs-alert-warn"><AlertCircle size={18}/>This organisation is marked dissolved. Historical records can still be imported and viewed.</div>}
     {rows.length===0&&clients.length===0?<div className="fs-welcome"><div className="fs-welcome-icon"><UploadCloud size={27}/></div><h2>Start with your existing records.</h2><p>Import an Excel or CSV file. Clients, work and invoices are recognised automatically and saved directly to this organisation.</p><button className="fs-button fs-button-primary" type="button" onClick={startImport}><UploadCloud size={17}/>Import your first file</button><small>You can also create a client or project manually. No ongoing spreadsheet link is required.</small></div>:<>
      <div className="fs-panels-two">
       <Card title="Outstanding invoices" description="What still needs to be collected" action={<button className="fs-link" onClick={()=>navigate("invoices")}>View all <ArrowUpRight size={15}/></button>}>
        {openInvoices.length?openInvoices.slice(0,6).map(i=><button className="fs-list-row" key={i.number} onClick={()=>setSelectedInvoice(i.number)}>
         <span className="fs-row-icon"><ReceiptText size={18}/></span><span className="fs-row-main"><strong>Invoice {i.number}</strong><small>{invoiceClient(i)} · {dateLabel(i.date)}</small></span><span className="fs-row-money">{money(i.balance)}</span><ChevronRight size={17}/></button>):
         <Empty title="All invoices paid" description="No outstanding invoice balances."/>}
       </Card>
       <Card title="Unbilled work" description="Ready to organise into an invoice" action={<button className="fs-link" onClick={()=>navigate("work")}>See work <ArrowUpRight size={15}/></button>}>
        {unbilled.length?unbilled.slice(0,6).map(r=><button className="fs-list-row" key={r.id} onClick={()=>addWork(r)}>
         <span className="fs-row-icon"><BriefcaseBusiness size={18}/></span><span className="fs-row-main"><strong>{titleFromSource(r.project_name)}</strong><small>{clientLabel(r.client_id)} · {r.assigned_by||"No POC"}</small></span><span className="fs-row-money">{money(r.amount)}</span><ChevronRight size={17}/></button>):
         <Empty title="Nothing unbilled" description="Your current work is assigned to invoices."/>}
       </Card>
      </div>
      {snapshot?.reported_pending&&Math.abs(Number(snapshot.reported_pending)-outstanding)>0.01&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Opening balance was {money(snapshot.reported_pending)}; current balance is {money(outstanding)}. New transactions are reflected separately.</div>}
     </>}
    </>}
    {view==="work"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">PROJECT REGISTER</p><h1>Work</h1><p>Every project, price and assignment, in one searchable list.</p></div><div className="fs-heading-actions"><button className="fs-button" onClick={downloadWork}><ArrowDownToLine size={16}/>Export</button><button className="fs-button fs-button-primary" onClick={()=>addWork()}><Plus size={16}/>New work</button></div></div>
     <div className="fs-filterbar"><label className="fs-search"><Search size={17}/><input aria-label="Search work" placeholder="Search projects, clients or people…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <div className="fs-segments">{[["all","All"],["unbilled","Unbilled"],["invoiced","Invoiced"],["complete","Complete"]].map(([id,label])=><button key={id} className={filter===id?"active":""} onClick={()=>setFilter(id)}>{label}</button>)}</div>
     </div>
     <Card title="Projects and deliverables" description={workVisible.length+" items"}>
      <div className="fs-table-scroll"><table className="fs-table"><thead><tr><th>WORK</th><th>CLIENT</th><th>POC</th><th>INVOICE</th><th className="fs-right">AMOUNT</th><th>STATUS</th><th/></tr></thead><tbody>
       {workVisible.map(r=><tr key={r.id}><td><button className="fs-table-main" onClick={()=>addWork(r)}>{titleFromSource(r.project_name)}</button>{r.notes&&<small className="fs-table-sub">Has notes</small>}</td>
        <td>{clientLabel(r.client_id)}</td><td>{r.assigned_by||<span className="fs-dim">Not set</span>}</td>
        <td>{r.invoice_number?<button className="fs-link" onClick={()=>{navigate("invoices");setSelectedInvoice(r.invoice_number)}}>{r.invoice_number}</button>:<span className="fs-dim">—</span>}</td>
        <td className="fs-right fs-nowrap fs-strong">{money(r.amount)}</td><td><Status tone={r.work_status==="complete"?"success":"neutral"}>{r.work_status}</Status></td>
        <td><button className="fs-icon" aria-label={"Edit "+r.project_name} onClick={()=>addWork(r)}><PenLine size={16}/></button></td></tr>)}
      </tbody></table></div>
      {!workVisible.length&&<Empty title="No work found" description="Try clearing the filters, importing a file or adding work."/>}
     </Card>
    </>}
    {view==="invoices"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">BILLING</p><h1>Invoices</h1><p>Generate documents, see balances and track receipts.</p></div><div className="fs-heading-actions"><button className="fs-button" onClick={downloadInvoices}><ArrowDownToLine size={16}/>Export</button><button className="fs-button fs-button-primary" onClick={openInvoiceForm}><Plus size={16}/>Create invoice</button></div></div>
     <div className="fs-summaryline"><div><span>Open balance</span><strong>{money(outstanding)}</strong></div><div><span>Marked paid</span><strong>{money(collected)}</strong></div><div><span>Total invoices</span><strong>{invoices.length}</strong></div></div>
     <div className="fs-filterbar"><label className="fs-search"><Search size={17}/><input aria-label="Search invoices" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Invoice number, client, project…"/></label></div>
     <Card title="Invoice register" description="Historical settlements are retained even without payment dates.">
      <div className="fs-table-scroll"><table className="fs-table"><thead><tr><th>INVOICE</th><th>CLIENT</th><th>ISSUED</th><th>STATUS</th><th className="fs-right">TOTAL</th><th className="fs-right">OUTSTANDING</th><th/></tr></thead><tbody>
       {invoiceVisible.map(i=><tr key={i.number}><td><button className="fs-table-main" onClick={()=>setSelectedInvoice(i.number)}>#{i.number}</button><small className="fs-table-sub">{i.rows.length} items</small></td>
        <td>{invoiceClient(i)}</td><td className="fs-nowrap">{dateLabel(i.date)}</td>
        <td><Status tone={i.balance===0?"success":i.paid>0?"info":"warn"}>{i.balance===0?"Paid":i.paid>0?"Part paid":"Unpaid"}</Status></td>
        <td className="fs-right fs-strong">{money(i.total)}</td><td className="fs-right fs-strong">{money(i.balance)}</td>
        <td><button className="fs-icon" aria-label={"View invoice "+i.number} onClick={()=>setSelectedInvoice(i.number)}><ChevronRight size={18}/></button></td></tr>)}
      </tbody></table></div>
      {!invoiceVisible.length&&<Empty title="No invoices yet" description="Create one from uninvoiced work or import an existing invoice register." action={<button className="fs-button" onClick={openInvoiceForm}><Plus size={16}/>New invoice</button>}/>}
     </Card>
    </>}
    {view==="payments"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">RECEIVABLES</p><h1>Payments</h1><p>Separate historical paid status from newly recorded transactions.</p></div><button className="fs-button fs-button-primary" onClick={()=>setPaymentDraft(newPayment())}><Plus size={16}/>Record payment</button></div>
     <div className="fs-metrics fs-metrics-two"><Metric label="Paid / settled" value={money(collected)} detail="Includes paid invoices in the opening workbook" icon={CheckCircle2}/><Metric label="Remaining" value={money(outstanding)} detail={openInvoices.length+" unpaid invoices"} icon={Wallet} emphasis/></div>
     <div className="fs-panels-two">
      <Card title="Recorded transactions" description="New payments entered with real dates and methods" action={<button className="fs-link" onClick={()=>saveCsv(slug(orgName)+"-payments.csv",[["Invoice","Amount","Date","Method","Reference"],...payments.map(p=>[p.invoice_number,p.amount,p.paid_on,p.method,p.reference])])}><ArrowDownToLine size={16}/>CSV</button>}>
       {paymentsVisible.length?paymentsVisible.map(p=><div className="fs-list-row fs-list-static" key={p.id}><span className="fs-row-icon"><Wallet size={17}/></span><span className="fs-row-main"><strong>Invoice {p.invoice_number}</strong><small>{dateLabel(p.paid_on)} · {p.method.replaceAll("_"," ")}{p.reference?" · "+p.reference:""}</small></span><span className="fs-row-money">{money(p.amount)}</span><button className="fs-icon fs-danger-hover" aria-label="Remove payment" onClick={()=>void deletePayment(p.id)}><Trash2 size={16}/></button></div>):
       <Empty title="No individual transactions yet" description="Historical paid invoices are shown separately. Record new receipts only when money arrives."/>}
      </Card>
      <Card title="Paid in opening records" description="Status imported as paid; some dates were not recorded">
       {invoices.filter(x=>x.sourceSettled).length?invoices.filter(x=>x.sourceSettled).map(i=><button className="fs-list-row" key={i.number} onClick={()=>setSelectedInvoice(i.number)}><span className="fs-row-icon"><Check size={18}/></span><span className="fs-row-main"><strong>Invoice {i.number}</strong><small>{i.sourcePaidOn?dateLabel(i.sourcePaidOn):"Date not supplied in workbook"}</small></span><span className="fs-row-money">{money(i.total)}</span><ChevronRight size={17}/></button>):
       <Empty title="No opening settlements" description="Paid historical invoices will be listed here."/>}
      </Card>
     </div>
    </>}
    {view==="clients"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">RELATIONSHIPS</p><h1>Clients</h1><p>Contact details, assigned projects and billing activity.</p></div><button className="fs-button fs-button-primary" onClick={()=>addClient()}><Plus size={16}/>New client</button></div>
     <div className="fs-filterbar"><label className="fs-search"><Search size={17}/><input aria-label="Find client" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search clients…"/></label></div>
     <Card title="Client directory" description={clients.length+" clients in this organisation"}>
      {clients.filter(c=>!q||[c.name,c.email,c.phone].join(" ").toLowerCase().includes(q)).length?
      <div className="fs-table-scroll"><table className="fs-table"><thead><tr><th>CLIENT</th><th>CONTACT</th><th>WORK</th><th>INVOICES</th><th/></tr></thead><tbody>
       {clients.filter(c=>!q||[c.name,c.email,c.phone].join(" ").toLowerCase().includes(q)).map(c=><tr key={c.id}>
        <td><button className="fs-table-main" onClick={()=>addClient(c)}>{c.name}</button></td>
        <td><span>{c.email||"—"}</span><small className="fs-table-sub">{c.phone||""}</small></td>
        <td>{rows.filter(r=>r.client_id===c.id).length}</td>
        <td>{invoices.filter(i=>i.rows.some(r=>r.client_id===c.id)).length}</td>
        <td><button className="fs-icon" aria-label={"Edit "+c.name} onClick={()=>addClient(c)}><PenLine size={16}/></button></td>
       </tr>)}
      </tbody></table></div>:
      <Empty title="No clients" description="Import your existing client list in one upload, or add a client manually." action={<button className="fs-button" onClick={startImport}><UploadCloud size={16}/>Import clients</button>}/>}
     </Card>
    </>}
    {view==="documents"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">YOUR FILES</p><h1>Documents</h1><p>Private storage for generated invoices and uploaded records.</p></div><button className="fs-button fs-button-primary" onClick={()=>documentInput.current?.click()} disabled={documentBusy}><Plus size={16}/>{documentBusy?"Uploading…":"Upload file"}</button></div>
     <div className="fs-upload-options"><label>Related invoice<select value={documentInvoice} onChange={e=>setDocumentInvoice(e.target.value)}><option value="">None</option>{invoices.map(i=><option key={i.number} value={i.number}>{i.number}</option>)}</select></label>
      <label>Client<select value={documentClient} onChange={e=>setDocumentClient(e.target.value)}><option value="">None</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="fs-check"><input type="checkbox" checked={documentVisibility} onChange={e=>setDocumentVisibility(e.target.checked)} disabled={!documentClient||activeOrg?.name!=="Kumar Aman"}/>Share in client portal</label>
     </div>
     <Card title="Uploaded files" description="Secure storage with member-only downloads by default" action={<Status>{documents.length} files</Status>}>
      {documents.length?documents.map(d=><div className="fs-list-row fs-list-static" key={d.id}><span className="fs-row-icon"><FileText size={18}/></span><span className="fs-row-main"><strong>{d.file_name}</strong><small>{Math.round(d.size_bytes/1024)} KB · {d.invoice_number?"Invoice "+d.invoice_number+" · ":""}{d.visible_to_client?"Shared":"Private"}</small></span>
       <a href={"/api/documents/"+encodeURIComponent(d.id)} target="_blank" rel="noopener noreferrer" className="fs-button fs-button-small"><ArrowDownToLine size={15}/>Open</a>
       <button className="fs-icon fs-danger-hover" aria-label={"Delete "+d.file_name} onClick={()=>void deleteDocument(d.id)}><Trash2 size={16}/></button></div>):
       <Empty title="No documents yet" description="Upload an original PDF, or generate an invoice from the invoice register."/>}
     </Card>
     <Card title="Invoice PDFs" description="Generated PDFs use the current organisation and client identity">
      {invoices.length?invoices.map(i=><a className="fs-list-row" key={i.number} href={pdfUrl(i.number)} target="_blank" rel="noopener noreferrer"><span className="fs-row-icon"><ReceiptText size={18}/></span><span className="fs-row-main"><strong>Invoice {i.number}</strong><small>{invoiceClient(i)} · {dateLabel(i.date)}</small></span><span className="fs-row-money">{money(i.total)}</span><ArrowDownToLine size={17}/></a>):
       <Empty title="No invoices" description="Create an invoice to generate a PDF."/>}
     </Card>
    </>}
    {view==="reports"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">REPORTING</p><h1>Reports</h1><p>Live figures calculated from the database, not an attached spreadsheet.</p></div><button className="fs-button" onClick={downloadInvoices}><ArrowDownToLine size={16}/>Export CSV</button></div>
     <div className="fs-metrics fs-metrics-three"><Metric label="Invoiced" value={money(invoiced)} detail={invoices.length+" invoices"} icon={ReceiptText}/><Metric label="Paid" value={money(collected)} detail="Includes workbook settlement status" icon={CheckCircle2}/><Metric label="Outstanding" value={money(outstanding)} detail={openInvoices.length+" open invoices"} icon={Wallet} emphasis/></div>
     <div className="fs-panels-two">
      <Card title="Balances by invoice" description="Only unpaid portions are included">
       {invoices.length?<div className="fs-chart">{invoices.map(i=><div className="fs-chart-row" key={i.number}><span>#{i.number}</span><div className="fs-chart-track"><span style={{width:(outstanding?i.balance/outstanding*100:0)+"%"}}/></div><strong>{money(i.balance)}</strong></div>)}</div>:
       <Empty title="No financial activity" description="Import records or create invoices to see reports."/>}
      </Card>
      <Card title="Reconciliation" description="Work amounts compared with invoice totals">
       {invoices.length?invoices.map(i=><button key={i.number} className="fs-list-row" onClick={()=>setSelectedInvoice(i.number)}><span className="fs-row-main"><strong>Invoice {i.number}</strong><small>{Math.abs(i.discrepancy)>.001?"Line items differ from invoice total":"Line items agree"}</small></span><span className="fs-row-money">{money(i.total)}</span><Status tone={Math.abs(i.discrepancy)>.001?"warn":"success"}>{Math.abs(i.discrepancy)>.001?"Review":"Match"}</Status></button>):
       <Empty title="Nothing to reconcile" description="Invoiced work will be checked automatically."/>}
      </Card>
     </div>
     <Card title="Import history" description="Import metadata only—no live spreadsheet connection">
      {imports.length?imports.map(batch=><div key={batch.id} className="fs-list-row fs-list-static"><span className="fs-row-icon"><UploadCloud size={17}/></span><span className="fs-row-main"><strong>{batch.file_label}</strong><small>{dateLabel(batch.created_at.slice(0,10))} · {batch.imported_count} created · {batch.updated_count} updated · {batch.flagged_count} flagged</small></span></div>):
      <Empty title="No later imports" description="Opening records are already stored in the database. Future uploads appear here."/>}
     </Card>
    </>}
    {view==="settings"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">WORKSPACE SETTINGS</p><h1>Settings</h1><p>Keep company details accurate for invoicing and documents.</p></div><button className="fs-button fs-button-primary" onClick={()=>activeOrg&&setOrganisationDraft({...activeOrg})}><PenLine size={16}/>Edit organisation</button></div>
     <div className="fs-panels-two">
      <Card title="Organisation profile" description="Displayed on documents and invoice PDFs">
       <div className="fs-facts">
        <div><span>Organisation</span><strong>{orgName}</strong></div>
        <div><span>Status</span><strong><Status tone={activeOrg?.status==="dissolved"?"warn":"success"}>{activeOrg?.status||"—"}</Status></strong></div>
        <div><span>Legal name</span><strong>{activeOrg?.legal_name||"Not specified"}</strong></div>
        <div><span>Email</span><strong>{activeOrg?.email||"Not specified"}</strong></div>
        <div><span>GSTIN</span><strong>{activeOrg?.gstin||"Not specified"}</strong></div>
        <div><span>Bank</span><strong>{activeOrg?.bank_name||"Not specified"}</strong></div>
       </div>
      </Card>
      <Card title="Data and access" description="Authorised workspace members only">
       <div className="fs-facts"><div><span>Account</span><strong>{email}</strong></div><div><span>Import behavior</span><strong>Create or update existing records</strong></div><div><span>Database</span><strong>Supabase · independent of spreadsheets</strong></div></div>
       <div className="fs-settings-actions"><button className="fs-button" onClick={startImport}><UploadCloud size={16}/>Import a file</button><button className="fs-button" onClick={()=>void supabase.auth.signOut().then(()=>window.location.assign("/"))}><LogOut size={16}/>Sign out</button></div>
      </Card>
     </div>
     {activeOrg?.name==="Kumar Aman"&&<Card title="Elle India client portal" description="Password-protected read-only view for the opening client">
      <form className="fs-form fs-portal-form" onSubmit={savePortal}>
       <label className="fs-check"><input type="checkbox" checked={portalEnabled} onChange={e=>setPortalEnabled(e.target.checked)}/>Enable password access</label>
       <label>New or replacement portal password<input type="password" autoComplete="new-password" minLength={12} value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder="At least 12 characters"/></label>
       <div className="fs-form-actions"><button className="fs-button fs-button-primary" disabled={portalBusy}>{portalBusy?"Saving…":"Save portal settings"}</button><a className="fs-button" href="/portal/elle-india" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Open client portal</a></div>
      </form>
     </Card>}
    </>}
    </>
    }
    <footer className="fs-footer">Finance workspace <span>Private · {orgName}</span></footer>
   </main>
  </div>
  <input ref={importInput} type="file" hidden accept=".xlsx,.csv,.tsv" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f)}}/>
  <input ref={documentInput} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadDocument(f)}}/>
  <nav className="fs-mobile-nav" aria-label="Quick navigation">
   {NAV.slice(0,4).map(({id,label,icon:Icon})=><button type="button" key={id} onClick={()=>navigate(id)} aria-current={view===id?"page":undefined} className={view===id?"active":""}><Icon size={20}/><span>{label}</span></button>)}
   <button type="button" onClick={()=>setMenu(true)}><MoreHorizontal size={20}/><span>More</span></button>
  </nav>
  {menu&&<div className="fs-backdrop fs-mobile-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMenu(false)}}><section className="fs-mobile-sheet" role="dialog" aria-modal="true" aria-label="Navigation">
   <div className="fs-dialog-head"><h2>Navigate</h2><button type="button" className="fs-icon" onClick={()=>setMenu(false)} aria-label="Close navigation"><X size={19}/></button></div>
   <div className="fs-mobile-links">{NAV.map(({id,label,icon:Icon})=><button type="button" key={id} onClick={()=>navigate(id)} className={view===id?"active":""}><Icon size={19}/>{label}<ChevronRight size={17}/></button>)}</div>
   <button className="fs-button fs-button-primary fs-mobile-import" onClick={()=>{setMenu(false);startImport()}}><UploadCloud size={17}/>Import data</button>
  </section></div>}
  {toast&&<div className="fs-toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
  {uploadOutcome&&<Dialog title={uploadOutcome.already_imported?"Already imported":"Import complete"} subtitle={uploadOutcome.organisation} close={()=>setUploadOutcome(null)}>
   <div className="fs-import-result"><div className="fs-import-success"><CheckCircle2 size={27}/><div><strong>{uploadOutcome.already_imported?"This file was processed before.":"Your records are now in the database."}</strong><span>No spreadsheet stays connected after importing.</span></div></div>
    <div className="fs-import-metrics"><div><strong>{uploadOutcome.created}</strong><span>Created</span></div><div><strong>{uploadOutcome.updated}</strong><span>Updated</span></div><div><strong>{uploadOutcome.skipped}</strong><span>Skipped</span></div><div><strong>{uploadOutcome.flagged}</strong><span>Needs review</span></div></div>
    {!!uploadOutcome.warnings?.length&&<div className="fs-import-warnings"><strong>Import notes</strong>{uploadOutcome.warnings.map((s,i)=><p key={i}>{s}</p>)}</div>}
    {!!uploadOutcome.issues?.length&&<div className="fs-import-warnings"><strong>Rows not imported</strong>{uploadOutcome.issues.map((s,i)=><p key={i}>Row {s.row}: {s.reason}</p>)}</div>}
    <div className="fs-form-actions"><button className="fs-button fs-button-primary" onClick={()=>setUploadOutcome(null)}>Done</button></div>
   </div>
  </Dialog>}
  {workDraft&&<Dialog title={workDraft.id?"Edit work":"Add work"} subtitle="Project or deliverable" close={()=>setWorkDraft(null)}>
   <form className="fs-form" onSubmit={saveWork}>
    <label>Work / project name<input required autoFocus value={workDraft.project_name} onChange={e=>setWorkDraft({...workDraft,project_name:e.target.value})} placeholder="Describe the deliverable"/></label>
    <div className="fs-form-two"><label>Amount (INR, optional)<input type="number" min="0" step=".01" value={workDraft.amount} onChange={e=>setWorkDraft({...workDraft,amount:e.target.value})} placeholder="Not yet priced"/></label><label>Assigned by / POC<input value={workDraft.assigned_by} onChange={e=>setWorkDraft({...workDraft,assigned_by:e.target.value})} placeholder="Optional"/></label></div>
    <div className="fs-form-two"><label>Client<select value={workDraft.client_id} onChange={e=>setWorkDraft({...workDraft,client_id:e.target.value})}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Work status<select value={workDraft.work_status} onChange={e=>setWorkDraft({...workDraft,work_status:e.target.value as TrackerRow["work_status"]})}><option value="open">Open</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label></div>
    <label>Notes<textarea rows={4} value={workDraft.notes} onChange={e=>setWorkDraft({...workDraft,notes:e.target.value})} placeholder="Any specific instructions or price history"/></label>
    {workDraft.id&&rows.find(x=>x.id===workDraft.id)?.invoice_number&&<div className="fs-alert fs-alert-note"><LockKeyhole size={17}/>This work is linked to invoice {rows.find(x=>x.id===workDraft.id)?.invoice_number}. Changing its price will be reflected in reconciliation.</div>}
    <div className="fs-form-actions">{workDraft.id&&!rows.find(x=>x.id===workDraft.id)?.invoice_number&&<button type="button" className="fs-button fs-danger" disabled={working} onClick={()=>void deleteWork(workDraft.id!)}><Trash2 size={15}/>Delete</button>}<span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setWorkDraft(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">{working?"Saving…":"Save work"}</button></div>
   </form>
  </Dialog>}
  {clientDraft&&<Dialog title={clientDraft.id?"Edit client":"Add client"} subtitle="Billing and contact information" close={()=>setClientDraft(null)}>
   <form className="fs-form" onSubmit={saveClient}><label>Client name<input autoFocus required value={clientDraft.name} onChange={e=>setClientDraft({...clientDraft,name:e.target.value})}/></label>
    <div className="fs-form-two"><label>Email<input type="email" value={clientDraft.email} onChange={e=>setClientDraft({...clientDraft,email:e.target.value})}/></label><label>Phone<input type="tel" value={clientDraft.phone} onChange={e=>setClientDraft({...clientDraft,phone:e.target.value})}/></label></div>
    <label>Billing address<textarea rows={3} value={clientDraft.address} onChange={e=>setClientDraft({...clientDraft,address:e.target.value})}/></label>
    <label>GSTIN (optional)<input value={clientDraft.gstin} onChange={e=>setClientDraft({...clientDraft,gstin:e.target.value})}/></label>
    <label>Notes<textarea rows={3} value={clientDraft.notes} onChange={e=>setClientDraft({...clientDraft,notes:e.target.value})}/></label>
    <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setClientDraft(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">{working?"Saving…":"Save client"}</button></div>
   </form>
  </Dialog>}
  {paymentDraft&&<Dialog title="Record payment" subtitle="Only enter a payment after funds are received" close={()=>setPaymentDraft(null)}>
   <form className="fs-form" onSubmit={savePayment}>
    <label>Invoice<select required value={paymentDraft.invoice_number} onChange={e=>setPaymentDraft({...paymentDraft,invoice_number:e.target.value})}><option value="">Select an unpaid invoice</option>{openInvoices.map(i=><option key={i.number} value={i.number}>#{i.number} — {money(i.balance)} outstanding</option>)}</select></label>
    <div className="fs-form-two"><label>Amount received (INR)<input required type="number" step=".01" min=".01" value={paymentDraft.amount} onChange={e=>setPaymentDraft({...paymentDraft,amount:e.target.value})}/></label><label>Date received<input required type="date" value={paymentDraft.paid_on} onChange={e=>setPaymentDraft({...paymentDraft,paid_on:e.target.value})}/></label></div>
    <div className="fs-form-two"><label>Method<select value={paymentDraft.method} onChange={e=>setPaymentDraft({...paymentDraft,method:e.target.value as TrackerPayment["method"]})}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label><label>Reference<input value={paymentDraft.reference} onChange={e=>setPaymentDraft({...paymentDraft,reference:e.target.value})}/></label></div>
    <label>Notes<textarea rows={3} value={paymentDraft.notes} onChange={e=>setPaymentDraft({...paymentDraft,notes:e.target.value})}/></label>
    <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setPaymentDraft(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">Record payment</button></div>
   </form>
  </Dialog>}
  {invoiceDraft&&<Dialog title="Create invoice" subtitle="Select work, choose a client and confirm the total" close={()=>setInvoiceDraft(null)}>
   <form className="fs-form" onSubmit={createInvoice}>
    <div className="fs-form-two"><label>Invoice number<input autoFocus required value={invoiceDraft.number} onChange={e=>setInvoiceDraft({...invoiceDraft,number:e.target.value})}/></label><label>Issue date<input required type="date" value={invoiceDraft.date} onChange={e=>setInvoiceDraft({...invoiceDraft,date:e.target.value})}/></label></div>
    <div className="fs-checklist-title">Choose uninvoiced work <small>{invoiceDraft.rowIds.length} selected</small></div>
    <div className="fs-checklist">{unbilled.length?unbilled.map(r=><label key={r.id}><input type="checkbox" checked={invoiceDraft.rowIds.includes(r.id)} onChange={e=>setInvoiceDraft({...invoiceDraft,rowIds:e.target.checked?[...invoiceDraft.rowIds,r.id]:invoiceDraft.rowIds.filter(x=>x!==r.id)})}/><span><strong>{titleFromSource(r.project_name)}</strong><small>{clientLabel(r.client_id)}</small></span><b>{money(r.amount)}</b></label>):<p>No work is available. Add uninvoiced work first.</p>}</div>
    <label>Invoice total (INR)<input type="number" min="0" step=".01" value={invoiceDraft.total} onChange={e=>setInvoiceDraft({...invoiceDraft,total:e.target.value})} placeholder="Automatic from selected work"/></label>
    <div className="fs-inline-help">Selected priced items: {money(sum(rows.filter(r=>invoiceDraft.rowIds.includes(r.id)).map(r=>Number(r.amount??0))))}. Missing prices require an explicit total.</div>
    <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setInvoiceDraft(null)}>Cancel</button><button disabled={working||!invoiceDraft.rowIds.length} className="fs-button fs-button-primary">Create invoice</button></div>
   </form>
  </Dialog>}
  {selected&&<Dialog title={"Invoice "+selected.number} subtitle={invoiceClient(selected)+" · "+dateLabel(selected.date)} close={()=>setSelectedInvoice(null)}>
   <div className="fs-invoice-detail">
    <div className="fs-invoice-detail-stats"><div><span>INVOICE TOTAL</span><strong>{money(selected.total)}</strong></div><div><span>REMAINING</span><strong>{money(selected.balance)}</strong></div></div>
    <div className="fs-invoice-facts"><div><span>Status</span><Status tone={selected.balance===0?"success":"warn"}>{selected.balance===0?"Paid":selected.paid>0?"Part paid":"Unpaid"}</Status></div><div><span>Issue date</span><strong>{dateLabel(selected.date)}</strong></div><div><span>Paid / settled</span><strong>{money(selected.paid)}</strong></div>{selected.sourceSettled&&<div><span>Opening status</span><strong>Marked paid {selected.sourcePaidOn?"on "+dateLabel(selected.sourcePaidOn):"— date not provided"}</strong></div>}</div>
    <h3>Line items</h3>{selected.rows.map(r=><div className="fs-invoice-item" key={r.id}><div><strong>{titleFromSource(r.project_name)}</strong><small>{r.assigned_by||"No POC provided"}</small></div><strong>{money(r.amount)}</strong></div>)}
    {Math.abs(selected.discrepancy)>.001&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Work items add to {money(selected.lineTotal)}, but invoice total is {money(selected.total)}. Review before issuing a document.</div>}
    {selected.document&&<div className="fs-alert fs-alert-note"><FileText size={17}/>Opening records mention {selected.document}. A generated PDF is not the original uploaded invoice.</div>}
    <div className="fs-form-actions"><a className="fs-button" href={pdfUrl(selected.number)} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={16}/>Generate PDF</a><span className="fs-flex"/>{selected.balance>0&&<button className="fs-button fs-button-primary" onClick={()=>{setSelectedInvoice(null);setPaymentDraft({...newPayment(),invoice_number:selected.number})}}><Plus size={16}/>Record payment</button>}</div>
   </div>
  </Dialog>}
  {organisationDraft&&<Dialog title="Organisation details" subtitle="Used in your generated financial documents" close={()=>setOrganisationDraft(null)}>
   <form className="fs-form" onSubmit={saveOrganisation}><div className="fs-locked-name"><label>Organisation<input value={organisationDraft.name} disabled/></label><Status tone={organisationDraft.status==="dissolved"?"warn":"success"}>{organisationDraft.status}</Status></div>
    <label>Legal / invoice name<input value={organisationDraft.legal_name??""} onChange={e=>setOrganisationDraft({...organisationDraft,legal_name:e.target.value})}/></label>
    <div className="fs-form-two"><label>Email<input type="email" value={organisationDraft.email??""} onChange={e=>setOrganisationDraft({...organisationDraft,email:e.target.value})}/></label><label>Phone<input type="tel" value={organisationDraft.phone??""} onChange={e=>setOrganisationDraft({...organisationDraft,phone:e.target.value})}/></label></div>
    <label>Business address<textarea rows={3} value={organisationDraft.address??""} onChange={e=>setOrganisationDraft({...organisationDraft,address:e.target.value})}/></label>
    <div className="fs-form-two"><label>GSTIN<input value={organisationDraft.gstin??""} onChange={e=>setOrganisationDraft({...organisationDraft,gstin:e.target.value})}/></label><label>PAN<input value={organisationDraft.pan??""} onChange={e=>setOrganisationDraft({...organisationDraft,pan:e.target.value})}/></label></div>
    <label>Bank name<input value={organisationDraft.bank_name??""} onChange={e=>setOrganisationDraft({...organisationDraft,bank_name:e.target.value})}/></label>
    <div className="fs-form-two"><label>Account number<input value={organisationDraft.bank_account??""} onChange={e=>setOrganisationDraft({...organisationDraft,bank_account:e.target.value})}/></label><label>IFSC<input value={organisationDraft.bank_ifsc??""} onChange={e=>setOrganisationDraft({...organisationDraft,bank_ifsc:e.target.value})}/></label></div>
    <label>New invoice prefix<input value={organisationDraft.invoice_prefix||""} onChange={e=>setOrganisationDraft({...organisationDraft,invoice_prefix:e.target.value})} placeholder="INV-"/></label>
    <label>Invoice footer<textarea rows={2} value={organisationDraft.invoice_footer??""} onChange={e=>setOrganisationDraft({...organisationDraft,invoice_footer:e.target.value})}/></label>
    <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setOrganisationDraft(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">Save details</button></div>
   </form>
  </Dialog>}
 </div>;
}
