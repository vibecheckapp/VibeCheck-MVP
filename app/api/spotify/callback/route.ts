import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const state = requestUrl.searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  let playerId = '';
  let returnTo = '';
  try {
    const decodedState = Buffer.from(state, 'base64').toString('utf8');
    const parsedState = JSON.parse(decodedState);
    playerId = parsedState.playerId;
    returnTo = typeof parsedState.returnTo === 'string' ? parsedState.returnTo : '';
  } catch {
    // Compatibility with OAuth links created by the previous MVP.
    playerId = Buffer.from(state, 'base64').toString('utf8');
  }

  if (!playerId) {
    return NextResponse.json({ error: 'Invalid state value' }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin;
  const redirectUri = `${origin}/api/spotify/callback`;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Missing Spotify credentials' }, { status: 500 });
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    return NextResponse.json({ error: `Spotify token exchange failed: ${errorText}` }, { status: 500 });
  }

  const tokenData = await tokenResponse.json();
  const refreshToken = tokenData.refresh_token;

  if (!refreshToken) {
    return NextResponse.json({ error: 'Spotify did not return a refresh token' }, { status: 500 });
  }

  const spotifyUserResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!spotifyUserResponse.ok) {
    const errorText = await spotifyUserResponse.text();
    return NextResponse.json({ error: `Failed to fetch Spotify user: ${errorText}` }, { status: 500 });
  }

  const spotifyUser = await spotifyUserResponse.json();
  const spotifyUserId = spotifyUser.id ?? null;

  const supabaseAdmin = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 0) * 1000).toISOString();

  const { error: cleanupError } = await supabaseAdmin
    .from('spotify_connections')
    .delete()
    .or(`user_id.eq.${playerId},spotify_user_id.eq.${spotifyUserId}`);

  if (cleanupError) {
    return NextResponse.json({ error: cleanupError.message }, { status: 500 });
  }

  const { error: connectionError } = await supabaseAdmin
    .from('spotify_connections')
    .insert({
      user_id: playerId,
      spotify_user_id: spotifyUserId,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    });

  if (connectionError && connectionError.code !== '42P01') {
    return NextResponse.json({ error: connectionError.message }, { status: 500 });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .update({
      spotify_access_token: tokenData.access_token,
      spotify_refresh_token: refreshToken,
      spotify_token_expires_at: expiresAt,
      spotify_user_id: spotifyUserId,
    })
    .eq('id', playerId)
    .select('id')
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message ?? 'User not found' }, { status: 500 });
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from('room_players')
    .select('room_id')
    .eq('user_id', playerId)
    .maybeSingle();

  if (roomError) {
    return NextResponse.json({ error: roomError?.message ?? 'Room not found' }, { status: 500 });
  }

  if (!room) {
    const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/profile';
    return NextResponse.redirect(`${origin}${safeReturnTo}?spotify=connected`);
  }

  const { data: roomDetails, error: roomDetailsError } = await supabaseAdmin
    .from('rooms')
    .select('room_code')
    .eq('id', room.room_id)
    .single();

  if (roomDetailsError || !roomDetails) {
    return NextResponse.json({ error: roomDetailsError?.message ?? 'Room not found' }, { status: 500 });
  }

  // Benachrichtigung für alle Clients dass Spotify verbunden wurde
  await supabaseAdmin
    .from('room_notifications')
    .insert({ room_id: room.room_id, event_type: 'spotify_connected', triggered_by: playerId });

  return NextResponse.redirect(`${origin}/room/${roomDetails.room_code}?playerId=${playerId}`);
}
