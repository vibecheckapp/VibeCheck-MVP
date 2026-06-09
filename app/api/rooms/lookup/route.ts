import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('roomCode');
  const playerId = searchParams.get('playerId');

  if (!roomCode) {
    return NextResponse.json({ error: 'Missing roomCode' }, { status: 400 });
  }

  // Normalize roomCode to uppercase for consistency with other routes
  const normalizedRoomCode = roomCode.toUpperCase();

  const supabaseAdmin = getSupabaseAdmin();

  console.log('[Lookup] Looking for room with code:', normalizedRoomCode);

  // Get basic room info first (without settings - may not exist in all databases)
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, room_code, host_id, active_round_id')
    .eq('room_code', normalizedRoomCode)
    .single();

if (roomError || !room) {
    console.log('[Lookup] Room not found for code:', normalizedRoomCode, 'Error:', roomError);
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  console.log('[Lookup] Room found:', room);

  // Fix: Clean up orphaned active_round_id if it points to a non-existent round
  // This prevents 404 errors when the frontend tries to fetch round data
  if (room.active_round_id) {
    const { data: roundExists } = await supabaseAdmin
      .from('rounds')
      .select('id')
      .eq('id', room.active_round_id)
      .single();

    if (!roundExists) {
      console.log('[Lookup] Cleaning up orphaned active_round_id:', room.active_round_id);
      await supabaseAdmin
        .from('rooms')
        .update({ active_round_id: null })
        .eq('id', room.id);
      // Update local room object to reflect the fix
      room.active_round_id = null;
    }
  }

  // Try to get settings if column exists (optional column)
  let settings = null;
  try {
    const { data: roomWithSettings } = await supabaseAdmin
      .from('rooms')
      .select('settings')
      .eq('room_code', normalizedRoomCode)
      .single();
    settings = roomWithSettings?.settings ?? null;
  } catch {
    // Settings column doesn't exist, continue without it
    console.log('[Lookup] Settings column not found, continuing without it');
  }

  // Add settings to room object if it exists
  const roomWithSettings = settings ? { ...room, settings } : room;

const { data: roomPlayers, error: roomPlayersError } = await supabaseAdmin
    .from('room_players')
    .select('id, user_id, joined_at, last_seen, theme_preference, users(id, display_name, spotify_refresh_token)')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true });

  if (roomPlayersError) {
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 });
  }

// P0: Include last_seen for disconnect detection, theme_preference for per-player theming
  const players = roomPlayers.map((entry: any) => ({
    id: entry.user_id,
    name: entry.users?.display_name ?? 'Unknown',
    spotify_connected: Boolean(entry.users?.spotify_refresh_token),
    last_seen: entry.last_seen ?? null,
    theme_preference: entry.theme_preference ?? 'dark',
  }));

// Handle case where playerId is provided but player not found (new player joining)
  let currentPlayer = null;
  if (playerId) {
    const found = players.find((player) => player.id === playerId);
    if (found) {
      currentPlayer = found;
    }
  }

return NextResponse.json({ room: roomWithSettings, players, currentPlayer, theme: currentPlayer?.theme_preference ?? 'dark' });
}
