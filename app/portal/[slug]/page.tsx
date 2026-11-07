"use client";
import {useEffect,useState,type FormEvent} from "react";
import {ArrowDownToLine,ArrowRight,FileText,LockKeyhole,LogOut,ReceiptText,ShieldCheck} from "lucide-react";
import {money,dateLabel} from "@/lib/tracker";
type Invoice={number:string;total:number;paid:number;balance:number;date:string|null;status:string;projects:{name:string;amount:number|null}[]};
type Data={client:string;owner:string;sourceDate:string;invoices:Invoice[];documents:{id:string;file_name:string;invoice_number:string|null}[]};
export default function Portal(){
  const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(true);
  const [password,setPassword]=useState(""),[error,setError]=useState(""),[signing,setSigning]=useState(false);
  const [open,setOpen]=useState<string|null>(null);
  async function load(){
    setBusy(true);try{const res=await fetch("/api/portal/data",{cache:"no-store"});
      if(res.ok){setData(await res.json());setError("");}
      else if(res.status===401){setData(null);}
      else{setError("Client portal is not available right now.");}
    }catch{setError("Could not connect. Please retry.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load()},[]);
  async function login(e:FormEvent){
    e.preventDefault();setSigning(true);setError("");
    try{const res=await fetch("/api/portal/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const json=await res.json().catch(()=>({}));
      if(!res.ok)throw new Error(json.error||"Unable to sign in.");
      setPassword("");await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to sign in.");}
    finally{setSigning(false);}
  }
  const logout=async()=>{await fetch("/api/portal/logout",{method:"POST"});setData(null);setOpen(null);setPassword("");};
  const total=data?.invoices.reduce((s,i)=>s+i.balance,0)||0;
  if(busy&&!data)return <main className="client-page"><div className="client-login-box"><span className="client-emblem"><LockKeyhole size={21}/></span><p>Opening your secure account…</p></div></main>;
  if(!data)return <main className="client-page"><div className="client-login-box"><div className="client-mark">f.</div><p className="overline">SECURE CLIENT ACCESS</p><h1>Your account, simplified.</h1><p className="client-sub">Enter the password shared by your finance contact to view invoices and files.</p>
    <form onSubmit={login} className="form-stack"><label className="field-label">Portal password<input required autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="client-error" role="alert">{error}</p>}<button className="button button-primary button-large" disabled={signing}>{signing?"Opening…":"Open account"}<ArrowRight size={16}/></button></form>
    <p className="client-secure"><ShieldCheck size={15}/>Password-protected account</p>
  </div></main>;
  return <main className="client-page"><div className="client-shell">
    <header className="client-header"><div className="client-brand"><div className="client-mark">f.</div><div><small>CLIENT FINANCE PORTAL</small><strong>{data.owner}</strong></div></div><button className="button" onClick={()=>void logout()}><LogOut size={16}/>Sign out</button></header>
    <div className="client-welcome"><p className="page-kicker">ACCOUNT STATEMENT</p><h1>{data.client}</h1><p>Invoices and records, in one quiet place.</p></div>
    <section className="client-balance"><div><span>OUTSTANDING BALANCE</span><strong>{money(total)}</strong><small>From {data.invoices.filter(i=>i.balance>0).length} open invoices</small></div><div className="client-balance-aside"><span>ORIGINAL TRACKER DATE</span><strong>{dateLabel(data.sourceDate)}</strong></div></section>
    <section className="client-section"><div className="client-section-head"><h2>Invoices</h2><span>{data.invoices.length} records</span></div>
      <div className="client-invoice-list">{data.invoices.map(i=><div className="client-invoice" key={i.number}>
        <button className="client-invoice-toggle" onClick={()=>setOpen(open===i.number?null:i.number)} aria-expanded={open===i.number}>
          <span className="client-invoice-icon"><ReceiptText size={19}/></span><span className="client-invoice-name"><strong>Invoice #{i.number}</strong><small>{dateLabel(i.date)} · {i.status}</small></span>
          <span className="client-invoice-amount"><strong>{money(i.balance)}</strong><small>remaining</small></span><ArrowRight size={17} className={open===i.number?"rotated":""}/></button>
        {open===i.number&&<div className="client-invoice-detail"><div className="client-detail-facts"><span>Invoice total<strong>{money(i.total)}</strong></span><span>Paid<strong>{money(i.paid)}</strong></span></div>
          {i.projects.map((p,k)=><div className="client-project-row" key={k}><span>{p.name.replace(/^Elle India_/,"").replaceAll("_Video Editing","")}</span><strong>{money(p.amount)}</strong></div>)}
          <a className="button" target="_blank" rel="noopener noreferrer" href={"/api/invoices/"+encodeURIComponent(i.number)+"/pdf"}><ArrowDownToLine size={15}/>View summary PDF</a>
        </div>}
      </div>)}</div>
    </section>
    {data.documents.length>0&&<section className="client-section"><div className="client-section-head"><h2>Shared documents</h2><span>{data.documents.length}</span></div>{data.documents.map(d=><a className="client-document" key={d.id} href={"/api/documents/"+d.id} target="_blank" rel="noopener noreferrer"><FileText size={18}/><span>{d.file_name}</span><ArrowDownToLine size={17}/></a>)}</section>}
    <footer className="client-footer"><ShieldCheck size={15}/>Private client account · Contact your finance representative for questions.</footer>
  </div></main>;
}
