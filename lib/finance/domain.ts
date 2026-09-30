"use client";

import type { Database } from "@/lib/supabase/database.types";

export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type Status = Database["public"]["Enums"]["invoice_status"];
export type ContentKind = Database["public"]["Enums"]["invoice_content_kind"];

export type Content = {
  id: string;
  title: string;
  kind: ContentKind;
  quantity: number;
  rate?: number | null;
  amount?: number | null;
  priced: boolean;
  note?: string | null;
};

export type Payment = {
  id: string;
  amount: number;
  payment_date: string;
  method: PaymentMethod;
};

export type Activity = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Invoice = {
  id: string;
  number: string;
  client: string;
  project: string;
  clientId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  date: string;
  dueDate?: string | null;
  status: Status;
  sourceTotal?: number | null;
  contents: Content[];
  payments: Payment[];
  activities: Activity[];
  adjustment?: string | null;
  notes?: string | null;
};

export const contentAmount = (c: Content) =>
  c.priced ? (c.amount ?? c.quantity * (c.rate ?? 0)) : 0;

export const invoiceTotal = (i: Invoice) =>
  i.contents.reduce((sum, c) => sum + contentAmount(c), 0);

export const paidTotal = (i: Invoice) =>
  i.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

export const invoiceBalance = (i: Invoice) =>
  Math.max(invoiceTotal(i) - paidTotal(i), 0);

export const isInvoiceOverdue = (i: Invoice, today = new Date()) => {
  if (!i.dueDate || invoiceBalance(i) <= 0 || i.status === "void") return false;
  const due = new Date(i.dueDate + "T00:00:00");
  return due.getTime() < today.getTime();
};

export const daysOverdue = (i: Invoice, today = new Date()) => {
  if (!isInvoiceOverdue(i, today)) return 0;
  const due = new Date(i.dueDate! + "T00:00:00");
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
};

export const statusLabel = (s: Status) =>
  ({ draft: "Draft", sent: "Sent", partially_paid: "Partially paid", paid: "Paid", void: "Void" } as Record<Status, string>)[s];

export function mapInvoice(row: any): Invoice {
  return {
    id: row.id,
    number: row.invoice_number,
    client: row.clients?.name ?? "No client",
    project: row.projects?.name ?? "No project",
    clientId: row.client_id,
    projectId: row.project_id,
    organizationId: row.organization_id,
    date: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    sourceTotal: row.source_total,
    adjustment: row.adjustment_note,
    notes: row.notes,
    contents: (row.invoice_contents ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((c: any) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        quantity: Number(c.quantity ?? 1),
        rate: c.rate == null ? null : Number(c.rate),
        amount: c.amount == null ? null : Number(c.amount),
        priced: c.priced,
        note: c.note,
      })),
    payments: (row.payments ?? []).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount),
      payment_date: p.payment_date,
      method: p.method,
    })),
    activities: (row.activity_log ?? [])
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((a: any) => ({
        id: a.id,
        action: a.action,
        metadata: a.metadata ?? {},
        created_at: a.created_at,
      })),
  };
}

export type FinanceStats = {
  billed: number;
  collected: number;
  outstanding: number;
  overdue: number;
  overdueCount: number;
  unpricedCount: number;
  rate: number;
};

export const calculateStats = (invoices: Invoice[], today = new Date()): FinanceStats => {
  const billed = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const collected = invoices.reduce((s, i) => s + paidTotal(i), 0);
  const overdueInvoices = invoices.filter(i => daysOverdue(i, today) > 0);
  const overdue = overdueInvoices.reduce((s, i) => s + invoiceBalance(i), 0);
  const unpricedCount = invoices.reduce(
    (s, i) => s + i.contents.filter(c => !c.priced).length,
    0,
  );

  return {
    billed,
    collected,
    outstanding: Math.max(billed - collected, 0),
    overdue,
    overdueCount: overdueInvoices.length,
    unpricedCount,
    rate: billed ? Math.round((collected / billed) * 1000) / 10 : 0,
  };
};
