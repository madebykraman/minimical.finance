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
type PaymentDraft={id?:string;invoice_number:string;amount:string;paid_on:string;method:TrackerPayment["method"];reference:string;notes:string};
type InvoiceLine={description:string;quantity:string;rate:string};
type InvoiceDraft={number:string;date:string;dueDate:string;clientId:string;taxRate:string;notes:string;rowIds:string[];lineItems:InvoiceLine[]};
type InvoiceEdit={number:string;date:string;dueDate:string;notes:string;status:"Draft"|"Sent";
 clientId:string;taxRate:string;items:(InvoiceLine&{id?:string})[]};
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
function Dialog({title,subtitle,close,children,wide=false}:{title:string;subtitle?:string;close:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 const closeRef=useRef(close);
 useEffect(()=>{closeRef.current=close},[close]);
 useEffect(()=>{
  const before=document.activeElement as HTMLElement|null;
  const key=(e:KeyboardEvent)=>{
   if(e.key==="Escape")closeRef.current();
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
 },[]);
 return <div className="fs-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
  <section className={"fs-dialog"+(wide?" fs-dialog-wide":"")} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
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
 const [pdfBusy,setPdfBusy]=useState<string|null>(null);
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
 const editSubtotal=invoiceEdit?sum(invoiceEdit.items.map(x=>(Number(x.quantity)||0)*(Number(x.rate)||0))):0;
 const editTax=invoiceEdit?Math.round(editSubtotal*Number(invoiceEdit.taxRate||0))/100:0;
 const editTotal=editSubtotal+editTax;
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
   const {data,error}=d.id?await supabase.from("tracker_rows").update(value)
     .eq("id",d.id).eq("organization_id",organizationId).select("id").maybeSingle():
    await supabase.from("tracker_rows").insert({...value,organization_id:organizationId,snapshot_id:snapshot.id,
     row_order:Math.max(0,...rows.map(r=>r.row_order))+1,from_source_pdf:false,source_kind:"created_in_app"}).select("id").maybeSingle();
   ensure(error);if(!data)throw new Error("Work was not saved to the selected organisation.");
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
   const {data:result,error}=d.id?await supabase.from("tracker_clients").update(data)
      .eq("id",d.id).eq("organization_id",organizationId).select("id").maybeSingle():
     await supabase.from("tracker_clients").insert({...data,organization_id:organizationId,from_source_pdf:false}).select("id").maybeSingle();
   ensure(error);if(!result)throw new Error("Client was not saved to the selected organisation.");
  },d.id?"Client updated.":"Client added.",()=>setClientDraft(null));
 }
 async function savePayment(e:FormEvent){
  e.preventDefault();if(!paymentDraft)return;
  const d=paymentDraft,g=invoices.find(i=>i.number===d.invoice_number),n=Number(d.amount);
  const previous=d.id?payments.find(p=>p.id===d.id):null;
  const allowed=(g?.balance||0)+(previous?.invoice_number===d.invoice_number?Number(previous.amount):0);
  if(!g||g.sourceStatus==="Draft"||!Number.isFinite(n)||n<=0||n>allowed+.001){
   setError("Choose an issued invoice and an amount within its outstanding balance.");return;
  }
  await mutation(async()=>{
   const payload={invoice_number:d.invoice_number,amount:n,paid_on:d.paid_on,method:d.method,
    reference:d.reference.trim()||null,notes:d.notes.trim()||null};
   if(d.id){
    const {data,error}=await supabase.from("tracker_payments").update(payload)
     .eq("id",d.id).eq("organization_id",organizationId).select("id").maybeSingle();
    ensure(error);if(!data)throw new Error("Payment not found or not updated.");
   }else{
    const {data,error}=await supabase.from("tracker_payments").insert({...payload,organization_id:organizationId}).select("id").maybeSingle();
    ensure(error);if(!data)throw new Error("Payment was not created.");
   }
  },d.id?"Payment updated; its revision was recorded.":"Payment recorded.",()=>setPaymentDraft(null));
 }
 async function deletePayment(id:string){
  if(!window.confirm("Remove this payment? The invoice balance will increase."))return;
  await mutation(async()=>{
   const {data,error}=await supabase.from("tracker_payments").delete().eq("id",id).eq("organization_id",organizationId).select("id").maybeSingle();ensure(error);if(!data)throw new Error("Payment not found or not deleted.");
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
  if(!d.clientId){setError("Choose the client on this invoice.");return}
  if(d.dueDate&&d.dueDate<d.date){setError("Due date must follow issue date.");return}
  if(!d.items.length){setError("Every invoice needs at least one line item.");return}
  if(d.items.some(x=>x.description.trim().length<2||!amountValid(x.quantity)||Number(x.quantity)===0||!amountValid(x.rate))){
   setError("Each line needs a description, positive quantity and a valid rate.");return
  }
  if(!amountValid(d.taxRate)||Number(d.taxRate)>100||!Number.isFinite(editTotal)){
   setError("Tax must be between 0 and 100%.");return
  }
  await mutation(async()=>{
   const {error}=await supabase.rpc("tracker_revise_invoice",{
    p_organization_id:organizationId,p_number:d.number,p_client_id:d.clientId,
    p_issue_date:d.date,p_due_date:d.dueDate||null,p_tax_rate:Number(d.taxRate),
    p_notes:d.notes.trim(),p_status:d.status,
    p_items:d.items.map(x=>({...(x.id?{id:x.id}:{}),description:x.description.trim(),
     quantity:Number(x.quantity),rate:Number(x.rate)}))
   });ensure(error);
  },"Invoice, lines and totals updated.",()=>setInvoiceEdit(null));
 }
 async function saveOrganisation(e:FormEvent){
  e.preventDefault();if(!organisationDraft)return;
  const d=organisationDraft;
  const payload={legal_name:d.legal_name?.trim()||null,email:d.email?.trim()||null,phone:d.phone?.trim()||null,
   address:d.address?.trim()||null,gstin:d.gstin?.trim()||null,pan:d.pan?.trim()||null,
   bank_name:d.bank_name?.trim()||null,bank_account:d.bank_account?.trim()||null,bank_ifsc:d.bank_ifsc?.trim()||null,
   invoice_prefix:d.invoice_prefix?.trim()||"",invoice_footer:d.invoice_footer?.trim()||null,updated_at:new Date().toISOString()};
  await mutation(async()=>{
   const {error,data}=await supabase.from("tracker_organizations").update(payload).eq("id",organizationId).select("id").maybeSingle();ensure(error);if(!data)throw new Error("Organisation was not updated.");
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

 async function downloadInvoicePdf(number:string){
  if(!organizationId)return;
  setPdfBusy(number);setError("");
  try{
   const response=await fetch(pdfUrl(number)+"&download=1",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok){
    const result=await response.json().catch(()=>({}));
    throw new Error(result.error||"PDF generation failed. Check your account and invoice details.");
   }
   if(!response.headers.get("content-type")?.includes("application/pdf"))
    throw new Error("The server did not return a PDF.");
   const blob=await response.blob();
   if(blob.size<100)throw new Error("The generated PDF is empty.");
   const url=URL.createObjectURL(blob),a=document.createElement("a");
   a.href=url;a.download="invoice-"+number+".pdf";
   document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),3000);
   flash("Invoice PDF generated.");
  }catch(e){setError(e instanceof Error?e.message:"Could not generate the PDF.")}
  finally{setPdfBusy(null)}
 }
 return <div className="fs-root v3-root">
  <aside className="v3-sidebar" aria-label="Workspace">
   <div className="v3-brand"><span>f.</span><div><strong>Finance</strong><small>YOUR WORKSPACE</small></div></div>
   <label className="v3-org-label" htmlFor="v3-org">ORGANISATION</label>
   <div className="v3-org-wrap"><Building2 size={17}/><select id="v3-org" value={organizationId} onChange={e=>setOrganisation(e.target.value)} aria-label="Select organisation">
    {organisations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
   </select><ChevronDown size={13}/></div>
   <nav className="v3-nav" aria-label="Primary navigation">
    {NAV.slice(0,4).map(({id,label,icon:Icon})=><button type="button" key={id} aria-current={view===id?"page":undefined}
     className={view===id?"active":""} onClick={()=>navigate(id)}><Icon size={19}/>{label}</button>)}
   </nav>
   <div className="v3-rail-bottom">
    <button type="button" className={"v3-more-button"+(NAV.slice(4).some(x=>x.id===view)?" active":"")} onClick={()=>setMenu(true)}><MoreHorizontal size={20}/>More tools<ChevronRight size={15}/></button>
    <div className="v3-member"><span>{email.slice(0,1).toUpperCase()}</span><div><strong>Private workspace</strong><small title={email}>{email}</small></div></div>
   </div>
  </aside>
  <div className="v3-main">
   <header className="v3-header">
    <div className="v3-header-left"><span className="v3-header-page">{pageTitle}</span>
     <label className="v3-mobile-org" aria-label="Switch organisation"><Building2 size={15}/><select value={organizationId} onChange={e=>setOrganisation(e.target.value)}>
      {organisations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
     </select><ChevronDown size={13}/></label>
    </div>
    <div className="v3-header-actions">
     <button className="v3-icon-button" type="button" title="Refresh" aria-label="Refresh records" disabled={loading||working} onClick={()=>{setLoading(true);void load()}}><RefreshCw size={17}/></button>
     {view==="invoices"&&<button type="button" className="v3-btn-primary" onClick={openInvoiceForm}><Plus size={17}/>New invoice</button>}
     {view==="work"&&<button type="button" className="v3-btn-primary" onClick={()=>addWork()}><Plus size={17}/>New work</button>}
     {view==="clients"&&<button type="button" className="v3-btn-primary" onClick={()=>addClient()}><Plus size={17}/>New client</button>}
     {view==="payments"&&<button type="button" className="v3-btn-primary" onClick={()=>setPaymentDraft(newPayment())}><Plus size={17}/>Record payment</button>}
     {view==="documents"&&<button type="button" className="v3-btn-primary" disabled={documentBusy} onClick={()=>documentInput.current?.click()}><UploadCloud size={17}/>{documentBusy?"Uploading…":"Upload file"}</button>}
    </div>
   </header>
   <main className="v3-content">
    {loading?<div className="v3-loading" role="status"><div className="fs-loader"/><p>Loading {orgName}…</p></div>:<>
     {view==="overview"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">OVERVIEW</p><h1>{orgName}</h1><p>Everything important, without the clutter.</p></div>
      {activeOrg?.status==="dissolved"&&<div className="v3-inline-note"><AlertCircle size={17}/>Dissolved organisation — past records can be reviewed and imported.</div>}
      <section className="v3-balance" aria-label="Outstanding invoices">
       <div className="v3-balance-head"><span>OUTSTANDING</span><button type="button" aria-label={balanceVisible?"Hide balance":"Show balance"} onClick={()=>setBalanceVisible(v=>!v)}>{balanceVisible?<Eye size={19}/>:<EyeOff size={19}/>}</button></div>
       <strong>{balanceVisible?money(outstanding):"••••••"}</strong>
       <div className="v3-balance-footer"><span>{openInvoices.length} invoices to collect · {money(collected)} settled</span><button type="button" onClick={openInvoiceForm}><Plus size={17}/>New invoice<ArrowRight size={16}/></button></div>
      </section>
      {clients.length===0&&rows.length===0?
       <section className="v3-empty-start"><div><UploadCloud size={25}/></div><h2>Your organisation is ready.</h2><p>Bring in existing records with one upload, or add your first client.</p><button className="v3-btn-primary" onClick={startImport}><UploadCloud size={16}/>Import spreadsheet</button><button className="v3-text-button" onClick={()=>addClient()}>Add a client manually</button></section>:
       <section className="v3-list-section"><div className="v3-list-heading"><div><h2>To collect</h2><p>Invoices that need attention</p></div><button onClick={()=>navigate("invoices")}>All invoices <ChevronRight size={16}/></button></div>
        {openInvoices.length?<div className="v3-list">{openInvoices.slice(0,5).map(i=><button type="button" className="v3-record" key={i.number} onClick={()=>setSelectedInvoice(i.number)}>
         <span className="v3-record-icon"><ReceiptText size={19}/></span><span className="v3-record-title"><strong>{invoiceClient(i)}</strong><small>#{i.number} · {i.dueDate?"Due "+dateLabel(i.dueDate):"Issued "+dateLabel(i.date)}</small></span>
         <span className="v3-record-end"><strong>{money(i.balance)}</strong><small>{invoiceStatus(i)}</small></span><ChevronRight size={17}/></button>)}</div>:
         <div className="v3-inline-empty"><CheckCircle2 size={22}/><strong>Nothing to collect</strong><span>All issued invoices are settled.</span></div>}
       </section>}
     </div>}
     {view==="invoices"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">BILLING</p><h1>Invoices</h1><p>{issuedInvoices.length} issued · {draftCount} drafts · {money(outstanding)} outstanding</p></div>
      <div className="v3-controls"><div className="v3-tabs" role="group" aria-label="Invoice filter">{([["all","All"],["open","Unpaid"],["paid","Paid"],["draft","Drafts"]] as const).map(([id,label])=><button type="button" key={id} className={filter===id?"active":""} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
       <label className="v3-search"><Search size={17}/><input aria-label="Find invoice" placeholder="Search invoices or clients" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      {invoiceVisible.length?<div className="v3-list">{invoiceVisible.map(i=><button type="button" className="v3-record" key={i.number} onClick={()=>setSelectedInvoice(i.number)}>
       <span className="v3-record-icon"><ReceiptText size={19}/></span><span className="v3-record-title"><strong>{invoiceClient(i)}</strong><small>#{i.number} · {dateLabel(i.date)}</small></span>
       <span className="v3-record-end"><strong>{money(i.total)}</strong><Status tone={invoiceTone(i)}>{invoiceStatus(i)}</Status></span><ChevronRight size={17}/></button>)}</div>:
       <div className="v3-inline-empty"><ReceiptText size={23}/><strong>No invoices here</strong><span>{q||filter!=="all"?"Try another filter or search.":"Create or import an invoice."}</span>{!q&&filter==="all"&&<button className="v3-btn-primary" onClick={openInvoiceForm}><Plus size={16}/>Create invoice</button>}</div>}
     </div>}
     {view==="work"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">PROJECTS</p><h1>Work</h1><p>{rows.length} work items · {unbilled.length} awaiting invoicing</p></div>
      <div className="v3-controls"><div className="v3-tabs" role="group" aria-label="Work filter">{([["all","All"],["unbilled","Unbilled"],["complete","Complete"]] as const).map(([id,label])=><button key={id} className={filter===id?"active":""} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
       <label className="v3-search"><Search size={17}/><input aria-label="Find work" placeholder="Search projects" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
      {workVisible.length?<div className="v3-list">{workVisible.map(r=><button type="button" className="v3-record" key={r.id} onClick={()=>addWork(r)}>
       <span className="v3-record-icon"><BriefcaseBusiness size={19}/></span><span className="v3-record-title"><strong>{titleFromSource(r.project_name)}</strong><small>{clientLabel(r.client_id)}{r.invoice_number?" · Invoice #"+r.invoice_number:""}</small></span>
       <span className="v3-record-end"><strong>{money(r.amount)}</strong><small>{r.work_status}</small></span><ChevronRight size={17}/></button>)}</div>:
       <div className="v3-inline-empty"><BriefcaseBusiness size={23}/><strong>No matching work</strong><span>Add work or change your filter.</span><button className="v3-btn-primary" onClick={()=>addWork()}><Plus size={16}/>New work</button></div>}
     </div>}
     {view==="clients"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">RELATIONSHIPS</p><h1>Clients</h1><p>{clients.length} clients in {orgName}</p></div>
      <label className="v3-search v3-single-search"><Search size={17}/><input aria-label="Find client" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a client"/></label>
      {clients.filter(c=>!q||[c.name,c.email,c.phone].join(" ").toLowerCase().includes(q)).length?<div className="v3-list">
       {clients.filter(c=>!q||[c.name,c.email,c.phone].join(" ").toLowerCase().includes(q)).map(c=><button className="v3-record" type="button" key={c.id} onClick={()=>addClient(c)}>
        <span className="v3-record-icon v3-client-icon"><UsersRound size={19}/></span><span className="v3-record-title"><strong>{c.name}</strong><small>{c.email||c.phone||"No contact details yet"}</small></span>
        <span className="v3-record-end"><small>{rows.filter(r=>r.client_id===c.id).length} work items</small></span><ChevronRight size={17}/></button>)}</div>:
       <div className="v3-inline-empty"><UsersRound size={23}/><strong>No clients found</strong><span>Import your records or create a client.</span><button className="v3-btn-primary" onClick={()=>addClient()}><Plus size={16}/>Add client</button></div>}
     </div>}
     {view==="payments"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">PAYMENTS</p><h1>Payment history</h1><p>Individual receipts and genuine payment dates</p></div>
      {payments.length?<div className="v3-list">{paymentsVisible.map(p=><div className="v3-record v3-static-record" key={p.id}>
       <span className="v3-record-icon v3-client-icon"><CheckCircle2 size={19}/></span><span className="v3-record-title"><strong>Invoice #{p.invoice_number}</strong><small>{dateLabel(p.paid_on)} · {p.method.replaceAll("_"," ")}</small></span>
       <span className="v3-record-end"><strong>{money(p.amount)}</strong></span>
       <button type="button" className="v3-icon-button" title="Edit payment" aria-label={"Edit payment for invoice "+p.invoice_number} onClick={()=>setPaymentDraft({
        id:p.id,invoice_number:p.invoice_number,amount:String(p.amount),paid_on:p.paid_on,
        method:p.method,reference:p.reference||"",notes:p.notes||""
       })}><PenLine size={16}/></button>
       <a className="v3-icon-button" title="Download receipt" aria-label={"Receipt for invoice "+p.invoice_number} href={"/api/payments/"+encodeURIComponent(p.id)+"/receipt?org="+encodeURIComponent(organizationId)} target="_blank" rel="noopener noreferrer"><ArrowDownToLine size={17}/></a>
       <button type="button" className="v3-icon-button" title="Remove payment" aria-label={"Remove payment "+p.id} onClick={()=>void deletePayment(p.id)}><Trash2 size={16}/></button>
      </div>)}</div>:<div className="v3-inline-empty"><Wallet size={23}/><strong>No recorded transactions</strong><span>Record a payment after money is received.</span></div>}
      <details className="v3-disclosure"><summary>Historical settlements from opening records <ChevronDown size={16}/></summary><div className="v3-list">{invoices.filter(i=>i.sourceSettled).map(i=><button className="v3-record" key={i.number} onClick={()=>setSelectedInvoice(i.number)}><span className="v3-record-title"><strong>Invoice #{i.number}</strong><small>{i.sourcePaidOn?dateLabel(i.sourcePaidOn):"Date not supplied"}</small></span><span className="v3-record-end"><strong>{money(i.total)}</strong></span><ChevronRight size={16}/></button>)}</div></details>
     </div>}
     {view==="documents"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">FILES</p><h1>Documents</h1><p>Private original files and generated invoices</p></div>
      <details className="v3-disclosure"><summary>Upload options <ChevronDown size={16}/></summary><div className="v3-upload-options">
       <label>Invoice<select value={documentInvoice} onChange={e=>setDocumentInvoice(e.target.value)}><option value="">No invoice</option>{invoices.map(i=><option key={i.number} value={i.number}>{i.number}</option>)}</select></label>
       <label>Client<select value={documentClient} onChange={e=>setDocumentClient(e.target.value)}><option value="">No client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
       <label className="fs-check"><input type="checkbox" disabled={!documentClient||activeOrg?.name!=="Kumar Aman"} checked={documentVisibility} onChange={e=>setDocumentVisibility(e.target.checked)}/>Share to enabled client portal</label>
      </div></details>
      {documents.length?<div className="v3-list">{documents.map(d=><div className="v3-record v3-static-record" key={d.id}><span className="v3-record-icon"><FileText size={19}/></span>
       <span className="v3-record-title"><strong>{d.file_name}</strong><small>{Math.round(d.size_bytes/1024)} KB · {d.visible_to_client?"Shared":"Private"}</small></span>
       <a className="v3-icon-button" href={"/api/documents/"+encodeURIComponent(d.id)} target="_blank" rel="noopener noreferrer" title="Open document" aria-label={"Open "+d.file_name}><ExternalLink size={17}/></a>
       <button className="v3-icon-button" title="Delete document" aria-label={"Delete "+d.file_name} onClick={()=>void deleteDocument(d.id)}><Trash2 size={16}/></button></div>)}</div>:
       <div className="v3-inline-empty"><Files size={23}/><strong>No uploaded documents</strong><span>Upload an existing PDF or image, or generate one from an invoice.</span></div>}
      <details className="v3-disclosure"><summary>Generate invoice PDFs <ChevronDown size={16}/></summary><div className="v3-list">{invoices.map(i=><button type="button" className="v3-record" key={i.number} disabled={pdfBusy===i.number} onClick={()=>void downloadInvoicePdf(i.number)}><span className="v3-record-title"><strong>Invoice #{i.number}</strong><small>{invoiceClient(i)}</small></span><span className="v3-record-end"><strong>{money(i.total)}</strong></span><ArrowDownToLine size={17}/></button>)}</div></details>
     </div>}
     {view==="reports"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">REPORTING</p><h1>Reports</h1><p>Current issued balances, separate from draft invoices</p></div>
      <div className="v3-report-summary"><div><span>Issued</span><strong>{money(invoiced)}</strong></div><div><span>Settled</span><strong>{money(collected)}</strong></div><div><span>Outstanding</span><strong>{money(outstanding)}</strong></div></div>
      <details className="v3-disclosure" open><summary>Invoice reconciliation <ChevronDown size={16}/></summary><div className="v3-list">{invoices.map(i=><button type="button" className="v3-record" key={i.number} onClick={()=>setSelectedInvoice(i.number)}><span className="v3-record-title"><strong>Invoice #{i.number}</strong><small>{Math.abs(i.discrepancy)>.001?"Difference: "+money(Math.abs(i.discrepancy)):"Line totals agree"}</small></span><span className="v3-record-end"><Status tone={Math.abs(i.discrepancy)>.001?"warn":"success"}>{Math.abs(i.discrepancy)>.001?"Review":"Match"}</Status></span><ChevronRight size={16}/></button>)}</div></details>
      <div className="v3-report-actions"><button className="v3-secondary-button" onClick={downloadInvoices}><ArrowDownToLine size={17}/>Export invoices CSV</button><button className="v3-secondary-button" onClick={downloadWork}><ArrowDownToLine size={17}/>Export work CSV</button></div>
      <details className="v3-disclosure"><summary>Import history <ChevronDown size={16}/></summary><div className="v3-list">{imports.map(b=><div className="v3-record v3-static-record" key={b.id}><span className="v3-record-title"><strong>{b.file_label}</strong><small>{dateLabel(b.created_at.slice(0,10))} · {b.imported_count} created · {b.updated_count} updated · {b.flagged_count} flagged</small></span></div>)}</div></details>
     </div>}
     {view==="settings"&&<div className="v3-page">
      <div className="v3-page-top"><p className="v3-kicker">PREFERENCES</p><h1>Settings</h1><p>Organisation identity and private access</p></div>
      <div className="v3-settings-card"><div><h2>{orgName}</h2><p>{activeOrg?.legal_name||"Legal name not configured"}</p><small>{activeOrg?.email||"No company email"} · {activeOrg?.status}</small></div>
       <button className="v3-secondary-button" onClick={()=>activeOrg&&setOrganisationDraft({...activeOrg})}><PenLine size={16}/>Edit details</button></div>
      <div className="v3-settings-card"><div><h2>Import data</h2><p>Upload an Excel, CSV or TSV file. No spreadsheet stays connected.</p></div><button className="v3-secondary-button" onClick={startImport}><UploadCloud size={17}/>Import</button></div>
      {activeOrg?.name==="Kumar Aman"&&<details className="v3-disclosure"><summary>Elle India client access <ChevronDown size={16}/></summary><form className="fs-form v3-settings-form" onSubmit={savePortal}>
       <label className="fs-check"><input type="checkbox" checked={portalEnabled} onChange={e=>setPortalEnabled(e.target.checked)}/>Enable the password-protected client portal</label>
       <label>New portal password<input type="password" minLength={12} autoComplete="new-password" value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder="At least 12 characters"/></label>
       <button className="v3-btn-primary" disabled={portalBusy}>{portalBusy?"Saving…":"Save portal settings"}</button>
      </form></details>}
      <button type="button" className="v3-signout" onClick={()=>void supabase.auth.signOut().then(()=>window.location.assign("/"))}><LogOut size={17}/>Sign out</button>
     </div>}
    </>}
   </main>
  </div>
  <input type="file" hidden ref={importInput} accept=".xlsx,.csv,.tsv" onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file)}}/>
  <input type="file" hidden ref={documentInput} accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadDocument(file)}}/>
  <nav className="v3-mobile-nav" aria-label="Mobile navigation">
   {NAV.slice(0,4).map(({id,label,icon:Icon})=><button key={id} aria-current={view===id?"page":undefined} className={view===id?"active":""} onClick={()=>navigate(id)}><Icon size={21}/><span>{id==="overview"?"Home":label}</span></button>)}
   <button type="button" className={NAV.slice(4).some(x=>x.id===view)?"active":""} onClick={()=>setMenu(true)}><MoreHorizontal size={21}/><span>More</span></button>
  </nav>
  {menu&&<div className="fs-backdrop v3-tools-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setMenu(false)}}><section className="v3-tools" role="dialog" aria-modal="true" aria-label="More tools">
   <div className="v3-tools-header"><strong>More tools</strong><button className="v3-icon-button" aria-label="Close tools" onClick={()=>setMenu(false)}><X size={19}/></button></div>
   {NAV.slice(4).map(({id,label,icon:Icon})=><button key={id} className={view===id?"active":""} onClick={()=>navigate(id)}><Icon size={20}/><span>{label}</span><ChevronRight size={15}/></button>)}
   <button onClick={()=>{setMenu(false);startImport()}}><UploadCloud size={20}/><span>Import a file</span><ChevronRight size={15}/></button>
  </section></div>}
  {error&&<div className="v3-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
  {toast&&<div className="v3-toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
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
  {paymentDraft&&<Dialog title={paymentDraft.id?"Edit payment":"Record payment"} subtitle="Record actual money received, with a verified date" close={()=>setPaymentDraft(null)}>
   <form className="fs-form" onSubmit={savePayment}>
    <label>Invoice<select required value={paymentDraft.invoice_number} onChange={e=>setPaymentDraft({...paymentDraft,invoice_number:e.target.value})}><option value="">Select an unpaid invoice</option>{openInvoices.map(i=><option key={i.number} value={i.number}>#{i.number} — {money(i.balance)} outstanding</option>)}</select></label>
    <div className="fs-form-two"><label>Amount received (INR)<input required type="number" step=".01" min=".01" value={paymentDraft.amount} onChange={e=>setPaymentDraft({...paymentDraft,amount:e.target.value})}/></label><label>Date received<input required type="date" value={paymentDraft.paid_on} onChange={e=>setPaymentDraft({...paymentDraft,paid_on:e.target.value})}/></label></div>
    <div className="fs-form-two"><label>Method<select value={paymentDraft.method} onChange={e=>setPaymentDraft({...paymentDraft,method:e.target.value as TrackerPayment["method"]})}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label><label>Reference<input value={paymentDraft.reference} onChange={e=>setPaymentDraft({...paymentDraft,reference:e.target.value})}/></label></div>
    <label>Notes<textarea rows={3} value={paymentDraft.notes} onChange={e=>setPaymentDraft({...paymentDraft,notes:e.target.value})}/></label>
    <div className="fs-form-actions"><span className="fs-flex"/><button type="button" className="fs-button" onClick={()=>setPaymentDraft(null)}>Cancel</button><button disabled={working} className="fs-button fs-button-primary">{paymentDraft.id?"Save payment changes":"Record payment"}</button></div>
   </form>
  </Dialog>}
  {invoiceDraft&&<Dialog title="Create invoice" subtitle="Add items and review a live billing summary." close={()=>setInvoiceDraft(null)} wide>
    <form className="fs-form" onSubmit={createInvoice}>
     <div className="fs-composer-layout"><div className="fs-composer-fields">
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
    
      </div>
      <aside className="fs-composer-preview" aria-label="Live invoice summary">
       <div className="fs-composer-preview-banner"><span className="fs-composer-preview-eyebrow">INVOICE DRAFT</span>
        <strong>{activeOrg?.legal_name||orgName}</strong><small>Invoice #{invoiceDraft.number||"—"}</small>
        <div className="fs-composer-preview-value">{money(draftTotal)}</div>
       </div>
       <div className="fs-composer-preview-paper">
        <div className="fs-composer-preview-row"><span>BILL TO</span><strong>{clients.find(c=>c.id===invoiceDraft.clientId)?.name||"Choose a client"}</strong></div>
        <div className="fs-composer-preview-row"><span>ISSUED / DUE</span><strong>{dateLabel(invoiceDraft.date)}{invoiceDraft.dueDate?" / "+dateLabel(invoiceDraft.dueDate):""}</strong></div>
        <div className="fs-composer-preview-line"><span>DESCRIPTION</span><span>AMOUNT</span></div>
        {invoiceDraft.lineItems.filter(x=>x.description.trim()).map((item,k)=><div className="fs-composer-preview-item" key={k}>
         <span>{item.description}<small>{item.quantity||"—"} × {money(Number(item.rate)||0)}</small></span>
         <strong>{money((Number(item.quantity)||0)*(Number(item.rate)||0))}</strong></div>)}
        {rows.filter(r=>invoiceDraft.rowIds.includes(r.id)).map(r=><div className="fs-composer-preview-item" key={r.id}>
         <span>{titleFromSource(r.project_name)}</span><strong>{money(r.amount)}</strong></div>)}
        {invoiceDraft.rowIds.length===0&&!invoiceDraft.lineItems.some(x=>x.description.trim())&&<p className="fs-composer-preview-empty">Invoice items appear here as you add them.</p>}
        <div className="fs-composer-preview-totals"><div><span>Subtotal</span><strong>{money(draftSubtotal)}</strong></div>
         <div><span>Tax ({invoiceDraft.taxRate||"0"}%)</span><strong>{money(draftTax)}</strong></div>
         <div className="fs-composer-preview-grand"><span>Invoice total</span><strong>{money(draftTotal)}</strong></div>
        </div>
        <div className="fs-composer-preview-footer"><LockKeyhole size={13}/>Preview only · Not sent</div>
       </div>
      </aside>
     </div>
    </form>
   </Dialog>}
{selected&&<Dialog title={"Invoice #"+selected.number} subtitle={invoiceClient(selected)+" · "+(selected.sourceStatus==="Draft"?"Draft":dateLabel(selected.date))} close={()=>setSelectedInvoice(null)} wide>
   <div className="fs-detail-grid">
    <div className="fs-detail-document">
     <div className="fs-detail-blue">
      <div className="fs-detail-blue-top"><span className="fs-detail-overline">INVOICE <span> / {selected.number}</span></span><Status tone={invoiceTone(selected)}>{invoiceStatus(selected)}</Status></div>
      <div className="fs-detail-brand">{activeOrg?.legal_name||orgName}</div>
      <div className="fs-detail-blue-total"><span>TOTAL INVOICED</span><strong>{money(selected.total)}</strong></div>
     </div>
     <div className="fs-detail-paper">
      <div className="fs-detail-paper-head"><div><span>BILL TO</span><strong>{invoiceClient(selected)}</strong><small>{clients.find(c=>c.id===selected.rows[0]?.client_id)?.email||""}</small></div>
       <div><span>INVOICE DATES</span><strong>{dateLabel(selected.date)}</strong><small>{selected.dueDate?"Due "+dateLabel(selected.dueDate):"No due date specified"}</small></div></div>
      <div className="fs-detail-table-head"><span>DESCRIPTION</span><span>AMOUNT</span></div>
      {selected.rows.map(row=><div className="fs-detail-line" key={row.id}><div><strong>{titleFromSource(row.project_name)}</strong>
       <small>{row.quantity&&row.unit_price!=null?Number(row.quantity)+" × "+money(row.unit_price):row.assigned_by?"POC: "+row.assigned_by:"Service / work item"}</small></div>
       <b>{money(row.amount)}</b></div>)}
      <div className="fs-detail-calculations"><div><span>Work subtotal</span><strong>{money(selected.lineTotal)}</strong></div>
       {selected.taxAmount>0&&<div><span>Tax ({selected.taxRate}%)</span><strong>{money(selected.taxAmount)}</strong></div>}
       <div className="fs-detail-total-row"><span>Invoice total</span><strong>{money(selected.total)}</strong></div></div>
      {selected.publicNotes&&<div className="fs-detail-notes"><span>NOTES</span><p>{selected.publicNotes}</p></div>}
     </div>
    </div>
    <aside className="fs-detail-side">
     <div className="fs-detail-progress-card"><div className="fs-detail-side-label">PAYMENT STATUS</div>
      <div className="fs-detail-progress-head"><div><strong>{selected.total>0?Math.min(100,Math.round(selected.paid/selected.total*100)):0}%</strong><small>settled</small></div><span><strong>{money(selected.paid)}</strong><small>of {money(selected.total)}</small></span></div>
      <div className="fs-detail-progress-track"><span style={{width:(selected.total>0?Math.min(100,selected.paid/selected.total*100):0)+"%"}}/></div>
      <div className="fs-detail-remaining"><span>{selected.sourceStatus==="Draft"?"Not yet issued":"Balance due"}</span><strong>{money(selected.balance)}</strong></div>
     </div>
     <div className="fs-detail-activity"><h3>Payment history</h3>
      {payments.filter(p=>p.invoice_number===selected.number).length?
       payments.filter(p=>p.invoice_number===selected.number).map(p=><div className="fs-detail-activity-row" key={p.id}><span className="fs-detail-activity-icon"><Check size={15}/></span><div><strong>{money(p.amount)} received</strong><small>{dateLabel(p.paid_on)} · {p.method.replaceAll("_"," ")}</small></div></div>):
       selected.sourceSettled?<div className="fs-detail-activity-row"><span className="fs-detail-activity-icon"><Check size={15}/></span><div><strong>Marked paid in opening records</strong><small>{selected.sourcePaidOn?dateLabel(selected.sourcePaidOn):"Payment date not provided"}</small></div></div>:
       <p className="fs-detail-activity-empty">No individual payments have been recorded.</p>}
     </div>
     {Math.abs(selected.discrepancy)>.001&&<div className="fs-alert fs-alert-warn"><AlertCircle size={17}/>Line items and invoice total differ by {money(Math.abs(selected.discrepancy))}. Both figures are preserved.</div>}
     {selected.document&&<div className="fs-alert fs-alert-note"><FileText size={17}/>Original file reference: {selected.document}. The generated PDF is not the original.</div>}
     {selected.sourceStatus==="Draft"&&<div className="fs-alert fs-alert-note"><LockKeyhole size={17}/>Draft only. It is not part of issued receivables.</div>}
     <div className="fs-detail-actions">
      <button type="button" className="fs-button fs-button-primary" onClick={()=>void downloadInvoicePdf(selected.number)} disabled={pdfBusy===selected.number}><ArrowDownToLine size={17}/>{pdfBusy===selected.number?"Generating…":"Download invoice PDF"}</button>
      {!selected.sourceSettled&&!payments.some(p=>p.invoice_number===selected.number)&&<button className="fs-button" onClick={()=>{
       setInvoiceEdit({number:selected.number,date:selected.date||localDate(),dueDate:selected.dueDate||"",notes:selected.publicNotes||"",
        status:selected.sourceStatus==="Sent"?"Sent":"Draft",clientId:selected.rows[0]?.client_id||"",
        taxRate:String(selected.taxRate),items:selected.rows.map(r=>({
         id:r.id,description:r.project_name,quantity:String(r.unit_price==null?1:r.quantity||1),
         rate:String(r.unit_price??r.amount??"")
        }))});setSelectedInvoice(null);
      }}><PenLine size={16}/>Edit invoice</button>}
      {selected.sourceStatus!=="Draft"&&selected.balance>0&&<button className="fs-button" onClick={()=>{setSelectedInvoice(null);setPaymentDraft({...newPayment(),invoice_number:selected.number})}}><Wallet size={16}/>Record payment</button>}
     </div>
    </aside>
   </div>
  </Dialog>}
  {invoiceEdit&&<Dialog title={"Edit invoice #"+invoiceEdit.number} subtitle="Edit line items and recalculate totals safely." close={()=>setInvoiceEdit(null)} wide>
    <form className="fs-form" onSubmit={editInvoice}>
     <div className="fs-edit-invoice-layout">
      <div className="fs-edit-fields">
       <div className="fs-form-two">
        <label>Bill to<select required value={invoiceEdit.clientId} onChange={e=>setInvoiceEdit({...invoiceEdit,clientId:e.target.value})}><option value="">Choose a client</option>{clients.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label>Invoice number<input value={invoiceEdit.number} readOnly aria-label="Invoice number (locked)"/></label>
       </div>
       <div className="fs-form-two"><label>Issue date<input type="date" required value={invoiceEdit.date} onChange={e=>setInvoiceEdit({...invoiceEdit,date:e.target.value})}/></label>
        <label>Due date<input type="date" value={invoiceEdit.dueDate} onChange={e=>setInvoiceEdit({...invoiceEdit,dueDate:e.target.value})}/></label></div>
       <div className="fs-checklist-title">Line items <small>{invoiceEdit.items.length} included</small></div>
       <div className="fs-line-editor">{invoiceEdit.items.map((line,i)=><div className="fs-line-editor-row" key={line.id||i}>
        <label>Description<input required maxLength={500} value={line.description} onChange={e=>setInvoiceEdit({...invoiceEdit,items:invoiceEdit.items.map((x,k)=>k===i?{...x,description:e.target.value}:x)})}/></label>
        <label>Qty<input type="number" required min=".001" step=".001" value={line.quantity} onChange={e=>setInvoiceEdit({...invoiceEdit,items:invoiceEdit.items.map((x,k)=>k===i?{...x,quantity:e.target.value}:x)})}/></label>
        <label>Rate (₹)<input type="number" required min="0" step=".01" value={line.rate} onChange={e=>setInvoiceEdit({...invoiceEdit,items:invoiceEdit.items.map((x,k)=>k===i?{...x,rate:e.target.value}:x)})}/></label>
        <button type="button" className="fs-icon fs-danger-hover" aria-label={"Remove line "+(i+1)} disabled={invoiceEdit.items.length<=1} onClick={()=>setInvoiceEdit({...invoiceEdit,items:invoiceEdit.items.filter((_,k)=>k!==i)})}><Trash2 size={16}/></button>
       </div>)}
        <button type="button" className="fs-button fs-button-small" onClick={()=>setInvoiceEdit({...invoiceEdit,items:[...invoiceEdit.items,{description:"",quantity:"1",rate:""}]})}><Plus size={15}/>Add line</button>
       </div>
       <div className="fs-form-two"><label>Tax (%)<input type="number" min="0" max="100" step=".01" required value={invoiceEdit.taxRate} onChange={e=>setInvoiceEdit({...invoiceEdit,taxRate:e.target.value})}/></label>
        <label>Status<select value={invoiceEdit.status} onChange={e=>setInvoiceEdit({...invoiceEdit,status:e.target.value as "Draft"|"Sent"})}><option value="Draft">Draft</option><option value="Sent">Sent (record only)</option></select></label></div>
       <label>Invoice notes<textarea rows={3} maxLength={4000} value={invoiceEdit.notes} onChange={e=>setInvoiceEdit({...invoiceEdit,notes:e.target.value})}/></label>
       <div className="fs-alert fs-alert-note"><LockKeyhole size={17}/>Changes are saved with an invoice revision. Already-paid invoices cannot be repriced. Sent does not send email.</div>
       <div className="fs-form-actions"><button type="button" className="fs-button" onClick={()=>setInvoiceEdit(null)}>Cancel</button><span className="fs-flex"/>
        <button className="fs-button fs-button-primary" disabled={working||!invoiceEdit.items.length}>{working?"Saving…":"Save invoice changes"}</button></div>
      </div>
      <aside className="fs-edit-summary"><span>LIVE TOTAL</span><strong>{money(editTotal)}</strong>
       <div><span>Subtotal</span><b>{money(editSubtotal)}</b></div><div><span>Tax</span><b>{money(editTax)}</b></div>
       <small>Changes recalculate the invoice amount. Nothing is issued automatically.</small>
      </aside>
     </div>
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
