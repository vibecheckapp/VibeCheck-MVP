import { getSupabaseAdmin } from './supabase-server';

export type LibraryPeriod = 'short_term' | 'medium_term' | 'long_term';

export type StoredTrack = {
  id: string;
  uri: string;
  name: string;
  artist_names: string;
  album_name: string;
  cover_url: string | null;
};

export async function getRandomStoredTrackForUser(
  userId: string,
  amount: number,
  period: LibraryPeriod,
  excludeTrackIds: string[] = [],
): Promise<StoredTrack> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: library, error: libraryError } = await supabaseAdmin
    .from('music_libraries')
    .select('id')
    .eq('user_id', userId)
    .eq('amount', amount)
    .eq('period', period)
    .maybeSingle();

  if (libraryError || !library) {
    throw new Error('Music library not found. Please update your music profile first.');
  }

  const { data: links, error: linksError } = await supabaseAdmin
    .from('user_library_songs')
    .select('rank, song_id, songs(id, spotify_song_id, title, artist, album, image_url, metadata)')
    .eq('library_id', library.id)
    .order('rank', { ascending: true });

  if (linksError) throw new Error(`Failed to load music library: ${linksError.message}`);

  const excluded = new Set(excludeTrackIds);
  const candidates = (links ?? [])
    .map((link: any) => {
      const song = Array.isArray(link.songs) ? link.songs[0] : link.songs;
      const metadata = song?.metadata ?? {};
      return song?.id
        ? {
            id: song.spotify_song_id ?? song.id,
            uri: metadata.uri ?? `spotify:track:${song.spotify_song_id ?? song.id}`,
            name: song.title ?? metadata.title ?? 'Unknown track',
            artist_names: song.artist ?? metadata.artist_names ?? 'Unknown artist',
            album_name: song.album ?? metadata.album_name ?? 'Unknown album',
            cover_url: song.image_url ?? metadata.cover_url ?? null,
          }
        : null;
    })
    .filter((track): track is StoredTrack => Boolean(track?.id && track?.uri && !excluded.has(track.id)));

  if (!candidates.length) {
    throw new Error('No unused songs are available in this music library.');
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}
