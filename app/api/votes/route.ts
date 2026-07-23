import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const { roundId, roundPickId, userId, score } = body;

  if (!roundId || !roundPickId || !userId || typeof score !== 'number' || score < 1 || score > 10) {
    return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: round, error: roundError } = await supabaseAdmin
    .from('rounds')
    .select('id, room_id, status, current_pick_id')
    .eq('id', roundId)
    .single();

  if (roundError || !round) return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  if (round.status !== 'playing') return NextResponse.json({ error: 'Round is not active' }, { status: 409 });
  if (round.current_pick_id !== roundPickId) return NextResponse.json({ error: 'This song is no longer active' }, { status: 409 });

  const { data: pick, error: pickError } = await supabaseAdmin
    .from('round_picks')
    .select('id, round_id')
    .eq('id', roundPickId)
    .eq('round_id', roundId)
    .single();
  if (pickError || !pick) return NextResponse.json({ error: 'Round pick not found' }, { status: 404 });

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('room_players')
    .select('user_id')
    .eq('room_id', round.room_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!membership) return NextResponse.json({ error: 'You are not a player in this room' }, { status: 403 });

  const { data: existingVote, error: existingVoteError } = await supabaseAdmin
    .from('votes')
    .select('id')
    .eq('round_pick_id', roundPickId)
    .eq('voter_id', userId)
    .maybeSingle();

  if (existingVoteError) {
    return NextResponse.json({ error: existingVoteError.message ?? 'Failed to check existing vote' }, { status: 500 });
  }

  let vote, voteError;

  if (existingVote?.id) {
    const result = await supabaseAdmin
      .from('votes')
      .update({ score, created_at: new Date().toISOString() })
      .eq('id', existingVote.id)
      .select('*')
      .single();

    vote = result.data;
    voteError = result.error;
  } else {
    const result = await supabaseAdmin
      .from('votes')
      .insert({
        round_id: roundId,
        round_pick_id: roundPickId,
        voter_id: userId,
        score,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    vote = result.data;
    voteError = result.error;
  }

  if (voteError?.code === '23505') {
    const retry = await supabaseAdmin
      .from('votes')
      .update({ score, created_at: new Date().toISOString() })
      .eq('round_pick_id', roundPickId)
      .eq('voter_id', userId)
      .select('*')
      .single();
    vote = retry.data;
    voteError = retry.error;
  }

  if (voteError || !vote) {
    return NextResponse.json({ error: voteError?.message || 'Failed to save vote' }, { status: 500 });
  }

  const { data: summary, error: summaryError } = await supabaseAdmin
    .from('votes')
    .select('score')
    .eq('round_pick_id', roundPickId);

  if (summaryError) {
    return NextResponse.json({ error: 'Vote saved but failed to summarize' }, { status: 500 });
  }

  const scoreTotal = (summary ?? []).reduce((sum: number, row: any) => sum + (row.score ?? 0), 0);
  const voteCount = (summary ?? []).length;

  return NextResponse.json({ status: 'vote_recorded', roundPickId, userId, score, scoreTotal, voteCount });
}
