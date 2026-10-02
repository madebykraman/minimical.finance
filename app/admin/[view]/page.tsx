import FinanceWorkspace from "@/components/finance/FinanceWorkspace";
import type { FinanceView } from "@/lib/finance/types";

const views = new Set<FinanceView>(["overview","invoices","payments","clients","projects","reports","documents","imports","settings"]);

export default async function AdminViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const initialView = views.has(view as FinanceView) ? view as FinanceView : "overview";
  return <FinanceWorkspace initialView={initialView} />;
}
