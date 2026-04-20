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
      clinics: {
        Row: {
          branding: Json
          created_at: string
          domain: string
          id: string
          is_active: boolean
          janeapp_base_url: string | null
          monthly_message_cap: number
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean
          janeapp_base_url?: string | null
          monthly_message_cap?: number
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean
          janeapp_base_url?: string | null
          monthly_message_cap?: number
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          id: string
          media_urls: string[] | null
          patient_id: string
          role: string
          twilio_sid: string | null
        }
        Insert: {
          channel: string
          content: string
          created_at?: string
          id?: string
          media_urls?: string[] | null
          patient_id: string
          role: string
          twilio_sid?: string | null
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          id?: string
          media_urls?: string[] | null
          patient_id?: string
          role?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics: {
        Row: {
          created_at: string
          discomfort: number | null
          exercise_count: number | null
          exercises_done: string[] | null
          id: string
          notes: string | null
          pain_level: number | null
          patient_id: string
          recorded_at: string
          sitting_tolerance_min: number | null
          source_message_id: string | null
        }
        Insert: {
          created_at?: string
          discomfort?: number | null
          exercise_count?: number | null
          exercises_done?: string[] | null
          id?: string
          notes?: string | null
          pain_level?: number | null
          patient_id: string
          recorded_at?: string
          sitting_tolerance_min?: number | null
          source_message_id?: string | null
        }
        Update: {
          created_at?: string
          discomfort?: number | null
          exercise_count?: number | null
          exercises_done?: string[] | null
          id?: string
          notes?: string | null
          pain_level?: number | null
          patient_id?: string
          recorded_at?: string
          sitting_tolerance_min?: number | null
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metrics_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metrics_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          active: boolean
          auth_user_id: string | null
          clinic_id: string
          consent_at: string | null
          created_at: string
          daily_routine: Json | null
          id: string
          language: string
          last_nudged_at: string | null
          name: string | null
          opted_out: boolean
          phone: string
          practitioner_name: string | null
          profile: Json | null
          sharing_enabled: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          clinic_id?: string
          consent_at?: string | null
          created_at?: string
          daily_routine?: Json | null
          id?: string
          language?: string
          last_nudged_at?: string | null
          name?: string | null
          opted_out?: boolean
          phone: string
          practitioner_name?: string | null
          profile?: Json | null
          sharing_enabled?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          clinic_id?: string
          consent_at?: string | null
          created_at?: string
          daily_routine?: Json | null
          id?: string
          language?: string
          last_nudged_at?: string | null
          name?: string | null
          opted_out?: boolean
          phone?: string
          practitioner_name?: string | null
          profile?: Json | null
          sharing_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          insights: string[] | null
          metrics_summary: Json | null
          patient_id: string
          summary: string | null
          token: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          insights?: string[] | null
          metrics_summary?: Json | null
          patient_id: string
          summary?: string | null
          token: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          insights?: string[] | null
          metrics_summary?: Json | null
          patient_id?: string
          summary?: string | null
          token?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_usage: {
        Row: {
          cost_estimate: number | null
          month: string
          segments: number | null
          updated_at: string | null
        }
        Insert: {
          cost_estimate?: number | null
          month: string
          segments?: number | null
          updated_at?: string | null
        }
        Update: {
          cost_estimate?: number | null
          month?: string
          segments?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      therapists: {
        Row: {
          bio: string
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          janeapp_staff_id: number | null
          languages: string[]
          name: string
          role: string
          specialties: string[]
          updated_at: string
        }
        Insert: {
          bio: string
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          janeapp_staff_id?: number | null
          languages?: string[]
          name: string
          role: string
          specialties?: string[]
          updated_at?: string
        }
        Update: {
          bio?: string
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          janeapp_staff_id?: number | null
          languages?: string[]
          name?: string
          role?: string
          specialties?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "therapists_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_conversations: {
        Row: {
          clinic_id: string
          ended_at: string | null
          id: string
          lang_detected: string | null
          offtopic_strikes: number
          referer: string | null
          session_id: string
          started_at: string
          status: string
          user_agent: string | null
          visitor_ip_hash: string
        }
        Insert: {
          clinic_id: string
          ended_at?: string | null
          id?: string
          lang_detected?: string | null
          offtopic_strikes?: number
          referer?: string | null
          session_id: string
          started_at?: string
          status?: string
          user_agent?: string | null
          visitor_ip_hash: string
        }
        Update: {
          clinic_id?: string
          ended_at?: string | null
          id?: string
          lang_detected?: string | null
          offtopic_strikes?: number
          referer?: string | null
          session_id?: string
          started_at?: string
          status?: string
          user_agent?: string | null
          visitor_ip_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_conversations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_leads: {
        Row: {
          clinic_id: string
          consent_given: boolean
          consent_text: string
          conversation_id: string
          created_at: string
          email: string | null
          id: string
          interest: string | null
          name: string
          notified_at: string | null
          phone: string | null
        }
        Insert: {
          clinic_id: string
          consent_given: boolean
          consent_text: string
          conversation_id: string
          created_at?: string
          email?: string | null
          id?: string
          interest?: string | null
          name: string
          notified_at?: string | null
          phone?: string | null
        }
        Update: {
          clinic_id?: string
          consent_given?: boolean
          consent_text?: string
          conversation_id?: string
          created_at?: string
          email?: string | null
          id?: string
          interest?: string | null
          name?: string
          notified_at?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_leads_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widget_leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "widget_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          on_topic: boolean | null
          role: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          on_topic?: boolean | null
          role: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          on_topic?: boolean | null
          role?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "widget_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "widget_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_usage: {
        Row: {
          clinic_id: string
          conversations_count: number
          date: string
          estimated_cost_usd: number
          id: string
          messages_count: number
          tokens_in: number
          tokens_out: number
        }
        Insert: {
          clinic_id: string
          conversations_count?: number
          date: string
          estimated_cost_usd?: number
          id?: string
          messages_count?: number
          tokens_in?: number
          tokens_out?: number
        }
        Update: {
          clinic_id?: string
          conversations_count?: number
          date?: string
          estimated_cost_usd?: number
          id?: string
          messages_count?: number
          tokens_in?: number
          tokens_out?: number
        }
        Relationships: [
          {
            foreignKeyName: "widget_usage_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      widget_conversation_started: {
        Args: { p_clinic_id: string; p_date: string }
        Returns: undefined
      }
      widget_usage_increment: {
        Args: {
          p_clinic_id: string
          p_date: string
          p_tokens_in: number
          p_tokens_out: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
