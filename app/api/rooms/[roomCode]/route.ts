import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function DELETE(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await context.params;
  const body = await request.json().catch(() => ({}));
  const playerId = body.playerId;

  if (!roomCode) {
    return NextResponse.json({ error: 'Missing room code' }, { status: 400 });
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

  if (!playerId || room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can dissolve the room' }, { status: 403 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from('rooms')
    .delete()
    .eq('id', room.id);

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete room' }, { status: 500 });
  }

  return NextResponse.json({ status: 'room_deleted' });
}
