import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';
import { getRandomStoredTrackForUser } from '../../../../lib/music-library';

function shuffleArray<T>(items: T[]) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { roomId, playerId, scenario } = body;

    if (!roomId || !playerId || !scenario) {
      return NextResponse.json({ error: 'Missing roomId, playerId or scenario' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, host_id, active_round_id, settings')
      .eq('id', roomId)
      .single();

if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Check if active_round_id is valid (points to an existing round)
  if (room.active_round_id) {
    const { data: existingRound } = await supabaseAdmin
      .from('rounds')
      .select('id')
      .eq('id', room.active_round_id)
      .single();
    
    // If the round doesn't exist, clear the orphaned active_round_id and allow starting
    if (!existingRound) {
      await supabaseAdmin
        .from('rooms')
        .update({ active_round_id: null })
        .eq('id', roomId);
    } else {
      return NextResponse.json({ error: 'A round is already running in this room' }, { status: 400 });
    }
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Only the host can start the round' }, { status: 403 });
  }

  const { data: roomPlayers, error: roomPlayersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id, users(display_name, spotify_refresh_token)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (roomPlayersError) {
    return NextResponse.json({ error: 'Failed to load room players' }, { status: 500 });
  }

  const settings = room.settings ?? {};
  const songsPerPlayer = Number.isInteger(Number(settings.songs_per_player)) && Number(settings.songs_per_player) >= 1 && Number(settings.songs_per_player) <= 50 ? Number(settings.songs_per_player) : 1;
  const libraryAmount = [50, 100, 250, 500].includes(Number(settings.library_amount)) ? Number(settings.library_amount) : 100;
  const libraryPeriod = ['short_term', 'medium_term', 'long_term'].includes(settings.library_period) ? settings.library_period : 'long_term';
  const playerIds = (roomPlayers ?? []).map((entry: any) => entry.user_id);
  const { data: libraries } = await supabaseAdmin
    .from('music_libraries')
    .select('user_id')
    .in('user_id', playerIds)
    .eq('amount', libraryAmount)
    .eq('period', libraryPeriod);
  const readyUsers = new Set((libraries ?? []).map((library: any) => library.user_id));
  const missingLibraries = playerIds.filter((id: string) => !readyUsers.has(id));
  if (missingLibraries.length > 0) {
    return NextResponse.json({ error: 'Every player must update their Spotify music profile first.' }, { status: 400 });
  }

  const shuffledPlayers = shuffleArray(playerIds);
  const playerOrder = shuffledPlayers.flatMap((id: string) => Array.from({ length: songsPerPlayer }, () => id));
  if (!playerOrder.length) {
    return NextResponse.json({ error: 'No players found to start the round' }, { status: 400 });
  }

const roundId = randomUUID();
  const firstPlayerId = playerOrder[0];
  
  // Fetch track with no exclusions (first round - no played tracks yet)
  let track;
  try {
    track = await getRandomStoredTrackForUser(firstPlayerId, libraryAmount, libraryPeriod as 'short_term' | 'medium_term' | 'long_term');
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Failed to load Spotify track' }, { status: 500 });
  }

  if (!track?.id || !track?.uri) {
    return NextResponse.json({ error: 'Invalid Spotify track for first player' }, { status: 500 });
  }

  // Create round with initial played_track_ids containing the first track
  const { data: round, error: roundInsertError } = await supabaseAdmin
    .from('rounds')
    .insert({
      id: roundId,
      room_id: roomId,
      scenario,
      status: 'playing',
      player_order: playerOrder,
      current_turn_index: 0,
      played_track_ids: [track.id],
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (roundInsertError || !round) {
    return NextResponse.json(
      { error: 'Failed to create round', details: roundInsertError?.message ?? 'Unknown database error' },
      { status: 500 },
    );
  }

  const pickId = randomUUID();
  const { data: pick, error: pickError } = await supabaseAdmin
    .from('round_picks')
    .insert({
      id: pickId,
      round_id: roundId,
      user_id: firstPlayerId,
      track_id: track.id,
      track_name: track.name,
      artist_names: track.artist_names,
      album_name: track.album_name,
      cover_url: track.cover_url,
      uri: track.uri,
      started_at: new Date().toISOString(),
      played: false,
      sort_order: 0,
    })
    .select('*')
    .single();

  if (pickError || !pick) {
    return NextResponse.json(
      { error: 'Failed to create first round pick', details: pickError?.message ?? 'Unknown database error' },
      { status: 500 },
    );
  }

  const { error: roundUpdateError } = await supabaseAdmin
    .from('rounds')
    .update({ current_pick_id: pickId })
    .eq('id', roundId);

  if (roundUpdateError) {
    await supabaseAdmin.from('round_picks').delete().eq('id', pickId);
    await supabaseAdmin.from('rounds').delete().eq('id', roundId);
    return NextResponse.json({ error: 'Failed to set current round pick' }, { status: 500 });
  }

// Debug: Log the state before and after update
    console.log('[StartRound] About to set room active_round_id:', roomId, '->', roundId);
    
    const { data: claimedRoom, error: roomUpdateError } = await supabaseAdmin
      .from('rooms')
      .update({ active_round_id: roundId, current_state: 'playing' })
      .eq('id', roomId)
      .is('active_round_id', null)
      .select('id')
      .maybeSingle();

  console.log('[StartRound] Room update error:', roomUpdateError);

  if (roomUpdateError || !claimedRoom) {
    await supabaseAdmin.from('round_picks').delete().eq('id', pickId);
    await supabaseAdmin.from('rounds').delete().eq('id', roundId);
    return NextResponse.json(
      {
        error: roomUpdateError ? 'Failed to update room state' : 'A round was started by another request',
        details: roomUpdateError?.message ?? 'Unknown database error',
      },
      { status: roomUpdateError ? 500 : 409 },
    );
  }

  // Verify the round was created
  const { data: verifyRound } = await supabaseAdmin
    .from('rounds')
    .select('id, status')
    .eq('id', roundId)
    .single();
  
  console.log('[StartRound] Verify round exists:', verifyRound);

  // Verify room was updated
  const { data: verifyRoom } = await supabaseAdmin
    .from('rooms')
    .select('active_round_id')
    .eq('id', roomId)
    .single();
  
  console.log('[StartRound] Verify room active_round_id:', verifyRoom?.active_round_id);

  return NextResponse.json({
    round: {
      id: roundId,
      scenario,
      status: 'playing',
      current_pick: pick,
      player_order: playerOrder,
    },
  });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create round', details: (error as Error).message ?? 'Unexpected server error' },
      { status: 500 },
    );
  }
}
