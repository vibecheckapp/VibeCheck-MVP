import { NextResponse } from 'next/server';
import { spotifyPlayForUser } from '../../../../lib/spotify';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { playerId, uri, deviceId } = body;

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  // Fix: Validate URI format if provided
  if (uri && typeof uri !== 'string') {
    return NextResponse.json({ error: 'Invalid track URI' }, { status: 400 });
  }

  try {
    await spotifyPlayForUser(playerId, uri ?? undefined, deviceId);
    return NextResponse.json({ status: 'playing', uri, deviceId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Spotify play command failed';
    const friendly = message.includes('No active device found')
      ? 'Kein aktives Spotify-Gerät gefunden. Bitte starte Spotify auf deinem Gerät oder wähle ein Gerät aus.'
      : message;
    const status = message.includes('No active device found') ? 400 : 500;
    return NextResponse.json({ error: friendly }, { status });
  }
}
