import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const roomCode = String(body.roomCode ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();
  const clientJoinTokenRaw = body.clientJoinToken;
  const clientJoinToken =
    typeof clientJoinTokenRaw === 'string' && /^[0-9a-fA-F-]{36}$/.test(clientJoinTokenRaw)
      ? clientJoinTokenRaw
      : null;

  if (!roomCode || !name) {
    return NextResponse.json({ error: 'Room code and name are required' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .eq('room_code', roomCode)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: roomError?.message ?? 'Room not found' }, { status: 404 });
  }

  let userId = clientJoinToken ?? randomUUID();

  if (clientJoinToken) {
    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', clientJoinToken)
      .maybeSingle();

    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message ?? 'Failed to read user' }, { status: 500 });
    }

    if (!existingUser) {
      const { data: insertedUser, error: insertUserError } = await supabaseAdmin
        .from('users')
        .insert({ id: clientJoinToken, display_name: name })
        .select('id')
        .single();

      if (insertUserError || !insertedUser) {
        return NextResponse.json({ error: insertUserError?.message ?? 'Failed to create user' }, { status: 500 });
      }
      userId = insertedUser.id;
    } else {
      userId = existingUser.id;
      await supabaseAdmin.from('users').update({ display_name: name }).eq('id', userId);
    }
  } else {
    const { data: insertedUser, error: insertUserError } = await supabaseAdmin
      .from('users')
      .insert({ id: userId, display_name: name })
      .select('id')
      .single();

    if (insertUserError || !insertedUser) {
      return NextResponse.json({ error: insertUserError?.message ?? 'Failed to create user' }, { status: 500 });
    }
    userId = insertedUser.id;
  }

  const joinedAt = new Date().toISOString();
  const { data: roomPlayer, error: roomPlayerError } = await supabaseAdmin
    .from('room_players')
    .insert({ room_id: room.id, user_id: userId, joined_at: joinedAt, last_seen: joinedAt })
    .select('id')
    .maybeSingle();

  if (roomPlayerError) {
    // Unique conflict (room_id, user_id) => already joined, treat as success
    if ((roomPlayerError as any).code === '23505') {
      const { data: existingRoomPlayer, error: existingRoomPlayerError } = await supabaseAdmin
        .from('room_players')
        .select('id')
        .eq('room_id', room.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRoomPlayerError || !existingRoomPlayer) {
        return NextResponse.json({ error: existingRoomPlayerError?.message ?? 'Failed to join room' }, { status: 500 });
      }

      return NextResponse.json({ roomCode, playerId: userId });
    }

    return NextResponse.json({ error: roomPlayerError.message ?? 'Failed to join room' }, { status: 500 });
  }

  if (!roomPlayer) {
    return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
  }

  return NextResponse.json({ roomCode, playerId: userId });
}
