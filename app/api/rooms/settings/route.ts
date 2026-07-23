import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const playerId = body.playerId as string | undefined;
  const roomCodeRaw = body.roomCode as string | undefined;
  const settings = body.settings;

  if (!playerId || !roomCodeRaw || !settings) {
    console.warn('[RoomsSettings] Missing payload', { roomCodeRaw, playerId: !!playerId, hasSettings: !!settings });
    return NextResponse.json({ error: 'Missing roomCode, playerId or settings' }, { status: 400 });
  }

  const roomCode = roomCodeRaw.toUpperCase();
  const supabaseAdmin = getSupabaseAdmin();

  // Align lookup strategy with /api/rooms/lookup
  const { data: roomBase, error: roomBaseError } = await supabaseAdmin
    .from('rooms')
    .select('id, room_code, host_id')
    .eq('room_code', roomCode)
    .single();

  if (roomBaseError || !roomBase) {
    console.warn('[RoomsSettings] Room not found (base lookup)', { roomCode, error: roomBaseError?.message });
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  // Read state_version separately (column can differ across environments)
  let stateVersion = 0;
  try {
    const { data: roomWithVersion } = await supabaseAdmin
      .from('rooms')
      .select('state_version')
      .eq('id', roomBase.id)
      .single();
    stateVersion = Number((roomWithVersion as any)?.state_version ?? 0);
  } catch {
    stateVersion = 0;
  }

  const room = { ...roomBase, state_version: stateVersion } as any;

  if (room.host_id !== playerId) {
    console.warn('[RoomsSettings] Forbidden host mismatch', { roomCode, hostId: room.host_id, playerId });
    return NextResponse.json({ error: 'Only the host can update settings' }, { status: 403 });
  }

  const normalizedSettings = {
    auto_advance: settings?.auto_advance ?? true,
    auto_advance_delay: settings?.auto_advance_delay ?? 10,
    anonymous_voting: settings?.anonymous_voting ?? true,
    auto_play_winner_song: settings?.auto_play_winner_song ?? true,
    auto_play_winner_duration: settings?.auto_play_winner_duration ?? 30,
    songs_per_player: Number.isInteger(Number(settings?.songs_per_player)) && Number(settings.songs_per_player) >= 1 && Number(settings.songs_per_player) <= 50 ? Number(settings.songs_per_player) : 1,
    library_amount: [50, 100, 250, 500].includes(Number(settings?.library_amount)) ? Number(settings.library_amount) : 100,
    library_period: ['short_term', 'medium_term', 'long_term'].includes(settings?.library_period) ? settings.library_period : 'long_term',
  };

  // Try update with state_version first; fallback for DBs without this column
  let updatedRoom: any = null;
  let updateError: any = null;

  {
    const result = await supabaseAdmin
      .from('rooms')
      .update({
        settings: normalizedSettings,
        state_version: (room as any).state_version ? (room as any).state_version + 1 : 1,
      } as any)
      .eq('id', room.id)
      .select('id, settings')
      .single();
    updatedRoom = result.data;
    updateError = result.error;
  }

  if (updateError?.code === 'PGRST204' || String(updateError?.message ?? '').includes('state_version')) {
    const fallback = await supabaseAdmin
      .from('rooms')
      .update({ settings: normalizedSettings } as any)
      .eq('id', room.id)
      .select('id, settings')
      .single();
    updatedRoom = fallback.data;
    updateError = fallback.error;
  }

  if (updatedRoom && !updateError) {
    updatedRoom = {
      ...updatedRoom,
      state_version: (room as any).state_version ? (room as any).state_version + 1 : 1,
    };
  }

  if (updateError || !updatedRoom) {
    console.error('[RoomsSettings] Failed to update settings', {
      roomCode,
      error: updateError?.message,
      details: (updateError as any)?.details,
      hint: (updateError as any)?.hint,
      code: (updateError as any)?.code,
    });
    return NextResponse.json(
      {
        error: 'Failed to update settings',
        dbError: updateError?.message ?? null,
        dbDetails: (updateError as any)?.details ?? null,
        dbHint: (updateError as any)?.hint ?? null,
        dbCode: (updateError as any)?.code ?? null,
      },
      { status: 500 },
    );
  }

  const { error: roomEventError } = await supabaseAdmin.from('room_events').insert({
    room_id: room.id,
    type: 'settings_updated',
    payload: {
      settings: updatedRoom.settings,
      state_version: updatedRoom.state_version,
      updated_by: playerId,
    },
  });

  if (roomEventError) {
    console.warn('room_events insert failed (non-blocking):', roomEventError.message);
  }

  return NextResponse.json({
    success: true,
    settings: updatedRoom.settings,
    stateVersion: updatedRoom.state_version,
  });
}
