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
      atlas_level_placements: {
        Row: {
          altitude: number
          created_at: string
          heading: number
          id: string
          lat: number
          level_id: string
          lng: number
          owner_id: string
          scale: number
          updated_at: string
        }
        Insert: {
          altitude?: number
          created_at?: string
          heading?: number
          id?: string
          lat: number
          level_id: string
          lng: number
          owner_id: string
          scale?: number
          updated_at?: string
        }
        Update: {
          altitude?: number
          created_at?: string
          heading?: number
          id?: string
          lat?: number
          level_id?: string
          lng?: number
          owner_id?: string
          scale?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_level_placements_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      camera_catalog: {
        Row: {
          country: string | null
          created_at: string | null
          feed_status: string | null
          id: string
          image_url: string | null
          last_seen_at: string
          last_updated: string | null
          lat: number
          lng: number
          name: string
          refresh_rate: number | null
          region: string | null
          source: string
          stream_url: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          feed_status?: string | null
          id: string
          image_url?: string | null
          last_seen_at?: string
          last_updated?: string | null
          lat: number
          lng: number
          name: string
          refresh_rate?: number | null
          region?: string | null
          source: string
          stream_url?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          feed_status?: string | null
          id?: string
          image_url?: string | null
          last_seen_at?: string
          last_updated?: string | null
          lat?: number
          lng?: number
          name?: string
          refresh_rate?: number | null
          region?: string | null
          source?: string
          stream_url?: string | null
        }
        Relationships: []
      }
      camera_sync_status: {
        Row: {
          camera_count: number | null
          last_error: string | null
          last_success_at: string | null
          last_sync_at: string | null
          source_name: string
          sync_duration_ms: number | null
          updated_at: string
        }
        Insert: {
          camera_count?: number | null
          last_error?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          source_name: string
          sync_duration_ms?: number | null
          updated_at?: string
        }
        Update: {
          camera_count?: number | null
          last_error?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          source_name?: string
          sync_duration_ms?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      level_snapshots: {
        Row: {
          client_saved_at: string
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          level_id: string
          name: string
          owner_id: string
          scene: Json
        }
        Insert: {
          client_saved_at?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          level_id: string
          name?: string
          owner_id: string
          scene: Json
        }
        Update: {
          client_saved_at?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          level_id?: string
          name?: string
          owner_id?: string
          scene?: Json
        }
        Relationships: [
          {
            foreignKeyName: "level_snapshots_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id"]
          },
        ]
      }
      levels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          scene: Json
          shared_with: string[]
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id: string
          scene?: Json
          shared_with?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          scene?: Json
          shared_with?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rig_saves: {
        Row: {
          active_clip: string | null
          controller_map: Json
          created_at: string
          id: string
          model_url: string
          name: string
          pose: Json
          source_label: string | null
          speed: number
          thumbnail: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_clip?: string | null
          controller_map?: Json
          created_at?: string
          id?: string
          model_url: string
          name: string
          pose?: Json
          source_label?: string | null
          speed?: number
          thumbnail?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_clip?: string | null
          controller_map?: Json
          created_at?: string
          id?: string
          model_url?: string
          name?: string
          pose?: Json
          source_label?: string | null
          speed?: number
          thumbnail?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
