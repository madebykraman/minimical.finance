"use client";

import { ArrowDownToLine, Plus, Receipt, WalletCards } from "lucide-react";

export function MobileQuickActions({
  onNewInvoice,
  onPayments,
  onImport,
  onInvoices,
}: {
  onNewInvoice: () => void;
  onPayments: () => void;
  onImport: () => void;
  onInvoices: () => void;
}) {
  return (
    <section className="mobile-quick-actions" aria-label="Quick actions">
      <button type="button" className="mobile-quick-action primary" onClick={onNewInvoice}>
        <Plus size={17} />
        <span>Invoice</span>
      </button>
      <button type="button" className="mobile-quick-action" onClick={onPayments}>
        <WalletCards size={17} />
        <span>Payment</span>
      </button>
      <button type="button" className="mobile-quick-action" onClick={onImport}>
        <ArrowDownToLine size={17} />
        <span>Import</span>
      </button>
      <button type="button" className="mobile-quick-action" onClick={onInvoices}>
        <Receipt size={17} />
        <span>Invoices</span>
      </button>
    </section>
  );
}
