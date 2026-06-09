import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: Request) {
  const { playerId, theme } = await request.json();

  if (!playerId || !theme) {
    return NextResponse.json({ error: 'Missing playerId or theme' }, { status: 400 });
  }

  if (!['dark', 'light'].includes(theme)) {
    return NextResponse.json({ error: 'Invalid theme value' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Update the player's theme preference
  const { data: roomPlayer, error: fetchError } = await supabaseAdmin
    .from('room_players')
    .select('id, room_id')
    .eq('user_id', playerId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !roomPlayer) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('room_players')
    .update({ theme_preference: theme })
    .eq('id', roomPlayer.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update theme' }, { status: 500 });
  }

  return NextResponse.json({ success: true, theme });
}
