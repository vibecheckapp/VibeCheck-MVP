import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get('roomCode');
  const playerId = searchParams.get('playerId');

  if (!roomCode) {
    return NextResponse.json({ error: 'Missing roomCode' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, room_code, host_id, active_round_id')
    .eq('room_code', roomCode)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { data: roomPlayers, error: roomPlayersError } = await supabaseAdmin
    .from('room_players')
    .select('id, user_id, joined_at, users(id, display_name, spotify_refresh_token)')
    .eq('room_id', room.id)
    .order('joined_at', { ascending: true });

  if (roomPlayersError) {
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 });
  }

  const players = roomPlayers.map((entry: any) => ({
    id: entry.user_id,
    name: entry.users?.display_name ?? 'Unknown',
    spotify_connected: Boolean(entry.users?.spotify_refresh_token),
  }));

  const currentPlayer = playerId ? players.find((player) => player.id === playerId) ?? null : null;

  return NextResponse.json({ room, players, currentPlayer });
}
