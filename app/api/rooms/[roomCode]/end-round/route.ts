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

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, host_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can end the round' }, { status: 403 });
  }

  // Just clear active_round_id - no broadcast, no notifications
  const { error: updateError } = await supabaseAdmin
    .from('rooms')
    .update({ active_round_id: null })
    .eq('id', room.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to end round' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ended' });
}