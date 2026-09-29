"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Bell, Check, ChevronRight, CircleAlert, FileText, Filter,
  IndianRupee, LayoutDashboard, LogOut, MoreHorizontal, Plus, Receipt,
  Search, Settings2, Sparkles, WalletCards, X
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "draft" | "sent" | "partially_paid" | "paid" | "void";
type ContentKind = "service" | "adjustment" | "note";
type Content = {
  id: string;
  title: string;
  kind: ContentKind;
  quantity: number;
  rate?: number | null;
  amount?: number | null;
  priced: boolean;
  note?: string | null;
};
type Payment = { id: string; amount: number; payment_date: string; method: string };
type Invoice = {
  id: string;
  number: string;
  client: string;
  project: string;
  clientId?: string | null;
  projectId?: string | null;
  date: string;
  dueDate?: string | null;
  status: Status;
  sourceTotal?: number | null;
  contents: Content[];
  payments: Payment[];
  adjustment?: string | null;
  notes?: string | null;
};

const supabase = createClient();

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n || 0);

const contentAmount = (c: Content) =>
  c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : 0;

const invoiceTotal = (i: Invoice) =>
  i.contents.reduce((sum, c) => sum + contentAmount(c), 0);

const paidTotal = (i: Invoice) =>
  i.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

const statusLabel = (s: Status) =>
  ({ draft: "Draft", sent: "Sent", partially_paid: "Partially paid", paid: "Paid", void: "Void" })[s];

function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    number: row.invoice_number,
    client: row.clients?.name ?? "No client",
    project: row.projects?.name ?? "No project",
    clientId: row.client_id,
    projectId: row.project_id,
    date: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    sourceTotal: row.source_total,
    adjustment: row.adjustment_note,
    notes: row.notes,
    contents: (row.invoice_contents ?? []).sort((a: any, b: any) => a.position - b.position).map((c: any) => ({
      id: c.id, title: c.title, kind: c.kind, quantity: Number(c.quantity ?? 1),
      rate: c.rate == null ? null : Number(c.rate),
      amount: c.amount == null ? null : Number(c.amount),
      priced: c.priced, note: c.note,
    })),
    payments: (row.payments ?? []).map((p: any) => ({
      id: p.id, amount: Number(p.amount), payment_date: p.payment_date, method: p.method,
    })),
  };
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [composer, setComposer] = useState(false);

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
      .select("*, clients(name), projects(name), invoice_contents(*), payments(*)")
      .order("issue_date", { ascending: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    setInvoices((data ?? []).map(mapInvoice));
    setLoading(false);
  }

  async function markStatus(invoice: Invoice, next: Status) {
    const total = invoiceTotal(invoice);
    const paid = paidTotal(invoice);
    const { error } = await supabase.from("invoices").update({ status: next, updated_at: new Date().toISOString() }).eq("id", invoice.id);
    if (error) return alert(error.message);

    if (next === "paid" && paid < total) {
      await supabase.from("payments").insert({
        invoice_id: invoice.id,
        amount: total - paid,
        payment_date: new Date().toISOString().slice(0, 10),
        method: "other",
        notes: "Recorded when invoice was marked paid in minimical.finance.",
      });
    }
    await loadInvoices();
    setSelected(v => v?.id === invoice.id ? { ...v, status: next } : v);
  }

  async function saveInvoice(next: Invoice) {
    const { error } = await supabase.from("invoices").update({
      notes: next.notes ?? null,
      adjustment_note: next.adjustment ?? null,
      status: next.status,
      updated_at: new Date().toISOString(),
    }).eq("id", next.id);
    if (error) return alert(error.message);

    await supabase.from("invoice_contents").delete().eq("invoice_id", next.id);
    const rows = next.contents.map((c, index) => ({
      invoice_id: next.id, position: index, kind: c.kind, title: c.title,
      quantity: c.quantity || 1, rate: c.rate ?? null,
      amount: c.priced ? contentAmount(c) : null, priced: c.priced, note: c.note ?? null,
    }));
    if (rows.length) await supabase.from("invoice_contents").insert(rows);
    await loadInvoices();
    setSelected(null);
  }

  async function createInvoice(draft: {
    number: string; client: string; project: string; date: string; contents: Content[];
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
      invoice_number: draft.number, client_id: client.id, project_id: project.id,
      issue_date: draft.date, due_date: new Date(Date.parse(draft.date) + 30 * 86400000).toISOString().slice(0, 10),
      status: "draft", source_total: draft.contents.reduce((s, c) => s + contentAmount(c), 0),
    }).select("id").single();
    if (result.error) return alert(result.error.message);

    const rows = draft.contents.map((c, index) => ({
      invoice_id: result.data.id, position: index, kind: c.kind, title: c.title,
      quantity: c.quantity || 1, rate: c.rate ?? null, amount: c.priced ? contentAmount(c) : null,
      priced: c.priced, note: c.note ?? null,
    }));
    if (rows.length) await supabase.from("invoice_contents").insert(rows);
    setComposer(false);
    await loadInvoices();
  }

  const filtered = useMemo(() => invoices.filter(i => {
    const text = [i.number, i.client, i.project, i.notes, ...i.contents.map(c => c.title)].join(" ").toLowerCase();
    return (status === "all" || i.status === status) && text.includes(query.toLowerCase());
  }), [invoices, query, status]);

  const stats = useMemo(() => {
    const billed = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
    const collected = invoices.reduce((s, i) => s + paidTotal(i), 0);
    return { billed, collected, outstanding: Math.max(billed - collected, 0), rate: billed ? Math.round(collected / billed * 1000) / 10 : 0 };
  }, [invoices]);

  if (!authReady) return <div className="auth-screen"><div className="auth-card">Loading minimical.finance…</div></div>;
  if (!session) return <AuthScreen />;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">m</div><div><strong>minimical</strong><span>.finance</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          <button className="nav-item active"><LayoutDashboard size={17}/>Overview</button>
          <button className="nav-item"><Receipt size={17}/>Invoices <span>{invoices.length}</span></button>
          <button className="nav-item"><WalletCards size={17}/>Payments</button>
          <button className="nav-item"><FileText size={17}/>Clients</button>
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item"><Settings2 size={17}/>Settings</button>
          <button className="nav-item" onClick={() => supabase.auth.signOut()}><LogOut size={17}/>Sign out</button>
          <div className="profile"><div className="avatar">M</div><div><b>Finance workspace</b><small>Authenticated</small></div><MoreHorizontal size={16}/></div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><div className="eyebrow">FINANCE / OVERVIEW</div><h1>Money, without the spreadsheet.</h1><p>Your invoices, contents and collections in one source of truth.</p></div>
          <div className="top-actions"><button className="icon-button"><Bell size={18}/></button><button className="primary" onClick={() => setComposer(true)}><Plus size={17}/>New invoice</button></div>
        </header>

        <section className="kpis">
          <Kpi label="Total billed" value={money(stats.billed)} note="Calculated from priced contents" icon={<IndianRupee size={16}/>}/>
          <Kpi label="Collected" value={money(stats.collected)} note="Recorded payments" icon={<Check size={16}/>}/>
          <Kpi label="Outstanding" value={money(stats.outstanding)} note={invoices.filter(i => paidTotal(i) < invoiceTotal(i)).length + " invoices with balance"} icon={<ArrowUpRight size={16}/>} accent/>
          <Kpi label="Collection rate" value={stats.rate + "%"} note="Collected ÷ billed" icon={<Sparkles size={16}/>}/>
        </section>

        <section className="section-head">
          <div><h2>Invoices</h2><p>{filtered.length} records · {filtered.reduce((s, i) => s + i.contents.length, 0)} contents</p></div>
          <div className="filters">
            <div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search invoices, clients, contents..."/></div>
            <div className="filter"><Filter size={15}/><select value={status} onChange={e => setStatus(e.target.value as "all" | Status)}><option value="all">All</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="void">Void</option></select></div>
          </div>
        </section>

        {loading ? <div className="empty-state">Loading finance data…</div> :
          <div className="invoice-list">{filtered.map(i => <InvoiceCard key={i.id} invoice={i} onOpen={() => setSelected(i)} onStatus={markStatus}/>)}</div>}
      </section>

      {selected && <InvoiceDrawer invoice={selected} onClose={() => setSelected(null)} onStatus={markStatus} onSave={saveInvoice}/>}
      {composer && <InvoiceComposer onClose={() => setComposer(false)} onCreate={createInvoice}/>}
    </main>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Account created. Check your email if confirmation is enabled, then sign in.");
  }

  return <div className="auth-screen"><div className="auth-card">
    <div className="brand"><div className="brand-mark">m</div><div><strong>minimical</strong><span>.finance</span></div></div>
    <div className="eyebrow">PRIVATE FINANCE OS</div><h1>{mode === "signin" ? "Sign in." : "Create access."}</h1>
    <p>Internal invoicing, collections and financial records for the studio.</p>
    <form onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"}/></label>
      {message && <div className="auth-message">{message}</div>}
      <button className="primary auth-submit" disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Need an account? Create one" : "Already have access? Sign in"}</button>
  </div></div>;
}

function Kpi({icon,label,value,note,accent}:{icon:React.ReactNode;label:string;value:string;note:string;accent?:boolean}) {
  return <div className={"kpi" + (accent ? " accent" : "")}><div className="kpi-icon">{icon}</div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-note">{note}</div></div>;
}

function InvoiceCard({invoice,onOpen,onStatus}:{invoice:Invoice;onOpen:()=>void;onStatus:(i:Invoice,s:Status)=>void}) {
  const unpriced = invoice.contents.filter(c => !c.priced).length;
  const balance = Math.max(invoiceTotal(invoice) - paidTotal(invoice), 0);
  return <article className="invoice-card" onClick={onOpen}>
    <div className="invoice-main"><div className="invoice-id"><span>INV.</span><strong>{invoice.number}</strong></div><div><h3>{invoice.client}</h3><p>{invoice.project} · {new Date(invoice.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</p></div></div>
    <div className="invoice-middle"><div className="content-preview">{invoice.contents.slice(0,3).map(c => <span key={c.id}>{c.title}</span>)}{invoice.contents.length > 3 && <span>+{invoice.contents.length - 3} more</span>}</div>{unpriced > 0 && <span className="warning-pill"><CircleAlert size={13}/>{unpriced} unpriced</span>}{invoice.sourceTotal != null && invoice.sourceTotal !== invoiceTotal(invoice) && <span className="warning-pill"><CircleAlert size={13}/>source mismatch</span>}</div>
    <div className="invoice-right"><strong>{money(invoiceTotal(invoice))}</strong><span className={"balance " + (balance ? "open" : "clear")}>{balance ? money(balance) + " due" : "settled"}</span><button className={"status " + invoice.status} onClick={e => { e.stopPropagation(); onStatus(invoice, invoice.status === "paid" ? "sent" : "paid"); }}>{statusLabel(invoice.status)}</button><ChevronRight size={17} className="chevron"/></div>
  </article>;
}

function InvoiceDrawer({invoice,onClose,onStatus,onSave}:{invoice:Invoice;onClose:()=>void;onStatus:(i:Invoice,s:Status)=>void;onSave:(i:Invoice)=>void}) {
  const [draft,setDraft] = useState(invoice);
  const unpriced = draft.contents.filter(c => !c.priced).length;
  const patch = (id:string,p:Partial<Content>) => setDraft(d => ({...d,contents:d.contents.map(c => c.id === id ? {...c,...p,amount:p.amount ?? ((p.quantity ?? c.quantity) * (p.rate ?? c.rate ?? 0))} : c)}));
  const add = (kind:ContentKind = "service") => setDraft(d => ({...d,contents:[...d.contents,{id:crypto.randomUUID(),title:kind === "note" ? "Note" : "New content",kind,quantity:1,priced:kind === "note"}]}));
  const remove = (id:string) => setDraft(d => ({...d,contents:d.contents.filter(c => c.id !== id)}));
  return <div className="overlay" onMouseDown={onClose}><aside className="drawer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">INVOICE</div><h2>#{draft.number}</h2><p>{draft.client} · {draft.project}</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="drawer-body">
      <div className="drawer-summary"><div><span>Total</span><strong>{money(invoiceTotal(draft))}</strong></div><div><span>Collected</span><strong>{money(paidTotal(draft))}</strong></div><div><span>Status</span><button className={"status " + draft.status} onClick={() => onStatus(draft, draft.status === "paid" ? "sent" : "paid")}>{statusLabel(draft.status)}</button></div></div>
      {unpriced > 0 && <div className="integrity warning"><CircleAlert size={17}/><div><b>{unpriced} content item{unpriced > 1 ? "s" : ""} still unpriced</b><span>Visible and retained, but excluded from the financial total until priced.</span></div></div>}
      {draft.sourceTotal != null && draft.sourceTotal !== invoiceTotal(draft) && <div className="integrity warning"><CircleAlert size={17}/><div><b>Source total differs from calculated total</b><span>Recorded source total: {money(draft.sourceTotal)} · calculated from contents: {money(invoiceTotal(draft))}</span></div></div>}
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Everything being billed on this invoice.</p></div><button className="secondary" onClick={() => add()}><Plus size={15}/>Add content</button></div>
        <div className="content-table">{draft.contents.map((c,idx) => <div className="content-row" key={c.id}>
          <div className="row-index">{String(idx + 1).padStart(2,"0")}</div><input className="content-title" value={c.title} onChange={e => patch(c.id,{title:e.target.value})}/><select value={c.kind} onChange={e => patch(c.id,{kind:e.target.value as ContentKind})}><option value="service">Service</option><option value="adjustment">Adjustment</option><option value="note">Note</option></select><input className="number-input" type="number" placeholder="Qty" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})}/><input className="number-input" type="number" placeholder="Rate" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})}/><div className={"row-amount" + (!c.priced ? " muted" : "")}>{c.priced ? money(contentAmount(c)) : "TBD"}</div><button className="tiny-delete" onClick={() => remove(c.id)}><X size={14}/></button>
        </div>)}</div>
        <div className="add-content-menu"><button onClick={() => add("service")}><Plus size={14}/>Service / deliverable</button><button onClick={() => add("adjustment")}><Plus size={14}/>Adjustment</button><button onClick={() => add("note")}><Plus size={14}/>Note / internal line</button></div>
      </div>
      {draft.adjustment && <div className="integrity"><CircleAlert size={17}/><div><b>Adjustment context</b><span>{draft.adjustment}</span></div></div>}
      <div className="block notes-block"><label>Invoice notes</label><textarea value={draft.notes ?? ""} onChange={e => setDraft(d => ({...d,notes:e.target.value}))} placeholder="Add context, payment terms, client notes..."/></div>
    </div>
    <div className="drawer-foot"><button className="secondary" onClick={() => window.print()}>Print / PDF</button><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave(draft)}><Check size={16}/>Save changes</button></div>
  </aside></div>;
}

function InvoiceComposer({onClose,onCreate}:{onClose:()=>void;onCreate:(d:{number:string;client:string;project:string;date:string;contents:Content[]})=>void}) {
  const [number,setNumber] = useState("");
  const [client,setClient] = useState("Elle India");
  const [project,setProject] = useState("Video Editing");
  const [date,setDate] = useState(new Date().toISOString().slice(0,10));
  const [contents,setContents] = useState<Content[]>([{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  const total = contents.reduce((s,c) => s + contentAmount(c), 0);
  const patch = (id:string,p:Partial<Content>) => setContents(v => v.map(c => c.id === id ? {...c,...p} : c));
  const add = () => setContents(v => [...v,{id:crypto.randomUUID(),title:"",kind:"service",quantity:1,priced:true}]);
  return <div className="overlay" onMouseDown={onClose}><div className="composer" onMouseDown={e => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">NEW INVOICE</div><h2>Create invoice</h2><p>Build it from the actual contents.</p></div><button className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="composer-body"><div className="form-grid"><label>Invoice number<input value={number} onChange={e => setNumber(e.target.value)} placeholder="e.g. 196"/></label><label>Client<input value={client} onChange={e => setClient(e.target.value)}/></label><label>Project<input value={project} onChange={e => setProject(e.target.value)}/></label><label>Issue date<input type="date" value={date} onChange={e => setDate(e.target.value)}/></label></div>
      <div className="block"><div className="block-head"><div><h3>Contents</h3><p>Billable, adjustment and unpriced content can coexist.</p></div><button className="secondary" onClick={add}><Plus size={15}/>Add content</button></div>
        {contents.map((c,idx) => <div className="composer-row" key={c.id}><span>{idx + 1}</span><input value={c.title} onChange={e => patch(c.id,{title:e.target.value})} placeholder="Content / deliverable name"/><input type="number" value={c.quantity ?? ""} onChange={e => patch(c.id,{quantity:Number(e.target.value) || 1})} placeholder="Qty"/><input type="number" value={c.rate ?? ""} onChange={e => patch(c.id,{rate:e.target.value ? Number(e.target.value) : null,priced:!!e.target.value})} placeholder="Rate"/><b>{c.priced && c.rate ? money(contentAmount(c)) : "TBD"}</b></div>)}
      </div><div className="total-box"><span>Invoice total</span><strong>{money(total)}</strong></div>
    </div>
    <div className="drawer-foot"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!number || !contents.some(c => c.title.trim())} onClick={() => onCreate({number,client,project,date,contents})}>Create draft</button></div>
  </div></div>;
}
