import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const roomCode = String(body.roomCode ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();

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

  const userId = randomUUID();
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .insert({ id: userId, display_name: name })
    .select('id')
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message ?? 'Failed to create user' }, { status: 500 });
  }

  const { data: roomPlayer, error: roomPlayerError } = await supabaseAdmin
    .from('room_players')
    .insert({ room_id: room.id, user_id: user.id, joined_at: new Date().toISOString() })
    .select('id')
    .single();

  if (roomPlayerError || !roomPlayer) {
    return NextResponse.json({ error: roomPlayerError?.message ?? 'Failed to join room' }, { status: 500 });
  }

  return NextResponse.json({ roomCode, playerId: user.id });
}
