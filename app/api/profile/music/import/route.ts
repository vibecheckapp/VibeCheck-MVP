import { NextResponse } from 'next/server';
import { fetchUserTopTracks, SpotifyTopPeriod } from '../../../../../lib/spotify';
import { getSupabaseAdmin } from '../../../../../lib/supabase-server';

const PERIODS: SpotifyTopPeriod[] = ['short_term', 'medium_term', 'long_term'];
const AMOUNTS = [50, 100, 250, 500];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body.userId ?? '').trim();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const imported = [];

    for (const period of PERIODS) {
      const tracks = await fetchUserTopTracks(userId, period, 500);
      if (!tracks.length) continue;

      const { error: songsError } = await supabaseAdmin.from('songs').upsert(
        tracks.map((track) => ({
          id: track.id,
          spotify_song_id: track.id,
          title: track.name,
          artist: track.artist_names,
          album: track.album_name,
          image_url: track.cover_url,
          metadata: {
            uri: track.uri,
            title: track.name,
            artist_names: track.artist_names,
            album_name: track.album_name,
            cover_url: track.cover_url,
          },
        })),
        { onConflict: 'id' },
      );

      if (songsError) {
        return NextResponse.json({ error: `Failed to save songs: ${songsError.message}` }, { status: 500 });
      }

      for (const amount of AMOUNTS) {
        const libraryTracks = tracks.slice(0, amount);
        const { data: library, error: libraryError } = await supabaseAdmin
          .from('music_libraries')
          .upsert(
            { user_id: userId, amount, period },
            { onConflict: 'user_id,amount,period' },
          )
          .select('id')
          .single();

        if (libraryError || !library) {
          return NextResponse.json(
            { error: libraryError?.message ?? 'Failed to create music library.' },
            { status: 500 },
          );
        }

        const { error: deleteError } = await supabaseAdmin
          .from('user_library_songs')
          .delete()
          .eq('library_id', library.id);

        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        const { error: linksError } = await supabaseAdmin.from('user_library_songs').insert(
          libraryTracks.map((track, index) => ({
            library_id: library.id,
            song_id: track.id,
            rank: index + 1,
          })),
        );

        if (linksError) {
          return NextResponse.json({ error: linksError.message }, { status: 500 });
        }

        imported.push({ period, amount, count: libraryTracks.length });
      }
    }

    const updatedAt = new Date().toISOString();
    const { error: profileUpdateError } = await supabaseAdmin
      .from('users')
      .update({ last_music_import_at: updatedAt })
      .eq('id', userId);

    if (profileUpdateError) {
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'imported', libraries: imported, updatedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import Spotify profile.' },
      { status: 500 },
    );
  }
}
