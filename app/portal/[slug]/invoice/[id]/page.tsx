"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const supabase=createClient();
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);

export default function ClientInvoicePage({params}:{params:Promise<{slug:string;id:string}>}){
  const [p,setP]=useState<{slug:string;id:string}|null>(null);const [data,setData]=useState<any>(null);const [error,setError]=useState("");
  useEffect(()=>{params.then(setP)},[params]);
  useEffect(()=>{if(!p)return;const token=new URLSearchParams(window.location.search).get("token")||"";supabase.rpc("get_client_portal",{p_slug:p.slug,p_token:token}).then(({data,error})=>{if(error){setError("This portal link is invalid or expired.");return}setData((data as any).invoices.find((i:any)=>i.id===p.id)||null)})},[p]);
  if(error)return <main className="portal-screen"><div className="portal-card"><h1>Invoice unavailable</h1><p>{error}</p></div></main>;
  if(!p||!data)return <main className="portal-screen"><div className="portal-card">Loading invoice…</div></main>;
  const token=new URLSearchParams(window.location.search).get("token")||"";
  return <main className="portal-screen"><div className="portal-shell">
    <header className="portal-header"><div><a className="back-link" href={"/portal/"+p.slug+"?token="+encodeURIComponent(token)}><ArrowLeft size={13}/> Account</a><div className="portal-kicker">INVOICE</div><h1>#{data.invoice_number}</h1><p>{data.issue_date}{data.due_date?" · Due "+data.due_date:""}</p></div></header>
    <section className="portal-hero"><div><span>AMOUNT DUE</span><strong>{money(data.balance)}</strong><p>{data.balance>0?(data.is_overdue?"Overdue":"Open"):"Paid"}</p></div><div className="portal-hero-actions"><span className="portal-button">Included in account statement</span></div></section>
    <section className="portal-kpis"><div><span>Invoice total</span><b>{money(data.total)}</b></div><div><span>Paid</span><b>{money(data.paid)}</b></div><div><span>Outstanding</span><b>{money(data.balance)}</b></div><div><span>Status</span><b>{data.status}</b></div></section>
    <footer className="portal-footer">This invoice is part of your consolidated minimical.finance account.</footer>
  </div></main>;
}
