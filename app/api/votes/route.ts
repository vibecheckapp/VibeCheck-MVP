import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabase-server';

export async function POST(request: Request) {
  const body = await request.json();
  const { roundId, roundPickId, userId, score } = body;

  if (!roundId || !roundPickId || !userId || typeof score !== 'number' || score < 1 || score > 5) {
    return NextResponse.json({ error: 'Invalid vote payload' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
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
