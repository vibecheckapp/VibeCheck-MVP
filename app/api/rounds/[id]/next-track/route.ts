import { randomUUID } from 'crypto';
import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';
import { getRandomTrackForUser } from '../../../../../lib/spotify';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const playerId = body.playerId;
  const force = body.force === true;

  if (!id || !playerId) {
    return NextResponse.json({ error: 'Missing round id or playerId' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: round, error: roundError } = await supabaseAdmin
    .from('rounds')
    .select('id, room_id, status, player_order, current_turn_index, current_pick_id')
    .eq('id', id)
    .single();

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('host_id')
    .eq('id', round.room_id)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Nur der Host kann den nächsten Spieler wählen' }, { status: 403 });
  }

  if (round.status !== 'playing') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 });
  }

  const { data: players, error: playersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id')
    .eq('room_id', round.room_id);

  if (playersError || !players) {
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 });
  }

  const totalPlayers = players.length;
  const currentVotes = await supabaseAdmin
    .from('votes')
    .select('user_id')
    .eq('round_pick_id', round.current_pick_id);

  if (!force && currentVotes.data && currentVotes.data.length < totalPlayers) {
    return NextResponse.json({ error: 'Warte auf alle Stimmen, bevor du weitermachst' }, { status: 400 });
  }

  if (round.current_pick_id) {
    await supabaseAdmin
      .from('round_picks')
      .update({ played: true })
      .eq('id', round.current_pick_id);
  }

  const nextIndex = (round.current_turn_index ?? 0) + 1;
  const playerOrder = round.player_order ?? [];

  if (nextIndex >= playerOrder.length) {
    const { error: finishError } = await supabaseAdmin
      .from('rounds')
      .update({ status: 'finished', current_pick_id: null, current_turn_index: nextIndex })
      .eq('id', id);

    if (finishError) {
      return NextResponse.json({ error: 'Failed to finish round' }, { status: 500 });
    }

    return NextResponse.json({ status: 'finished' });
  }

  const nextPlayerId = playerOrder[nextIndex];
  const track = await getRandomTrackForUser(nextPlayerId);
  const pickId = randomUUID();

  const { data: newPick, error: pickError } = await supabaseAdmin
    .from('round_picks')
    .insert({
      id: pickId,
      round_id: id,
      user_id: nextPlayerId,
      track_id: track.id,
      spotify_track_id: track.id,
      track_name: track.name,
      artist_names: track.artist_names,
      artist_name: track.artist_names,
      album_name: track.album_name,
      cover_url: track.cover_url,
      album_image_url: track.cover_url,
      uri: track.uri,
      spotify_uri: track.uri,
      started_at: new Date().toISOString(),
      played: false,
      sort_order: nextIndex,
    })
    .select('*')
    .single();

  if (pickError || !newPick) {
    return NextResponse.json({ error: 'Failed to create next round pick' }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from('rounds')
    .update({ current_pick_id: pickId, current_turn_index: nextIndex })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to advance round' }, { status: 500 });
  }

  return NextResponse.json({ status: 'next_play', pick: newPick });
}
