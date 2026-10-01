"use client";

import type { ReactNode, CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, Check, ChevronDown, CircleAlert, FileText, FolderKanban, LayoutDashboard, LogOut,
  MoreHorizontal, Plus, Receipt, RefreshCw, Search, Settings2, WalletCards, X
} from "lucide-react";
import type { FinanceView } from "@/lib/finance/types";

type WorkspaceOrganization = {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  logo_path?: string | null;
  accent_hex?: string | null;
  status?: string | null;
};

type WorkspaceSession = { user?: { email?: string | null } | null };

const navigation: Array<[FinanceView, typeof LayoutDashboard, string, string]> = [
  ["overview", LayoutDashboard, "Overview", "/overview"],
  ["invoices", Receipt, "Invoices", "/invoices"],
  ["payments", WalletCards, "Payments", "/payments"],
  ["clients", FileText, "Clients", "/clients"],
  ["projects", FolderKanban, "Projects", "/projects"],
  ["reports", BarChart3, "Reports", "/reports"],
  ["settings", Settings2, "Settings", "/settings"],
];

const pageLabel: Record<FinanceView, string> = {
  overview: "Overview", invoices: "Invoices", payments: "Payments", clients: "Clients",
  projects: "Projects", reports: "Reports", settings: "Settings",
};

export function FinanceShell({
  activeView, activeOrganization, invoiceCount, session, query, setQuery, actionError, clearError,
  onRefresh, onSelectWorkspace, organizations, onSignOut, onNewInvoice, onNewClient, onNewProject,
  mobileMoreOpen, setMobileMoreOpen, children, overlays,
}: {
  activeView: FinanceView; activeOrganization: WorkspaceOrganization | null; invoiceCount: number;
  session: WorkspaceSession; query: string; setQuery: (value: string) => void; actionError: string;
  clearError: () => void; onRefresh: () => void; onSelectWorkspace: (id: string | null) => void;
  organizations: WorkspaceOrganization[]; onSignOut: () => void; onNewInvoice: () => void;
  onNewClient: () => void; onNewProject: () => void; mobileMoreOpen: boolean;
  setMobileMoreOpen: (open: boolean) => void; children: ReactNode; overlays?: ReactNode;
}) {
  const router = useRouter();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);

  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setWorkspaceMenuOpen(false);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!(target instanceof Element) || !target.closest(".workspace-switcher-wrap")) setWorkspaceMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onPointerDown); };
  }, [workspaceMenuOpen]);

  const secondaryNavigation = navigation.filter(([key]) => !["overview", "invoices", "payments", "clients"].includes(key));
  const routeFor = (path: string) => `${path}?organization=${encodeURIComponent(activeOrganization?.id || "all")}`;
  const activeOrganizations = organizations.filter(o => !["dissolved", "discontinued"].includes(String(o.status)));

  const workspaceMark = (org: WorkspaceOrganization | null) => org?.logo_path
    ? <img src={org.logo_path} alt="" />
    : String(org?.name || "A").slice(0, 1).toUpperCase();

  return (
    <main className="shell" style={{ "--org-accent": activeOrganization?.accent_hex || "#8b5cf6" } as CSSProperties}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span className="brand-glyph">m</span></div>
          <div className="brand-copy"><strong>MINIMICAL</strong></div>
        </div>

        <nav>
          {navigation.map(([key, Icon, label, path]) => (
            <button key={key} className={"nav-item " + (activeView === key ? "active" : "")} aria-current={activeView === key ? "page" : undefined} onClick={() => router.push(routeFor(path))}>
              <Icon size={17} /><span>{label}</span>{key === "invoices" && invoiceCount > 0 && <em>{invoiceCount}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={onSignOut}><LogOut size={17} /><span>Sign out</span></button>
          <div className="profile"><div className="avatar">{String(session.user?.email || "A").slice(0, 1).toUpperCase()}</div><div><b>Account</b><small>{session.user?.email || "Authenticated"}</small></div></div>
        </div>
      </aside>

      <section className="content">
        {actionError && <div className="global-error" role="alert"><CircleAlert size={15}/><span>{actionError}</span><button onClick={clearError} aria-label="Dismiss error"><X size={14}/></button></div>}

        <header className="topbar">
          <div className="topbar-left">
            <div className="workspace-switcher-wrap">
              <button className="top-workspace-switcher" onClick={() => setWorkspaceMenuOpen(v => !v)} aria-label="Switch organisation" aria-expanded={workspaceMenuOpen} aria-haspopup="listbox">
                <span className="top-workspace-mark">{workspaceMark(activeOrganization)}</span>
                <strong>{activeOrganization?.name || "All organisations"}</strong>
                <ChevronDown size={13} className={workspaceMenuOpen ? "workspace-chevron-open" : ""}/>
              </button>
              {workspaceMenuOpen && <div className="workspace-switcher-menu" role="listbox" aria-label="Organisations">
                <button className={!activeOrganization ? "selected" : ""} role="option" aria-selected={!activeOrganization} onClick={() => { onSelectWorkspace(null); setWorkspaceMenuOpen(false); }}>
                  <span className="workspace-option-mark">A</span><strong>All organisations</strong>{!activeOrganization && <Check size={13} className="workspace-check"/>}
                </button>
                {activeOrganizations.map(org => <button key={org.id} className={activeOrganization?.id === org.id ? "selected" : ""} role="option" aria-selected={activeOrganization?.id === org.id} onClick={() => { onSelectWorkspace(org.id); setWorkspaceMenuOpen(false); }}>
                  <span className="workspace-option-mark">{workspaceMark(org)}</span><strong>{org.name || "Organisation"}</strong>{activeOrganization?.id === org.id && <Check size={13} className="workspace-check"/>}
                </button>)}
              </div>}
            </div>
            <span className="topbar-divider" />
            <h1>{pageLabel[activeView]}</h1>
          </div>

          <div className="topbar-tools">
            <label className="global-search"><Search size={14}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" aria-label="Search workspace"/></label>
            <button className="icon-button" title="Refresh data" onClick={onRefresh} aria-label="Refresh data"><RefreshCw size={16}/></button>
            {(activeView === "overview" || activeView === "invoices") && activeOrganization && <button className="primary compact-action" onClick={onNewInvoice}><Plus size={16}/><span>Invoice</span></button>}
            {activeView === "clients" && activeOrganization && <button className="primary compact-action" onClick={onNewClient}><Plus size={16}/><span>Client</span></button>}
            {activeView === "projects" && activeOrganization && <button className="primary compact-action" onClick={onNewProject}><Plus size={16}/><span>Project</span></button>}
          </div>
        </header>

        {children}
      </section>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.filter(([key]) => ["overview", "invoices", "payments", "clients"].includes(key)).map(([key, Icon, label, path]) => <button key={key} className={activeView === key ? "active" : ""} onClick={() => { setMobileMoreOpen(false); router.push(routeFor(path)); }}><Icon size={17}/><span>{label}</span></button>)}
        <button className={mobileMoreOpen || !["overview", "invoices", "payments", "clients"].includes(activeView) ? "active" : ""} onClick={() => setMobileMoreOpen(!mobileMoreOpen)} aria-expanded={mobileMoreOpen}><MoreHorizontal size={17}/><span>More</span></button>
      </nav>

      {mobileMoreOpen && <div className="mobile-more-sheet" role="dialog" aria-label="More workspace sections" onMouseDown={() => setMobileMoreOpen(false)}><div className="mobile-more-panel" onMouseDown={event => event.stopPropagation()}>{secondaryNavigation.map(([key, Icon, label, path]) => <button key={key} className={activeView === key ? "active" : ""} onClick={() => { setMobileMoreOpen(false); router.push(routeFor(path)); }}><Icon size={17}/><span>{label}</span></button>)}</div></div>}
      {overlays}
    </main>
  );
}
