import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { roundId, playerId, action } = body;

  if (!roundId || !playerId || !action) {
    return NextResponse.json({ error: 'Missing roundId, playerId, or action' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Get round to verify it exists and get room_id
  const { data: round, error: roundError } = await supabaseAdmin
    .from('rounds')
    .select('id, room_id, status, paused_at')
    .eq('id', roundId)
    .single();

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  // Get room to verify host
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('host_id')
    .eq('id', round.room_id)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Only host can pause/resume
  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can pause or resume the game' }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === 'pause') {
    // Pause the game - set paused_at timestamp
    const { error: pauseError } = await supabaseAdmin
      .from('rounds')
      .update({ paused_at: now })
      .eq('id', roundId);

    if (pauseError) {
      return NextResponse.json({ error: 'Failed to pause game' }, { status: 500 });
    }

    await supabaseAdmin.from('rooms').update({ current_state: 'paused' }).eq('id', round.room_id);

    return NextResponse.json({ status: 'paused', paused_at: now });
  } else if (action === 'resume') {
    // Resume the game - clear paused_at timestamp
    const { error: resumeError } = await supabaseAdmin
      .from('rounds')
      .update({ paused_at: null })
      .eq('id', roundId);

    if (resumeError) {
      return NextResponse.json({ error: 'Failed to resume game' }, { status: 500 });
    }

    await supabaseAdmin.from('rooms').update({ current_state: 'playing' }).eq('id', round.room_id);

    return NextResponse.json({ status: 'resumed', paused_at: null });
  } else {
    return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume"' }, { status: 400 });
  }
}
