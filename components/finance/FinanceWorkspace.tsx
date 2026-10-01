"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createInvoice as createInvoiceRecord,
  listInvoices,
  recordPayment as recordPaymentRecord,
  saveInvoice as saveInvoiceRecord,
  setInvoiceStatus,
} from "@/lib/finance/repository";
import {
  calculateStats,
} from "@/lib/finance/domain";
import type { Content, Invoice, PaymentMethod, Status } from "@/lib/finance/domain";
import type { FinanceView } from "@/lib/finance/types";
import { FinanceShell } from "./FinanceShell";
import {
  AuthScreen,
  OrganizationWelcome,
  Overview,
  InvoiceView,
  PaymentsView,
  ClientsView,
  ProjectsView,
  ReportsView,
  SettingsView,
  InvoiceDrawer,
  PaymentComposer,
  InvoiceComposer,
} from "./FinanceViews";

const supabase = createClient();
const WORKSPACE_KEY = "finance.organizationId";

export type { FinanceView };

type OrganizationRecord = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_path?: string | null;
  accent_hex?: string | null;
  status?: string | null;
  next_invoice_number?: number | null;
  invoice_prefix?: string | null;
};

type SessionState = {
  user?: { id?: string; email?: string | null } | null;
};

export default function FinanceWorkspace({ initialView = "overview" }: { initialView?: FinanceView }) {
  const [session, setSession] = useState<SessionState | null>(null);
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
  const [organizations, setOrganizations] = useState<OrganizationRecord[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [organizationsReady, setOrganizationsReady] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session as SessionState | null);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next as SessionState | null);
      setAuthReady(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const workspaceStorageKey = session?.user?.id
    ? `${WORKSPACE_KEY}:${session.user.id}`
    : WORKSPACE_KEY;

  useEffect(() => {
    if (!session) {
      setOrganizationsReady(false);
      setWorkspaceReady(false);
      setOrganizationId(null);
      if (authReady) setLoading(false);
      return;
    }

    setOrganizationsReady(false);
    setWorkspaceReady(false);
    loadInvoices();

    supabase
      .from("organizations")
      .select("*")
      .order("status")
      .order("name")
      .then(({ data }) => {
        const rows = (data || []) as OrganizationRecord[];
        const activeRows = rows.filter(o => !["dissolved", "discontinued"].includes(String(o.status)));

        setOrganizations(rows);
        setOrganizationsReady(true);

        const urlWorkspace = typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("organization")
          : null;
        const namespaced = typeof window !== "undefined"
          ? window.localStorage.getItem(workspaceStorageKey)
          : null;
        const legacy = typeof window !== "undefined"
          ? window.localStorage.getItem(WORKSPACE_KEY)
          : null;
        const stored = urlWorkspace ?? namespaced ?? legacy;
        const urlMatchesActive = !urlWorkspace || activeRows.some(o => o.id === urlWorkspace);
        const resolvedStored = urlMatchesActive ? stored : (namespaced ?? legacy);
        const remembered = activeRows.find(o => o.id === resolvedStored);
        if (remembered) {
          setOrganizationId(remembered.id);
          setWorkspaceReady(true);
          if (legacy && !namespaced && session.user?.id) window.localStorage.setItem(workspaceStorageKey, remembered.id);
          return;
        }

        const firstActive = activeRows[0] ?? null;
        setOrganizationId(firstActive?.id ?? null);
        setWorkspaceReady(true);
        if (firstActive) {
          window.localStorage.setItem(workspaceStorageKey, firstActive.id);
        }

      });

    return () => {
      // The Supabase request is intentionally allowed to settle; state writes are guarded by the
      // current workspace/session lifecycle in the next effect pass.
    };
  }, [session?.user?.id, authReady, workspaceStorageKey]);

  useEffect(() => {
    if (!session || !organizationsReady || !workspaceReady) return;
    const nextView = initialView;
    if (nextView !== activeView) setActiveView(nextView);
  }, [initialView, session, organizationsReady, workspaceReady]);

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
    number: string;
    client: string;
    project: string;
    date: string;
    dueDate: string;
    organizationId?: string | null;
    contents: Content[];
  }) {
    const result = await createInvoiceRecord(draft);
    if (result.error) return setActionError(result.error);
    setComposer(false);
    await loadInvoices();
  }

  const activeOrganization = useMemo(
    () => organizations.find(o => o.id === organizationId) ?? null,
    [organizations, organizationId]
  );

  const orgInvoices = useMemo(
    () => organizationId ? invoices.filter(i => i.organizationId === organizationId) : invoices,
    [invoices, organizationId]
  );

  const nextInvoiceNumber = useMemo(() => {
    if (activeOrganization?.next_invoice_number) {
      return String(activeOrganization.invoice_prefix || "") + String(activeOrganization.next_invoice_number);
    }
    const numeric = orgInvoices
      .map(i => Number.parseInt(String(i.number).replace(/\D/g, ""), 10))
      .filter(Number.isFinite);
    return numeric.length ? String(Math.max(...numeric) + 1) : "1";
  }, [activeOrganization, orgInvoices]);

  const filtered = useMemo(() => orgInvoices.filter(i => {
    const text = [i.number, i.client, i.project, i.notes, ...i.contents.map(c => c.title)]
      .join(" ")
      .toLowerCase();
    return (status === "all" || i.status === status) && text.includes(query.toLowerCase());
  }), [orgInvoices, query, status]);

  const stats = useMemo(() => calculateStats(orgInvoices), [orgInvoices]);

  const navigateTo = (view: FinanceView) => {
    setActiveView(view);
    setSelectedClientId(null);
    setSelected(null);
    setPaymentFor(null);
    setComposer(false);
    setMobileMoreOpen(false);
    setQuery("");
    setStatus("all");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (organizationId) params.set("organization", organizationId); else params.delete("organization");
      const queryString = params.toString();
      router.push(`/${view}${queryString ? `?${queryString}` : ""}`, { scroll: false });
    }
  };

  const selectOrganization = (id: string | null) => {
    if (!id) return;
    const workspace = id;
    setOrganizationId(id);
    setWorkspaceReady(true);
    setMobileMoreOpen(false);
    setSelectedClientId(null);
    setSelected(null);
    setPaymentFor(null);
    setComposer(false);
    setQuery("");
    setStatus("all");

    if (typeof window !== "undefined") {
      window.localStorage.setItem(workspaceStorageKey, workspace);
      const params = new URLSearchParams(window.location.search);
      params.set("organization", workspace);
      router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
      if (workspaceStorageKey !== WORKSPACE_KEY) {
        window.localStorage.removeItem(WORKSPACE_KEY);
      }
    }
  };


  if (!authReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="loading-mark"><RefreshCw size={18} /></div>
          <p>Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!organizationsReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="loading-mark"><RefreshCw size={18} /></div>
          <p>Loading organisations…</p>
        </div>
      </div>
    );
  }

  return (
    <FinanceShell
      activeView={activeView}
      onNavigate={navigateTo}
      activeOrganization={activeOrganization}
      invoiceCount={orgInvoices.length}
      session={session}
      query={query}
      setQuery={setQuery}
      actionError={actionError}
      clearError={() => setActionError("")}
      onRefresh={() => { void loadInvoices(); }}
      onSelectWorkspace={selectOrganization}
      organizations={organizations}
      onSignOut={() => { void supabase.auth.signOut(); }}
      onNewInvoice={() => setComposer(true)}
      onNewClient={() => window.dispatchEvent(new Event("finance:new-client"))}
      onNewProject={() => window.dispatchEvent(new Event("finance:new-project"))}
      mobileMoreOpen={mobileMoreOpen}
      setMobileMoreOpen={setMobileMoreOpen}
      overlays={
        <>
          {selected && (
            <InvoiceDrawer
              invoice={selected}
              onClose={() => setSelected(null)}
              onStatus={markStatus}
              onSave={saveInvoice}
              onPayment={() => setPaymentFor(selected)}
            />
          )}
          {paymentFor && (
            <PaymentComposer
              invoice={paymentFor}
              onClose={() => setPaymentFor(null)}
              onCreate={recordPayment}
            />
          )}
          {composer && (
            <InvoiceComposer
              initialNumber={nextInvoiceNumber}
              initialOrganizationId={organizationId}
              onClose={() => setComposer(false)}
              onCreate={createInvoice}
            />
          )}
        </>
      }
    >
      {activeView === "overview" && activeOrganization && (
        <Overview
          stats={stats}
          invoices={orgInvoices}
          organization={activeOrganization}
          onOpen={setSelected}
          onNavigate={navigateTo}
        />
      )}
      {activeView === "invoices" && (
        <InvoiceView
          filtered={filtered}
          query={query}
          setQuery={setQuery}
          status={status}
          setStatus={setStatus}
          loading={loading}
          onOpen={setSelected}
          onStatus={markStatus}
        />
      )}
      {activeView === "payments" && <PaymentsView invoices={orgInvoices} onOpenPayment={setPaymentFor} />}
      {activeView === "clients" && (
        <ClientsView
          invoices={orgInvoices}
          organizationId={organizationId}
          onOpen={setSelected}
          selectedClientId={selectedClientId}
          setSelectedClientId={setSelectedClientId}
        />
      )}
      {activeView === "projects" && <ProjectsView invoices={orgInvoices} organizationId={organizationId} onOpen={setSelected} />}
      {activeView === "reports" && <ReportsView invoices={orgInvoices} />}
      {activeView === "settings" && (
        <SettingsView
          email={session.user?.email ?? ""}
          activeOrganizationId={organizationId}
          onSignOut={() => { void supabase.auth.signOut(); }}
        />
      )}
    </FinanceShell>
  );
}
