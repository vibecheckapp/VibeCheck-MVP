import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim().toLowerCase();
    const magicCode = String(body.magicCode ?? '').trim();

    if (!username || !/^\d{4}$/.test(magicCode)) {
      return NextResponse.json({ error: 'Username and a four-digit magic code are required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, display_name, magic_code, created_at, updated_at')
      .ilike('username', username)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'Failed to look up profile.' }, { status: 500 });
    }

    if (!user || user.magic_code !== magicCode) {
      return NextResponse.json({ error: 'Invalid username or magic code.' }, { status: 401 });
    }

    const { magic_code: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to log in.' },
      { status: 500 },
    );
  }
}
