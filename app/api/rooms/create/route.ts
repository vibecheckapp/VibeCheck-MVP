import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

const generateRoomCode = () => {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
};

async function createUniqueRoomCode() {
  const supabaseAdmin = getSupabaseAdmin();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = generateRoomCode();
    const { data, error } = await supabaseAdmin
      .from('rooms')
      .select('id')
      .eq('room_code', roomCode)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return roomCode;
    }
  }

  throw new Error('Unable to generate a unique room code');
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = String(body.name ?? '').trim();

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const roomCode = await createUniqueRoomCode();

  const supabaseAdmin = getSupabaseAdmin();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .insert({ room_code: roomCode })
    .select('id')
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: roomError?.message ?? 'Failed to create room' }, { status: 500 });
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

  const { error: hostError } = await supabaseAdmin
    .from('rooms')
    .update({ host_id: user.id })
    .eq('id', room.id);

  if (hostError) {
    return NextResponse.json({ error: hostError.message ?? 'Failed to assign host' }, { status: 500 });
  }

  return NextResponse.json({ roomCode, playerId: user.id });
}
