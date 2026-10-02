export type DocumentTemplateKind = "invoice" | "receipt" | "statement";

export type DocumentTemplate = {
  key: string;
  kind: DocumentTemplateKind;
  name: string;
  description: string;
  immutableGeometry?: boolean;
};

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    key: "legacy_elle",
    kind: "invoice",
    name: "Approved legacy invoice",
    description: "Canonical invoice geometry with organisation/client identity layered into reserved whitespace.",
    immutableGeometry: true,
  },
  {
    key: "clean",
    kind: "invoice",
    name: "Workspace Clean",
    description: "Alternative invoice treatment using the same financial source and line-item rules.",
    immutableGeometry: false,
  },
  {
    key: "receipt-v1",
    kind: "receipt",
    name: "MinBooks Receipt v1",
    description: "Dedicated payment receipt renderer. Never inherits invoice geometry.",
  },
  {
    key: "statement-v1",
    kind: "statement",
    name: "MinBooks Statement v1",
    description: "Dedicated account statement renderer backed by the shared statement ledger.",
  },
];

export function getDocumentTemplate(key: string | null | undefined, kind: DocumentTemplateKind) {
  return DOCUMENT_TEMPLATES.find(template => template.key === key && template.kind === kind)
    ?? DOCUMENT_TEMPLATES.find(template => template.kind === kind)
    ?? null;
}
