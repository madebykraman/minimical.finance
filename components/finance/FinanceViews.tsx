"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine, ArrowUpRight, Building2, Check, ExternalLink, RefreshCw, ShieldCheck, ChevronRight,
  CircleAlert, FileText, Filter, FolderKanban, Upload, KeyRound, IndianRupee, Phone, Plus, Search, Settings2, WalletCards, Receipt, X, LogOut
} from "lucide-react";
import {
  contentAmount, daysOverdue, invoiceBalance, invoiceTotal, paidTotal, statusLabel,
} from "@/lib/finance/domain";
import type { Activity, Content, Invoice, Payment, Status, ContentKind, PaymentMethod } from "@/lib/finance/domain";
import type { FinanceView } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/client";
import { money, dateLabel } from "@/lib/finance/format";
import { DownloadButton } from "@/components/finance/DownloadButton";

const supabase = createClient();

type Period = "month" | "quarter" | "half" | "year" | "all";

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "verified") {
      setVerified(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("auth") === "invalid") {
      setMessage("That verification link is invalid or has expired. Request a new confirmation email.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const passwordChecks = [
    [password.length >= 12, "12+ characters"],
    [/[a-z]/.test(password), "lowercase"],
    [/[A-Z]/.test(password), "uppercase"],
    [/\d/.test(password), "number"],
    [/[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./]/.test(password), "symbol"],
  ] as const;
  const strongPassword =
    passwordChecks.every(([ok]) => ok) &&
    !email.trim().toLowerCase().includes(password.trim().toLowerCase());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    if (mode === "signup" && !strongPassword) {
      setBusy(false);
      setMessage("Use 12+ characters with upper/lowercase, a number and a symbol. Do not use your email as the password.");
      return;
    }

    const origin = window.location.origin;
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: origin + "/auth/confirm" },
        });

    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email and confirm the address before signing in.");
    }
  }

  async function resendVerification() {
    if (!email.trim()) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin + "/auth/confirm" } });
    setResending(false);
    setMessage(error ? error.message : "A fresh verification email has been sent.");
  }

  return <div className="auth-screen"><div className="auth-card">
    <div className="auth-neutral-mark"><Building2 size={18}/></div>
    <div className="eyebrow">SECURE WORKSPACE</div>
    <h1>{mode === "signin" ? "Welcome back." : "Create access."}</h1>
    <p>Internal invoicing, collections and financial records for the studio.</p>
    {verified && <div className="auth-success"><Check size={15}/> Email verified. You can sign in.</div>}
    <form onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@studio.com"/></label>
      <label>Password<div className="password-wrap">
        <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "signup" ? 12 : 1} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "Create a strong password" : "Your password"}/>
        <button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</button>
      </div></label>
      {mode === "signup" && <div className="password-rules">{passwordChecks.map(([ok,label]) => <span key={label} className={ok ? "ok" : ""}><i>{ok ? "✓" : "·"}</i>{label}</span>)}</div>}
      {message && <div className="auth-message">{message}{/not confirmed|confirm/i.test(message) && <button type="button" className="auth-inline-action" onClick={resendVerification} disabled={resending}>{resending ? "Sending…" : "Resend verification email"}</button>}</div>}
      <button className="primary auth-submit" disabled={busy || (mode === "signup" && !strongPassword)}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setPassword(""); }}>{mode === "signin" ? "Need an account? Create one" : "Already have access? Sign in"}</button>
  </div></div>;
}

export function OrganizationWelcome({organizations,onSelect}:{organizations:any[];onSelect:(id:string)=>void}) {
  const active=organizations.filter(o=>!["dissolved","discontinued"].includes(o.status));
  const archived=organizations.filter(o=>["dissolved","discontinued"].includes(o.status));
  const [showArchived,setShowArchived]=useState(false);
  return <section className="workspace-landing" aria-label="Select organisation">
    <div className="workspace-landing-list">
      {active.map(o=><button key={o.id} className="workspace-minimal-row" onClick={()=>onSelect(o.id)}>
        <span className="workspace-company-logo">{o.logo_path?<img src={o.logo_path} alt=""/>:String(o.name||"O").slice(0,1).toUpperCase()}</span>
        <span className="workspace-minimal-name">{o.name}</span><ChevronRight size={15}/>
      </button>)}
      {showArchived&&archived.map(o=><button key={o.id} className="workspace-minimal-row archived" onClick={()=>onSelect(o.id)}>
        <span className="workspace-company-logo">{String(o.name||"O").slice(0,1).toUpperCase()}</span><span className="workspace-minimal-name">{o.name}</span><span className="workspace-archived-label">Archived</span>
      </button>)}
    </div>
    {archived.length>0&&<div className="workspace-landing-footer"><button className="workspace-archive-toggle" onClick={()=>setShowArchived(v=>!v)}>{showArchived?"Hide archived":"Archived · "+archived.length}</button></div>}
  </section>;
}

export function SettingsView({email,activeOrganizationId,onSignOut}:{email:string;activeOrganizationId:string|null;onSignOut:()=>void}) {
  const [tab,setTab]=useState<"account"|"organizations"|"workspace"|"security">("organizations");
  const [open,setOpen]=useState<string>("");
  const [message,setMessage]=useState("");
  const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);
  async function changePassword(e:FormEvent){e.preventDefault();if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password)||!/[!@#$%^&*()_+\-={}\[\];':"\\|<>?,./]/.test(password))return setMessage("Use 12+ characters with upper/lowercase, a number and a symbol.");if(password!==confirm)return setMessage("Passwords do not match.");setBusy(true);const {error}=await supabase.auth.updateUser({password});setBusy(false);if(error)return setMessage(error.message);setPassword("");setConfirm("");setMessage("Password updated.");}
  return <div className="settings-page">
    <div className="settings-tabs">{([["organizations","Organisations"],["account","Account"],["workspace","System"],["security","Security"]] as const).map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {tab==="organizations"&&<OrganizationsSettings/>}
    {tab==="account"&&<AccountIdentitySettings/>}
    {tab==="workspace"&&<div className="settings-stack">
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="defaults"?"":"defaults")}><span><b>Workspace defaults</b><small>Non-branded system behaviour. Organisation identity is always authoritative.</small></span><span>{open==="defaults"?"Collapse":"Edit"}</span></button>{open==="defaults"&&<div className="settings-section-body"><div className="settings-row"><div className="settings-icon"><Building2 size={16}/></div><div><b>Selected organisation</b><p>{activeOrganizationId||"None selected"}</p></div></div><div className="settings-row"><div className="settings-icon"><FileText size={16}/></div><div><b>PDF renderer</b><p>Geist Sans + Geist Mono, organisation-specific template and identity.</p></div><span className="settings-good">Active</span></div><div className="settings-row"><div className="settings-icon"><ArrowDownToLine size={16}/></div><div><b>Data export</b><p>Download a complete JSON backup of the finance workspace.</p></div><button className="secondary" onClick={()=>{window.location.href="/api/export/finance"}}>Export</button></div></div>}</section>
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="access"?"":"access")}><span><b>Access boundary</b><small>Authenticated owner access and database-enforced workspace isolation.</small></span><span>{open==="access"?"Collapse":"Edit"}</span></button>{open==="access"&&<div className="settings-section-body"><div className="settings-row"><div className="settings-icon"><ShieldCheck size={16}/></div><div><b>Workspace access</b><p>Protected by authenticated session and row-level security.</p></div><span className="settings-good">Protected</span></div></div>}</section>
    </div>}
    {tab==="security"&&<div className="settings-stack">
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="security"?"":"security")}><span><b>Signed-in account</b><small>{email}</small></span><span>{open==="security"?"Collapse":"Edit"}</span></button>{open==="security"&&<div className="settings-section-body"><form className="password-settings" onSubmit={changePassword}><div className="form-grid"><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label></div>{message&&<div className="auth-message">{message}</div>}<button className="primary" disabled={busy}>{busy?"Updating…":"Update password"}</button></form></div>}</section>
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={onSignOut}><span><b>Sign out</b><small>End this authenticated session on this device.</small></span><LogOut size={16}/></button></section>
    </div>}
  </div>;
}

export function AccountIdentitySettings(){
  const [profile,setProfile]=useState<any>({});const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");const [open,setOpen]=useState(false);
  useEffect(()=>{supabase.from("account_profile").select("*").eq("id",true).maybeSingle().then(({data,error})=>{if(data)setProfile(data);if(error)setMessage(error.message);setLoading(false)})},[]);
  async function save(){setSaving(true);const {error}=await supabase.from("account_profile").upsert({...profile,id:true,updated_at:new Date().toISOString()});setSaving(false);setMessage(error?error.message:"Account master data saved.");}
  async function upload(file:File){if(file.size>2*1024*1024)return setMessage("Logo must be under 2 MB.");const path="account/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,file,{upsert:true,contentType:file.type});if(error)return setMessage(error.message);const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setProfile((p:any)=>({...p,logo_path:data.publicUrl}));setMessage("Account logo uploaded.");}
  if(loading)return <div className="empty-state">Loading account master data…</div>;
  return <div className="settings-stack"><div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(!open)}><span><b>Account master data</b><small>Legal identity that sits above all organisations and brands.</small></span><span>{open?"Hide":"Edit"}</span></button>{open&&<div className="settings-section-body"><div className="client-logo-upload">{profile.logo_path?<img src={profile.logo_path} alt="Account logo"/>:<div className="client-logo-placeholder">Logo</div>}<label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/></label></div><div className="form-grid"><label>Legal name<input value={profile.legal_name||""} onChange={e=>setProfile((p:any)=>({...p,legal_name:e.target.value}))}/></label><label>Display name<input value={profile.display_name||""} onChange={e=>setProfile((p:any)=>({...p,display_name:e.target.value}))}/></label><label>Email<input value={profile.email||""} onChange={e=>setProfile((p:any)=>({...p,email:e.target.value}))}/></label><label>Phone<input value={profile.phone||""} onChange={e=>setProfile((p:any)=>({...p,phone:e.target.value}))}/></label><label>PAN<input value={profile.pan||""} onChange={e=>setProfile((p:any)=>({...p,pan:e.target.value}))}/></label></div><label>Address lines<textarea value={Array.isArray(profile.address_lines)?profile.address_lines.join("\n"):""} onChange={e=>setProfile((p:any)=>({...p,address_lines:e.target.value.split("\n").map((v:string)=>v.trim()).filter(Boolean)}))}/></label></div>}</div>{message&&<div className="auth-success">{message}</div>}<button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save account data"}</button></div>;
}

export function OrganizationsSettings(){
  const [orgs,setOrgs]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [editOpen,setEditOpen]=useState(false);
  const [section,setSection]=useState<string>("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [migration,setMigration]=useState<any>(null);

  useEffect(()=>{Promise.all([
    supabase.from("organizations").select("*").order("status").order("name"),
    supabase.from("organisation_migration_status").select("*").maybeSingle()
  ]).then(([orgResult,migrationResult])=>{
    const rows=orgResult.data||[];
    setOrgs(rows);
    if(rows[0])setSelected(rows[0]);
    if(orgResult.error)setMessage(orgResult.error.message);
    if(!migrationResult.error)setMigration(migrationResult.data);
  })},[]);

  function selectOrg(o:any){setSelected(o);setEditOpen(false);setSection("");setMessage("");}
  function toggle(key:string){setSection(section===key?"":key);}
  async function save(){
    if(!selected)return;
    setSaving(true);
    const {error}=await supabase.from("organizations").update({...selected,updated_at:new Date().toISOString()}).eq("id",selected.id);
    setSaving(false);
    setMessage(error?error.message:"Organisation saved.");
    if(!error)setOrgs(v=>v.map(o=>o.id===selected.id?selected:o));
  }
  async function create(){
    const name=window.prompt("Organisation / brand name");
    if(!name?.trim())return;
    const {data,error}=await supabase.from("organizations").insert({name:name.trim(),legal_name:name.trim(),entity_type:"brand"}).select("*").single();
    if(error){setMessage(error.message);return}
    setOrgs(v=>[...v,data]);setSelected(data);setEditOpen(true);setSection("identity");
  }

  return <div className="settings-stack">
    {migration && <section className={"migration-check "+(migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "verified" : "warning")} aria-live="polite">
      <div className="migration-check-icon"><ShieldCheck size={17}/></div>
      <div><b>{migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "Historical organisation migration verified" : "Historical organisation assignment needs attention"}</b><span>{migration.assigned_invoice_count} of {migration.invoice_count} invoices assigned · {migration.organisation_count} organisation(s) referenced · {migration.orphaned_organisation_count} orphaned references.</span></div>
    </section>}

    <section className="data-panel organisations-panel">
      <div className="data-panel-head"><div><h2>Organisations & brands</h2><p>Choose the billing identity you want to edit. Changes are applied to future documents and the organisation’s own records.</p></div><button className="secondary" onClick={create}><Plus size={14}/>Add organisation</button></div>
      <div className="org-grid">{orgs.map(o=><button className={"org-card "+(selected?.id===o.id?"active":"")} key={o.id} onClick={()=>selectOrg(o)}>
        <div className="org-card-logo">{o.logo_path?<img src={o.logo_path} alt=""/>:<span>{String(o.name).slice(0,1).toUpperCase()}</span>}</div>
        <div><b>{o.name}</b><small>{o.entity_type} · {o.status}</small></div><ChevronRight size={14}/>
      </button>)}</div>
    </section>

    {selected&&<section className="settings-section-card org-editor">
      <button className="settings-section-toggle" onClick={()=>setEditOpen(v=>!v)}>
        <span><b>Edit {selected.name}</b><small>Organisation identity, tax, banking, numbering, branding and invoice footer.</small></span>
        <span>{editOpen?"Collapse":"Edit settings"}</span>
      </button>
      {editOpen&&<div className="settings-section-body">
        {([
          ["identity","Identity & contact","Name, legal identity and contact details.",<><label>Name<input value={selected.name||""} onChange={e=>setSelected((p:any)=>({...p,name:e.target.value}))}/></label><label>Legal name<input value={selected.legal_name||""} onChange={e=>setSelected((p:any)=>({...p,legal_name:e.target.value}))}/></label><label>Entity type<select value={selected.entity_type||"brand"} onChange={e=>setSelected((p:any)=>({...p,entity_type:e.target.value}))}><option>brand</option><option>freelance</option><option>company</option><option>studio</option></select></label><label>Status<select value={selected.status||"active"} onChange={e=>setSelected((p:any)=>({...p,status:e.target.value}))}><option>active</option><option>dissolved</option><option>discontinued</option></select></label><label>Email<input value={selected.email||""} onChange={e=>setSelected((p:any)=>({...p,email:e.target.value}))}/></label><label>Phone<input value={selected.phone||""} onChange={e=>setSelected((p:any)=>({...p,phone:e.target.value}))}/></label></>],
          ["tax","Tax & legal","Government and registration identifiers.",<><label>PAN<input value={selected.pan||""} onChange={e=>setSelected((p:any)=>({...p,pan:e.target.value}))}/></label><label>GSTIN<input value={selected.gstin||""} onChange={e=>setSelected((p:any)=>({...p,gstin:e.target.value}))}/></label><label className="full-span">Address lines<textarea value={Array.isArray(selected.address_lines)?selected.address_lines.join("\n"):""} onChange={e=>setSelected((p:any)=>({...p,address_lines:e.target.value.split("\n").map((v:string)=>v.trim()).filter(Boolean)}))}/></label></>],
          ["banking","Banking","Payment identity printed on invoices.",<><label>Bank<input value={selected.bank_name||""} onChange={e=>setSelected((p:any)=>({...p,bank_name:e.target.value}))}/></label><label>Account number<input value={selected.account_number||""} onChange={e=>setSelected((p:any)=>({...p,account_number:e.target.value}))}/></label><label>Branch<input value={selected.branch_name||""} onChange={e=>setSelected((p:any)=>({...p,branch_name:e.target.value}))}/></label><label>IFSC<input value={selected.ifsc_code||""} onChange={e=>setSelected((p:any)=>({...p,ifsc_code:e.target.value}))}/></label></>],
          ["invoicing","Invoicing","Numbering and invoice document behaviour.",<><label>Invoice prefix<input value={selected.invoice_prefix||""} onChange={e=>setSelected((p:any)=>({...p,invoice_prefix:e.target.value}))}/></label><label>Next invoice number<input type="number" value={selected.next_invoice_number||1} onChange={e=>setSelected((p:any)=>({...p,next_invoice_number:Number(e.target.value)||1}))}/></label><label>Invoice template<select value={selected.invoice_template_key||"legacy_elle"} onChange={e=>setSelected((p:any)=>({...p,invoice_template_key:e.target.value}))}><option value="legacy_elle">Legacy template</option><option value="clean">Workspace Clean</option></select></label></>],
          ["branding","Branding & footer","Logo, accent and the small details carried into documents.",<><div className="client-logo-upload"><div className="client-logo-frame">{selected.logo_path?<img src={selected.logo_path} alt="Organisation logo"/>:<div className="client-logo-placeholder">Logo</div>}</div><label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const path="organizations/"+selected.id+"/"+Date.now()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,f,{upsert:true,contentType:f.type});if(error){setMessage(error.message);return}const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setSelected((p:any)=>({...p,logo_path:data.publicUrl}))}}/></label></div><div className="form-grid"><label>Brand accent<input type="text" inputMode="text" pattern="^#[0-9A-Fa-f]{6}$" value={selected.accent_hex||"#6D5DF5"} onChange={e=>setSelected((p:any)=>({...p,accent_hex:e.target.value}))}/></label><label>Footer line 1<input value={selected.invoice_footer_line_1||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_1:e.target.value}))}/></label><label>Footer line 2<input value={selected.invoice_footer_line_2||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_2:e.target.value}))}/></label></div></>]
        ] as const).map(([key,title,description,body])=><div className={"settings-accordion "+(section===key?"open":"")} key={key}>
          <button className="settings-accordion-toggle" onClick={()=>toggle(key)}><span><b>{title}</b><small>{description}</small></span><span>{section===key?"Collapse":"Edit"}</span></button>
          {section===key&&<div className="settings-accordion-body">{body}</div>}
        </div>)}
        <div className="settings-savebar"><span>{message || "Changes are local until you save this organisation."}</span><button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save organisation"}</button></div>
      </div>}
    </section>}
  </div>;
}

export function Overview({stats,invoices,organization,onOpen,onNavigate}:{stats:any;invoices:Invoice[];organization:any;onOpen:(i:Invoice)=>void;onNavigate:(view:FinanceView)=>void}) {
  const today=new Date();
  const open=invoices.filter(i=>invoiceBalance(i)>0);
  const overdue=open.filter(i=>daysOverdue(i)>0);
  const dueSoon=open.filter(i=>i.dueDate&&(() => { const d=new Date(i.dueDate+"T00:00:00"); const days=Math.ceil((d.getTime()-today.getTime())/86400000); return days>=0&&days<=14; })());
  const recent=[...invoices].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6);
  const attention=[...overdue.map(i=>({tone:"danger",label:"#"+i.number+" · "+i.client,meta:daysOverdue(i)+"d overdue",invoice:i})),...dueSoon.filter(i=>!overdue.includes(i)).map(i=>({tone:"warning",label:"#"+i.number+" · "+i.client,meta:"Due soon",invoice:i}))].slice(0,5);
  const overdueValue=overdue.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const collection=stats.total>0?Math.round(stats.collected/stats.total*100):0;
  return <div className="overview-minimal">
    <header className="overview-minimal-head"><div><span className="eyebrow">Financial position</span><h2>{organization?.name}</h2></div><button className="primary" onClick={()=>onNavigate("invoices")}><Receipt size={14}/>Invoices</button></header>
    <section className="overview-position">
      <div><span>Outstanding</span><strong>{money(stats.outstanding)}</strong><small>{overdue.length ? overdue.length+" overdue" : "No overdue invoices"}</small></div>
      <div className="overview-position-facts"><div><span>Collected</span><b>{money(stats.collected)}</b></div><div><span>Overdue</span><b>{money(overdueValue)}</b></div><div><span>Collection</span><b>{collection}%</b></div></div>
      <button className="secondary" onClick={()=>onNavigate("payments")}><WalletCards size={14}/>Payments</button>
    </section>
    <div className="overview-grid">
      <section className="data-panel"><div className="data-panel-head"><div><span className="eyebrow">Latest</span><h2>Invoices</h2></div><button className="text-action" onClick={()=>onNavigate("invoices")}>View all <ArrowUpRight size={12}/></button></div>
        <div className="invoice-register minimal-register">{recent.length?recent.map(i=><button key={i.id} className="invoice-register-row" onClick={()=>onOpen(i)}><b>#{i.number}</b><span><strong>{i.client}</strong><small>{i.project||"No project"} · {dateLabel(i.date)}</small></span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>):<div className="empty-state"><FileText size={18}/><b>No invoices yet.</b><span>Create the first invoice for this organisation.</span></div>}</div>
      </section>
      <section className="data-panel"><div className="data-panel-head"><div><span className="eyebrow">Action queue</span><h2>Needs attention</h2></div><span className="panel-count">{attention.length}</span></div>
        {attention.length?<div className="action-list">{attention.map(a=><button key={a.invoice.id+"-"+a.tone} className="action-row" onClick={()=>onOpen(a.invoice)}><span className={"action-icon "+a.tone}>{a.tone==="danger"?<CircleAlert size={13}/>:<WalletCards size={13}/>}</span><div><b>{a.label}</b><small>{a.meta}</small></div><strong>{money(invoiceBalance(a.invoice))}</strong><ChevronRight size={13}/></button>)}</div>:<div className="empty-state"><ShieldCheck size={18}/><b>Nothing needs attention.</b><span>Open receivables are currently on track.</span></div>}
      </section>
    </div>
  </div>;
}
export function InvoiceView({filtered,query,setQuery,status,setStatus,loading,onOpen,onStatus}:{filtered:Invoice[];query:string;setQuery:(v:string)=>void;status:"all"|Status;setStatus:(v:"all"|Status)=>void;loading:boolean;onOpen:(i:Invoice)=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  const open=filtered.reduce((sum,i)=>sum+invoiceBalance(i),0), overdue=filtered.filter(i=>daysOverdue(i)>0).length;
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Receivables</span><h2>Invoices</h2></div><div className="operations-count"><b>{filtered.length}</b><span>records</span></div></section>
    <section className="register-summary"><div><span>OPEN</span><b>{money(open)}</b></div><div><span>OVERDUE</span><b>{overdue}</b></div><div><span>VIEW</span><b>{status==="all"?"All":statusLabel(status)}</b></div></section>
    <section className="data-panel operations-register">
      <div className="data-panel-head"><div><h2>Register</h2></div><div className="filters"><div className="search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices"/></div><div className="filter"><Filter size={13}/><select value={status} onChange={e=>setStatus(e.target.value as "all"|Status)}><option value="all">All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partial</option><option value="paid">Paid</option><option value="void">Void</option></select></div></div></div>
      {loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading…</div>:filtered.length?<div className="invoice-list">{filtered.map(i=><InvoiceCard key={i.id} invoice={i} onOpen={()=>onOpen(i)} onStatus={onStatus}/>)}</div>:<div className="empty-state"><FileText size={18}/><b>No invoices match.</b><span>Change the search or status filter.</span></div>}
    </section>
  </div>;
}
export function PaymentsView({invoices,onOpenPayment}:{invoices:Invoice[];onOpenPayment:(i:Invoice)=>void}) {
  const rows=invoices.flatMap(i=>i.payments.map(p=>({...p,invoice:i}))).sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||""));
  const collected=rows.reduce((s,r)=>s+r.amount,0), outstanding=invoices.reduce((s,i)=>s+invoiceBalance(i),0);
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Collections</span><h2>Payments</h2></div><div className="operations-count"><b>{rows.length}</b><span>recorded</span></div></section>
    <section className="register-summary"><div><span>COLLECTED</span><b>{money(collected)}</b></div><div><span>OUTSTANDING</span><b>{money(outstanding)}</b></div><div><span>OPEN INVOICES</span><b>{invoices.filter(i=>invoiceBalance(i)>0).length}</b></div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Ledger</h2></div><WalletCards size={15}/></div>
      {rows.length?<div className="simple-list">{rows.map(r=><div className="simple-row payment-record-row" key={r.id} onClick={()=>onOpenPayment(r.invoice)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")onOpenPayment(r.invoice)}}><span>{r.payment_date?dateLabel(r.payment_date):"—"}</span><b>#{r.invoice.number} · {r.invoice.client}</b><span>{r.method.replaceAll("_"," ")}</span><strong>{money(r.amount)}</strong><a className="text-action" href={"/api/payments/"+r.id+"/receipt"} onClick={e=>e.stopPropagation()}>Receipt</a></div>)}</div>:<div className="empty-state"><WalletCards size={18}/><b>No payments recorded.</b><span>Record a payment from an open invoice.</span></div>}
      {!!invoices.filter(i=>invoiceBalance(i)>0).length&&<div className="payment-shortcuts">{invoices.filter(i=>invoiceBalance(i)>0).slice(0,5).map(i=><button key={i.id} className="secondary" onClick={()=>onOpenPayment(i)}>Record · #{i.number}</button>)}</div>}
    </section>
  </div>;
}
export function ClientsView({invoices,organizationId,onOpen,selectedClientId,setSelectedClientId}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void;selectedClientId:string|null;setSelectedClientId:(id:string|null)=>void}) {
  const [clients,setClients]=useState<any[]>([]),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false);
  async function load(){setLoading(true);if(!organizationId){setClients([]);setLoading(false);return}const {data}=await supabase.from("clients").select("*").is("archived_at",null).eq("organization_id",organizationId).order("name");setClients(data||[]);setLoading(false)}
  useEffect(()=>{void load();const h=()=>setCreating(true);window.addEventListener("finance:new-client",h);return()=>window.removeEventListener("finance:new-client",h)},[organizationId]);
  const stats=clients.map(c=>{const rows=invoices.filter(i=>i.clientId===c.id);const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0),open=rows.reduce((s,i)=>s+invoiceBalance(i),0);return {c,rows,billed,open}});
  if(selectedClientId)return <ClientWorkspace clientId={selectedClientId} invoices={invoices} onBack={()=>setSelectedClientId(null)} onOpenInvoice={onOpen} onSaved={load} onArchived={()=>setSelectedClientId(null)}/>;
  const billed=stats.reduce((s,x)=>s+x.billed,0),open=stats.reduce((s,x)=>s+x.open,0);
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Relationships</span><h2>Clients</h2></div><div className="operations-count"><b>{clients.length}</b><span>active</span></div></section>
    <section className="register-summary"><div><span>BILLED</span><b>{money(billed)}</b></div><div><span>OUTSTANDING</span><b>{money(open)}</b></div><div><span>CLIENTS</span><b>{clients.length}</b></div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Directory</h2></div></div>
      {loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading clients…</div>:stats.length?<div className="client-directory">{stats.map(x=><button className="client-directory-row" key={x.c.id} onClick={()=>setSelectedClientId(x.c.id)}><div className="client-avatar">{x.c.logo_path?<img src={x.c.logo_path} alt=""/>:String(x.c.name||"?").slice(0,1).toUpperCase()}</div><div className="client-main"><b>{x.c.name}</b><span>{x.c.email||x.c.legal_name||"Billing profile incomplete"}</span></div><div className="client-meta"><b>{x.rows.length}</b><span>invoices</span></div><div className="client-meta"><b>{money(x.billed)}</b><span>billed</span></div><div className="client-meta"><b>{money(x.open)}</b><span>open</span></div><ChevronRight size={14}/></button>)}</div>:<div className="empty-state"><Building2 size={18}/><b>No clients yet.</b><span>Create a client workspace.</span></div>}
    </section>{creating&&<ClientCreateModal organizationId={organizationId} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);void load()}}/>}
  </div>;
}
export function ClientCreateModal({organizationId,onClose,onSaved}:{organizationId:string|null;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState({name:"",legal_name:"",email:"",phone:"",pan:"",gstin:"",address:""});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  async function save(e:FormEvent){e.preventDefault();if(!form.name.trim())return setMessage("Client name is required.");setSaving(true);const slug=form.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,8);const {error}=await supabase.from("clients").insert({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim()||null,gstin:form.gstin.trim()||null,address_lines:form.address.split("\n").map(v=>v.trim()).filter(Boolean),portal_slug:slug,organization_id:organizationId});setSaving(false);if(error)setMessage(error.message);else onSaved();}
  return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><h2>Create client</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="composer-body"><form className="password-settings" onSubmit={save}><div className="form-grid"><label>Client name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Billed-to / legal name<input value={form.legal_name} onChange={e=>setForm((f:any)=>({...f,legal_name:e.target.value}))}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm((f:any)=>({...f,email:e.target.value}))}/></label><label>Phone<input value={form.phone} onChange={e=>setForm((f:any)=>({...f,phone:e.target.value}))}/></label><label>PAN<input value={form.pan} onChange={e=>setForm((f:any)=>({...f,pan:e.target.value}))}/></label><label>GSTIN<input value={form.gstin} onChange={e=>setForm((f:any)=>({...f,gstin:e.target.value}))}/></label></div><label>Address lines<textarea value={form.address} onChange={e=>setForm((f:any)=>({...f,address:e.target.value}))} placeholder="One line per row"/></label>{message&&<div className="auth-message">{message}</div>}</form></div><div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={e=>((e.currentTarget.parentElement?.previousElementSibling?.querySelector("form") as HTMLFormElement|null)?.requestSubmit())} disabled={saving}>{saving?"Creating…":"Create client"}</button></div></div></div>;
}

export function ClientWorkspace({clientId,invoices,onBack,onOpenInvoice,onSaved,onArchived}:{clientId:string;invoices:Invoice[];onBack:()=>void;onOpenInvoice:(i:Invoice)=>void;onSaved:()=>void;onArchived:()=>void}) {
  const [client,setClient]=useState<any>(null),[documents,setDocuments]=useState<any[]>([]),[tab,setTab]=useState<"overview"|"invoices"|"projects"|"documents"|"statement"|"settings">("overview"),[period,setPeriod]=useState<Period>("all"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[portalPassword,setPortalPassword]=useState("");
  const [form,setForm]=useState<any>({});
  async function load(){setLoading(true);const [{data,error},{data:docs}]=await Promise.all([supabase.from("clients").select("id,name,legal_name,email,phone,pan,gstin,address_lines,portal_enabled,portal_slug,portal_message,allow_profile_edit,show_projects,show_documents,logo_path,portal_password_set_at").eq("id",clientId).single(),supabase.from("documents").select("*").eq("client_id",clientId).order("created_at",{ascending:false})]);if(error)setMessage(error.message);setClient(data);setDocuments(docs||[]);setLoading(false)}
  useEffect(()=>{void load()},[clientId]);
  useEffect(()=>{if(client)setForm({name:client.name||"",legal_name:client.legal_name||"",email:client.email||"",phone:client.phone||"",pan:client.pan||"",gstin:client.gstin||"",address:Array.isArray(client.address_lines)?client.address_lines.join("\n"):"",portal_enabled:!!client.portal_enabled,allow_profile_edit:!!client.allow_profile_edit,show_projects:client.show_projects!==false,show_documents:client.show_documents!==false,portal_message:client.portal_message||"",logo_path:client.logo_path||""})},[client]);
  const rows=invoices.filter(i=>i.clientId===clientId),scoped=rows.filter(i=>withinPeriod(i.date,period)),billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0),paid=scoped.reduce((s,i)=>s+paidTotal(i),0),open=Math.max(billed-paid,0);
  async function save(){setSaving(true);const {error}=await supabase.from("clients").update({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim()||null,gstin:form.gstin.trim()||null,address_lines:form.address.split("\n").map((v:string)=>v.trim()).filter(Boolean),portal_enabled:form.portal_enabled,allow_profile_edit:form.allow_profile_edit,show_projects:form.show_projects,show_documents:form.show_documents,portal_message:form.portal_message.trim()||null,logo_path:form.logo_path||null,updated_at:new Date().toISOString()}).eq("id",clientId);setSaving(false);setMessage(error?error.message:"Saved.");if(!error){setClient((p:any)=>({...p,...form}));onSaved()}}
  async function setPassword(){if(portalPassword.length<10){setMessage("Use at least 10 characters.");return}const r=await fetch("/api/client-portal/"+clientId+"/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:portalPassword})});const j=await r.json();if(!r.ok){setMessage(j.error||"Could not set portal password.");return}setPortalPassword("");setClient((p:any)=>({...p,portal_password_set_at:new Date().toISOString(),portal_enabled:true}));setForm((p:any)=>({...p,portal_enabled:true}));setMessage("Protected portal access enabled.")}
  if(loading)return <div className="empty-state">Loading client workspace…</div>;if(!client)return <div className="empty-state">Client not found.</div>;
  const projectNames=[...new Set(rows.map(i=>i.project).filter(Boolean))];
  return <div className="client-portal">
    <div className="client-portal-head"><button className="back-link" onClick={onBack}>← Clients</button><div className="client-title-lockup">{client.logo_path?<img className="client-logo-small" src={client.logo_path} alt=""/>:<div className="client-avatar">{String(client.name||"?").slice(0,1).toUpperCase()}</div>}<div><span className="eyebrow">Client workspace</span><h2>{client.name}</h2><p>{client.legal_name||"Billing profile incomplete"}{client.email?" · "+client.email:""}</p></div></div><button className="secondary" onClick={()=>setTab("settings")}><Settings2 size={14}/>Settings</button></div>
    <div className="client-tabs">{(["overview","invoices","projects","documents","statement","settings"] as const).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t==="statement"?"Statement":t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    {tab!=="settings"&&<div className="period-strip">{(["month","quarter","half","year","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>}
    {tab==="overview"&&<div className="client-dashboard"><section className="overview-position"><div><span>Outstanding</span><strong>{money(open)}</strong><small>{periodLabel(period)}</small></div><div className="overview-position-facts"><div><span>Billed</span><b>{money(billed)}</b></div><div><span>Collected</span><b>{money(paid)}</b></div><div><span>Invoices</span><b>{scoped.length}</b></div></div></section><div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><h2>Recent invoices</h2></div>{scoped.slice(0,8).map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.project||"Invoice"}</strong><small>{dateLabel(i.date)}</small></span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}{!scoped.length&&<div className="empty-state"><FileText size={18}/><b>No invoices in this period.</b></div>}</section><section className="data-panel"><div className="data-panel-head"><h2>Portal</h2></div><div className="client-detail-list"><div className="client-detail-row"><span>Access</span><strong>{client.portal_enabled&&client.portal_password_set_at?"Protected":"Not enabled"}</strong></div><div className="client-detail-row"><span>Projects</span><strong>{client.show_projects!==false?"Visible":"Hidden"}</strong></div><div className="client-detail-row"><span>Documents</span><strong>{client.show_documents!==false?"Visible":"Hidden"}</strong></div></div></section></div></div>}
    {tab==="invoices"&&<section className="data-panel"><div className="data-panel-head"><h2>Invoices</h2></div>{rows.map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.project||"Invoice"}</strong><small>{dateLabel(i.date)}</small></span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}</section>}
    {tab==="projects"&&<section className="data-panel"><div className="data-panel-head"><h2>Projects</h2></div>{projectNames.length?projectNames.map(p=><div className="client-detail-row" key={p}><span>{p}</span><strong>{money(rows.filter(i=>i.project===p).reduce((s,i)=>s+invoiceTotal(i),0))}</strong></div>):<div className="empty-state"><FolderKanban size={18}/><b>No projects linked.</b></div>}</section>}
    {tab==="documents"&&<section className="data-panel"><div className="data-panel-head"><h2>Documents</h2></div>{documents.length?documents.map(d=><div className="client-detail-row" key={d.id}><span>{d.name||d.file_name||"Document"}</span><a className="text-action" href={d.url||d.storage_path||"#"} target="_blank" rel="noreferrer">Open</a></div>):<div className="empty-state"><FileText size={18}/><b>No shared documents.</b><span>Documents appear here when explicitly shared with this client.</span></div>}</section>}{tab==="statement"&&<section className="data-panel"><div className="data-panel-head"><h2>Account statement</h2><a className="text-action" href={"/api/client-portal/"+clientId+"/statement"}>Download</a></div><div className="statement-summary"><div><span>Billed</span><b>{money(rows.reduce((s,i)=>s+invoiceTotal(i),0))}</b></div><div><span>Collected</span><b>{money(rows.reduce((s,i)=>s+paidTotal(i),0))}</b></div><div><span>Outstanding</span><b>{money(rows.reduce((s,i)=>s+invoiceBalance(i),0))}</b></div></div></section>}
    {tab==="settings"&&<section className="settings-stack">
      <section className="settings-section-card"><div className="settings-section-body"><div className="form-grid">
        <label>Name<input value={form.name||""} onChange={e=>setForm((p:any)=>({...p,name:e.target.value}))}/></label>
        <label>Email<input value={form.email||""} onChange={e=>setForm((p:any)=>({...p,email:e.target.value}))}/></label>
        <label>Phone<input value={form.phone||""} onChange={e=>setForm((p:any)=>({...p,phone:e.target.value}))}/></label>
        <label>GSTIN<input value={form.gstin||""} onChange={e=>setForm((p:any)=>({...p,gstin:e.target.value}))}/></label>
        <label className="full-span">Address<textarea value={form.address||""} onChange={e=>setForm((p:any)=>({...p,address:e.target.value}))}/></label>
      </div>
      <div className="settings-row"><div><b>Portal access</b><p>Protected client-facing workspace.</p></div><label><span>Enable</span><input type="checkbox" checked={!!form.portal_enabled} onChange={e=>setForm((p:any)=>({...p,portal_enabled:e.target.checked}))}/></label></div>
      <div className="settings-row"><div><b>Visible sections</b><p>Projects and documents can be controlled independently.</p></div><label><span>Projects</span><input type="checkbox" checked={form.show_projects!==false} onChange={e=>setForm((p:any)=>({...p,show_projects:e.target.checked}))}/></label><label><span>Documents</span><input type="checkbox" checked={form.show_documents!==false} onChange={e=>setForm((p:any)=>({...p,show_documents:e.target.checked}))}/></label></div>
      {message&&<div className="auth-message">{message}</div>}<div className="client-portal-actions"><button className="primary" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save client"}</button><button className="secondary" onClick={onArchived}>Archive</button></div>
      </div></section>
      <section className="settings-section-card"><div className="settings-section-body"><label>Portal password<input type="password" value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder="10+ characters"/></label><button className="primary" onClick={()=>void setPassword()}>Set protected access</button>{client.portal_slug&&<div className="portal-link-box">/portal/{client.portal_slug}</div>}</div></section>
    </section>}
  </div>;
}
export function periodLabel(p:Period){if(p==="month")return "This month";if(p==="quarter")return "Last 3 months";if(p==="half")return "Last 6 months";if(p==="year"){const n=new Date();const y=n.getMonth()>=3?n.getFullYear():n.getFullYear()-1;return `FY ${y}-${String(y+1).slice(-2)}`;}return "All time";}

export function withinPeriod(date:string,p:Period,today=new Date()){if(p==="all")return true;const d=new Date(date+"T00:00:00"),end=new Date(today.getFullYear(),today.getMonth()+1,0);if(p==="month")return d>=new Date(today.getFullYear(),today.getMonth(),1)&&d<=end;if(p==="quarter"){const start=new Date(today.getFullYear(),today.getMonth()-2,1);return d>=start&&d<=end;}if(p==="half"){const start=new Date(today.getFullYear(),today.getMonth()-5,1);return d>=start&&d<=end;}const fy=new Date(today.getMonth()>=3?today.getFullYear():today.getFullYear()-1,3,1);return d>=fy&&d<=new Date(fy.getFullYear()+1,2,31);}

export function ReportsView({invoices}:{invoices:Invoice[]}) {
  const [period,setPeriod]=useState<Period>("year");const [client,setClient]=useState("all");
  const clients=[...new Set(invoices.map(i=>i.client))].sort();
  const scoped=invoices.filter(i=>(client==="all"||i.client===client)&&withinPeriod(i.date,period));
  const billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0),paid=scoped.reduce((s,i)=>s+paidTotal(i),0),open=scoped.reduce((s,i)=>s+invoiceBalance(i),0);
  const aging={current:0,d1_30:0,d31_60:0,d61_90:0,d90:0};scoped.forEach(i=>{const b=invoiceBalance(i);if(!b)return;const d=daysOverdue(i);if(d<=0)aging.current+=b;else if(d<=30)aging.d1_30+=b;else if(d<=60)aging.d31_60+=b;else if(d<=90)aging.d61_90+=b;else aging.d90+=b});
  const byClient=new Map<string,number>();scoped.forEach(i=>byClient.set(i.client,(byClient.get(i.client)||0)+invoiceTotal(i)));
  return <div className="reports-page"><section className="compact-page-head"><div><span className="eyebrow">Analysis</span><h2>Reports</h2></div></section>
    <div className="report-toolbar"><div className="period-strip">{(["month","quarter","half","year","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div><div className="report-filters"><select value={client} onChange={e=>setClient(e.target.value)}><option value="all">All clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select></div></div>
    <section className="kpis compact-kpis"><Kpi label="Billed" value={money(billed)} detail={periodLabel(period)}/><Kpi label="Collected" value={money(paid)} detail="Recorded"/><Kpi label="Outstanding" value={money(open)} detail="Open balance"/><Kpi label="Collection" value={billed?Math.round(paid/billed*100)+"%":"0%"} detail="Collected / billed"/></section>
    <div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><h2>AR ageing</h2></div><div className="simple-list">{[["Current",aging.current],["1–30 days",aging.d1_30],["31–60 days",aging.d31_60],["61–90 days",aging.d61_90],[">90 days",aging.d90]].map(([label,value])=><div className="simple-row" key={String(label)}><b>{label}</b><span>Receivable</span><span></span><strong>{money(Number(value))}</strong><em>Open</em></div>)}</div></section><section className="data-panel"><div className="data-panel-head"><h2>Revenue by client</h2></div><div className="simple-list">{[...byClient.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="simple-row" key={name}><b>{name}</b><span>Client</span><span></span><strong>{money(value)}</strong><em>Billed</em></div>)}{!byClient.size&&<div className="empty-state">No revenue in this period.</div>}</div></section></div>
  </div>;
}
export function ProjectsView({invoices,organizationId,onOpen}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void}) {
  const [projects,setProjects]=useState<any[]>([]),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false);
  async function load(){setLoading(true);if(!organizationId){setProjects([]);setLoading(false);return}const {data}=await supabase.from("projects").select("*, clients(name), organizations(name)").eq("organization_id",organizationId).order("name");setProjects(data||[]);setLoading(false)}
  useEffect(()=>{void load();const h=()=>setCreating(true);window.addEventListener("finance:new-project",h);return()=>window.removeEventListener("finance:new-project",h)},[organizationId]);
  const fallback=new Map<string,{name:string;client:string;invoices:Invoice[];billed:number;paid:number}>();invoices.forEach(i=>{const key=(i.projectId||i.project)+"::"+(i.clientId||i.client);const x=fallback.get(key)||{name:i.project,client:i.client,invoices:[],billed:0,paid:0};x.invoices.push(i);x.billed+=invoiceTotal(i);x.paid+=paidTotal(i);fallback.set(key,x)});
  const derived=[...fallback.values()].filter(x=>!projects.some(p=>p.name===x.name&&p.clients?.name===x.client));
  const revenue=projects.reduce((s,p)=>s+invoices.filter(i=>i.projectId===p.id).reduce((a,i)=>a+invoiceTotal(i),0),0)+derived.reduce((s,p)=>s+p.billed,0);
  const cost=projects.reduce((s,p)=>s+Number(p.actual_cost||0),0);
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Production</span><h2>Projects</h2></div><div className="operations-count"><b>{projects.length+derived.length}</b><span>records</span></div></section>
    <section className="register-summary"><div><span>ACTIVE</span><b>{projects.filter(p=>p.status==="active").length+derived.length}</b></div><div><span>REVENUE</span><b>{money(revenue)}</b></div><div><span>RECORDED COST</span><b>{money(cost)}</b></div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Register</h2></div></div>{loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading projects…</div>:<div className="client-grid">{projects.map(p=><ProjectCard key={p.id} p={p} invoices={invoices} onOpen={onOpen} onSaved={load}/>)}{derived.map(p=><ProjectCard key={p.name+"::"+p.client} p={{name:p.name,clients:{name:p.client},budget_cost:0,actual_cost:0,status:"active"}} invoices={p.invoices} onOpen={onOpen}/>)}</div>}</section>
    {creating&&<ProjectCreateModal onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);void load()}}/>}
  </div>;
}
export function ProjectCard({p,invoices,onOpen,onSaved}:{p:any;invoices:Invoice[];onOpen:(i:Invoice)=>void;onSaved?:()=>void}) {
 const [editing,setEditing]=useState(false);const rows=invoices.filter(i=>(p.id&&i.projectId===p.id)||(!p.id&&i.project===p.name&&i.client===(p.clients?.name||"")));const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0),paid=rows.reduce((s,i)=>s+paidTotal(i),0);
 return <><article className="client-card project-card"><div className="client-avatar"><FolderKanban size={16}/></div><div><h3>{p.name}</h3><p>{p.clients?.name||"Unassigned client"} · {p.status||"active"}</p></div><strong>{money(billed)}</strong><small>{money(paid)} collected · {money(Math.max(billed-paid,0))} outstanding</small><div className="project-actions">{p.id&&<><button className="secondary mini-action" onClick={()=>setEditing(true)}>Edit</button><button className="secondary mini-action danger-button" onClick={async()=>{if(!window.confirm("Archive this project?"))return;const {error}=await supabase.from("projects").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",p.id);if(error)window.alert(error.message);else onSaved?.()}}>Archive</button></>}</div></article>{editing&&<ProjectEditModal project={p} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onSaved?.()}}/>}</>;
}
export function ProjectEditModal({project,onClose,onSaved}:{project:any;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:project.name||"",status:project.status||"active",description:project.description||"",budget_cost:String(project.budget_cost||0),actual_cost:String(project.actual_cost||0)});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 async function save(e:FormEvent){e.preventDefault();setSaving(true);const {error}=await supabase.from("projects").update({name:form.name.trim(),status:form.status,description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,updated_at:new Date().toISOString()}).eq("id",project.id);setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><h2>Edit project</h2><span className="drawer-context">{project.name}</span></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><form className="composer-body form-grid" onSubmit={save}><label>Name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span">{message}</div>}<div className="drawer-foot full-span"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Save project"}</button></div></form></div></div>;
}

export function ProjectCreateModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:"",client_id:"",organization_id:"",status:"active",description:"",budget_cost:"0",actual_cost:"0"});const [clients,setClients]=useState<any[]>([]);const [orgs,setOrgs]=useState<any[]>([]);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{Promise.all([supabase.from("clients").select("id,name").is("archived_at",null).order("name"),supabase.from("organizations").select("id,name").order("name")]).then(([a,b])=>{setClients(a.data||[]);setOrgs(b.data||[])})},[]);
 async function save(e:FormEvent){e.preventDefault();if(!form.name.trim())return setMessage("Project name is required.");setSaving(true);const {error}=await supabase.from("projects").insert({...form,name:form.name.trim(),description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,client_id:form.client_id||null,organization_id:form.organization_id||null});setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><h2>Create project</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="composer-body"><form className="form-grid" onSubmit={save}><label>Project name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Client<select value={form.client_id} onChange={e=>setForm((f:any)=>({...f,client_id:e.target.value}))}><option value="">Unassigned</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Organisation<select value={form.organization_id} onChange={e=>setForm((f:any)=>({...f,organization_id:e.target.value}))}><option value="">Unassigned</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span">{message}</div>}</form></div><div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>{const formEl=document.querySelector(".composer form") as HTMLFormElement|null;formEl?.requestSubmit()}} disabled={saving}>{saving?"Creating…":"Create project"}</button></div></div></div>;
}

export function activityLabel(action:string) {
  return ({
    invoice_created: "Invoice created",
    invoice_updated: "Invoice updated",
    invoice_status_changed: "Status changed",
    payment_recorded: "Payment recorded",
  } as Record<string,string>)[action] ?? action.replaceAll("_"," ");
}

export function Kpi({icon,label,value,note,detail,accent}:{icon?:ReactNode;label:string;value:string;note?:string;detail?:string;accent?:boolean}) {
  return <div className={"kpi" + (accent ? " accent" : "")}>
    <div className="kpi-top"><span className="kpi-label">{label}</span>{icon&&<span className="kpi-icon">{icon}</span>}</div>
    <div className="kpi-value">{value}</div>
    {(detail||note)&&<div className="kpi-note">{detail ?? note}</div>}
  </div>;
}

export function InvoiceCard({invoice,onOpen,onStatus}:{invoice:Invoice;onOpen:()=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  const total=invoiceTotal(invoice);
  const balance=Math.max(total-paidTotal(invoice),0);
  const overdue=daysOverdue(invoice);
  return <article className="invoice-card" onClick={onOpen}>
    <div className="invoice-main">
      <div className="invoice-id"><span>INV.</span><strong>{invoice.number}</strong></div>
      <div><h3>{invoice.client}</h3><p>{invoice.project || "No project"} · {dateLabel(invoice.date)}</p></div>
    </div>
    <div className="invoice-middle invoice-facts">
      <span><b>ISSUED</b>{dateLabel(invoice.date)}</span>
      <span><b>DUE</b>{invoice.dueDate ? dateLabel(invoice.dueDate) : "—"}</span>
      <span><b>BALANCE</b>{balance ? money(balance) : "Settled"}</span>
      {overdue>0 && <span className="invoice-alert"><CircleAlert size={11}/> {overdue}d overdue</span>}
    </div>
    <div className="invoice-right">
      <div><strong>{money(total)}</strong><span className="invoice-amount-label">TOTAL</span></div>
      <button className={"status "+invoice.status} onClick={e=>{e.stopPropagation();onOpen();}}>{statusLabel(invoice.status)}</button>
      <ChevronRight size={17} className="chevron"/>
    </div>
  </article>;
}

export function InvoiceDrawer({invoice,onClose,onStatus,onSave,onPayment}:{invoice:Invoice;onClose:()=>void;onStatus:(i:Invoice,s:Status)=>void;onSave:(i:Invoice)=>void;onPayment:()=>void}) {
  const [draft,setDraft] = useState(invoice);
  const [organizations,setOrganizations]=useState<any[]>([]);
  useEffect(()=>{supabase.from("organizations").select("id,name,status,next_invoice_number,invoice_prefix").order("name").then(({data})=>setOrganizations(data||[]))},[]);
  useEffect(() => setDraft(invoice), [invoice.id]);
  const unpriced = draft.contents.filter(c => !c.priced).length;
  const patch = (id:string,p:Partial<Content>) => setDraft(d => ({...d,contents:d.contents.map(c => c.id === id ? {...c,...p,amount:p.amount ?? ((p.quantity ?? c.quantity) * (p.rate ?? c.rate ?? 0))} : c)}));
  const add = (kind:ContentKind = "service") => setDraft(d => ({...d,contents:[...d.contents,{id:crypto.randomUUID(),title:kind === "note" ? "Note" : "New content",kind,quantity:1,priced:kind === "note"}]}));
  const remove = (id:string) => setDraft(d => ({...d,contents:d.contents.filter(c => c.id !== id)}));
  return <div className="overlay" onMouseDown={onClose}><aside className="drawer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">INVOICE</div><h2>#{draft.number}</h2><p>{draft.client} · {draft.project}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="drawer-body">
      <div className="invoice-drawer-lockup">
        <span className="invoice-hero-mark">{(organizations.find(o=>o.id===draft.organizationId)?.name||"m").slice(0,1).toUpperCase()}</span>
        <div><b>{organizations.find(o=>o.id===draft.organizationId)?.name||"Organisation"}</b><span>#{draft.number}</span></div>
        <strong>{money(invoiceTotal(draft))}</strong>
      </div>
      <div className="drawer-summary compact-summary">
        <div><span>Collected</span><strong>{money(paidTotal(draft))}</strong></div>
        <div><span>Balance</span><strong>{money(Math.max(invoiceTotal(draft)-paidTotal(draft),0))}</strong></div>
        <div><span>Status</span><select className="status-select" value={draft.status} onChange={async e=>{const next=e.target.value as Status; setDraft(d=>({...d,status:next})); await onStatus({...draft,status:next},next)}}><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div>
      </div>
      <div className="invoice-meta-grid">
        <label>Issue date<input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label>
        <label>Due date<input type="date" value={draft.dueDate ?? ""} onChange={e=>setDraft(d=>({...d,dueDate:e.target.value || null}))}/></label><label>Billing organisation<select value={draft.organizationId ?? ""} onChange={e=>setDraft(d=>({...d,organizationId:e.target.value||null}))} required>{organizations.map(o=><option key={o.id} value={o.id} disabled={["dissolved","discontinued"].includes(o.status)}>{o.name}{["dissolved","discontinued"].includes(o.status)?" · historical":""}</option>)}</select></label>
      </div>
      {unpriced > 0 && <div className="integrity warning"><CircleAlert size={17}/><div><b>{unpriced} content item{unpriced > 1 ? "s" : ""} still unpriced</b><span>Visible and retained, but excluded from the financial total until priced.</span></div></div>}
      {draft.sourceTotal != null && draft.sourceTotal !== invoiceTotal(draft) && <div className="integrity warning"><CircleAlert size={17}/><div><b>Source total differs from calculated total</b><span>Recorded source total: {money(draft.sourceTotal)} · calculated from contents: {money(invoiceTotal(draft))}</span></div></div>}
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Everything being billed on this invoice.</p></div><button className="secondary" onClick={() => add()}><Plus size={15}/>Add content</button></div>
        <div className="content-table">{draft.contents.map((c,idx) => <div className="content-row" key={c.id}>
          <div className="row-index">{String(idx + 1).padStart(2,"0")}</div><input className="content-title" value={c.title} onChange={e => patch(c.id,{title:e.target.value})}/><select value={c.kind} onChange={e => patch(c.id,{kind:e.target.value as ContentKind})}><option value="service">Service</option><option value="adjustment">Adjustment</option><option value="note">Note</option></select><input className="number-input" type="number" placeholder="Qty" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})}/><input className="number-input" type="number" placeholder="Rate" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})}/><div className={"row-amount" + (!c.priced ? " muted" : "")}>{c.priced ? money(contentAmount(c)) : "TBD"}</div><button className="tiny-delete" onClick={() => remove(c.id)}><X size={14}/></button>
        </div>)}</div>
        <div className="add-content-menu"><button onClick={() => add("service")}><Plus size={14}/>Service / deliverable</button><button onClick={() => add("adjustment")}><Plus size={14}/>Adjustment</button><button onClick={() => add("note")}><Plus size={14}/>Note / internal line</button></div>
      </div>
      {draft.adjustment && <div className="integrity"><CircleAlert size={17}/><div><b>Adjustment context</b><span>{draft.adjustment}</span></div></div>}
      <div className="block payments-block"><div className="block-head"><div><h3>Payments</h3><p>{draft.payments.length} recorded · {money(paidTotal(draft))} collected</p></div><button className="secondary" onClick={onPayment} disabled={paidTotal(draft)>=invoiceTotal(draft)}><Plus size={15}/>Record payment</button></div>{draft.payments.length ? <div className="payment-list">{draft.payments.map(p=><div key={p.id}><span>{p.payment_date || "Date unknown"} · {p.method}</span><strong>{money(p.amount)}</strong></div>)}</div> : <div className="payment-empty">No payment recorded yet.</div>}</div>
      <div className="block activity-block"><div className="block-head"><div><h3>History</h3><p>Recorded changes and financial events.</p></div></div>
        {draft.activities.length ? <div className="activity-list">{draft.activities.slice(0,8).map(a => <div className="activity-item" key={a.id}><span className="activity-dot"/><div><b>{activityLabel(a.action)}</b><small>{new Date(a.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</small></div></div>)}</div> : <div className="payment-empty">No history recorded yet.</div>}
      </div>
      <div className="block notes-block"><label>Invoice notes</label><textarea value={draft.notes ?? ""} onChange={e => setDraft(d => ({...d,notes:e.target.value}))} placeholder="Add context, payment terms, client notes..."/></div>
    </div>
    <div className="drawer-foot"><DownloadButton label="Download PDF" onClick={() => { window.location.href = "/api/invoices/" + draft.id + "/pdf"; }}/><button className="secondary" onClick={onClose}>Close</button><button className="primary" onClick={() => onSave(draft)}><Check size={16}/>Save changes</button></div>
  </aside></div>;
}

export function InvoiceComposer({initialNumber,initialOrganizationId,onClose,onCreate}:{initialNumber:string;initialOrganizationId:string|null;onClose:()=>void;onCreate:(d:{number:string;client:string;project:string;date:string;dueDate:string;organizationId?:string|null;contents:Content[]})=>void}) {
  const [number,setNumber] = useState(initialNumber);
  const [client,setClient] = useState("ELLE");
  const [project,setProject] = useState("Video Editing");
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [dueDate,setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10));
  const [contents,setContents] = useState<Content[]>([{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  const [organizations,setOrganizations]=useState<any[]>([]);const [organizationId,setOrganizationId]=useState<string>(initialOrganizationId||"");
  useEffect(()=>{supabase.from("organizations").select("id,name,status,next_invoice_number,invoice_prefix").eq("status","active").order("name").then(({data})=>{setOrganizations(data||[]);if(initialOrganizationId)setOrganizationId(initialOrganizationId);else if(data?.[0])setOrganizationId(data[0].id)})},[initialOrganizationId]);
  useEffect(()=>{const o=organizations.find(x=>x.id===organizationId);if(o)setNumber(String(o.invoice_prefix||"")+String(o.next_invoice_number||1))},[organizationId,organizations]);
  const total = contents.reduce((s,c) => s + contentAmount(c), 0);
  const patch = (id:string,p:Partial<Content>) => setContents(v => v.map(c => c.id === id ? {...c,...p} : c));
  const add = () => setContents(v => [...v,{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><h2>Create invoice</h2></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="composer-body"><div className="form-grid"><label>Invoice number<input value={number} onChange={e => setNumber(e.target.value)} placeholder="Automatic"/></label><label>Client<input value={client} onChange={e => setClient(e.target.value)}/></label><label>Project<input value={project} onChange={e => setProject(e.target.value)}/></label><label>Billing organisation<select value={organizationId} onChange={e=>setOrganizationId(e.target.value)}>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Issue date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div>
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Billable, adjustment and unpriced content can coexist.</p></div><button className="secondary" onClick={add}><Plus size={15}/>Add content</button></div>
        {contents.map((c,idx) => <div className="composer-row" key={c.id}><span>{idx + 1}</span><input value={c.title} onChange={e => patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input type="number" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})} placeholder="Qty"/><input type="number" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})} placeholder="Rate"/><b>{c.priced && c.rate ? money(contentAmount(c)) : "TBD"}</b></div>)}
      </div><div className="total-box"><span>Invoice total</span><strong>{money(total)}</strong></div>
    </div>
    <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!number || !contents.some(c => c.title.trim())} onClick={() => onCreate({number,client,project,date,dueDate,organizationId,contents})}>Create draft</button></div>
  </div></div>;
}

export function PaymentComposer({invoice,onClose,onCreate}:{invoice:Invoice;onClose:()=>void;onCreate:(i:Invoice,a:number,d:string,m:string,r:string)=>void}) {
  const [amount,setAmount] = useState(String(Math.max(invoiceTotal(invoice)-paidTotal(invoice),0)));
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [method,setMethod] = useState("bank_transfer");
  const [reference,setReference] = useState("");
  const balance = Math.max(invoiceTotal(invoice)-paidTotal(invoice),0);
  return <div className="overlay" onMouseDown={onClose}><div className="payment-composer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><h2>Record payment</h2><span className="drawer-context">{invoice.client} · {money(balance)} outstanding</span></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="payment-form">
      <label>Amount<input type="number" min="1" max={balance} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
      <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label>
      <label>Reference <span className="optional">(optional)</span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / transaction reference"/></label>
    </div>
    <div className="payment-total"><span>Remaining after payment</span><strong>{money(Math.max(balance-(Number(amount)||0),0))}</strong></div>
    <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!Number(amount)||Number(amount)<=0||Number(amount)>balance} onClick={()=>onCreate(invoice,Number(amount),date,method,reference)}>Record payment</button></div>
  </div></div>;
}
