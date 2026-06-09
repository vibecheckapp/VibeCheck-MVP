import { NextResponse, NextRequest } from 'next/server';
import { getSpotifyAccessTokenForUser } from '../../../../lib/spotify';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');
    if (!playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });

    const accessToken = await getSpotifyAccessTokenForUser(playerId);
    // Return token and timestamp info (client may request refresh when needed)
    return NextResponse.json({ access_token: accessToken });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to get token' }, { status: 500 });
  }
}
