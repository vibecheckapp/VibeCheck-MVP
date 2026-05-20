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
    return NextResponse.json({ error: error.message ?? 'Spotify pause command failed' }, { status: 500 });
  }
}
