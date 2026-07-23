import { randomUUID } from 'crypto';
import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';
import { getRandomStoredTrackForUser } from '../../../../../lib/music-library';

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
    .select('id, room_id, status, player_order, current_turn_index, current_pick_id, played_track_ids')
    .eq('id', id)
    .single();

  if (roundError || !round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('rooms')
    .select('host_id, settings')
    .eq('id', round.room_id)
    .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can advance to the next player' }, { status: 403 });
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
    .select('voter_id')
    .eq('round_pick_id', round.current_pick_id);

  const validPlayerIds = new Set(players.map((player: any) => player.user_id));
  const uniqueVoters = new Set(
    (currentVotes.data ?? [])
      .map((vote: any) => vote.voter_id)
      .filter((voterId: string | null) => voterId && validPlayerIds.has(voterId)),
  );

  if (!force && uniqueVoters.size < totalPlayers) {
    return NextResponse.json({ error: 'Wait for all votes before continuing' }, { status: 400 });
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

    await supabaseAdmin.from('rooms').update({ current_state: 'scoreboard' }).eq('id', round.room_id);

    return NextResponse.json({ status: 'finished' });
  }

const nextPlayerId = playerOrder[nextIndex];
  
  // Get already played track IDs to exclude
  const excludeTrackIds = round.played_track_ids ?? [];
  
  let track;
  try {
    const settings = room.settings ?? {};
    const libraryAmount = [50, 100, 250, 500].includes(Number(settings.library_amount)) ? Number(settings.library_amount) : 100;
    const libraryPeriod = ['short_term', 'medium_term', 'long_term'].includes(settings.library_period)
      ? settings.library_period
      : 'long_term';
    track = await getRandomStoredTrackForUser(
      nextPlayerId,
      libraryAmount,
      libraryPeriod as 'short_term' | 'medium_term' | 'long_term',
      excludeTrackIds,
    );
  } catch (trackError) {
    return NextResponse.json({ 
      error: trackError instanceof Error 
        ? trackError.message 
        : 'Failed to load Spotify track for next player' 
    }, { status: 500 });
  }
  
  if (!track?.id || !track?.uri) {
    return NextResponse.json({ error: 'Invalid track data for next player' }, { status: 500 });
  }
  
  const pickId = randomUUID();

  const { data: newPick, error: pickError } = await supabaseAdmin
    .from('round_picks')
    .insert({
      id: pickId,
      round_id: id,
      user_id: nextPlayerId,
      track_id: track.id,
      track_name: track.name,
      artist_names: track.artist_names,
      album_name: track.album_name,
      cover_url: track.cover_url,
      uri: track.uri,
      started_at: new Date().toISOString(),
      played: false,
      sort_order: nextIndex,
    })
    .select('*')
    .single();

  if (pickError || !newPick) {
    return NextResponse.json({ error: 'Failed to create next round pick' }, { status: 500 });
  }

  const { data: updatedRound, error: updateError } = await supabaseAdmin
    .from('rounds')
    .update({ 
      current_pick_id: pickId, 
      current_turn_index: nextIndex,
      played_track_ids: [...(round.played_track_ids ?? []), track.id]
    })
    .eq('id', id)
    .eq('current_pick_id', round.current_pick_id)
    .eq('current_turn_index', round.current_turn_index)
    .select('id')
    .maybeSingle();

  if (updateError || !updatedRound) {
    await supabaseAdmin.from('round_picks').delete().eq('id', pickId);
    if (!updateError) return NextResponse.json({ error: 'Round changed; please refresh' }, { status: 409 });
    return NextResponse.json({ error: 'Failed to advance round' }, { status: 500 });
  }

  return NextResponse.json({ status: 'next_play', pick: newPick });
}
