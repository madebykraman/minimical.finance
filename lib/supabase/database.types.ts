export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_profile: {
        Row: {
          address_lines: Json
          display_name: string | null
          email: string | null
          id: boolean
          legal_name: string
          logo_path: string | null
          pan: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address_lines?: Json
          display_name?: string | null
          email?: string | null
          id?: boolean
          legal_name?: string
          logo_path?: string | null
          pan?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address_lines?: Json
          display_name?: string | null
          email?: string | null
          id?: boolean
          legal_name?: string
          logo_path?: string | null
          pan?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          invoice_id: string | null
          metadata: Json
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_financials"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          auth_user_id: string | null
          client_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          portal_enabled: boolean
          role: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          client_id: string
          created_at?: string
          email: string
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          portal_enabled?: boolean
          role?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          portal_enabled?: boolean
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_activity: {
        Row: {
          action: string
          client_id: string
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string | null
        }
        Insert: {
          action: string
          client_id: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_activity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          session_hash: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          session_hash: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          session_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_tokens: {
        Row: {
          client_id: string
          contact_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          client_id: string
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          client_id?: string
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_tokens_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_lines: Json
          allow_profile_edit: boolean
          archived_at: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          notes: string | null
          organization_id: string | null
          pan: string | null
          phone: string | null
          portal_enabled: boolean
          portal_message: string | null
          portal_password_hash: string | null
          portal_password_set_at: string | null
          portal_slug: string | null
          show_documents: boolean
          show_projects: boolean
          updated_at: string
        }
        Insert: {
          address_lines?: Json
          allow_profile_edit?: boolean
          archived_at?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          notes?: string | null
          organization_id?: string | null
          pan?: string | null
          phone?: string | null
          portal_enabled?: boolean
          portal_message?: string | null
          portal_password_hash?: string | null
          portal_password_set_at?: string | null
          portal_slug?: string | null
          show_documents?: boolean
          show_projects?: boolean
          updated_at?: string
        }
        Update: {
          address_lines?: Json
          allow_profile_edit?: boolean
          archived_at?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          pan?: string | null
          phone?: string | null
          portal_enabled?: boolean
          portal_message?: string | null
          portal_password_hash?: string | null
          portal_password_set_at?: string | null
          portal_slug?: string | null
          show_documents?: boolean
          show_projects?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_log: {
        Row: {
          accessed_at: string
          action: string
          client_id: string | null
          document_id: string
          id: string
        }
        Insert: {
          accessed_at?: string
          action?: string
          client_id?: string | null
          document_id: string
          id?: string
        }
        Update: {
          accessed_at?: string
          action?: string
          client_id?: string | null
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          checksum_sha256: string | null
          document_id: string
          file_name: string | null
          file_path: string | null
          generated_at: string
          generated_by: string | null
          id: string
          metadata: Json
          mime_type: string
          size_bytes: number | null
          storage_bucket: string
          version_number: number
        }
        Insert: {
          checksum_sha256?: string | null
          document_id: string
          file_name?: string | null
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          metadata?: Json
          mime_type?: string
          size_bytes?: number | null
          storage_bucket?: string
          version_number: number
        }
        Update: {
          checksum_sha256?: string | null
          document_id?: string
          file_name?: string | null
          file_path?: string | null
          generated_at?: string
          generated_by?: string | null
          id?: string
          metadata?: Json
          mime_type?: string
          size_bytes?: number | null
          storage_bucket?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          checksum_sha256: string | null
          client_id: string | null
          created_at: string
          description: string | null
          document_type: string
          file_name: string
          file_path: string
          generated_at: string | null
          id: string
          invoice_id: string | null
          issued_at: string | null
          mime_type: string | null
          organization_id: string | null
          size_bytes: number | null
          source_hash: string | null
          status: string
          storage_bucket: string
          template_key: string | null
          version_number: number
          visible_to_client: boolean
        }
        Insert: {
          checksum_sha256?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          document_type: string
          file_name: string
          file_path: string
          generated_at?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          mime_type?: string | null
          organization_id?: string | null
          size_bytes?: number | null
          source_hash?: string | null
          status?: string
          storage_bucket?: string
          template_key?: string | null
          version_number?: number
          visible_to_client?: boolean
        }
        Update: {
          checksum_sha256?: string | null
          client_id?: string | null
          created_at?: string
          description?: string | null
          document_type?: string
          file_name?: string
          file_path?: string
          generated_at?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          mime_type?: string | null
          organization_id?: string | null
          size_bytes?: number | null
          source_hash?: string | null
          status?: string
          storage_bucket?: string
          template_key?: string | null
          version_number?: number
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_financials"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_contents: {
        Row: {
          amount: number | null
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_content_kind"]
          note: string | null
          position: number
          priced: boolean
          quantity: number
          rate: number | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          kind?: Database["public"]["Enums"]["invoice_content_kind"]
          note?: string | null
          position?: number
          priced?: boolean
          quantity?: number
          rate?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["invoice_content_kind"]
          note?: string | null
          position?: number
          priced?: boolean
          quantity?: number
          rate?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_contents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_financials"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_contents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          organization_id: string
          snapshot: Json
          snapshot_hash: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          organization_id: string
          snapshot: Json
          snapshot_hash: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          organization_id?: string
          snapshot?: Json
          snapshot_hash?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_financials"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          adjustment_note: string | null
          client_id: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          issued_at: string | null
          issued_version: number | null
          notes: string | null
          organization_id: string
          project_id: string | null
          source_total: number | null
          status: Database["public"]["Enums"]["invoice_status"]
          updated_at: string
        }
        Insert: {
          adjustment_note?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          issued_at?: string | null
          issued_version?: number | null
          notes?: string | null
          organization_id: string
          project_id?: string | null
          source_total?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Update: {
          adjustment_note?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          issued_at?: string | null
          issued_version?: number | null
          notes?: string | null
          organization_id?: string
          project_id?: string | null
          source_total?: number | null
          status?: Database["public"]["Enums"]["invoice_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_hex: string
          account_number: string | null
          address_lines: Json
          bank_name: string | null
          branch_code: string | null
          branch_name: string | null
          created_at: string
          email: string | null
          entity_type: string
          gstin: string | null
          id: string
          ifsc_code: string | null
          invoice_footer_line_1: string | null
          invoice_footer_line_2: string | null
          invoice_prefix: string
          invoice_template_key: string
          legal_name: string | null
          logo_path: string | null
          name: string
          next_invoice_number: number
          next_receipt_number: number
          pan: string | null
          payee_name: string | null
          phone: string | null
          receipt_prefix: string
          status: string
          updated_at: string
        }
        Insert: {
          accent_hex?: string
          account_number?: string | null
          address_lines?: Json
          bank_name?: string | null
          branch_code?: string | null
          branch_name?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          invoice_footer_line_1?: string | null
          invoice_footer_line_2?: string | null
          invoice_prefix?: string
          invoice_template_key?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          next_invoice_number?: number
          next_receipt_number?: number
          pan?: string | null
          payee_name?: string | null
          phone?: string | null
          receipt_prefix?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accent_hex?: string
          account_number?: string | null
          address_lines?: Json
          bank_name?: string | null
          branch_code?: string | null
          branch_name?: string | null
          created_at?: string
          email?: string | null
          entity_type?: string
          gstin?: string | null
          id?: string
          ifsc_code?: string | null
          invoice_footer_line_1?: string | null
          invoice_footer_line_2?: string | null
          invoice_prefix?: string
          invoice_template_key?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          next_invoice_number?: number
          next_receipt_number?: number
          pan?: string | null
          payee_name?: string | null
          phone?: string | null
          receipt_prefix?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          organization_id: string | null
          payment_date: string | null
          receipt_issued_at: string | null
          receipt_number: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string | null
          payment_date?: string | null
          receipt_issued_at?: string | null
          receipt_number?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          organization_id?: string | null
          payment_date?: string | null
          receipt_issued_at?: string | null
          receipt_number?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_financials"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activity: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          project_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_cost: number
          budget_cost: number
          client_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string | null
          project_type: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number
          budget_cost?: number
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number
          budget_cost?: number
          client_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_settings: {
        Row: {
          account_number: string | null
          bank_name: string | null
          branch_code: string | null
          branch_name: string | null
          brand_name: string
          contact_email: string | null
          id: boolean
          ifsc_code: string | null
          invoice_footer_line_1: string | null
          invoice_footer_line_2: string | null
          pan_number: string | null
          payee_name: string | null
          pdf_template: string
          studio_name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          branch_code?: string | null
          branch_name?: string | null
          brand_name?: string
          contact_email?: string | null
          id?: boolean
          ifsc_code?: string | null
          invoice_footer_line_1?: string | null
          invoice_footer_line_2?: string | null
          pan_number?: string | null
          payee_name?: string | null
          pdf_template?: string
          studio_name?: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          branch_code?: string | null
          branch_name?: string | null
          brand_name?: string
          contact_email?: string | null
          id?: boolean
          ifsc_code?: string | null
          invoice_footer_line_1?: string | null
          invoice_footer_line_2?: string | null
          pan_number?: string | null
          payee_name?: string | null
          pdf_template?: string
          studio_name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      invoice_financials: {
        Row: {
          balance: number | null
          client_id: string | null
          days_overdue: number | null
          due_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          is_overdue: boolean | null
          issue_date: string | null
          paid: number | null
          project_id: string | null
          source_total: number | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_migration_status: {
        Row: {
          assigned_invoice_count: number | null
          invoice_count: number | null
          organisation_count: number | null
          orphaned_organisation_count: number | null
          unassigned_invoice_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_invoice_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      allocate_receipt_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      create_client_portal_session: {
        Args: {
          p_expires_at: string
          p_session_hash: string
          p_slug: string
          p_token: string
        }
        Returns: boolean
      }
      get_client_portal: {
        Args: { p_session?: string; p_slug: string; p_token?: string }
        Returns: Json
      }
      get_client_portal_organization: {
        Args: { p_session: string; p_slug: string }
        Returns: Json
      }
      get_client_portal_secret: {
        Args: { p_slug: string; p_token: string }
        Returns: Json
      }
      invoice_snapshot: { Args: { p_invoice_id: string }; Returns: Json }
      issue_invoice: { Args: { p_invoice_id: string }; Returns: number }
      log_client_portal_activity: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_session: string
          p_slug: string
        }
        Returns: undefined
      }
      next_invoice_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      record_invoice_payment: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes?: string
          p_payment_date: string
          p_reference?: string
        }
        Returns: string
      }
      save_invoice: {
        Args: {
          p_adjustment_note?: string
          p_client_id?: string
          p_contents?: Json
          p_due_date?: string
          p_invoice_id: string
          p_issue_date?: string
          p_notes?: string
          p_organization_id?: string
          p_project_id?: string
          p_status?: Database["public"]["Enums"]["invoice_status"]
        }
        Returns: undefined
      }
      statement_ledger: {
        Args: { p_client_id: string; p_end?: string; p_start?: string }
        Returns: {
          credit: number
          debit: number
          reference: string
          running_balance: number
          transaction_date: string
          transaction_type: string
        }[]
      }
      sync_invoice_payment_status: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      update_client_portal_profile: {
        Args: { p_payload: Json; p_session: string; p_slug: string }
        Returns: Json
      }
    }
    Enums: {
      invoice_content_kind: "service" | "adjustment" | "note"
      invoice_status: "draft" | "sent" | "partially_paid" | "paid" | "void"
      payment_method: "cash" | "bank_transfer" | "upi" | "card" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      invoice_content_kind: ["service", "adjustment", "note"],
      invoice_status: ["draft", "sent", "partially_paid", "paid", "void"],
      payment_method: ["cash", "bank_transfer", "upi", "card", "other"],
    },
  },
} as const
