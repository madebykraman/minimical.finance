export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void";
export type InvoiceContentKind = "service" | "adjustment" | "note";
export type PaymentMethod = "cash" | "bank_transfer" | "upi" | "card" | "other";

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: { id: string; name: string; email: string | null; phone: string | null; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; email?: string | null; phone?: string | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };
      projects: {
        Row: { id: string; client_id: string | null; name: string; project_type: string | null; status: string; notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id?: string | null; name: string; project_type?: string | null; status?: string; notes?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: { id: string; invoice_number: string; client_id: string | null; project_id: string | null; issue_date: string; due_date: string | null; status: InvoiceStatus; source_total: number | null; notes: string | null; adjustment_note: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; invoice_number: string; client_id?: string | null; project_id?: string | null; issue_date?: string; due_date?: string | null; status?: InvoiceStatus; source_total?: number | null; notes?: string | null; adjustment_note?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      invoice_contents: {
        Row: { id: string; invoice_id: string; position: number; kind: InvoiceContentKind; title: string; description: string | null; quantity: number; rate: number | null; amount: number | null; priced: boolean; note: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; invoice_id: string; position?: number; kind?: InvoiceContentKind; title: string; description?: string | null; quantity?: number; rate?: number | null; amount?: number | null; priced?: boolean; note?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["invoice_contents"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: { id: string; invoice_id: string; amount: number; payment_date: string | null; method: PaymentMethod; reference: string | null; notes: string | null; created_at: string };
        Insert: { id?: string; invoice_id: string; amount: number; payment_date?: string | null; method?: PaymentMethod; reference?: string | null; notes?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: { id: string; invoice_id: string | null; document_type: string; file_path: string; file_name: string; created_at: string };
        Insert: { id?: string; invoice_id?: string | null; document_type: string; file_path: string; file_name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      activity_log: {
        Row: { id: string; invoice_id: string | null; action: string; metadata: Json; created_at: string };
        Insert: { id?: string; invoice_id?: string | null; action: string; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["activity_log"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      invoice_content_kind: InvoiceContentKind;
      invoice_status: InvoiceStatus;
      payment_method: PaymentMethod;
    };
    CompositeTypes: Record<string, never>;
  };
};
