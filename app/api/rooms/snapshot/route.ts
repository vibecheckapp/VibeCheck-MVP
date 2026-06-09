import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');
  const roomCode = searchParams.get('roomCode');

  if (!roomId && !roomCode) {
    return NextResponse.json({ error: 'Missing roomId or roomCode' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  let room;
  let roomError;

  // Align with /api/rooms/lookup: primary lookup by roomCode when provided
  if (roomCode) {
    const result = await supabaseAdmin
      .from('rooms')
      .select('id, room_code, host_id, active_round_id')
      .eq('room_code', roomCode.toUpperCase())
      .single();
    room = result.data as any;
    roomError = result.error;

    // Optional settings
    if (room && !roomError) {
      try {
        const { data: roomWithSettings } = await supabaseAdmin
          .from('rooms')
          .select('settings, current_state, current_round, current_song, state_version')
          .eq('room_code', roomCode.toUpperCase())
          .single();
        room = {
          ...room,
          settings: roomWithSettings?.settings ?? null,
          current_state: (roomWithSettings as any)?.current_state ?? null,
          current_round: (roomWithSettings as any)?.current_round ?? 0,
          current_song: (roomWithSettings as any)?.current_song ?? null,
          state_version: Number((roomWithSettings as any)?.state_version ?? 0),
        };
      } catch {
        room = { ...room, settings: null, current_state: null, current_round: 0, current_song: null, state_version: 0 };
      }
    }
  }

  // Fallback to roomId when roomCode not provided or roomCode lookup failed
  if ((!room || roomError) && roomId) {
    const fallback = await supabaseAdmin
      .from('rooms')
      .select('id, room_code, host_id, active_round_id')
      .eq('id', roomId)
      .single();
    room = fallback.data as any;
    roomError = fallback.error;

    if (room && !roomError) {
      try {
        const { data: roomWithSettings } = await supabaseAdmin
          .from('rooms')
          .select('settings, current_state, current_round, current_song, state_version')
          .eq('id', roomId)
          .single();
        room = {
          ...room,
          settings: roomWithSettings?.settings ?? null,
          current_state: (roomWithSettings as any)?.current_state ?? null,
          current_round: (roomWithSettings as any)?.current_round ?? 0,
          current_song: (roomWithSettings as any)?.current_song ?? null,
          state_version: Number((roomWithSettings as any)?.state_version ?? 0),
        };
      } catch {
        room = { ...room, settings: null, current_state: null, current_round: 0, current_song: null, state_version: 0 };
      }
    }
  }

  if (roomError || !room) {
    console.warn('[Snapshot] Room not found', { roomId, roomCode, error: roomError?.message });
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { data: roomPlayers, error: roomPlayersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id, joined_at, last_seen, users(id, display_name, spotify_refresh_token)')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true });

  if (roomPlayersError) {
    return NextResponse.json({ error: 'Failed to load room players' }, { status: 500 });
  }

  const players = (roomPlayers ?? []).map((entry: any) => ({
    id: entry.user_id,
    name: entry.users?.display_name ?? 'Unknown',
    spotify_connected: Boolean(entry.users?.spotify_refresh_token),
    last_seen: entry.last_seen ?? null,
  }));

  return NextResponse.json({
    room,
    players,
    votes: [],
    song_history: [],
  });
}
