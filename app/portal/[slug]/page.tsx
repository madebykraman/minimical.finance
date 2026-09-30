"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowRight, CheckCircle2, ChevronDown, FileText, LockKeyhole, LogOut, Receipt, WalletCards } from "lucide-react";

type Period="month"|"3months"|"6months"|"fy"|"all";
type StatusFilter="all"|"paid"|"open"|"overdue"|"partial";
type PortalData={client:any;invoices:any[];payments:any[];projects:any[];documents:any[]};

const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const date=(s:string)=>s?new Date(s+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"";
function fyLabel(now=new Date()){const y=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;return `FY ${y}-${String(y+1).slice(-2)}`;}
function periodLabel(p:Period){return p==="month"?"This month":p==="3months"?"Last 3 months":p==="6months"?"Last 6 months":p==="fy"?fyLabel():"All time";}
function inPeriod(s:string,p:Period,now=new Date()){
  if(p==="all")return true;
  const d=new Date(s+"T00:00:00"); const end=new Date(now.getFullYear(),now.getMonth()+1,0);
  if(p==="month")return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  if(p==="3months"){const start=new Date(now.getFullYear(),now.getMonth()-2,1);return d>=start&&d<=end;}
  if(p==="6months"){const start=new Date(now.getFullYear(),now.getMonth()-5,1);return d>=start&&d<=end;}
  const fyStart=new Date(now.getMonth()>=3?now.getFullYear():now.getFullYear()-1,3,1); const fyEnd=new Date(fyStart.getFullYear()+1,2,31);
  return d>=fyStart&&d<=fyEnd;
}
function statusMatch(i:any,s:StatusFilter){if(s==="all")return true;if(s==="paid")return Number(i.balance)<=0;if(s==="overdue")return !!i.is_overdue&&Number(i.balance)>0;if(s==="partial")return Number(i.paid)>0&&Number(i.balance)>0;return Number(i.balance)>0&&!i.is_overdue;}

export default function ClientPortalPage({params}:{params:Promise<{slug:string}>}){
  const [slug,setSlug]=useState(""); const [token,setToken]=useState(""); const [data,setData]=useState<PortalData|null>(null);
  const [period,setPeriod]=useState<Period>("all"); const [status,setStatus]=useState<StatusFilter>("all"); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [password,setPassword]=useState(""); const [loginBusy,setLoginBusy]=useState(false); const [expandedPayment,setExpandedPayment]=useState<string|null>(null);
  useEffect(()=>{params.then(p=>{setSlug(p.slug);setToken(new URLSearchParams(window.location.search).get("token")||"")})},[params]);
  useEffect(()=>{if(slug)load()},[slug]);
  async function load(){
    setLoading(true);const res=await fetch("/api/client-portal/data?slug="+encodeURIComponent(slug),{cache:"no-store"});
    if(res.ok){setData(await res.json());setLoading(false);return;}
    setLoading(false);
  }
  async function login(e:React.FormEvent){
    e.preventDefault();setLoginBusy(true);setError("");
    const res=await fetch("/api/client-portal/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({slug,token,password})});
    const json=await res.json();setLoginBusy(false);
    if(!res.ok){setError(json.error||"Could not sign in.");return;}
    window.history.replaceState({}, "", "/portal/"+encodeURIComponent(slug));setToken("");await load();
  }
  const invoices=useMemo(()=>data?.invoices||[],[data]); const payments=useMemo(()=>data?.payments||[],[data]);
  const scoped=invoices.filter(i=>inPeriod(i.issue_date,period)&&statusMatch(i,status));
  const periodInvoices=invoices.filter(i=>inPeriod(i.issue_date,period));
  const billed=periodInvoices.reduce((s,i)=>s+Number(i.total||0),0),paid=periodInvoices.reduce((s,i)=>s+Number(i.paid||0),0),outstanding=periodInvoices.reduce((s,i)=>s+Number(i.balance||0),0);
  const allBalance=invoices.reduce((s,i)=>s+Number(i.balance||0),0),overdue=invoices.filter(i=>i.is_overdue&&i.balance>0).length;
  const filteredStatement="/api/client-portal/"+encodeURIComponent(slug)+"/statement?period="+period;
  const fullStatement="/api/client-portal/"+encodeURIComponent(slug)+"/statement?period=all";

  if(loading&& !data)return <main className="portal-screen"><div className="portal-card"><div className="portal-mark">F</div><p>Opening secure client account…</p></div></main>;
  if(!data)return <main className="portal-screen"><div className="portal-card"><div className="portal-mark"><LockKeyhole size={16}/></div><div className="portal-kicker">SECURE CLIENT ACCOUNT</div><h1>Enter your portal password.</h1><p>This link identifies your account. Your password protects the financial records inside it.</p><form onSubmit={login} className="portal-login"><label>Password<input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Portal password" required/></label>{error&&<div className="portal-login-error">{error}</div>}<button className="portal-button dark" disabled={loginBusy}>{loginBusy?"Signing in…":"Open account"}</button></form></div></main>;

  return <main className="portal-screen"><div className="portal-shell">
    <header className="portal-header">
      <div>{data.client.logo_path?<img className="portal-client-logo" src={data.client.logo_path} alt=""/>:null}<div className="portal-brand">FINOS</div><div className="portal-kicker">CLIENT ACCOUNT</div><h1>{data.client.legal_name||data.client.name}</h1><p>{data.client.portal_message||"Your invoices, payments and account history in one place."}</p></div>
      <div className="portal-actions"><a href={fullStatement} className="portal-button dark"><ArrowDownToLine size={15}/>Full statement</a><button className="portal-button" onClick={async()=>{await fetch("/api/client-portal/logout",{method:"POST"});location.href="/portal/"+slug;}}><LogOut size={14}/>Sign out</button></div>
    </header>

    <section className="portal-controls">
      <div className="portal-period"><span>Period</span>{(["month","3months","6months","fy","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>
      <div className="portal-period"><span>Status</span>{(["all","open","overdue","partial","paid"] as StatusFilter[]).map(s=><button key={s} className={status===s?"active":""} onClick={()=>setStatus(s)}>{s==="all"?"All":s==="open"?"Outstanding":s==="partial"?"Partially paid":s[0].toUpperCase()+s.slice(1)}</button>)}</div>
    </section>

    <section className="portal-hero"><div><span>OPEN BALANCE</span><strong>{money(allBalance)}</strong><p>{overdue?overdue+" overdue invoice"+(overdue===1?"":"s"):"Account is up to date"}</p></div><div className="portal-hero-actions"><a href={filteredStatement}><FileText size={15}/>Download {periodLabel(period).toLowerCase()} statement</a></div></section>
    <section className="portal-kpis"><div><span>{periodLabel(period)} billed</span><b>{money(billed)}</b></div><div><span>{periodLabel(period)} paid</span><b>{money(paid)}</b></div><div><span>Outstanding</span><b>{money(outstanding)}</b></div><div><span>Invoices shown</span><b>{scoped.length}</b></div></section>

    <section className="portal-panel"><div className="portal-panel-head"><div><h2>Invoices</h2><p>{scoped.length} matching {periodLabel(period).toLowerCase()} · {status==="all"?"all statuses":status}</p></div><Receipt size={17}/></div>
      <div className="portal-list">{scoped.length?scoped.map(i=><a className="portal-row" href={"/portal/"+slug+"/invoice/"+i.id} key={i.id}><div><b>#{i.invoice_number}</b><span>{date(i.issue_date)}{i.due_date?" · Due "+date(i.due_date):""}{i.project_name?" · "+i.project_name:""}</span></div><div><strong>{money(i.total)}</strong><small>{i.balance>0?money(i.balance)+" outstanding": "Paid"}</small></div><ArrowRight size={15}/></a>):<div className="portal-empty">No invoices match these filters.</div>}</div>
    </section>

    <section className="portal-panel portal-payments"><div className="portal-panel-head"><div><h2>Payments</h2><p>Every recorded payment has a receipt.</p></div><WalletCards size={17}/></div>
      <div className="portal-list">{payments.length?payments.map(p=><div className="portal-payment" key={p.id}>
        <button className="portal-payment-main" onClick={()=>setExpandedPayment(expandedPayment===p.id?null:p.id)}><div><b>{money(p.amount)}</b><span>{date(p.payment_date)} · Invoice #{p.invoice_number}</span></div><div><strong>{String(p.method||"").replaceAll("_"," ")}</strong><small>{p.reference||"No reference recorded"}</small></div><ChevronDown size={15} className={expandedPayment===p.id?"rotated":""}/></button>
        {expandedPayment===p.id&&<div className="portal-payment-detail"><div><span>Receipt</span><b>{p.receipt_number}</b></div><div><span>Reference</span><b>{p.reference||"—"}</b></div><div><span>Payment date</span><b>{date(p.payment_date)||"—"}</b></div><div><span>Invoice</span><b>#{p.invoice_number}</b></div><div className="portal-detail-action"><a className="portal-button dark" href={"/api/client-portal/"+slug+"/receipt/"+p.id}><ArrowDownToLine size={14}/>Download receipt</a></div></div>}
      </div>):<div className="portal-empty">No payments recorded yet.</div>}</div>
    </section>

    {data.client.show_projects&&<section className="portal-panel portal-docs"><div className="portal-panel-head"><div><h2>Projects</h2><p>Projects associated with your account.</p></div><WalletCards size={17}/></div><div className="portal-doc-grid">{(data.projects||[]).length?(data.projects||[]).map((p:any)=><div className="portal-doc" key={p.id}><FileText size={16}/><div><b>{p.name}</b><span>{p.status||"active"}{p.description?" · "+p.description:""}</span></div></div>):<div className="portal-empty">No projects shared yet.</div>}</div></section>}

    {data.client.show_documents&&<section className="portal-panel portal-docs"><div className="portal-panel-head"><div><h2>Shared documents</h2><p>Files your studio has made available to you.</p></div><FileText size={17}/></div><div className="portal-doc-grid">{data.documents.length?data.documents.map(d=><a className="portal-doc" key={d.id} href={"/api/client-portal/"+slug+"/document/"+d.id}><FileText size={16}/><div><b>{d.file_name}</b><span>{d.description||d.document_type} · Download</span></div><ArrowDownToLine size={14}/></a>):<div className="portal-empty">No shared documents yet.</div>}</div></section>}

    <footer className="portal-footer">Secure client account · {data.client.email||"Contact your studio for account questions"}</footer>
  </div></main>;
}
