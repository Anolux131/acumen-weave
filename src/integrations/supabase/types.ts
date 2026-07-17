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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          action: string
          agent_name: string
          created_at: string
          detail: string | null
          id: string
          job_id: string
          status: Database["public"]["Enums"]["log_status"]
        }
        Insert: {
          action: string
          agent_name: string
          created_at?: string
          detail?: string | null
          id?: string
          job_id: string
          status?: Database["public"]["Enums"]["log_status"]
        }
        Update: {
          action?: string
          agent_name?: string
          created_at?: string
          detail?: string | null
          id?: string
          job_id?: string
          status?: Database["public"]["Enums"]["log_status"]
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          buying_role: Database["public"]["Enums"]["buying_role"] | null
          company_name: string
          created_at: string
          department: string | null
          email: string | null
          email_confidence: number | null
          full_name: string | null
          id: string
          job_id: string
          job_title: string | null
          linkedin_url: string | null
          outreach_priority:
            | Database["public"]["Enums"]["outreach_priority"]
            | null
          seniority_level: string | null
          suggested_hook: string | null
          twitter_handle: string | null
          user_id: string
        }
        Insert: {
          buying_role?: Database["public"]["Enums"]["buying_role"] | null
          company_name: string
          created_at?: string
          department?: string | null
          email?: string | null
          email_confidence?: number | null
          full_name?: string | null
          id?: string
          job_id: string
          job_title?: string | null
          linkedin_url?: string | null
          outreach_priority?:
            | Database["public"]["Enums"]["outreach_priority"]
            | null
          seniority_level?: string | null
          suggested_hook?: string | null
          twitter_handle?: string | null
          user_id: string
        }
        Update: {
          buying_role?: Database["public"]["Enums"]["buying_role"] | null
          company_name?: string
          created_at?: string
          department?: string | null
          email?: string | null
          email_confidence?: number | null
          full_name?: string | null
          id?: string
          job_id?: string
          job_title?: string | null
          linkedin_url?: string | null
          outreach_priority?:
            | Database["public"]["Enums"]["outreach_priority"]
            | null
          seniority_level?: string | null
          suggested_hook?: string | null
          twitter_handle?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content: Json
          created_at: string
          generated_at: string
          html_content: string | null
          id: string
          job_id: string
          markdown_content: string | null
          page_count: number
          report_type: Database["public"]["Enums"]["report_type"]
          title: string
          user_id: string
          word_count: number
        }
        Insert: {
          content: Json
          created_at?: string
          generated_at?: string
          html_content?: string | null
          id?: string
          job_id: string
          markdown_content?: string | null
          page_count?: number
          report_type: Database["public"]["Enums"]["report_type"]
          title: string
          user_id: string
          word_count?: number
        }
        Update: {
          content?: Json
          created_at?: string
          generated_at?: string
          html_content?: string | null
          id?: string
          job_id?: string
          markdown_content?: string | null
          page_count?: number
          report_type?: Database["public"]["Enums"]["report_type"]
          title?: string
          user_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_jobs: {
        Row: {
          analysis_depth: Database["public"]["Enums"]["analysis_depth"]
          company_name: string
          company_url: string | null
          completed_sections: number
          created_at: string
          current_agent: string
          current_phase: string
          error_message: string | null
          id: string
          industry: string | null
          progress_percentage: number
          status: Database["public"]["Enums"]["job_status"]
          total_sections: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_depth?: Database["public"]["Enums"]["analysis_depth"]
          company_name: string
          company_url?: string | null
          completed_sections?: number
          created_at?: string
          current_agent?: string
          current_phase?: string
          error_message?: string | null
          id?: string
          industry?: string | null
          progress_percentage?: number
          status?: Database["public"]["Enums"]["job_status"]
          total_sections?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_depth?: Database["public"]["Enums"]["analysis_depth"]
          company_name?: string
          company_url?: string | null
          completed_sections?: number
          created_at?: string
          current_agent?: string
          current_phase?: string
          error_message?: string | null
          id?: string
          industry?: string | null
          progress_percentage?: number
          status?: Database["public"]["Enums"]["job_status"]
          total_sections?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      section_results: {
        Row: {
          analyzed_content: string | null
          confidence_score: number
          created_at: string
          data_sources: Json | null
          id: string
          job_id: string
          key_findings: Json | null
          pages_scraped: number
          processing_time_ms: number
          raw_research: Json | null
          search_queries_used: Json | null
          section_name: string
          section_number: number
          status: Database["public"]["Enums"]["section_status"]
          tokens_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          analyzed_content?: string | null
          confidence_score?: number
          created_at?: string
          data_sources?: Json | null
          id?: string
          job_id: string
          key_findings?: Json | null
          pages_scraped?: number
          processing_time_ms?: number
          raw_research?: Json | null
          search_queries_used?: Json | null
          section_name: string
          section_number: number
          status?: Database["public"]["Enums"]["section_status"]
          tokens_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          analyzed_content?: string | null
          confidence_score?: number
          created_at?: string
          data_sources?: Json | null
          id?: string
          job_id?: string
          key_findings?: Json | null
          pages_scraped?: number
          processing_time_ms?: number
          raw_research?: Json | null
          search_queries_used?: Json | null
          section_name?: string
          section_number?: number
          status?: Database["public"]["Enums"]["section_status"]
          tokens_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "section_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "research_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      analysis_depth: "quick" | "executive" | "comprehensive"
      buying_role:
        | "primary_buyer"
        | "champion"
        | "influencer"
        | "blocker"
        | "end_user"
        | "executive_sponsor"
      job_status:
        | "pending"
        | "planning"
        | "researching"
        | "processing"
        | "generating"
        | "complete"
        | "failed"
      log_status: "started" | "working" | "done" | "error"
      outreach_priority: "high" | "medium" | "low"
      report_type: "full_dossier" | "executive_brief" | "vulnerability_dossier"
      section_status: "pending" | "running" | "complete" | "failed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      analysis_depth: ["quick", "executive", "comprehensive"],
      buying_role: [
        "primary_buyer",
        "champion",
        "influencer",
        "blocker",
        "end_user",
        "executive_sponsor",
      ],
      job_status: [
        "pending",
        "planning",
        "researching",
        "processing",
        "generating",
        "complete",
        "failed",
      ],
      log_status: ["started", "working", "done", "error"],
      outreach_priority: ["high", "medium", "low"],
      report_type: ["full_dossier", "executive_brief", "vulnerability_dossier"],
      section_status: ["pending", "running", "complete", "failed"],
    },
  },
} as const
