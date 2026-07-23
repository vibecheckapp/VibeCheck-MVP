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

    if (error) throw error;
    if (!data) return roomCode;
  }

  throw new Error('Unable to generate a unique room code');
}

export async function POST(request: Request) {
  const body = await request.json();
  const profileId = String(body.userId ?? body.profileId ?? '').trim();

  if (!profileId) {
    return NextResponse.json({ error: 'Please create or log in to a profile first.' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

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
    return NextResponse.json({ error: 'Please update your music profile in Profile before creating a room.' }, { status: 400 });
  }

  const roomCode = (await createUniqueRoomCode()).toUpperCase();
  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .insert({ room_code: roomCode })
    .select('id, room_code')
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: roomError?.message ?? 'Failed to create room' }, { status: 500 });
  }

  const userId = profileId || randomUUID();

  const { data: roomPlayer, error: roomPlayerError } = await supabaseAdmin
    .from('room_players')
    .insert({ room_id: room.id, user_id: userId, joined_at: new Date().toISOString() })
    .select('id')
    .single();

  if (roomPlayerError || !roomPlayer) {
    return NextResponse.json({ error: roomPlayerError?.message ?? 'Failed to join room' }, { status: 500 });
  }

  const { error: hostError } = await supabaseAdmin
    .from('rooms')
    .update({ host_id: userId })
    .eq('id', room.id);

  if (hostError) {
    return NextResponse.json({ error: hostError.message ?? 'Failed to assign host' }, { status: 500 });
  }

  return NextResponse.json({ roomCode, playerId: userId });
}
