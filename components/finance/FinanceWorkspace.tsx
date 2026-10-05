"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ALL_ORGANIZATIONS_ID, type FinanceView } from "@/lib/finance/types";
import { ImportCenter } from "./ImportCenter";
import { FinanceShell } from "./FinanceShell";
import { FinanceCommandPalette } from "./FinanceCommandPalette";
import {
  AuthScreen,
  Overview,
  InvoiceView,
  PaymentsView,
  ClientsView,
  ProjectsView,
  ReportsView,
  DocumentsView,
  OrganizationMigrationView,
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
  const [commandOpen, setCommandOpen] = useState(false);
  const allOrganizations = organizationId === ALL_ORGANIZATIONS_ID;
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = !!target?.closest("input, textarea, select, [contenteditable='true']");
      if (!editing && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(v => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
        const urlMatchesActive = !urlWorkspace || urlWorkspace === ALL_ORGANIZATIONS_ID || activeRows.some(o => o.id === urlWorkspace);
        const resolvedStored = urlMatchesActive ? stored : (namespaced ?? legacy);
        const remembered = resolvedStored === ALL_ORGANIZATIONS_ID ? { id: ALL_ORGANIZATIONS_ID, name: "All organisations", status: "aggregate" } : activeRows.find(o => o.id === resolvedStored);
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

  useEffect(() => {
    if (!session || !workspaceReady || !organizationId) return;
    void loadInvoices(organizationId);
  }, [session?.user?.id, workspaceReady, organizationId]);

  useEffect(() => {
    const refreshOrganizations = () => {
      void supabase.from("organizations").select("*").order("status").order("name").then(({data}) => {
        const rows = (data || []) as OrganizationRecord[];
        setOrganizations(rows);
        if (organizationId && !rows.some(o => o.id === organizationId && !["dissolved","discontinued"].includes(String(o.status)))) {
          const fallback = rows.find(o => !["dissolved","discontinued"].includes(String(o.status)));
          if (fallback) selectOrganization(fallback.id);
        }
      });
    };
    window.addEventListener("finance:organization-updated", refreshOrganizations);
    return () => window.removeEventListener("finance:organization-updated", refreshOrganizations);
  }, [organizationId, workspaceStorageKey]);

  async function loadInvoices(activeOrganizationId = organizationId) {
    setLoading(true);
    const result = await listInvoices(activeOrganizationId);

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
    if (organizationId) {
      setOrganizations(rows =>
        rows.map(org =>
          org.id === organizationId
            ? { ...org, next_invoice_number: (org.next_invoice_number ?? 1) + 1 }
            : org,
        ),
      );
    }
    await loadInvoices(organizationId);
  }

  const activeOrganization = useMemo(
    () => organizationId === ALL_ORGANIZATIONS_ID
      ? { id: ALL_ORGANIZATIONS_ID, name: "All organisations", status: "aggregate" }
      : organizations.find(o => o.id === organizationId) ?? null,
    [organizations, organizationId]
  );

  const orgInvoices = useMemo(
    () => allOrganizations ? invoices : invoices.filter(i => i.organizationId === organizationId),
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

  const openInvoiceComposer = () => {
    if (!organizationId || allOrganizations) {
      setActionError("Select a specific organisation before creating an invoice.");
      return;
    }
    setActionError("");
    setComposer(true);
  };

  const navigateTo = (view: FinanceView) => {
    setActiveView(view);
    setSelectedClientId(null);
    setSelected(null);
    setPaymentFor(null);
    setComposer(false);
    setMobileMoreOpen(false);
    setCommandOpen(false);
    setQuery("");
    setStatus("all");
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (organizationId) params.set("organization", organizationId); else params.delete("organization");
      const queryString = params.toString();
      router.push(`/admin/${view}${queryString ? `?${queryString}` : ""}`, { scroll: false });
    }
  };

  const openClientComposer = () => {
    if (!organizationId || allOrganizations) {
      setActionError("Select a specific organisation before adding a client.");
      return;
    }
    navigateTo("clients");
    requestAnimationFrame(() => window.dispatchEvent(new Event("finance:new-client")));
  };

  const openProjectComposer = () => {
    if (!organizationId || allOrganizations) {
      setActionError("Select a specific organisation before adding a project.");
      return;
    }
    navigateTo("projects");
    requestAnimationFrame(() => window.dispatchEvent(new Event("finance:new-project")));
  };

  const selectOrganization = (id: string | null) => {
    if (!id) return;
    const workspace = id;
    setOrganizationId(id);
    setWorkspaceReady(true);
    setInvoices([]);
    setLoading(true);
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
      router.replace(`/admin/${activeView}?${params.toString()}`, { scroll: false });
      if (workspaceStorageKey !== WORKSPACE_KEY) {
        window.localStorage.removeItem(WORKSPACE_KEY);
      }
    }
  };


  if (!authReady) {
    return (
      <div className="auth-screen">
        <div className="workspace-loader" role="status" aria-live="polite"><div className="workspace-loader-head"><div className="loader-logo" aria-hidden="true">·</div><div><b>Preparing workspace</b><span>Checking your session</span></div></div><div className="loader-track"><i/></div><div className="loader-skeleton"><span/><span/><span/></div></div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  if (!organizationsReady) {
    return (
      <div className="auth-screen">
        <div className="workspace-loader" role="status" aria-live="polite"><div className="workspace-loader-head"><div className="loader-logo" aria-hidden="true">·</div><div><b>Loading organisations</b><span>Restoring your workspace</span></div></div><div className="loader-track"><i/></div><div className="loader-skeleton"><span/><span/><span/></div></div>
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
      actionError={actionError}
      clearError={() => setActionError("")}
      onSelectWorkspace={selectOrganization}
      organizations={organizations}
      onSignOut={() => { void supabase.auth.signOut(); }}
      mobileMoreOpen={mobileMoreOpen}
      setMobileMoreOpen={setMobileMoreOpen}
      overlays={
        <>
          <FinanceCommandPalette
            open={commandOpen}
            onClose={() => setCommandOpen(false)}
            onNavigate={navigateTo}
            onNewInvoice={openInvoiceComposer}
            onNewClient={openClientComposer}
            onNewProject={openProjectComposer}
          />
          {selected && (
            <InvoiceDrawer
              invoice={selected}
              onClose={() => setSelected(null)}
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
      {activeView === "overview" && (
        <Overview
          stats={stats}
          invoices={orgInvoices}
          organization={activeOrganization ?? { id: ALL_ORGANIZATIONS_ID, name: "All organisations", status: "aggregate" }}
          onOpen={setSelected}
          onNavigate={navigateTo}
          onNewInvoice={openInvoiceComposer}
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
          onNew={openInvoiceComposer}
          onPayments={() => navigateTo("payments")}
          onImport={() => navigateTo("imports")}
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
          onNew={openClientComposer}
        />
      )}
      {activeView === "projects" && <ProjectsView invoices={orgInvoices} organizationId={organizationId} onOpen={setSelected} onNew={openProjectComposer} />}
      {activeView === "reports" && <ReportsView invoices={orgInvoices} />}
      {activeView === "migrations" && (
        <OrganizationMigrationView
          invoices={orgInvoices}
          organizations={organizations}
          activeOrganizationId={allOrganizations ? null : organizationId}
        />
      )}
      {activeView === "documents" && (
        <DocumentsView organizationId={activeOrganization?.id === ALL_ORGANIZATIONS_ID ? null : activeOrganization?.id ?? null} />
      )}
      {activeView === "imports" && (
        <ImportCenter organizations={organizations} activeOrganizationId={allOrganizations ? null : organizationId} onComplete={() => { void loadInvoices(allOrganizations ? null : organizationId); }} />
      )}
      {activeView === "settings" && (
        <SettingsView
          email={session.user?.email ?? ""}
          activeOrganizationId={allOrganizations ? null : organizationId}
          onSignOut={() => { void supabase.auth.signOut(); }}
        />
      )}
    </FinanceShell>
  );
}