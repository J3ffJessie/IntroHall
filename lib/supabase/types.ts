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
          id?: string;
          name: string;
          plan?: string;
          slug: string;
          suspended_at?: string | null;
        };
        Update: {
          attendee_limit?: number | null;
          created_at?: string;
          id?: string;
          name?: string;
          plan?: string;
          slug?: string;
          suspended_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string };
      archive_event: { Args: { p_event_id: string }; Returns: undefined };
      create_invite: {
        Args: { p_email: string; p_org_id: string; p_role: string };
        Returns: string;
      };
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: string;
      };
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
      join_event: {
        Args: { p_code?: string; p_slug: string };
        Returns: {
          attendee_id: string;
          status: string;
        }[];
      };
      leave_event: { Args: { p_event_id: string }; Returns: undefined };
      publish_event: { Args: { p_event_id: string }; Returns: undefined };
      remove_attendee: {
        Args: { p_attendee_id: string; p_ban?: boolean };
        Returns: undefined;
      };
      remove_org_member: {
        Args: { p_org_id: string; p_user_id: string };
        Returns: undefined;
      };
      rotate_join_code: { Args: { p_event_id: string }; Returns: string };
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
