import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
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
    .eq('room_code', roomCode)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can perform this action' }, { status: 403 });
  }

  // Broadcast return_to_lobby notification AND clear active_round_id
  // Both needed: notification triggers visual update, active_round_id=null ensures clean state on refresh
  const [{ error: notifError }, { error: updateError }] = await Promise.all([
    supabaseAdmin.from('room_notifications').insert({
      room_id: room.id,
      event_type: 'return_to_lobby',
      triggered_by: playerId,
    }),
    supabaseAdmin.from('rooms').update({ active_round_id: null }).eq('room_code', roomCode),
  ]);

  if (notifError) {
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }

  if (updateError) {
    return NextResponse.json({ error: 'Failed to reset room' }, { status: 500 });
  }

  return NextResponse.json({ status: 'reset' });
}