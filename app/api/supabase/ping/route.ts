import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const roomsResponse = await supabaseAdmin.from('rooms').select('id').limit(1);
    const playersResponse = await supabaseAdmin.from('players').select('id').limit(1);

    return NextResponse.json({
      ok: true,
      connected: true,
      rooms: {
        error: roomsResponse.error ? roomsResponse.error.message : null,
        sample: roomsResponse.data?.[0] ?? null,
      },
      players: {
        error: playersResponse.error ? playersResponse.error.message : null,
        sample: playersResponse.data?.[0] ?? null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
