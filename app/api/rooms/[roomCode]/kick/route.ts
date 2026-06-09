import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';

export async function POST(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await context.params;
  const body = await request.json().catch(() => ({}));
  const requesterId = body.playerId as string | undefined;
  const targetPlayerId = body.targetPlayerId as string | undefined;

  if (!roomCode || !requesterId || !targetPlayerId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (requesterId === targetPlayerId) {
    return NextResponse.json({ error: 'Host cannot kick themselves' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, host_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.host_id !== requesterId) {
    return NextResponse.json({ error: 'Only the host can kick players' }, { status: 403 });
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('room_players')
    .select('id, user_id')
    .eq('room_id', room.id)
    .eq('user_id', targetPlayerId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: 'Failed to validate player in room' }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: 'Player is not in this room' }, { status: 404 });
  }

  const { error: kickError } = await supabaseAdmin
    .from('room_players')
    .delete()
    .eq('room_id', room.id)
    .eq('user_id', targetPlayerId);

  if (kickError) {
    return NextResponse.json({ error: 'Failed to kick player' }, { status: 500 });
  }

  return NextResponse.json({ status: 'player_kicked', targetPlayerId });
}
