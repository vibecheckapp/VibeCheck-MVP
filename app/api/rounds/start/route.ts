import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';
import { getRandomTrackForUser } from '../../../../lib/spotify';

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
      .select('id, host_id, active_round_id')
      .eq('id', roomId)
      .single();

  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.active_round_id) {
    return NextResponse.json({ error: 'Es läuft bereits eine Runde im Raum' }, { status: 400 });
  }

  if (room.host_id !== playerId) {
    return NextResponse.json({ error: 'Nur der Host kann die Runde starten' }, { status: 403 });
  }

  const { data: roomPlayers, error: roomPlayersError } = await supabaseAdmin
    .from('room_players')
    .select('user_id, users(display_name, spotify_refresh_token)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (roomPlayersError) {
    return NextResponse.json({ error: 'Failed to load room players' }, { status: 500 });
  }

  const notConnected = (roomPlayers ?? []).filter((entry: any) => !entry.users?.spotify_refresh_token);
  if (notConnected.length > 0) {
    return NextResponse.json({ error: 'Nicht alle Spieler sind mit Spotify verbunden' }, { status: 400 });
  }

  const playerOrder = shuffleArray((roomPlayers ?? []).map((entry: any) => entry.user_id));
  if (!playerOrder.length) {
    return NextResponse.json({ error: 'No players found to start the round' }, { status: 400 });
  }

  const roundId = randomUUID();
  const firstPlayerId = playerOrder[0];
  let track;

  try {
    track = await getRandomTrackForUser(firstPlayerId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Spotify-Titel konnten nicht geladen werden' }, { status: 500 });
  }

  if (!track?.id || !track?.uri) {
    return NextResponse.json({ error: 'Ungültiger Spotify-Track für den ersten Spieler' }, { status: 500 });
  }

  const { data: round, error: roundInsertError } = await supabaseAdmin
    .from('rounds')
    .insert({
      id: roundId,
      room_id: roomId,
      scenario,
      status: 'playing',
      player_order: playerOrder,
      current_turn_index: 0,
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

  const { error: roomUpdateError } = await supabaseAdmin
    .from('rooms')
    .update({ active_round_id: roundId })
    .eq('id', roomId);

  if (roundUpdateError || roomUpdateError) {
    await supabaseAdmin.from('round_picks').delete().eq('id', pickId);
    await supabaseAdmin.from('rounds').delete().eq('id', roundId);
    return NextResponse.json(
      {
        error: 'Failed to update round or room state',
        details: roundUpdateError?.message ?? roomUpdateError?.message ?? 'Unknown database error',
      },
      { status: 500 },
    );
  }

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
