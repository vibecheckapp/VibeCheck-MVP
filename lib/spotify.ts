import { getSupabaseAdmin } from './supabase-server';

export async function refreshSpotifyToken(refreshToken: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Spotify credentials');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Spotify token');
  }

  return response.json();
}

export async function getSpotifyAuthUrl(hostname: string, playerId: string) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing Spotify client id');
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL : hostname;
  const redirectUri = `${origin}/api/spotify/callback`;
  const state = Buffer.from(playerId).toString('base64');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'playlist-read-private',
      'user-library-read',
    ].join(' '),
    redirect_uri: redirectUri,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function getSpotifyAccessTokenForUser(playerId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at')
    .eq('id', playerId)
    .single();

  if (error || !user) {
    throw new Error('Spotify user not found');
  }

  if (!user.spotify_refresh_token) {
    throw new Error('Spotify refresh token is missing');
  }

  const expiresAt = user.spotify_token_expires_at ? new Date(user.spotify_token_expires_at) : null;
  const now = new Date();

  if (user.spotify_access_token && expiresAt && expiresAt > now) {
    return user.spotify_access_token;
  }

  const tokenData = await refreshSpotifyToken(user.spotify_refresh_token);
  const newAccessToken = tokenData.access_token;
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 0) * 1000).toISOString();

  await supabaseAdmin
    .from('users')
    .update({
      spotify_access_token: newAccessToken,
      spotify_token_expires_at: newExpiresAt,
      spotify_refresh_token: tokenData.refresh_token ?? user.spotify_refresh_token,
    })
    .eq('id', playerId);

  return newAccessToken;
}

export async function fetchUserSavedTracks(playerId: string) {
  const accessToken = await getSpotifyAccessTokenForUser(playerId);

  // 1. zuerst total Anzahl holen
  const firstPage = await fetch(
    "https://api.spotify.com/v1/me/tracks?limit=1",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!firstPage.ok) {
    throw new Error("Failed to fetch saved tracks (count)");
  }

  const firstData = await firstPage.json();
  const total = firstData.total ?? 0;

  if (total === 0) return [];

  // 2. random offset wählen
  const randomOffset = Math.floor(Math.random() * total);

  // 3. Seite mit random offset holen
  const response = await fetch(
    `https://api.spotify.com/v1/me/tracks?limit=50&offset=${randomOffset}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch saved tracks from Spotify");
  }

  const data = await response.json();

  return (data.items ?? [])
    .map((item: any) => item.track)
    .filter(Boolean);
}

export async function getRandomTrackForUser(playerId: string) {
  const savedTracks = await fetchUserSavedTracks(playerId);
  if (!savedTracks.length) {
    throw new Error('Keine Spotify-Titel gefunden. Bitte speichere Lieblingssongs oder gib Spotify Zugriff.');
  }

  const track = savedTracks[Math.floor(Math.random() * savedTracks.length)];
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artist_names: track.artists?.map((artist: any) => artist.name).join(', ') ?? 'Unbekannt',
    album_name: track.album?.name ?? 'Unbekanntes Album',
    cover_url: track.album?.images?.[0]?.url ?? '',
  };
}

export async function spotifyPlayForUser(playerId: string, trackUri?: string, deviceId?: string) {
  const accessToken = await getSpotifyAccessTokenForUser(playerId);
  const url = new URL('https://api.spotify.com/v1/me/player/play');
  if (deviceId) {
    url.searchParams.set('device_id', deviceId);
  }

  const body = trackUri ? { uris: [trackUri] } : {};
  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Spotify play failed: ${text}`);
  }
}

export async function spotifyPauseForUser(playerId: string, deviceId?: string) {
  const accessToken = await getSpotifyAccessTokenForUser(playerId);
  const url = new URL('https://api.spotify.com/v1/me/player/pause');
  if (deviceId) {
    url.searchParams.set('device_id', deviceId);
  }

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Spotify pause failed: ${text}`);
  }
}
