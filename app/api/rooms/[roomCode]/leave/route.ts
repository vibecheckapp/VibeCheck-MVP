import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';

export async function POST(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await context.params;
  const body = await request.json();
  const playerId = body.playerId;

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Find room
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, host_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // 2. Find player entry
  const { data: playerEntry, error: playerError } = await supabaseAdmin
    .from('room_players')
    .select('id')
    .eq('room_id', room.id)
    .eq('user_id', playerId)
    .single();

  if (playerError || !playerEntry) {
    return NextResponse.json({ error: 'Player not found in room' }, { status: 404 });
  }

  // 3. Host transfer if host is leaving
  if (room.host_id === playerId) {
    // Select oldest other player as new host
    const { data: otherPlayers, error: otherError } = await supabaseAdmin
      .from('room_players')
      .select('user_id')
      .eq('room_id', room.id)
      .neq('user_id', playerId)
      .order('joined_at', { ascending: true })
      .limit(1);

    const newHostId = otherPlayers?.[0]?.user_id ?? null;

    const { error: transferError } = await supabaseAdmin
      .from('rooms')
      .update({ host_id: newHostId })
      .eq('id', room.id);

    if (transferError) {
      return NextResponse.json({ error: 'Host transfer failed' }, { status: 500 });
    }
  }

  // 4. Remove player from room_players
  const { error: deleteError } = await supabaseAdmin
    .from('room_players')
    .delete()
    .eq('id', playerEntry.id);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to leave room' }, { status: 500 });
  }

  return NextResponse.json({ status: 'left', newHostId: room.host_id === playerId ? 'transferred' : null });
}