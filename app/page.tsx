"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Check, RefreshCw, ShieldCheck, ChevronRight, CircleAlert, FileText, Filter,
  IndianRupee, LayoutDashboard, LogOut, MoreHorizontal, Plus, Receipt,
  Search, Settings2, Sparkles, WalletCards, X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
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

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [composer, setComposer] = useState(false);
  const [paymentFor, setPaymentFor] = useState<Invoice | null>(null);
  const [activeView, setActiveView] = useState<"overview" | "invoices" | "payments" | "clients" | "settings">("overview");
  const [actionError, setActionError] = useState("");

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
    if (session) loadInvoices();
    else if (authReady) setLoading(false);
  }, [session, authReady]);

  async function loadInvoices() {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*, clients(name), projects(name), invoice_contents(*), payments(*), activity_log(*)")
      .order("issue_date", { ascending: false });
    if (error) {
      console.error(error);
      setActionError(error.message);
      setLoading(false);
      return [] as Invoice[];
    }
    const mapped = (data ?? []).map(mapInvoice);
    setActionError("");
    setInvoices(mapped);
    setSelected(current => current ? (mapped.find(i => i.id === current.id) ?? current) : current);
    setLoading(false);
    return mapped;
  }

  async function logActivity(invoiceId: string | null, action: string, metadata: Record<string, unknown> = {}) {
    const { error } = await supabase.from("activity_log").insert({ invoice_id: invoiceId, action, metadata: metadata as any });
    if (error) console.warn("Activity log failed:", error.message);
  }

  async function markStatus(invoice: Invoice, next: Status) {
    const { error } = await supabase
      .from("invoices")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", invoice.id);
    if (error) return setActionError(error.message);
    await logActivity(invoice.id, "invoice_status_changed", { from: invoice.status, to: next });
    await loadInvoices();
  }

  async function recordPayment(invoice: Invoice, amount: number, date: string, method: string, reference: string) {
    if (!Number.isFinite(amount) || amount <= 0) return setActionError("Enter a valid payment amount.");
    const balance = Math.max(invoiceTotal(invoice) - paidTotal(invoice), 0);
    if (amount > balance) return setActionError("Payment cannot exceed the current invoice balance.");

    const { error } = await supabase.from("payments").insert({
      invoice_id: invoice.id,
      amount,
      payment_date: date || null,
      method: method as PaymentMethod,
      reference: reference || null,
    });
    if (error) return setActionError(error.message);

    const nextPaid = paidTotal(invoice) + amount;
    const nextStatus: Status = nextPaid >= invoiceTotal(invoice) ? "paid" : "partially_paid";
    const statusUpdate = await supabase.from("invoices").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", invoice.id);
    if (statusUpdate.error) return setActionError(statusUpdate.error.message);
    await logActivity(invoice.id, "payment_recorded", { amount, payment_date: date || null, method, reference: reference || null });
    setPaymentFor(null);
    setActionError("");
    await loadInvoices();
  }

  async function saveInvoice(next: Invoice) {
    const { error } = await supabase.from("invoices").update({
      notes: next.notes ?? null,
      adjustment_note: next.adjustment ?? null,
      issue_date: next.date,
      due_date: next.dueDate ?? null,
      status: next.status,
      updated_at: new Date().toISOString(),
    }).eq("id", next.id);
    if (error) return alert(error.message);

    const deleted = await supabase.from("invoice_contents").delete().eq("invoice_id", next.id);
    if (deleted.error) return setActionError(deleted.error.message);
    const rows = next.contents.map((c, index) => ({
      invoice_id: next.id, position: index, kind: c.kind, title: c.title,
      quantity: c.quantity || 1, rate: c.rate ?? null,
      amount: c.priced ? contentAmount(c) : null, priced: c.priced, note: c.note ?? null,
    }));
    if (rows.length) {
      const inserted = await supabase.from("invoice_contents").insert(rows);
      if (inserted.error) return setActionError(inserted.error.message);
    }
    await logActivity(next.id, "invoice_updated", { content_count: rows.length, total: invoiceTotal(next) });
    await loadInvoices();
    setSelected(null);
  }

  async function createInvoice(draft: {
    number: string; client: string; project: string; date: string; dueDate: string; contents: Content[];
  }) {
    let { data: client } = await supabase.from("clients").select("id").eq("name", draft.client).maybeSingle();
    if (!client) {
      const result = await supabase.from("clients").insert({ name: draft.client }).select("id").single();
      if (result.error) return alert(result.error.message);
      client = result.data;
    }
    let { data: project } = await supabase.from("projects").select("id").eq("name", draft.project).eq("client_id", client.id).maybeSingle();
    if (!project) {
      const result = await supabase.from("projects").insert({ name: draft.project, client_id: client.id }).select("id").single();
      if (result.error) return alert(result.error.message);
      project = result.data;
    }
    const result = await supabase.from("invoices").insert({
      invoice_number: draft.number.trim(), client_id: client.id, project_id: project.id,
      issue_date: draft.date, due_date: draft.dueDate || null,
      status: "draft", source_total: draft.contents.reduce((s, c) => s + contentAmount(c), 0),
    }).select("id").single();
    if (result.error) return alert(result.error.message);

    const rows = draft.contents.map((c, index) => ({
      invoice_id: result.data.id, position: index, kind: c.kind, title: c.title,
      quantity: c.quantity || 1, rate: c.rate ?? null, amount: c.priced ? contentAmount(c) : null,
      priced: c.priced, note: c.note ?? null,
    }));
    if (rows.length) {
      const inserted = await supabase.from("invoice_contents").insert(rows);
      if (inserted.error) return setActionError(inserted.error.message);
    }
    await logActivity(result.data.id, "invoice_created", { invoice_number: draft.number.trim(), total: draft.contents.reduce((s, c) => s + contentAmount(c), 0) });
    setComposer(false);
    await loadInvoices();
  }

  const nextInvoiceNumber = useMemo(() => {
    const numeric = invoices.map(i => Number.parseInt(String(i.number).replace(/\D/g, ""), 10)).filter(Number.isFinite);
    return numeric.length ? String(Math.max(...numeric) + 1) : "1";
  }, [invoices]);

  const filtered = useMemo(() => invoices.filter(i => {
    const text = [i.number, i.client, i.project, i.notes, ...i.contents.map(c => c.title)].join(" ").toLowerCase();
    return (status === "all" || i.status === status) && text.includes(query.toLowerCase());
  }), [invoices, query, status]);

  const stats = useMemo(() => calculateStats(invoices), [invoices]);

  if (!authReady) return <div className="auth-screen"><div className="auth-card">Loading minimical.finance…</div></div>;
  if (!session) return <AuthScreen />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">m</div><div><strong>minimical</strong><span>.finance</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button className={"nav-item " + (activeView === "overview" ? "active" : "")} onClick={() => setActiveView("overview")}><LayoutDashboard size={17}/>Overview</button>
          <button className={"nav-item " + (activeView === "invoices" ? "active" : "")} onClick={() => setActiveView("invoices")}><Receipt size={17}/>Invoices <span>{invoices.length}</span></button>
          <button className={"nav-item " + (activeView === "payments" ? "active" : "")} onClick={() => setActiveView("payments")}><WalletCards size={17}/>Payments</button>
          <button className={"nav-item " + (activeView === "clients" ? "active" : "")} onClick={() => setActiveView("clients")}><FileText size={17}/>Clients</button>
        </nav>
        <div className="sidebar-bottom">
          <button className={"nav-item " + (activeView === "settings" ? "active" : "")} onClick={() => setActiveView("settings")}><Settings2 size={17}/>Settings</button>
          <button className="nav-item" onClick={() => supabase.auth.signOut()}><LogOut size={17}/>Sign out</button>
          <div className="profile"><div className="avatar">M</div><div><b>Finance workspace</b><small>Authenticated</small></div><MoreHorizontal size={16}/></div>
        </div>
      </aside>

      <section className="content">
        {actionError && <div className="global-error"><CircleAlert size={15}/><span>{actionError}</span><button onClick={() => setActionError("")}><X size={14}/></button></div>}
        <header className="topbar">
          <div><div className="eyebrow">FINANCE / {activeView.toUpperCase()}</div><h1>{activeView === "overview" ? "Money, without the spreadsheet." : activeView === "invoices" ? "Invoices." : activeView === "payments" ? "Collections." : activeView === "clients" ? "Clients & projects." : "Settings."}</h1><p>{activeView === "overview" ? "Your invoices, contents and collections in one source of truth." : activeView === "invoices" ? "Create, edit and audit every invoice from its actual contents." : activeView === "payments" ? "Every recorded payment against every invoice." : activeView === "clients" ? "The client and project layer behind your billing." : "Private access, security and workspace configuration."}</p></div>
          <div className="top-actions"><button className="icon-button" title="Refresh data" onClick={() => loadInvoices()}><RefreshCw size={17}/></button><button className="primary" onClick={() => setComposer(true)}><Plus size={17}/>New invoice</button></div>
        </header>

        {activeView === "overview" && <Overview stats={stats} invoices={invoices} onOpen={(i) => setSelected(i)} />}
        {activeView === "invoices" && <InvoiceView filtered={filtered} query={query} setQuery={setQuery} status={status} setStatus={setStatus} loading={loading} onOpen={(i) => setSelected(i)} onStatus={markStatus} />}
        {activeView === "payments" && <PaymentsView invoices={invoices} onOpenPayment={(i) => setPaymentFor(i)} />}
        {activeView === "clients" && <ClientsView invoices={invoices} onOpen={(i) => setSelected(i)} />}
        {activeView === "settings" && <SettingsView email={session.user?.email ?? ""} onSignOut={() => supabase.auth.signOut()} />}
      </section>

      {selected && <InvoiceDrawer invoice={selected} onClose={() => setSelected(null)} onStatus={markStatus} onSave={saveInvoice} onPayment={() => setPaymentFor(selected)}/>}
      {paymentFor && <PaymentComposer invoice={paymentFor} onClose={() => setPaymentFor(null)} onCreate={recordPayment}/>}
      {composer && <InvoiceComposer initialNumber={nextInvoiceNumber} onClose={() => setComposer(false)} onCreate={createInvoice}/>} 
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
    <div className="brand"><div className="brand-mark">m</div><div><strong>minimical</strong><span>.finance</span></div></div>
    <div className="eyebrow">PRIVATE FINANCE OS</div>
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

function SettingsView({email,onSignOut}:{email:string;onSignOut:()=>void}) {
  const [password,setPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [message,setMessage] = useState("");
  const strong = password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./]/.test(password) && !email.toLowerCase().includes(password.toLowerCase());

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    if (!strong) return setMessage("Use 12+ characters with upper/lowercase, a number and a symbol. Do not reuse your email.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMessage(error.message);
    setPassword(""); setConfirm("");
    setMessage("Password updated successfully.");
  }

  return <div className="settings-stack">
    <div className="data-panel">
      <div className="data-panel-head"><div><h2>Workspace settings</h2><p>Private configuration for minimical.finance.</p></div></div>
      <div className="settings-row"><div className="settings-icon"><ShieldCheck size={17}/></div><div><b>Single-owner access</b><p>Finance data is restricted to the authenticated workspace owner.</p></div><span className="settings-good">Protected</span></div>
      <div className="settings-row"><div className="settings-icon"><FileText size={17}/></div><div><b>Signed-in account</b><p>{email}</p></div></div>
      <div className="settings-row"><div className="settings-icon"><Receipt size={17}/></div><div><b>Invoice PDFs</b><p>Generated server-side from the stored invoice record.</p></div><span className="settings-good">Live</span></div>
    </div>
    <div className="data-panel">
      <div className="data-panel-head"><div><h2>Change password</h2><p>Use a unique password; the old email-as-password test credential should not remain active.</p></div></div>
      <form className="password-settings" onSubmit={changePassword}>
        <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="12+ characters"/></label>
        <label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Repeat password"/></label>
        {message && <div className={message.includes("successfully") ? "auth-success" : "auth-message"}>{message}</div>}
        <button className="primary" type="submit" disabled={!strong || password !== confirm}>Update password</button>
      </form>
    </div>
    <div className="data-panel">
      <div className="data-panel-head"><div><h2>Session</h2><p>End the current authenticated session on this device.</p></div></div>
      <div className="settings-actions"><button className="secondary" onClick={onSignOut}><LogOut size={15}/>Sign out</button></div>
    </div>
  </div>;
}

function Overview({stats,invoices,onOpen}:{stats:{billed:number;collected:number;outstanding:number;rate:number};invoices:Invoice[];onOpen:(i:Invoice)=>void}) {
  const open = invoices.filter(i => paidTotal(i) < invoiceTotal(i)).sort((a,b) => (daysOverdue(b) - daysOverdue(a)) || ((invoiceTotal(b)-paidTotal(b))-(invoiceTotal(a)-paidTotal(a)))).slice(0,5);
  return <><section className="kpis">
    <Kpi label="Total billed" value={money(stats.billed)} note="Calculated from priced contents" icon={<IndianRupee size={16}/>}/>
    <Kpi label="Collected" value={money(stats.collected)} note="Recorded payments" icon={<Check size={16}/>}/>
    <Kpi label="Outstanding" value={money(stats.outstanding)} note={invoices.filter(i => paidTotal(i) < invoiceTotal(i)).length + " invoices with balance"} icon={<ArrowUpRight size={16}/>} accent/>
    <Kpi label="Collection rate" value={stats.rate + "%"} note="Collected ÷ billed" icon={<Sparkles size={16}/>}/>
  </section>
  <section className="section-head"><div><h2>Open balances</h2><p>Invoices requiring attention, ordered by current balance.</p></div></section>
  <div className="invoice-list">{open.length ? open.map(i => <InvoiceCard key={i.id} invoice={i} onOpen={() => onOpen(i)} onStatus={() => {}}/>) : <div className="empty-state">No open balances.</div>}</div>
  <section className="section-head dashboard-secondary"><div><h2>Recent invoices</h2><p>{invoices.length} records in the workspace.</p></div></section>
  <div className="invoice-list">{invoices.slice(0,5).map(i => <InvoiceCard key={i.id} invoice={i} onOpen={() => onOpen(i)} onStatus={() => {}}/>)}</div>
</>;
}

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

function ClientsView({invoices,onOpen}:{invoices:Invoice[];onOpen:(i:Invoice)=>void}) {
  const map = new Map<string,{name:string;projects:Set<string>;invoices:Invoice[];billed:number;paid:number}>();
  invoices.forEach(i=>{const key=i.clientId||i.client;const row=map.get(key)||{name:i.client,projects:new Set<string>(),invoices:[],billed:0,paid:0};row.projects.add(i.project);row.invoices.push(i);row.billed+=invoiceTotal(i);row.paid+=paidTotal(i);map.set(key,row);});
  return <div className="data-panel"><div className="data-panel-head"><div><h2>Clients</h2><p>{map.size} client records represented by invoices.</p></div></div><div className="client-grid">{Array.from(map.values()).map(c=><article className="client-card" key={c.name}><div className="client-avatar">{c.name.slice(0,1).toUpperCase()}</div><div><h3>{c.name}</h3><p>{c.projects.size} project{c.projects.size!==1?"s":""} · {c.invoices.length} invoice{c.invoices.length!==1?"s":""}</p></div><strong>{money(c.billed-c.paid)}</strong><small>outstanding</small><div className="client-invoices">{c.invoices.slice(0,3).map(i=><button key={i.id} onClick={()=>onOpen(i)}>#{i.number} · {money(invoiceTotal(i))}</button>)}</div></article>)}</div></div>;
}

function activityLabel(action:string) {
  return ({
    invoice_created: "Invoice created",
    invoice_updated: "Invoice updated",
    invoice_status_changed: "Status changed",
    payment_recorded: "Payment recorded",
  } as Record<string,string>)[action] ?? action.replaceAll("_"," ");
}

function Kpi({icon,label,value,note,accent}:{icon:React.ReactNode;label:string;value:string;note:string;accent?:boolean}) {
  return <div className={"kpi" + (accent ? " accent" : "")}><div className="kpi-icon">{icon}</div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-note">{note}</div></div>;
}

function InvoiceCard({invoice,onOpen,onStatus}:{invoice:Invoice;onOpen:()=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  const unpriced = invoice.contents.filter(c => !c.priced).length;
  const balance = Math.max(invoiceTotal(invoice) - paidTotal(invoice), 0);
  return <article className="invoice-card" onClick={onOpen}>
    <div className="invoice-main"><div className="invoice-id"><span>INV.</span><strong>{invoice.number}</strong></div><div><h3>{invoice.client}</h3><p>{invoice.project} · {new Date(invoice.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p></div></div>
    <div className="invoice-middle"><div className="content-preview">{invoice.contents.slice(0,3).map(c => <span key={c.id}>{c.title}</span>)}{invoice.contents.length > 3 && <span>+{invoice.contents.length - 3} more</span>}</div>{unpriced > 0 && <span className="warning-pill"><CircleAlert size={13}/>{unpriced} unpriced</span>}
    {daysOverdue(invoice) > 0 && <span className="warning-pill overdue-pill"><CircleAlert size={13}/>{daysOverdue(invoice)}d overdue</span>}{invoice.sourceTotal != null && invoice.sourceTotal !== invoiceTotal(invoice) && <span className="warning-pill"><CircleAlert size={13}/>source mismatch</span>}</div>
    <div className="invoice-right"><strong>{money(invoiceTotal(invoice))}</strong><span className={"balance " + (balance ? "open" : "clear")}>{balance ? money(balance) + " due" : "settled"}</span><button className={"status " + invoice.status} onClick={e => { e.stopPropagation(); onOpen(); }}>{statusLabel(invoice.status)}</button><ChevronRight size={17} className="chevron"/></div>
  </article>;
}

function InvoiceDrawer({invoice,onClose,onStatus,onSave,onPayment}:{invoice:Invoice;onClose:()=>void;onStatus:(i:Invoice,s:Status)=>void;onSave:(i:Invoice)=>void;onPayment:()=>void}) {
  const [draft,setDraft] = useState(invoice);
  useEffect(() => setDraft(invoice), [invoice.id]);
  const unpriced = draft.contents.filter(c => !c.priced).length;
  const patch = (id:string,p:Partial<Content>) => setDraft(d => ({...d,contents:d.contents.map(c => c.id === id ? {...c,...p,amount:p.amount ?? ((p.quantity ?? c.quantity) * (p.rate ?? c.rate ?? 0))} : c)}));
  const add = (kind:ContentKind = "service") => setDraft(d => ({...d,contents:[...d.contents,{id:crypto.randomUUID(),title:kind === "note" ? "Note" : "New content",kind,quantity:1,priced:kind === "note"}]}));
  const remove = (id:string) => setDraft(d => ({...d,contents:d.contents.filter(c => c.id !== id)}));
  return <div className="overlay" onMouseDown={onClose}><aside className="drawer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">INVOICE</div><h2>#{draft.number}</h2><p>{draft.client} · {draft.project}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="drawer-body">
      <div className="drawer-summary"><div><span>Total</span><strong>{money(invoiceTotal(draft))}</strong></div><div><span>Collected</span><strong>{money(paidTotal(draft))}</strong></div><div><span>Status</span><select className="status-select" value={draft.status} onChange={async e=>{const next=e.target.value as Status; setDraft(d=>({...d,status:next})); await onStatus({...draft,status:next},next)}}><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div></div>
      <div className="invoice-meta-grid">
        <label>Issue date<input type="date" value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label>
        <label>Due date<input type="date" value={draft.dueDate ?? ""} onChange={e=>setDraft(d=>({...d,dueDate:e.target.value || null}))}/></label>
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

function InvoiceComposer({initialNumber,onClose,onCreate}:{initialNumber:string;onClose:()=>void;onCreate:(d:{number:string;client:string;project:string;date:string;dueDate:string;contents:Content[]})=>void}) {
  const [number,setNumber] = useState(initialNumber);
  const [client,setClient] = useState("ELLE");
  const [project,setProject] = useState("Video Editing");
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [dueDate,setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0,10));
  const [contents,setContents] = useState<Content[]>([{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  const total = contents.reduce((s,c) => s + contentAmount(c), 0);
  const patch = (id:string,p:Partial<Content>) => setContents(v => v.map(c => c.id === id ? {...c,...p} : c));
  const add = () => setContents(v => [...v,{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">NEW INVOICE</div><h2>Create invoice</h2><p>Build it from the actual contents.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="composer-body"><div className="form-grid"><label>Invoice number<input value={number} onChange={e => setNumber(e.target.value)} placeholder="e.g. 196"/></label><label>Client<input value={client} onChange={e => setClient(e.target.value)}/></label><label>Project<input value={project} onChange={e => setProject(e.target.value)}/></label><label>Issue date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}/></label></div>
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Billable, adjustment and unpriced content can coexist.</p></div><button className="secondary" onClick={add}><Plus size={15}/>Add content</button></div>
        {contents.map((c,idx) => <div className="composer-row" key={c.id}><span>{idx + 1}</span><input value={c.title} onChange={e => patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input type="number" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})} placeholder="Qty"/><input type="number" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})} placeholder="Rate"/><b>{c.priced && c.rate ? money(contentAmount(c)) : "TBD"}</b></div>)}
      </div><div className="total-box"><span>Invoice total</span><strong>{money(total)}</strong></div>
    </div>
    <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!number || !contents.some(c => c.title.trim())} onClick={() => onCreate({number,client,project,date,dueDate,contents})}>Create draft</button></div>
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
