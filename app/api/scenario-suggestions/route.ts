import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { roomId, playerId, suggestion } = body;

  if (!roomId || !playerId || !suggestion) {
    return NextResponse.json({ error: 'Missing roomId, playerId, or suggestion' }, { status: 400 });
  }

  if (!suggestion.trim() || suggestion.trim().length < 2) {
    return NextResponse.json({ error: 'Suggestion must be at least 2 characters' }, { status: 400 });
  }

  if (suggestion.trim().length > 100) {
    return NextResponse.json({ error: 'Suggestion must be less than 100 characters' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  // Verify player exists in room
  const { data: roomPlayer, error: roomPlayerError } = await supabaseAdmin
    .from('room_players')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', playerId)
    .single();

  if (roomPlayerError || !roomPlayer) {
    return NextResponse.json({ error: 'Player not found in room' }, { status: 403 });
  }

  // Insert suggestion
  const { data, error } = await supabaseAdmin
    .from('scenario_suggestions')
    .insert({
      room_id: roomId,
      player_id: playerId,
      suggestion: suggestion.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 });
  }

  return NextResponse.json({ success: true, suggestion: data });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get('roomId');

  if (!roomId) {
    return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: suggestions, error } = await supabaseAdmin
    .from('scenario_suggestions')
    .select('id, suggestion, created_at, users(display_name)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: 'Failed to load suggestions' }, { status: 500 });
  }

  const formatted = (suggestions ?? []).map((s: any) => ({
    id: s.id,
    suggestion: s.suggestion,
    created_at: s.created_at,
    player_name: s.users?.display_name ?? 'Unknown',
  }));

  return NextResponse.json({ suggestions: formatted });
}
