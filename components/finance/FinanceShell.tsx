"use client";

import type { ReactNode, CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Check, ChevronDown, CircleAlert, FileInput, FileText, FolderKanban,
  LayoutDashboard, LogOut, MoreHorizontal, Receipt, Search,
  Settings2, WalletCards, X, ArrowLeftRight
} from "lucide-react";
import type { FinanceView } from "@/lib/finance/types";
import { MobileSheet } from "./FinancePrimitives";
import { ALL_ORGANIZATIONS_ID, financeViewLabel } from "@/lib/finance/types";

type WorkspaceOrganization = {
  id:string;
  name?:string|null;
  legal_name?:string|null;
  logo_path?:string|null;
  accent_hex?:string|null;
  status?:string|null;
};
type WorkspaceSession = { user?: { email?:string|null }|null };

const primary:Array<[FinanceView,typeof LayoutDashboard]> = [
  ["overview",LayoutDashboard],
  ["invoices",Receipt],
  ["payments",WalletCards],
  ["clients",FileText],
];
const secondary:Array<[FinanceView,typeof LayoutDashboard]> = [
  ["projects",FolderKanban],
  ["reports",BarChart3],
  ["documents",FileText],
  ["imports",FileInput],
  ["migrations",ArrowLeftRight],
  ["settings",Settings2],
];

export function FinanceShell({
  activeView,onNavigate,activeOrganization,invoiceCount,session,actionError,clearError,
  onSelectWorkspace,organizations,onSignOut,
  mobileMoreOpen,setMobileMoreOpen,children,overlays
}:{
  activeView:FinanceView;
  onNavigate:(view:FinanceView)=>void;
  activeOrganization:WorkspaceOrganization|null;
  invoiceCount:number;
  session:WorkspaceSession;
  actionError:string;
  clearError:()=>void;
  onSelectWorkspace:(id:string)=>void;
  organizations:WorkspaceOrganization[];
  onSignOut:()=>void;
  mobileMoreOpen:boolean;
  setMobileMoreOpen:(v:boolean)=>void;
  children:ReactNode;
  overlays?:ReactNode;
}) {
  const [workspaceMenuOpen,setWorkspaceMenuOpen]=useState(false);
  const [workspaceFilter,setWorkspaceFilter]=useState("");

  useEffect(()=>{
    if(!workspaceMenuOpen) return;
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setWorkspaceMenuOpen(false)};
    const click=(e:MouseEvent)=>{
      const t=e.target as Node;
      if(!(t instanceof Element)||!t.closest(".workspace-switcher-wrap"))setWorkspaceMenuOpen(false);
    };
    document.addEventListener("keydown",key);
    document.addEventListener("mousedown",click);
    return()=>{document.removeEventListener("keydown",key);document.removeEventListener("mousedown",click)};
  },[workspaceMenuOpen]);

  const activeOrgs=organizations.filter(o=>!["dissolved","discontinued"].includes(String(o.status)));
  const scopeOptions:WorkspaceOrganization[]=[
    {id:ALL_ORGANIZATIONS_ID,name:"All organisations",status:"aggregate"},
    ...activeOrgs
  ];
  const filteredOrgs=scopeOptions.filter(o=>String(o.name||"").toLowerCase().includes(workspaceFilter.trim().toLowerCase()));
  const isAggregate=activeOrganization?.id===ALL_ORGANIZATIONS_ID;
  const pageTitle=financeViewLabel[activeView] ?? "Overview";

  const mark=(org:WorkspaceOrganization|null)=>{
    if(org?.id===ALL_ORGANIZATIONS_ID) return "∑";
    return org?.logo_path ? <img src={org.logo_path} alt="" /> : String(org?.name||"M").slice(0,1).toUpperCase();
  };

  const selectOrg=(id:string)=>{
    onSelectWorkspace(id);
    setWorkspaceMenuOpen(false);
    setWorkspaceFilter("");
  };

  return <main className="shell" style={{"--org-accent":activeOrganization?.accent_hex||"#7046dd"} as CSSProperties}>
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">M</div>
        <div><strong>MinBooks</strong><small>by Minimical</small></div>
      </div>

      <div className="rail-workspace workspace-switcher-wrap">
        <button className="rail-workspace-trigger" onClick={()=>setWorkspaceMenuOpen(v=>!v)} aria-label="Switch organisation" aria-haspopup="menu" aria-expanded={workspaceMenuOpen}>
          <span className="rail-workspace-mark">{mark(activeOrganization)}</span>
          <span className="rail-workspace-copy"><b>{activeOrganization?.name||"Organisation"}</b><small>{isAggregate?"Aggregate view":"Billing identity"}</small></span>
          <ChevronDown size={14}/>
        </button>
        {workspaceMenuOpen&&<div className="workspace-switcher-menu" role="menu" aria-label="Organisations">
          <label className="workspace-menu-search"><Search size={13}/><input autoFocus value={workspaceFilter} onChange={e=>setWorkspaceFilter(e.target.value)} placeholder="Find organisation…" aria-label="Find organisation"/></label>
          {filteredOrgs.map(o=><button key={o.id} role="menuitem" className={activeOrganization?.id===o.id?"selected":""} onClick={()=>selectOrg(o.id)}>
            <span className="workspace-option-mark">{mark(o)}</span>
            <span className="workspace-option-copy"><strong>{o.name}</strong><small>{o.id===ALL_ORGANIZATIONS_ID?"Read-only aggregate":"Organisation"}</small></span>
            {activeOrganization?.id===o.id&&<Check size={13}/>}
          </button>)}
          {!filteredOrgs.length&&<div className="workspace-menu-empty">No organisations found.</div>}
        </div>}
      </div>

      <nav className="finance-nav">
        <div className="nav-group"><span className="nav-group-label">Workspace</span>
          {primary.map(([key,Icon])=><button key={key} className={"nav-item "+(activeView===key?"active":"")} aria-current={activeView===key?"page":undefined} onClick={()=>onNavigate(key)}>
            <Icon size={16}/><span>{financeViewLabel[key]}</span>{key==="invoices"&&invoiceCount>0&&<em>{invoiceCount}</em>}
          </button>)}
        </div>
        <div className="nav-group"><span className="nav-group-label">Manage</span>
          {secondary.map(([key,Icon])=><button key={key} className={"nav-item "+(activeView===key?"active":"")} aria-current={activeView===key?"page":undefined} onClick={()=>onNavigate(key)}>
            <Icon size={16}/><span>{financeViewLabel[key]}</span>
          </button>)}
        </div>
      </nav>

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={onSignOut}><LogOut size={16}/><span>Sign out</span></button>
        <div className="profile"><div className="avatar">{String(session.user?.email||"M").slice(0,1).toUpperCase()}</div><div><b>Account</b><small>{session.user?.email||"Authenticated"}</small></div></div>
      </div>
    </aside>

    <section className="content">
      {actionError&&<div className="global-error" role="alert"><CircleAlert size={14}/><span>{actionError}</span><button onClick={clearError} aria-label="Dismiss error"><X size={14}/></button></div>}
      <header className="topbar">
        <div className="topbar-page-title">
          <span className="eyebrow">{pageTitle}</span>
          <strong>{activeOrganization?.name||"Organisation"}</strong>
        </div>
        <div className="topbar-mobile-workspace workspace-switcher-wrap">
          <button className="mobile-workspace-trigger" onClick={()=>setWorkspaceMenuOpen(v=>!v)} aria-label="Switch organisation" aria-haspopup="menu" aria-expanded={workspaceMenuOpen}>
            <span className="mobile-workspace-mark">{mark(activeOrganization)}</span><span className="mobile-workspace-name">{activeOrganization?.name||"Organisation"}</span><ChevronDown size={13}/>
          </button>
          {workspaceMenuOpen&&<div className="workspace-switcher-menu mobile-workspace-menu" role="listbox" aria-label="Organisations">
            <label className="workspace-menu-search"><Search size={13}/><input autoFocus value={workspaceFilter} onChange={e=>setWorkspaceFilter(e.target.value)} placeholder="Find organisation…" aria-label="Find organisation"/></label>
            {filteredOrgs.map(o=><button key={o.id} className={activeOrganization?.id===o.id?"selected":""} onClick={()=>selectOrg(o.id)}><span className="workspace-option-mark">{mark(o)}</span><span className="workspace-option-copy"><strong>{o.name}</strong><small>{o.id===ALL_ORGANIZATIONS_ID?"Read-only aggregate":"Organisation"}</small></span>{activeOrganization?.id===o.id&&<Check size={13}/>}</button>)}
          </div>}
        </div>

      </header>
      <div className="page-frame" key={activeView}>{children}</div>
    </section>

    <nav className="mobile-nav" aria-label="Primary navigation">
      {primary.map(([key,Icon])=><button key={key} className={activeView===key?"active":""} onClick={()=>{setMobileMoreOpen(false);onNavigate(key)}}><Icon size={17}/><span>{financeViewLabel[key]}</span></button>)}
      <button className={mobileMoreOpen||secondary.some(([key])=>key===activeView)?"active":""} onClick={()=>setMobileMoreOpen(!mobileMoreOpen)} aria-expanded={mobileMoreOpen}><MoreHorizontal size={17}/><span>More</span></button>
    </nav>
    <MobileSheet open={mobileMoreOpen} onClose={()=>setMobileMoreOpen(false)} title="Workspace">
      <div className="mobile-more-panel">
        {secondary.map(([key,Icon])=><button key={key} className={activeView===key?"active":""} onClick={()=>{setMobileMoreOpen(false);onNavigate(key)}}><Icon size={17}/><span>{financeViewLabel[key]}</span></button>)}
      </div>
    </MobileSheet>
    {overlays}
  </main>;
}