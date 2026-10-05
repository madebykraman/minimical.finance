"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowUpRight, Building2, Check, ExternalLink, RefreshCw, ShieldCheck, ChevronRight,
  CircleAlert, FileText, FolderKanban, Upload, KeyRound, IndianRupee, Mail, Phone, Plus, Search, Settings2, Share2, WalletCards, Receipt, X, LogOut, ArrowLeftRight
} from "lucide-react";
import {
  contentAmount, daysOverdue, invoiceBalance, invoiceTotal, paidTotal, statusLabel,
} from "@/lib/finance/domain";
import type { Activity, Content, Invoice, Payment, Status, ContentKind, PaymentMethod } from "@/lib/finance/domain";
import { ALL_ORGANIZATIONS_ID, isAllOrganizationsScope, type FinanceView } from "@/lib/finance/types";
import { createClient } from "@/lib/supabase/client";
import { money, dateLabel } from "@/lib/finance/format";
import { DownloadButton } from "@/components/finance/DownloadButton";
import { InlineLoader, ManagedDialog } from "@/components/finance/FinanceUI";
import { MobileQuickActions } from "@/components/finance/MobileQuickActions";
import { SegmentedTabs, StatusPill, type FinanceStatus } from "@/components/finance/FinancePrimitives";
import { DOCUMENT_TEMPLATES } from "@/lib/finance/document-templates";

const supabase = createClient();

async function downloadFile(url:string, fallbackName:string) {
  const response=await fetch(url,{credentials:"same-origin"});
  if(!response.ok) throw new Error("Download failed.");
  const blob=await response.blob();
  const objectUrl=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=objectUrl;
  anchor.download=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/i)?.[1]||fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

async function shareFile(url:string,fallbackName:string,title:string) {
  const response=await fetch(url,{credentials:"same-origin"});
  if(!response.ok) throw new Error("Share preparation failed.");
  const blob=await response.blob();
  const fileName=response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/i)?.[1]||fallbackName;
  const file=new File([blob],fileName,{type:blob.type||"application/pdf"});
  if(typeof navigator.share==="function"&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    await navigator.share({title,files:[file]});
    return;
  }
  const objectUrl=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=objectUrl;anchor.download=fileName;document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(objectUrl);
}

type Period = "month" | "3months" | "6months" | "fy" | "all";

function validateOrganizationDraft(org:any){
  const name=String(org?.name||"").trim();
  const email=String(org?.email||"").trim();
  const pan=String(org?.pan||"").trim().toUpperCase();
  const gstin=String(org?.gstin||"").trim().toUpperCase();
  const ifsc=String(org?.ifsc_code||"").trim().toUpperCase();
  const accent=String(org?.accent_hex||"").trim();
  const next=Number(org?.next_invoice_number||1);
  if(!name)return "Organisation name is required.";
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return "Enter a valid organisation email.";
  if(pan&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))return "PAN must use the standard 10-character format.";
  if(gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return "GSTIN must use the standard 15-character format.";
  if(ifsc&&!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))return "IFSC must use the standard 11-character format.";
  if(accent&&!/^#[0-9A-Fa-f]{6}$/.test(accent))return "Brand accent must be a six-digit hex colour.";
  if(!Number.isInteger(next)||next<1)return "Next invoice number must be a positive whole number.";
  return "";
}
function validateClientDraft(client:any){
  const name=String(client?.name||"").trim();
  const email=String(client?.email||"").trim();
  const pan=String(client?.pan||"").trim().toUpperCase();
  const gstin=String(client?.gstin||"").trim().toUpperCase();
  if(!name)return "Client name is required.";
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return "Enter a valid client email.";
  if(pan&&!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan))return "Client PAN must use the standard 10-character format.";
  if(gstin&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return "Client GSTIN must use the standard 15-character format.";
  return "";
}
function normalizedOrganizationDraft(org:any){
  return {
    ...org,
    name:String(org?.name||"").trim(),
    legal_name:String(org?.legal_name||"").trim()||null,
    email:String(org?.email||"").trim()||null,
    phone:String(org?.phone||"").trim()||null,
    pan:String(org?.pan||"").trim().toUpperCase()||null,
    gstin:String(org?.gstin||"").trim().toUpperCase()||null,
    ifsc_code:String(org?.ifsc_code||"").trim().toUpperCase()||null,
    accent_hex:String(org?.accent_hex||"").trim()||null,
    invoice_prefix:String(org?.invoice_prefix||"").trim(),
    payee_name:String(org?.payee_name||"").trim()||null,
    bank_name:String(org?.bank_name||"").trim()||null,
    branch_name:String(org?.branch_name||"").trim()||null,
    branch_code:String(org?.branch_code||"").trim()||null,
    account_number:String(org?.account_number||"").trim()||null,
    invoice_footer_line_1:String(org?.invoice_footer_line_1||"").trim()||null,
    invoice_footer_line_2:String(org?.invoice_footer_line_2||"").trim()||null,
    show_minbooks_branding:false,
  };
}

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
    } else if (result.data.session) {
      window.location.assign("/admin");
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
    <p>Invoices, receipts, statements and financial records — in one workspace.</p>
    {verified && <div className="auth-success"><Check size={15}/> Email verified. You can sign in.</div>}
    <form onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@studio.com"/></label>
      <label>Password<div className="password-wrap">
        <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === "signup" ? 12 : 1} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "Create a strong password" : "Your password"}/>
        <button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</button>
      </div></label>
      {mode === "signup" && <div className="password-rules">{passwordChecks.map(([ok,label]) => <span key={label} className={ok ? "ok" : ""}><i>{ok ? "✓" : "·"}</i>{label}</span>)}</div>}
      {message && <div className="auth-message">{message}{/not confirmed|confirm/i.test(message) && <button type="button" className="auth-inline-action" onClick={resendVerification} disabled={resending}>{resending ? "Sending…" : "Resend verification email"}</button>}</div>}
      <button type="submit" className="primary auth-submit" disabled={busy || (mode === "signup" && !strongPassword)}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setPassword(""); }}>{mode === "signin" ? "Need an account? Create one" : "Already have access? Sign in"}</button>
  </div></div>;
}

export function SettingsView({email,activeOrganizationId,onSignOut}:{email:string;activeOrganizationId:string|null;onSignOut:()=>void}) {
  const [tab,setTab]=useState<"account"|"organizations"|"workspace"|"security">("organizations");
  const [open,setOpen]=useState<string>("");
  const [message,setMessage]=useState("");
  const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);
  async function changePassword(e:FormEvent){e.preventDefault();if(password.length<12||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/\d/.test(password)||!/[!@#$%^&*()_+\-={}\[\];':"\\|<>?,./]/.test(password))return setMessage("Use 12+ characters with upper/lowercase, a number and a symbol.");if(password!==confirm)return setMessage("Passwords do not match.");setBusy(true);const {error}=await supabase.auth.updateUser({password});setBusy(false);if(error)return setMessage(error.message);setPassword("");setConfirm("");setMessage("Password updated.");}
  return <div className="settings-page">
    <div className="settings-tabs">{([["organizations","Organisations"],["account","Account"],["workspace","System"],["security","Security"]] as const).map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
    {tab==="organizations"&&<OrganizationsSettings activeOrganizationId={activeOrganizationId}/>}
    {tab==="account"&&<AccountIdentitySettings organizationId={activeOrganizationId}/>}
    {tab==="workspace"&&<div className="settings-stack">
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="defaults"?"":"defaults")}><span><b>Workspace defaults</b><small>Non-branded system behaviour. Organisation identity is always authoritative.</small></span><span>{open==="defaults"?"Collapse":"Edit"}</span></button>{open==="defaults"&&<div className="settings-section-body"><div className="settings-row"><div className="settings-icon"><Building2 size={16}/></div><div><b>Selected organisation</b><p>{isAllOrganizationsScope(activeOrganizationId)?"All organisations":activeOrganizationId||"None selected"}</p></div></div><div className="settings-row"><div className="settings-icon"><FileText size={16}/></div><div><b>PDF renderer</b><p>Geist Sans + Geist Mono, organisation-specific template and identity.</p></div><span className="settings-good">Active</span></div><div className="settings-row"><div className="settings-icon"><ArrowDownToLine size={16}/></div><div><b>Data export</b><p>Download a complete JSON backup of the finance workspace.</p></div><DownloadButton label="Export backup" loadingLabel="Preparing" doneLabel="Ready" onClick={()=>downloadFile("/api/export/finance","finance-workspace-backup.json")} /></div></div>}</section>
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="access"?"":"access")}><span><b>Access boundary</b><small>Authenticated owner access and database-enforced workspace isolation.</small></span><span>{open==="access"?"Collapse":"Edit"}</span></button>{open==="access"&&<div className="settings-section-body"><div className="settings-row"><div className="settings-icon"><ShieldCheck size={16}/></div><div><b>Workspace access</b><p>Protected by authenticated session and row-level security.</p></div><span className="settings-good">Protected</span></div></div>}</section>
    </div>}
    {tab==="security"&&<div className="settings-stack">
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(open==="security"?"":"security")}><span><b>Signed-in account</b><small>{email}</small></span><span>{open==="security"?"Collapse":"Edit"}</span></button>{open==="security"&&<div className="settings-section-body"><form className="password-settings" onSubmit={changePassword}><div className="form-grid"><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label></div>{message&&<div className="auth-message">{message}</div>}<button type="submit" className="primary" disabled={busy}>{busy?"Updating…":"Update password"}</button></form></div>}</section>
      <section className="settings-section-card"><button className="settings-section-toggle" onClick={onSignOut}><span><b>Sign out</b><small>End this authenticated session on this device.</small></span><LogOut size={16}/></button></section>
    </div>}
  </div>;
}

export function AccountIdentitySettings({organizationId}:{organizationId:string|null}){
  const [organization,setOrganization]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [identityOpen,setIdentityOpen]=useState(true);
  const [brandingOpen,setBrandingOpen]=useState(false);

  async function load(){
    setLoading(true);
    if(!organizationId||isAllOrganizationsScope(organizationId)){setOrganization(null);setLoading(false);return}
    const {data,error}=await supabase.from("organizations").select("*").eq("id",organizationId).maybeSingle();
    if(error)setMessage(error.message);
    setOrganization(data||null);
    setLoading(false);
  }
  useEffect(()=>{void load()},[organizationId]);

  async function save(){
    if(!organization)return;
    const validation=validateOrganizationDraft(organization);
    if(validation){setMessage(validation);return}
    const next=normalizedOrganizationDraft(organization);
    setSaving(true);
    const {error}=await supabase.from("organizations").update({...next,updated_at:new Date().toISOString()}).eq("id",organization.id);
    setSaving(false);
    setMessage(error?error.message:"Organisation identity saved.");
    if(!error){setOrganization(next);window.dispatchEvent(new Event("finance:organization-updated"))}
  }
  async function upload(file:File){
    if(!organization)return;
    if(!["image/png","image/jpeg"].includes(file.type)){setMessage("Logo must be a PNG or JPEG.");return}
    if(file.size>2*1024*1024){setMessage("Logo must be under 2 MB.");return}
    const path="organizations/"+organization.id+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
    const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,file,{upsert:true,contentType:file.type});
    if(error){setMessage(error.message);return}
    const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);
    setOrganization((p:any)=>({...p,logo_path:data.publicUrl}));
    setMessage("Logo uploaded. Save the organisation to persist the identity.");
  }

  if(loading)return <div className="empty-state">Loading selected organisation…</div>;
  if(!organization)return <div className="empty-state"><Building2 size={18}/><b>No organisation selected.</b><span>Select a billing organisation before editing its identity.</span></div>;

  return <div className="settings-stack selected-org-settings">
    <section className="settings-context-card">
      <div className="settings-context-mark">{organization.logo_path?<img src={organization.logo_path} alt=""/>:String(organization.name||"?").slice(0,1).toUpperCase()}</div>
      <div><span className="eyebrow">SELECTED ORGANISATION</span><h2>{organization.name}</h2><p>These fields are the billing identity used by invoices, PDFs, client records and organisation-level settings.</p></div>
    </section>
    <section className="settings-section-card">
      <button className="settings-section-toggle" onClick={()=>setIdentityOpen(v=>!v)}><span><b>Organisation identity</b><small>{organization.legal_name||organization.name} · {organization.entity_type||"brand"}</small></span><span>{identityOpen?"Collapse":"Edit"}</span></button>
      {identityOpen&&<div className="settings-section-body">
        <div className="client-logo-upload"><div className="client-logo-frame">{organization.logo_path?<img src={organization.logo_path} alt="Organisation logo"/>:<div className="client-logo-placeholder">Logo</div>}</div><label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/></label></div>
        <div className="form-grid">
          <label>Name<input value={organization.name||""} onChange={e=>setOrganization((p:any)=>({...p,name:e.target.value}))}/></label>
          <label>Legal name<input value={organization.legal_name||""} onChange={e=>setOrganization((p:any)=>({...p,legal_name:e.target.value}))}/></label>
          <label>Email<input value={organization.email||""} onChange={e=>setOrganization((p:any)=>({...p,email:e.target.value}))}/></label>
          <label>Phone<input value={organization.phone||""} onChange={e=>setOrganization((p:any)=>({...p,phone:e.target.value}))}/></label>
          <label>PAN<input value={organization.pan||""} onChange={e=>setOrganization((p:any)=>({...p,pan:e.target.value}))}/></label>
          <label>GSTIN<input value={organization.gstin||""} onChange={e=>setOrganization((p:any)=>({...p,gstin:e.target.value}))}/></label>
          <label className="full-span">Address lines<textarea value={Array.isArray(organization.address_lines)?organization.address_lines.join("\n"):""} onChange={e=>setOrganization((p:any)=>({...p,address_lines:e.target.value.split("\n").map((v:string)=>v.trim()).filter(Boolean)}))}/></label>
        </div>
      </div>}
    </section>
    <section className="settings-section-card">
      <button className="settings-section-toggle" onClick={()=>setBrandingOpen(v=>!v)}><span><b>Branding & documents</b><small>Accent, footer, numbering and invoice template for {organization.name}.</small></span><span>{brandingOpen?"Collapse":"Edit"}</span></button>
      {brandingOpen&&<div className="settings-section-body"><div className="form-grid">
        <label>Brand accent<input value={organization.accent_hex||"#7046dd"} onChange={e=>setOrganization((p:any)=>({...p,accent_hex:e.target.value}))}/></label>
        <label>Invoice prefix<input value={organization.invoice_prefix||""} onChange={e=>setOrganization((p:any)=>({...p,invoice_prefix:e.target.value}))}/></label>
        <label>Next invoice number<input type="number" value={organization.next_invoice_number||1} onChange={e=>setOrganization((p:any)=>({...p,next_invoice_number:Number(e.target.value)||1}))}/></label>
        <label>Invoice template<select value={organization.invoice_template_key||"clean"} onChange={e=>setOrganization((p:any)=>({...p,invoice_template_key:e.target.value}))}>{DOCUMENT_TEMPLATES.filter(t=>t.kind==="invoice").map(t=><option key={t.key} value={t.key}>{t.name}</option>)}</select></label>
        <label>Payee name<input value={organization.payee_name||""} onChange={e=>setOrganization((p:any)=>({...p,payee_name:e.target.value}))} placeholder="Name printed under PAY TO"/></label>
        <label>Account number<input value={organization.account_number||""} onChange={e=>setOrganization((p:any)=>({...p,account_number:e.target.value}))}/></label>
        <label>Bank name<input value={organization.bank_name||""} onChange={e=>setOrganization((p:any)=>({...p,bank_name:e.target.value}))}/></label>
        <label>Branch name<input value={organization.branch_name||""} onChange={e=>setOrganization((p:any)=>({...p,branch_name:e.target.value}))}/></label>
        <label>Branch code<input value={organization.branch_code||""} onChange={e=>setOrganization((p:any)=>({...p,branch_code:e.target.value}))}/></label>
        <label>IFSC code<input value={organization.ifsc_code||""} onChange={e=>setOrganization((p:any)=>({...p,ifsc_code:e.target.value}))}/></label>
        <label className="full-span">Footer line 1<input value={organization.invoice_footer_line_1||""} onChange={e=>setOrganization((p:any)=>({...p,invoice_footer_line_1:e.target.value}))}/></label>
        <label className="full-span">Footer line 2<input value={organization.invoice_footer_line_2||""} onChange={e=>setOrganization((p:any)=>({...p,invoice_footer_line_2:e.target.value}))}/></label>
      </div></div>}
    </section>
    {message&&<div className={message==="Organisation identity saved."?"auth-success":"auth-message"} role="status">{message}</div>}
    <div className="settings-savebar"><span>Changes apply to the selected organisation only.</span><button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save organisation"}</button></div>
  </div>;
}

export function OrganizationsSettings({activeOrganizationId}:{activeOrganizationId:string|null}){
  const [orgs,setOrgs]=useState<any[]>([]);
  const [selected,setSelected]=useState<any>(null);
  const [editOpen,setEditOpen]=useState(false);
  const [section,setSection]=useState<string>("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [migration,setMigration]=useState<any>(null);
  const [createOpen,setCreateOpen]=useState(false);
  const [createName,setCreateName]=useState("");

  useEffect(()=>{Promise.all([
    supabase.from("organizations").select("*").order("status").order("name"),
    supabase.from("organisation_migration_status").select("*").maybeSingle()
  ]).then(([orgResult,migrationResult])=>{
    const rows=orgResult.data||[];
    setOrgs(rows);
    const active=activeOrganizationId ? rows.find((row:any)=>row.id===activeOrganizationId) : null;
    if(active) setSelected(active);
    else if(rows[0]) setSelected(rows[0]);
    if(orgResult.error)setMessage(orgResult.error.message);
    if(!migrationResult.error)setMigration(migrationResult.data);
  })},[activeOrganizationId]);

  function selectOrg(o:any){setSelected(o);setEditOpen(false);setSection("");setMessage("");}
  function toggle(key:string){setSection(section===key?"":key);}
  async function save(){
    if(!selected)return;
    const validation=validateOrganizationDraft(selected);
    if(validation){setMessage(validation);return}
    const next=normalizedOrganizationDraft(selected);
    setSaving(true);
    const {error}=await supabase.from("organizations").update({...next,updated_at:new Date().toISOString()}).eq("id",selected.id);
    setSaving(false);
    setMessage(error?error.message:"Organisation saved.");
    if(!error){setSelected(next);setOrgs(v=>v.map(o=>o.id===selected.id?next:o));window.dispatchEvent(new Event("finance:organization-updated"));}
  }
  async function create(){
    const name=createName.trim();
    if(!name)return;
    setSaving(true);setMessage("");
    const {data,error}=await supabase.from("organizations").insert({name,legal_name:name,entity_type:"brand",show_minbooks_branding:false}).select("*").single();
    setSaving(false);
    if(error){setMessage(error.message);return}
    setOrgs(v=>[...v,data]);setSelected(data);setEditOpen(true);setSection("identity");setCreateName("");setCreateOpen(false);window.dispatchEvent(new Event("finance:organization-updated"));
  }

  return <div className="settings-stack">
    {migration && <section className={"migration-check "+(migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "verified" : "warning")} aria-live="polite">
      <div className="migration-check-icon"><ShieldCheck size={17}/></div>
      <div><b>{migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "Historical organisation migration verified" : "Historical organisation assignment needs attention"}</b><span>{migration.assigned_invoice_count} of {migration.invoice_count} invoices assigned · {migration.organisation_count} organisation(s) referenced · {migration.orphaned_organisation_count} orphaned references.</span></div>
    </section>}

    <section className="data-panel organisations-panel">
      <div className="data-panel-head"><div><h2>Organisations & brands</h2><p>Choose the billing identity you want to edit. Changes are applied to future documents and the organisation’s own records.</p></div><button className="secondary" onClick={()=>{setCreateName("");setCreateOpen(true)}}><Plus size={14}/>Add organisation</button></div>
      <div className="org-grid">{orgs.map(o=><button className={"org-card "+(selected?.id===o.id?"active":"")} key={o.id} onClick={()=>selectOrg(o)}>
        <div className="org-card-logo">{o.logo_path?<img src={o.logo_path} alt=""/>:<span>{String(o.name).slice(0,1).toUpperCase()}</span>}</div>
        <div><b>{o.name}</b><small>{o.entity_type} · {o.status}</small></div><ChevronRight size={14}/>
      </button>)}</div>
    </section>

    {createOpen&&<ManagedDialog open onClose={()=>!saving&&setCreateOpen(false)} title="Add organisation" description="Create a billing identity, then complete its tax, banking and document settings."><form className="composer-body form-grid" onSubmit={e=>{e.preventDefault();void create()}}><label className="full-span">Organisation / brand name<input autoFocus required value={createName} onChange={e=>setCreateName(e.target.value)} placeholder="Organisation name"/></label>{message&&<div className="auth-message full-span" role="alert">{message}</div>}<div className="drawer-foot full-span"><button type="button" className="secondary" onClick={()=>setCreateOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="primary" disabled={saving||!createName.trim()}>{saving?"Creating…":"Create organisation"}</button></div></form></ManagedDialog>}
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
          ["invoicing","Invoicing","Numbering and invoice document behaviour.",<><label>Invoice prefix<input value={selected.invoice_prefix||""} onChange={e=>setSelected((p:any)=>({...p,invoice_prefix:e.target.value}))}/></label><label>Next invoice number<input type="number" value={selected.next_invoice_number||1} onChange={e=>setSelected((p:any)=>({...p,next_invoice_number:Number(e.target.value)||1}))}/></label><label>Invoice template<select value={selected.invoice_template_key||"clean"} onChange={e=>setSelected((p:any)=>({...p,invoice_template_key:e.target.value}))}><option value="clean">Canonical refined invoice</option><option value="legacy_elle">Archived reference invoice</option></select></label></>],
          ["branding","Branding & footer","Logo, accent and the small details carried into documents.",<><div className="client-logo-upload"><div className="client-logo-frame">{selected.logo_path?<img src={selected.logo_path} alt="Organisation logo"/>:<div className="client-logo-placeholder">Logo</div>}</div><label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;if(!["image/png","image/jpeg"].includes(f.type)){setMessage("Logo must be a PNG or JPEG.");return}if(f.size>2*1024*1024){setMessage("Logo must be under 2 MB.");return}const path="organizations/"+selected.id+"/"+Date.now()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,f,{upsert:true,contentType:f.type});if(error){setMessage(error.message);return}const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setSelected((p:any)=>({...p,logo_path:data.publicUrl}))}}/></label></div><div className="form-grid"><label>Brand accent<input type="text" inputMode="text" pattern="^#[0-9A-Fa-f]{6}$" value={selected.accent_hex||"#6D5DF5"} onChange={e=>setSelected((p:any)=>({...p,accent_hex:e.target.value}))}/></label><label>Footer line 1<input value={selected.invoice_footer_line_1||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_1:e.target.value}))}/></label><label>Footer line 2<input value={selected.invoice_footer_line_2||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_2:e.target.value}))}/></label></div></>]
        ] as const).map(([key,title,description,body])=><div className={"settings-accordion "+(section===key?"open":"")} key={key}>
          <button className="settings-accordion-toggle" onClick={()=>toggle(key)}><span><b>{title}</b><small>{description}</small></span><span>{section===key?"Collapse":"Edit"}</span></button>
          {section===key&&<div className="settings-accordion-body">{body}</div>}
        </div>)}
        <div className="settings-savebar"><span>{message || "Changes are local until you save this organisation."}</span><button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save organisation"}</button></div>
      </div>}
    </section>}
  </div>;
}

export function Overview({stats,invoices,organization,onOpen,onNavigate,onNewInvoice}:{stats:any;invoices:Invoice[];organization:any;onOpen:(i:Invoice)=>void;onNavigate:(view:FinanceView)=>void;onNewInvoice:()=>void}) {
  const today=new Date();
  const open=invoices.filter(i=>invoiceBalance(i)>0);
  const overdue=open.filter(i=>daysOverdue(i)>0);
  const dueSoon=open.filter(i=>i.dueDate&&(() => { const d=new Date(i.dueDate+"T00:00:00"); const days=Math.ceil((d.getTime()-today.getTime())/86400000); return days>=0&&days<=14; })());
  const recent=[...invoices].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6);
  const attention=[...overdue.map(i=>({tone:"danger",label:"#"+i.number+" · "+i.client,meta:daysOverdue(i)+"d overdue",invoice:i})),...dueSoon.filter(i=>!overdue.includes(i)).map(i=>({tone:"warning",label:"#"+i.number+" · "+i.client,meta:"Due soon",invoice:i}))].slice(0,5);
  const overdueValue=overdue.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const collection=stats.billed>0?Math.min(100,Math.round(stats.collected/stats.billed*100)):0;
  const greeting = today.getHours() < 12 ? "Good morning." : today.getHours() < 18 ? "Good afternoon." : "Good evening.";
  const scopeLabel = organization?.id===ALL_ORGANIZATIONS_ID ? "Across all organisations" : organization?.name || "Your workspace";
  const activity=invoices.flatMap(invoice=>invoice.activities.map(event=>({...event,invoice}))).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,6);
  const activityLabel=(action:string)=>({
    invoice_created:"Invoice created",
    invoice_issued:"Invoice issued",
    invoice_status_changed:"Status changed",
    payment_recorded:"Payment recorded",
    invoice_imported:"Invoice imported",
    source_reconciliation:"Source reconciled",
  } as Record<string,string>)[action]||action.replaceAll("_"," ");
  const clientBalances=[...invoices.reduce((map,invoice)=>{
    const current=map.get(invoice.client)||{billed:0,open:0,count:0};
    current.billed+=invoiceTotal(invoice);current.open+=invoiceBalance(invoice);current.count+=1;map.set(invoice.client,current);return map;
  },new Map<string,{billed:number;open:number;count:number}>()).entries()].sort((a,b)=>b[1].open-a[1].open).slice(0,4);
  const projectBilling=[...invoices.reduce((map,invoice)=>{
    const key=invoice.project&&invoice.project!=="No project"?invoice.project:"Unassigned";
    const current=map.get(key)||{billed:0,open:0};
    current.billed+=invoiceTotal(invoice);current.open+=invoiceBalance(invoice);map.set(key,current);return map;
  },new Map<string,{billed:number;open:number}>()).entries()].sort((a,b)=>b[1].billed-a[1].billed).slice(0,4);

  return <div className="overview-home">
    <header className="overview-welcome">
      <div>
        <span className="eyebrow">OVERVIEW</span>
        <h1>{greeting}</h1>
        <p>{scopeLabel} · here’s what needs your attention.</p>
      </div>
      <div className="overview-welcome-actions">
        <button className="secondary" onClick={()=>onNavigate("imports")}><Upload size={15}/>Import</button>
        <button className="primary" onClick={onNewInvoice}><Plus size={15}/>New invoice</button>
      </div>
    </header>

    <MobileQuickActions onNewInvoice={onNewInvoice} onPayments={()=>onNavigate("payments")} onImport={()=>onNavigate("imports")} onInvoices={()=>onNavigate("invoices")} />

    <section className="overview-financial">
      <div className="overview-balance">
        <span className="kicker">OUTSTANDING</span>
        <strong>{money(stats.outstanding)}</strong>
        <p>{overdue.length ? money(overdueValue)+" overdue across "+overdue.length+" invoice"+(overdue.length===1?"":"s") : "No overdue invoices."}</p>
      </div>
      <div className="overview-metrics">
        <div><span>Collected</span><b>{money(stats.collected)}</b><small>Recorded payments</small></div>
        <div><span>Billed</span><b>{money(stats.billed)}</b><small>Invoice value</small></div>
        <div><span>Collection</span><b>{collection}%</b><small>Collected / billed</small></div>
        <div><span>Invoices</span><b>{invoices.length}</b><small>In this workspace</small></div>
      </div>
    </section>

    <div className="overview-home-grid">
      <section className="data-panel">
        <div className="data-panel-head">
          <div><span className="eyebrow">RECENT</span><h2>Invoices</h2></div>
          <button className="text-action" onClick={()=>onNavigate("invoices")}>View all <ArrowUpRight size={12}/></button>
        </div>
        <div className="invoice-register minimal-register">
          {recent.length ? recent.map(i=><button key={i.id} className="invoice-register-row" onClick={()=>onOpen(i)}>
            <b>#{i.number}</b>
            <span><strong>{i.client}</strong><small>{i.project||"No project"} · {dateLabel(i.date)}</small></span>
            <StatusPill status={i.status as FinanceStatus}/>
            <strong>{money(invoiceTotal(i))}</strong>
            <ChevronRight size={13}/>
          </button>) : <div className="empty-state"><FileText size={18}/><b>No invoices yet.</b><span>Create the first invoice for this organisation.</span></div>}
        </div>
      </section>

      <section className="data-panel">
        <div className="data-panel-head">
          <div><span className="eyebrow">NEXT</span><h2>Needs attention</h2></div>
          <span className="panel-count">{attention.length}</span>
        </div>
        {attention.length ? <div className="action-list">{attention.map(a=><button key={a.invoice.id+"-"+a.tone} className="action-row" onClick={()=>onOpen(a.invoice)}>
          <span className={"action-icon "+a.tone}>{a.tone==="danger"?<CircleAlert size={13}/>:<WalletCards size={13}/>}</span>
          <div><b>{a.label}</b><small>{a.meta}</small></div>
          <strong>{money(invoiceBalance(a.invoice))}</strong><ChevronRight size={13}/>
        </button>)}</div> : <div className="overview-clear-state"><span><ShieldCheck size={16}/></span><div><b>You’re caught up.</b><p>No overdue or near-due invoices need action right now.</p></div></div>}
      </section>
    </div>

    <div className="overview-context-grid">
      <section className="data-panel overview-activity-panel">
        <div className="data-panel-head"><div><span className="eyebrow">ACTIVITY</span><h2>Financial timeline</h2></div><button className="text-action" onClick={()=>onNavigate("reports")}>Reports <ArrowUpRight size={12}/></button></div>
        {activity.length?<div className="activity-list">{activity.map(event=><button type="button" className="overview-activity-row" key={event.id} onClick={()=>onOpen(event.invoice)}><span className="activity-dot"/><div><b>{activityLabel(event.action)}</b><small>#{event.invoice.number} · {event.invoice.client}</small></div><time>{new Date(event.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</time></button>)}</div>:<div className="empty-state"><RefreshCw size={18}/><b>No activity yet.</b><span>Invoice and payment actions will appear here.</span></div>}
      </section>
      <section className="data-panel overview-relationships-panel">
        <div className="data-panel-head"><div><span className="eyebrow">RELATIONSHIPS</span><h2>Clients & projects</h2></div></div>
        <div className="overview-relationship-columns">
          <div><button type="button" className="overview-relationship-head" onClick={()=>onNavigate("clients")}><Building2 size={13}/>Clients <ChevronRight size={12}/></button>{clientBalances.map(([name,value])=><button type="button" className="overview-relationship-row" key={name} onClick={()=>onNavigate("clients")}><span><b>{name}</b><small>{value.count} invoice{value.count===1?"":"s"}</small></span><strong>{money(value.open)}</strong></button>)}</div>
          <div><button type="button" className="overview-relationship-head" onClick={()=>onNavigate("projects")}><FolderKanban size={13}/>Projects <ChevronRight size={12}/></button>{projectBilling.map(([name,value])=><button type="button" className="overview-relationship-row" key={name} onClick={()=>onNavigate("projects")}><span><b>{name}</b><small>{money(value.billed)} billed</small></span><strong>{money(value.open)}</strong></button>)}</div>
        </div>
      </section>
    </div>
  </div>;
}
export function InvoiceView({filtered,query,setQuery,status,setStatus,clientFilter,setClientFilter,projectFilter,setProjectFilter,paymentFilter,setPaymentFilter,dateFilter,setDateFilter,sourceInvoices,loading,onOpen,onStatus,onNew,onPayments,onImport}:{filtered:Invoice[];query:string;setQuery:(v:string)=>void;status:"all"|Status;setStatus:(v:"all"|Status)=>void;clientFilter:string;setClientFilter:(v:string)=>void;projectFilter:string;setProjectFilter:(v:string)=>void;paymentFilter:"all"|"open"|"partial"|"paid"|"overdue";setPaymentFilter:(v:"all"|"open"|"partial"|"paid"|"overdue")=>void;dateFilter:"all"|"month"|"3months"|"6months"|"fy";setDateFilter:(v:"all"|"month"|"3months"|"6months"|"fy")=>void;sourceInvoices:Invoice[];loading:boolean;onOpen:(i:Invoice)=>void;onStatus:(i:Invoice,s:Status)=>void|Promise<void>;onNew:()=>void;onPayments:()=>void;onImport:()=>void}) {
  const [selecting,setSelecting]=useState(false);
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [bulkMessage,setBulkMessage]=useState("");
  const open=filtered.reduce((sum,i)=>sum+invoiceBalance(i),0), overdue=filtered.filter(i=>daysOverdue(i)>0).length;
  const clientOptions=[...new Map(sourceInvoices.filter(i=>i.clientId).map(i=>[i.clientId!,i.client])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const projectOptions=[...new Map(sourceInvoices.filter(i=>i.projectId).map(i=>[i.projectId!,i.project])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const advancedCount=[clientFilter,projectFilter,paymentFilter,dateFilter].filter(v=>v!=="all").length;
  const selectedInvoices=filtered.filter(invoice=>selectedIds.includes(invoice.id));
  const selectedDrafts=selectedInvoices.filter(invoice=>invoice.status==="draft");
  const selectedIssued=selectedInvoices.filter(invoice=>invoice.status!=="draft"&&invoice.status!=="void");
  const toggleSelected=(id:string)=>setSelectedIds(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]);
  async function issueSelected(){
    if(!selectedDrafts.length)return;
    setBulkBusy(true);setBulkMessage("");
    for(const invoice of selectedDrafts)await Promise.resolve(onStatus(invoice,"sent"));
    setBulkBusy(false);setSelectedIds([]);
    setBulkMessage("Issued "+selectedDrafts.length+" draft invoice"+(selectedDrafts.length===1?"":"s")+" and requested canonical PDF generation.");
  }
  async function generateSelected(){
    if(!selectedIssued.length)return;
    setBulkBusy(true);setBulkMessage("");let generated=0;const failures:string[]=[];
    for(const invoice of selectedIssued){
      try{
        const response=await fetch("/api/invoices/"+encodeURIComponent(invoice.id)+"/pdf",{cache:"no-store",credentials:"same-origin"});
        if(!response.ok)throw new Error((await response.text().catch(()=>"")).trim()||"generation failed");
        await response.arrayBuffer();generated+=1;
      }catch(error){failures.push("#"+invoice.number+" "+(error instanceof Error?error.message:"generation failed"))}
    }
    setBulkBusy(false);
    setBulkMessage(failures.length?"Generated "+generated+" of "+selectedIssued.length+". "+failures.slice(0,2).join(" · "):"Generated and stored "+generated+" invoice PDF"+(generated===1?"":"s")+".");
  }
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Receivables</span><h2>Invoices</h2></div><div className="operations-head-actions"><div className="operations-count"><b>{filtered.length}</b><span>records</span></div><button type="button" className="secondary invoice-select-toggle" onClick={()=>{setSelecting(value=>!value);setSelectedIds([]);setBulkMessage("")}}>{selecting?"Done":"Select"}</button><button className="primary" onClick={onNew}><Plus size={14}/>New invoice</button></div></section>
    <MobileQuickActions onNewInvoice={onNew} onPayments={onPayments} onImport={onImport} onInvoices={()=>window.scrollTo({top:0,behavior:"smooth"})} />
    <section className="register-summary"><div><span>OPEN</span><b>{money(open)}</b></div><div><span>OVERDUE</span><b>{overdue}</b></div><div><span>VIEW</span><b>{status==="all"?"All":statusLabel(status)}</b></div></section>
    <section className="data-panel operations-register">
      <div className="data-panel-head"><div><h2>Register</h2></div><div className="invoice-toolbar"><div className="search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoice, client or project" aria-label="Search invoices"/></div><SegmentedTabs
  value={status}
  onChange={setStatus}
  ariaLabel="Invoice status"
  items={(["all","draft","sent","partially_paid","paid","void"] as const).map(value => ({
    value,
    label: value === "all" ? "All" : value === "partially_paid" ? "Partial" : statusLabel(value),
  }))}
 /></div></div>
      <details className="invoice-advanced-filters">
        <summary>More filters{advancedCount? <span>{advancedCount}</span>:null}</summary>
        <div className="invoice-filter-grid">
          <label>Client<select value={clientFilter} onChange={e=>{setClientFilter(e.target.value);if(e.target.value==="all")setProjectFilter("all")}}><option value="all">All clients</option>{clientOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
          <label>Project<select value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">All projects</option>{projectOptions.filter(([id])=>clientFilter==="all"||sourceInvoices.some(i=>i.projectId===id&&i.clientId===clientFilter)).map(([id,name])=><option key={id} value={id}>{name||"Unnamed project"}</option>)}</select></label>
          <label>Payment<select value={paymentFilter} onChange={e=>setPaymentFilter(e.target.value as "all"|"open"|"partial"|"paid"|"overdue")}><option value="all">Any payment state</option><option value="open">Outstanding</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></label>
          <label>Date<select value={dateFilter} onChange={e=>setDateFilter(e.target.value as "all"|"month"|"3months"|"6months"|"fy")}><option value="all">All time</option><option value="month">This month</option><option value="3months">Last 3 months</option><option value="6months">Last 6 months</option><option value="fy">This financial year</option></select></label>
          {advancedCount>0&&<button type="button" className="text-action invoice-filter-reset" onClick={()=>{setClientFilter("all");setProjectFilter("all");setPaymentFilter("all");setDateFilter("all")}}>Reset filters</button>}
        </div>
      </details>
      {selecting&&<div className="invoice-bulk-bar"><span><b>{selectedIds.length}</b> selected</span><button type="button" className="secondary mini-action" disabled={!selectedDrafts.length||bulkBusy} onClick={()=>void issueSelected()}><Check size={13}/>Issue drafts ({selectedDrafts.length})</button><button type="button" className="secondary mini-action" disabled={!selectedIssued.length||bulkBusy} onClick={()=>void generateSelected()}><FileText size={13}/>Generate PDFs ({selectedIssued.length})</button>{selectedIds.length>0&&<button type="button" className="text-action" onClick={()=>setSelectedIds([])}>Clear</button>}</div>}
      {bulkMessage&&<div className={bulkMessage.startsWith("Generated and stored")||bulkMessage.startsWith("Issued ")?"auth-success":"auth-message"} role="status">{bulkMessage}</div>}
      {loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading…</div>:filtered.length?<><div className="invoice-register-header"><span>INVOICE</span><span>CLIENT / PROJECT</span><span>ISSUED</span><span>DUE / BALANCE</span><span>TOTAL</span><span>STATUS</span></div><div className="invoice-list">{filtered.map(i=><div className={"invoice-bulk-row "+(selectedIds.includes(i.id)?"selected":"")} key={i.id}>{selecting&&<label className="invoice-select-box" onClick={event=>event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(i.id)} onChange={()=>toggleSelected(i.id)} aria-label={"Select invoice "+i.number}/><span aria-hidden="true"/></label>}<InvoiceCard invoice={i} onOpen={()=>selecting?toggleSelected(i.id):onOpen(i)} onStatus={onStatus}/></div>)}</div></>:<div className="empty-state"><FileText size={18}/><b>No invoices match.</b><span>Change the search, status or register filters.</span></div>}
    </section>
  </div>;
}
export function PaymentsView({invoices,onOpenPayment}:{invoices:Invoice[];onOpenPayment:(i:Invoice)=>void}) {
  const [query,setQuery]=useState("");
  const [method,setMethod]=useState("all");
  const [period,setPeriod]=useState<Period>("all");
  const allRows=invoices.flatMap(i=>i.payments.map(p=>({...p,invoice:i}))).sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||""));
  const rows=allRows.filter(row=>{
    const text=[row.invoice.number,row.invoice.client,row.invoice.project,row.reference,row.method].join(" ").toLowerCase();
    return text.includes(query.toLowerCase())&&(method==="all"||row.method===method)&&(!row.payment_date||withinPeriod(row.payment_date,period));
  });
  const collected=allRows.reduce((sum,row)=>sum+row.amount,0);
  const outstanding=invoices.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const openInvoices=invoices.filter(i=>invoiceBalance(i)>0).sort((a,b)=>invoiceBalance(b)-invoiceBalance(a));
  return <div className="operations-page payments-page">
    <section className="operations-intro compact-page-head">
      <div><span className="eyebrow">Collections</span><h2>Payments</h2></div>
      <div className="operations-count"><b>{rows.length}</b><span>recorded</span></div>
    </section>
    <section className="register-summary">
      <div><span>COLLECTED</span><b>{money(collected)}</b></div>
      <div><span>OUTSTANDING</span><b>{money(outstanding)}</b></div>
      <div><span>OPEN INVOICES</span><b>{openInvoices.length}</b></div>
    </section>
    {openInvoices.length>0&&<section className="data-panel payment-open-queue">
      <div className="data-panel-head"><div><h2>Open balances</h2><span>Highest outstanding invoices first.</span></div><span className="panel-count">{openInvoices.length}</span></div>
      <div className="payment-open-list">{openInvoices.slice(0,6).map(invoice=><div className="payment-open-row" key={invoice.id}><div><b>#{invoice.number} · {invoice.client}</b><span>{invoice.project||"No project"}{invoice.dueDate?" · Due "+dateLabel(invoice.dueDate):""}</span></div><strong>{money(invoiceBalance(invoice))}</strong><button type="button" className="secondary mini-action" onClick={()=>onOpenPayment(invoice)}>Record payment</button></div>)}</div>
    </section>}
    <section className="data-panel payments-ledger">
      <div className="data-panel-head"><div><h2>Ledger</h2><span>{rows.length} of {allRows.length} recorded payments.</span></div><WalletCards size={16}/></div>
      <div className="payment-ledger-filters"><div className="search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoice, client or reference" aria-label="Search payments"/></div><select value={method} onChange={e=>setMethod(e.target.value)} aria-label="Payment method"><option value="all">All methods</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select><select value={period} onChange={e=>setPeriod(e.target.value as Period)} aria-label="Payment period">{(["month","3months","6months","fy","all"] as Period[]).map(p=><option key={p} value={p}>{periodLabel(p)}</option>)}</select></div>
      {rows.length ? <div className="payment-ledger-list">{rows.map(row=>
        <div className="payment-ledger-row" key={row.id}>
          <button type="button" className="payment-ledger-open" onClick={()=>onOpenPayment(row.invoice)}>
            <div className="payment-ledger-main">
              <b>#{row.invoice.number} · {row.invoice.client}</b>
              <span>{row.payment_date?dateLabel(row.payment_date):"Date unknown"} · {row.method.replaceAll("_"," ")}</span>
            </div>
          </button>
          <strong>{money(row.amount)}</strong>
          <a className="text-action payment-receipt-action" href={"/api/payments/"+row.id+"/receipt"}>Receipt</a>
        </div>
      )}</div> : <div className="empty-state"><WalletCards size={18}/><b>No payments recorded.</b><span>Record a payment from an open invoice.</span></div>}
    </section>
  </div>;
}
export function ClientsView({invoices,organizationId,onOpen,selectedClientId,setSelectedClientId,onNew}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void;selectedClientId:string|null;setSelectedClientId:(id:string|null)=>void;onNew:()=>void}) {
  const [clients,setClients]=useState<any[]>([]),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false),[clientQuery,setClientQuery]=useState("");
  async function load(){setLoading(true);if(!organizationId){setClients([]);setLoading(false);return}let query=supabase.from("clients").select("*").is("archived_at",null).order("name");if(organizationId!==ALL_ORGANIZATIONS_ID)query=query.eq("organization_id",organizationId);const {data}=await query;setClients(data||[]);setLoading(false)}
  useEffect(()=>{void load();const h=()=>setCreating(true);window.addEventListener("finance:new-client",h);return()=>window.removeEventListener("finance:new-client",h)},[organizationId]);
  const stats=clients.map(c=>{const rows=invoices.filter(i=>i.clientId===c.id);const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0),open=rows.reduce((s,i)=>s+invoiceBalance(i),0);return {c,rows,billed,open}});
  const filteredStats=stats.filter(x=>[x.c.name,x.c.legal_name,x.c.email,x.c.phone].join(" ").toLowerCase().includes(clientQuery.toLowerCase()));
  if(selectedClientId)return <ClientWorkspace clientId={selectedClientId} invoices={invoices} onBack={()=>setSelectedClientId(null)} onOpenInvoice={onOpen} onSaved={load} onArchived={()=>{setSelectedClientId(null);void load()}}/>;
  const billed=stats.reduce((s,x)=>s+x.billed,0),open=stats.reduce((s,x)=>s+x.open,0);
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Relationships</span><h2>Clients</h2></div><div className="operations-head-actions"><div className="operations-count"><b>{clients.length}</b><span>active</span></div><button className="primary" onClick={onNew}><Plus size={14}/>New client</button></div></section>
    <section className="register-summary"><div><span>BILLED</span><b>{money(billed)}</b></div><div><span>OUTSTANDING</span><b>{money(open)}</b></div><div><span>CLIENTS</span><b>{clients.length}</b></div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Directory</h2><span>{filteredStats.length} shown</span></div><div className="search compact-search"><Search size={14}/><input value={clientQuery} onChange={e=>setClientQuery(e.target.value)} placeholder="Search clients" aria-label="Search clients"/></div></div>
      {loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading clients…</div>:filteredStats.length?<div className="client-directory">{filteredStats.map(x=><button className="client-directory-row" key={x.c.id} onClick={()=>setSelectedClientId(x.c.id)}><div className="client-avatar">{x.c.logo_path?<img src={x.c.logo_path} alt=""/>:String(x.c.name||"?").slice(0,1).toUpperCase()}</div><div className="client-main"><b>{x.c.name}</b><span>{x.c.email||x.c.legal_name||"Billing profile incomplete"}</span></div><div className="client-financials"><div><b>{x.rows.length}</b><span>invoices</span></div><div><b>{money(x.billed)}</b><span>billed</span></div><div><b>{money(x.open)}</b><span>open</span></div></div><ChevronRight size={14}/></button>)}</div>:<div className="empty-state"><Building2 size={18}/><b>{clientQuery?"No clients match.":"No clients yet."}</b><span>{clientQuery?"Change the search.":"Create a client workspace."}</span></div>}
    </section>{creating&&<ClientCreateModal organizationId={organizationId} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);void load()}}/>}
  </div>;
}
export function ClientCreateModal({organizationId,onClose,onSaved}:{organizationId:string|null;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState({name:"",legal_name:"",email:"",phone:"",pan:"",gstin:"",address:""});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  async function save(e:FormEvent){e.preventDefault();const validation=validateClientDraft(form);if(validation)return setMessage(validation);setSaving(true);const slug=form.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,8);const {error}=await supabase.from("clients").insert({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim().toUpperCase()||null,gstin:form.gstin.trim().toUpperCase()||null,address_lines:form.address.split("\n").map(v=>v.trim()).filter(Boolean),portal_slug:slug,organization_id:organizationId});setSaving(false);if(error)setMessage(error.message);else onSaved();}
  return <ManagedDialog open onClose={onClose} title="Create client" description="Create a billing and portal workspace for this client."><div className="composer-body"><form className="password-settings" onSubmit={save}><div className="form-grid"><label>Client name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Billed-to / legal name<input value={form.legal_name} onChange={e=>setForm((f:any)=>({...f,legal_name:e.target.value}))}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm((f:any)=>({...f,email:e.target.value}))}/></label><label>Phone<input value={form.phone} onChange={e=>setForm((f:any)=>({...f,phone:e.target.value}))}/></label><label>PAN<input value={form.pan} onChange={e=>setForm((f:any)=>({...f,pan:e.target.value}))}/></label><label>GSTIN<input value={form.gstin} onChange={e=>setForm((f:any)=>({...f,gstin:e.target.value}))}/></label></div><label>Address lines<textarea value={form.address} onChange={e=>setForm((f:any)=>({...f,address:e.target.value}))} placeholder="One line per row"/></label>{message&&<div className="auth-message" role="alert">{message}</div>}<div className="drawer-foot"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?"Creating…":"Create client"}</button></div></form></div></ManagedDialog>;
}
export function ClientWorkspace({clientId,invoices,onBack,onOpenInvoice,onSaved,onArchived}:{clientId:string;invoices:Invoice[];onBack:()=>void;onOpenInvoice:(i:Invoice)=>void;onSaved:()=>void;onArchived:()=>void}) {
  const [client,setClient]=useState<any>(null),[documents,setDocuments]=useState<any[]>([]),[tab,setTab]=useState<"overview"|"invoices"|"payments"|"projects"|"documents"|"statement"|"settings">("overview"),[period,setPeriod]=useState<Period>("all"),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState(""),[portalPassword,setPortalPassword]=useState("");
  const [form,setForm]=useState<any>({});
  const [portalCopied,setPortalCopied]=useState(false);
  const [archiveOpen,setArchiveOpen]=useState(false);
  const [archiving,setArchiving]=useState(false);
  async function load(){setLoading(true);const [{data,error},{data:docs}]=await Promise.all([supabase.from("clients").select("id,name,legal_name,email,phone,pan,gstin,address_lines,portal_enabled,portal_slug,portal_message,allow_profile_edit,show_projects,show_documents,logo_path,portal_password_set_at").eq("id",clientId).single(),supabase.from("documents").select("*").eq("client_id",clientId).order("created_at",{ascending:false})]);if(error)setMessage(error.message);setClient(data);setDocuments(docs||[]);setLoading(false)}
  useEffect(()=>{void load()},[clientId]);
  useEffect(()=>{if(client)setForm({name:client.name||"",legal_name:client.legal_name||"",email:client.email||"",phone:client.phone||"",pan:client.pan||"",gstin:client.gstin||"",address:Array.isArray(client.address_lines)?client.address_lines.join("\n"):"",portal_enabled:!!client.portal_enabled,allow_profile_edit:!!client.allow_profile_edit,show_projects:client.show_projects!==false,show_documents:client.show_documents!==false,portal_message:client.portal_message||"",logo_path:client.logo_path||""})},[client]);
  const rows=invoices.filter(i=>i.clientId===clientId),scoped=rows.filter(i=>withinPeriod(i.date,period)),billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0),paid=scoped.reduce((s,i)=>s+paidTotal(i),0),open=Math.max(billed-paid,0);
  const clientPayments=rows.flatMap(i=>i.payments.map(payment=>({...payment,invoice:i}))).sort((a,b)=>String(b.payment_date||"").localeCompare(String(a.payment_date||"")));
  const scopedPayments=clientPayments.filter(payment=>!payment.payment_date||withinPeriod(payment.payment_date,period));
  async function save(){const validation=validateClientDraft(form);if(validation){setMessage(validation);return}if(form.portal_enabled&&!client.portal_password_set_at){setMessage("Set a portal password before enabling client access.");return}setSaving(true);const {error}=await supabase.from("clients").update({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim().toUpperCase()||null,gstin:form.gstin.trim().toUpperCase()||null,address_lines:form.address.split("\n").map((v:string)=>v.trim()).filter(Boolean),portal_enabled:form.portal_enabled,allow_profile_edit:form.allow_profile_edit,show_projects:form.show_projects,show_documents:form.show_documents,portal_message:form.portal_message.trim()||null,logo_path:form.logo_path||null,updated_at:new Date().toISOString()}).eq("id",clientId);setSaving(false);setMessage(error?error.message:"Saved.");if(!error){setClient((p:any)=>({...p,...form}));onSaved()}}
  async function uploadClientLogo(file:File){
    if(!["image/png","image/jpeg"].includes(file.type)){setMessage("Client logo must be a PNG or JPEG.");return}
    if(file.size>2*1024*1024){setMessage("Client logo must be under 2 MB.");return}
    const path="clients/"+clientId+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");
    const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,file,{upsert:true,contentType:file.type});
    if(error){setMessage(error.message);return}
    const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);
    setForm((p:any)=>({...p,logo_path:data.publicUrl}));
    setMessage("Logo uploaded. Save the client to persist the profile.");
  }
  async function archiveClient(){setArchiving(true);setMessage("");const {error}=await supabase.from("clients").update({archived_at:new Date().toISOString(),portal_enabled:false,updated_at:new Date().toISOString()}).eq("id",clientId);setArchiving(false);if(error){setMessage(error.message);setArchiveOpen(false);return}setArchiveOpen(false);onArchived();onSaved()}
  async function setPassword(){if(portalPassword.length<10){setMessage("Use at least 10 characters.");return}const r=await fetch("/api/client-portal/"+clientId+"/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:portalPassword})});const j=await r.json();if(!r.ok){setMessage(j.error||"Could not set portal password.");return}setPortalPassword("");setClient((p:any)=>({...p,portal_password_set_at:new Date().toISOString(),portal_enabled:true}));setForm((p:any)=>({...p,portal_enabled:true}));setMessage("Protected portal access enabled.")}
  if(loading)return <div className="empty-state">Loading client workspace…</div>;if(!client)return <div className="empty-state">Client not found.</div>;
  const projectNames=[...new Set(rows.map(i=>i.project).filter(Boolean))];
  return <div className="client-portal">
    <div className="client-portal-head"><button className="back-link" onClick={onBack}>← Clients</button><div className="client-title-lockup">{client.logo_path?<img className="client-logo-small" src={client.logo_path} alt=""/>:<div className="client-avatar">{String(client.name||"?").slice(0,1).toUpperCase()}</div>}<div><span className="eyebrow">Client workspace</span><h2>{client.name}</h2><p>{client.legal_name||"Billing profile incomplete"}{client.email?" · "+client.email:""}</p></div></div><button className="secondary" onClick={()=>setTab("settings")}><Settings2 size={14}/>Settings</button></div>
    <div className="client-mobile-actions" aria-label="Client quick actions">
      {client.phone&&<a className="secondary" href={"tel:"+client.phone}><Phone size={14}/>Call</a>}
      {client.email&&<a className="secondary" href={"mailto:"+client.email}><Mail size={14}/>Email</a>}
      <DownloadButton label="Statement" loadingLabel="Preparing" doneLabel="Ready" onClick={()=>downloadFile("/api/clients/"+clientId+"/statement?period="+period,"statement.pdf")}/>
      <button type="button" className="secondary" onClick={()=>setTab("invoices")}><Receipt size={14}/>Invoices</button>
    </div>
    <div className="client-tabs">{(["overview","invoices","payments","projects","documents","statement","settings"] as const).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t==="statement"?"Statement":t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    {tab!=="settings"&&<div className="period-strip">{(["month","3months","6months","fy","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>}
    {tab==="overview"&&<div className="client-dashboard"><section className="overview-position"><div><span>Outstanding</span><strong>{money(open)}</strong><small>{periodLabel(period)}</small></div><div className="overview-position-facts"><div><span>Billed</span><b>{money(billed)}</b></div><div><span>Collected</span><b>{money(paid)}</b></div><div><span>Invoices</span><b>{scoped.length}</b></div></div></section><div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><h2>Recent invoices</h2></div>{scoped.slice(0,8).map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.project||"Invoice"}</strong><small>{dateLabel(i.date)}</small></span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}{!scoped.length&&<div className="empty-state"><FileText size={18}/><b>No invoices in this period.</b></div>}</section><section className="data-panel"><div className="data-panel-head"><h2>Portal</h2></div><div className="client-detail-list"><div className="client-detail-row"><span>Access</span><strong>{client.portal_enabled&&client.portal_password_set_at?"Protected":"Not enabled"}</strong></div><div className="client-detail-row"><span>Projects</span><strong>{client.show_projects!==false?"Visible":"Hidden"}</strong></div><div className="client-detail-row"><span>Documents</span><strong>{client.show_documents!==false?"Visible":"Hidden"}</strong></div></div></section></div></div>}
    {tab==="invoices"&&<section className="data-panel"><div className="data-panel-head"><h2>Invoices</h2></div>{rows.map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.project||"Invoice"}</strong><small>{dateLabel(i.date)}</small></span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}</section>}
    {tab==="payments"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Payments</h2><span>{scopedPayments.length} in {periodLabel(period)}</span></div></div>{scopedPayments.length?<div className="payment-ledger-list">{scopedPayments.map(row=><div className="payment-ledger-row" key={row.id}><div className="payment-ledger-main"><b>#{row.invoice.number} · {row.invoice.project||"Invoice"}</b><span>{row.payment_date?dateLabel(row.payment_date):"Date unknown"} · {row.method.replaceAll("_"," ")}{row.reference?" · "+row.reference:""}</span></div><strong>{money(row.amount)}</strong><a className="text-action payment-receipt-action" href={"/api/payments/"+row.id+"/receipt"}>Receipt</a></div>)}</div>:<div className="empty-state"><WalletCards size={18}/><b>No payments in this period.</b></div>}</section>}
    {tab==="projects"&&<section className="data-panel"><div className="data-panel-head"><h2>Projects</h2></div>{projectNames.length?projectNames.map(p=><div className="client-detail-row" key={p}><span>{p}</span><strong>{money(rows.filter(i=>i.project===p).reduce((s,i)=>s+invoiceTotal(i),0))}</strong></div>):<div className="empty-state"><FolderKanban size={18}/><b>No projects linked.</b></div>}</section>}
    {tab==="documents"&&<section className="data-panel"><div className="data-panel-head"><h2>Documents</h2></div>{documents.length?documents.map(d=><div className="client-detail-row" key={d.id}><span>{d.file_name||"Document"}</span><DownloadButton label="Download" loadingLabel="Preparing" doneLabel="Ready" disabled={!d.file_path} onClick={()=>downloadFile("/api/documents/"+d.id+"/download",d.file_name||"document.pdf")}/></div>):<div className="empty-state"><FileText size={18}/><b>No shared documents.</b><span>Documents appear here when explicitly shared with this client.</span></div>}</section>}{tab==="statement"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Account statement</h2><span>{periodLabel(period)}</span></div><a className="text-action" href={"/api/clients/"+clientId+"/statement?period="+period}>Download</a></div><div className="statement-summary"><div><span>Billed</span><b>{money(billed)}</b></div><div><span>Collected</span><b>{money(paid)}</b></div><div><span>Outstanding</span><b>{money(open)}</b></div></div></section>}
    {tab==="settings"&&<section className="settings-stack">
      <section className="settings-section-card"><div className="settings-section-body">
      <div className="client-logo-upload"><div className="client-logo-frame">{form.logo_path?<img src={form.logo_path} alt="Client logo"/>:<div className="client-logo-placeholder">{String(form.name||client.name||"C").slice(0,1).toUpperCase()}</div>}</div><label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg" onChange={e=>{const file=e.target.files?.[0];if(file)void uploadClientLogo(file)}}/></label></div>
      <div className="form-grid">
        <label>Name<input value={form.name||""} onChange={e=>setForm((p:any)=>({...p,name:e.target.value}))}/></label>
        <label>Legal name<input value={form.legal_name||""} onChange={e=>setForm((p:any)=>({...p,legal_name:e.target.value}))}/></label>
        <label>Email<input type="email" value={form.email||""} onChange={e=>setForm((p:any)=>({...p,email:e.target.value}))}/></label>
        <label>Phone<input value={form.phone||""} onChange={e=>setForm((p:any)=>({...p,phone:e.target.value}))}/></label>
        <label>PAN<input value={form.pan||""} onChange={e=>setForm((p:any)=>({...p,pan:e.target.value.toUpperCase()}))}/></label>
        <label>GSTIN<input value={form.gstin||""} onChange={e=>setForm((p:any)=>({...p,gstin:e.target.value.toUpperCase()}))}/></label>
        <label className="full-span">Address<textarea value={form.address||""} onChange={e=>setForm((p:any)=>({...p,address:e.target.value}))}/></label>
      </div>
      <div className="settings-row"><div><b>Portal access</b><p>Protected client-facing workspace.</p></div><label><span>Enable</span><input type="checkbox" checked={!!form.portal_enabled} onChange={e=>setForm((p:any)=>({...p,portal_enabled:e.target.checked}))}/></label></div>
      <div className="settings-row"><div><b>Visible sections</b><p>Projects and documents can be controlled independently.</p></div><label><span>Projects</span><input type="checkbox" checked={form.show_projects!==false} onChange={e=>setForm((p:any)=>({...p,show_projects:e.target.checked}))}/></label><label><span>Documents</span><input type="checkbox" checked={form.show_documents!==false} onChange={e=>setForm((p:any)=>({...p,show_documents:e.target.checked}))}/></label></div>
      {message&&<div className="auth-message">{message}</div>}<div className="client-portal-actions"><button className="primary" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save client"}</button><button className="secondary danger-button" onClick={()=>setArchiveOpen(true)} disabled={saving||archiving}>Archive</button></div>
      </div></section>
      <section className="settings-section-card"><div className="settings-section-body"><div className="portal-access-head"><div><b>Protected portal</b><p>Enable access only after a password is configured. The link itself contains no secret.</p></div><span className={client.portal_enabled&&client.portal_password_set_at?"status paid":"status"}>{client.portal_enabled&&client.portal_password_set_at?"Protected":"Disabled"}</span></div><label>Portal password<input type="password" value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder="10+ characters" autoComplete="new-password"/></label><button className="primary" onClick={()=>void setPassword()}>{client.portal_password_set_at?"Reset protected password":"Set protected access"}</button>{client.portal_slug&&<div className="portal-link-box"><code>{typeof window!=="undefined"?window.location.origin:""}/portal/{client.portal_slug}</code><button className="secondary" onClick={async()=>{const url=window.location.origin+"/portal/"+client.portal_slug;await navigator.clipboard.writeText(url);setPortalCopied(true);setTimeout(()=>setPortalCopied(false),1600)}}>{portalCopied?"Copied":"Copy link"}</button></div>}</div></section>
    </section>}
    {archiveOpen&&<ManagedDialog open onClose={()=>!archiving&&setArchiveOpen(false)} title="Archive client" description={`Archive “${client.name}”? Existing invoices, payments and documents remain in the financial record, while client portal access is disabled.`}><div className="composer-body"><div className="drawer-foot"><button type="button" className="secondary" onClick={()=>setArchiveOpen(false)} disabled={archiving}>Cancel</button><button type="button" className="primary danger-button" onClick={()=>void archiveClient()} disabled={archiving}>{archiving?<><InlineLoader label="Archiving" />Archiving…</>:"Archive client"}</button></div></div></ManagedDialog>}
  </div>;
}
export function periodLabel(p:Period){if(p==="month")return "This month";if(p==="3months")return "Last 3 months";if(p==="6months")return "Last 6 months";if(p==="fy"){const n=new Date();const y=n.getMonth()>=3?n.getFullYear():n.getFullYear()-1;return `FY ${y}-${String(y+1).slice(-2)}`;}return "All time";}

export function withinPeriod(date:string,p:Period,today=new Date()){if(p==="all")return true;const d=new Date(date+"T00:00:00"),end=new Date(today.getFullYear(),today.getMonth()+1,0);if(p==="month")return d>=new Date(today.getFullYear(),today.getMonth(),1)&&d<=end;if(p==="3months"){const start=new Date(today.getFullYear(),today.getMonth()-2,1);return d>=start&&d<=end;}if(p==="6months"){const start=new Date(today.getFullYear(),today.getMonth()-5,1);return d>=start&&d<=end;}const fy=new Date(today.getMonth()>=3?today.getFullYear():today.getFullYear()-1,3,1);return d>=fy&&d<=new Date(fy.getFullYear()+1,2,31);}

export function ReportsView({invoices}:{invoices:Invoice[]}) {
  const [period,setPeriod]=useState<Period>("fy");
  const [client,setClient]=useState("all");
  const [organization,setOrganization]=useState("all");
  const [projects,setProjects]=useState<any[]>([]);
  const drawerRef=useRef<HTMLElement>(null);
  const previousFocusRef=useRef<HTMLElement|null>(null);
  const [organizations,setOrganizations]=useState<any[]>([]);
  useEffect(()=>{
    Promise.all([
      supabase.from("projects").select("id,name,organization_id,actual_cost,status,clients(name),organizations(name)"),
      supabase.from("organizations").select("id,name").order("name")
    ]).then(([p,o])=>{setProjects(p.data||[]);setOrganizations(o.data||[])});
  },[]);
  const clients=[...new Set(invoices.map(i=>i.client))].sort();
  const scoped=invoices.filter(i=>(client==="all"||i.client===client)&&(organization==="all"||i.organizationId===organization)&&withinPeriod(i.date,period));
  const billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0);
  const paid=scoped.reduce((s,i)=>s+paidTotal(i),0);
  const open=scoped.reduce((s,i)=>s+invoiceBalance(i),0);
  const overdue=scoped.filter(i=>daysOverdue(i)>0).reduce((s,i)=>s+invoiceBalance(i),0);
  const aging={current:0,d1_30:0,d31_60:0,d61_90:0,d90:0};
  scoped.forEach(i=>{const b=invoiceBalance(i);if(!b)return;const d=daysOverdue(i);if(d<=0)aging.current+=b;else if(d<=30)aging.d1_30+=b;else if(d<=60)aging.d31_60+=b;else if(d<=90)aging.d61_90+=b;else aging.d90+=b});
  const byClient=new Map<string,number>();
  const byOrganization=new Map<string,number>();
  const byProject=new Map<string,{billed:number;paid:number;open:number}>();
  scoped.forEach(i=>{
    byClient.set(i.client,(byClient.get(i.client)||0)+invoiceTotal(i));
    const orgName=organizations.find(o=>o.id===i.organizationId)?.name||"Unassigned organisation";
    byOrganization.set(orgName,(byOrganization.get(orgName)||0)+invoiceTotal(i));
    const key=i.project||"Unassigned";
    const x=byProject.get(key)||{billed:0,paid:0,open:0};
    x.billed+=invoiceTotal(i);x.paid+=paidTotal(i);x.open+=invoiceBalance(i);byProject.set(key,x);
  });
  const payments=scoped.flatMap(i=>i.payments.map(p=>({...p,invoice:i})));
  const cashByMonth=new Map<string,number>();
  const collectionsByMethod=new Map<string,number>();
  payments.forEach(p=>{
    if(!p.payment_date||!withinPeriod(p.payment_date,period))return;
    const month=p.payment_date.slice(0,7);
    cashByMonth.set(month,(cashByMonth.get(month)||0)+Number(p.amount||0));
    const method=p.method.replaceAll("_"," ");
    collectionsByMethod.set(method,(collectionsByMethod.get(method)||0)+Number(p.amount||0));
  });
  const projectCost=new Map(projects.map(p=>[p.id,Number(p.actual_cost||0)]));
  const projectProfitability=[...byProject.entries()].map(([name,v])=>{
    const linked=projects.find(p=>p.name===name);
    const cost=linked?.id?projectCost.get(linked.id)||0:0;
    return {name,...v,cost,profit:v.billed-cost};
  }).sort((a,b)=>b.profit-a.profit);
  const maxOrg=Math.max(...byOrganization.values(),1);
  const maxProject=Math.max(...projectProfitability.map(x=>x.billed),1);
  const maxCash=Math.max(...cashByMonth.values(),1);
  return <div className="reports-page">
    <section className="compact-page-head"><div><span className="eyebrow">Analysis</span><h2>Reports</h2><p>Receivables, collections, revenue and project economics from the same financial source of truth.</p></div></section>
    <div className="report-toolbar">
      <div className="period-strip">{(["month","3months","6months","fy","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>
      <div className="report-filters"><select value={organization} onChange={e=>setOrganization(e.target.value)}><option value="all">All organisations</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><select value={client} onChange={e=>setClient(e.target.value)}><option value="all">All clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select></div>
    </div>
    <section className="kpis compact-kpis">
      <Kpi label="Billed" value={money(billed)} detail={periodLabel(period)}/>
      <Kpi label="Collected" value={money(paid)} detail="Recorded payments"/>
      <Kpi label="Outstanding" value={money(open)} detail="Open balance"/>
      <Kpi label="Overdue" value={money(overdue)} detail={scoped.filter(i=>daysOverdue(i)>0).length+" invoices"}/>
    </section>
    <div className="overview-grid">
      <section className="data-panel"><div className="data-panel-head"><div><h2>Cashflow</h2><p>Actual payments received by month.</p></div></div><div className="report-bars">{[...cashByMonth.entries()].sort().map(([month,value])=><div className="report-bar-row" key={month}><span>{month}</span><div><i style={{width:Math.max(4,Math.round(value/maxCash*100))+"%"}}/></div><strong>{money(value)}</strong></div>)}{!cashByMonth.size&&<div className="empty-state">No recorded cashflow in this period.</div>}</div></section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>Collections</h2><p>Received by payment method.</p></div></div><div className="simple-list">{[...collectionsByMethod.entries()].sort((a,b)=>b[1]-a[1]).map(([method,value])=><div className="simple-row" key={method}><b>{method}</b><span>Payment method</span><span></span><strong>{money(value)}</strong><em>Collected</em></div>)}{!collectionsByMethod.size&&<div className="empty-state">No collections in this period.</div>}</div></section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>AR ageing</h2><p>Open receivables by age.</p></div></div><div className="simple-list">{[["Current",aging.current],["1–30 days",aging.d1_30],["31–60 days",aging.d31_60],["61–90 days",aging.d61_90],[">90 days",aging.d90]].map(([label,value])=><div className="simple-row" key={String(label)}><b>{label}</b><span>Receivable</span><span></span><strong>{money(Number(value))}</strong><em>Open</em></div>)}</div></section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>Revenue by organisation</h2><p>Billing distribution across the workspace.</p></div></div><div className="report-bars">{[...byOrganization.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="report-bar-row" key={name}><span>{name}</span><div><i style={{width:Math.max(4,Math.round(value/maxOrg*100))+"%"}}/></div><strong>{money(value)}</strong></div>)}{!byOrganization.size&&<div className="empty-state">No revenue in this period.</div>}</div></section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>Revenue by client</h2><p>Gross billed amount.</p></div></div><div className="simple-list">{[...byClient.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="simple-row" key={name}><b>{name}</b><span>Client</span><span></span><strong>{money(value)}</strong><em>Billed</em></div>)}{!byClient.size&&<div className="empty-state">No revenue in this period.</div>}</div></section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>Project profitability</h2><p>Billed less recorded project cost.</p></div></div><div className="simple-list">{projectProfitability.map(x=><div className="simple-row" key={x.name}><b>{x.name}</b><span>{money(x.cost)} cost</span><span>{money(x.open)} open</span><strong>{money(x.profit)}</strong><em>{x.cost?"Profit":"No cost"}</em></div>)}{!projectProfitability.length&&<div className="empty-state">No project revenue in this period.</div>}</div></section>
    </div>
  </div>;
}
export function ProjectsView({invoices,organizationId,onOpen,onNew}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void;onNew:()=>void}) {
  const [projects,setProjects]=useState<any[]>([]),[loading,setLoading]=useState(true),[creating,setCreating]=useState(false),[projectQuery,setProjectQuery]=useState(""),[selectedProjectId,setSelectedProjectId]=useState<string|null>(null);
  async function load(){setLoading(true);if(!organizationId){setProjects([]);setLoading(false);return}let query=supabase.from("projects").select("*, clients(name), organizations(name)").order("name");if(organizationId!==ALL_ORGANIZATIONS_ID)query=query.eq("organization_id",organizationId);const {data}=await query;setProjects(data||[]);setLoading(false)}
  useEffect(()=>{void load();const h=()=>setCreating(true);window.addEventListener("finance:new-project",h);return()=>window.removeEventListener("finance:new-project",h)},[organizationId]);
  const fallback=new Map<string,{name:string;client:string;invoices:Invoice[];billed:number;paid:number}>();invoices.forEach(i=>{const key=(i.projectId||i.project)+"::"+(i.clientId||i.client);const x=fallback.get(key)||{name:i.project,client:i.client,invoices:[],billed:0,paid:0};x.invoices.push(i);x.billed+=invoiceTotal(i);x.paid+=paidTotal(i);fallback.set(key,x)});
  const derived=[...fallback.values()].filter(x=>!projects.some(p=>p.name===x.name&&p.clients?.name===x.client));
  const visibleProjects=projects.filter(p=>[p.name,p.clients?.name,p.status].join(" ").toLowerCase().includes(projectQuery.toLowerCase()));
  const visibleDerived=derived.filter(p=>[p.name,p.client].join(" ").toLowerCase().includes(projectQuery.toLowerCase()));
  const revenue=projects.reduce((s,p)=>s+invoices.filter(i=>i.projectId===p.id).reduce((a,i)=>a+invoiceTotal(i),0),0)+derived.reduce((s,p)=>s+p.billed,0);
  const cost=projects.reduce((s,p)=>s+Number(p.actual_cost||0),0);
  const selectedProject=selectedProjectId?projects.find(p=>p.id===selectedProjectId):null;
  if(selectedProject)return <ProjectWorkspace project={selectedProject} invoices={invoices} onBack={()=>setSelectedProjectId(null)} onOpenInvoice={onOpen} onSaved={load}/>;
  return <div className="operations-page">
    <section className="operations-intro compact-page-head"><div><span className="eyebrow">Production</span><h2>Projects</h2></div><div className="operations-head-actions"><div className="operations-count"><b>{projects.length+derived.length}</b><span>records</span></div><button className="primary" onClick={onNew}><Plus size={14}/>New project</button></div></section>
    <section className="register-summary"><div><span>ACTIVE</span><b>{projects.filter(p=>p.status==="active").length+derived.length}</b></div><div><span>REVENUE</span><b>{money(revenue)}</b></div><div><span>RECORDED COST</span><b>{money(cost)}</b></div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Register</h2><span>{visibleProjects.length+visibleDerived.length} shown</span></div><div className="search compact-search"><Search size={14}/><input value={projectQuery} onChange={e=>setProjectQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects"/></div></div>{loading?<div className="empty-state"><div className="loading-mark"><RefreshCw size={16}/></div>Loading projects…</div>:visibleProjects.length||visibleDerived.length?<div className="client-grid">{visibleProjects.map(p=><ProjectCard key={p.id} p={p} invoices={invoices} onOpen={onOpen} onSaved={load} onDetail={()=>setSelectedProjectId(p.id)}/>)}
{visibleDerived.map(p=><ProjectCard key={p.name+"::"+p.client} p={{name:p.name,clients:{name:p.client},budget_cost:0,actual_cost:0,status:"active"}} invoices={p.invoices} onOpen={onOpen}/>)}</div>:<div className="empty-state"><FolderKanban size={18}/><b>{projectQuery?"No projects match.":"No projects yet."}</b><span>{projectQuery?"Change the search.":"Create a project for this organisation."}</span></div>}</section>
    {creating&&<ProjectCreateModal organizationId={organizationId} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);void load()}}/>}
  </div>;
}
export function ProjectWorkspace({project,invoices,onBack,onOpenInvoice,onSaved}:{project:any;invoices:Invoice[];onBack:()=>void;onOpenInvoice:(i:Invoice)=>void;onSaved:()=>void}) {
  const [tab,setTab]=useState<"overview"|"invoices"|"payments"|"documents"|"activity">("overview");
  const [activity,setActivity]=useState<any[]>([]);
  const [documents,setDocuments]=useState<any[]>([]);
  const [editing,setEditing]=useState(false);
  const rows=invoices.filter(i=>i.projectId===project.id);
  const payments=rows.flatMap(i=>i.payments.map(payment=>({...payment,invoice:i}))).sort((a,b)=>String(b.payment_date||"").localeCompare(String(a.payment_date||"")));
  const billed=rows.reduce((sum,i)=>sum+invoiceTotal(i),0);
  const collected=rows.reduce((sum,i)=>sum+paidTotal(i),0);
  const outstanding=rows.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const actualCost=Number(project.actual_cost||0);
  const budgetCost=Number(project.budget_cost||0);
  const profit=billed-actualCost;

  useEffect(()=>{
    let cancelled=false;
    const invoiceIds=rows.map(i=>i.id);
    const activityQuery=supabase.from("project_activity").select("*").eq("project_id",project.id).order("created_at",{ascending:false}).limit(50);
    const documentQuery=invoiceIds.length
      ? supabase.from("documents").select("id,file_name,file_path,document_type,status,created_at,invoice_id").in("invoice_id",invoiceIds).order("created_at",{ascending:false})
      : Promise.resolve({data:[] as any[],error:null});
    Promise.all([activityQuery,documentQuery]).then(([a,d]:any)=>{
      if(cancelled)return;
      setActivity(a.data||[]);
      setDocuments(d.data||[]);
    });
    return()=>{cancelled=true};
  },[project.id,rows.map(i=>i.id).join("|")]);

  return <div className="project-workspace">
    <header className="project-workspace-head">
      <button type="button" className="back-link" onClick={onBack}>← Projects</button>
      <div className="project-workspace-title"><span className="client-avatar"><FolderKanban size={16}/></span><div><span className="eyebrow">Project workspace</span><h2>{project.name}</h2><p>{project.clients?.name||"Unassigned client"} · {project.status||"active"}</p></div></div>
      <button type="button" className="secondary" onClick={()=>setEditing(true)}>Edit project</button>
    </header>

    <section className="register-summary project-summary">
      <div><span>BILLED</span><b>{money(billed)}</b></div>
      <div><span>COLLECTED</span><b>{money(collected)}</b></div>
      <div><span>OUTSTANDING</span><b>{money(outstanding)}</b></div>
      <div><span>PROFIT</span><b>{money(profit)}</b></div>
    </section>

    <div className="client-tabs project-tabs">{(["overview","invoices","payments","documents","activity"] as const).map(key=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div>

    {tab==="overview"&&<div className="overview-grid project-overview-grid">
      <section className="data-panel"><div className="data-panel-head"><div><h2>Project</h2><span>{project.project_type||"General"}</span></div></div><div className="client-detail-list">
        <div className="client-detail-row"><span>Status</span><strong>{project.status||"active"}</strong></div>
        <div className="client-detail-row"><span>Budget cost</span><strong>{money(budgetCost)}</strong></div>
        <div className="client-detail-row"><span>Actual cost</span><strong>{money(actualCost)}</strong></div>
        <div className="client-detail-row"><span>Start</span><strong>{project.start_date?dateLabel(project.start_date):"—"}</strong></div>
        <div className="client-detail-row"><span>End</span><strong>{project.end_date?dateLabel(project.end_date):"—"}</strong></div>
      </div>{project.description&&<div className="project-description">{project.description}</div>}</section>
      <section className="data-panel"><div className="data-panel-head"><div><h2>Recent invoices</h2><span>{rows.length} linked</span></div></div>{rows.slice(0,6).map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.client}</strong><small>{dateLabel(i.date)}</small></span><StatusPill status={i.status as FinanceStatus}/><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}{!rows.length&&<div className="empty-state"><FileText size={18}/><b>No invoices linked.</b></div>}</section>
    </div>}

    {tab==="invoices"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Invoices</h2><span>{rows.length} records</span></div></div>{rows.map(i=><button className="invoice-register-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span><strong>{i.client}</strong><small>{dateLabel(i.date)}</small></span><StatusPill status={i.status as FinanceStatus}/><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={13}/></button>)}{!rows.length&&<div className="empty-state"><FileText size={18}/><b>No invoices linked.</b></div>}</section>}

    {tab==="payments"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Payments</h2><span>{payments.length} received</span></div></div>{payments.length?<div className="payment-ledger-list">{payments.map(row=><div className="payment-ledger-row" key={row.id}><div className="payment-ledger-main"><b>#{row.invoice.number} · {row.invoice.client}</b><span>{row.payment_date?dateLabel(row.payment_date):"Date unknown"} · {row.method.replaceAll("_"," ")}</span></div><strong>{money(row.amount)}</strong><a className="text-action payment-receipt-action" href={"/api/payments/"+row.id+"/receipt"}>Receipt</a></div>)}</div>:<div className="empty-state"><WalletCards size={18}/><b>No payments recorded.</b></div>}</section>}

    {tab==="documents"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Documents</h2><span>{documents.length} generated</span></div></div>{documents.length?<div className="client-detail-list">{documents.map(d=><div className="client-detail-row" key={d.id}><span>{d.file_name||d.document_type}</span><DownloadButton label="Download" loadingLabel="Preparing" doneLabel="Ready" disabled={!d.file_path} onClick={()=>downloadFile("/api/documents/"+d.id+"/download",d.file_name||"document.pdf")}/></div>)}</div>:<div className="empty-state"><FileText size={18}/><b>No generated documents.</b><span>Invoice and receipt documents appear here when generated.</span></div>}</section>}

    {tab==="activity"&&<section className="data-panel"><div className="data-panel-head"><div><h2>Activity</h2><span>{activity.length} events</span></div></div>{activity.length?<div className="activity-list project-activity-list">{activity.map(event=><div className="activity-item" key={event.id}><span className="activity-dot"/><div><b>{String(event.action||"activity").replaceAll("_"," ")}</b><small>{new Date(event.created_at).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</small></div></div>)}</div>:<div className="empty-state"><RefreshCw size={18}/><b>No project activity yet.</b></div>}</section>}

    {editing&&<ProjectEditModal project={project} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onSaved()}}/>}
  </div>;
}

export function ProjectCard({p,invoices,onOpen,onSaved,onDetail}:{p:any;invoices:Invoice[];onOpen:(i:Invoice)=>void;onSaved?:()=>void;onDetail?:()=>void}) {
 const [editing,setEditing]=useState(false);const [archiveConfirm,setArchiveConfirm]=useState(false);const [archiving,setArchiving]=useState(false);const [archiveError,setArchiveError]=useState("");
 const rows=invoices.filter(i=>(p.id&&i.projectId===p.id)||(!p.id&&i.project===p.name&&i.client===(p.clients?.name||"")));const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0),paid=rows.reduce((s,i)=>s+paidTotal(i),0);
 async function archive(){if(!p.id)return;setArchiving(true);setArchiveError("");const {error}=await supabase.from("projects").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",p.id);setArchiving(false);if(error)setArchiveError(error.message);else{setArchiveConfirm(false);onSaved?.()}}
 return <><article className="client-card project-card"><div className="client-avatar"><FolderKanban size={16}/></div><div><h3>{p.name}</h3><p>{p.clients?.name||"Unassigned client"} · {p.status||"active"}</p></div><strong>{money(billed)}</strong><small>{money(paid)} collected · {money(Math.max(billed-paid,0))} outstanding</small><div className="project-actions">{p.id&&<>{onDetail&&<button type="button" className="secondary mini-action" onClick={onDetail}>Open</button>}<button type="button" className="secondary mini-action" onClick={()=>setEditing(true)}>Edit</button><button type="button" className="secondary mini-action danger-button" onClick={()=>setArchiveConfirm(true)}>Archive</button></>}</div>{archiveError&&<div className="auth-message" role="alert">{archiveError}</div>}</article>{editing&&<ProjectEditModal project={p} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onSaved?.()}}/>}{archiveConfirm&&<ManagedDialog open onClose={()=>!archiving&&setArchiveConfirm(false)} title="Archive project" description={`Archive “${p.name}”? Existing invoices and payment history will remain intact.`}><div className="composer-body"><div className="drawer-foot"><button type="button" className="secondary" onClick={()=>setArchiveConfirm(false)} disabled={archiving}>Cancel</button><button type="button" className="primary danger-button" onClick={()=>void archive()} disabled={archiving}>{archiving?<><InlineLoader label="Archiving" />Archiving…</>:"Archive project"}</button></div></div></ManagedDialog>}</>;
}
export function ProjectEditModal({project,onClose,onSaved}:{project:any;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:project.name||"",status:project.status||"active",description:project.description||"",budget_cost:String(project.budget_cost||0),actual_cost:String(project.actual_cost||0)});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 async function save(e:FormEvent){e.preventDefault();setSaving(true);const {error}=await supabase.from("projects").update({name:form.name.trim(),status:form.status,description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,updated_at:new Date().toISOString()}).eq("id",project.id);setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <ManagedDialog open onClose={onClose} title="Edit project" description={project.name}><form className="composer-body form-grid" onSubmit={save}><label>Name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span" role="alert">{message}</div>}<div className="drawer-foot full-span"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?"Saving…":"Save project"}</button></div></form></ManagedDialog>;
}
export function ProjectCreateModal({organizationId,onClose,onSaved}:{organizationId:string|null;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:"",client_id:"",organization_id:organizationId||"",status:"active",description:"",budget_cost:"0",actual_cost:"0"});const [clients,setClients]=useState<any[]>([]);const [orgs,setOrgs]=useState<any[]>([]);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{Promise.all([supabase.from("clients").select("id,name").is("archived_at",null).eq("organization_id",organizationId||"").order("name"),organizationId ? supabase.from("organizations").select("id,name").eq("id",organizationId).single() : Promise.resolve({data:null})]).then(([a,b])=>{setClients(a.data||[]);setOrgs(b.data?[b.data]:[])})},[organizationId]);
 async function save(e:FormEvent){e.preventDefault();if(!form.name.trim())return setMessage("Project name is required.");setSaving(true);const {error}=await supabase.from("projects").insert({...form,name:form.name.trim(),description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,client_id:form.client_id||null,organization_id:organizationId||null});setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <ManagedDialog open onClose={onClose} title="Create project" description="Create a project and keep its billing identity explicit."><form className="composer-body form-grid" onSubmit={save}><label>Project name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Client<select value={form.client_id} onChange={e=>setForm((f:any)=>({...f,client_id:e.target.value}))}><option value="">Unassigned</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Organisation<select value={form.organization_id} onChange={e=>setForm((f:any)=>({...f,organization_id:e.target.value}))}><option value="">Unassigned</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span" role="alert">{message}</div>}<div className="drawer-foot full-span"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving?"Creating…":"Create project"}</button></div></form></ManagedDialog>;
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
      <button className="invoice-status-button" onClick={e=>{e.stopPropagation();onOpen();}} aria-label={"Open invoice status: "+statusLabel(invoice.status)}><StatusPill status={invoice.status as FinanceStatus} /></button>
      <ChevronRight size={17} className="chevron"/>
    </div>
  </article>;
}

export function InvoiceDrawer({invoice,onClose,onSave,onPayment}:{invoice:Invoice;onClose:()=>void;onSave:(i:Invoice)=>void;onPayment:()=>void}) {
  const [draft,setDraft] = useState(invoice);
  const [organizations,setOrganizations]=useState<any[]>([]);
  const [clients,setClients]=useState<any[]>([]);
  const [projects,setProjects]=useState<any[]>([]);
  const drawerRef=useRef<HTMLElement>(null);
  const previousFocusRef=useRef<HTMLElement|null>(null);
  const [discardOpen,setDiscardOpen]=useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(invoice);
  useEffect(()=>{supabase.from("organizations").select("id,name,status,next_invoice_number,invoice_prefix").order("name").then(({data})=>setOrganizations(data||[]))},[]);
  useEffect(()=>{
    const orgId=draft.organizationId;
    if(!orgId){setClients([]);setProjects([]);return}
    Promise.all([
      supabase.from("clients").select("id,name").is("archived_at",null).eq("organization_id",orgId).order("name"),
      supabase.from("projects").select("id,name,client_id").eq("organization_id",orgId).neq("status","archived").order("name")
    ]).then(([c,p])=>{setClients(c.data||[]);setProjects(p.data||[])});
  },[draft.organizationId]);
  useEffect(() => setDraft(invoice), [invoice]);
  useEffect(()=>{
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root=drawerRef.current;
    const selector="button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex='-1'])";
    requestAnimationFrame(()=>root?.querySelector<HTMLElement>(selector)?.focus());
    const onTab=(event:globalThis.KeyboardEvent)=>{
      if(event.key!=="Tab"||!root)return;
      const focusable=Array.from(root.querySelectorAll<HTMLElement>(selector));
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    };
    document.addEventListener("keydown",onTab);
    return()=>{document.removeEventListener("keydown",onTab);const previous=previousFocusRef.current;if(previous&&document.contains(previous))previous.focus();previousFocusRef.current=null};
  },[]);
  useEffect(()=>{
    const onEscape=(event:globalThis.KeyboardEvent)=>{
      if(event.key!=="Escape")return;
      event.preventDefault();
      if(!dirty) onClose(); else setDiscardOpen(true);
    };
    document.addEventListener("keydown",onEscape);
    return()=>document.removeEventListener("keydown",onEscape);
  },[dirty,onClose]);
  const unpriced = draft.contents.filter(c => !c.priced).length;
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState("");
  const validate = () => {
    if (!draft.organizationId) return "Select a billing organisation before saving.";
    if (!draft.clientId || !draft.client.trim()) return "Select a client before saving.";
    if (!draft.number.trim()) return "Invoice number is required.";
    if (!draft.date) return "Issue date is required.";
    if (draft.dueDate && draft.dueDate < draft.date) return "Due date cannot be earlier than the issue date.";
    if (!draft.contents.some(c => c.title.trim())) return "Add at least one invoice content line.";
    if (draft.contents.some(c => c.title.trim() && c.kind !== "note" && c.priced && Number(c.rate) < 0)) return "Line-item rates cannot be negative.";
    return "";
  };
  const save = async () => {
    const error = validate();
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError("");
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };
  const requestClose = () => {
    if (!dirty) onClose();
    else setDiscardOpen(true);
  };
  useEffect(() => {
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "s" || event.key === "Enter")) {
        event.preventDefault();
        if (dirty) void save();
      }
    };
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [dirty, draft, onSave]);
  const patch = (id:string,p:Partial<Content>) => setDraft(d => ({...d,contents:d.contents.map(c => c.id === id ? {...c,...p,amount:p.amount ?? ((p.quantity ?? c.quantity) * (p.rate ?? c.rate ?? 0))} : c)}));
  const add = (kind:ContentKind = "service") => setDraft(d => ({...d,contents:[...d.contents,{id:crypto.randomUUID(),title:kind === "note" ? "Note" : "New content",kind,quantity:1,priced:kind === "note"}]}));
  const remove = (id:string) => setDraft(d => ({...d,contents:d.contents.filter(c => c.id !== id)}));
  return <div className="overlay invoice-edit-overlay" onMouseDown={requestClose}><aside ref={drawerRef} className="drawer invoice-edit-drawer" role="dialog" aria-modal="true" aria-labelledby="invoice-editor-title" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">INVOICE</div><h2 id="invoice-editor-title">#{draft.number}</h2><p>{draft.client} · {draft.project}</p></div><button className="icon-button" onClick={requestClose} aria-label="Close invoice editor"><X size={18}/></button></div>
    <div className="drawer-body">
      <div className="invoice-drawer-lockup">
        <span className="invoice-hero-mark">{(organizations.find(o=>o.id===draft.organizationId)?.name||"O").slice(0,1).toUpperCase()}</span>
        <div><b>{organizations.find(o=>o.id===draft.organizationId)?.name||"Organisation"}</b><span>#{draft.number}</span></div>
        <strong>{money(invoiceTotal(draft))}</strong>
      </div>
      <div className="drawer-summary compact-summary">
        <div><span>Collected</span><strong>{money(paidTotal(draft))}</strong></div>
        <div><span>Balance</span><strong>{money(Math.max(invoiceTotal(draft)-paidTotal(draft),0))}</strong></div>
        <div><span>Status</span><select className="status-select" value={draft.status} onChange={e=>setDraft(d=>({...d,status:e.target.value as Status}))}><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div>
      </div>
      <div className="invoice-meta-grid">
        <label>Client<select value={draft.clientId ?? ""} onChange={e=>{const id=e.target.value||null;const c=clients.find(x=>x.id===id);setDraft(d=>({...d,clientId:id,client:c?.name||d.client,projectId:null,project:""}))}}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Project<select value={draft.projectId ?? ""} onChange={e=>{const id=e.target.value||null;const p=projects.find(x=>x.id===id);setDraft(d=>({...d,projectId:id,project:p?.name||d.project}))}}><option value="">Select project</option>{projects.filter(p=>!draft.clientId||p.client_id===draft.clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Issue date<input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label>
        <label>Due date<input type="date" value={draft.dueDate ?? ""} onChange={e=>setDraft(d=>({...d,dueDate:e.target.value || null}))}/></label>
        <label className="full-span">Billing organisation<select value={draft.organizationId ?? ""} onChange={e=>setDraft(d=>({...d,organizationId:e.target.value||null}))} required>{organizations.map(o=><option key={o.id} value={o.id} disabled={["dissolved","discontinued"].includes(o.status)}>{o.name}{["dissolved","discontinued"].includes(o.status)?" · historical":""}</option>)}</select></label>
      </div>
      {unpriced > 0 && <div className="integrity warning"><CircleAlert size={17}/><div><b>{unpriced} content item{unpriced > 1 ? "s" : ""} still unpriced</b><span>Visible and retained, but excluded from the financial total until priced.</span></div></div>}
      {draft.sourceTotal != null && draft.sourceTotal !== invoiceTotal(draft) && <div className="integrity warning"><CircleAlert size={17}/><div><b>Source total differs from calculated total</b><span>Recorded source total: {money(draft.sourceTotal)} · calculated from contents: {money(invoiceTotal(draft))}</span></div></div>}
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Everything being billed on this invoice.</p></div><button className="secondary" onClick={() => add()}><Plus size={15}/>Add content</button></div>
        <div className="content-table">{draft.contents.map((c,idx) => <div className="content-row" key={c.id}>
          <div className="row-index">{String(idx + 1).padStart(2,"0")}</div><div className="content-title-stack"><input className="content-title" value={c.title} onChange={e => patch(c.id,{title:e.target.value})}/><input className="content-assigned-input" value={c.assignedBy ?? ""} onChange={e => patch(c.id,{assignedBy:e.target.value || null})} placeholder="Assigned by"/></div><select value={c.kind} onChange={e => patch(c.id,{kind:e.target.value as ContentKind})}><option value="service">Service</option><option value="adjustment">Adjustment</option><option value="note">Note</option></select><input className="number-input" type="number" placeholder="Qty" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})}/><input className="number-input" type="number" placeholder="Rate" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})}/><div className={"row-amount" + (!c.priced ? " muted" : "")}>{c.priced ? money(contentAmount(c)) : "TBD"}</div><button className="tiny-delete" onClick={() => remove(c.id)}><X size={14}/></button>
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
    {validationError && <div className="auth-message invoice-validation-message" role="alert">{validationError}</div>}
    <div className="drawer-foot invoice-drawer-actions"><DownloadButton label="Download PDF" onClick={() => downloadFile("/api/invoices/" + draft.id + "/pdf","invoice.pdf")}/><button type="button" className="secondary invoice-share-action" onClick={()=>void shareFile("/api/invoices/"+draft.id+"/pdf","invoice.pdf","Invoice #"+draft.number)}><Share2 size={14}/>Share</button><button className="secondary invoice-payment-action" onClick={onPayment} disabled={saving || paidTotal(draft)>=invoiceTotal(draft)}><WalletCards size={14}/>Record payment</button><button className="secondary invoice-close-action" onClick={requestClose} disabled={saving}>Close</button><button className="primary invoice-save-action" disabled={!dirty || saving} onClick={() => void save()}><Check size={16}/>{saving ? <><InlineLoader label="Saving" />Saving…</> : "Save changes"}</button></div>
  </aside>{discardOpen&&<ManagedDialog open onClose={()=>setDiscardOpen(false)} title="Discard invoice changes?" description="Your unsaved edits to this invoice will be lost."><div className="composer-body"><div className="drawer-foot"><button type="button" className="secondary" onClick={()=>setDiscardOpen(false)}>Keep editing</button><button type="button" className="primary danger-button" onClick={onClose}>Discard changes</button></div></div></ManagedDialog>}</div>;
}

export function InvoiceComposer({initialNumber,initialOrganizationId,onClose,onCreate}:{initialNumber:string;initialOrganizationId:string|null;onClose:()=>void;onCreate:(d:{number:string;client:string;project:string;date:string;dueDate:string;organizationId?:string|null;contents:Content[]})=>Promise<void>|void}) {
  const [number]=useState(initialNumber);
  const [client,setClient]=useState("");
  const [project,setProject]=useState("");
  const [clientMode,setClientMode]=useState<"existing"|"new">("existing");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [dueDate,setDueDate]=useState(new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  const [contents,setContents]=useState<Content[]>([{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  const [saving,setSaving]=useState(false);
  const [clients,setClients]=useState<any[]>([]);
  const [projects,setProjects]=useState<any[]>([]);
  const [organizationName,setOrganizationName]=useState("");
  const [discardOpen,setDiscardOpen]=useState(false);
  const organizationId=initialOrganizationId||"";
  const total=contents.reduce((sum,c)=>sum+contentAmount(c),0);
  const dirty=Boolean(client||project||contents.some(c=>c.title.trim()||c.rate!=null)||date!==new Date().toISOString().slice(0,10));
  const requestClose=()=>{if(!dirty)onClose();else setDiscardOpen(true)};

  useEffect(()=>{
    if(!organizationId){setClients([]);setProjects([]);return}
    Promise.all([
      supabase.from("clients").select("id,name").is("archived_at",null).eq("organization_id",organizationId).order("name"),
      supabase.from("projects").select("id,name,client_id").eq("organization_id",organizationId).neq("status","archived").order("name"),
      supabase.from("organizations").select("name").eq("id",organizationId).single()
    ]).then(([c,p,o])=>{setClients(c.data||[]);setProjects(p.data||[]);setOrganizationName(o.data?.name||"Current organisation")});
  },[organizationId]);

  const patch=(id:string,p:Partial<Content>)=>setContents(v=>v.map(c=>c.id===id?{...c,...p}:c));
  const add=()=>setContents(v=>[...v,{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  const clientProjects=projects.filter(p=>{const selected=clients.find(c=>c.name===client);return !selected||p.client_id===selected.id});
  const canCreate=Boolean(number&&organizationId&&client.trim()&&contents.some(c=>c.title.trim()));
  const submit=async()=>{if(!canCreate||saving)return;setSaving(true);try{await onCreate({number,client,project,date,dueDate,organizationId,contents})}finally{setSaving(false)}};

  return <ManagedDialog open onClose={requestClose} title="Create invoice" description="Build the billable record first. The PDF is generated from the saved invoice." className="composer invoice-composer" overlayClassName="invoice-editor-overlay">
      <div className="composer-body editor-body">
        <section className="editor-section">
          <div className="editor-section-head"><div><span className="section-kicker">IDENTITY</span><h3>Invoice details</h3></div><span className="editor-number">#{number}</span></div>
          <div className="form-grid invoice-detail-grid">
            <div className="field-stack"><label>Client{clientMode==="existing"?<select required value={client} onChange={e=>{setClient(e.target.value);setProject("")}}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}</select>:<input autoFocus required value={client} onChange={e=>{setClient(e.target.value);setProject("")}} placeholder="New client name"/>}</label><button type="button" className="field-inline-action" onClick={()=>{setClientMode(v=>v==="existing"?"new":"existing");setClient("")}}>{clientMode==="existing"?"+ New client":"← Existing client"}</button></div>
            <label>Project<input value={project} onChange={e=>setProject(e.target.value)} placeholder="Optional project / engagement"/></label>
            <label>Issue date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
            <label>Due date<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>
          </div>
          <div className="editor-org-lock"><Building2 size={15}/><div><span>Billing organisation</span><b>{organizationId ? (organizationName||"Current organisation") : "No organisation selected"}</b></div><span className="editor-readonly">#{number}</span></div>
        </section>

        <section className="editor-section contents-editor-section">
          <div className="editor-section-head"><div><span className="section-kicker">LINE ITEMS</span><h3>Contents</h3><p>Every billable deliverable belongs here. Unpriced lines remain visible but are excluded from the total.</p></div><button type="button" className="secondary" onClick={add} disabled={saving}><Plus size={15}/>Add content</button></div>
          <div className="editor-content-head"><span>#</span><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span></div>
          <div className="editor-content-list">{contents.map((c,idx)=>
            <div className="editor-content-row" key={c.id}>
              <span className="editor-index">{String(idx+1).padStart(2,"0")}</span>
              <div className="content-title-stack"><input value={c.title} onChange={e=>patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input className="content-assigned-input" value={c.assignedBy ?? ""} onChange={e=>patch(c.id,{assignedBy:e.target.value || null})} placeholder="Assigned by"/></div>
              <input type="number" min="1" value={c.quantity??""} onChange={e=>patch(c.id,{quantity:Number(e.target.value)||1})} placeholder="1" aria-label={"Quantity "+(idx+1)}/>
              <input type="number" min="0" value={c.rate??""} onChange={e=>patch(c.id,{rate:e.target.value?Number(e.target.value):null,priced:!!e.target.value})} placeholder="Rate" aria-label={"Rate "+(idx+1)}/>
              <b className={!c.priced?"unpriced":""}>{c.priced&&c.rate!=null?money(contentAmount(c)):"TBD"}</b>
              <button type="button" className="icon-button editor-delete" onClick={()=>setContents(v=>v.filter(x=>x.id!==c.id))} disabled={contents.length===1} aria-label={"Remove line "+(idx+1)}><X size={14}/></button>
            </div>
          )}</div>
          <div className="editor-total"><span>Total</span><strong>{money(total)}</strong></div>
        </section>
      </div>
      <div className="drawer-foot editor-footer">
        <button type="button" className="secondary" onClick={requestClose} disabled={saving}>Cancel</button>
        <button type="button" className="primary" disabled={!canCreate||saving} onClick={()=>void submit()}>{saving?<><InlineLoader label="Creating invoice" />Creating…</>:<><Check size={16}/>Create draft</>}</button>
      </div>
      {discardOpen&&<ManagedDialog open onClose={()=>setDiscardOpen(false)} title="Discard invoice draft?" description="The client, project and line items in this unsaved draft will be lost."><div className="composer-body"><div className="drawer-foot"><button type="button" className="secondary" onClick={()=>setDiscardOpen(false)}>Keep editing</button><button type="button" className="primary danger-button" onClick={onClose}>Discard draft</button></div></div></ManagedDialog>}
  </ManagedDialog>;
}

export function PaymentComposer({invoice,onClose,onCreate}:{invoice:Invoice;onClose:()=>void;onCreate:(i:Invoice,a:number,d:string,m:string,r:string)=>Promise<void>|void}) {
 const [amount,setAmount]=useState(String(Math.max(invoiceTotal(invoice)-paidTotal(invoice),0)));const [date,setDate]=useState(new Date().toISOString().slice(0,10));const [method,setMethod]=useState("bank_transfer");const [reference,setReference]=useState("");const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 const balance=Math.max(invoiceTotal(invoice)-paidTotal(invoice),0);
 async function submit(){const numericAmount=Number(amount);if(!numericAmount||numericAmount<=0||numericAmount>balance){setMessage("Enter a payment amount within the outstanding balance.");return}setSaving(true);setMessage("");try{await onCreate(invoice,numericAmount,date,method,reference)}catch{setMessage("Could not record the payment. Try again.")}finally{setSaving(false)}}
 return <ManagedDialog open onClose={saving?()=>{}:onClose} title="Record payment" description={invoice.client+" · "+money(balance)+" outstanding"}><div className="payment-form composer-body">
  <label>Amount<input autoFocus type="number" min="1" max={balance} value={amount} onChange={e=>setAmount(e.target.value)} disabled={saving}/></label>
  <label>Date<input type="date" value={date} onChange={e=>setDate(e.target.value)} disabled={saving}/></label>
  <label>Method<select value={method} onChange={e=>setMethod(e.target.value)} disabled={saving}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label>
  <label>Reference <span className="optional">(optional)</span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="UTR / transaction reference" disabled={saving}/></label>
  <div className="payment-total"><span>Remaining after payment</span><strong>{money(Math.max(balance-(Number(amount)||0),0))}</strong></div>
  {message&&<div className="auth-message" role="alert">{message}</div>}
  <div className="drawer-foot"><button type="button" className="secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="primary" disabled={saving||!Number(amount)||Number(amount)<=0||Number(amount)>balance} onClick={()=>void submit()}>{saving?<><InlineLoader label="Recording" />Recording…</>: "Record payment"}</button></div>
 </div></ManagedDialog>;
}

export function OrganizationMigrationView({invoices,organizations,activeOrganizationId}:{invoices:Invoice[];organizations:any[];activeOrganizationId:string|null}) {
  const [selected,setSelected]=useState<string[]>([]);
  const [target,setTarget]=useState("");
  const [moveRelated,setMoveRelated]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const activeOrgs=organizations.filter(o=>!["dissolved","discontinued"].includes(String(o.status)));
  const candidates=invoices.filter(i=>!activeOrganizationId||isAllOrganizationsScope(activeOrganizationId)||i.organizationId===activeOrganizationId);
  const selectedRows=candidates.filter(i=>selected.includes(i.id));
  const targetOrg=activeOrgs.find(o=>o.id===target);
  const toggle=(id:string)=>setSelected(rows=>rows.includes(id)?rows.filter(x=>x!==id):[...rows,id]);
  const allSelected=selected.length>0&&selected.length===candidates.length;
  async function migrate(){
    if(!selected.length||!target)return;
    setBusy(true);setMessage("");
    const {data,error}=await supabase.rpc("migrate_invoice_organizations",{p_invoice_ids:selected,p_target_organization_id:target,p_move_related:moveRelated});
    if(error){setMessage(error.message.includes("unresolved conflicts")?"Migration blocked: one or more invoices have organisation, client/project, or invoice-number conflicts. Resolve those rows before moving the batch.":error.message);setBusy(false);return}
    const moved=Number((data as any)?.moved||0),skipped=Number((data as any)?.skipped||0);
    setMessage(`Migration complete: ${moved} moved · ${skipped} already assigned.`);
    setSelected([]);setBusy(false);
    window.dispatchEvent(new Event("finance:organization-updated"));
  }
  return <div className="migration-page">
    <section className="compact-page-head"><div><span className="eyebrow">Data migration</span><h2>Historical organisation assignment</h2><p>Move historical invoices between billing organisations without silently breaking client, project, payment or document relationships.</p></div></section>
    <section className="migration-toolbar">
      <label>Move selected invoices to<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose target organisation</option>{activeOrgs.filter(o=>o.id!==activeOrganizationId).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="migration-toggle"><input type="checkbox" checked={moveRelated} onChange={e=>setMoveRelated(e.target.checked)}/><span><b>Move linked client/project when safe</b><small>Only moves related records when no other invoice outside this selection would be affected.</small></span></label>
      <button className="primary" disabled={busy||!selected.length||!target} onClick={()=>void migrate()}><ArrowLeftRight size={14}/>{busy?"Migrating…":`Migrate ${selected.length||""} invoice${selected.length===1?"":"s"}`}</button>
    </section>
    <section className="data-panel">
      <div className="data-panel-head"><div><h2>Historical invoices</h2><p>{candidates.length} invoices in the current organisation scope · {selected.length} selected</p></div><button className="text-action" onClick={()=>setSelected(allSelected?[]:candidates.map(i=>i.id))}>{allSelected?"Clear selection":"Select all"}</button></div>
      <div className="migration-list">
        {candidates.map(i=><label className="migration-row" key={i.id}><input type="checkbox" checked={selected.includes(i.id)} onChange={()=>toggle(i.id)}/><span><b>#{i.number}</b><strong>{i.client}</strong><small>{i.project||"No project"} · {dateLabel(i.date)}</small></span><em>{money(invoiceTotal(i))}</em></label>)}
        {!candidates.length&&<div className="empty-state"><FileText size={18}/><b>No historical invoices in this scope.</b></div>}
      </div>
    </section>
    <section className="migration-safety">
      <div><ShieldCheck size={15}/><b>Financial safety boundary</b></div>
      <p>Invoice numbers remain unique in the destination organisation. Linked clients/projects are checked before migration. Payments and generated documents follow the invoice to the new organisation. The operation is atomic: conflicts stop the batch instead of partially moving it.</p>
      {targetOrg&&<small>Target: {targetOrg.name} · {selectedRows.length} selected</small>}
    </section>
    {message&&<div className={message.startsWith("Migration complete")?"auth-success":"auth-message"}>{message}</div>}
  </div>;
}

export function DocumentsView({organizationId}:{organizationId?:string|null}) {
  const [kind,setKind]=useState<"all"|"invoice_pdf"|"receipt_pdf"|"statement_pdf">("all");
  const [documents,setDocuments]=useState<any[]>([]);
  const [selected,setSelected]=useState<any|null>(null);
  const [versions,setVersions]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [clientFilter,setClientFilter]=useState("all");
  const [sharingId,setSharingId]=useState<string|null>(null);
  const [shareMessage,setShareMessage]=useState("");
  const [generationBusy,setGenerationBusy]=useState(false);
  const [generationMessage,setGenerationMessage]=useState("");
  async function load(){
    setLoading(true);
    let query=supabase.from("documents").select("id,document_type,file_name,file_path,description,status,version_number,created_at,generated_at,size_bytes,invoice_id,payment_id,client_id,visible_to_client,template_key,source_hash,checksum_sha256,clients(name),invoices(invoice_number)").order("created_at",{ascending:false});
    if(organizationId&&!isAllOrganizationsScope(organizationId))query=query.eq("organization_id",organizationId);
    const {data}=await query;setDocuments(data||[]);setLoading(false);
  }
  useEffect(()=>{void load()},[organizationId]);
  const generationUrl=(doc:any)=>{
    if(doc.document_type==="invoice_pdf"&&doc.invoice_id)return "/api/invoices/"+encodeURIComponent(doc.invoice_id)+"/pdf";
    if(doc.document_type==="receipt_pdf"&&doc.payment_id)return "/api/payments/"+encodeURIComponent(doc.payment_id)+"/receipt";
    return null;
  };
  async function generateDocument(doc:any){
    const url=generationUrl(doc);
    if(!url)throw new Error("This document type cannot be regenerated from the register yet.");
    const response=await fetch(url,{method:"GET",cache:"no-store",credentials:"same-origin"});
    if(!response.ok){
      const body=(await response.text().catch(()=>"")).trim();
      throw new Error(body||"PDF generation failed.");
    }
  }
  async function generatePending(){
    const pending=currentDocuments.filter(d=>!d.file_path&&generationUrl(d));
    if(!pending.length){setGenerationMessage("No pending invoice or receipt PDFs in this scope.");return}
    setGenerationBusy(true);setGenerationMessage("");
    const failures:string[]=[];
    for(const doc of pending){
      try{await generateDocument(doc)}
      catch(error){failures.push(label(doc)+": "+(error instanceof Error?error.message:"generation failed"))}
    }
    await load();
    setGenerationBusy(false);
    setGenerationMessage(failures.length
      ? `Generated ${pending.length-failures.length} of ${pending.length}. ${failures.slice(0,2).join(" · ")}`
      : `Generated and stored ${pending.length} PDF${pending.length===1?"":"s"}.`);
  }
  async function generateOne(doc:any){
    setGenerationBusy(true);setGenerationMessage("");
    try{await generateDocument(doc);await load();setGenerationMessage(label(doc)+" generated and stored.")}
    catch(error){setGenerationMessage(error instanceof Error?error.message:"PDF generation failed.")}
    finally{setGenerationBusy(false)}
  }
  async function shareDocument(doc:any){
    if(!doc.client_id)return;
    setSharingId(doc.id);setShareMessage("");
    const next=!doc.visible_to_client;
    const {error}=await supabase.from("documents").update({visible_to_client:next}).eq("id",doc.id);
    setSharingId(null);
    if(error){setShareMessage(error.message);return}
    setDocuments(rows=>rows.map(row=>row.id===doc.id?{...row,visible_to_client:next}:row));
    if(selected?.id===doc.id)setSelected((row:any)=>row?{...row,visible_to_client:next}:row);
  }
  async function openHistory(doc:any){
    setSelected(doc);
    let seriesQuery=supabase.from("documents").select("id,version_number,file_path,file_name,storage_bucket,mime_type,size_bytes,checksum_sha256,generated_at,created_at,status,template_key,source_hash").eq("document_type",doc.document_type);
    if(doc.invoice_id)seriesQuery=seriesQuery.eq("invoice_id",doc.invoice_id);
    else if(doc.payment_id)seriesQuery=seriesQuery.eq("payment_id",doc.payment_id);
    else if(doc.client_id)seriesQuery=seriesQuery.eq("client_id",doc.client_id);
    else seriesQuery=seriesQuery.eq("id",doc.id);
    const {data:seriesDocs}=await seriesQuery.order("version_number",{ascending:false});
    const ids=(seriesDocs||[]).map((row:any)=>row.id);
    const {data:registered}=ids.length
      ? await supabase.from("document_versions").select("*").in("document_id",ids).order("version_number",{ascending:false})
      : {data:[] as any[]};
    const byVersion=new Map<number,any>();
    for(const row of seriesDocs||[]){
      byVersion.set(Number(row.version_number||1),{
        id:"document-"+row.id,
        document_id:row.id,
        version_number:Number(row.version_number||1),
        file_path:row.file_path,
        file_name:row.file_name,
        storage_bucket:row.storage_bucket||"finos-documents",
        mime_type:row.mime_type,
        size_bytes:row.size_bytes,
        checksum_sha256:row.checksum_sha256,
        generated_at:row.generated_at||row.created_at,
        status:row.status,
        template_key:row.template_key,
        source_hash:row.source_hash,
      });
    }
    for(const row of registered||[]){
      byVersion.set(Number(row.version_number||1),{...byVersion.get(Number(row.version_number||1)),...row});
    }
    setVersions([...byVersion.values()].sort((a,b)=>Number(b.version_number)-Number(a.version_number)));
  }
  async function versionUrl(version:any){
    if(!version.file_path)throw new Error("This document version has no stored file.");
    const {data,error}=await supabase.storage.from(version.storage_bucket||"finos-documents").createSignedUrl(version.file_path,60);
    if(error||!data?.signedUrl)throw new Error(error?.message||"Could not prepare this document version.");
    return data.signedUrl;
  }
  const seriesKey=(d:any)=>d.invoice_id?"invoice:"+d.invoice_id:d.payment_id?"receipt:"+d.payment_id:d.document_type==="statement_pdf"&&d.client_id?"statement:"+d.client_id:d.document_type+":"+d.id;
  const currentDocuments=[...documents].sort((a,b)=>Number(b.version_number||0)-Number(a.version_number||0)||String(b.created_at||"").localeCompare(String(a.created_at||""))).filter((doc,index,rows)=>rows.findIndex(other=>seriesKey(other)===seriesKey(doc))===index);
  const clients=[...new Map(currentDocuments.filter(d=>d.client_id).map(d=>[d.client_id,d.clients?.name||"Client"])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
  const statuses=[...new Set(currentDocuments.map(d=>String(d.status||"unknown")))].sort();
  const docs=currentDocuments.filter(d=>{
    const typeMatch=kind==="all"||d.document_type===kind;
    const statusMatch=statusFilter==="all"||d.status===statusFilter;
    const clientMatch=clientFilter==="all"||d.client_id===clientFilter;
    const text=[d.file_name,d.description,d.clients?.name,d.invoices?.invoice_number,d.template_key,d.document_type].join(" ").toLowerCase();
    return typeMatch&&statusMatch&&clientMatch&&text.includes(query.toLowerCase());
  });
  const pendingGeneratable=currentDocuments.filter(d=>!d.file_path&&generationUrl(d)).length;
  const labels={all:"All documents",invoice_pdf:"Invoices",receipt_pdf:"Receipts",statement_pdf:"Statements"} as const;
  const label=(d:any)=>d.document_type==="invoice_pdf"?"#"+String(d.invoices?.invoice_number||"invoice"):d.document_type==="statement_pdf"?(d.file_name?.replace(/^Statement-/,"Statement ")||"Account statement"):(d.file_name?.replace(/^Receipt-/,"Receipt ")||"Receipt");
  return <div className="operations-page documents-page">
    <section className="compact-page-head"><div><span className="eyebrow">Document register</span><h2>Documents</h2><p>Canonical financial documents, immutable source snapshots and generated file versions.</p></div><div className="operations-head-actions">{pendingGeneratable>0&&<button type="button" className="secondary" onClick={()=>void generatePending()} disabled={generationBusy}><RefreshCw size={14}/>{generationBusy?"Generating…":`Generate pending (${pendingGeneratable})`}</button>}</div></section>
    <SegmentedTabs
  value={kind}
  onChange={setKind}
  ariaLabel="Document type"
  items={(Object.keys(labels) as (keyof typeof labels)[]).map(k => ({ value: k, label: labels[k] }))}
 />
    <section className="data-panel">
      <div className="data-panel-head"><div><h2>{labels[kind]}</h2><p>{loading?"Loading…":docs.length+" shown · "+currentDocuments.length+" current document"+(currentDocuments.length===1?"":"s")}</p></div><div className="search compact-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search documents" aria-label="Search documents"/></div></div>
      <div className="document-filter-row"><select value={clientFilter} onChange={e=>setClientFilter(e.target.value)} aria-label="Document client"><option value="all">All clients</option>{clients.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} aria-label="Document status"><option value="all">All statuses</option>{statuses.map(value=><option key={value} value={value}>{value}</option>)}</select>{(query||clientFilter!=="all"||statusFilter!=="all")&&<button type="button" className="text-action" onClick={()=>{setQuery("");setClientFilter("all");setStatusFilter("all")}}>Reset</button>}</div>
      {shareMessage&&<div className="auth-message" role="alert">{shareMessage}</div>}
      {generationMessage&&<div className={generationMessage.includes("generated and stored")||generationMessage.startsWith("Generated and stored")?"auth-success":"auth-message"} role="status">{generationMessage}</div>}
      {docs.length?<div className="document-register">{docs.map(d=><div className="document-row" key={d.id}>
        <div className="document-type-mark">{d.document_type==="invoice_pdf"?<Receipt size={15}/>:d.document_type==="statement_pdf"?<FileText size={15}/>:<WalletCards size={15}/>}</div>
        <button type="button" className="document-row-main" onClick={()=>void openHistory(d)}><b>{label(d)}</b><span>{d.clients?.name||"Client"} · v{d.version_number} · {d.status}{d.client_id?" · "+(d.visible_to_client?"shared":"private"):""}</span></button>
        <strong>{d.generated_at?dateLabel(d.generated_at.slice(0,10)):"Not generated"}</strong>
        <div className="document-row-actions">{d.client_id&&<button type="button" className={"secondary mini-action "+(d.visible_to_client?"document-shared-action":"")} onClick={()=>void shareDocument(d)} disabled={sharingId===d.id}>{sharingId===d.id?"Saving…":d.visible_to_client?"Unshare":"Share"}</button>}<button type="button" className="secondary mini-action" onClick={()=>void openHistory(d)}>History</button>{d.file_path?<><DownloadButton label="Download" loadingLabel="Preparing" doneLabel="Ready" onClick={()=>downloadFile("/api/documents/"+d.id+"/download",d.file_name||"document.pdf")}/><button type="button" className="secondary mini-action document-device-share" onClick={()=>void shareFile("/api/documents/"+d.id+"/download",d.file_name||"document.pdf",label(d))}><Share2 size={12}/>Share</button></>:generationUrl(d)?<button type="button" className="secondary mini-action" onClick={()=>void generateOne(d)} disabled={generationBusy}><RefreshCw size={12}/>{generationBusy?"Working…":"Generate"}</button>:<DownloadButton label="Download" disabled/>}</div>
      </div>)}</div>:<div className="empty-state"><FileText size={18}/><b>No documents match.</b><span>Change the document type, client, status or search.</span></div>}
    </section>
    {selected&&<ManagedDialog open onClose={()=>setSelected(null)} title={label(selected)} description={(selected.template_key||"Template unspecified")+" · "+selected.status} className="document-history-panel" overlayClassName="document-history-overlay">
      <div className="document-history-body">
        <div className="document-history-summary"><div><span>Current</span><strong>v{selected.version_number}</strong></div><div><span>Portal</span><strong>{selected.client_id?(selected.visible_to_client?"Shared":"Private"):"Not linked"}</strong></div><div><span>Template</span><strong>{selected.template_key||"—"}</strong></div><div><span>Source</span><strong>{selected.source_hash?selected.source_hash.slice(0,10)+"…":"—"}</strong></div><div><span>Checksum</span><strong>{selected.checksum_sha256?selected.checksum_sha256.slice(0,10)+"…":"—"}</strong></div></div>
        <div className="version-list">{versions.length?versions.map(v=><div className="version-row" key={v.id}><div><b>Version {v.version_number}</b><span>{v.generated_at?new Date(v.generated_at).toLocaleString("en-IN"):"Generated version"}</span><small>{v.file_name||"PDF"} · {v.size_bytes?Math.round(v.size_bytes/1024)+" KB":"size unavailable"}</small></div><strong>{v.checksum_sha256?v.checksum_sha256.slice(0,12):"—"}</strong><DownloadButton label="Download" loadingLabel="Preparing" doneLabel="Ready" disabled={!v.file_path} onClick={async()=>{const url=await versionUrl(v);await downloadFile(url,v.file_name||"document.pdf")}}/></div>):<div className="empty-state">No generated versions are registered yet.</div>}</div>
      </div>
    </ManagedDialog>}
  </div>;
}