"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine, ArrowUpRight, BarChart3, Building2, Check, ExternalLink, RefreshCw, ShieldCheck, ChevronRight, CircleAlert, FileText, Filter, FolderKanban, Upload, KeyRound,
  IndianRupee, LayoutDashboard, LogOut, Mail, MoreHorizontal, Phone, Plus, Receipt,
  Search, Settings2, Sparkles, WalletCards, X
} from "lucide-react";
import {
  calculateStats,
  contentAmount,
  mapInvoice,
  daysOverdue,
  invoiceBalance,
  invoiceTotal,
  paidTotal,
  statusLabel,
} from "@/lib/finance/domain";
import type { Activity, Content, Invoice, Payment, Status, ContentKind, PaymentMethod } from "@/lib/finance/domain";
import { createClient } from "@/lib/supabase/client";
import { createInvoice as createInvoiceRecord, listInvoices, logActivity, recordPayment as recordPaymentRecord, saveInvoice as saveInvoiceRecord, setInvoiceStatus } from "@/lib/finance/repository";

const supabase = createClient();

const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);


export type FinanceView = "overview" | "invoices" | "payments" | "clients" | "projects" | "reports" | "settings";

export default function FinanceWorkspace({ initialView = "overview" }: { initialView?: FinanceView }) {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [composer, setComposer] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null);
  const [activeView, setActiveView] = useState<FinanceView>(initialView);
  const [actionError, setActionError] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const theme = "dark" as const;
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      if (authReady) setLoading(false);
      return;
    }
    loadInvoices();
    supabase.from("organizations").select("*").order("status").order("name").then(({data}) => {
      const rows = data || [];
      setOrganizations(rows);
      const active = rows.filter((o:any) => !["dissolved","discontinued"].includes(o.status));
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("finance.organizationId") : null;
      const selected = active.find((o:any) => o.id === saved)
        || active.find((o:any) => String(o.name).toLowerCase() === "kumar aman")
        || active[0]
        || rows[0];
      if (selected) setOrganizationId(selected.id);
    });
  }, [session, authReady]);

  async function loadInvoices() {
    setLoading(true);
    const result = await listInvoices();
    if (result.error) {
      setActionError(result.error);
      setLoading(false);
      return [] as Invoice[];
    }
    setActionError("");
    setInvoices(result.data);
    setSelected(current => current ? (result.data.find(i => i.id === current.id) ?? current) : current);
    setLoading(false);
    return result.data;
  }

  async function markStatus(invoice: Invoice, next: Status) {
    const error = await setInvoiceStatus(invoice, next);
    if (error) return setActionError(error);
    await loadInvoices();
  }

  async function recordPayment(invoice: Invoice, amount: number, date: string, method: string, reference: string) {
    const error = await recordPaymentRecord(invoice, amount, date, method as PaymentMethod, reference);
    if (error) return setActionError(error);
    setPaymentFor(null);
    setActionError("");
    await loadInvoices();
  }

  async function saveInvoice(next: Invoice) {
    const error = await saveInvoiceRecord(next);
    if (error) return setActionError(error);
    await loadInvoices();
    setSelected(null);
  }

  async function createInvoice(draft: {
    number: string; client: string; project: string; date: string; dueDate: string; organizationId?: string | null; contents: Content[];
  }) {
    const result = await createInvoiceRecord(draft);
    if (result.error) return setActionError(result.error);
    setComposer(false);
    await loadInvoices();
  }

  const activeOrganization = useMemo(() => organizations.find(o => o.id === organizationId) ?? null, [organizations, organizationId]);
  const orgInvoices = useMemo(() => organizationId ? invoices.filter(i => i.organizationId === organizationId) : invoices, [invoices, organizationId]);
  const nextInvoiceNumber = useMemo(() => {
    if (activeOrganization?.next_invoice_number) return String(activeOrganization.invoice_prefix || "") + String(activeOrganization.next_invoice_number);
    const numeric = orgInvoices.map(i => Number.parseInt(String(i.number).replace(/\D/g, ""), 10)).filter(Number.isFinite);
    return numeric.length ? String(Math.max(...numeric) + 1) : "1";
  }, [activeOrganization, orgInvoices]);

  const filtered = useMemo(() => orgInvoices.filter(i => {
    const text = [i.number, i.client, i.project, i.notes, ...i.contents.map(c => c.title)].join(" ").toLowerCase();
    return (status === "all" || i.status === status) && text.includes(query.toLowerCase());
  }), [orgInvoices, query, status]);

  const stats = useMemo(() => calculateStats(orgInvoices), [orgInvoices]);

  if (!authReady) return <div className="auth-screen"><div className="auth-card"><div className="loading-mark"><RefreshCw size={18}/></div><p>Loading workspace…</p></div></div>;
  if (!session) return <AuthScreen />;

  return (
    <main
      className={"shell theme-"+theme}
      style={{ "--org-accent": activeOrganization?.accent_hex || "#2563eb" } as any}
    >
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">{activeOrganization?.logo_path?<img src={activeOrganization.logo_path} alt=""/>:<span className="brand-glyph">m</span>}</div>
          <div className="brand-copy"><strong>{activeOrganization?.name || "Select organisation"}</strong><span>{activeOrganization?.legal_name || "Organisation workspace"}</span></div>
        </div>
        {organizations.filter(o=>!["dissolved","discontinued"].includes(o.status)).length>1&&<label className="org-switcher"><span>Organisation</span><select value={organizationId||""} onChange={e=>{const id=e.target.value;setOrganizationId(id);window.localStorage.setItem("finance.organizationId",id)}}>{organizations.filter(o=>!["dissolved","discontinued"].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["overview",LayoutDashboard,"Overview","/overview"],
            ["invoices",Receipt,"Invoices","/invoices"],
            ["payments",WalletCards,"Payments","/payments"],
            ["clients",FileText,"Clients","/clients"],
            ["projects",FolderKanban,"Projects","/projects"],
            ["reports",BarChart3,"Reports","/reports"],
            ["settings",Settings2,"Settings","/settings"],
          ].map(([key,Icon,label,path])=>{const C=Icon as any;return <button key={String(key)} className={"nav-item "+(activeView===key?"active":"")} onClick={()=>router.push(String(path))}><C size={17}/><span>{String(label)}</span>{key==="invoices"&&<em>{orgInvoices.length}</em>}</button>})}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={()=>supabase.auth.signOut()}><LogOut size={17}/><span>Sign out</span></button>
          <div className="profile"><div className="avatar">{String(activeOrganization?.name||session.user?.email||"A").slice(0,1).toUpperCase()}</div><div><b>{activeOrganization?.name||"Workspace"}</b><small>{session.user?.email||"Authenticated"}</small></div><MoreHorizontal size={16}/></div>
        </div>
      </aside>

      <section className="content">
        {actionError && <div className="global-error"><CircleAlert size={15}/><span>{actionError}</span><button onClick={() => setActionError("")}><X size={14}/></button></div>}
        <header className="topbar">
          <div>
            <div className="eyebrow">{activeOrganization?.name || "ORGANISATION"} / {activeView.toUpperCase()}</div>
            <h1>{activeView === "overview" ? "Overview" : activeView === "invoices" ? "Invoices" : activeView === "payments" ? "Payments" : activeView === "clients" ? "Clients" : activeView === "projects" ? "Projects" : activeView === "reports" ? "Reports" : "Settings"}</h1>
            <p>{activeView === "overview" ? "A focused view of cash, receivables and what needs attention." : activeView === "invoices" ? "Every invoice, its contents, payment state and history." : activeView === "payments" ? "Recorded collections and the invoices they settle." : activeView === "clients" ? "Client records, billing identity and account history." : activeView === "projects" ? "Projects grouped by client with billing performance." : activeView === "reports" ? "Period-based views of billed, collected and outstanding revenue." : "Workspace identity, invoice customisation and access controls."}</p><div className="topbar-meta"><i aria-hidden="true"/><span>{orgInvoices.length} invoices</span><b>·</b><span>{money(stats.outstanding)} open</span></div>
          </div>
          <div className="topbar-tools">
            <label className="global-search">
              <Search size={15}/>
              <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices, clients, projects…" aria-label="Search workspace"/>
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
            <button className="icon-button" title="Refresh data" onClick={() => loadInvoices()}><RefreshCw size={17}/></button>
            {(activeView === "overview" || activeView === "invoices") && <button className="primary" onClick={() => setComposer(true)}><Plus size={17}/>New invoice</button>}
            {activeView === "clients" && <button className="primary" onClick={() => window.dispatchEvent(new Event("finance:new-client"))}><Plus size={17}/>New client</button>}
            {activeView === "projects" && <button className="primary" onClick={() => window.dispatchEvent(new Event("finance:new-project"))}><Plus size={17}/>New project</button>}
            </div>
          </div>
        </header>

        {activeView === "overview" && <Overview stats={stats} invoices={orgInvoices} organization={activeOrganization} onOpen={(i) => setSelected(i)} onNavigate={(view) => setActiveView(view)} />}
        {activeView === "invoices" && <InvoiceView filtered={filtered} query={query} setQuery={setQuery} status={status} setStatus={setStatus} loading={loading} onOpen={(i) => setSelected(i)} onStatus={markStatus} />}
        {activeView === "payments" && <PaymentsView invoices={orgInvoices} onOpenPayment={(i) => setPaymentFor(i)} />}
        {activeView === "clients" && <ClientsView invoices={orgInvoices} organizationId={organizationId} onOpen={(i) => setSelected(i)} selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId} />}
        {activeView === "projects" && <ProjectsView invoices={orgInvoices} organizationId={organizationId} onOpen={(i) => setSelected(i)} />}
        {activeView === "reports" && <ReportsView invoices={orgInvoices} />}
        {activeView === "settings" && <SettingsView email={session.user?.email ?? ""} activeOrganizationId={organizationId} onSignOut={() => supabase.auth.signOut()} />}
      </section>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {[
          ["overview",LayoutDashboard,"Overview","/overview"],
          ["invoices",Receipt,"Invoices","/invoices"],
          ["payments",WalletCards,"Payments","/payments"],
          ["clients",FileText,"Clients","/clients"],
        ].map(([key,Icon,label,path])=>{
          const C=Icon as any;
          return <button key={String(key)} className={activeView===key?"active":""} onClick={()=>{setMobileMoreOpen(false);router.push(String(path))}}><C size={17}/><span>{String(label)}</span></button>;
        })}
        <button className={mobileMoreOpen || !["overview","invoices","payments","clients"].includes(activeView) ? "active" : ""} onClick={()=>setMobileMoreOpen(v=>!v)} aria-expanded={mobileMoreOpen}><MoreHorizontal size={17}/><span>More</span></button>
      </nav>

      {mobileMoreOpen && <div className="mobile-more-sheet" role="dialog" aria-label="More workspace sections" onMouseDown={()=>setMobileMoreOpen(false)}>
        <div className="mobile-more-panel" onMouseDown={e=>e.stopPropagation()}>
          <div className="eyebrow">WORKSPACE</div>
          {[
            ["projects",FolderKanban,"Projects","/projects"],
            ["reports",BarChart3,"Reports","/reports"],
            ["settings",Settings2,"Settings","/settings"],
          ].map(([key,Icon,label,path])=>{
            const C=Icon as any;
            return <button key={String(key)} className={activeView===key?"active":""} onClick={()=>{setMobileMoreOpen(false);router.push(String(path))}}><C size={17}/><span>{String(label)}</span><ChevronRight size={14}/></button>;
          })}
        </div>
      </div>}

      {selected && <InvoiceDrawer invoice={selected} onClose={() => setSelected(null)} onStatus={markStatus} onSave={saveInvoice} onPayment={() => setPaymentFor(selected)}/>}
      {paymentFor && <PaymentComposer invoice={paymentFor} onClose={() => setPaymentFor(null)} onCreate={recordPayment}/>}
      {composer && <InvoiceComposer initialNumber={nextInvoiceNumber} initialOrganizationId={organizationId} onClose={() => setComposer(false)} onCreate={createInvoice}/>} 
    </main>
  );
}

function AuthScreen() {
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

function SettingsView({email,activeOrganizationId,onSignOut}:{email:string;activeOrganizationId:string|null;onSignOut:()=>void}) {
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
function AccountIdentitySettings(){
  const [profile,setProfile]=useState<any>({});const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");const [open,setOpen]=useState(false);
  useEffect(()=>{supabase.from("account_profile").select("*").eq("id",true).maybeSingle().then(({data,error})=>{if(data)setProfile(data);if(error)setMessage(error.message);setLoading(false)})},[]);
  async function save(){setSaving(true);const {error}=await supabase.from("account_profile").upsert({...profile,id:true,updated_at:new Date().toISOString()});setSaving(false);setMessage(error?error.message:"Account master data saved.");}
  async function upload(file:File){if(file.size>2*1024*1024)return setMessage("Logo must be under 2 MB.");const path="account/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,file,{upsert:true,contentType:file.type});if(error)return setMessage(error.message);const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setProfile((p:any)=>({...p,logo_path:data.publicUrl}));setMessage("Account logo uploaded.");}
  if(loading)return <div className="empty-state">Loading account master data…</div>;
  return <div className="settings-stack"><div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(!open)}><span><b>Account master data</b><small>Legal identity that sits above all organisations and brands.</small></span><span>{open?"Hide":"Edit"}</span></button>{open&&<div className="settings-section-body"><div className="client-logo-upload">{profile.logo_path?<img src={profile.logo_path} alt="Account logo"/>:<div className="client-logo-placeholder">Logo</div>}<label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/></label></div><div className="form-grid"><label>Legal name<input value={profile.legal_name||""} onChange={e=>setProfile((p:any)=>({...p,legal_name:e.target.value}))}/></label><label>Display name<input value={profile.display_name||""} onChange={e=>setProfile((p:any)=>({...p,display_name:e.target.value}))}/></label><label>Email<input value={profile.email||""} onChange={e=>setProfile((p:any)=>({...p,email:e.target.value}))}/></label><label>Phone<input value={profile.phone||""} onChange={e=>setProfile((p:any)=>({...p,phone:e.target.value}))}/></label><label>PAN<input value={profile.pan||""} onChange={e=>setProfile((p:any)=>({...p,pan:e.target.value}))}/></label></div><label>Address lines<textarea value={Array.isArray(profile.address_lines)?profile.address_lines.join("\n"):""} onChange={e=>setProfile((p:any)=>({...p,address_lines:e.target.value.split("\n").map((v:string)=>v.trim()).filter(Boolean)}))}/></label></div>}</div>{message&&<div className="auth-success">{message}</div>}<button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save account data"}</button></div>;
}

function OrganizationsSettings(){
  const [orgs,setOrgs]=useState<any[]>([]);const [selected,setSelected]=useState<any>(null);const [open,setOpen]=useState(true);const [message,setMessage]=useState("");const [saving,setSaving]=useState(false);const [migration,setMigration]=useState<any>(null);
  useEffect(()=>{Promise.all([
    supabase.from("organizations").select("*").order("status").order("name"),
    supabase.from("organisation_migration_status").select("*").maybeSingle()
  ]).then(([orgResult,migrationResult])=>{
    setOrgs(orgResult.data||[]);
    if(orgResult.data?.[0])setSelected(orgResult.data[0]);
    if(orgResult.error)setMessage(orgResult.error.message);
    if(!migrationResult.error)setMigration(migrationResult.data);
  })},[]);
  async function save(){if(!selected)return;setSaving(true);const {error}=await supabase.from("organizations").update({...selected,updated_at:new Date().toISOString()}).eq("id",selected.id);setSaving(false);setMessage(error?error.message:"Organisation saved.");if(!error)setOrgs(v=>v.map(o=>o.id===selected.id?selected:o))}
  async function create(){const name=window.prompt("Organisation / brand name");if(!name?.trim())return;const {data,error}=await supabase.from("organizations").insert({name:name.trim(),legal_name:name.trim(),entity_type:"brand"}).select("*").single();if(error){setMessage(error.message);return}setOrgs(v=>[...v,data]);setSelected(data)}
  return <div className="settings-stack">
    {migration && <section className={"migration-check "+(migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "verified" : "warning")} aria-live="polite">
      <div className="migration-check-icon"><ShieldCheck size={17}/></div>
      <div><b>{migration.unassigned_invoice_count===0 && migration.orphaned_organisation_count===0 ? "Historical organisation migration verified" : "Historical organisation assignment needs attention"}</b><span>{migration.assigned_invoice_count} of {migration.invoice_count} invoices assigned · {migration.organisation_count} organisation(s) referenced · {migration.orphaned_organisation_count} orphaned references.</span></div>
    </section>}
    <div className="data-panel"><div className="data-panel-head"><div><h2>Organisations & brands</h2><p>Each billing identity controls its own identity, bank details, numbering, template and accent.</p></div><button className="secondary" onClick={create}><Plus size={14}/>Add organisation</button></div><div className="org-grid">{orgs.map(o=><button className={"org-card "+(selected?.id===o.id?"active":"")} key={o.id} onClick={()=>setSelected(o)}><div className="org-card-logo">{o.logo_path?<img src={o.logo_path} alt=""/>:<span>{String(o.name).slice(0,1).toUpperCase()}</span>}</div><div><b>{o.name}</b><small>{o.entity_type} · {o.status}</small></div></button>)}</div></div>{selected&&<div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpen(!open)}><span><b>Edit {selected.name}</b><small>Identity, tax, bank, footer and logo.</small></span><span>{open?"Collapse":"Edit"}</span></button>{open&&<div className="settings-section-body"><div className="client-logo-upload">{selected.logo_path?<img src={selected.logo_path} alt="Organisation logo"/>:<div className="client-logo-placeholder">Logo</div>}<label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;const path="organizations/"+selected.id+"/"+Date.now()+"-"+f.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,f,{upsert:true,contentType:f.type});if(error){setMessage(error.message);return}const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setSelected((p:any)=>({...p,logo_path:data.publicUrl}))}}/></label></div><div className="form-grid"><label>Name<input value={selected.name||""} onChange={e=>setSelected((p:any)=>({...p,name:e.target.value}))}/></label><label>Legal name<input value={selected.legal_name||""} onChange={e=>setSelected((p:any)=>({...p,legal_name:e.target.value}))}/></label><label>Entity type<select value={selected.entity_type||"brand"} onChange={e=>setSelected((p:any)=>({...p,entity_type:e.target.value}))}><option>brand</option><option>freelance</option><option>company</option><option>studio</option></select></label><label>Status<select value={selected.status||"active"} onChange={e=>setSelected((p:any)=>({...p,status:e.target.value}))}><option>active</option><option>dissolved</option><option>discontinued</option></select></label><label>Email<input value={selected.email||""} onChange={e=>setSelected((p:any)=>({...p,email:e.target.value}))}/></label><label>Phone<input value={selected.phone||""} onChange={e=>setSelected((p:any)=>({...p,phone:e.target.value}))}/></label><label>PAN<input value={selected.pan||""} onChange={e=>setSelected((p:any)=>({...p,pan:e.target.value}))}/></label><label>GSTIN<input value={selected.gstin||""} onChange={e=>setSelected((p:any)=>({...p,gstin:e.target.value}))}/></label><label>Bank<input value={selected.bank_name||""} onChange={e=>setSelected((p:any)=>({...p,bank_name:e.target.value}))}/></label><label>Account number<input value={selected.account_number||""} onChange={e=>setSelected((p:any)=>({...p,account_number:e.target.value}))}/></label><label>Branch<input value={selected.branch_name||""} onChange={e=>setSelected((p:any)=>({...p,branch_name:e.target.value}))}/></label><label>IFSC<input value={selected.ifsc_code||""} onChange={e=>setSelected((p:any)=>({...p,ifsc_code:e.target.value}))}/></label></div><div className="form-grid"><label>Invoice prefix<input value={selected.invoice_prefix||""} onChange={e=>setSelected((p:any)=>({...p,invoice_prefix:e.target.value}))}/></label><label>Brand accent<input type="text" inputMode="text" pattern="^#[0-9A-Fa-f]{6}$" value={selected.accent_hex||"#171716"} onChange={e=>setSelected((p:any)=>({...p,accent_hex:e.target.value}))}/><small className="field-hint">6-digit hex · used for organisation identity chrome.</small></label><label>Next invoice number<input type="number" value={selected.next_invoice_number||1} onChange={e=>setSelected((p:any)=>({...p,next_invoice_number:Number(e.target.value)||1}))}/></label><label>Invoice template<select value={selected.invoice_template_key||"legacy_elle"} onChange={e=>setSelected((p:any)=>({...p,invoice_template_key:e.target.value}))}><option value="legacy_elle">Legacy template</option><option value="clean">Workspace Clean</option></select></label></div><label>Address lines<textarea value={Array.isArray(selected.address_lines)?selected.address_lines.join("\n"):""} onChange={e=>setSelected((p:any)=>({...p,address_lines:e.target.value.split("\n").map((v:string)=>v.trim()).filter(Boolean)}))}/></label><div className="form-grid"><label>Invoice footer line 1<input value={selected.invoice_footer_line_1||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_1:e.target.value}))}/></label><label>Invoice footer line 2<input value={selected.invoice_footer_line_2||""} onChange={e=>setSelected((p:any)=>({...p,invoice_footer_line_2:e.target.value}))}/></label></div><button className="primary" onClick={save} disabled={saving}>{saving?"Saving…":"Save organisation"}</button></div>}</div>}{message&&<div className="auth-success">{message}</div>}</div>;
}

function Overview({stats,invoices,organization,onOpen,onNavigate}:{stats:any;invoices:Invoice[];organization:any;onOpen:(i:Invoice)=>void;onNavigate:(view:FinanceView)=>void}) {
  const today=new Date();
  const open=invoices.filter(i=>invoiceBalance(i)>0);
  const overdue=open.filter(i=>daysOverdue(i)>0);
  const dueSoon=open.filter(i=>{if(!i.dueDate)return false;const d=new Date(i.dueDate+"T00:00:00");const days=Math.ceil((d.getTime()-today.getTime())/86400000);return days>=0&&days<=14});
  const unpriced=invoices.filter(i=>i.contents.some(c=>!c.priced));
  const recent=[...invoices].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8);
  const collection=stats.billed?Math.round(stats.collected/stats.billed*100):0;
  const overdueValue=overdue.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const dueSoonValue=dueSoon.reduce((sum,i)=>sum+invoiceBalance(i),0);
  const actions=[
    ...overdue.map(i=>({kind:"Overdue",tone:"danger",label:"#"+i.number+" · "+i.client,detail:daysOverdue(i)+" days overdue",value:money(invoiceBalance(i)),invoice:i})),
    ...dueSoon.filter(i=>!overdue.includes(i)).map(i=>({kind:"Due soon",tone:"warning",label:"#"+i.number+" · "+i.client,detail:"Due "+i.dueDate,value:money(invoiceBalance(i)),invoice:i})),
    ...unpriced.map(i=>({kind:"Needs pricing",tone:"neutral",label:"#"+i.number+" · "+i.client,detail:i.contents.filter(c=>!c.priced).length+" unpriced item(s)",value:money(invoiceTotal(i)),invoice:i}))
  ].slice(0,5);
  const clientMap=new Map<string,{open:number;billed:number;count:number}>();
  invoices.forEach(i=>{const g=clientMap.get(i.client)||{open:0,billed:0,count:0};g.open+=invoiceBalance(i);g.billed+=invoiceTotal(i);g.count++;clientMap.set(i.client,g)});
  const clients=[...clientMap.entries()].filter(([,v])=>v.open>0).sort((a,b)=>b[1].open-a[1].open).slice(0,5);
  const chartSource=[...invoices].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-8);
  const maxChart=Math.max(...chartSource.map(i=>invoiceTotal(i)),1);
  const chartPoints=chartSource.length>1
    ? chartSource.map((i,index)=>`${(index/(chartSource.length-1))*100},${92-(invoiceTotal(i)/maxChart)*72}`).join(" ")
    : "0,88 100,58";
  const periodLabel=new Intl.DateTimeFormat("en-IN",{month:"short",year:"numeric"});
  return <div className="overview-command">
    <section className="overview-welcome">
      <div>
        <div className="eyebrow">WORKSPACE / OVERVIEW</div>
        <h2>Good {today.getHours()<12?"morning":today.getHours()<18?"afternoon":"evening"}, {organization?.name||"there"}.</h2>
        <p>Your financial position, collections and outstanding work at a glance.</p>
      </div>
      <div className="overview-period"><span>LIVE BOOK</span><b>{periodLabel.format(today)}</b></div>
    </section>

    <section className="overview-kpis">
      <article className="overview-kpi overview-kpi-primary">
        <div className="kpi-top"><span>Total outstanding</span><span className="kpi-icon"><WalletCards size={15}/></span></div>
        <strong>{money(stats.outstanding)}</strong>
        <small>{open.length} open invoice{open.length===1?"":"s"}</small>
        <div className="kpi-trend neutral"><span>Open receivables</span></div>
      </article>
      <article className="overview-kpi">
        <div className="kpi-top"><span>Total billed</span><span className="kpi-icon"><Receipt size={15}/></span></div>
        <strong>{money(stats.billed)}</strong>
        <small>{invoices.length} invoices</small>
        <div className="kpi-trend positive"><Check size={11}/> {collection}% collected</div>
      </article>
      <article className="overview-kpi">
        <div className="kpi-top"><span>Collected</span><span className="kpi-icon"><ArrowDownToLine size={15}/></span></div>
        <strong>{money(stats.collected)}</strong>
        <small>Recorded payments</small>
        <div className="kpi-trend positive"><Check size={11}/> Cash received</div>
      </article>
      <article className="overview-kpi overview-kpi-danger">
        <div className="kpi-top"><span>Overdue</span><span className="kpi-icon"><CircleAlert size={15}/></span></div>
        <strong>{money(overdueValue)}</strong>
        <small>{overdue.length} invoice{overdue.length===1?"":"s"}</small>
        <div className="kpi-trend negative"><CircleAlert size={11}/> Needs attention</div>
      </article>
    </section>

    <section className="overview-main-grid">
      <section className="data-panel overview-chart-panel">
        <div className="data-panel-head">
          <div><h2>Invoice activity</h2><p>Latest billed value by invoice, ordered by issue date.</p></div>
          <button className="mini-action" onClick={()=>onNavigate("reports")}>Reports <ArrowUpRight size={12}/></button>
        </div>
        <div className="overview-chart">
          <div className="chart-y"><span>{money(maxChart)}</span><span>{money(maxChart*.66)}</span><span>{money(maxChart*.33)}</span><span>₹0</span></div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Invoice activity chart">
            <defs><linearGradient id="mfChartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d5df5" stopOpacity=".26"/><stop offset="100%" stopColor="#6d5df5" stopOpacity="0"/></linearGradient></defs>
            <polygon points={`0,100 ${chartPoints} 100,100`} fill="url(#mfChartFill)"/>
            <polyline points={chartPoints} fill="none" stroke="#7d72ff" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
          </svg>
          <div className="chart-x">{chartSource.map(i=><span key={i.id}>{dateLabel(i.date).slice(0,6)}</span>)}</div>
        </div>
      </section>

      <section className="data-panel overview-position-panel">
        <div className="data-panel-head"><div><h2>Collection</h2><p>Cash converted from billed revenue.</p></div><MoreHorizontal size={16}/></div>
        <div className="collection-big"><strong>{collection}%</strong><span>collection rate</span></div>
        <div className="collection-track"><i style={{width:Math.min(collection,100)+"%"}}/></div>
        <div className="collection-split"><div><span>Collected</span><b>{money(stats.collected)}</b></div><div><span>Open</span><b>{money(stats.outstanding)}</b></div></div>
        <button className="primary full-width" onClick={()=>{const target=overdue[0]||open[0];if(target)onOpen(target)}} disabled={!open.length}><CircleAlert size={14}/>Review receivables</button>
      </section>
    </section>

    <section className="overview-secondary-grid">
      <section className="data-panel">
        <div className="data-panel-head"><div><h2>Needs attention</h2><p>Only items that need a decision or follow-up.</p></div><ArrowUpRight size={15}/></div>
        {actions.length?<div className="action-list">{actions.map(a=><button key={a.kind+"-"+a.invoice.id} className="action-row" onClick={()=>onOpen(a.invoice)}><span className={"action-icon "+a.tone}>{a.kind==="Overdue"?<CircleAlert size={14}/>:a.kind==="Due soon"?<WalletCards size={14}/>:<IndianRupee size={14}/>}</span><div><b>{a.label}</b><small>{a.kind} · {a.detail}</small></div><strong>{a.value}</strong><ChevronRight size={14}/></button>)}</div>:<div className="empty-state success-empty"><Check size={17}/><div><b>Nothing requires attention</b><span>Your visible receivables are clear.</span></div></div>}
      </section>
      <section className="data-panel">
        <div className="data-panel-head"><div><h2>Open by client</h2><p>Where outstanding receivables are concentrated.</p></div><Building2 size={15}/></div>
        {clients.length?<div className="client-exposure-list">{clients.map(([name,g])=><button key={name} className="client-exposure-row"><span className="client-exposure-avatar">{name.slice(0,1).toUpperCase()}</span><span><b>{name}</b><small>{g.count} invoice{g.count===1?"":"s"} · {money(g.billed)} billed</small></span><strong>{money(g.open)}</strong></button>)}</div>:<div className="empty-state">No open receivables.</div>}
      </section>
    </section>

    <section className="data-panel recent-panel">
      <div className="data-panel-head"><div><h2>Recent invoices</h2><p>Latest financial activity for {organization?.name||"this organisation"}.</p></div><button className="mini-action" onClick={()=>onNavigate("invoices")}>View all <ArrowUpRight size={12}/></button></div>
      <div className="invoice-register">
        <div className="invoice-register-head"><span>INVOICE</span><span>CLIENT / PROJECT</span><span>ISSUED</span><span>STATUS</span><span>AMOUNT</span></div>
        {recent.map(i=><button key={i.id} className="invoice-register-row" onClick={()=>onOpen(i)}><b>#{i.number}</b><span><strong>{i.client}</strong><small>{i.project}</small></span><span>{dateLabel(i.date)}</span><em className={i.status}>{statusLabel(i.status)}</em><strong>{money(invoiceTotal(i))}</strong><ChevronRight size={14}/></button>)}
        {!recent.length&&<div className="empty-state">No invoices yet.</div>}
      </div>
    </section>

    <section className="overview-foot-grid">
      <button className="overview-shortcut" onClick={()=>onNavigate("invoices")}><span className="shortcut-icon purple"><Receipt size={17}/></span><span><b>Invoices</b><small>Issue, review and collect</small></span><ChevronRight size={15}/></button>
      <button className="overview-shortcut" onClick={()=>onNavigate("payments")}><span className="shortcut-icon green"><WalletCards size={17}/></span><span><b>Payments</b><small>Record and reconcile cash</small></span><ChevronRight size={15}/></button>
      <button className="overview-shortcut" onClick={()=>onNavigate("clients")}><span className="shortcut-icon blue"><Building2 size={17}/></span><span><b>Clients</b><small>Billing identity and history</small></span><ChevronRight size={15}/></button>
      <button className="overview-shortcut" onClick={()=>onNavigate("reports")}><span className="shortcut-icon amber"><BarChart3 size={17}/></span><span><b>Reports</b><small>Read the business</small></span><ChevronRight size={15}/></button>
    </section>
  </div>;
}
function dateLabel(value:string){return new Date(value+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}

function InvoiceView({filtered,query,setQuery,status,setStatus,loading,onOpen,onStatus}:{filtered:Invoice[];query:string;setQuery:(v:string)=>void;status:"all"|Status;setStatus:(v:"all"|Status)=>void;loading:boolean;onOpen:(i:Invoice)=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  return <><section className="section-head">
    <div><h2>Invoices</h2><p>{filtered.length} records · {filtered.reduce((s,i) => s+i.contents.length,0)} contents</p></div>
    <div className="filters"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search invoices, clients, contents..."/></div><div className="filter"><Filter size={15}/><select value={status} onChange={e=>setStatus(e.target.value as "all"|Status)}><option value="all">All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div></div>
  </section>
  {loading ? <div className="empty-state">Loading finance data…</div> : <div className="invoice-list">{filtered.map(i=><InvoiceCard key={i.id} invoice={i} onOpen={()=>onOpen(i)} onStatus={onStatus}/>)}</div>}
</>;
}

function PaymentsView({invoices,onOpenPayment}:{invoices:Invoice[];onOpenPayment:(i:Invoice)=>void}) {
  const rows = invoices.flatMap(i => i.payments.map(p => ({...p,invoice:i}))).sort((a,b)=>(b.payment_date||"").localeCompare(a.payment_date||""));
  return <div className="data-panel"><div className="data-panel-head"><div><h2>Payments</h2><p>{rows.length} recorded payments · {money(rows.reduce((s,r)=>s+r.amount,0))} collected</p></div></div>
    {rows.length ? <div className="simple-table"><div className="simple-row simple-head"><span>Date</span><span>Invoice</span><span>Client</span><span>Method</span><span>Amount</span></div>{rows.map(r=><div className="simple-row" key={r.id}><span>{r.payment_date ? new Date(r.payment_date+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—"}</span><span>#{r.invoice.number}</span><span>{r.invoice.client}</span><span>{r.method}</span><strong>{money(r.amount)}</strong></div>)}</div> : <div className="empty-state">No payments recorded yet.</div>}
    <div className="payment-shortcuts">{invoices.filter(i=>paidTotal(i)<invoiceTotal(i)).slice(0,6).map(i=><button key={i.id} className="secondary" onClick={()=>onOpenPayment(i)}>Record payment · #{i.number}</button>)}</div>
  </div>;
}

function ClientsView({invoices,organizationId,onOpen,selectedClientId,setSelectedClientId}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void;selectedClientId:string|null;setSelectedClientId:(id:string|null)=>void}) {
  const [clients,setClients]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [creating,setCreating]=useState(false);
  useEffect(()=>{load();const h=()=>setCreating(true);window.addEventListener("finance:new-client",h);return()=>window.removeEventListener("finance:new-client",h)},[]);
  async function load(){setLoading(true);if(!organizationId){setClients([]);setLoading(false);return}const {data}=await supabase.from("clients").select("*").is("archived_at",null).eq("organization_id",organizationId).order("name");setClients(data||[]);setLoading(false);}
  if(selectedClientId)return <ClientPortal clientId={selectedClientId} invoices={invoices} onBack={()=>setSelectedClientId(null)} onOpenInvoice={onOpen} onSaved={load} onArchived={()=>setSelectedClientId(null)}/>;
  return <div className="data-panel"><div className="data-panel-head"><div><h2>Clients</h2><p>Each client is a workspace: billing identity, invoices, projects, statements and portal controls.</p></div></div>
    {loading?<div className="empty-state">Loading clients…</div>:<div className="client-directory">{clients.map(c=>{const rows=invoices.filter(i=>i.clientId===c.id);const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0);const paid=rows.reduce((s,i)=>s+paidTotal(i),0);return <button className="client-directory-row" key={c.id} onClick={()=>setSelectedClientId(c.id)}><div className="client-avatar">{c.logo_path?<img src={c.logo_path} alt="" />:String(c.name||"?").slice(0,1).toUpperCase()}</div><div className="client-main"><b>{c.name}</b><span>{c.legal_name||"Billing profile not completed"}</span></div><div className="client-meta"><b>{rows.length}</b><span>invoices</span></div><div className="client-meta"><b>{money(billed)}</b><span>billed</span></div><div className="client-meta"><b>{money(Math.max(billed-paid,0))}</b><span>outstanding</span></div><ChevronRight size={15}/></button>})}</div>}
    {!loading&&!clients.length&&<div className="empty-state">No clients yet. Create the first client.</div>}{creating&&<ClientCreateModal organizationId={organizationId} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);load()}}/>}</div>;
}

function ClientCreateModal({organizationId,onClose,onSaved}:{organizationId:string|null;onClose:()=>void;onSaved:()=>void}) {
  const [form,setForm]=useState({name:"",legal_name:"",email:"",phone:"",pan:"",gstin:"",address:""});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  async function save(e:FormEvent){e.preventDefault();if(!form.name.trim())return setMessage("Client name is required.");setSaving(true);const slug=form.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,8);const {error}=await supabase.from("clients").insert({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim()||null,gstin:form.gstin.trim()||null,address_lines:form.address.split("\n").map(v=>v.trim()).filter(Boolean),portal_slug:slug,organization_id:organizationId});setSaving(false);if(error)setMessage(error.message);else onSaved();}
  return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">NEW CLIENT</div><h2>Create client</h2><p>Set the billing identity once; invoices inherit it.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="composer-body"><form className="password-settings" onSubmit={save}><div className="form-grid"><label>Client name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Billed-to / legal name<input value={form.legal_name} onChange={e=>setForm((f:any)=>({...f,legal_name:e.target.value}))}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm((f:any)=>({...f,email:e.target.value}))}/></label><label>Phone<input value={form.phone} onChange={e=>setForm((f:any)=>({...f,phone:e.target.value}))}/></label><label>PAN<input value={form.pan} onChange={e=>setForm((f:any)=>({...f,pan:e.target.value}))}/></label><label>GSTIN<input value={form.gstin} onChange={e=>setForm((f:any)=>({...f,gstin:e.target.value}))}/></label></div><label>Address lines<textarea value={form.address} onChange={e=>setForm((f:any)=>({...f,address:e.target.value}))} placeholder="One line per row"/></label>{message&&<div className="auth-message">{message}</div>}</form></div><div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={e=>((e.currentTarget.parentElement?.previousElementSibling?.querySelector("form") as HTMLFormElement|null)?.requestSubmit())} disabled={saving}>{saving?"Creating…":"Create client"}</button></div></div></div>;
}

function ClientPortal({clientId,invoices,onBack,onOpenInvoice,onSaved,onArchived}:{clientId:string;invoices:Invoice[];onBack:()=>void;onOpenInvoice:(i:Invoice)=>void;onSaved:()=>void;onArchived:()=>void}) {
  const [client,setClient]=useState<any>(null);const [documents,setDocuments]=useState<any[]>([]);const [portalLink,setPortalLink]=useState("");const [tab,setTab]=useState<"overview"|"invoices"|"projects"|"statement"|"settings">("overview");
  const [period,setPeriod]=useState<Period>("all");const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
  const [portalPassword,setPortalPassword]=useState("");const [passwordSaving,setPasswordSaving]=useState(false);const [openSection,setOpenSection]=useState<"identity"|"portal"|"documents"|null>(null);
  const [form,setForm]=useState<any>({});

  async function load(){setLoading(true);const [{data,error},{data:docs}]=await Promise.all([supabase.from("clients").select("id,name,legal_name,email,phone,pan,gstin,address_lines,portal_enabled,portal_slug,portal_message,allow_profile_edit,show_projects,show_documents,logo_path,portal_password_set_at").eq("id",clientId).single(),supabase.from("documents").select("*").eq("client_id",clientId).order("created_at",{ascending:false})]);setClient(data);setDocuments(docs||[]);if(error)setMessage(error.message);setLoading(false)}
  useEffect(()=>{load()},[clientId]);
  useEffect(()=>{if(client)setForm({name:client.name||"",legal_name:client.legal_name||"",email:client.email||"",phone:client.phone||"",pan:client.pan||"",gstin:client.gstin||"",address:Array.isArray(client.address_lines)?client.address_lines.join("\n"):"",portal_enabled:!!client.portal_enabled,allow_profile_edit:!!client.allow_profile_edit,show_projects:client.show_projects!==false,show_documents:client.show_documents!==false,portal_message:client.portal_message||"",logo_path:client.logo_path||""})},[client]);

  const rows=invoices.filter(i=>i.clientId===clientId);const scoped=rows.filter(i=>withinPeriod(i.date,period));const billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0);const paid=scoped.reduce((s,i)=>s+paidTotal(i),0);const projects=[...new Set(rows.map(i=>i.project))];

  async function save(){setSaving(true);setMessage("");const {error}=await supabase.from("clients").update({name:form.name.trim(),legal_name:form.legal_name.trim()||null,email:form.email.trim()||null,phone:form.phone.trim()||null,pan:form.pan.trim()||null,gstin:form.gstin.trim()||null,address_lines:form.address.split("\n").map((v:string)=>v.trim()).filter(Boolean),portal_enabled:form.portal_enabled,allow_profile_edit:form.allow_profile_edit,show_projects:form.show_projects,show_documents:form.show_documents,portal_message:form.portal_message.trim()||null,logo_path:form.logo_path||null,updated_at:new Date().toISOString()}).eq("id",clientId);setSaving(false);setMessage(error?error.message:"Client settings saved.");if(!error){setClient((p:any)=>({...p,...form}));onSaved()}}
  async function setPassword(){if(portalPassword.length<10){setMessage("Use at least 10 characters for the client portal password.");return}setPasswordSaving(true);setMessage("");const r=await fetch("/api/client-portal/"+clientId+"/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:portalPassword})});const j=await r.json();setPasswordSaving(false);if(!r.ok){setMessage(j.error||"Could not set portal password.");return}setPortalPassword("");setClient((p:any)=>({...p,portal_password_set_at:new Date().toISOString(),portal_enabled:true}));setForm((p:any)=>({...p,portal_enabled:true}));setMessage("Portal password saved. You can now create a protected access link.");}
  async function uploadLogo(file:File){if(!file.type.startsWith("image/")){setMessage("Please choose a PNG, JPG or WEBP logo.");return}if(file.size>2*1024*1024){setMessage("Logo must be under 2 MB.");return}setMessage("Uploading logo…");const path="clients/"+clientId+"/"+Date.now()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const {error}=await supabase.storage.from("minimical-finance-assets").upload(path,file,{upsert:true,contentType:file.type});if(error){setMessage(error.message);return}const {data}=supabase.storage.from("minimical-finance-assets").getPublicUrl(path);setForm((p:any)=>({...p,logo_path:data.publicUrl}));setClient((p:any)=>({...p,logo_path:data.publicUrl}));setMessage("Logo uploaded. Save client settings to apply it.");}

  if(loading)return <div className="empty-state">Loading client workspace…</div>;if(!client)return <div className="empty-state">Client not found.</div>;
  return <div className="client-portal">
    <div className="client-portal-head"><button className="back-link" onClick={onBack}>← Clients</button><div className="client-title-lockup">{client.logo_path?<img className="client-logo-small" src={client.logo_path} alt=""/>:<div className="client-avatar">{String(client.name||"?").slice(0,1).toUpperCase()}</div>}<div><div className="eyebrow">CLIENT WORKSPACE</div><h2>{client.name}</h2><p>{client.legal_name||"Billing profile incomplete"}{client.email?" · "+client.email:""}</p></div></div><button className="secondary" onClick={()=>setTab("settings")}><Settings2 size={14}/>Client settings</button></div>
    <div className="client-tabs">{(["overview","invoices","projects","statement","settings"] as const).map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{t==="statement"?"Account statement":t[0].toUpperCase()+t.slice(1)}</button>)}</div>
    {tab!=="settings"&&<div className="period-strip"><span>Reporting period</span>{(["month","quarter","half","year","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div>}
    {tab==="overview"&&<div className="client-dashboard"><div className="client-kpis"><Kpi label="Billed" value={money(billed)} detail={periodLabel(period)}/><Kpi label="Collected" value={money(paid)} detail="Recorded payments"/><Kpi label="Outstanding" value={money(Math.max(billed-paid,0))} detail="Current period"/><Kpi label="Invoices" value={String(scoped.length)} detail="In selected period"/></div><div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><div><h2>Account health</h2><p>Open receivables and payment history for this client.</p></div></div><div className="statement-summary"><div><span>All-time billed</span><b>{money(rows.reduce((s,i)=>s+invoiceTotal(i),0))}</b></div><div><span>All-time collected</span><b>{money(rows.reduce((s,i)=>s+paidTotal(i),0))}</b></div><div><span>Open balance</span><b>{money(rows.reduce((s,i)=>s+invoiceBalance(i),0))}</b></div></div></section><section className="data-panel"><div className="data-panel-head"><div><h2>Latest activity</h2><p>Recent invoices for this client.</p></div></div><div className="recent-list">{rows.slice(0,5).map(i=><button className="recent-row" key={i.id} onClick={()=>onOpenInvoice(i)}><div><b>#{i.number}</b><span>{i.project}</span></div><div><strong>{money(invoiceTotal(i))}</strong><small>{statusLabel(i.status)}</small></div></button>)}</div></section></div></div>}
    {tab==="invoices"&&<div className="data-panel"><div className="data-panel-head"><div><h2>Invoices</h2><p>{scoped.length+" invoices · "+periodLabel(period)}</p></div></div><div className="simple-list">{scoped.map(i=><button className="simple-row client-invoice-row" key={i.id} onClick={()=>onOpenInvoice(i)}><b>#{i.number}</b><span>{i.date}</span><span>{i.project}</span><strong>{money(invoiceTotal(i))}</strong><em>{statusLabel(i.status)}</em></button>)}</div></div>}
    {tab==="projects"&&<div className="data-panel"><div className="data-panel-head"><div><h2>Projects</h2><p>Projects linked to this client.</p></div></div><div className="project-directory">{projects.map(p=>{const ps=rows.filter(i=>i.project===p);return <div className="project-row" key={p}><div><b>{p}</b><span>{ps.length+" invoices"}</span></div><strong>{money(ps.reduce((s,i)=>s+invoiceTotal(i),0))}</strong><span>{money(ps.reduce((s,i)=>s+invoiceBalance(i),0))+" open"}</span></div>})}</div></div>}
    {tab==="statement"&&<div className="data-panel"><div className="data-panel-head"><div><h2>Account statement</h2><p>Billed, paid and outstanding activity for {periodLabel(period).toLowerCase()}.</p></div></div><div className="statement-summary"><div><span>Invoiced</span><b>{money(billed)}</b></div><div><span>Paid</span><b>{money(paid)}</b></div><div><span>Balance</span><b>{money(Math.max(billed-paid,0))}</b></div></div><div className="simple-list">{scoped.map(i=><div className="simple-row" key={i.id}><b>{"Invoice #"+i.number}</b><span>{i.date}</span><span>{i.project}</span><strong>{money(invoiceTotal(i))}</strong><em>{statusLabel(i.status)}</em></div>)}</div></div>}
    {tab==="settings"&&<div className="settings-stack">
      <div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpenSection(openSection==="identity"?null:"identity")}><span><b>Billing identity</b><small>Name, address, tax identity and client logo.</small></span><span>{openSection==="identity"?"Hide":"Edit"}</span></button>{openSection==="identity"&&<div className="settings-section-body"><div className="client-logo-upload">{form.logo_path?<img src={form.logo_path} alt="Client logo"/>:<div className="client-logo-placeholder">Logo</div>}<label className="secondary"><Upload size={14}/>Upload logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)uploadLogo(f)}}/></label><small>PNG, JPG or WEBP · max 2 MB · used on organisation PDFs without moving canonical invoice geometry.</small></div><div className="form-grid">{["name","legal_name","email","phone","pan","gstin"].map(k=><label key={k}>{k==="legal_name"?"Billed-to / legal name":k==="name"?"Client name":k.toUpperCase()}<input value={form[k]||""} onChange={e=>setForm((p:any)=>({...p,[k]:e.target.value}))}/></label>)}</div><label>Address lines<textarea value={form.address||""} onChange={e=>setForm((p:any)=>({...p,address:e.target.value}))}/></label></div>}</div>
      <div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpenSection(openSection==="portal"?null:"portal")}><span><b>Client portal</b><small>{client.portal_enabled?"Enabled":"Disabled"} · {client.portal_password_set_at?"Password protected":"Password not set"}</small></span><span>{openSection==="portal"?"Hide":"Edit"}</span></button>{openSection==="portal"&&<div className="settings-section-body"><label className="toggle-row"><span><b>Enable portal access</b><small>Clients must still enter the portal password.</small></span><input type="checkbox" checked={!!form.portal_enabled} onChange={e=>setForm((p:any)=>({...p,portal_enabled:e.target.checked}))}/></label><div className="portal-password-row"><label>Portal password<input type="password" value={portalPassword} onChange={e=>setPortalPassword(e.target.value)} placeholder={client.portal_password_set_at?"Set a new password":"Create password"}/></label><button className="secondary" type="button" onClick={setPassword} disabled={passwordSaving}>{passwordSaving?"Saving…":client.portal_password_set_at?"Change password":"Set password"}<KeyRound size={14}/></button></div><div className="portal-settings">{([["allow_profile_edit","Allow client to edit profile"],["show_projects","Show projects"],["show_documents","Show documents"]] as const).map(([k,label])=><label className="toggle-row" key={k}><span><b>{label}</b></span><input type="checkbox" checked={!!form[k]} onChange={e=>setForm((p:any)=>({...p,[k]:e.target.checked}))}/></label>)}<label>Portal message<textarea value={form.portal_message||""} onChange={e=>setForm((p:any)=>({...p,portal_message:e.target.value}))} placeholder="Optional message"/></label></div><div className="portal-link-tools"><button className="secondary" type="button" disabled={!form.portal_enabled||!client.portal_password_set_at} onClick={async()=>{const r=await fetch("/api/client-portal/"+clientId+"/token",{method:"POST"});const j=await r.json();if(!r.ok){setMessage(j.error||"Could not create access link.");return;}setPortalLink(j.url);setMessage("Protected shareable link created.");}}><ExternalLink size={14}/>Create protected link</button><button className="secondary" type="button" disabled={!form.portal_enabled||!client.portal_password_set_at||!client.email} onClick={async()=>{const r=await fetch("/api/client-portal/"+clientId+"/invite",{method:"POST"});const j=await r.json();if(!r.ok){setMessage(j.error||"Could not prepare invitation.");return;}window.location.href=j.mailto;setMessage("Invitation email prepared.");}}><ExternalLink size={14}/>Prepare email invitation</button>{portalLink?<div className="portal-link-box"><input readOnly value={portalLink}/><button className="secondary" type="button" onClick={()=>navigator.clipboard?.writeText(portalLink)}>Copy</button></div>:null}</div><div className="portal-access-note">{form.portal_enabled&&client.portal_password_set_at?"Ready: link + password required.":"Set a password and save portal access before sharing."}</div></div>}</div>
      <div className="settings-section-card"><button className="settings-section-toggle" onClick={()=>setOpenSection(openSection==="documents"?null:"documents")}><span><b>Client visibility</b><small>Control projects and shared documents.</small></span><span>{openSection==="documents"?"Hide":"Edit"}</span></button>{openSection==="documents"&&<div className="settings-section-body"><p className="settings-help">Visibility settings are included in the client-facing portal. They do not affect your internal records.</p><div className="document-upload-panel"><label className="secondary"><Upload size={14}/>Upload client document<input hidden type="file" accept=".pdf,image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10*1024*1024){setMessage("Document must be under 10 MB.");return}setMessage("Uploading document…");const path="documents/"+clientId+"/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"-");const up=await supabase.storage.from("minimical-finance-documents").upload(path,file,{upsert:false,contentType:file.type});if(up.error){setMessage(up.error.message);return}const ins=await supabase.from("documents").insert({client_id:clientId,file_path:path,storage_bucket:"minimical-finance-documents",file_name:file.name,document_type:file.type==="application/pdf"?"pdf":"image",mime_type:file.type,size_bytes:file.size,visible_to_client:true,description:null}).select().single();if(ins.error){setMessage(ins.error.message);return}setMessage("Document uploaded and shared with the client.");}}/></label><p className="settings-help">PDF, PNG, JPG or WEBP · maximum 10 MB.</p></div></div>}</div>
      {documents.length>0&&openSection==="documents"&&<div className="document-manager-list">{documents.map(d=><div className="document-manager-row" key={d.id}><FileText size={15}/><div><b>{d.file_name}</b><span>{d.description||d.document_type} · {d.visible_to_client?"Visible to client":"Internal"}</span></div><div><a className="secondary mini-action" href={"/api/client-portal/"+client.portal_slug+"/document/"+d.id+"?preview=1"} target="_blank" rel="noreferrer">Preview</a><button className="secondary mini-action" onClick={async()=>{const {error}=await supabase.from("documents").update({visible_to_client:!d.visible_to_client}).eq("id",d.id);if(error)setMessage(error.message);else setDocuments(v=>v.map(x=>x.id===d.id?{...x,visible_to_client:!x.visible_to_client}:x));}}>{d.visible_to_client?"Hide":"Share"}</button><button className="secondary mini-action" onClick={async()=>{if(!window.confirm("Delete this document?"))return;const rm=await supabase.storage.from(d.storage_bucket||"minimical-finance-documents").remove([d.file_path]);if(rm.error){setMessage(rm.error.message);return}const del=await supabase.from("documents").delete().eq("id",d.id);if(del.error)setMessage(del.error.message);else{setDocuments(v=>v.filter(x=>x.id!==d.id));setMessage("Document deleted.");}}}>Delete</button></div></div>)}</div>}{message&&<div className="auth-success">{message}</div>}<div className="client-danger-actions"><button className="secondary danger-button" onClick={async()=>{if(!window.confirm("Archive this client? Existing invoices and documents remain preserved."))return;const {error}=await supabase.from("clients").update({archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",clientId);if(error)setMessage(error.message);else {onArchived();onSaved()}}}>Archive client</button><button className="primary" disabled={saving} onClick={save}>{saving?"Saving…":"Save client settings"}</button></div>
    </div>}
  </div>;
}

type Period="month"|"quarter"|"half"|"year"|"all";
function periodLabel(p:Period){if(p==="month")return "This month";if(p==="quarter")return "Last 3 months";if(p==="half")return "Last 6 months";if(p==="year"){const n=new Date();const y=n.getMonth()>=3?n.getFullYear():n.getFullYear()-1;return `FY ${y}-${String(y+1).slice(-2)}`;}return "All time";}
function withinPeriod(date:string,p:Period,today=new Date()){if(p==="all")return true;const d=new Date(date+"T00:00:00"),end=new Date(today.getFullYear(),today.getMonth()+1,0);if(p==="month")return d>=new Date(today.getFullYear(),today.getMonth(),1)&&d<=end;if(p==="quarter"){const start=new Date(today.getFullYear(),today.getMonth()-2,1);return d>=start&&d<=end;}if(p==="half"){const start=new Date(today.getFullYear(),today.getMonth()-5,1);return d>=start&&d<=end;}const fy=new Date(today.getMonth()>=3?today.getFullYear():today.getFullYear()-1,3,1);return d>=fy&&d<=new Date(fy.getFullYear()+1,2,31);}
function ReportsView({invoices}:{invoices:Invoice[]}) {
  const [period,setPeriod]=useState<Period>("year"); const [client,setClient]=useState("all"); const [org,setOrg]=useState("all"); const [projects,setProjects]=useState<any[]>([]); const [organizations,setOrganizations]=useState<any[]>([]);
  useEffect(()=>{Promise.all([supabase.from("projects").select("id,name,actual_cost,organization_id,organizations(name)"),supabase.from("organizations").select("id,name").order("name")]).then(([p,o])=>{setProjects(p.data||[]);setOrganizations(o.data||[])})},[]);
  const clients=[...new Set(invoices.map(i=>i.client))].sort(); const orgs=[...new Set(invoices.map(i=>i.organizationId).filter((id): id is string=>Boolean(id)))];
  const scoped=invoices.filter(i=>(client==="all"||i.client===client)&&(org==="all"||i.organizationId===org)&&withinPeriod(i.date,period));
  const billed=scoped.reduce((s,i)=>s+invoiceTotal(i),0),paid=scoped.reduce((s,i)=>s+paidTotal(i),0),outstanding=Math.max(billed-paid,0);
  const groups=new Map<string,{billed:number;paid:number;count:number}>();scoped.forEach(i=>{const key=i.date.slice(0,7);const g=groups.get(key)||{billed:0,paid:0,count:0};g.billed+=invoiceTotal(i);g.paid+=paidTotal(i);g.count++;groups.set(key,g)});
  const byClient=new Map<string,number>();scoped.forEach(i=>byClient.set(i.client,(byClient.get(i.client)||0)+invoiceTotal(i)));
  const byProject=new Map<string,{billed:number;paid:number;cost:number}>();scoped.forEach(i=>{const key=i.projectId||i.project;const g=byProject.get(key)||{billed:0,paid:0,cost:projects.find(p=>p.id===i.projectId)?.actual_cost||0};g.billed+=invoiceTotal(i);g.paid+=paidTotal(i);byProject.set(key,g)});
  const byOrg=new Map<string,{billed:number;paid:number;open:number}>();scoped.forEach(i=>{const key=i.organizationId||"unassigned";const g=byOrg.get(key)||{billed:0,paid:0,open:0};g.billed+=invoiceTotal(i);g.paid+=paidTotal(i);g.open+=invoiceBalance(i);byOrg.set(key,g)});
  const cashflow=new Map<string,number>();scoped.forEach(i=>i.payments.forEach(p=>{const key=(p.payment_date||i.date).slice(0,7);cashflow.set(key,(cashflow.get(key)||0)+Number(p.amount||0))}));
  const aging={current:0,d1_30:0,d31_60:0,d61_90:0,d90:0};scoped.forEach(i=>{const b=invoiceBalance(i);if(!b)return;const d=daysOverdue(i);if(d<=0)aging.current+=b;else if(d<=30)aging.d1_30+=b;else if(d<=60)aging.d31_60+=b;else if(d<=90)aging.d61_90+=b;else aging.d90+=b});
  const profitability=[...byProject.entries()].map(([id,g])=>({id,name:projects.find(p=>p.id===id)?.name||id,billed:g.billed,cost:g.cost,profit:g.billed-g.cost,margin:g.billed?Math.round((g.billed-g.cost)/g.billed*1000)/10:0})).sort((a,b)=>b.profit-a.profit);
  return <div className="reports-page">
    <div className="report-toolbar"><div className="period-strip">{(["month","quarter","half","year","all"] as Period[]).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{periodLabel(p)}</button>)}</div><div className="report-filters"><select value={client} onChange={e=>setClient(e.target.value)}><option value="all">All clients</option>{clients.map(c=><option key={c}>{c}</option>)}</select><select value={org} onChange={e=>setOrg(e.target.value)}><option value="all">All organisations</option>{orgs.map(id=><option key={id} value={id}>{organizations.find(o=>o.id===id)?.name||id}</option>)}</select></div></div>
    <section className="kpis compact-kpis"><Kpi label="Billed" value={money(billed)} detail={periodLabel(period)}/><Kpi label="Collected" value={money(paid)} detail="Recorded payments"/><Kpi label="Outstanding" value={money(outstanding)} detail="Current period balance"/><Kpi label="Collection" value={billed?Math.round(paid/billed*100)+"%":"0%"} detail="Collected / billed"/></section>
    <div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><div><h2>Period breakdown</h2><p>Monthly billed and collected performance.</p></div></div><div className="report-bars">{[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([month,g])=><div className="report-bar-row" key={month}><span>{new Date(month+"-01T00:00:00").toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</span><div><i style={{width:String(billed?Math.min(100,g.billed/billed*100):0)+"%"}}/></div><strong>{money(g.billed)}</strong><small>{money(g.paid)} collected · {g.count} invoices</small></div>)}</div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Cashflow</h2><p>Actual recorded collections by payment month.</p></div></div><div className="simple-list">{[...cashflow.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([m,v])=><div className="simple-row" key={m}><b>{new Date(m+"-01T00:00:00").toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</b><span>Cash received</span><span></span><strong>{money(v)}</strong><em>Collected</em></div>)}</div></section></div>
    <div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><div><h2>AR aging</h2><p>Outstanding receivables grouped by days overdue.</p></div></div><div className="simple-list">{[["Current",aging.current],["1–30 days",aging.d1_30],["31–60 days",aging.d31_60],["61–90 days",aging.d61_90],[">90 days",aging.d90]].map(([label,value])=><div className="simple-row" key={String(label)}><b>{label}</b><span>Receivables</span><span></span><strong>{money(Number(value))}</strong><em>Open</em></div>)}</div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Revenue by organisation</h2><p>Gross billed, collected and open balance.</p></div></div><div className="simple-list">{[...byOrg.entries()].sort((a,b)=>b[1].billed-a[1].billed).map(([id,g])=><div className="simple-row" key={id}><b>{organizations.find(o=>o.id===id)?.name||"Unassigned"}</b><span>{money(g.paid)} paid</span><span>{money(g.open)} open</span><strong>{money(g.billed)}</strong><em>Billed</em></div>)}</div></section></div>
    <div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><div><h2>Revenue by client</h2><p>Gross billed in the selected period.</p></div></div><div className="simple-list">{[...byClient.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value])=><div className="simple-row" key={name}><b>{name}</b><span>Client</span><span></span><strong>{money(value)}</strong><em>Billed</em></div>)}</div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Production profitability</h2><p>Revenue less recorded project production cost.</p></div></div><div className="simple-list">{profitability.map(g=><div className="simple-row" key={g.id}><b>{g.name}</b><span>{money(g.billed)} billed</span><span>{money(g.cost)} cost</span><strong>{money(g.profit)}</strong><em>{g.margin}% margin</em></div>)}</div></section></div>
    <div className="overview-grid"><section className="data-panel"><div className="data-panel-head"><div><h2>Revenue by project</h2><p>Billing, collection and recorded production cost.</p></div></div><div className="simple-list">{[...byProject.entries()].sort((a,b)=>b[1].billed-a[1].billed).map(([name,g])=><div className="simple-row" key={name}><b>{projects.find(p=>p.id===name)?.name||name}</b><span>{money(g.paid)} paid</span><span>Cost {money(g.cost)}</span><strong>{money(g.billed-g.cost)}</strong><em>Gross</em></div>)}</div></section>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Collection analytics</h2><p>Conversion from invoiced revenue into recorded cash.</p></div></div><div className="statement-summary"><div><span>Collection rate</span><b>{billed?Math.round(paid/billed*1000)/10:0}%</b></div><div><span>Average invoice</span><b>{scoped.length?money(billed/scoped.length):money(0)}</b></div><div><span>Average collected</span><b>{scoped.length?money(paid/scoped.length):money(0)}</b></div></div></section></div>
    <section className="data-panel"><div className="data-panel-head"><div><h2>Invoice register</h2><p>Issued records inside the selected period.</p></div></div><div className="simple-list">{[...scoped].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(i=><div className="simple-row" key={i.id}><b>#{i.number}</b><span>{i.date}</span><span>{i.client}</span><strong>{money(invoiceTotal(i))}</strong><em>{statusLabel(i.status)}</em></div>)}</div></section>
  </div>
}
function ProjectsView({invoices,organizationId,onOpen}:{invoices:Invoice[];organizationId:string|null;onOpen:(i:Invoice)=>void}) {
  const [projects,setProjects]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [creating,setCreating]=useState(false);
  useEffect(()=>{load();const h=()=>setCreating(true);window.addEventListener("finance:new-project",h);return()=>window.removeEventListener("finance:new-project",h)},[]);
  async function load(){setLoading(true);if(!organizationId){setProjects([]);setLoading(false);return}const {data}=await supabase.from("projects").select("*, clients(name), organizations(name)").eq("organization_id",organizationId).order("name");setProjects(data||[]);setLoading(false);}
  const fallback=new Map<string,{name:string;client:string;invoices:Invoice[];billed:number;paid:number}>();invoices.forEach(i=>{const key=(i.projectId||i.project)+"::"+(i.clientId||i.client);const row=fallback.get(key)||{name:i.project,client:i.client,invoices:[],billed:0,paid:0};row.invoices.push(i);row.billed+=invoiceTotal(i);row.paid+=paidTotal(i);fallback.set(key,row)});
  const derived=Array.from(fallback.values()).filter(x=>!projects.some(p=>p.name===x.name&&p.clients?.name===x.client));
  return <div className="data-panel"><div className="data-panel-head"><div><h2>Projects</h2><p>{projects.length+derived.length} project records · billing and production cost.</p></div></div>
    {loading?<div className="empty-state">Loading projects…</div>:<div className="client-grid">{projects.map(p=><ProjectCard key={p.id} p={p} invoices={invoices} onOpen={onOpen} onSaved={load}/>)}{derived.map(p=><ProjectCard key={p.name+"::"+p.client} p={{name:p.name,clients:{name:p.client},budget_cost:0,actual_cost:0,status:"active"}} invoices={p.invoices} onOpen={onOpen}/>)}</div>}
    {!loading&&!projects.length&&!derived.length&&<div className="empty-state">No projects yet. Create the first project.</div>}
    {creating&&<ProjectCreateModal onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);load()}}/>}
  </div>;
}
function ProjectCard({p,invoices,onOpen,onSaved}:{p:any;invoices:Invoice[];onOpen:(i:Invoice)=>void;onSaved?:()=>void}){
 const [editing,setEditing]=useState(false); const rows=invoices.filter(i=>(p.id&&i.projectId===p.id)||(!p.id&&i.project===p.name&&i.client===(p.clients?.name||"")));const billed=rows.reduce((s,i)=>s+invoiceTotal(i),0);const paid=rows.reduce((s,i)=>s+paidTotal(i),0);const profit=billed-Number(p.actual_cost||0);
 return <><article className="client-card project-card"><div className="client-avatar"><FolderKanban size={17}/></div><div><h3>{p.name}</h3><p>{p.clients?.name||"Unassigned client"} · {p.status||"active"}</p></div><strong>{money(billed)}</strong><small>{money(paid)} collected · {money(Math.max(billed-paid,0))} outstanding · {money(profit)} gross after recorded cost</small><div className="client-invoices">{rows.slice(0,5).map(i=><button key={i.id} onClick={()=>onOpen(i)}>#{i.number} · {money(invoiceTotal(i))}</button>)}</div><div className="project-actions">{p.id&&<><button className="secondary mini-action" onClick={()=>setEditing(true)}>Edit</button><button className="secondary mini-action danger-button" onClick={async()=>{if(!window.confirm("Archive this project?"))return;const {error}=await supabase.from("projects").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",p.id);if(error)window.alert(error.message);else onSaved?.()}}>Archive</button></>}</div></article>{editing&&<ProjectEditModal project={p} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);onSaved?.()}}/>}</>;
}
function ProjectEditModal({project,onClose,onSaved}:{project:any;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:project.name||"",status:project.status||"active",description:project.description||"",budget_cost:String(project.budget_cost||0),actual_cost:String(project.actual_cost||0)});const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 async function save(e:FormEvent){e.preventDefault();setSaving(true);const {error}=await supabase.from("projects").update({name:form.name.trim(),status:form.status,description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,updated_at:new Date().toISOString()}).eq("id",project.id);setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">PROJECT</div><h2>Edit project</h2><p>{project.name}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><form className="composer-body form-grid" onSubmit={save}><label>Name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span">{message}</div>}<div className="drawer-foot full-span"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?"Saving…":"Save project"}</button></div></form></div></div>;
}
function ProjectCreateModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<any>({name:"",client_id:"",organization_id:"",status:"active",description:"",budget_cost:"0",actual_cost:"0"});const [clients,setClients]=useState<any[]>([]);const [orgs,setOrgs]=useState<any[]>([]);const [saving,setSaving]=useState(false);const [message,setMessage]=useState("");
 useEffect(()=>{Promise.all([supabase.from("clients").select("id,name").is("archived_at",null).order("name"),supabase.from("organizations").select("id,name").order("name")]).then(([a,b])=>{setClients(a.data||[]);setOrgs(b.data||[])})},[]);
 async function save(e:FormEvent){e.preventDefault();if(!form.name.trim())return setMessage("Project name is required.");setSaving(true);const {error}=await supabase.from("projects").insert({...form,name:form.name.trim(),description:form.description.trim()||null,budget_cost:Number(form.budget_cost)||0,actual_cost:Number(form.actual_cost)||0,client_id:form.client_id||null,organization_id:form.organization_id||null});setSaving(false);if(error)setMessage(error.message);else onSaved()}
 return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-head"><div><div className="eyebrow">NEW PROJECT</div><h2>Create project</h2><p>Track revenue and production cost together.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div><div className="composer-body"><form className="form-grid" onSubmit={save}><label>Project name<input required value={form.name} onChange={e=>setForm((f:any)=>({...f,name:e.target.value}))}/></label><label>Client<select value={form.client_id} onChange={e=>setForm((f:any)=>({...f,client_id:e.target.value}))}><option value="">Unassigned</option>{clients.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Organisation<select value={form.organization_id} onChange={e=>setForm((f:any)=>({...f,organization_id:e.target.value}))}><option value="">Unassigned</option>{orgs.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm((f:any)=>({...f,status:e.target.value}))}><option>active</option><option>on_hold</option><option>completed</option><option>archived</option></select></label><label>Budget cost<input type="number" value={form.budget_cost} onChange={e=>setForm((f:any)=>({...f,budget_cost:e.target.value}))}/></label><label>Actual cost<input type="number" value={form.actual_cost} onChange={e=>setForm((f:any)=>({...f,actual_cost:e.target.value}))}/></label><label className="full-span">Description<textarea value={form.description} onChange={e=>setForm((f:any)=>({...f,description:e.target.value}))}/></label>{message&&<div className="auth-message full-span">{message}</div>}</form></div><div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>{const formEl=document.querySelector(".composer form") as HTMLFormElement|null;formEl?.requestSubmit()}} disabled={saving}>{saving?"Creating…":"Create project"}</button></div></div></div>;
}
function activityLabel(action:string) {
  return ({
    invoice_created: "Invoice created",
    invoice_updated: "Invoice updated",
    invoice_status_changed: "Status changed",
    payment_recorded: "Payment recorded",
  } as Record<string,string>)[action] ?? action.replaceAll("_"," ");
}

function Kpi({icon,label,value,note,detail,accent}:{icon?:React.ReactNode;label:string;value:string;note?:string;detail?:string;accent?:boolean}) {
  return <div className={"kpi" + (accent ? " accent" : "")}><div className="kpi-icon">{icon ?? <IndianRupee size={15}/>}</div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-note">{detail ?? note ?? ""}</div></div>;
}

function InvoiceCard({invoice,onOpen,onStatus}:{invoice:Invoice;onOpen:()=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  const unpriced = invoice.contents.filter(c => !c.priced).length;
  const balance = Math.max(invoiceTotal(invoice) - paidTotal(invoice), 0);
  return <article className="invoice-card" onClick={onOpen}>
    <div className="invoice-main"><div className="invoice-id"><span>INV.</span><strong>{invoice.number}</strong></div><div><h3>{invoice.client}</h3><p>{invoice.project} · {new Date(invoice.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p></div></div>
    <div className="invoice-middle"><div className="content-chips">{invoice.contents.slice(0,3).map(c => <span key={c.id}>{c.title}</span>)}{invoice.contents.length > 3 && <span>+{invoice.contents.length - 3} more</span>}</div>{unpriced > 0 && <span className="warning-pill"><CircleAlert size={13}/>{unpriced} unpriced</span>}
    {daysOverdue(invoice) > 0 && <span className="warning-pill overdue-pill"><CircleAlert size={13}/>{daysOverdue(invoice)}d overdue</span>}{invoice.sourceTotal != null && invoice.sourceTotal !== invoiceTotal(invoice) && <span className="warning-pill"><CircleAlert size={13}/>source mismatch</span>}</div>
    <div className="invoice-right"><strong>{money(invoiceTotal(invoice))}</strong><span className={"balance " + (balance ? "open" : "clear")}>{balance ? money(balance) + " due" : "settled"}</span><button className={"status " + invoice.status} onClick={e => { e.stopPropagation(); onOpen(); }}>{statusLabel(invoice.status)}</button><ChevronRight size={17} className="chevron"/></div>
  </article>;
}

function InvoiceDrawer({invoice,onClose,onStatus,onSave,onPayment}:{invoice:Invoice;onClose:()=>void;onStatus:(i:Invoice,s:Status)=>void;onSave:(i:Invoice)=>void;onPayment:()=>void}) {
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
      <section className="invoice-hero">
        <div className="invoice-hero-brand"><span className="invoice-hero-mark">{(organizations.find(o=>o.id===draft.organizationId)?.name||"m").slice(0,1).toUpperCase()}</span><div><b>{organizations.find(o=>o.id===draft.organizationId)?.name||"minimical finance"}</b><small>Branded invoice workspace</small></div></div>
        <div className="invoice-hero-amount"><span>Invoice total</span><strong>{money(invoiceTotal(draft))}</strong><small>{draft.status==="paid"?"Fully settled":draft.status==="partially_paid"?"Partially collected":"Balance "+money(Math.max(invoiceTotal(draft)-paidTotal(draft),0))}</small></div>
      </section>
      <section className="invoice-document-preview">
        <div className="invoice-document-top"><div><span className="invoice-document-mark">{(organizations.find(o=>o.id===draft.organizationId)?.name||"m").slice(0,1).toUpperCase()}</span><b>{organizations.find(o=>o.id===draft.organizationId)?.name||"minimical finance"}</b></div><strong>INVOICE</strong></div>
        <div className="invoice-document-meta"><div><span>Billed to</span><b>{draft.client}</b><small>{draft.project}</small></div><div><span>Invoice</span><b>#{draft.number}</b><small>{dateLabel(draft.date)}</small></div><div><span>Due</span><b>{draft.dueDate||"—"}</b><small>{statusLabel(draft.status)}</small></div></div>
        <div className="invoice-document-lines">{draft.contents.slice(0,3).map((item,idx)=><div key={item.id}><span>{String(idx+1).padStart(2,"0")} · {item.title||"Untitled item"}</span><b>{item.priced?money(contentAmount(item)):"TBD"}</b></div>)}{draft.contents.length>3&&<small>+ {draft.contents.length-3} more line items</small>}</div>
        <div className="invoice-document-total"><span>Total</span><b>{money(invoiceTotal(draft))}</b></div>
      </section>
      <div className="drawer-summary"><div><span>Total</span><strong>{money(invoiceTotal(draft))}</strong></div><div><span>Collected</span><strong>{money(paidTotal(draft))}</strong></div><div><span>Status</span><select className="status-select" value={draft.status} onChange={async e=>{const next=e.target.value as Status; setDraft(d=>({...d,status:next})); await onStatus({...draft,status:next},next)}}><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div></div>
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
    <div className="drawer-foot"><button className="secondary" onClick={() => { window.location.href = "/api/invoices/" + draft.id + "/pdf"; }}>Download PDF</button><button className="secondary" onClick={onClose}>Close</button><button className="primary" onClick={() => onSave(draft)}><Check size={16}/>Save changes</button></div>
  </aside></div>;
}

function InvoiceComposer({initialNumber,initialOrganizationId,onClose,onCreate}:{initialNumber:string;initialOrganizationId:string|null;onClose:()=>void;onCreate:(d:{number:string;client:string;project:string;date:string;dueDate:string;organizationId?:string|null;contents:Content[]})=>void}) {
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
    <div className="drawer-head"><div><div className="eyebrow">NEW INVOICE</div><h2>Create invoice</h2><p>Build it from the actual contents.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="composer-body"><div className="form-grid"><label>Invoice number<input value={number} onChange={e => setNumber(e.target.value)} placeholder="Automatic"/></label><label>Client<input value={client} onChange={e => setClient(e.target.value)}/></label><label>Project<input value={project} onChange={e => setProject(e.target.value)}/></label><label>Billing organisation<select value={organizationId} onChange={e=>setOrganizationId(e.target.value)}>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Issue date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div>
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Billable, adjustment and unpriced content can coexist.</p></div><button className="secondary" onClick={add}><Plus size={15}/>Add content</button></div>
        {contents.map((c,idx) => <div className="composer-row" key={c.id}><span>{idx + 1}</span><input value={c.title} onChange={e => patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input type="number" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})} placeholder="Qty"/><input type="number" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})} placeholder="Rate"/><b>{c.priced && c.rate ? money(contentAmount(c)) : "TBD"}</b></div>)}
      </div><div className="total-box"><span>Invoice total</span><strong>{money(total)}</strong></div>
    </div>
    <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!number || !contents.some(c => c.title.trim())} onClick={() => onCreate({number,client,project,date,dueDate,organizationId,contents})}>Create draft</button></div>
  </div></div>;
}


function PaymentComposer({invoice,onClose,onCreate}:{invoice:Invoice;onClose:()=>void;onCreate:(i:Invoice,a:number,d:string,m:string,r:string)=>void}) {
  const [amount,setAmount] = useState(String(Math.max(invoiceTotal(invoice)-paidTotal(invoice),0)));
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [method,setMethod] = useState("bank_transfer");
  const [reference,setReference] = useState("");
  const balance = Math.max(invoiceTotal(invoice)-paidTotal(invoice),0);
  return <div className="overlay" onMouseDown={onClose}><div className="payment-composer" onMouseDown={e=>e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">PAYMENT / #{invoice.number}</div><h2>Record payment</h2><p>{invoice.client} · {money(balance)} currently outstanding</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
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
