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
      admin_alert_settings: {
        Row: {
          channels: string[]
          emails: string[]
          id: number
          min_magnitude: number
          min_severity: number
          phones_e164: string[]
          updated_at: string
        }
        Insert: {
          channels?: string[]
          emails?: string[]
          id?: number
          min_magnitude?: number
          min_severity?: number
          phones_e164?: string[]
          updated_at?: string
        }
        Update: {
          channels?: string[]
          emails?: string[]
          id?: number
          min_magnitude?: number
          min_severity?: number
          phones_e164?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      alert_notifications: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          error: string | null
          event_id: string
          id: string
          read_at: string | null
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          error?: string | null
          event_id: string
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string
          id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "disaster_events"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_level_placements: {
        Row: {
          altitude: number
          created_at: string
          heading: number
          id: string
          lat: number
          level_id: string
          lng: number
          manifest_snapshot: Json | null
          owner_id: string
          package_id: string | null
          package_sha256: string | null
          package_storage_path: string | null
          package_version: string | null
          scale: number
          surrounding_terrain: Json | null
          terrain_expand_feet: number
          updated_at: string
          world: string
        }
        Insert: {
          altitude?: number
          created_at?: string
          heading?: number
          id?: string
          lat: number
          level_id: string
          lng: number
          manifest_snapshot?: Json | null
          owner_id: string
          package_id?: string | null
          package_sha256?: string | null
          package_storage_path?: string | null
          package_version?: string | null
          scale?: number
          surrounding_terrain?: Json | null
          terrain_expand_feet?: number
          updated_at?: string
          world?: string
        }
        Update: {
          altitude?: number
          created_at?: string
          heading?: number
          id?: string
          lat?: number
          level_id?: string
          lng?: number
          manifest_snapshot?: Json | null
          owner_id?: string
          package_id?: string | null
          package_sha256?: string | null
          package_storage_path?: string | null
          package_version?: string | null
          scale?: number
          surrounding_terrain?: Json | null
          terrain_expand_feet?: number
          updated_at?: string
          world?: string
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
      building_ledger: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string | null
          payload: Json
          record_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          payload?: Json
          record_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          payload?: Json
          record_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_ledger_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "building_records"
            referencedColumns: ["id"]
          },
        ]
      }
      building_records: {
        Row: {
          address: string | null
          building_kind: string | null
          color: string | null
          created_at: string
          est_population: number | null
          footprint_m2: number | null
          id: string
          is_hidden: boolean
          is_public: boolean
          lat: number | null
          levels: number | null
          lng: number | null
          name: string | null
          notes: string | null
          osm_id: string
          raw: Json
          replacement_glb_path: string | null
          replacement_glb_url: string | null
          tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          building_kind?: string | null
          color?: string | null
          created_at?: string
          est_population?: number | null
          footprint_m2?: number | null
          id?: string
          is_hidden?: boolean
          is_public?: boolean
          lat?: number | null
          levels?: number | null
          lng?: number | null
          name?: string | null
          notes?: string | null
          osm_id: string
          raw?: Json
          replacement_glb_path?: string | null
          replacement_glb_url?: string | null
          tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          building_kind?: string | null
          color?: string | null
          created_at?: string
          est_population?: number | null
          footprint_m2?: number | null
          id?: string
          is_hidden?: boolean
          is_public?: boolean
          lat?: number | null
          levels?: number | null
          lng?: number | null
          name?: string | null
          notes?: string | null
          osm_id?: string
          raw?: Json
          replacement_glb_path?: string | null
          replacement_glb_url?: string | null
          tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      building_selection_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          is_public: boolean
          name: string
          notes: string | null
          osm_ids: string[]
          tag: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          notes?: string | null
          osm_ids?: string[]
          tag?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          notes?: string | null
          osm_ids?: string[]
          tag?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      disaster_events: {
        Row: {
          country: string | null
          created_at: string
          dispatched_at: string | null
          event_time: string
          external_id: string
          hazard_type: string
          id: string
          lat: number | null
          lon: number | null
          magnitude: number | null
          raw: Json
          region: string | null
          severity: number
          source: string
          summary: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          dispatched_at?: string | null
          event_time: string
          external_id: string
          hazard_type: string
          id?: string
          lat?: number | null
          lon?: number | null
          magnitude?: number | null
          raw?: Json
          region?: string | null
          severity?: number
          source: string
          summary?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          dispatched_at?: string | null
          event_time?: string
          external_id?: string
          hazard_type?: string
          id?: string
          lat?: number | null
          lon?: number | null
          magnitude?: number | null
          raw?: Json
          region?: string | null
          severity?: number
          source?: string
          summary?: string | null
          title?: string
          updated_at?: string
          url?: string | null
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feed_heartbeats: {
        Row: {
          last_error: string | null
          last_event_count: number
          last_run_at: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_event_count?: number
          last_run_at?: string
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_event_count?: number
          last_run_at?: string
          source?: string
          status?: string
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
      geo_realm_bundles: {
        Row: {
          bbox: Json | null
          created_at: string
          depth_range: Json | null
          description: string | null
          id: string
          is_public: boolean
          kind: string
          layers: Json
          manifest_url: string | null
          name: string
          owner_id: string | null
          source_meta: Json
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          bbox?: Json | null
          created_at?: string
          depth_range?: Json | null
          description?: string | null
          id?: string
          is_public?: boolean
          kind: string
          layers?: Json
          manifest_url?: string | null
          name: string
          owner_id?: string | null
          source_meta?: Json
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          bbox?: Json | null
          created_at?: string
          depth_range?: Json | null
          description?: string | null
          id?: string
          is_public?: boolean
          kind?: string
          layers?: Json
          manifest_url?: string | null
          name?: string
          owner_id?: string | null
          source_meta?: Json
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      geofences: {
        Row: {
          color: string
          created_at: string
          id: string
          lpr_alert: boolean
          name: string
          owner_id: string
          polygon: Json | null
          tile_set: Json
          updated_at: string
          world: string
          zoom: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          lpr_alert?: boolean
          name: string
          owner_id: string
          polygon?: Json | null
          tile_set?: Json
          updated_at?: string
          world?: string
          zoom?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          lpr_alert?: boolean
          name?: string
          owner_id?: string
          polygon?: Json | null
          tile_set?: Json
          updated_at?: string
          world?: string
          zoom?: number
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
      hazard_keywords: {
        Row: {
          created_at: string
          hazard: string
          id: string
          is_primary: boolean
          keyword: string
          lang: string
          lang_name: string | null
          normalized: string
        }
        Insert: {
          created_at?: string
          hazard: string
          id?: string
          is_primary?: boolean
          keyword: string
          lang: string
          lang_name?: string | null
          normalized: string
        }
        Update: {
          created_at?: string
          hazard?: string
          id?: string
          is_primary?: boolean
          keyword?: string
          lang?: string
          lang_name?: string | null
          normalized?: string
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
          manifest: Json | null
          name: string
          owner_id: string
          package_id: string | null
          package_sha256: string | null
          package_size_bytes: number | null
          package_storage_path: string | null
          package_version: string | null
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
          manifest?: Json | null
          name?: string
          owner_id: string
          package_id?: string | null
          package_sha256?: string | null
          package_size_bytes?: number | null
          package_storage_path?: string | null
          package_version?: string | null
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
          manifest?: Json | null
          name?: string
          owner_id?: string
          package_id?: string | null
          package_sha256?: string | null
          package_size_bytes?: number | null
          package_storage_path?: string | null
          package_version?: string | null
          scene?: Json
          shared_with?: string[]
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lpr_access_requests: {
        Row: {
          admin_notes: string | null
          contact_email: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          jurisdictions: string | null
          organization: string | null
          purpose: string
          requester_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          contact_email: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          jurisdictions?: string | null
          organization?: string | null
          purpose: string
          requester_name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          contact_email?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          jurisdictions?: string | null
          organization?: string | null
          purpose?: string
          requester_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lpr_cameras: {
        Row: {
          active: boolean
          agent_uid: string | null
          created_at: string
          id: string
          kind: string
          label: string
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          meta: Json
          rtsp_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          agent_uid?: string | null
          created_at?: string
          id?: string
          kind?: string
          label: string
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          meta?: Json
          rtsp_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          agent_uid?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          meta?: Json
          rtsp_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lpr_geofence_hits: {
        Row: {
          acknowledged: boolean
          geofence_id: string | null
          hit_at: string
          id: string
          plate: string
          read_id: string | null
          user_id: string
        }
        Insert: {
          acknowledged?: boolean
          geofence_id?: string | null
          hit_at?: string
          id?: string
          plate: string
          read_id?: string | null
          user_id: string
        }
        Update: {
          acknowledged?: boolean
          geofence_id?: string | null
          hit_at?: string
          id?: string
          plate?: string
          read_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lpr_geofence_hits_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lpr_geofence_hits_read_id_fkey"
            columns: ["read_id"]
            isOneToOne: false
            referencedRelation: "lpr_plate_reads"
            referencedColumns: ["id"]
          },
        ]
      }
      lpr_plate_reads: {
        Row: {
          camera_id: string | null
          confidence: number | null
          created_at: string
          epoch_ms: number
          id: string
          image_url: string | null
          lat: number | null
          lng: number | null
          plate: string
          raw: Json
          region: string | null
          user_id: string
          vehicle_body: string | null
          vehicle_color: string | null
          vehicle_make: string | null
          vehicle_model: string | null
          vehicle_year: string | null
        }
        Insert: {
          camera_id?: string | null
          confidence?: number | null
          created_at?: string
          epoch_ms: number
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          plate: string
          raw?: Json
          region?: string | null
          user_id: string
          vehicle_body?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
        }
        Update: {
          camera_id?: string | null
          confidence?: number | null
          created_at?: string
          epoch_ms?: number
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          plate?: string
          raw?: Json
          region?: string | null
          user_id?: string
          vehicle_body?: string | null
          vehicle_color?: string | null
          vehicle_make?: string | null
          vehicle_model?: string | null
          vehicle_year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lpr_plate_reads_camera_id_fkey"
            columns: ["camera_id"]
            isOneToOne: false
            referencedRelation: "lpr_cameras"
            referencedColumns: ["id"]
          },
        ]
      }
      lpr_settings: {
        Row: {
          access_mode: string
          byok_api_key: string | null
          created_at: string
          daily_request_cap: number
          legal_ack_at: string | null
          platform_approved: boolean
          requests_reset_at: string
          requests_today: number
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          access_mode?: string
          byok_api_key?: string | null
          created_at?: string
          daily_request_cap?: number
          legal_ack_at?: string | null
          platform_approved?: boolean
          requests_reset_at?: string
          requests_today?: number
          updated_at?: string
          user_id: string
          webhook_secret?: string
        }
        Update: {
          access_mode?: string
          byok_api_key?: string | null
          created_at?: string
          daily_request_cap?: number
          legal_ack_at?: string | null
          platform_approved?: boolean
          requests_reset_at?: string
          requests_today?: number
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      lpr_watchlist: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string | null
          notify: boolean
          plate: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label?: string | null
          notify?: boolean
          plate: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string | null
          notify?: boolean
          plate?: string
          user_id?: string
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
      population_cache: {
        Row: {
          cell_key: string
          fetched_at: string
          id: string
          lat: number
          lng: number
          note: string | null
          raw: Json
          residents_per_km2: number | null
          source: string
        }
        Insert: {
          cell_key: string
          fetched_at?: string
          id?: string
          lat: number
          lng: number
          note?: string | null
          raw?: Json
          residents_per_km2?: number | null
          source: string
        }
        Update: {
          cell_key?: string
          fetched_at?: string
          id?: string
          lat?: number
          lng?: number
          note?: string | null
          raw?: Json
          residents_per_km2?: number | null
          source?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_preferences: Json
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          ai_preferences?: Json
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          ai_preferences?: Json
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      quake_event_files: {
        Row: {
          created_at: string
          description: string | null
          event_id: string
          event_mag: number | null
          event_place: string | null
          event_source: string
          external_url: string | null
          id: string
          is_raw_seismogram: boolean
          kind: string
          metadata: Json
          mime_type: string | null
          name: string
          owner_id: string
          size_bytes: number | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_id: string
          event_mag?: number | null
          event_place?: string | null
          event_source?: string
          external_url?: string | null
          id?: string
          is_raw_seismogram?: boolean
          kind?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          owner_id: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          event_id?: string
          event_mag?: number | null
          event_place?: string | null
          event_source?: string
          external_url?: string | null
          id?: string
          is_raw_seismogram?: boolean
          kind?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          owner_id?: string
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      resources: {
        Row: {
          author_id: string | null
          category: string | null
          confirmations_count: number
          content: string | null
          created_at: string
          description: string | null
          id: string
          is_emergency: boolean
          is_featured: boolean
          is_verified: boolean
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          confirmations_count?: number
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_emergency?: boolean
          is_featured?: boolean
          is_verified?: boolean
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          confirmations_count?: number
          content?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_emergency?: boolean
          is_featured?: boolean
          is_verified?: boolean
          tags?: string[] | null
          title?: string
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
      signal_accounts: {
        Row: {
          auto_topup_enabled: boolean
          auto_topup_pack: string | null
          balance_credits: number
          company_name: string | null
          contact_email: string | null
          country_allowlist: string[]
          created_at: string
          id: string
          lifetime_purchased_credits: number
          lifetime_spent_credits: number
          low_balance_threshold: number
          owner_id: string
          rate_limit_per_day: number
          rate_limit_per_second: number
          status: string
          suspended_reason: string | null
          trial_spend_cap_usd: number
          updated_at: string
        }
        Insert: {
          auto_topup_enabled?: boolean
          auto_topup_pack?: string | null
          balance_credits?: number
          company_name?: string | null
          contact_email?: string | null
          country_allowlist?: string[]
          created_at?: string
          id?: string
          lifetime_purchased_credits?: number
          lifetime_spent_credits?: number
          low_balance_threshold?: number
          owner_id: string
          rate_limit_per_day?: number
          rate_limit_per_second?: number
          status?: string
          suspended_reason?: string | null
          trial_spend_cap_usd?: number
          updated_at?: string
        }
        Update: {
          auto_topup_enabled?: boolean
          auto_topup_pack?: string | null
          balance_credits?: number
          company_name?: string | null
          contact_email?: string | null
          country_allowlist?: string[]
          created_at?: string
          id?: string
          lifetime_purchased_credits?: number
          lifetime_spent_credits?: number
          low_balance_threshold?: number
          owner_id?: string
          rate_limit_per_day?: number
          rate_limit_per_second?: number
          status?: string
          suspended_reason?: string | null
          trial_spend_cap_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_alerts: {
        Row: {
          account_id: string
          body: string
          created_at: string
          credits_charged: number
          hazard: string
          headline: string
          id: string
          lat: number | null
          lon: number | null
          mode: string
          owner_id: string
          radius_km: number
          recipients: number
          severity: number
          status: string
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string
          credits_charged?: number
          hazard: string
          headline: string
          id?: string
          lat?: number | null
          lon?: number | null
          mode?: string
          owner_id: string
          radius_km?: number
          recipients?: number
          severity?: number
          status?: string
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          credits_charged?: number
          hazard?: string
          headline?: string
          id?: string
          lat?: number | null
          lon?: number | null
          mode?: string
          owner_id?: string
          radius_km?: number
          recipients?: number
          severity?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_alerts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_api_keys: {
        Row: {
          account_id: string
          created_at: string
          id: string
          key_hash: string
          last_four: string
          last_used_at: string | null
          mode: string
          name: string
          owner_id: string
          paused: boolean
          prefix: string
          revoked_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          key_hash: string
          last_four: string
          last_used_at?: string | null
          mode?: string
          name: string
          owner_id: string
          paused?: boolean
          prefix: string
          revoked_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          key_hash?: string
          last_four?: string
          last_used_at?: string | null
          mode?: string
          name?: string
          owner_id?: string
          paused?: boolean
          prefix?: string
          revoked_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_credit_transactions: {
        Row: {
          account_id: string
          balance_after: number
          created_at: string
          credits: number
          id: string
          kind: string
          message_id: string | null
          note: string | null
          owner_id: string
          reference: string | null
          usd_amount: number | null
        }
        Insert: {
          account_id: string
          balance_after: number
          created_at?: string
          credits: number
          id?: string
          kind: string
          message_id?: string | null
          note?: string | null
          owner_id: string
          reference?: string | null
          usd_amount?: number | null
        }
        Update: {
          account_id?: string
          balance_after?: number
          created_at?: string
          credits?: number
          id?: string
          kind?: string
          message_id?: string | null
          note?: string | null
          owner_id?: string
          reference?: string | null
          usd_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_credit_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_messages: {
        Row: {
          account_id: string
          alert_id: string | null
          api_key_id: string | null
          body: string
          callback_url: string | null
          cost_usd: number
          country_iso: string | null
          created_at: string
          credits_charged: number
          delivered_at: string | null
          direction: string
          encoding: string
          error_code: string | null
          error_detail: string | null
          from_phone: string | null
          id: string
          mode: string
          owner_id: string
          revenue_usd: number
          segments: number
          status: string
          to_phone: string
          updated_at: string
          upstream_ref: string | null
        }
        Insert: {
          account_id: string
          alert_id?: string | null
          api_key_id?: string | null
          body: string
          callback_url?: string | null
          cost_usd?: number
          country_iso?: string | null
          created_at?: string
          credits_charged?: number
          delivered_at?: string | null
          direction?: string
          encoding?: string
          error_code?: string | null
          error_detail?: string | null
          from_phone?: string | null
          id?: string
          mode?: string
          owner_id: string
          revenue_usd?: number
          segments?: number
          status?: string
          to_phone: string
          updated_at?: string
          upstream_ref?: string | null
        }
        Update: {
          account_id?: string
          alert_id?: string | null
          api_key_id?: string | null
          body?: string
          callback_url?: string | null
          cost_usd?: number
          country_iso?: string | null
          created_at?: string
          credits_charged?: number
          delivered_at?: string | null
          direction?: string
          encoding?: string
          error_code?: string | null
          error_detail?: string | null
          from_phone?: string | null
          id?: string
          mode?: string
          owner_id?: string
          revenue_usd?: number
          segments?: number
          status?: string
          to_phone?: string
          updated_at?: string
          upstream_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_pricing_config: {
        Row: {
          credit_usd_value: number
          floor_usd_per_segment: number
          id: number
          markup_multiplier: number
          updated_at: string
        }
        Insert: {
          credit_usd_value?: number
          floor_usd_per_segment?: number
          id?: number
          markup_multiplier?: number
          updated_at?: string
        }
        Update: {
          credit_usd_value?: number
          floor_usd_per_segment?: number
          id?: number
          markup_multiplier?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_pricing_rates: {
        Row: {
          channel: string
          cost_usd_per_segment: number
          country_iso: string
          country_name: string
          created_at: string
          effective_from: string
          id: string
          sell_usd_per_segment: number
          updated_at: string
        }
        Insert: {
          channel?: string
          cost_usd_per_segment: number
          country_iso: string
          country_name: string
          created_at?: string
          effective_from?: string
          id?: string
          sell_usd_per_segment: number
          updated_at?: string
        }
        Update: {
          channel?: string
          cost_usd_per_segment?: number
          country_iso?: string
          country_name?: string
          created_at?: string
          effective_from?: string
          id?: string
          sell_usd_per_segment?: number
          updated_at?: string
        }
        Relationships: []
      }
      signal_subscriptions: {
        Row: {
          account_id: string
          country_iso: string | null
          created_at: string
          external_ref: string | null
          hazards: string[]
          id: string
          language: string
          lat: number | null
          lon: number | null
          min_severity: number
          owner_id: string
          phone_e164: string
          radius_km: number
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          country_iso?: string | null
          created_at?: string
          external_ref?: string | null
          hazards?: string[]
          id?: string
          language?: string
          lat?: number | null
          lon?: number | null
          min_severity?: number
          owner_id: string
          phone_e164: string
          radius_km?: number
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          country_iso?: string | null
          created_at?: string
          external_ref?: string | null
          hazards?: string[]
          id?: string
          language?: string
          lat?: number | null
          lon?: number | null
          min_severity?: number
          owner_id?: string
          phone_e164?: string
          radius_km?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_usage_daily: {
        Row: {
          account_id: string
          cost_usd: number
          credits_spent: number
          day: string
          id: string
          messages_delivered: number
          messages_failed: number
          messages_sent: number
          owner_id: string
          revenue_usd: number
          updated_at: string
        }
        Insert: {
          account_id: string
          cost_usd?: number
          credits_spent?: number
          day: string
          id?: string
          messages_delivered?: number
          messages_failed?: number
          messages_sent?: number
          owner_id: string
          revenue_usd?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          cost_usd?: number
          credits_spent?: number
          day?: string
          id?: string
          messages_delivered?: number
          messages_failed?: number
          messages_sent?: number
          owner_id?: string
          revenue_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_usage_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          event: string
          id: string
          last_error: string | null
          owner_id: string
          payload: Json
          response_status: number | null
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event: string
          id?: string
          last_error?: string | null
          owner_id: string
          payload?: Json
          response_status?: number | null
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event?: string
          id?: string
          last_error?: string | null
          owner_id?: string
          payload?: Json
          response_status?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "signal_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_webhooks: {
        Row: {
          account_id: string
          created_at: string
          enabled: boolean
          events: string[]
          id: string
          owner_id: string
          signing_secret: string
          updated_at: string
          url: string
        }
        Insert: {
          account_id: string
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          owner_id: string
          signing_secret: string
          updated_at?: string
          url: string
        }
        Update: {
          account_id?: string
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          owner_id?: string
          signing_secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_webhooks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "signal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_inbox: {
        Row: {
          body: string | null
          channel: string
          detected_language: string | null
          from_phone: string
          id: string
          matched_hazards: string[]
          message_sid: string | null
          received_at: string
          reply_sent: string | null
          to_phone: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          detected_language?: string | null
          from_phone: string
          id?: string
          matched_hazards?: string[]
          message_sid?: string | null
          received_at?: string
          reply_sent?: string | null
          to_phone?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          detected_language?: string | null
          from_phone?: string
          id?: string
          matched_hazards?: string[]
          message_sid?: string | null
          received_at?: string
          reply_sent?: string | null
          to_phone?: string | null
        }
        Relationships: []
      }
      sms_location_tokens: {
        Row: {
          created_at: string
          expires_at: string
          phone_e164: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          phone_e164: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          phone_e164?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      sms_outbox: {
        Row: {
          body: string
          channel: string
          created_at: string
          error: string | null
          event_id: string | null
          hazard_type: string | null
          id: string
          message_sid: string | null
          severity: number | null
          status: string
          to_phone: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          hazard_type?: string | null
          id?: string
          message_sid?: string | null
          severity?: number | null
          status?: string
          to_phone: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string | null
          hazard_type?: string | null
          id?: string
          message_sid?: string | null
          severity?: number | null
          status?: string
          to_phone?: string
        }
        Relationships: []
      }
      sms_subscribers: {
        Row: {
          city: string | null
          consent_at: string | null
          country: string | null
          country_code: string | null
          created_at: string
          hazards: string[]
          id: string
          language: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          lat: number | null
          lon: number | null
          min_severity: number
          pending_hazards: string[]
          phone_e164: string
          precise_location: boolean
          radius_km: number
          region: string | null
          state: string
          stopped_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          city?: string | null
          consent_at?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          hazards?: string[]
          id?: string
          language?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lat?: number | null
          lon?: number | null
          min_severity?: number
          pending_hazards?: string[]
          phone_e164: string
          precise_location?: boolean
          radius_km?: number
          region?: string | null
          state?: string
          stopped_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          city?: string | null
          consent_at?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          hazards?: string[]
          id?: string
          language?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          lat?: number | null
          lon?: number | null
          min_severity?: number
          pending_hazards?: string[]
          phone_e164?: string
          precise_location?: boolean
          radius_km?: number
          region?: string | null
          state?: string
          stopped_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      sos_posts: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          hazard_type: string | null
          id: string
          is_pinned: boolean
          kind: string
          lat: number | null
          like_count: number
          lon: number | null
          media_url: string | null
          region: string | null
          severity: number | null
          share_count: number
          source_url: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          hazard_type?: string | null
          id?: string
          is_pinned?: boolean
          kind: string
          lat?: number | null
          like_count?: number
          lon?: number | null
          media_url?: string | null
          region?: string | null
          severity?: number | null
          share_count?: number
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          hazard_type?: string | null
          id?: string
          is_pinned?: boolean
          kind?: string
          lat?: number | null
          like_count?: number
          lon?: number | null
          media_url?: string | null
          region?: string | null
          severity?: number | null
          share_count?: number
          source_url?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      splat_landmarks: {
        Row: {
          altitude: number
          created_at: string
          description: string | null
          file_path: string
          file_size_bytes: number | null
          heading: number
          id: string
          latitude: number
          longitude: number
          name: string
          owner_id: string | null
          pitch: number
          radius_m: number
          roll: number
          scale: number
          updated_at: string
          world: string
        }
        Insert: {
          altitude?: number
          created_at?: string
          description?: string | null
          file_path: string
          file_size_bytes?: number | null
          heading?: number
          id?: string
          latitude: number
          longitude: number
          name: string
          owner_id?: string | null
          pitch?: number
          radius_m?: number
          roll?: number
          scale?: number
          updated_at?: string
          world?: string
        }
        Update: {
          altitude?: number
          created_at?: string
          description?: string | null
          file_path?: string
          file_size_bytes?: number | null
          heading?: number
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          owner_id?: string | null
          pitch?: number
          radius_m?: number
          roll?: number
          scale?: number
          updated_at?: string
          world?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tile_cards: {
        Row: {
          center_lat: number | null
          center_lng: number | null
          created_at: string
          id: string
          indicators: Json
          is_public: boolean
          metrics: Json
          notes: string | null
          owner_id: string
          tags: string[]
          title: string | null
          updated_at: string
          x: number
          y: number
          z: number
        }
        Insert: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          indicators?: Json
          is_public?: boolean
          metrics?: Json
          notes?: string | null
          owner_id: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          x: number
          y: number
          z: number
        }
        Update: {
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          id?: string
          indicators?: Json
          is_public?: boolean
          metrics?: Json
          notes?: string | null
          owner_id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
          x?: number
          y?: number
          z?: number
        }
        Relationships: []
      }
      tile_intel_actions: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: string
          name: string
          owner_id: string
          secret: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          name: string
          owner_id: string
          secret?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tile_intel_event_deliveries: {
        Row: {
          action_id: string
          attempts: number
          created_at: string
          event_id: string
          id: string
          last_error: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_id: string
          attempts?: number
          created_at?: string
          event_id: string
          id?: string
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          attempts?: number
          created_at?: string
          event_id?: string
          id?: string
          last_error?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tile_intel_event_deliveries_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tile_intel_event_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tile_intel_events: {
        Row: {
          ai_confidence: number | null
          fired_at: string
          id: string
          owner_id: string
          read_at: string | null
          rule_id: string
          sample: Json
        }
        Insert: {
          ai_confidence?: number | null
          fired_at?: string
          id?: string
          owner_id: string
          read_at?: string | null
          rule_id: string
          sample?: Json
        }
        Update: {
          ai_confidence?: number | null
          fired_at?: string
          id?: string
          owner_id?: string
          read_at?: string | null
          rule_id?: string
          sample?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tile_intel_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tile_intel_forecasts: {
        Row: {
          created_at: string
          horizon_s: number
          id: string
          model: string
          owner_id: string
          prediction: Json
          rule_id: string
        }
        Insert: {
          created_at?: string
          horizon_s: number
          id?: string
          model: string
          owner_id: string
          prediction?: Json
          rule_id: string
        }
        Update: {
          created_at?: string
          horizon_s?: number
          id?: string
          model?: string
          owner_id?: string
          prediction?: Json
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tile_intel_forecasts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tile_intel_rule_actions: {
        Row: {
          action_id: string
          rule_id: string
        }
        Insert: {
          action_id: string
          rule_id: string
        }
        Update: {
          action_id?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tile_intel_rule_actions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tile_intel_rule_actions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tile_intel_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tile_intel_rules: {
        Row: {
          ai_assist: boolean
          ai_model: string | null
          condition: string
          cooldown_s: number
          created_at: string
          enabled: boolean
          firehose: boolean
          geofence_id: string | null
          id: string
          last_fired_at: string | null
          name: string
          owner_id: string
          source_kind: string
          source_ref: Json
          threshold: Json
          updated_at: string
        }
        Insert: {
          ai_assist?: boolean
          ai_model?: string | null
          condition: string
          cooldown_s?: number
          created_at?: string
          enabled?: boolean
          firehose?: boolean
          geofence_id?: string | null
          id?: string
          last_fired_at?: string | null
          name: string
          owner_id: string
          source_kind: string
          source_ref?: Json
          threshold?: Json
          updated_at?: string
        }
        Update: {
          ai_assist?: boolean
          ai_model?: string | null
          condition?: string
          cooldown_s?: number
          created_at?: string
          enabled?: boolean
          firehose?: boolean
          geofence_id?: string | null
          id?: string
          last_fired_at?: string | null
          name?: string
          owner_id?: string
          source_kind?: string
          source_ref?: Json
          threshold?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tile_intel_rules_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
        ]
      }
      user_alert_subscriptions: {
        Row: {
          channels: string[]
          created_at: string
          enabled: boolean
          geofences: Json
          hazard_types: string[]
          id: string
          min_magnitude: number
          min_severity: number
          phone_e164: string | null
          quiet_hours_end: number | null
          quiet_hours_start: number | null
          updated_at: string
          user_id: string
          worldwide: boolean
        }
        Insert: {
          channels?: string[]
          created_at?: string
          enabled?: boolean
          geofences?: Json
          hazard_types?: string[]
          id?: string
          min_magnitude?: number
          min_severity?: number
          phone_e164?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
          user_id: string
          worldwide?: boolean
        }
        Update: {
          channels?: string[]
          created_at?: string
          enabled?: boolean
          geofences?: Json
          hazard_types?: string[]
          id?: string
          min_magnitude?: number
          min_severity?: number
          phone_e164?: string | null
          quiet_hours_end?: number | null
          quiet_hours_start?: number | null
          updated_at?: string
          user_id?: string
          worldwide?: boolean
        }
        Relationships: []
      }
      user_datasets: {
        Row: {
          bbox: Json | null
          created_at: string
          id: string
          ingest_token: string
          kind: string
          name: string
          owner_id: string
          sample_count: number
          stats: Json
          storage_path: string | null
          units: string | null
          updated_at: string
          world: string
        }
        Insert: {
          bbox?: Json | null
          created_at?: string
          id?: string
          ingest_token?: string
          kind: string
          name: string
          owner_id: string
          sample_count?: number
          stats?: Json
          storage_path?: string | null
          units?: string | null
          updated_at?: string
          world?: string
        }
        Update: {
          bbox?: Json | null
          created_at?: string
          id?: string
          ingest_token?: string
          kind?: string
          name?: string
          owner_id?: string
          sample_count?: number
          stats?: Json
          storage_path?: string | null
          units?: string | null
          updated_at?: string
          world?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_atlas_admin: { Args: never; Returns: boolean }
      confirm_emergency_resource: {
        Args: { _resource_id: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_user_by_username: {
        Args: { _q: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
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
      signal_reserve_credits: {
        Args: {
          _account_id: string
          _credits: number
          _kind: string
          _message_id: string
          _note: string
          _reference: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "atlas_admin" | "moderator" | "user"
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
      app_role: ["atlas_admin", "moderator", "user"],
      friendship_status: ["pending", "accepted", "blocked"],
      share_status: ["pending", "accepted", "declined"],
    },
  },
} as const
