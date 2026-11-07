"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {
 LayoutDashboard,BriefcaseBusiness,ReceiptText,Wallet,UsersRound,Files,ChartNoAxesColumn,
 Settings2,Search,Plus,ChevronRight,ChevronDown,ArrowDownToLine,ArrowUpRight,
 X,LogOut,RefreshCw,AlertCircle,CheckCircle2,FileText,Menu,Trash2,PenLine,
 ShieldCheck,ExternalLink,UploadCloud,MoreHorizontal,Building2,CalendarDays,
 Check,FilePlus2,Clock3,Filter,ListFilter,LockKeyhole,Eye,EyeOff,ArrowRight
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
type InvoiceLine={description:string;quantity:string;rate:string};
type InvoiceDraft={number:string;date:string;dueDate:string;clientId:string;taxRate:string;notes:string;rowIds:string[];lineItems:InvoiceLine[]};
type InvoiceEdit={number:string;date:string;dueDate:string;notes:string;status:"Draft"|"Sent"};
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
 const [balanceVisible,setBalanceVisible]=useState(true);
 const [workDraft,setWorkDraft]=useState<WorkDraft|null>(null),[clientDraft,setClientDraft]=useState<ClientDraft|null>(null);
 const [paymentDraft,setPaymentDraft]=useState<PaymentDraft|null>(null),[invoiceDraft,setInvoiceDraft]=useState<InvoiceDraft|null>(null);
 const [selectedInvoice,setSelectedInvoice]=useState<string|null>(null);
 const [invoiceEdit,setInvoiceEdit]=useState<InvoiceEdit|null>(null);
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
 const issuedInvoices=invoices.filter(i=>i.sourceStatus!=="Draft");
 const draftCount=invoices.length-issuedInvoices.length;
 const invoiced=sum(issuedInvoices.map(i=>i.total));
 const collected=sum(issuedInvoices.map(i=>i.paid));
 const outstanding=sum(issuedInvoices.map(i=>i.balance));
 const openInvoices=issuedInvoices.filter(i=>i.balance>0);
 const unbilled=rows.filter(x=>!x.invoice_number&&x.work_status!=="archived");
 const q=search.toLowerCase().trim();
 const selected=selectedInvoice?invoices.find(i=>i.number===selectedInvoice):null;
 const draftSubtotal=invoiceDraft?sum([
  ...rows.filter(r=>invoiceDraft.rowIds.includes(r.id)).map(r=>Number(r.amount??0)),
  ...invoiceDraft.lineItems.filter(x=>x.description.trim()).map(x=>Number(x.quantity||0)*Number(x.rate||0))
 ]):0;
 const draftTax=invoiceDraft?Math.round(draftSubtotal*Number(invoiceDraft.taxRate||0))/100:0;
 const draftTotal=draftSubtotal+draftTax;
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
  const date=localDate(),due=new Date(date+"T00:00:00Z");due.setUTCDate(due.getUTCDate()+14);
   setInvoiceDraft({number:activeOrg?.invoice_prefix?activeOrg.invoice_prefix+next:next,date,dueDate:due.toISOString().slice(0,10),
    clientId:clients.length===1?clients[0].id:"",taxRate:"0",notes:"",rowIds:[],lineItems:[{description:"",quantity:"1",rate:""}]});
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
  const d=invoiceDraft,chosenWork=rows.filter(r=>d.rowIds.includes(r.id));
  const lines=d.lineItems.filter(x=>x.description.trim()||x.rate.trim());
  if(!d.clientId){setError("Choose a client before creating an invoice.");return}
  if(!/^[a-zA-Z0-9-]{1,48}$/.test(d.number.trim())){setError("Use letters, numbers or hyphens in the invoice number.");return}
  if(!chosenWork.length&&!lines.length){setError("Add at least one line item or select unbilled work.");return}
  if(chosenWork.some(r=>r.amount==null||r.client_id&&r.client_id!==d.clientId)){
   setError("Selected work must have a price and belong to the selected client.");return
  }
  if(lines.some(x=>x.description.trim().length<2||!amountValid(x.quantity)||Number(x.quantity)===0||!amountValid(x.rate))){
   setError("All invoice items require a description, positive quantity and rate.");return
  }
  const tax=Number(d.taxRate);
  if(!Number.isFinite(tax)||tax<0||tax>100||!Number.isFinite(draftTotal)){
   setError("The tax rate must be between 0 and 100%.");return
  }
  if(d.dueDate&&d.dueDate<d.date){setError("Due date cannot precede issue date.");return}
  await mutation(async()=>{
   const {error}=await supabase.rpc("tracker_compose_and_mark_invoice",{
    p_organization_id:organizationId,p_client_id:d.clientId,p_number:d.number.trim(),
    p_date:d.date,p_due_date:d.dueDate||null,p_tax_rate:tax,p_notes:d.notes.trim(),
    p_items:lines.map(x=>({description:x.description.trim(),quantity:Number(x.quantity),rate:Number(x.rate)})),
    p_work_ids:d.rowIds
   });ensure(error);
  },"Invoice created. Review or generate its PDF.",()=>setInvoiceDraft(null));
 }
 async function editInvoice(e:FormEvent){
  e.preventDefault();if(!invoiceEdit)return;
  const d=invoiceEdit;
  if(d.dueDate&&d.dueDate<d.date){setError("Due date must follow issue date.");return}
  await mutation(async()=>{
   const {error}=await supabase.rpc("tracker_edit_invoice",{
    p_organization_id:organizationId,p_number:d.number,p_issue_date:d.date,
    p_due_date:d.dueDate||null,p_notes:d.notes.trim(),p_status:d.status
   });ensure(error);
  },"Invoice details saved.",()=>setInvoiceEdit(null));
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
 const invoiceVisible=invoices.filter(i=>{
  if(filter==="open"&&(i.sourceStatus==="Draft"||i.balance<=0))return false;
  if(filter==="paid"&&(i.sourceStatus==="Draft"||i.balance>0))return false;
  if(filter==="draft"&&i.sourceStatus!=="Draft")return false;
  return !q||[i.number,invoiceClient(i),...i.rows.map(r=>r.project_name)].join(" ").toLowerCase().includes(q);
 });
 const invoiceStatus=(i:InvoiceGroup)=>i.sourceStatus==="Draft"?"Draft":i.balance<=0?"Paid":i.paid>0?"Part paid":i.dueDate&&i.dueDate<localDate()?"Overdue":"Unpaid";
 const invoiceTone=(i:InvoiceGroup):"neutral"|"success"|"warn"|"info"|"danger"=>i.sourceStatus==="Draft"?"neutral":i.balance<=0?"success":i.dueDate&&i.dueDate<localDate()?"danger":i.paid>0?"info":"warn";
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
     <span className="fs-crumb">{orgName}</span><ChevronRight className="fs-desktop-chevron" size={14}/>
     <div className="fs-mobile-org"><Building2 size={15}/><select aria-label="Switch organisation" value={organizationId} onChange={e=>setOrganisation(e.target.value)}>
      {organisations.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}
     </select><ChevronDown size={13}/></div><strong>{pageTitle}</strong></div>
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
     <div className="fs-page-heading fs-overview-heading"><div><p className="fs-eyebrow">FINANCE / OVERVIEW</p><h1>{orgName}</h1><p>Your billing and work at a glance.</p></div>
      <div className="fs-heading-actions"><button type="button" className="fs-button" onClick={()=>addWork()}><Plus size={16}/>New work</button><button type="button" className="fs-button fs-button-primary" onClick={openInvoiceForm}><ReceiptText size={16}/>Create invoice</button></div></div>
     <div className="fs-hero-layout">
      <section className="fs-balance-hero" aria-label="Outstanding balance"><div className="fs-balance-hero-top"><span><span className="fs-hero-pulse"/>OUTSTANDING BALANCE</span>
       <button type="button" aria-label={balanceVisible?"Hide outstanding balance":"Show outstanding balance"} aria-pressed={!balanceVisible} className="fs-balance-eye" onClick={()=>setBalanceVisible(v=>!v)}>{balanceVisible?<Eye size={18}/>:<EyeOff size={18}/>}</button></div>
       <strong className="fs-balance-amount">{balanceVisible?money(outstanding):"••••••"}</strong>
       <p>{openInvoices.length?openInvoices.length+" invoice"+(openInvoices.length===1?"":"s")+" awaiting payment":"No unpaid issued invoices"}</p>
       <div className="fs-hero-buttons"><button className="fs-hero-action" type="button" onClick={openInvoiceForm}><span><Plus size={19}/></span>Create invoice<ArrowRight size={16}/></button>
        <button className="fs-hero-action fs-hero-secondary" type="button" onClick={()=>setPaymentDraft(newPayment())}><Wallet size={17}/>Record payment</button></div>
       <div className="fs-hero-foot"><span><ShieldCheck size={14}/>Private workspace</span><span>INR · LIVE</span></div>
      </section>
      <div className="fs-hero-facts">
       <div className="fs-hero-fact"><div className="fs-hero-fact-heading"><span>Paid & settled</span><span className="fs-fact-icon fs-fact-green"><CheckCircle2 size={18}/></span></div><strong>{money(collected)}</strong><div className="fs-fact-bottom"><span>{issuedInvoices.length?Math.round(collected/Math.max(invoiced,1)*100):0}% of issued value</span><div className="fs-fact-progress"><span style={{width:(issuedInvoices.length?Math.min(100,collected/Math.max(invoiced,1)*100):0)+"%"}}/></div></div></div>
       <div className="fs-hero-fact"><div className="fs-hero-fact-heading"><span>Total issued</span><span className="fs-fact-icon"><ReceiptText size={18}/></span></div><strong>{money(invoiced)}</strong><div className="fs-fact-bottom"><span>{issuedInvoices.length} issued · {draftCount} drafts</span><ArrowRight size={16}/></div></div>
       <div className="fs-hero-fact"><div className="fs-hero-fact-heading"><span>Project activity</span><span className="fs-fact-icon"><BriefcaseBusiness size={18}/></span></div><strong>{rows.length} <small>projects</small></strong><div className="fs-fact-bottom"><span>{unbilled.length} not invoiced</span><ArrowRight size={16}/></div></div>
      </div>
     </div>
     {activeOrg?.status==="dissolved"&&<div className="fs-alert fs-alert-warn"><AlertCircle size={18}/>This organisation is dissolved. Historical records remain accessible.</div>}
     {rows.length===0&&clients.length===0?<div className="fs-welcome"><div className="fs-welcome-icon"><UploadCloud size={27}/></div><h2>Bring in your records.</h2><p>Import Excel or CSV data. Clients, projects and invoices are stored directly in this organisation, with no ongoing sheet connection.</p><button className="fs-button fs-button-primary" type="button" onClick={startImport}><UploadCloud size={17}/>Import your first file</button><small>Or add a client and create an invoice from scratch.</small></div>:<>
      <div className="fs-overview-sections">
       <Card title="Invoices to follow up" description="Issued invoices with an outstanding balance" action={<button className="fs-link" onClick={()=>navigate("invoices")}>See all <ArrowUpRight size={15}/></button>}>
        {openInvoices.length?openInvoices.slice(0,5).map(i=><button className="fs-overview-invoice" key={i.number} onClick={()=>setSelectedInvoice(i.number)}>
         <span className="fs-overview-invoice-icon"><ReceiptText size={18}/></span><span className="fs-overview-invoice-copy"><strong>{invoiceClient(i)}</strong><small>Invoice #{i.number} · {i.dueDate?"Due "+dateLabel(i.dueDate):"Issued "+dateLabel(i.date)}</small></span>
         <span className="fs-overview-invoice-right"><strong>{money(i.balance)}</strong><Status tone={invoiceTone(i)}>{invoiceStatus(i)}</Status></span><ChevronRight className="fs-overview-invoice-arrow" size={17}/></button>):<Empty title="All clear" description="No issued invoices are awaiting payment."/>}
       </Card>
       <Card title="Ready to invoice" description="Work that has not yet been billed" action={<button className="fs-link" onClick={()=>navigate("work")}>View work <ArrowUpRight size={15}/></button>}>
        {unbilled.length?unbilled.slice(0,5).map(r=><button className="fs-overview-invoice" key={r.id} onClick={()=>addWork(r)}>
         <span className="fs-overview-invoice-icon fs-overview-work-icon"><BriefcaseBusiness size={18}/></span><span className="fs-overview-invoice-copy"><strong>{titleFromSource(r.project_name)}</strong><small>{clientLabel(r.client_id)} · {r.assigned_by||"Not assigned"}</small></span>
         <span className="fs-overview-invoice-right"><strong>{money(r.amount)}</strong><small>Unbilled</small></span><ChevronRight className="fs-overview-invoice-arrow" size={17}/></button>):<Empty title="Everything billed" description="All current work is assigned to invoices."/>}
       </Card>
      </div>
      {snapshot?.reported_pending&&Math.abs(Number(snapshot.reported_pending)-outstanding)>0.01&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Opening balance: {money(snapshot.reported_pending)}. Current balance: {money(outstanding)}.</div>}
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
     <div className="fs-page-heading"><div><p className="fs-eyebrow">BILLING</p><h1>Invoices</h1><p>Every invoice, payment and balance, clearly organised.</p></div><div className="fs-heading-actions"><button className="fs-button" onClick={downloadInvoices}><ArrowDownToLine size={16}/>Export</button><button className="fs-button fs-button-primary" onClick={openInvoiceForm}><Plus size={16}/>New invoice</button></div></div>
     <div className="fs-invoice-summary"><div className="fs-invoice-summary-main"><span>Outstanding amount</span><strong>{money(outstanding)}</strong><small>{openInvoices.length} issued invoices to follow up</small></div><div className="fs-invoice-summary-side"><div><span>Paid & settled</span><strong>{money(collected)}</strong></div><div><span>Invoices</span><strong>{invoices.length} <small>· {draftCount} drafts</small></strong></div></div></div>
     <div className="fs-invoices-toolbar"><div className="fs-segments fs-invoice-filters" role="group" aria-label="Filter invoices">
      {([["all","All"],["open","Open"],["paid","Paid"],["draft","Drafts"]] as const).map(([key,name])=><button type="button" key={key} className={filter===key?"active":""} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{name}<span>{key==="all"?invoices.length:key==="open"?openInvoices.length:key==="paid"?issuedInvoices.filter(i=>i.balance<=0).length:draftCount}</span></button>)}
     </div><label className="fs-search"><Search size={17}/><input aria-label="Search invoices" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoice or client"/></label></div>
     {invoiceVisible.length?<div className="fs-invoice-grid">{invoiceVisible.map(i=>{
      const percent=i.total>0?Math.min(100,Math.round(i.paid/i.total*100)):0;
      return <button type="button" className="fs-invoice-tile" key={i.number} onClick={()=>setSelectedInvoice(i.number)} aria-label={"Open invoice "+i.number+" for "+invoiceClient(i)}>
       <div className="fs-invoice-tile-top"><span className="fs-invoice-tile-icon"><ReceiptText size={20}/></span><Status tone={invoiceTone(i)}>{invoiceStatus(i)}</Status></div>
       <div className="fs-invoice-tile-client">{invoiceClient(i)}</div><div className="fs-invoice-tile-id">Invoice #{i.number}</div>
       <div className="fs-invoice-tile-amount">{money(i.total)}</div>
       <div className="fs-invoice-tile-track" aria-label={percent+" percent paid"}><span style={{width:percent+"%"}}/></div>
       <div className="fs-invoice-tile-foot"><span>{i.dueDate?"Due "+dateLabel(i.dueDate):"Issued "+dateLabel(i.date)}</span><strong>{i.sourceStatus==="Draft"?"Not issued":i.balance===0?"Fully paid":money(i.balance)+" due"}</strong></div>
      </button>;
     })}</div>:<div className="fs-card"><Empty title={q||filter!=="all"?"No matching invoices":"No invoices yet"} description={q||filter!=="all"?"Try another search or filter.":"Create your first invoice or import existing records."} action={!q&&filter==="all"?<button className="fs-button fs-button-primary" onClick={openInvoiceForm}><Plus size={16}/>Create invoice</button>:undefined}/></div>}
    </>}
    {view==="payments"&&<>
     <div className="fs-page-heading"><div><p className="fs-eyebrow">RECEIVABLES</p><h1>Payments</h1><p>Separate historical paid status from newly recorded transactions.</p></div><button className="fs-button fs-button-primary" onClick={()=>setPaymentDraft(newPayment())}><Plus size={16}/>Record payment</button></div>
     <div className="fs-metrics fs-metrics-two"><Metric label="Paid / settled" value={money(collected)} detail="Includes paid invoices in the opening workbook" icon={CheckCircle2}/><Metric label="Remaining" value={money(outstanding)} detail={openInvoices.length+" unpaid invoices"} icon={Wallet} emphasis/></div>
     <div className="fs-panels-two">
      <Card title="Recorded transactions" description="New payments entered with real dates and methods" action={<button className="fs-link" onClick={()=>saveCsv(slug(orgName)+"-payments.csv",[["Invoice","Amount","Date","Method","Reference"],...payments.map(p=>[p.invoice_number,p.amount,p.paid_on,p.method,p.reference])])}><ArrowDownToLine size={16}/>CSV</button>}>
       {paymentsVisible.length?paymentsVisible.map(p=><div className="fs-list-row fs-list-static" key={p.id}><span className="fs-row-icon"><Wallet size={17}/></span><span className="fs-row-main"><strong>Invoice {p.invoice_number}</strong><small>{dateLabel(p.paid_on)} · {p.method.replaceAll("_"," ")}{p.reference?" · "+p.reference:""}</small></span><span className="fs-row-money">{money(p.amount)}</span><a className="fs-icon" title="Download receipt" aria-label={"Receipt for invoice "+p.invoice_number} href={"/api/payments/"+encodeURIComponent(p.id)+"/receipt?org="+encodeURIComponent(organizationId)} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={17}/></a><button className="fs-icon fs-danger-hover" aria-label="Remove payment" onClick={()=>void deletePayment(p.id)}><Trash2 size={16}/></button></div>):
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
   <button type="button" onClick={()=>navigate("overview")} aria-current={view==="overview"?"page":undefined} className={view==="overview"?"active":""}><LayoutDashboard size={20}/><span>Home</span></button>
   <button type="button" onClick={()=>navigate("invoices")} aria-current={view==="invoices"?"page":undefined} className={view==="invoices"?"active":""}><ReceiptText size={20}/><span>Invoices</span></button>
   <button type="button" className="fs-mobile-create" aria-label="Create invoice" onClick={openInvoiceForm}><Plus size={23}/></button>
   <button type="button" onClick={()=>navigate("work")} aria-current={view==="work"?"page":undefined} className={view==="work"?"active":""}><BriefcaseBusiness size={20}/><span>Work</span></button>
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
  {invoiceDraft&&<Dialog title="Create invoice" subtitle="Create a client-ready invoice with custom or existing work." close={()=>setInvoiceDraft(null)}>
    <form className="fs-form" onSubmit={createInvoice}>
     {!clients.length&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Add a client first. <button type="button" className="fs-link" onClick={()=>{setInvoiceDraft(null);addClient()}}>Create client</button></div>}
     <label>Bill to<select required value={invoiceDraft.clientId} onChange={e=>setInvoiceDraft({...invoiceDraft,clientId:e.target.value,rowIds:[]})}>
      <option value="">Choose a client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
     </select></label>
     <div className="fs-form-two"><label>Invoice number<input required autoFocus maxLength={48} pattern="[a-zA-Z0-9-]+" value={invoiceDraft.number} onChange={e=>setInvoiceDraft({...invoiceDraft,number:e.target.value})}/></label>
      <label>Issue date<input required type="date" value={invoiceDraft.date} onChange={e=>setInvoiceDraft({...invoiceDraft,date:e.target.value})}/></label></div>
     <label>Payment due<input type="date" value={invoiceDraft.dueDate} onChange={e=>setInvoiceDraft({...invoiceDraft,dueDate:e.target.value})}/></label>
     <div className="fs-checklist-title">Invoice line items <small>{invoiceDraft.lineItems.length} rows</small></div>
     <div className="fs-line-editor">{invoiceDraft.lineItems.map((line,i)=><div className="fs-line-editor-row" key={i}>
      <label>Item description<input maxLength={500} value={line.description} placeholder="Video editing, design service…" onChange={e=>setInvoiceDraft({...invoiceDraft,lineItems:invoiceDraft.lineItems.map((x,k)=>k===i?{...x,description:e.target.value}:x)})}/></label>
      <label>Quantity<input type="number" min=".001" step=".001" value={line.quantity} onChange={e=>setInvoiceDraft({...invoiceDraft,lineItems:invoiceDraft.lineItems.map((x,k)=>k===i?{...x,quantity:e.target.value}:x)})}/></label>
      <label>Rate (₹)<input type="number" min="0" step=".01" placeholder="0" value={line.rate} onChange={e=>setInvoiceDraft({...invoiceDraft,lineItems:invoiceDraft.lineItems.map((x,k)=>k===i?{...x,rate:e.target.value}:x)})}/></label>
      <button type="button" className="fs-icon fs-danger-hover" aria-label={"Remove line "+(i+1)} onClick={()=>setInvoiceDraft({...invoiceDraft,lineItems:invoiceDraft.lineItems.filter((_,k)=>k!==i)})}><Trash2 size={17}/></button>
     </div>)}
     <button type="button" className="fs-button fs-button-small" onClick={()=>setInvoiceDraft({...invoiceDraft,lineItems:[...invoiceDraft.lineItems,{description:"",quantity:"1",rate:""}]})}><Plus size={15}/>Add line item</button></div>
     <div className="fs-checklist-title">Include existing unbilled work <small>{invoiceDraft.rowIds.length} selected</small></div>
     <div className="fs-checklist">{unbilled.filter(r=>!r.client_id||r.client_id===invoiceDraft.clientId).length?
      unbilled.filter(r=>!r.client_id||r.client_id===invoiceDraft.clientId).map(r=><label key={r.id}>
       <input type="checkbox" disabled={!invoiceDraft.clientId||r.amount===null} checked={invoiceDraft.rowIds.includes(r.id)}
        onChange={e=>setInvoiceDraft({...invoiceDraft,rowIds:e.target.checked?[...invoiceDraft.rowIds,r.id]:invoiceDraft.rowIds.filter(x=>x!==r.id)})}/>
       <span><strong>{titleFromSource(r.project_name)}</strong><small>{r.amount===null?"Set a price first":clientLabel(r.client_id)}</small></span>
       <b>{money(r.amount)}</b></label>):
      <p>No unbilled work for this client. Create an invoice from the new line items above.</p>}</div>
     <div className="fs-form-two"><label>Tax rate (%)<input type="number" min="0" max="100" step=".01" value={invoiceDraft.taxRate} onChange={e=>setInvoiceDraft({...invoiceDraft,taxRate:e.target.value})}/></label>
      <div className="fs-invoice-total"><small>GRAND TOTAL</small><strong>{money(draftTotal)}</strong><span>{money(draftSubtotal)} + {money(draftTax)} tax</span></div></div>
     <label>Invoice notes<textarea rows={3} value={invoiceDraft.notes} onChange={e=>setInvoiceDraft({...invoiceDraft,notes:e.target.value})} placeholder="Payment terms, purchase order or delivery notes"/></label>
     <div className="fs-inline-help">Created invoices begin as drafts. Legal, address and bank fields are taken from organisation settings.</div>
     <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setInvoiceDraft(null)}>Cancel</button>
      <button disabled={working||!invoiceDraft.clientId||(!invoiceDraft.rowIds.length&&!invoiceDraft.lineItems.some(x=>x.description.trim()))} className="fs-button fs-button-primary">{working?"Creating…":"Create invoice"}</button></div>
    </form>
   </Dialog>}
{selected&&<Dialog title={"Invoice "+selected.number} subtitle={invoiceClient(selected)+" · "+dateLabel(selected.date)} close={()=>setSelectedInvoice(null)}>
   <div className="fs-invoice-detail">
    <div className="fs-invoice-detail-stats"><div><span>INVOICE TOTAL</span><strong>{money(selected.total)}</strong></div><div><span>REMAINING</span><strong>{money(selected.balance)}</strong></div></div>
    <div className="fs-invoice-facts"><div><span>Status</span><Status tone={selected.sourceStatus==="Draft"?"neutral":selected.balance===0?"success":"warn"}>{selected.sourceStatus==="Draft"?"Draft":selected.balance===0?"Paid":selected.paid>0?"Part paid":"Unpaid"}</Status></div><div><span>Issue date</span><strong>{dateLabel(selected.date)}</strong></div>
     {selected.dueDate&&<div><span>Due date</span><strong>{dateLabel(selected.dueDate)}</strong></div>}
     {selected.taxRate>0&&<div><span>Tax ({selected.taxRate}%)</span><strong>{money(selected.taxAmount)}</strong></div>}
     <div><span>Paid / settled</span><strong>{money(selected.paid)}</strong></div>{selected.sourceSettled&&<div><span>Opening status</span><strong>Marked paid {selected.sourcePaidOn?"on "+dateLabel(selected.sourcePaidOn):"— date not provided"}</strong></div>}</div>
    <h3>Line items</h3>{selected.rows.map(r=><div className="fs-invoice-item" key={r.id}><div><strong>{titleFromSource(r.project_name)}</strong><small>{r.assigned_by||"No POC provided"}</small></div><strong>{money(r.amount)}</strong></div>)}
    {Math.abs(selected.discrepancy)>.001&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Work items add to {money(selected.lineTotal)}, but invoice total is {money(selected.total)}. Review before issuing a document.</div>}
    {selected.document&&<div className="fs-alert fs-alert-note"><FileText size={17}/>Opening records mention {selected.document}. A generated PDF is not the original uploaded invoice.</div>}
    {selected.publicNotes&&<div className="fs-alert fs-alert-note"><FileText size={17}/>{selected.publicNotes}</div>}
    {selected.sourceStatus==="Draft"&&<div className="fs-alert fs-alert-note"><LockKeyhole size={17}/>This is a draft. Review the PDF, then change the invoice status to Sent before recording payment.</div>}
    <div className="fs-form-actions">
     {selected.rows.some(r=>r.invoice_created_in_app)&&selected.balance>0&&<button className="fs-button" onClick={()=>{
      setInvoiceEdit({number:selected.number,date:selected.date||localDate(),dueDate:selected.dueDate||"",notes:selected.publicNotes||"",status:selected.sourceStatus==="Sent"?"Sent":"Draft"});
      setSelectedInvoice(null);
     }}><PenLine size={15}/>Edit</button>}
     <a className="fs-button" href={pdfUrl(selected.number)} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={16}/>Generate PDF</a><span className="fs-flex"/>{selected.sourceStatus!=="Draft"&&selected.balance>0&&<button className="fs-button fs-button-primary" onClick={()=>{setSelectedInvoice(null);setPaymentDraft({...newPayment(),invoice_number:selected.number})}}><Plus size={16}/>Record payment</button>}</div>
   </div>
  </Dialog>}
  {invoiceEdit&&<Dialog title={"Edit invoice "+invoiceEdit.number} subtitle="Update dates, notes and delivery status" close={()=>setInvoiceEdit(null)}>
    <form className="fs-form" onSubmit={editInvoice}>
     <div className="fs-form-two"><label>Issue date<input type="date" required value={invoiceEdit.date} onChange={e=>setInvoiceEdit({...invoiceEdit,date:e.target.value})}/></label>
      <label>Due date<input type="date" value={invoiceEdit.dueDate} onChange={e=>setInvoiceEdit({...invoiceEdit,dueDate:e.target.value})}/></label></div>
     <label>Invoice status<select value={invoiceEdit.status} onChange={e=>setInvoiceEdit({...invoiceEdit,status:e.target.value as "Draft"|"Sent"})}><option value="Draft">Draft</option><option value="Sent">Sent (delivered separately)</option></select></label>
     <label>Public invoice notes<textarea rows={3} value={invoiceEdit.notes} onChange={e=>setInvoiceEdit({...invoiceEdit,notes:e.target.value})}/></label>
     <div className="fs-inline-help">Setting the status to Sent records the change. It does not send an email.</div>
     <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setInvoiceEdit(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">{working?"Saving…":"Save invoice"}</button></div>
    </form>
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
