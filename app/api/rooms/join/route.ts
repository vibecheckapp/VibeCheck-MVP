import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

const REQUIRED_LIBRARY_AMOUNTS = [50, 100, 250, 500] as const;
const REQUIRED_LIBRARY_PERIODS = ['short_term', 'medium_term', 'long_term'] as const;

async function hasCompleteMusicLibraries(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('music_libraries')
    .select('amount, period')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  const keys = new Set((data ?? []).map((entry: any) => `${entry.period}:${entry.amount}`));
  for (const period of REQUIRED_LIBRARY_PERIODS) {
    for (const amount of REQUIRED_LIBRARY_AMOUNTS) {
      if (!keys.has(`${period}:${amount}`)) {
        return false;
      }
    }
  }

  return true;
}

export async function POST(request: Request) {
  const body = await request.json();
  const roomCode = String(body.roomCode ?? '').trim().toUpperCase();
  const profileId = String(body.userId ?? body.profileId ?? '').trim();

  if (!roomCode) {
    return NextResponse.json({ error: 'Room code is required' }, { status: 400 });
  }

  if (!profileId) {
    return NextResponse.json({ error: 'Please create or log in to a profile first.' }, { status: 401 });
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: 'Profile not found. Please log in again.' }, { status: 401 });

  let hasLibraries = false;
  try {
    hasLibraries = await hasCompleteMusicLibraries(supabaseAdmin, profileId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  if (!hasLibraries) {
    return NextResponse.json({ error: 'Please update your music profile in Profile before joining a room.' }, { status: 400 });
  }

  const userId = profileId || randomUUID();

  const joinedAt = new Date().toISOString();
  const { data: roomPlayer, error: roomPlayerError } = await supabaseAdmin
    .from('room_players')
    .insert({ room_id: room.id, user_id: userId, joined_at: joinedAt, last_seen: joinedAt })
    .select('id')
    .maybeSingle();

  if (roomPlayerError) {
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
