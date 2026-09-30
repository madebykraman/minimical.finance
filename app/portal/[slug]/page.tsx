"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileText, IndianRupee, Receipt, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);

type Period = "month"|"quarter"|"half"|"year"|"all";
type PortalData = {
  client:any;
  invoices:any[];
  payments:any[];
  documents:any[];
};

function inPeriod(date:string,p:Period,today=new Date()){
  if(p==="all") return true;
  const d=new Date(date+"T00:00:00");
  if(p==="month") return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth();
  if(p==="quarter") return d.getFullYear()===today.getFullYear()&&Math.floor(d.getMonth()/3)===Math.floor(today.getMonth()/3);
  if(p==="half") return d.getFullYear()===today.getFullYear()&&(today.getMonth()<6?d.getMonth()<6:d.getMonth()>=6);
  return d.getFullYear()===today.getFullYear();
}
function periodLabel(p:Period){return p==="month"?"This month":p==="quarter"?"This quarter":p==="half"?"This half":p==="year"?"This year":"All time";}

export default function ClientPortalPage({params}:{params:Promise<{slug:string}>}){
  const [slug,setSlug]=useState(""); const [token,setToken]=useState(""); const [data,setData]=useState<PortalData|null>(null);
  const [period,setPeriod]=useState<Period>("all"); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{params.then(p=>{setSlug(p.slug);setToken(new URLSearchParams(window.location.search).get("token")||"")})},[params]);
  useEffect(()=>{if(!slug||!token)return;load()},[slug,token]);
  async function load(){
    setLoading(true);setError("");
    const {data,error}=await supabase.rpc("get_client_portal",{p_slug:slug,p_token:token});
    if(error){setError("This portal link is invalid, expired or disabled.");setLoading(false);return;}
    setData(data as PortalData);setLoading(false);
  }
  const invoices=useMemo(()=>data?.invoices||[],[data]);
  const scoped=invoices.filter(i=>inPeriod(i.issue_date,period));
  const billed=scoped.reduce((s,i)=>s+Number(i.total||0),0);
  const paid=scoped.reduce((s,i)=>s+Number(i.paid||0),0);
  const outstanding=scoped.reduce((s,i)=>s+Number(i.balance||0),0);
  const allBalance=invoices.reduce((s,i)=>s+Number(i.balance||0),0);
  const overdue=invoices.filter(i=>i.is_overdue).length;
  const statementUrl=slug&&token?"/api/client-portal/"+encodeURIComponent(slug)+"/statement?token="+encodeURIComponent(token)+"&period="+period:"";
  if(loading)return <main className="portal-screen"><div className="portal-card">Opening secure portal…</div></main>;
  if(error||!data)return <main className="portal-screen"><div className="portal-card"><div className="portal-mark">m</div><h1>Portal unavailable</h1><p>{error||"This client portal could not be loaded."}</p></div></main>;
  return <main className="portal-screen">
    <div className="portal-shell">
      <header className="portal-header"><div><div className="portal-brand">minimical<span>.finance</span></div><div className="portal-kicker">CLIENT ACCOUNT</div><h1>{data.client.legal_name||data.client.name}</h1><p>{data.client.portal_message||"Your invoices, payments and account history in one place."}</p></div><div className="portal-actions"><a href={statementUrl} className="portal-button dark"><Download size={15}/>Statement</a></div></header>
      <div className="portal-period"><span>View</span>{(["month","quarter","half","year","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>
      <section className="portal-hero"><div><span>OPEN BALANCE</span><strong>{money(allBalance)}</strong><p>{overdue?overdue+" overdue invoice"+(overdue===1?"":"s"):"No overdue invoices"}</p></div><div className="portal-hero-actions"><a href={statementUrl}><FileText size={15}/>Download account statement</a></div></section>
      <section className="portal-kpis"><div><span>Period billed</span><b>{money(billed)}</b></div><div><span>Period paid</span><b>{money(paid)}</b></div><div><span>Period outstanding</span><b>{money(outstanding)}</b></div><div><span>Invoices</span><b>{scoped.length}</b></div></section>
      <section className="portal-grid">
        <div className="portal-panel"><div className="portal-panel-head"><div><h2>Invoices</h2><p>{periodLabel(period)} · {scoped.length} records</p></div><Receipt size={16}/></div><div className="portal-list">{scoped.length?scoped.map(i=><a className="portal-row" href={"/portal/"+slug+"/invoice/"+i.id+"?token="+encodeURIComponent(token)} key={i.id}><div><b>#{i.invoice_number}</b><span>{i.issue_date}{i.due_date?" · Due "+i.due_date:""}</span></div><div><strong>{money(i.total)}</strong><small>{i.balance>0?money(i.balance)+" open":i.status==="paid"?"Paid":i.status}</small></div><span>→</span></a>):<div className="portal-empty">No invoices in this period.</div>}</div></div>
        <div className="portal-panel"><div className="portal-panel-head"><div><h2>Payments</h2><p>Recorded against your account</p></div><WalletCards size={16}/></div><div className="portal-list">{data.payments.length?data.payments.slice(0,8).map(p=><div className="portal-row static" key={p.id}><div><b>{money(p.amount)}</b><span>{p.payment_date||"Date not recorded"}</span></div><div><strong>{String(p.method||"").replace("_"," ")}</strong><small>{p.reference||"Recorded payment"}</small></div></div>):<div className="portal-empty">No payments recorded yet.</div>}</div></div>
      </section>
      {data.client.show_documents&&<section className="portal-panel portal-docs"><div className="portal-panel-head"><div><h2>Shared documents</h2><p>Files your studio has made available to you.</p></div><FileText size={16}/></div><div className="portal-doc-grid">{data.documents.length?data.documents.map(d=><div className="portal-doc" key={d.id}><FileText size={16}/><div><b>{d.file_name}</b><span>{d.description||d.document_type}</span></div></div>):<div className="portal-empty">No shared documents yet.</div>}</div></section>}
      <footer className="portal-footer">Secure client account · {data.client.email||"Contact your studio for account questions"}</footer>
    </div>
  </main>;
}
