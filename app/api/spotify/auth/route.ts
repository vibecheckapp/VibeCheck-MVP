import { NextResponse } from 'next/server';
import { getSpotifyAuthUrl } from '../../../../lib/spotify';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');

  if (!playerId) {
    return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const authUrl = await getSpotifyAuthUrl(origin, playerId);

  return NextResponse.redirect(authUrl);
}
