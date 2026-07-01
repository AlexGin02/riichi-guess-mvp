"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { GameState, createInitialGame, joinGame } from "./game";
import type { RoomRow } from "./supabase";

export function getOrCreatePlayerId(): string {
  const key = "riichi-guess-player-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
}

export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function seatForPlayer(state: GameState, playerId: string) {
  if (state.eastPlayerId === playerId) {
    return "east" as const;
  }
  if (state.southPlayerId === playerId) {
    return "south" as const;
  }
  return null;
}

export async function createRoom(supabase: SupabaseClient, playerId: string): Promise<RoomRow> {
  let data: RoomRow | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3 && !data; attempt += 1) {
    const roomCode = makeRoomCode();
    const state = createInitialGame(roomCode, playerId);
    const result = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        status: "waiting",
        current_phase: state.phase,
        east_player_id: playerId,
        game_state: state
      })
      .select("*")
      .single();

    if (result.error) {
      lastError = result.error;
      continue;
    }

    data = result.data as RoomRow;
  }

  if (!data) {
    throw lastError ?? new Error("Could not create a unique room code.");
  }

  const state = data.game_state as GameState;

  const { error: playerError } = await supabase.from("players").insert({
    room_id: data.id,
    id: playerId,
    seat: "east",
    hand_json: state.players.east?.hand ?? [],
    river_json: []
  });

  if (playerError) {
    throw playerError;
  }

  return data as RoomRow;
}

export async function joinRoom(supabase: SupabaseClient, roomCode: string, playerId: string): Promise<RoomRow> {
  const { data: room, error: loadError } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", roomCode.toUpperCase())
    .single();

  if (loadError) {
    throw loadError;
  }

  const currentState = room.game_state as GameState;
  if (currentState.eastPlayerId === playerId || currentState.southPlayerId === playerId) {
    return room as RoomRow;
  }
  const nextState = joinGame(currentState, playerId);
  const { data, error } = await supabase
    .from("rooms")
    .update({
      status: "playing",
      current_phase: nextState.phase,
      south_player_id: playerId,
      game_state: nextState
    })
    .eq("id", room.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const { error: playerError } = await supabase.from("players").upsert({
    room_id: room.id,
    id: playerId,
    seat: "south",
    hand_json: nextState.players.south?.hand ?? [],
    river_json: []
  });

  if (playerError) {
    throw playerError;
  }

  return data as RoomRow;
}

export async function saveGameState(supabase: SupabaseClient, roomId: string, state: GameState): Promise<RoomRow> {
  const { data, error } = await supabase
    .from("rooms")
    .update({
      status: state.phase === "waiting" ? "waiting" : state.phase === "game_over" ? "finished" : "playing",
      current_phase: state.phase,
      east_player_id: state.eastPlayerId,
      south_player_id: state.southPlayerId,
      game_state: state
    })
    .eq("id", roomId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as RoomRow;
}
