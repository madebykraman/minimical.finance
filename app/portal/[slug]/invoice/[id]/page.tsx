"use client";
import { useEffect,useState } from "react";
import { ArrowDownToLine,ArrowLeft,ChevronDown,FileText } from "lucide-react";

const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const date=(s:string)=>s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"";
export default function ClientInvoicePage({params}:{params:Promise<{slug:string;id:string}>}){
  const [p,setP]=useState<{slug:string;id:string}|null>(null);const [data,setData]=useState<any>(null);const [error,setError]=useState("");
  useEffect(()=>{params.then(setP)},[params]);
  useEffect(()=>{if(!p)return;fetch("/api/client-portal/data?slug="+encodeURIComponent(p.slug),{cache:"no-store"}).then(async r=>{if(!r.ok){setError("Your portal session has expired.");return}const d=await r.json();setData((d.invoices||[]).find((i:any)=>i.id===p.id)||null)}).catch(()=>setError("Could not load this invoice."))},[p]);
  if(error)return <main className="portal-screen"><div className="portal-card"><h1>Invoice unavailable</h1><p>{error}</p></div></main>;
  if(!p||!data)return <main className="portal-screen"><div className="portal-card">Loading invoice…</div></main>;
  return <main className="portal-screen"><div className="portal-shell">
    <header className="portal-header"><div><a className="back-link" href={"/portal/"+p.slug}><ArrowLeft size={13}/> Account</a><div className="portal-kicker">INVOICE</div><h1>#{data.invoice_number}</h1><p>{date(data.issue_date)}{data.due_date?" · Due "+date(data.due_date):""}{data.project_name?" · "+data.project_name:""}</p></div><a className="portal-button dark" href={"/api/client-portal/"+p.slug+"/invoice/"+data.id+"/pdf"}><ArrowDownToLine size={14}/>Download PDF</a></header>
    <section className="portal-hero"><div><span>AMOUNT DUE</span><strong>{money(data.balance)}</strong><p>{data.balance>0?(data.is_overdue?"Overdue":"Outstanding"):"Paid"}</p></div><div className="portal-hero-actions"><a href={"/api/client-portal/"+p.slug+"/invoice/"+data.id+"/pdf"}><FileText size={15}/>Download invoice file</a></div></section>
    <section className="portal-kpis"><div><span>Invoice total</span><b>{money(data.total)}</b></div><div><span>Paid</span><b>{money(data.paid)}</b></div><div><span>Outstanding</span><b>{money(data.balance)}</b></div><div><span>Status</span><b>{data.status}</b></div></section>
    <section className="portal-panel"><div className="portal-panel-head"><div><h2>Invoice details</h2><p>Everything recorded on this invoice.</p></div></div><div className="portal-invoice-items">{(data.contents||[]).map((item:any,index:number)=><div className="portal-invoice-item" key={item.id}><div><span>{String(index+1).padStart(2,"0")}</span><div><b>{item.title}</b>{item.description?<small>{item.description}</small>:null}{item.note?<small>{item.note}</small>:null}</div></div><strong>{item.priced?money(Number(item.amount||Number(item.quantity||1)*Number(item.rate||0))):"Amount pending"}</strong></div>)}{data.notes?<div className="portal-invoice-note"><span>Notes</span><p>{data.notes}</p></div>:null}{data.adjustment_note?<div className="portal-invoice-note"><span>Adjustment</span><p>{data.adjustment_note}</p></div>:null}</div></section>
    <footer className="portal-footer">Invoice #{data.invoice_number} · Securely provided through FinOS.</footer>
  </div></main>;
}
