export type FinanceView =
  | "overview"
  | "invoices"
  | "payments"
  | "clients"
  | "projects"
  | "reports"
  | "documents"
  | "imports"
  | "migrations"
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
  documents: "Documents",
  imports: "Import",
  migrations: "Migrations",
  settings: "Settings",
};
