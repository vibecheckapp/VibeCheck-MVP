import { NextResponse, NextRequest } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const playerId = url.searchParams.get('playerId');

  if (!id) {
    return NextResponse.json({ error: 'Missing round id' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: round, error: roundError } = await supabaseAdmin
    .from('rounds')
    .select('id, room_id, scenario, status, player_order, current_turn_index, current_pick_id')
    .eq('id', id)
    .single();

  if (roundError || !round) {
    await supabaseAdmin
      .from('rooms')
      .update({ active_round_id: null })
      .eq('active_round_id', id);
    return NextResponse.json({ round: null, players: [] });
  }

  const { data: roomPlayers, error: playersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id, users(display_name)')
    .eq('room_id', round.room_id)
    .order('joined_at', { ascending: true });

  if (playersError) {
    return NextResponse.json({ error: 'Failed to load room players' }, { status: 500 });
  }

  const players = (roomPlayers ?? []).map((entry: any) => ({
    id: entry.user_id,
    name: entry.users?.display_name ?? 'Unbekannt',
  }));

  let currentPick = null;
  let currentPickVotes: any[] = [];
  let userVote = null;

  if (round.current_pick_id) {
    const { data: pickData, error: pickError } = await supabaseAdmin
      .from('round_picks')
      .select('id, user_id, track_name, artist_names, album_name, cover_url, uri, played, users(id, display_name), votes(score)')
      .eq('id', round.current_pick_id)
      .single();

    if (pickError) {
      return NextResponse.json({ error: 'Failed to load current round pick' }, { status: 500 });
    }

    currentPickVotes = pickData.votes ?? [];
    currentPick = {
      id: pickData.id,
      user_id: pickData.user_id,
      user_name: pickData.users?.[0]?.display_name ?? 'Unbekannt',
      track_name: pickData.track_name,
      artist_names: pickData.artist_names,
      album_name: pickData.album_name,
      cover_url: pickData.cover_url,
      uri: pickData.uri,
      played: pickData.played,
      votes: currentPickVotes,
      score_total: (currentPickVotes ?? []).reduce((sum: number, vote: any) => sum + (vote.score ?? 0), 0),
      vote_count: (currentPickVotes ?? []).length,
    };

    if (playerId) {
      const existingVote = currentPickVotes.find((vote: any) => vote.user_id === playerId);
      userVote = existingVote?.score ?? null;
    }
  }

  let scoreboard: any[] = [];
  if (round.status === 'finished') {
    const { data: picks, error: scoreboardError } = await supabaseAdmin
      .from('round_picks')
      .select('id, user_id, track_name, artist_names, album_name, cover_url, users(id, display_name), votes(score)')
      .eq('round_id', id);

    if (scoreboardError) {
      return NextResponse.json({ error: 'Failed to load scoreboard' }, { status: 500 });
    }

    scoreboard = (picks ?? []).map((pick: any) => {
      const votes = pick.votes ?? [];
      return {
        id: pick.id,
        user_id: pick.user_id,
        user_name: pick.users?.[0]?.display_name ?? 'Unbekannt',
        track_name: pick.track_name,
        artist_names: pick.artist_names,
        cover_url: pick.cover_url,
        score_total: votes.reduce((sum: number, vote: any) => sum + (vote.score ?? 0), 0),
        vote_count: votes.length,
      };
    });
  }

  return NextResponse.json({
    round: {
      id: round.id,
      scenario: round.scenario,
      status: round.status,
      player_order: round.player_order ?? [],
      current_turn_index: round.current_turn_index ?? 0,
      current_pick: currentPick,
      scoreboard,
      votes_needed: players.length,
      votes_cast: currentPick?.vote_count ?? 0,
      user_vote: userVote,
    },
    players,
  });
}
