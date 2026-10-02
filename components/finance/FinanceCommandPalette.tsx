"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BarChart3,
  FileInput,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Plus,
  Receipt,
  Search,
  Settings2,
  WalletCards,
  X,
} from "lucide-react";
import type { FinanceView } from "@/lib/finance/types";

type Command = {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  icon: typeof LayoutDashboard;
  action: () => void;
};

export function FinanceCommandPalette({
  open,
  onClose,
  onNavigate,
  onNewInvoice,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: FinanceView) => void;
  onNewInvoice: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const navigate = (view: FinanceView) => {
      onNavigate(view);
      onClose();
    };
    return [
      { id: "new-invoice", label: "New invoice", detail: "Create a billable record", keywords: "invoice create bill billing", icon: Plus, action: () => { onNewInvoice(); onClose(); } },
      { id: "overview", label: "Overview", detail: "Financial position and attention", keywords: "dashboard home overview", icon: LayoutDashboard, action: () => navigate("overview") },
      { id: "invoices", label: "Invoices", detail: "Receivables register", keywords: "invoice receivables register", icon: Receipt, action: () => navigate("invoices") },
      { id: "payments", label: "Payments", detail: "Collections ledger", keywords: "payments collections money received", icon: WalletCards, action: () => navigate("payments") },
      { id: "clients", label: "Clients", detail: "Client directory and workspaces", keywords: "clients customers relationships", icon: FileText, action: () => navigate("clients") },
      { id: "projects", label: "Projects", detail: "Production and project records", keywords: "projects production jobs", icon: FolderKanban, action: () => navigate("projects") },
      { id: "reports", label: "Reports", detail: "Financial analysis", keywords: "reports analysis revenue", icon: BarChart3, action: () => navigate("reports") },
      { id: "documents", label: "Documents", detail: "Generated financial documents", keywords: "documents pdf receipts statements", icon: FileText, action: () => navigate("documents") },
      { id: "imports", label: "Imports", detail: "Bring in invoices and finance data", keywords: "import excel csv migration data", icon: ArrowDownToLine, action: () => navigate("imports") },
      { id: "migrations", label: "Migrations", detail: "Move historical records between organisations", keywords: "migration organisation historical", icon: ArrowLeftRight, action: () => navigate("migrations") },
      { id: "settings", label: "Settings", detail: "Organisation and workspace controls", keywords: "settings organisation account security", icon: Settings2, action: () => navigate("settings") },
    ];
  }, [onClose, onNavigate, onNewInvoice]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(c => (c.label + " " + c.detail + " " + c.keywords).toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive(v => filtered.length ? (v + 1) % filtered.length : 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(v => filtered.length ? (v - 1 + filtered.length) % filtered.length : 0);
      } else if (event.key === "Enter" && filtered[active]) {
        event.preventDefault();
        filtered[active].action();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, filtered, onClose, open]);

  useEffect(() => {
    setActive(v => Math.min(v, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="MinBooks command menu"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="command-palette-search">
          <Search size={16} aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            placeholder="Jump to a workspace action…"
            aria-label="Search commands"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-palette-list" role="listbox" aria-label="Workspace actions">
          {filtered.length ? filtered.map((command, index) => {
            const Icon = command.icon;
            const selected = index === active;
            return (
              <button
                type="button"
                key={command.id}
                className={"command-item" + (selected ? " active" : "")}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={command.action}
              >
                <span className="command-item-icon"><Icon size={16} /></span>
                <span className="command-item-copy">
                  <b>{command.label}</b>
                  <small>{command.detail}</small>
                </span>
                {command.id === "new-invoice" && <kbd>↵</kbd>}
              </button>
            );
          }) : (
            <div className="command-empty"><Search size={16} /><b>No matching action.</b><span>Try invoice, payment, client, import or settings.</span></div>
          )}
        </div>
        <footer className="command-palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>ESC</kbd> close</span>
        </footer>
      </section>
    </div>
  );
}
