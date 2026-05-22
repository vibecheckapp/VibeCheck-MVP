import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { roomCode, playerId } = body;

  if (!roomCode || !playerId) {
    return NextResponse.json({ error: 'Missing roomCode or playerId' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Find player's room_players entry
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('room_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_id', room.id)
    .eq('user_id', playerId);

  if (updateError) {
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}