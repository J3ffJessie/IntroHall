export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          avatar_path: string | null;
          company: string;
          created_at: string;
          deleted_at: string | null;
          full_name: string;
          headline: string;
          links: NonNullable<Json>;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          company?: string;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string;
          headline?: string;
          links?: NonNullable<Json>;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_path?: string | null;
          company?: string;
          created_at?: string;
          deleted_at?: string | null;
          full_name?: string;
          headline?: string;
          links?: NonNullable<Json>;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      announcements: {
        Row: {
          author_user: string | null;
          body: string;
          created_at: string;
          event_id: string;
          id: string;
          pinned: boolean;
          publish_at: string | null;
          published_at: string | null;
          push_enqueued_at: string | null;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          author_user?: string | null;
          body?: string;
          created_at?: string;
          event_id: string;
          id?: string;
          pinned?: boolean;
          publish_at?: string | null;
          published_at?: string | null;
          push_enqueued_at?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          author_user?: string | null;
          body?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          pinned?: boolean;
          publish_at?: string | null;
          published_at?: string | null;
          push_enqueued_at?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_author_user_fkey";
            columns: ["author_user"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "announcements_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      attendee_interests: {
        Row: {
          attendee_id: string;
          event_id: string;
          tag_id: string;
        };
        ComputedFields: never;
        Insert: {
          attendee_id: string;
          event_id: string;
          tag_id: string;
        };
        Update: {
          attendee_id?: string;
          event_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendee_interests_attendee_id_fkey";
            columns: ["attendee_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendee_interests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendee_interests_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "interest_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      attendees: {
        Row: {
          banned_at: string | null;
          bio: string;
          completed_at: string | null;
          event_id: string;
          id: string;
          joined_at: string;
          joined_via: string;
          left_at: string | null;
          looking_for: string;
          user_id: string;
          visibility: string;
        };
        ComputedFields: never;
        Insert: {
          banned_at?: string | null;
          bio?: string;
          completed_at?: string | null;
          event_id: string;
          id?: string;
          joined_at?: string;
          joined_via: string;
          left_at?: string | null;
          looking_for?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          banned_at?: string | null;
          bio?: string;
          completed_at?: string | null;
          event_id?: string;
          id?: string;
          joined_at?: string;
          joined_via?: string;
          left_at?: string | null;
          looking_for?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendees_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendees_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_attendee: string;
          blocker_attendee: string;
          created_at: string;
          event_id: string;
        };
        ComputedFields: never;
        Insert: {
          blocked_attendee: string;
          blocker_attendee: string;
          created_at?: string;
          event_id: string;
        };
        Update: {
          blocked_attendee?: string;
          blocker_attendee?: string;
          created_at?: string;
          event_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_attendee_fkey";
            columns: ["blocked_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_blocker_attendee_fkey";
            columns: ["blocker_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "blocks_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      connection_requests: {
        Row: {
          created_at: string;
          event_id: string;
          from_attendee: string;
          id: string;
          note: string;
          responded_at: string | null;
          status: string;
          to_attendee: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          event_id: string;
          from_attendee: string;
          id?: string;
          note?: string;
          responded_at?: string | null;
          status?: string;
          to_attendee: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          from_attendee?: string;
          id?: string;
          note?: string;
          responded_at?: string | null;
          status?: string;
          to_attendee?: string;
        };
        Relationships: [
          {
            foreignKeyName: "connection_requests_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_from_attendee_fkey";
            columns: ["from_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "connection_requests_to_attendee_fkey";
            columns: ["to_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_participants: {
        Row: {
          attendee_id: string;
          conversation_id: string;
          last_push_at: string | null;
          last_read_at: string;
          last_seen_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          attendee_id: string;
          conversation_id: string;
          last_push_at?: string | null;
          last_read_at?: string;
          last_seen_at?: string | null;
        };
        Update: {
          attendee_id?: string;
          conversation_id?: string;
          last_push_at?: string | null;
          last_read_at?: string;
          last_seen_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_attendee_id_fkey";
            columns: ["attendee_id"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          attendee_hi: string | null;
          attendee_lo: string | null;
          created_at: string;
          event_id: string;
          id: string;
          last_message_at: string | null;
          read_only_reason: string | null;
        };
        ComputedFields: never;
        Insert: {
          attendee_hi?: string | null;
          attendee_lo?: string | null;
          created_at?: string;
          event_id: string;
          id?: string;
          last_message_at?: string | null;
          read_only_reason?: string | null;
        };
        Update: {
          attendee_hi?: string | null;
          attendee_lo?: string | null;
          created_at?: string;
          event_id?: string;
          id?: string;
          last_message_at?: string | null;
          read_only_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_attendee_hi_fkey";
            columns: ["attendee_hi"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_attendee_lo_fkey";
            columns: ["attendee_lo"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_assets: {
        Row: {
          alt: string;
          created_at: string;
          event_id: string;
          height: number | null;
          id: string;
          kind: string;
          storage_path: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          alt?: string;
          created_at?: string;
          event_id: string;
          height?: number | null;
          id?: string;
          kind: string;
          storage_path: string;
          width?: number | null;
        };
        Update: {
          alt?: string;
          created_at?: string;
          event_id?: string;
          height?: number | null;
          id?: string;
          kind?: string;
          storage_path?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_assets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_secrets: {
        Row: {
          event_id: string;
          join_code_hash: string | null;
          rotated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          join_code_hash?: string | null;
          rotated_at?: string | null;
        };
        Update: {
          event_id?: string;
          join_code_hash?: string | null;
          rotated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "event_secrets_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_stats: {
        Row: {
          event_id: string;
          n: number;
          rebuilt_at: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          n: number;
          rebuilt_at?: string;
        };
        Update: {
          event_id?: string;
          n?: number;
          rebuilt_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_stats_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: true;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_tag_stats: {
        Row: {
          count: number;
          event_id: string;
          tag_id: string;
        };
        ComputedFields: never;
        Insert: {
          count: number;
          event_id: string;
          tag_id: string;
        };
        Update: {
          count?: number;
          event_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_tag_stats_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_tag_stats_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "interest_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          allow_custom_interests: boolean;
          created_at: string;
          deleted_at: string | null;
          description: string;
          ends_at: string;
          id: string;
          join_mode: string;
          max_custom_interests: number;
          name: string;
          org_id: string;
          org_suspended: boolean;
          published_at: string | null;
          retention_days: number;
          slug: string;
          starts_at: string;
          stats_dirty: boolean;
          status: string;
          timezone: string;
          updated_at: string;
          venue: string;
        };
        ComputedFields: never;
        Insert: {
          allow_custom_interests?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          ends_at: string;
          id?: string;
          join_mode?: string;
          max_custom_interests?: number;
          name: string;
          org_id: string;
          org_suspended?: boolean;
          published_at?: string | null;
          retention_days?: number;
          slug: string;
          starts_at: string;
          stats_dirty?: boolean;
          status?: string;
          timezone: string;
          updated_at?: string;
          venue?: string;
        };
        Update: {
          allow_custom_interests?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          ends_at?: string;
          id?: string;
          join_mode?: string;
          max_custom_interests?: number;
          name?: string;
          org_id?: string;
          org_suspended?: boolean;
          published_at?: string | null;
          retention_days?: number;
          slug?: string;
          starts_at?: string;
          stats_dirty?: boolean;
          status?: string;
          timezone?: string;
          updated_at?: string;
          venue?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      interest_tags: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_id: string;
          hidden: boolean;
          id: string;
          is_official: boolean;
          label: string;
          merged_into: string | null;
          normalized: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_id: string;
          hidden?: boolean;
          id?: string;
          is_official?: boolean;
          label: string;
          merged_into?: string | null;
          normalized?: never;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          event_id?: string;
          hidden?: boolean;
          id?: string;
          is_official?: boolean;
          label?: string;
          merged_into?: string | null;
          normalized?: never;
        };
        Relationships: [
          {
            foreignKeyName: "interest_tags_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "interest_tags_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interest_tags_merged_into_fkey";
            columns: ["merged_into"];
            isOneToOne: false;
            referencedRelation: "interest_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      join_attempts: {
        Row: {
          at: string;
          event_id: string;
          id: number;
          ip_hash: string | null;
          success: boolean;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          at?: string;
          event_id: string;
          id?: never;
          ip_hash?: string | null;
          success: boolean;
          user_id?: string | null;
        };
        Update: {
          at?: string;
          event_id?: string;
          id?: never;
          ip_hash?: string | null;
          success?: boolean;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "join_attempts_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          client_msg_id: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_attendee: string | null;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          client_msg_id: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_attendee?: string | null;
        };
        Update: {
          body?: string;
          client_msg_id?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_attendee?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_attendee_fkey";
            columns: ["sender_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
        ];
      };
      org_invites: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          org_id: string;
          role: string;
          token_hash: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id: string;
          role: string;
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          org_id?: string;
          role?: string;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "org_invites_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string;
          org_id: string;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          org_id: string;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          org_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      organizations: {
        Row: {
          attendee_limit: number | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          plan: string;
          slug: string;
          suspended_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          attendee_limit?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          plan?: string;
          slug: string;
          suspended_at?: string | null;
        };
        Update: {
          attendee_limit?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          plan?: string;
          slug?: string;
          suspended_at?: string | null;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      push_subscription_events: {
        Row: {
          event_id: string;
          subscription_id: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          subscription_id: string;
        };
        Update: {
          event_id?: string;
          subscription_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscription_events_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscription_events_subscription_id_fkey";
            columns: ["subscription_id"];
            isOneToOne: false;
            referencedRelation: "push_subscriptions";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_success_at: string | null;
          p256dh: string;
          user_agent: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_success_at?: string | null;
          p256dh: string;
          user_agent?: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_success_at?: string | null;
          p256dh?: string;
          user_agent?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
        ];
      };
      reports: {
        Row: {
          event_id: string;
          id: string;
          message_id: string | null;
          message_snapshot: string | null;
          reason: string;
          reported_at: string;
          reporter: string | null;
          resolution_note: string;
          resolved_at: string | null;
          resolved_by: string | null;
          sender_snapshot: NonNullable<Json>;
          status: string;
          target_attendee: string | null;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          id?: string;
          message_id?: string | null;
          message_snapshot?: string | null;
          reason: string;
          reported_at?: string;
          reporter?: string | null;
          resolution_note?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          sender_snapshot?: NonNullable<Json>;
          status?: string;
          target_attendee?: string | null;
        };
        Update: {
          event_id?: string;
          id?: string;
          message_id?: string | null;
          message_snapshot?: string | null;
          reason?: string;
          reported_at?: string;
          reporter?: string | null;
          resolution_note?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          sender_snapshot?: NonNullable<Json>;
          status?: string;
          target_attendee?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "reports_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_reporter_fkey";
            columns: ["reporter"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_resolved_by_fkey";
            columns: ["resolved_by"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "reports_target_attendee_fkey";
            columns: ["target_attendee"];
            isOneToOne: false;
            referencedRelation: "attendees";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      account_deletion_blockers: {
        Args: Record<PropertyKey, never>;
        Returns: {
          name: string;
          org_id: string;
        }[];
      };
      admin_find_users: {
        Args: { p_email: string };
        Returns: {
          created_at: string;
          email: string;
          events: number;
          full_name: string;
          suspended: boolean;
          user_id: string;
        }[];
      };
      admin_list_orgs: {
        Args: { p_search?: string };
        Returns: {
          created_at: string;
          deleted_at: string;
          events: number;
          members: number;
          name: string;
          org_id: string;
          owners: string[];
          slug: string;
          suspended_at: string;
        }[];
      };
      admin_set_org_suspended: {
        Args: { p_org_id: string; p_suspended: boolean };
        Returns: string[];
      };
      admin_set_user_suspended: {
        Args: { p_suspended: boolean; p_user_id: string };
        Returns: undefined;
      };
      am_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      archive_event: { Args: { p_event_id: string }; Returns: undefined };
      block_attendee: { Args: { p_attendee_id: string }; Returns: undefined };
      create_invite: {
        Args: { p_email: string; p_org_id: string; p_role: string };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
      delete_account_data: { Args: { p_user_id: string }; Returns: undefined };
      delete_event: { Args: { p_event_id: string }; Returns: undefined };
      delete_organization: { Args: { p_org_id: string }; Returns: undefined };
      export_my_data: { Args: Record<PropertyKey, never>; Returns: Json };
      get_connections: {
        Args: { p_event_id: string };
        Returns: {
          company: string;
          conversation_id: string;
          created_at: string;
          direction: string;
          full_name: string;
          headline: string;
          note: string;
          other_attendee: string;
          request_id: string;
          status: string;
        }[];
      };
      get_conversations: {
        Args: { p_event_id: string };
        Returns: {
          conversation_id: string;
          full_name: string;
          headline: string;
          last_message: string;
          last_message_at: string;
          other_attendee: string;
          read_only_reason: string;
          unread: number;
        }[];
      };
      get_deleted_events: {
        Args: { p_org_id: string };
        Returns: {
          deleted_at: string;
          event_id: string;
          name: string;
          purge_after: string;
          slug: string;
        }[];
      };
      get_event_analytics: { Args: { p_event_id: string }; Returns: Json };
      get_event_roster: {
        Args: { p_event_id: string };
        Returns: {
          attendee_id: string;
          banned_at: string;
          company: string;
          completed_at: string;
          full_name: string;
          headline: string;
          joined_at: string;
          joined_via: string;
          left_at: string;
        }[];
      };
      get_event_tag_counts: {
        Args: { p_event_id: string };
        Returns: {
          holders: number;
          label: string;
          mine: boolean;
          tag_id: string;
        }[];
      };
      get_matches: {
        Args: {
          p_event_id: string;
          p_limit?: number;
          p_mode?: string;
          p_offset?: number;
          p_tag?: string;
        };
        Returns: {
          attendee_id: string;
          avatar_path: string;
          bio: string;
          company: string;
          completed_at: string;
          full_name: string;
          headline: string;
          looking_for: string;
          score: number;
          shared_tags: string[];
        }[];
      };
      get_reports: {
        Args: { p_event_id: string };
        Returns: {
          message_snapshot: string;
          reason: string;
          report_id: string;
          reported_at: string;
          reporter_name: string;
          resolution_note: string;
          resolved_at: string;
          sender_snapshot: Json;
          status: string;
          target_attendee: string;
          target_banned: boolean;
          target_left: boolean;
          target_name: string;
        }[];
      };
      join_event: {
        Args: { p_code?: string; p_slug: string };
        Returns: {
          attendee_id: string;
          status: string;
        }[];
      };
      leave_event: { Args: { p_event_id: string }; Returns: undefined };
      merge_tags: {
        Args: { p_from: string; p_into: string };
        Returns: undefined;
      };
      publish_announcement: {
        Args: { p_announcement_id: string };
        Returns: undefined;
      };
      publish_event: { Args: { p_event_id: string }; Returns: undefined };
      purge_deleted_orgs: { Args: Record<PropertyKey, never>; Returns: number };
      purge_event: { Args: { p_event_id: string }; Returns: undefined };
      purge_targets: {
        Args: Record<PropertyKey, never>;
        Returns: {
          event_id: string;
          org_id: string;
        }[];
      };
      remove_attendee: {
        Args: { p_attendee_id: string; p_ban?: boolean };
        Returns: undefined;
      };
      remove_org_member: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: undefined;
      };
      remove_push_subscription: {
        Args: { p_endpoint: string };
        Returns: undefined;
      };
      report_attendee: {
        Args: {
          p_attendee_id: string;
          p_message_id?: string;
          p_reason: string;
        };
        Returns: string;
      };
      resolve_report: {
        Args: { p_note?: string; p_report_id: string };
        Returns: undefined;
      };
      respond_request: {
        Args: { p_accept: boolean; p_request_id: string };
        Returns: string;
      };
      restore_event: { Args: { p_event_id: string }; Returns: undefined };
      rotate_join_code: { Args: { p_event_id: string }; Returns: string };
      save_push_subscription: {
        Args: {
          p_auth: string;
          p_endpoint: string;
          p_event_id: string;
          p_p256dh: string;
          p_user_agent?: string;
        };
        Returns: undefined;
      };
      send_message: {
        Args: {
          p_body: string;
          p_client_msg_id: string;
          p_conversation_id: string;
        };
        Returns: {
          body: string;
          client_msg_id: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_attendee: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "messages";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      send_request: {
        Args: { p_note?: string; p_to_attendee: string };
        Returns: string;
      };
      touch_conversation: {
        Args: { p_conversation_id: string };
        Returns: undefined;
      };
      unban_attendee: { Args: { p_attendee_id: string }; Returns: undefined };
      unpublish_event: { Args: { p_event_id: string }; Returns: undefined };
      upsert_interests: {
        Args: {
          p_custom_labels?: string[];
          p_event_id: string;
          p_tag_ids: string[];
        };
        Returns: undefined;
      };
      withdraw_request: { Args: { p_request_id: string }; Returns: undefined };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
