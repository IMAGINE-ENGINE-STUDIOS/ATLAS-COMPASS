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
      dynamic_objects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string | null
          payload: Json
          tags: string[]
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id?: string | null
          payload: Json
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string | null
          payload?: Json
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      file_shares: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          note: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
          sender_id: string
          source_id: string | null
          source_table: string | null
          status: Database["public"]["Enums"]["share_status"]
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          note?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
          sender_id: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          note?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          source_id?: string | null
          source_table?: string | null
          status?: Database["public"]["Enums"]["share_status"]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: []
      }
      geometries: {
        Row: {
          created_at: string
          csv_content: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          shape_count: number
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          csv_content: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          shape_count?: number
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          csv_content?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          shape_count?: number
          thumbnail_url?: string | null
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
      match_queue: {
        Row: {
          joined_at: string
          mode: string
          party_size: number
          region: string
          skill: number
          user_id: string
        }
        Insert: {
          joined_at?: string
          mode: string
          party_size?: number
          region?: string
          skill?: number
          user_id: string
        }
        Update: {
          joined_at?: string
          mode?: string
          party_size?: number
          region?: string
          skill?: number
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          id: string
          mode: string
          player_ids: string[]
          region: string
          room_channel: string
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode: string
          player_ids: string[]
          region?: string
          room_channel: string
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          player_ids?: string[]
          region?: string
          room_channel?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
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
      share_recipients_stats: {
        Row: {
          last_shared_at: string
          owner_id: string
          recipient_id: string
          share_count: number
        }
        Insert: {
          last_shared_at?: string
          owner_id: string
          recipient_id: string
          share_count?: number
        }
        Update: {
          last_shared_at?: string
          owner_id?: string
          recipient_id?: string
          share_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      lookup_user_by_username: {
        Args: { _q: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      record_share: {
        Args: {
          _kind: string
          _name: string
          _note?: string
          _payload: Json
          _recipient: string
          _source_id?: string
          _source_table?: string
          _thumbnail_url?: string
        }
        Returns: string
      }
    }
    Enums: {
      friendship_status: "pending" | "accepted" | "blocked"
      share_status: "pending" | "accepted" | "declined"
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
      friendship_status: ["pending", "accepted", "blocked"],
      share_status: ["pending", "accepted", "declined"],
    },
  },
} as const
