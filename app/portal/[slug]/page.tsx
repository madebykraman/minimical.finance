"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowDownToLine, ArrowRight, Building2, CheckCircle2, ChevronDown, FileText, LockKeyhole, LogOut, Receipt, WalletCards } from "lucide-react";

type Period="month"|"3months"|"6months"|"fy"|"all";
type StatusFilter="all"|"paid"|"open"|"overdue"|"partial";
type PortalData={organization:any;client:any;invoices:any[];payments:any[];projects:any[];documents:any[];activity:any[]};

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
  const [password,setPassword]=useState(""); const [loginBusy,setLoginBusy]=useState(false); const [expandedPayment,setExpandedPayment]=useState<string|null>(null); const [expandedProject,setExpandedProject]=useState<string|null>(null); const [profileOpen,setProfileOpen]=useState(false); const [profile,setProfile]=useState<any>({}); const [profileSaving,setProfileSaving]=useState(false); const [profileMessage,setProfileMessage]=useState("");
  useEffect(()=>{params.then(p=>{setSlug(p.slug);setToken(new URLSearchParams(window.location.search).get("token")||"")})},[params]);
  useEffect(()=>{if(slug)load()},[slug]);
  async function load(){
    setLoading(true);const res=await fetch("/api/client-portal/data?slug="+encodeURIComponent(slug),{cache:"no-store"});
    if(res.ok){const next=await res.json();setData(next);setProfile(next.client||{});setLoading(false);return;}
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
  const billed=scoped.reduce((s,i)=>s+Number(i.total||0),0),paid=scoped.reduce((s,i)=>s+Number(i.paid||0),0),outstanding=scoped.reduce((s,i)=>s+Number(i.balance||0),0);
  const allBalance=invoices.reduce((s,i)=>s+Number(i.balance||0),0),overdue=invoices.filter(i=>i.is_overdue&&i.balance>0).length;
  const filteredStatement="/api/client-portal/"+encodeURIComponent(slug)+"/statement?period="+period+"&status="+status;
  const fullStatement="/api/client-portal/"+encodeURIComponent(slug)+"/statement?period=all&status=all";

  if(loading&& !data)return <main className="portal-screen"><div className="portal-card"><div className="portal-mark"><Building2 size={16}/></div><p>Opening secure client account…</p></div></main>;
  if(!data)return <main className="portal-screen"><div className="portal-card"><div className="portal-mark"><LockKeyhole size={16}/></div><div className="portal-kicker">SECURE CLIENT ACCOUNT</div><h1>Enter your portal password.</h1><p>This link identifies your account. Your password protects the financial records inside it.</p><form onSubmit={login} className="portal-login"><label>Password<input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Portal password" required/></label>{error&&<div className="portal-login-error">{error}</div>}<button className="portal-button dark" disabled={loginBusy}>{loginBusy?"Signing in…":"Open account"}</button></form></div></main>;

  return <main className="portal-screen" style={{"--org-accent":data.organization?.accent_hex||"#7046dd"} as CSSProperties}><div className="portal-shell">
    <header className="portal-header">
      <div className="portal-title-lockup">{data.client.logo_path?<img className="portal-client-logo" src={data.client.logo_path} alt=""/>:null}<div><div className="portal-brand">{data.organization?.logo_path?<img className="portal-org-logo" src={data.organization.logo_path} alt=""/>:null}<strong>{data.organization?.name||""}</strong></div><h1>{data.client.legal_name||data.client.name}</h1></div></div>
      <div className="portal-actions"><a href={fullStatement} className="portal-button dark"><ArrowDownToLine size={15}/>Full statement</a><button className="portal-button" onClick={async()=>{await fetch("/api/client-portal/logout",{method:"POST"});location.href="/portal/"+slug;}}><LogOut size={14}/>Sign out</button></div>
    </header>

    <section className="portal-controls">
      <div className="portal-period"><span>Period</span>{(["month","3months","6months","fy","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>
      <div className="portal-period"><span>Status</span>{(["all","open","overdue","partial","paid"] as StatusFilter[]).map(s=><button key={s} className={status===s?"active":""} onClick={()=>setStatus(s)}>{s==="all"?"All":s==="open"?"Outstanding":s==="partial"?"Partially paid":s[0].toUpperCase()+s.slice(1)}</button>)}</div>
    </section>

    <section className="portal-position"><div><span>OUTSTANDING</span><strong>{money(allBalance)}</strong><small>{overdue?overdue+" overdue":"Account up to date"}</small></div><div className="portal-position-facts"><span>{periodLabel(period)} billed <b>{money(billed)}</b></span><span>Paid <b>{money(paid)}</b></span><span>{scoped.length} invoices <b>shown</b></span></div><a href={filteredStatement} className="portal-button dark"><FileText size={14}/>Statement</a></section>

    <section className="portal-panel"><div className="portal-panel-head"><div><h2>Invoices</h2><span>{scoped.length} · {status==="all"?"all":status}</span></div><Receipt size={16}/></div>
      <div className="portal-list">{scoped.length?scoped.map(i=><a className="portal-row" href={"/portal/"+slug+"/invoice/"+i.id} key={i.id}><div><b>#{i.invoice_number}</b><span>{date(i.issue_date)}{i.due_date?" · Due "+date(i.due_date):""}{i.project_name?" · "+i.project_name:""}</span></div><div><strong>{money(i.total)}</strong><small>{i.balance>0?money(i.balance)+" outstanding": "Paid"}</small></div><ArrowRight size={15}/></a>):<div className="portal-empty">No invoices match these filters.</div>}</div>
    </section>

    <section className="portal-panel portal-payments"><div className="portal-panel-head"><div><h2>Payments</h2><span>{payments.length} recorded</span></div><WalletCards size={16}/></div>
      <div className="portal-list">{payments.length?payments.map(p=><div className="portal-payment" key={p.id}>
        <button className="portal-payment-main" onClick={()=>setExpandedPayment(expandedPayment===p.id?null:p.id)}><div><b>{money(p.amount)}</b><span>{date(p.payment_date)} · Invoice #{p.invoice_number}</span></div><div><strong>{String(p.method||"").replaceAll("_"," ")}</strong><small>{p.reference||"No reference recorded"}</small></div><ChevronDown size={15} className={expandedPayment===p.id?"rotated":""}/></button>
        {expandedPayment===p.id&&<div className="portal-payment-detail"><div><span>Receipt</span><b>{p.receipt_number}</b></div><div><span>Reference</span><b>{p.reference||"—"}</b></div><div><span>Payment date</span><b>{date(p.payment_date)||"—"}</b></div><div><span>Invoice</span><b>#{p.invoice_number}</b></div><div className="portal-detail-action"><a className="portal-button dark" href={"/api/client-portal/"+slug+"/receipt/"+p.id}><ArrowDownToLine size={14}/>Download receipt</a></div></div>}
      </div>):<div className="portal-empty">No payments recorded yet.</div>}</div>
    </section>

    {data.client.show_projects&&<section className="portal-panel portal-docs"><div className="portal-panel-head"><div><h2>Projects</h2><span>{(data.projects||[]).length}</span></div><WalletCards size={16}/></div><div className="portal-doc-grid">{(data.projects||[]).length?(data.projects||[]).map((p:any)=><div className="portal-doc portal-project" key={p.id}><button className="portal-project-main" onClick={()=>setExpandedProject(expandedProject===p.id?null:p.id)}><FileText size={16}/><div><b>{p.name}</b><span>{p.status||"active"}{p.start_date?" · "+date(p.start_date):""}{p.end_date?" → "+date(p.end_date):""}</span></div><ChevronDown size={15} className={expandedProject===p.id?"rotated":""}/></button>{expandedProject===p.id&&<div className="portal-project-detail"><p>{p.description||"No project description has been shared."}</p></div>}</div>):<div className="portal-empty">No projects shared yet.</div>}</div></section>}

    {data.client.show_documents&&<section className="portal-panel portal-docs"><div className="portal-panel-head"><div><h2>Documents</h2><span>{data.documents.length} shared</span></div><FileText size={16}/></div><div className="portal-doc-grid">{data.documents.length?data.documents.map(d=><div className="portal-doc" key={d.id}><FileText size={16}/><div><b>{d.file_name}</b><span>{d.description||d.document_type}</span></div><div className="portal-doc-actions"><a href={"/api/client-portal/"+slug+"/document/"+d.id+"?preview=1"}>Preview</a><a href={"/api/client-portal/"+slug+"/document/"+d.id}>Download</a></div></div>):<div className="portal-empty">No shared documents yet.</div>}</div></section>}

    <section className="portal-panel portal-activity portal-secondary"><div className="portal-panel-head"><div><h2>Activity</h2><span>Recent account events</span></div><CheckCircle2 size={16}/></div><div className="portal-list">{(data.activity||[]).length?(data.activity||[]).slice(0,12).map((a:any)=><div className="portal-activity-row" key={a.id}><span className="portal-activity-dot"/><div><b>{String(a.action||"activity").replaceAll("_"," ")}</b><span>{a.resource_type||"account"}</span></div><small>{new Date(a.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div>):<div className="portal-empty">No portal activity recorded yet.</div>}</div></section>

    {data.client.allow_profile_edit&&<section className="portal-panel portal-profile portal-secondary"><button className="portal-profile-toggle" onClick={()=>setProfileOpen(v=>!v)}><div><h2>Account details</h2><p>Update your billing contact information.</p></div><span>{profileOpen?"Hide":"Edit"}</span></button>{profileOpen&&<div className="portal-profile-body"><div className="portal-profile-grid"><label>Name<input value={profile.name||""} onChange={e=>setProfile((p:any)=>({...p,name:e.target.value}))}/></label><label>Legal name<input value={profile.legal_name||""} onChange={e=>setProfile((p:any)=>({...p,legal_name:e.target.value}))}/></label><label>Email<input type="email" value={profile.email||""} onChange={e=>setProfile((p:any)=>({...p,email:e.target.value}))}/></label><label>Phone<input value={profile.phone||""} onChange={e=>setProfile((p:any)=>({...p,phone:e.target.value}))}/></label><label>PAN<input value={profile.pan||""} onChange={e=>setProfile((p:any)=>({...p,pan:e.target.value}))}/></label><label>GSTIN<input value={profile.gstin||""} onChange={e=>setProfile((p:any)=>({...p,gstin:e.target.value}))}/></label><label className="portal-profile-full">Address<textarea value={Array.isArray(profile.address_lines)?profile.address_lines.join("\n"):""} onChange={e=>setProfile((p:any)=>({...p,address_lines:e.target.value.split("\n").map((x:string)=>x.trim()).filter(Boolean)}))}/></label></div>{profileMessage&&<div className="portal-login-error">{profileMessage}</div>}<button className="portal-button dark" disabled={profileSaving} onClick={async()=>{setProfileSaving(true);setProfileMessage("");const res=await fetch("/api/client-portal/"+encodeURIComponent(slug)+"/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(profile)});const j=await res.json();setProfileSaving(false);setProfileMessage(res.ok?"Profile updated.":j.error||"Could not update profile.");if(res.ok){setData((d:any)=>({...d,client:j}));}}}>{profileSaving?"Saving…":"Save account details"}</button></div>}</section>}

    <footer className="portal-footer">Secure client account · {data.client.email||"Contact your studio for account questions"}</footer>
  </div></main>;
}
