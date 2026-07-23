import { randomInt, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-server';

const USERNAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{1,23}$/;

function generateMagicCode() {
  return randomInt(0, 10000).toString().padStart(4, '0');
}

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, username, display_name, spotify_user_id, last_music_import_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!user) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });

  const { data: libraries, error: librariesError } = await supabaseAdmin
    .from('music_libraries')
    .select('amount, period, user_library_songs(count)')
    .eq('user_id', userId)
    .order('period', { ascending: true })
    .order('amount', { ascending: true });

  if (librariesError) {
    return NextResponse.json({ error: librariesError.message }, { status: 500 });
  }

  return NextResponse.json({
    user,
    libraries: (libraries ?? []).map((library: any) => ({
      amount: library.amount,
      period: library.period,
      count: Array.isArray(library.user_library_songs)
        ? (library.user_library_songs[0]?.count ?? 0)
        : 0,
    })),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim().toLowerCase();
    const displayName = String(body.displayName ?? body.username ?? '').trim();

    if (!USERNAME_PATTERN.test(username)) {
      return NextResponse.json(
        { error: 'Username must contain 2-24 letters, numbers, hyphens or underscores.' },
        { status: 400 },
      );
    }

    if (!displayName || displayName.length > 60) {
      return NextResponse.json({ error: 'Display name must contain 1-60 characters.' }, { status: 400 });
    }

    const magicCode = generateMagicCode();
    const supabaseAdmin = getSupabaseAdmin();
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: randomUUID(),
        username,
        display_name: displayName,
        magic_code: magicCode,
      })
      .select('id, username, display_name, created_at, updated_at')
      .single();

    if (error || !user) {
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
      }
      return NextResponse.json({ error: error?.message ?? 'Failed to create profile.' }, { status: 500 });
    }

    return NextResponse.json({ user, magicCode }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create profile.' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();
    const displayName = String(body.displayName ?? '').trim();
    if (!userId || !displayName || displayName.length > 60) {
      return NextResponse.json({ error: 'A valid display name is required.' }, { status: 400 });
    }

    const { data: user, error } = await getSupabaseAdmin()
      .from('users')
      .update({ display_name: displayName })
      .eq('id', userId)
      .select('id, username, display_name, spotify_user_id, last_music_import_at, updated_at')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!user) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
  }
}
