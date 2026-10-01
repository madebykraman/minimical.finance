"use client";

import type { ReactNode, CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3, ChevronRight, CircleAlert, FileText, FolderKanban, LayoutDashboard, LogOut,
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

type WorkspaceSession = {
  user?: { email?: string | null } | null;
};

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
  overview: "Overview",
  invoices: "Invoices",
  payments: "Payments",
  clients: "Clients",
  projects: "Projects",
  reports: "Reports",
  settings: "Settings",
};

export function FinanceShell({
  activeView,
  activeOrganization,
  invoiceCount,
  session,
  query,
  setQuery,
  actionError,
  clearError,
  onRefresh,
  onChangeWorkspace,
  onSelectWorkspace,
  organizations,
  onSignOut,
  onNewInvoice,
  onNewClient,
  onNewProject,
  mobileMoreOpen,
  setMobileMoreOpen,
  children,
  overlays,
}: {
  activeView: FinanceView;
  activeOrganization: WorkspaceOrganization | null;
  invoiceCount: number;
  session: WorkspaceSession;
  query: string;
  setQuery: (value: string) => void;
  actionError: string;
  clearError: () => void;
  onRefresh: () => void;
  onChangeWorkspace: () => void;
  onSelectWorkspace: (id: string | null) => void;
  organizations: WorkspaceOrganization[];
  onSignOut: () => void;
  onNewInvoice: () => void;
  onNewClient: () => void;
  onNewProject: () => void;
  mobileMoreOpen: boolean;
  setMobileMoreOpen: (open: boolean) => void;
  children: ReactNode;
  overlays?: ReactNode;
}) {
  const router = useRouter();
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const secondaryNavigation = navigation.filter(([key]) => !["overview", "invoices", "payments", "clients"].includes(key));
  const routeFor = (path: string) => {
    const workspace = activeOrganization?.id || "all";
    return `${path}?organization=${encodeURIComponent(workspace)}`;
  };

  return (
    <main className="shell" style={{ "--org-accent": activeOrganization?.accent_hex || "#6d5df5" } as CSSProperties}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            {activeOrganization?.logo_path
              ? <img src={activeOrganization.logo_path} alt="" />
              : <span className="brand-glyph">m</span>}
          </div>
          <div className="brand-copy">
            <strong>{activeOrganization?.name || "All organisations"}</strong>
            <span>{activeOrganization?.legal_name || "MINIMICAL FINANCE"}</span>
          </div>
        </div>

        <nav>
          {navigation.map(([key, Icon, label, path]) => (
            <button
              key={key}
              className={"nav-item " + (activeView === key ? "active" : "")}
              onClick={() => router.push(routeFor(path))}
            >
              <Icon size={17} />
              <span>{label}</span>
              {key === "invoices" && <em>{invoiceCount}</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={onSignOut}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
          <div className="profile">
            <div className="avatar">
              {String(activeOrganization?.name || session.user?.email || "A").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{activeOrganization?.name || "Workspace"}</b>
              <small>{session.user?.email || "Authenticated"}</small>
            </div>
            <MoreHorizontal size={16} />
          </div>
        </div>
      </aside>

      <section className="content">
        {actionError && (
          <div className="global-error" role="alert">
            <CircleAlert size={15} />
            <span>{actionError}</span>
            <button onClick={clearError} aria-label="Dismiss error"><X size={14} /></button>
          </div>
        )}

        <header className="topbar">
          <div className="topbar-title">
            <h1>{pageLabel[activeView]}</h1>
          </div>

          <div className="topbar-tools">
            <div className="workspace-switcher-wrap">
              <button
                className="top-workspace-switcher"
                onClick={() => setWorkspaceMenuOpen(open => !open)}
                aria-label="Switch organisation"
                aria-expanded={workspaceMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="top-workspace-mark">
                  {activeOrganization?.logo_path ? <img src={activeOrganization.logo_path} alt="" /> : "m"}
                </span>
                <span className="top-workspace-copy">
                  <small>WORKSPACE</small>
                  <strong>{activeOrganization?.name || "All organisations"}</strong>
                </span>
                <ChevronRight size={14} className={workspaceMenuOpen ? "workspace-chevron-open" : ""} />
              </button>
              {workspaceMenuOpen && (
                <div className="workspace-switcher-menu" role="listbox" aria-label="Workspaces">
                  <button
                    className={!activeOrganization ? "selected" : ""}
                    role="option"
                    aria-selected={!activeOrganization}
                    onClick={() => { onSelectWorkspace(null); setWorkspaceMenuOpen(false); }}
                  >
                    <span className="workspace-option-mark">A</span>
                    <span><strong>All organisations</strong><small>All workspace data</small></span>
                    {!activeOrganization && <span className="workspace-check">✓</span>}
                  </button>
                  {organizations.filter(o => !["dissolved", "discontinued"].includes(String(o.status))).map(org => (
                    <button
                      key={org.id}
                      className={activeOrganization?.id === org.id ? "selected" : ""}
                      role="option"
                      aria-selected={activeOrganization?.id === org.id}
                      onClick={() => { onSelectWorkspace(org.id); setWorkspaceMenuOpen(false); }}
                    >
                      <span className="workspace-option-mark">
                        {org.logo_path ? <img src={org.logo_path} alt="" /> : String(org.name || "O").slice(0, 1).toUpperCase()}
                      </span>
                      <span><strong>{org.name || "Organisation"}</strong><small>{org.legal_name || "Workspace"}</small></span>
                      {activeOrganization?.id === org.id && <span className="workspace-check">✓</span>}
                    </button>
                  ))}
                  <button className="workspace-menu-manage" onClick={onChangeWorkspace}>
                    <span>Manage workspaces</span><ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
            <label className="global-search">
              <Search size={15} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search invoices, clients, projects…"
                aria-label="Search workspace"
              />
            </label>

            <div className="top-actions">
              <button className="icon-button" title="Refresh data" onClick={onRefresh} aria-label="Refresh data">
                <RefreshCw size={17} />
              </button>

              {(activeView === "overview" || activeView === "invoices") && activeOrganization && (
                <button className="primary" onClick={onNewInvoice}>
                  <Plus size={17} /> New invoice
                </button>
              )}
              {activeView === "clients" && (
                <button className="primary" onClick={onNewClient}>
                  <Plus size={17} /> New client
                </button>
              )}
              {activeView === "projects" && (
                <button className="primary" onClick={onNewProject}>
                  <Plus size={17} /> New project
                </button>
              )}
            </div>
          </div>
        </header>

        {children}
      </section>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.filter(([key]) => ["overview", "invoices", "payments", "clients"].includes(key)).map(([key, Icon, label, path]) => (
          <button
            key={key}
            className={activeView === key ? "active" : ""}
            onClick={() => { setMobileMoreOpen(false); router.push(routeFor(path)); }}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className={mobileMoreOpen || !["overview", "invoices", "payments", "clients"].includes(activeView) ? "active" : ""}
          onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
          aria-expanded={mobileMoreOpen}
        >
          <MoreHorizontal size={17} />
          <span>More</span>
        </button>
      </nav>

      {mobileMoreOpen && (
        <div className="mobile-more-sheet" role="dialog" aria-label="More workspace sections" onMouseDown={() => setMobileMoreOpen(false)}>
          <div className="mobile-more-panel" onMouseDown={event => event.stopPropagation()}>
            <div className="eyebrow">WORKSPACE</div>
            {secondaryNavigation.map(([key, Icon, label, path]) => (
              <button
                key={key}
                className={activeView === key ? "active" : ""}
                onClick={() => { setMobileMoreOpen(false); router.push(routeFor(path)); }}
              >
                <Icon size={17} />
                <span>{label}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}

      {overlays}
    </main>
  );
}
