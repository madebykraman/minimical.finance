export type FinanceView =
  | "overview"
  | "invoices"
  | "payments"
  | "clients"
  | "projects"
  | "reports"
  | "imports"
  | "settings";

export const ALL_ORGANIZATIONS_ID = "__all__" as const;
export type OrganizationScope = string | typeof ALL_ORGANIZATIONS_ID;

export const financeViewLabel: Record<FinanceView, string> = {
  overview: "Overview",
  invoices: "Invoices",
  payments: "Payments",
  clients: "Clients",
  projects: "Projects",
  reports: "Reports",
  imports: "Import",
  settings: "Settings",
};
