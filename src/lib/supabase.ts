import { createClient } from "@supabase/supabase-js";

export type RoomRow = {
  id: string;
  room_code: string;
  status: string;
  current_phase: string;
  east_player_id: string | null;
  south_player_id: string | null;
  game_state: unknown;
  created_at: string;
  updated_at: string;
};

export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
}
