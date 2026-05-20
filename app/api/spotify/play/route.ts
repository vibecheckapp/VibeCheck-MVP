import { NextResponse } from 'next/server';
import { spotifyPlayForUser } from '../../../../lib/spotify';

export async function POST(request: Request) {
  const body = await request.json();
  const { playerId, uri, deviceId } = body;

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  try {
    await spotifyPlayForUser(playerId, uri, deviceId);
    return NextResponse.json({ status: 'playing', uri, deviceId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Spotify play command failed' }, { status: 500 });
  }
}
