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
      .select('id, user_id, track_name, artist_names, album_name, cover_url, uri, played')
      .eq('id', round.current_pick_id)
      .single();

    if (pickError || !pickData) {
      return NextResponse.json({ error: 'Failed to load current round pick' }, { status: 500 });
    }

    const { data: pickUser } = await supabaseAdmin
      .from('users')
      .select('display_name')
      .eq('id', pickData.user_id)
      .single();

    const { data: voteRows, error: voteError } = await supabaseAdmin
      .from('votes')
      .select('voter_id, score')
      .eq('round_pick_id', round.current_pick_id);

    if (voteError) {
      return NextResponse.json({ error: 'Failed to load current round votes' }, { status: 500 });
    }

    currentPickVotes = voteRows ?? [];
    currentPick = {
      id: pickData.id,
      user_id: pickData.user_id,
      user_name: pickUser?.display_name ?? 'Unbekannt',
      track_name: pickData.track_name,
      artist_names: pickData.artist_names,
      album_name: pickData.album_name,
      cover_url: pickData.cover_url,
      uri: pickData.uri,
      played: pickData.played,
      votes: currentPickVotes,
      score_total: currentPickVotes.reduce((sum: number, vote: any) => sum + (vote.score ?? 0), 0),
      vote_count: currentPickVotes.length,
    };

    if (playerId) {
      const existingVote = currentPickVotes.find((vote: any) => vote.voter_id === playerId);
      userVote = existingVote?.score ?? null;
    }
  }

  let scoreboard: any[] = [];
  if (round.status === 'finished') {
    const { data: picks, error: scoreboardError } = await supabaseAdmin
      .from('round_picks')
      .select('id, user_id, track_name, artist_names, album_name, cover_url')
      .eq('round_id', id);

    if (scoreboardError) {
      return NextResponse.json({ error: 'Failed to load scoreboard' }, { status: 500 });
    }

    const pickIds = (picks ?? []).map((pick: any) => pick.id);
    const userIds = Array.from(new Set((picks ?? []).map((pick: any) => pick.user_id)));

    const pickVotes = pickIds.length
      ? await supabaseAdmin.from('votes').select('round_pick_id, score').in('round_pick_id', pickIds)
      : { data: [], error: null };

    if (pickVotes.error) {
      return NextResponse.json({ error: 'Failed to load scoreboard votes' }, { status: 500 });
    }

    const usersForPicks = userIds.length
      ? await supabaseAdmin.from('users').select('id, display_name').in('id', userIds)
      : { data: [], error: null };

    if (usersForPicks.error) {
      return NextResponse.json({ error: 'Failed to load scoreboard users' }, { status: 500 });
    }

    const votesByPick: Record<string, any[]> = {};
    (pickVotes.data ?? []).forEach((vote: any) => {
      if (!votesByPick[vote.round_pick_id]) votesByPick[vote.round_pick_id] = [];
      votesByPick[vote.round_pick_id].push(vote);
    });

    const usersById: Record<string, string> = {};
    (usersForPicks.data ?? []).forEach((user: any) => {
      usersById[user.id] = user.display_name;
    });

    scoreboard = (picks ?? []).map((pick: any) => {
      const votes = votesByPick[pick.id] ?? [];
      return {
        id: pick.id,
        user_id: pick.user_id,
        user_name: usersById[pick.user_id] ?? 'Unbekannt',
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
