"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight, Bell, Check, ChevronRight, CircleAlert, FileText, Filter,
  IndianRupee, LayoutDashboard, MoreHorizontal, Plus, Receipt, Search,
  Settings2, Sparkles, WalletCards, X
} from "lucide-react";

type ContentKind = "service" | "adjustment" | "note";
type InvoiceStatus = "Paid" | "Sent" | "Draft" | "Overdue";
type Content = {
  id: string; title: string; kind: ContentKind; quantity?: number;
  rate?: number; amount?: number; priced: boolean; note?: string;
};
type Invoice = {
  id: string; number: string; client: string; project: string;
  date: string; dueDate: string; status: InvoiceStatus;
  contents: Content[]; adjustment?: string; notes?: string;
};

const seed: Invoice[] = [
 {id:"21",number:"21",client:"Elle India",project:"Video Editing",date:"2025-04-24",dueDate:"2025-05-24",status:"Paid",contents:[{id:"21-1",title:"Video Editing",kind:"service",quantity:1,rate:4000,amount:4000,priced:true}]},
 {id:"43",number:"43",client:"Elle India",project:"Video Editing",date:"2025-09-03",dueDate:"2025-10-03",status:"Paid",contents:[{id:"43-1",title:"Video Editing",kind:"service",quantity:1,rate:6000,amount:6000,priced:true}]},
 {id:"106",number:"106",client:"Elle India",project:"Video Editing",date:"2026-01-25",dueDate:"2026-02-25",status:"Paid",contents:[{id:"106-1",title:"Video Editing — Combined",kind:"service",quantity:1,rate:16500,amount:16500,priced:true}]},
 {id:"160",number:"160",client:"Elle India",project:"Video Editing",date:"2026-07-07",dueDate:"2026-08-06",status:"Paid",contents:[{id:"160-1",title:"Video Editing — Combined",kind:"service",quantity:1,rate:19500,amount:19500,priced:true}]},
 {id:"172",number:"172",client:"Elle India",project:"Video Editing",date:"2026-07-31",dueDate:"2026-08-30",status:"Sent",adjustment:"₹2,000 Bridgerton reduction recorded for low budget.",contents:[
  {id:"172-1",title:"Bridgerton",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"172-2",title:"Other video edit",kind:"service",quantity:1,rate:11000,amount:11000,priced:true},
  {id:"172-3",title:"Budget adjustment",kind:"adjustment",amount:-2000,priced:true,note:"Bridgerton reduction"}]},
 {id:"180",number:"180",client:"Elle India",project:"Video Editing",date:"2026-08-05",dueDate:"2026-09-04",status:"Sent",notes:"Current invoice total was recorded as ₹10,000 while listed contents total ₹13,000.",contents:[
  {id:"180-1",title:"Video edit 01",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"180-2",title:"Video edit 02",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"180-3",title:"Video edit 03",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"180-4",title:"Video edit 04",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"180-5",title:"Video edit 05",kind:"service",quantity:1,rate:2000,amount:2000,priced:true},
  {id:"180-6",title:"Additional edit",kind:"service",quantity:1,rate:3000,amount:3000,priced:true}]},
 {id:"186",number:"186",client:"Elle India",project:"Video Editing",date:"2026-09-29",dueDate:"2026-10-29",status:"Sent",contents:[
  {id:"186-1",title:"Confirmed video edit",kind:"service",quantity:1,rate:4000,amount:4000,priced:true},
  {id:"186-2",title:"Video edit — pricing pending",kind:"service",priced:false,note:"Not decided yet"},
  {id:"186-3",title:"Additional content — pricing pending",kind:"service",priced:false,note:"Not decided yet"},
  {id:"186-4",title:"Additional content — pricing pending",kind:"service",priced:false,note:"Not decided yet"}]},
 {id:"195",number:"195",client:"Elle India",project:"Video Editing",date:"2026-09-29",dueDate:"2026-10-29",status:"Sent",contents:[{id:"195-1",title:"Video Editing",kind:"service",quantity:1,rate:10000,amount:10000,priced:true}]}
];

const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const contentAmount = (c:Content) => c.priced ? (c.amount ?? ((c.quantity ?? 0) * (c.rate ?? 0))) : 0;
const invoiceTotal = (i:Invoice) => i.contents.reduce((s,c)=>s+contentAmount(c),0);

export default function Home() {
 const [invoices,setInvoices] = useState(seed);
 const [query,setQuery] = useState("");
 const [status,setStatus] = useState<"All"|InvoiceStatus>("All");
 const [selected,setSelected] = useState<Invoice|null>(null);
 const [composer,setComposer] = useState(false);
 const stats = useMemo(() => {
  const billed = invoices.reduce((s,i)=>s+Math.max(invoiceTotal(i),0),0);
  const paid = invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+Math.max(invoiceTotal(i),0),0);
  return {billed,paid,outstanding:billed-paid,rate:billed?Math.round(paid/billed*1000)/10:0};
 },[invoices]);
 const filtered = invoices.filter(i => {
  const text = [i.number,i.client,i.project,i.notes,...i.contents.map(c=>c.title)].join(" ").toLowerCase();
  return (status==="All" || i.status===status) && text.includes(query.toLowerCase());
 });
 const updateStatus = (id:string,next:InvoiceStatus) => {
  setInvoices(v=>v.map(i=>i.id===id?{...i,status:next}:i));
  setSelected(v=>v?.id===id?{...v,status:next}:v);
 };
 return <main className="shell">
  <aside className="sidebar">
   <div className="brand"><div className="brand-mark">m</div><div><strong>minimical</strong><span>.finance</span></div></div>
   <div className="nav-label">WORKSPACE</div>
   <nav>
    <button className="nav-item active"><LayoutDashboard size={17}/>Overview</button>
    <button className="nav-item"><Receipt size={17}/>Invoices <span>{invoices.length}</span></button>
    <button className="nav-item"><WalletCards size={17}/>Payments</button>
    <button className="nav-item"><FileText size={17}/>Clients</button>
   </nav>
   <div className="sidebar-bottom">
    <button className="nav-item"><Settings2 size={17}/>Settings</button>
    <div className="profile"><div className="avatar">KA</div><div><b>Kumar Aman</b><small>Owner</small></div><MoreHorizontal size={16}/></div>
   </div>
  </aside>
  <section className="content">
   <header className="topbar">
    <div><div className="eyebrow">FINANCE / OVERVIEW</div><h1>Good morning, Aman.</h1><p>Here’s where the money stands.</p></div>
    <div className="top-actions"><button className="icon-button"><Bell size={18}/></button><button className="primary" onClick={()=>setComposer(true)}><Plus size={17}/>New invoice</button></div>
   </header>
   <section className="kpis">
    <Kpi label="Total billed" value={money(stats.billed)} note="Across all invoices" icon={<IndianRupee size={16}/>}/>
    <Kpi label="Collected" value={money(stats.paid)} note="Settled invoices" icon={<Check size={16}/>}/>
    <Kpi label="Outstanding" value={money(stats.outstanding)} note={invoices.filter(i=>i.status!=="Paid").length+" invoices open"} icon={<ArrowUpRight size={16}/>} accent/>
    <Kpi label="Collection rate" value={stats.rate+"%"} note="Paid ÷ billed" icon={<Sparkles size={16}/>}/>
   </section>
   <section className="section-head">
    <div><h2>Invoices</h2><p>{filtered.length} records · {filtered.reduce((s,i)=>s+i.contents.length,0)} contents</p></div>
    <div className="filters"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices, clients, contents..."/></div><div className="filter"><Filter size={15}/><select value={status} onChange={e=>setStatus(e.target.value as "All"|InvoiceStatus)}><option>All</option><option>Draft</option><option>Sent</option><option>Overdue</option><option>Paid</option></select></div></div>
   </section>
   <div className="invoice-list">{filtered.map(i=><InvoiceCard key={i.id} invoice={i} onOpen={()=>setSelected(i)} onStatus={updateStatus}/>)}</div>
  </section>
  {selected && <InvoiceDrawer invoice={selected} onClose={()=>setSelected(null)} onStatus={updateStatus} onSave={next=>{setInvoices(v=>v.map(i=>i.id===next.id?next:i));setSelected(next)}}/>}
  {composer && <InvoiceComposer onClose={()=>setComposer(false)} onCreate={i=>{setInvoices(v=>[i,...v]);setComposer(false)}}/>}
 </main>;
}

function Kpi({icon,label,value,note,accent}:{icon:React.ReactNode;label:string;value:string;note:string;accent?:boolean}) {
 return <div className={"kpi"+(accent?" accent":"")}><div className="kpi-icon">{icon}</div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-note">{note}</div></div>;
}

function InvoiceCard({invoice,onOpen,onStatus}:{invoice:Invoice;onOpen:()=>void;onStatus:(id:string,s:InvoiceStatus)=>void}) {
 const unpriced=invoice.contents.filter(c=>!c.priced).length;
 return <article className="invoice-card" onClick={onOpen}>
  <div className="invoice-main"><div className="invoice-id"><span>INV.</span><strong>{invoice.number}</strong></div><div><h3>{invoice.client}</h3><p>{invoice.project} · {new Date(invoice.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p></div></div>
  <div className="invoice-middle"><div className="content-preview">{invoice.contents.slice(0,3).map(c=><span key={c.id}>{c.title}</span>)}{invoice.contents.length>3&&<span>+{invoice.contents.length-3} more</span>}</div>{unpriced>0&&<span className="warning-pill"><CircleAlert size={13}/>{unpriced} unpriced</span>}</div>
  <div className="invoice-right"><strong>{money(invoiceTotal(invoice))}</strong><button className={"status "+invoice.status.toLowerCase()} onClick={e=>{e.stopPropagation();onStatus(invoice.id,invoice.status==="Paid"?"Sent":"Paid")}}>{invoice.status==="Paid"?"CLEAR":invoice.status}</button><ChevronRight size={17} className="chevron"/></div>
 </article>;
}

function InvoiceDrawer({invoice,onClose,onStatus,onSave}:{invoice:Invoice;onClose:()=>void;onStatus:(id:string,s:InvoiceStatus)=>void;onSave:(i:Invoice)=>void}) {
 const [draft,setDraft]=useState(invoice);
 const unpriced=draft.contents.filter(c=>!c.priced).length;
 const patch=(id:string,p:Partial<Content>)=>setDraft(d=>({...d,contents:d.contents.map(c=>c.id===id?{...c,...p,amount:p.amount??((p.quantity??c.quantity??0)*(p.rate??c.rate??0))}:c)}));
 const add=(kind:ContentKind="service")=>setDraft(d=>({...d,contents:[...d.contents,{id:crypto.randomUUID(),title:kind==="note"?"Note":"New content",kind,priced:kind==="note"}]}));
 const remove=(id:string)=>setDraft(d=>({...d,contents:d.contents.filter(c=>c.id!==id)}));
 return <div className="overlay" onMouseDown={onClose}><aside className="drawer" onMouseDown={e=>e.stopPropagation()}>
  <div className="drawer-head"><div><div className="eyebrow">INVOICE</div><h2>#{draft.number}</h2><p>{draft.client} · {draft.project}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
  <div className="drawer-body">
   <div className="drawer-summary"><div><span>Total</span><strong>{money(invoiceTotal(draft))}</strong></div><div><span>Status</span><button className={"status "+draft.status.toLowerCase()} onClick={()=>{const next=draft.status==="Paid"?"Sent":"Paid";onStatus(draft.id,next);setDraft(d=>({...d,status:next}))}}>{draft.status}</button></div></div>
   {unpriced>0&&<div className="integrity warning"><CircleAlert size={17}/><div><b>{unpriced} content item{unpriced>1?"s":""} still unpriced</b><span>Visible and retained, but excluded from the financial total until priced.</span></div></div>}
   <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Everything being billed on this invoice.</p></div><button className="secondary" onClick={()=>add()}><Plus size={15}/>Add content</button></div>
    <div className="content-table">{draft.contents.map((c,idx)=><div className="content-row" key={c.id}>
     <div className="row-index">{String(idx+1).padStart(2,"0")}</div>
     <input className="content-title" value={c.title} onChange={e=>patch(c.id,{title:e.target.value})}/>
     <select value={c.kind} onChange={e=>patch(c.id,{kind:e.target.value as ContentKind})}><option value="service">Service</option><option value="adjustment">Adjustment</option><option value="note">Note</option></select>
     <input className="number-input" type="number" placeholder="Qty" value={c.quantity??""} onChange={e=>patch(c.id,{quantity:Number(e.target.value)||undefined})}/>
     <input className="number-input" type="number" placeholder="Rate" value={c.rate??""} onChange={e=>patch(c.id,{rate:Number(e.target.value)||undefined,priced:!!e.target.value})}/>
     <div className={"row-amount"+(!c.priced?" muted":"")}>{c.priced?money(contentAmount(c)):"TBD"}</div>
     <button className="tiny-delete" onClick={()=>remove(c.id)}><X size={14}/></button>
    </div>)}</div>
    <div className="add-content-menu"><button onClick={()=>add("service")}><Plus size={14}/>Service / deliverable</button><button onClick={()=>add("adjustment")}><Plus size={14}/>Adjustment</button><button onClick={()=>add("note")}><Plus size={14}/>Note / internal line</button></div>
   </div>
   {draft.adjustment&&<div className="integrity"><CircleAlert size={17}/><div><b>Adjustment context</b><span>{draft.adjustment}</span></div></div>}
   <div className="block notes-block"><label>Invoice notes</label><textarea value={draft.notes??""} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))} placeholder="Add context, payment terms, client notes..."/></div>
  </div>
  <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>{onSave(draft);onClose()}}><Check size={16}/>Save changes</button></div>
 </aside></div>;
}

function InvoiceComposer({onClose,onCreate}:{onClose:()=>void;onCreate:(i:Invoice)=>void}) {
 const [number,setNumber]=useState("");
 const [client,setClient]=useState("Elle India");
 const [project,setProject]=useState("Video Editing");
 const [contents,setContents]=useState<Content[]>([{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
 const total=contents.reduce((s,c)=>s+(c.rate?(c.quantity??1)*c.rate:0),0);
 const patch=(id:string,p:Partial<Content>)=>setContents(v=>v.map(c=>c.id===id?{...c,...p}:c));
 const add=()=>setContents(v=>[...v,{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
 return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}>
  <div className="drawer-head"><div><div className="eyebrow">NEW INVOICE</div><h2>Create invoice</h2><p>Build it from the actual contents.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
  <div className="composer-body">
   <div className="form-grid"><label>Invoice number<input value={number} onChange={e=>setNumber(e.target.value)} placeholder="e.g. 196"/></label><label>Client<input value={client} onChange={e=>setClient(e.target.value)}/></label><label>Project<input value={project} onChange={e=>setProject(e.target.value)}/></label><label>Issue date<input type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label></div>
   <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Billable, adjustment and unpriced content can coexist.</p></div><button className="secondary" onClick={add}><Plus size={15}/>Add content</button></div>
    {contents.map((c,idx)=><div className="composer-row" key={c.id}><span>{idx+1}</span><input value={c.title} onChange={e=>patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input type="number" value={c.quantity??""} onChange={e=>patch(c.id,{quantity:Number(e.target.value)||undefined})} placeholder="Qty"/><input type="number" value={c.rate??""} onChange={e=>patch(c.id,{rate:Number(e.target.value)||undefined,priced:!!e.target.value})} placeholder="Rate"/><b>{c.rate?money((c.quantity??1)*c.rate):"TBD"}</b></div>)}
   </div>
   <div className="total-box"><span>Invoice total</span><strong>{money(total)}</strong></div>
  </div>
  <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!number||!contents.some(c=>c.title)} onClick={()=>onCreate({id:crypto.randomUUID(),number,client,project,date:new Date().toISOString().slice(0,10),dueDate:new Date(Date.now()+30*86400000).toISOString().slice(0,10),status:"Draft",contents})}>Create draft</button></div>
 </div></div>;
}
