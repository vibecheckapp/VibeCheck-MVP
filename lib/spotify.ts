import { getSupabaseAdmin } from './supabase-server';

// Helper function for retry logic with exponential backoff
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limit (429) or server errors (5xx)
      if (response.status === 429 || response.status >= 500) {
        console.log(`[fetchWithRetry] Attempt ${attempt + 1} failed with ${response.status}, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return response.json();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        console.log(`[fetchWithRetry] Attempt ${attempt + 1} error: ${lastError.message}, retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

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

export async function getSpotifyAuthUrl(hostname: string, playerId: string, returnTo = '') {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('Missing Spotify client id');
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL : hostname;
  const redirectUri = `${origin}/api/spotify/callback`;
  const state = Buffer.from(JSON.stringify({ playerId, returnTo })).toString('base64url');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'streaming',
      'playlist-read-private',
      'user-library-read',
      'user-top-read',
    ].join(' '),
    redirect_uri: redirectUri,
    state,
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function getSpotifyAccessTokenForUser(playerId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from('spotify_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', playerId)
    .maybeSingle();

  let tokenOwner = connection;
  if (connectionError && connectionError.code !== '42P01') {
    throw new Error(connectionError.message);
  }

  // Legacy fallback keeps existing rooms playable until all connections are migrated.
  if (!tokenOwner) {
    const { data: legacyUser, error: legacyError } = await supabaseAdmin
      .from('users')
      .select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at')
      .eq('id', playerId)
      .single();

    if (legacyError || !legacyUser) {
      throw new Error('Spotify user not found');
    }

    tokenOwner = {
      access_token: legacyUser.spotify_access_token,
      refresh_token: legacyUser.spotify_refresh_token,
      expires_at: legacyUser.spotify_token_expires_at,
    };
  }

  const { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAtValue } = tokenOwner;

  if (!refreshToken) {
    throw new Error('Spotify refresh token is missing');
  }

  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null;
  const now = new Date();

  if (accessToken && expiresAt && expiresAt > now) {
    return accessToken;
  }

  const tokenData = await refreshSpotifyToken(refreshToken);
  const newAccessToken = tokenData.access_token;
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in ?? 0) * 1000).toISOString();

  const { error: updateConnectionError } = await supabaseAdmin
    .from('spotify_connections')
    .update({
      access_token: newAccessToken,
      expires_at: newExpiresAt,
      refresh_token: tokenData.refresh_token ?? refreshToken,
    })
    .eq('user_id', playerId);

  if (updateConnectionError && updateConnectionError.code !== '42P01' && updateConnectionError.code !== 'PGRST116') {
    throw new Error(updateConnectionError.message);
  }

  // Keep legacy columns synchronized while older room routes still read them.
  await supabaseAdmin
    .from('users')
    .update({
      spotify_access_token: newAccessToken,
      spotify_token_expires_at: newExpiresAt,
      spotify_refresh_token: tokenData.refresh_token ?? refreshToken,
    })
    .eq('id', playerId);

  return newAccessToken;
}

/*
 * Legacy implementation retained here only as a reference during migration.
 * New code must use spotify_connections above.
 */
async function getLegacySpotifyAccessTokenForUser(playerId: string) {
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

export async function fetchUserSavedTracks(playerId: string, excludeTrackIds: string[] = []) {
  const accessToken = await getSpotifyAccessTokenForUser(playerId);

  // 1. zuerst total Anzahl holen
  const firstPage = await fetch(
    'https://api.spotify.com/v1/me/tracks?limit=1',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!firstPage.ok) {
    throw new Error('Failed to fetch saved tracks (count)');
  }

  const firstData = await firstPage.json();
  const total = firstData.total ?? 0;

  if (total === 0) return [];

  // 2. Try to get tracks excluding the played ones
  // We fetch multiple pages and filter out played tracks
  let allTracks: any[] = [];
  const maxPagesToFetch = Math.min(10, Math.ceil(total / 50));
  
  for (let page = 0; page < maxPagesToFetch && allTracks.length < 50; page++) {
    const randomOffset = Math.floor(Math.random() * total);
    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=50&offset=${randomOffset}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch saved tracks from Spotify');
    }

    const data = await response.json();
    const tracks = (data.items ?? [])
      .map((item: any) => item.track)
      .filter((track: any) => track && track.album?.images?.length > 0);
    
    allTracks = [...allTracks, ...tracks];
    
    // If we have enough non-excluded tracks, break
    if (allTracks.length >= 50) break;
  }

  // Filter out excluded track IDs if provided
  if (excludeTrackIds.length > 0) {
    const excludeSet = new Set(excludeTrackIds);
    allTracks = allTracks.filter((track: any) => !excludeSet.has(track.id));
  }

  // Shuffle the results
  const shuffled = allTracks.sort(() => Math.random() - 0.5);
  
  // Return up to 50 tracks
  return shuffled.slice(0, 50);
}

export async function getRandomTrackForUser(playerId: string, excludeTrackIds: string[] = []) {
  if (!playerId) {
    throw new Error('playerId is required');
  }
  
  const savedTracks = await fetchUserSavedTracks(playerId, excludeTrackIds);
  if (!savedTracks || savedTracks.length === 0) {
    throw new Error('Keine Spotify-Titel gefunden. Bitte speichere Lieblingssongs oder gib Spotify Zugriff.');
  }

  const validTracks = savedTracks.filter((track: any) => track && track.album?.images?.[0]?.url);
  if (!validTracks || validTracks.length === 0) {
    throw new Error('Keine Spotify-Titel mit Cover gefunden.');
  }

  const track = validTracks[Math.floor(Math.random() * validTracks.length)];
  
  if (!track?.id || !track?.uri || !track?.name) {
    throw new Error('Invalid track data received from Spotify');
  }
  
  return {
    id: track.id,
    uri: track.uri,
    name: track.name,
    artist_names: track.artists?.map((artist: any) => artist.name).join(', ') ?? 'Unbekannt',
    album_name: track.album?.name ?? 'Unbekanntes Album',
    cover_url: track.album.images[0].url,
  };
}

export type SpotifyTopPeriod = 'short_term' | 'medium_term' | 'long_term';

export type ImportedSpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artist_names: string;
  album_name: string;
  cover_url: string | null;
};

export async function fetchUserTopTracks(
  playerId: string,
  period: SpotifyTopPeriod,
  limit = 500,
): Promise<ImportedSpotifyTrack[]> {
  const accessToken = await getSpotifyAccessTokenForUser(playerId);
  const tracks: ImportedSpotifyTrack[] = [];
  const pageSize = 50;

  for (let offset = 0; offset < limit; offset += pageSize) {
    const response = await fetchWithRetry<any>(
      `https://api.spotify.com/v1/me/top/tracks?time_range=${period}&limit=${pageSize}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const page = (response.items ?? [])
      .filter((track: any) => track?.id && track?.uri && track?.name)
      .map((track: any) => ({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist_names: track.artists?.map((artist: any) => artist.name).join(', ') ?? 'Unbekannt',
        album_name: track.album?.name ?? 'Unbekanntes Album',
        cover_url: track.album?.images?.[0]?.url ?? null,
      }));

    tracks.push(...page);
    if (page.length < pageSize || tracks.length >= limit) break;
  }

  return tracks.slice(0, limit);
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