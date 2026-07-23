import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';

async function computeReadyState(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, roomId: string, roundId: string) {
  const { data: roomPlayers, error: playersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id')
    .eq('room_id', roomId);

  if (playersError) {
    throw playersError;
  }

  const playerIds = (roomPlayers ?? []).map((entry: any) => entry.user_id as string);
  const playerSet = new Set(playerIds);

  const { data: readyEvents, error: readyError } = await supabaseAdmin
    .from('room_notifications')
    .select('payload')
    .eq('room_id', roomId)
    .eq('event_type', 'scoreboard_ready')
    .contains('payload', { roundId });

  if (readyError) {
    throw readyError;
  }

  const readyUsers = new Set<string>();
  for (const entry of readyEvents ?? []) {
    const readyPlayerId = entry?.payload?.playerId;
    if (typeof readyPlayerId === 'string' && playerSet.has(readyPlayerId)) {
      readyUsers.add(readyPlayerId);
    }
  }

  return {
    totalPlayers: playerIds.length,
    readyCount: readyUsers.size,
    readyUsers,
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await context.params;
  const playerId = request.nextUrl.searchParams.get('playerId');

  const supabaseAdmin = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, active_round_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (!room.active_round_id) {
    return NextResponse.json({ readyCount: 0, totalPlayers: 0, allReady: true, hasMarkedReady: true });
  }

  try {
    const status = await computeReadyState(supabaseAdmin, room.id, room.active_round_id);
    const allReady = status.readyCount >= status.totalPlayers;

    if (allReady) {
      await supabaseAdmin
        .from('rooms')
        .update({ active_round_id: null, current_state: 'lobby' })
        .eq('id', room.id)
        .eq('active_round_id', room.active_round_id);
    }

    return NextResponse.json({
      readyCount: status.readyCount,
      totalPlayers: status.totalPlayers,
      allReady,
      hasMarkedReady: playerId ? status.readyUsers.has(playerId) : false,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message ?? 'Failed to load ready state' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await context.params;
  const body = await request.json().catch(() => ({}));
  const playerId = String(body.playerId ?? '').trim();

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id, active_round_id')
    .eq('room_code', roomCode.toUpperCase())
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (!room.active_round_id) {
    return NextResponse.json({ readyCount: 0, totalPlayers: 0, allReady: true, hasMarkedReady: true, roundClosed: true });
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('room_players')
    .select('id')
    .eq('room_id', room.id)
    .eq('user_id', playerId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: 'Player is not in this room' }, { status: 403 });
  }

  const { error: insertReadyError } = await supabaseAdmin
    .from('room_notifications')
    .insert({
      room_id: room.id,
      event_type: 'scoreboard_ready',
      payload: {
        playerId,
        roundId: room.active_round_id,
      },
    });

  if (insertReadyError) {
    return NextResponse.json({ error: insertReadyError.message }, { status: 500 });
  }

  try {
    const status = await computeReadyState(supabaseAdmin, room.id, room.active_round_id);
    const allReady = status.readyCount >= status.totalPlayers;

    if (allReady) {
      await supabaseAdmin
        .from('rooms')
        .update({ active_round_id: null, current_state: 'lobby' })
        .eq('id', room.id)
        .eq('active_round_id', room.active_round_id);
    }

    return NextResponse.json({
      readyCount: status.readyCount,
      totalPlayers: status.totalPlayers,
      allReady,
      hasMarkedReady: true,
      roundClosed: allReady,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message ?? 'Failed to process ready state' }, { status: 500 });
  }
}