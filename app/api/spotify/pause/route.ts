import { NextResponse } from 'next/server';
import { spotifyPauseForUser } from '../../../../lib/spotify';

export async function POST(request: Request) {
  const body = await request.json();
  const { playerId, deviceId } = body;

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  try {
    await spotifyPauseForUser(playerId, deviceId);
    return NextResponse.json({ status: 'paused' });
  } catch (error: any) {
    const message = error.message ?? 'Spotify pause command failed';
    const friendly = message.includes('No active device found')
      ? 'Kein aktives Spotify-Gerät gefunden. Bitte starte Spotify auf deinem Gerät oder wähle ein Gerät aus.'
      : message;
    const status = message.includes('No active device found') ? 400 : 500;
    return NextResponse.json({ error: friendly }, { status });
  }
}
