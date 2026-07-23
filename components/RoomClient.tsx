'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase-client';
import startRoomSync from '../lib/roomSync';
import useSpotifyPlayer from '../lib/useSpotifyPlayer';

interface RoomClientProps {
  roomCode: string;
  playerId?: string;
}

interface Player {
  id: string;
  name: string;
  spotify_connected?: boolean;
  library_ready?: boolean;
  last_seen?: string | null;
}

interface RoomSettings {
  auto_advance: boolean;
  auto_advance_delay: number;
  anonymous_voting: boolean;
  auto_play_winner_song: boolean;
  auto_play_winner_duration: number;
  songs_per_player: number;
  library_amount: 50 | 100 | 250 | 500;
  library_period: 'short_term' | 'medium_term' | 'long_term';
}

interface RoundPick {
  id: string;
  user_id: string;
  user_name?: string;
  track_name: string;
  artist_names: string;
  album_name?: string;
  cover_url?: string;
  uri: string;
  score_total: number;
  vote_count: number;
}

interface ScoreboardRow extends RoundPick {}
type ScoredSong = ScoreboardRow & { avgScore: number };

interface RoundState {
  id: string;
  scenario: string;
  status: 'playing' | 'finished';
  player_order: string[];
  current_turn_index: number;
  current_pick: RoundPick | null;
  scoreboard: ScoreboardRow[];
  votes_needed: number;
  votes_cast: number;
  user_vote: number | null;
  paused_at: string | null;
}

interface LookupResponse {
  room: { id: string; room_code: string; host_id?: string | null; active_round_id?: string | null; settings?: RoomSettings | null };
  players: Player[];
  currentPlayer: Player | null;
}

export default function RoomClient({ roomCode, playerId }: RoomClientProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [room, setRoom] = useState<LookupResponse['room'] | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [savedPlayerId, setSavedPlayerId] = useState<string | undefined>(playerId);
  const [startError, setStartError] = useState<string | null>(null);
  const [scenario, setScenario] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [roundState, setRoundState] = useState<RoundState | null>(null);
const [voteScore, setVoteScore] = useState<number | null>(null);
  const [hasTouchedVoteSlider, setHasTouchedVoteSlider] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);
// Ref for the voting slider to update data-value attribute
  const sliderRef = useRef<HTMLInputElement>(null);
// Refs for dynamic font scaling
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const artistRef = useRef<HTMLParagraphElement | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [currentPlayingUri, setCurrentPlayingUri] = useState<string | null>(null);
  const [winnerSongPlayed, setWinnerSongPlayed] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [roundError, setRoundError] = useState<string | null>(null);
const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [showLobbyAfterRound, setShowLobbyAfterRound] = useState(false);
  // Fix #2: Transition state to prevent race conditions
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Back to lobby transition timer (5 seconds)
  const [lobbyTransitionTime, setLobbyTransitionTime] = useState<number | null>(null);
  const [isInTransition, setIsInTransition] = useState(false);
// Player disconnect tracking
  const [disconnectedPlayers, setDisconnectedPlayers] = useState<Set<string>>(new Set());
  // Game pause state
  const [isPaused, setIsPaused] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  // Refresh indicator when returning to page after being away
  const [isRefreshingOnFocus, setIsRefreshingOnFocus] = useState(false);
// Room settings
const mapRoomSettings = (settings?: Partial<RoomSettings> | null): RoomSettings => ({
  auto_advance: settings?.auto_advance ?? true,
  auto_advance_delay: settings?.auto_advance_delay ?? 10,
  anonymous_voting: settings?.anonymous_voting ?? true,
  auto_play_winner_song: settings?.auto_play_winner_song ?? true,
  auto_play_winner_duration: settings?.auto_play_winner_duration ?? 30,
  songs_per_player: settings?.songs_per_player ?? 1,
  library_amount: settings?.library_amount ?? 100,
  library_period: settings?.library_period ?? 'long_term',
});

const [roomSettings, setRoomSettings] = useState<RoomSettings>(mapRoomSettings());
  // Auto-advance timer
  const [autoAdvanceTime, setAutoAdvanceTime] = useState<number | null>(null);
// Settings modal
  const [showSettings, setShowSettings] = useState(false);
// Custom scenarios from community
  const [customScenarioInput, setCustomScenarioInput] = useState('');
  const [customScenarioSent, setCustomScenarioSent] = useState(false);
  const [customScenarios, setCustomScenarios] = useState<{ id: string; suggestion: string; player_name: string }[]>([]);
  // Three buttons for scenario selection (replacing dropdown + input)
  const [showPresetScenarios, setShowPresetScenarios] = useState(false);
  const [showCustomScenarioInput, setShowCustomScenarioInput] = useState(false);
  const [showCommunitySuggestions, setShowCommunitySuggestions] = useState(false);
  const [showMusicSelectionModal, setShowMusicSelectionModal] = useState(false);
  const [showScenarioMenuModal, setShowScenarioMenuModal] = useState(false);
  const [selectedScoreboardPlayerId, setSelectedScoreboardPlayerId] = useState<string | null>(null);
  const [songsPerPlayerDraft, setSongsPerPlayerDraft] = useState(1);
  const [isDraggingSongsWheel, setIsDraggingSongsWheel] = useState(false);
// Player has last_seen
const [playerLastSeen, setPlayerLastSeen] = useState<Record<string, string>>({});
// Best song playback
  const [bestSongUri, setBestSongUri] = useState<string | null>(null);
  const [autoPlayedBest, setAutoPlayedBest] = useState(false);
  // Unterdrückt das Lookup-Round-Sync kurzzeitig — verhindert Race zwischen
  // lokaler Round-Neuanlage (Start Game) und stale Server-active_round_id.
  const [suppressRoundSync, setSuppressRoundSync] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
const [kickError, setKickError] = useState<string | null>(null);
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  // Notification badge state
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'warning' } | null>(null);
  const [notificationDismissing, setNotificationDismissing] = useState(false);
  const router = useRouter();
  
  // Notification auto-dismiss utility
  const showNotification = (message: string, type: 'error' | 'warning' = 'error') => {
    setNotification({ message, type });
    setNotificationDismissing(false);
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setNotificationDismissing(true);
      // Remove after fade animation completes
      setTimeout(() => {
        setNotification(null);
        setNotificationDismissing(false);
      }, 500);
    }, 3500);
  };

  const handleKickedOrRemovedFromRoom = () => {
    try {
      window.localStorage.removeItem(`vibecheck-player-${roomCode}`);
    } catch {}
    alert('You were removed from the room.');
    router.push('/');
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback für ältere Browser
      const textarea = document.createElement('textarea');
      textarea.value = roomCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (playerId) {
      window.localStorage.setItem(`vibecheck-player-${roomCode}`, playerId);
      setSavedPlayerId(playerId);
    } else {
      const stored = window.localStorage.getItem(`vibecheck-player-${roomCode}`);
      if (stored) {
        setSavedPlayerId(stored);
      }
    }
  }, [playerId, roomCode]);

  useEffect(() => {
    const query = new URLSearchParams({ roomCode });
    if (savedPlayerId) {
      query.set('playerId', savedPlayerId);
    }

fetch(`/api/rooms/lookup?${query.toString()}`)
      .then((res) => res.json())
.then((data: LookupResponse) => {
        if (savedPlayerId && !data.currentPlayer) {
          handleKickedOrRemovedFromRoom();
          return;
        }

        setRoom((prev) => {
          if (!prev) return data.room ?? null;
          // suppressRoundSync = wahr bedeutet: wir haben gerade lokal eine
          // neue Runde gestartet und wollen NICHT, dass der alte
          // active_round_id vom Server unseren frischen Wert überschreibt.
          if (suppressRoundSync) {
            setSuppressRoundSync(false);
            return { ...data.room, active_round_id: prev.active_round_id };
          }
          return data.room ?? null;
        });
setPlayers(data.players ?? []);
        setCurrentPlayer(data.currentPlayer ?? null);
// Load settings from room data if they exist (persisted until room is dissolved)
        // Ensure all settings default to true even if server returns partial settings
        if (data.room?.settings) {
          setRoomSettings(mapRoomSettings(data.room.settings));
        }
      })
      .catch(() => setRoom(null));
}, [roomCode, savedPlayerId]);

  // Determine host flag early so hooks can use it
  const isHost = currentPlayer?.id && room?.host_id ? currentPlayer.id === room.host_id : false;

// Initialize Spotify player - controls external Spotify app via REST API
  // FIX: Add callback to suppress polling during critical transitions
  const spotify = useSpotifyPlayer({ 
    playerId: currentPlayer?.id ?? '', 
    isHost, 
    roomCode: room?.room_code,
    onStateTransition: (isTransitioning) => {
      setIsRoundTransitioning(isTransitioning);
    }
  });

useEffect(() => {
    if (spotify?.error) {
      setPlaybackError(spotify.error);
      showNotification(spotify.error, 'error');
    }
  }, [spotify?.error]);

  // Watch playbackError and show as notification
  useEffect(() => {
    if (playbackError) {
      showNotification(playbackError, 'error');
    }
  }, [playbackError]);

  // Watch roundError and show as notification
  useEffect(() => {
    if (roundError) {
      showNotification(roundError, 'error');
    }
  }, [roundError]);

  // Watch startError and show as notification
  useEffect(() => {
    if (startError) {
      showNotification(startError, 'error');
    }
  }, [startError]);

  // Watch voteError and show as notification
  useEffect(() => {
    if (voteError) {
      showNotification(voteError, 'error');
    }
  }, [voteError]);

  // Watch nextError and show as notification
  useEffect(() => {
    if (nextError) {
      showNotification(nextError, 'error');
    }
  }, [nextError]);

// FIX: Playback state is now managed via the useSpotifyPlayer hook polling
  // No additional SDK-specific code needed - REST API handles all playback

// Centralized server-authoritative sync: subscribe to room_events and apply snapshots
  useEffect(() => {
    if (!room?.id) return;
    const stop = startRoomSync(room.id, {
      getLocalStateVersion: () => (room as any)?.state_version ?? null,
      onEvent: (ev) => {
        // optional: quick local reactions for non-authoritative UI effects
        // but authoritative state comes from snapshots
      },
      onSnapshot: (snapshot) => {
        try {
          const sRoom = snapshot.room ?? null;
          const sPlayers = snapshot.players ?? [];
          setRoom(sRoom);
          setPlayers(sPlayers);
          if (sRoom?.settings) {
            setRoomSettings(mapRoomSettings(sRoom.settings));
          }
          // FIX: Refresh happens silently in background - no UI indicator shown
          setIsRefreshingOnFocus(false);
          // votes and song_history are authoritative; merge minimally
          // The detailed round structure is fetched by existing round APIs when active_round_id changes
        } catch (err) {
          console.error('apply snapshot error', err);
        }
      },
      onVisibilityChange: (isVisible, wasHiddenDurationMs) => {
        if (isVisible && wasHiddenDurationMs && wasHiddenDurationMs > 1000) {
          // FIX: Silent refresh in background only - no UI indicator
          setIsRefreshingOnFocus(true);
          console.log('[RoomClient] Silent refresh after returning from background');
        }
      },
      playerId: savedPlayerId,
      roomCode,
    });

    return () => stop();
  }, [room?.id, savedPlayerId, roomCode]);

  // NOTE: Playback is now explicitly controlled via handlePlayPause button click only.
  // Do NOT auto-play on new current_pick; let host decide when to press Play.

// Load custom scenarios when in lobby (no active round)
  useEffect(() => {
    if (!room?.id || room?.active_round_id) {
      setCustomScenarios([]);
      return;
    }
    
    fetch(`/api/scenario-suggestions?roomId=${room.id}`)
      .then(res => res.json())
      .then(data => setCustomScenarios(data.suggestions ?? []))
      .catch(() => setCustomScenarios([]));
  }, [room?.id, room?.active_round_id]);

  // Realtime: scenario_suggestions changes - Task 3
  useEffect(() => {
    if (!room?.id || room?.active_round_id) {
      return;
    }

    let mounted = true;

    const channel = supabase
      .channel(`scenario-suggestions-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scenario_suggestions',
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!mounted) return;
          // Refresh suggestions when anyone adds/updates
          try {
            const res = await fetch(`/api/scenario-suggestions?roomId=${room.id}`);
            const data = await res.json();
            if (mounted) {
              setCustomScenarios(data.suggestions ?? []);
            }
          } catch { /* ignore */ }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, room?.active_round_id]);

  useEffect(() => {
    if (!room?.active_round_id || !savedPlayerId) {
      setRoundState(null);
      return;
    }

let mounted = true;
    const roundId = room.active_round_id;

    const fetchRound = async (retries = 3, delayMs = 100) => {
      try {
        let response = await fetch(`/api/rounds/${roundId}?playerId=${savedPlayerId}`);
        let data = await response.json();
        
        // Handle Supabase replica lag: retry 404 a few times with exponential backoff
        let attempt = 0;
        while (response.status === 404 && attempt < retries && mounted) {
          console.log('[fetchRound] 404, retrying in', delayMs, 'ms...');
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2; // exponential backoff
          attempt++;
          response = await fetch(`/api/rounds/${roundId}?playerId=${savedPlayerId}`);
          data = await response.json();
        }
        
if (mounted && response.ok) {
          setRoundState(data.round ?? null);
          // FIX: Don't set isPlaying/playbackActive here - SDK state listener will handle it
          setWinnerSongPlayed(false);
          // Extract paused_at from round data and update local isPaused state
          if (data.round?.paused_at) {
            setIsPaused(true);
          } else if (data.round?.status === 'playing') {
            setIsPaused(false);
          }
          setRoundError(null);
          if (!data.round) {
            setRoom((prev) => (prev ? { ...prev, active_round_id: null } : prev));
          }
        } else if (mounted) {
          setRoundError(data.error || 'Rundendaten konnten nicht geladen werden.');
        }
      } catch {
        if (mounted) {
          setRoundError('Fehler beim Laden der aktuellen Runde.');
        }
      }
    };

    fetchRound();

    // Realtime: Runden-Statusänderungen (inkl. neuer Pick, Votes, Round-Ende)
    const roundsChannel = supabase
      .channel(`rounds-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        () => {
          if (mounted) fetchRound();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(roundsChannel);
    };
  }, [room?.active_round_id, savedPlayerId]);

  // Realtime: Spieler-Join/Leave im Raum
  useEffect(() => {
    if (!room?.id) return;

    let mounted = true;

    const channel = supabase
      .channel(`room-players-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          if (!mounted) return;
          // Spielerliste neu laden
          try {
            const res = await fetch(`/api/rooms/lookup?roomCode=${roomCode}${savedPlayerId ? `&playerId=${savedPlayerId}` : ''}`);
            const data: LookupResponse = await res.json();
            if (mounted) {
              if (savedPlayerId && !data.currentPlayer) {
                handleKickedOrRemovedFromRoom();
                return;
              }
              setPlayers(data.players ?? []);
              setRoom((prev) => prev ? { ...prev, host_id: data.room?.host_id } : prev);
            }
          } catch { /* leer */ }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, roomCode, savedPlayerId]);

  // Realtime: Votes-Änderungen (Live-Updates der Vote-Anzahl und Score)
  useEffect(() => {
    if (!room?.active_round_id) return;

    let mounted = true;

    const channel = supabase
      .channel(`votes-${room.active_round_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'votes',
          filter: `round_id=eq.${room.active_round_id}`,
        },
        async () => {
          if (!mounted) return;
          // Aktuellen Round-State frisch laden für akkurate Vote-Counts
          try {
            const res = await fetch(`/api/rounds/${room.active_round_id}?playerId=${savedPlayerId}`);
            const data = await res.json();
            if (mounted && res.ok) {
              setRoundState((prev) =>
                prev ? { ...prev, votes_cast: data.round?.votes_cast ?? prev.votes_cast } : prev
              );
            }
          } catch { /* leer */ }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room?.active_round_id, savedPlayerId]);

  // Realtime: Raumbreichnung/Löschung durch Host miterleben + host_id Änderungen
  useEffect(() => {
    if (!room?.id) return;

    let mounted = true;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${room.id}`,
        },
        async (payload) => {
          if (!mounted) return;

          if (payload.eventType === 'DELETE') {
            alert('The room was dissolved by the host.');
            router.push('/room/enter');
            return;
          }

          if (payload.eventType === 'UPDATE') {
            const newActiveRoundId = payload.new?.active_round_id;
            const oldActiveRoundId = payload.old?.active_round_id;
            const updatedSettings = payload.new?.settings;

            // Prüfe ob active_round_id sich geändert hat → Runde startet/wechselt
            if (newActiveRoundId !== oldActiveRoundId) {
              if (mounted) {
                setRoom((prev) => prev ? { ...prev, active_round_id: newActiveRoundId } : prev);
                // Neue Runde sofort fetchen
                if (newActiveRoundId && savedPlayerId) {
                  fetch(`/api/rounds/${newActiveRoundId}?playerId=${savedPlayerId}`)
                    .then((res) => res.json())
.then((data) => {
                      if (mounted) {
                        setRoundState(data.round ?? null);
                        // FIX: Don't set isPlaying/playbackActive here - SDK state listener will handle it
                        setWinnerSongPlayed(false);
                        if (data.round) setShowLobbyAfterRound(false);
                      }
                    })
                    .catch(() => {});
                }
              }
            }

            // Room settings changed -> apply live for all players immediately
            if (updatedSettings) {
              setRoomSettings(mapRoomSettings(updatedSettings));
            }

            // host_id / players refresh
            try {
              const res = await fetch(`/api/rooms/lookup?roomCode=${roomCode}${savedPlayerId ? `&playerId=${savedPlayerId}` : ''}`);
              const data: LookupResponse = await res.json();
              if (mounted) {
                if (savedPlayerId && !data.currentPlayer) {
                  handleKickedOrRemovedFromRoom();
                  return;
                }
                setRoom((prev) => prev ? { ...prev, host_id: data.room?.host_id } : prev);
                setPlayers(data.players ?? []);
              }
            } catch { /* leer */ }
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, roomCode, savedPlayerId, router]);

  // Realtime: Spotify-Connect Status und Lobby-Broadcast (über room_notifications)
  useEffect(() => {
    if (!room?.id) return;

    let mounted = true;

    const channel = supabase
      .channel(`room-notifications-${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_notifications',
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          if (!mounted) return;

          const eventType = payload.new?.event_type;

          // Handle return_to_lobby broadcast - IMMER zurückschicken zur Lobby
          // Diese Notification kommt NUR vom Host wenn eine Runde beendet werden soll
          if (eventType === 'return_to_lobby') {
            setShowLobbyAfterRound(true);
            setRoundState((prev) => prev ? { ...prev, status: 'finished' } : prev);
            // Lokal active_round_id null setzen UND frische Daten vom Server holen
            setRoom((prev) => prev ? { ...prev, active_round_id: null } : prev);
            // Runde neu laden (wird null zurückgeben wenn sauber beendet)
            if (savedPlayerId) {
              fetch(`/api/rooms/lookup?roomCode=${roomCode}&playerId=${savedPlayerId}`)
                .then((res) => res.json())
                .then((data) => {
                  if (mounted) {
                    setRoom((prev) => prev ? { ...prev, active_round_id: data.room?.active_round_id ?? null } : prev);
                    setRoundState(null);
                  }
                })
                .catch(() => {
                  if (mounted) setRoundState(null);
                });
            }
            return;
          }

          // Otherwise refresh players for Spotify connect updates
          if (eventType === 'player_spotify_update') {
            try {
              const res = await fetch(`/api/rooms/lookup?roomCode=${roomCode}${savedPlayerId ? `&playerId=${savedPlayerId}` : ''}`);
              const data: LookupResponse = await res.json();
              if (mounted) {
                if (savedPlayerId && !data.currentPlayer) {
                  handleKickedOrRemovedFromRoom();
                  return;
                }
                setPlayers(data.players ?? []);
                setCurrentPlayer(data.currentPlayer ?? null);
              }
            } catch { /* leer */ }
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, roomCode, savedPlayerId]);

  // Heartbeat: update last_seen every 15 seconds while in room
  useEffect(() => {
    if (!savedPlayerId) return;

    const interval = setInterval(async () => {
      try {
        await fetch('/api/rooms/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode, playerId: savedPlayerId }),
        });
      } catch {}
    }, 15000);

return () => clearInterval(interval);
  }, [savedPlayerId, roomCode]);

  // Disconnect detection during rounds: check player last_seen every 10 seconds
  useEffect(() => {
    if (!room?.active_round_id || !savedPlayerId || roundState?.status !== 'playing') return;

    const checkDisconnects = async () => {
      try {
        const res = await fetch(`/api/rooms/lookup?roomCode=${roomCode}&playerId=${savedPlayerId}`);
        const data: LookupResponse = await res.json();
        
        if (!data.players || !roundState?.player_order) return;
        
        const now = new Date();
        const disconnectedPlayersList: string[] = [];
        
        // Check each player in the current round
        for (const player of data.players) {
          if (roundState.player_order.includes(player.id)) {
            // If player has no last_seen or it's more than 30 seconds old, mark as disconnected
            const lastSeen = player.last_seen ? new Date(player.last_seen) : null;
            const secondsSinceLastSeen = lastSeen 
              ? (now.getTime() - lastSeen.getTime()) / 1000 
              : 999; // If no last_seen, assume disconnected
              
            if (secondsSinceLastSeen > 30) {
              disconnectedPlayersList.push(player.id);
            }
          }
        }
        
        // Update disconnected players set
        setDisconnectedPlayers(new Set(disconnectedPlayersList));
        
        // If current player disconnected, auto-skip to next player
        const currentPlayerId = roundState.current_pick?.user_id;
        if (currentPlayerId && disconnectedPlayersList.includes(currentPlayerId)) {
          console.log('[Disconnect] Current player disconnected, auto-skipping...');
          handleNextPlayer();
        }
      } catch (error) {
        console.log('[Disconnect] Error checking player status:', error);
      }
    };

    // Poll every 10 seconds during active round
    const interval = setInterval(checkDisconnects, 10000);
    
    // Also check immediately on mount
    checkDisconnects();
    
    return () => clearInterval(interval);
  }, [room?.active_round_id, savedPlayerId, roomCode, roundState?.status, roundState?.player_order, roundState?.current_pick?.user_id]);

// Reset vote state when current pick changes (for ALL players)
  useEffect(() => {
    const currentPickId = roundState?.current_pick?.id;
    if (currentPickId) {
      // New player turn - reset vote score and messages
      setVoteScore(null);
      setHasTouchedVoteSlider(false);
      setVoteSuccess(null);
setVoteError(null);
    }
  }, [roundState?.current_pick?.id]);

// Dynamic font scaling: adjust font size to fit title and artist in container
useEffect(() => {
    const parent = titleRef.current?.parentElement;
    if (!parent) return;

    // Function to adjust fonts based on available container width
    const adjustFonts = () => {
      if (!titleRef.current || !artistRef.current) return;

      // Get the actual available width from the parent container
      const containerWidth = parent.clientWidth;
      if (containerWidth <= 0) return;

      // Reset styles first
      titleRef.current.style.fontSize = '1.35rem';
      artistRef.current.style.fontSize = '0.95rem';

      // Adjust title font size - ensure it fits within container
      let titleSize = 1.35;
      const minTitleSize = 0.75;
      while (titleRef.current.scrollWidth > containerWidth && titleSize > minTitleSize) {
        titleSize -= 0.05;
        titleRef.current.style.fontSize = `${titleSize}rem`;
      }

      // Adjust artist font size - ensure it fits within container
      let artistSize = 0.95;
      const minArtistSize = 0.6;
      while (artistRef.current.scrollWidth > containerWidth && artistSize > minArtistSize) {
        artistSize -= 0.05;
        artistRef.current.style.fontSize = `${artistSize}rem`;
      }
    };

    // Use ResizeObserver to detect container width changes (more robust than timer)
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => adjustFonts());
    });

    resizeObserver.observe(parent);

    // Initial adjustment after render
    const timer = setTimeout(adjustFonts, 50);

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
    };
  }, [roundState?.current_pick?.track_name, roundState?.current_pick?.artist_names]);

// Update slider thumb value display when voteScore changes
  useEffect(() => {
    if (sliderRef.current) {
      const value = voteScore ?? 5;
      sliderRef.current.style.setProperty('--thumb-value', String(value));
    }
  }, [voteScore]);

  // Immediate round sync when active_round_id transitions from null -> new round id
  const fetchRound = async (roundId: string) => {
    if (!savedPlayerId) return;
    try {
const response = await fetch(`/api/rounds/${roundId}?playerId=${savedPlayerId}`);
      const data = await response.json();
      if (response.ok) {
        setRoundState(data.round ?? null);
        // FIX: Don't set isPlaying/playbackActive here - SDK state listener will handle it
        setWinnerSongPlayed(false);
        setRoundError(null);
        if (!data.round) {
          setRoom((prev) => (prev ? { ...prev, active_round_id: null } : prev));
        }
      } else {
        setRoundError(data.error || 'Rundendaten konnten nicht geladen werden.');
      }
    } catch {
      setRoundError('Fehler beim Laden der aktuellen Runde.');
    }
  };

  useEffect(() => {
    if (!room?.active_round_id) return;
    fetchRound(room.active_round_id);
  }, [room?.active_round_id]);

const handleConnectSpotify = () => {
    if (!savedPlayerId) return;
window.location.href = `/api/spotify/auth?playerId=${savedPlayerId}`;
  };

// Helper: Play a track by URI - used for auto-play when advancing to next player
  // FIX: Added guard to prevent multiple simultaneous auto-play calls
  const playTrackUri = async (trackUri: string) => {
    if (!trackUri) return;
    
    // FIX: Prevent multiple auto-play calls
    if (autoPlayInProgressRef.current) {
      console.log('[playTrackUri] Auto-play already in progress, skipping');
      return;
    }
    autoPlayInProgressRef.current = true;
    
    // FIX: Suppress polling during auto-play to prevent state conflicts
    if (spotify?.suppressPolling) {
      spotify.suppressPolling(true);
    }
    
    try {
      // Use REST API to control external Spotify app
      if (spotify?.play) {
        await spotify.play(trackUri);
        setCurrentPlayingUri(trackUri);
      }
    } catch (playError: any) {
      const msg = String(playError?.message ?? '');
      if (msg.toLowerCase().includes('restriction') || msg.toLowerCase().includes('spotify')) {
        setPlaybackError('Auto-Play: Bitte manuell auf Play drücken.');
        return;
      }
      console.error('Auto-play error:', playError);
    } finally {
      // Reset guard after a delay to prevent rapid re-triggers
      setTimeout(() => {
        autoPlayInProgressRef.current = false;
        // FIX: Re-enable polling after auto-play completes
        if (spotify?.suppressPolling) {
          spotify.suppressPolling(false);
        }
      }, 2000);
    }
  };

const handlePauseGame = async (action: 'pause' | 'resume') => {
    if (!room?.active_round_id || !currentPlayer?.id) return;
    setIsPausing(true);
    try {
      const response = await fetch('/api/rounds/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: room.active_round_id, playerId: currentPlayer.id, action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setRoundError(data.error || 'Failed to pause/resume game');
        return;
      }
      setIsPaused(action === 'pause');
      // Auto-close settings when resuming
      if (action === 'resume') {
        setShowSettings(false);
      }
    } catch (error) {
      setRoundError('Failed to pause/resume game');
    } finally {
      setIsPausing(false);
    }
  };

const handleUpdateSettings = async (newSettings: RoomSettings) => {
    if (!room?.room_code || !currentPlayer?.id) return;
    try {
      let response = await fetch(`/api/rooms/${room.room_code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: currentPlayer.id, settings: newSettings }),
      });

      // Fallback for environments where nested dynamic route may resolve to 404
      if (response.status === 404) {
        response = await fetch('/api/rooms/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomCode: room.room_code, playerId: currentPlayer.id, settings: newSettings }),
        });
      }

      const data = await response.json();
      if (!response.ok) {
        setRoundError(data.error || 'Failed to update settings');
        return;
      }
      setRoomSettings(newSettings);
    } catch (error) {
      setRoundError('Failed to update settings');
    }
};

  const commitSongsPerPlayer = () => {
    if (!isHost || !showMusicSelectionModal) return;
    const nextAmount = Math.min(10, Math.max(1, songsPerPlayerDraft));
    if (nextAmount === roomSettings.songs_per_player) return;
    void handleUpdateSettings({ ...roomSettings, songs_per_player: nextAmount });
  };

  const closeMusicSelectionModal = () => {
    commitSongsPerPlayer();
    setShowMusicSelectionModal(false);
    setIsDraggingSongsWheel(false);
  };

  useEffect(() => {
    if (!showMusicSelectionModal || isDraggingSongsWheel) return;
    setSongsPerPlayerDraft(roomSettings.songs_per_player);
  }, [showMusicSelectionModal, roomSettings.songs_per_player, isDraggingSongsWheel]);

const handleSubmitCustomScenario = async () => {
    if (!room?.id || !currentPlayer?.id || !customScenarioInput.trim()) return;
    setCustomScenarioSent(true);
    try {
      const response = await fetch('/api/scenario-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: room.id, playerId: currentPlayer.id, suggestion: customScenarioInput.trim() }),
      });
      if (response.ok) {
        setCustomScenarioInput('');
        // Refresh custom scenarios
        fetch(`/api/scenario-suggestions?roomId=${room.id}`)
          .then(res => res.json())
          .then(data => setCustomScenarios(data.suggestions ?? []));
      }
    } catch { /* ignore */ }
    setTimeout(() => setCustomScenarioSent(false), 2000);
  };

  const allSpotifyConnected = players.length > 0 && players.every((player) => player.spotify_connected);
  const canStartRound = isHost && !!scenario.trim() && !room?.active_round_id;
  const isPlayingRound = !!room?.active_round_id && !showLobbyAfterRound;
  const currentPick = roundState?.current_pick;
  const canVote = !!currentPlayer && roundState?.status === 'playing' && !!currentPick;
  const hasVoted = roundState?.user_vote != null;
const allVotesReady = roundState ? roundState.votes_cast >= roundState.votes_needed : false;
  // When anonymous voting is active, player names stay hidden for the entire round.
  const showPlayerName = !roomSettings.anonymous_voting;
const effectivePaused = !!roundState && roundState.status === 'playing' && (isPaused || !!roundState.paused_at);
  const activeTrackUri = spotify?.currentTrackUri ?? currentPlayingUri;
  const isActiveTrackPlaying = Boolean(spotify?.isSdkPlaying || playbackActive);

  const scoredSongs = useMemo<ScoredSong[]>(
    () =>
      (roundState?.scoreboard ?? [])
        .filter((row) => row.user_id && row.track_name && row.uri)
        .map((row) => ({
          ...row,
          avgScore: row.vote_count > 0 ? row.score_total / row.vote_count : 0,
        })),
    [roundState?.scoreboard],
  );

  const topSongOverall = useMemo(() => {
    if (!scoredSongs.length) return null;
    return [...scoredSongs].sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.score_total - a.score_total;
    })[0] ?? null;
  }, [scoredSongs]);

  const playerScoreboard = useMemo(() => {
    const byPlayer = new Map<
      string,
      {
        user_id: string;
        user_name: string;
        totalScore: number;
        totalVotes: number;
        songCount: number;
        bestSong: ScoreboardRow | null;
        bestSongAvg: number;
        songs: ScoredSong[];
      }
    >();

    for (const row of scoredSongs) {
      const existing = byPlayer.get(row.user_id) ?? {
        user_id: row.user_id,
        user_name: row.user_name ?? 'Unbekannt',
        totalScore: 0,
        totalVotes: 0,
        songCount: 0,
        bestSong: null,
        bestSongAvg: -1,
        songs: [],
      };

      const rowAvg = row.vote_count > 0 ? row.score_total / row.vote_count : 0;
      existing.totalScore += row.score_total;
      existing.totalVotes += row.vote_count;
      existing.songCount += 1;
      existing.songs.push(row);

      if (
        !existing.bestSong ||
        rowAvg > existing.bestSongAvg ||
        (rowAvg === existing.bestSongAvg && row.score_total > (existing.bestSong?.score_total ?? 0))
      ) {
        existing.bestSong = row;
        existing.bestSongAvg = rowAvg;
      }

      byPlayer.set(row.user_id, existing);
    }

    return Array.from(byPlayer.values())
      .map((player) => ({
        ...player,
        avgScore: player.totalVotes > 0 ? player.totalScore / player.totalVotes : 0,
        songs: [...player.songs].sort((a, b) => {
          if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
          return b.score_total - a.score_total;
        }),
      }))
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        return b.totalScore - a.totalScore;
      });
  }, [scoredSongs]);

  const selectedScoreboardPlayer = useMemo(
    () => playerScoreboard.find((player) => player.user_id === selectedScoreboardPlayerId) ?? null,
    [playerScoreboard, selectedScoreboardPlayerId],
  );

  useEffect(() => {
    if (roundState?.status !== 'finished') {
      setSelectedScoreboardPlayerId(null);
    }
  }, [roundState?.status]);
  
  // Auto-advance timer: start countdown when all votes are ready and setting is enabled
  useEffect(() => {
    if (!allVotesReady || !roomSettings.auto_advance || !isHost || roundState?.status !== 'playing' || effectivePaused) {
      setAutoAdvanceTime(null);
      return;
    }

    if (roomSettings.auto_advance_delay <= 0) {
      setAutoAdvanceTime(null);
      handleNextPlayer();
      return;
    }

    setAutoAdvanceTime(roomSettings.auto_advance_delay);

    const timer = setInterval(() => {
      setAutoAdvanceTime((prev) => {
        const next = (prev ?? 1) - 1;
        if (next <= 0) {
          clearInterval(timer);
          // Auto-advance to next player
          handleNextPlayer();
          return null;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [allVotesReady, roomSettings.auto_advance, roomSettings.auto_advance_delay, isHost, roundState?.status, effectivePaused]);

// Auto-play winner song when round finishes (immediate, no delay)
  useEffect(() => {
    if (!roundState || roundState.status !== 'finished' || winnerSongPlayed || !isHost || !spotify?.ready || !roomSettings.auto_play_winner_song) {
      return;
    }

    if (!topSongOverall?.uri) {
      return;
    }

    const winnerUri = topSongOverall.uri;

// FIX: Play via REST API with guard to prevent conflicts
    const playWinner = async () => {
      if (activeTrackUri === winnerUri && isActiveTrackPlaying) {
        setWinnerSongPlayed(true);
        setCurrentPlayingUri(winnerUri);
        setPlaybackActive(true);
        return;
      }

      // FIX: Prevent multiple auto-play calls
      if (autoPlayInProgressRef.current) {
        console.log('[playWinner] Auto-play already in progress, skipping');
        return;
      }
      autoPlayInProgressRef.current = true;
      
      // FIX: Suppress polling during winner song auto-play
      if (spotify?.suppressPolling) {
        spotify.suppressPolling(true);
      }
      
      try {
        if (spotify?.play) {
          await spotify.play(winnerUri);
          setCurrentPlayingUri(winnerUri);
          setWinnerSongPlayed(true);
          // After auto-play: button shows "⏸" (music is playing, click to pause)
          setPlaybackActive(true);
        }
      } catch (error: any) {
        const msg = String(error?.message ?? '');
        if (msg.toLowerCase().includes('restriction') || msg.toLowerCase().includes('spotify')) {
          setPlaybackError('Auto-Play: Bitte manuell auf Play drücken.');
          return;
        }
        console.error('Auto-play winner song error:', error);
      } finally {
        setTimeout(() => {
          autoPlayInProgressRef.current = false;
          // FIX: Re-enable polling after winner song starts
          if (spotify?.suppressPolling) {
            spotify.suppressPolling(false);
          }
        }, 2000);
      }
    };
    playWinner();

    let stopTimeout: NodeJS.Timeout | null = null;
    if (roomSettings.auto_play_winner_duration > 0) {
      // Use REST API for auto-stop
      stopTimeout = setTimeout(async () => {
        try {
          if (spotify?.pause) {
            await spotify.pause();
          }
        } catch (error) {
          console.error('Auto-stop winner song error:', error);
        }
      }, roomSettings.auto_play_winner_duration * 1000);
    }

    return () => {
      if (stopTimeout) clearTimeout(stopTimeout);
    };
  }, [
    roundState?.status,
    topSongOverall,
    winnerSongPlayed,
    activeTrackUri,
    isActiveTrackPlaying,
    isHost,
    spotify?.ready,
    spotify?.isSdkPlaying,
    spotify?.currentTrackUri,
    roomSettings.auto_play_winner_song,
    roomSettings.auto_play_winner_duration,
    spotify
  ]);

  const canNext = isHost && roundState?.status === 'playing' && allVotesReady;
  const playerCanControl = currentPlayer?.id === currentPick?.user_id || isHost;
  const spotifyDeviceHint = playbackError?.includes('No active Spotify device found')
    ? 'Launch Spotify on your device and select it from the devices menu (desktop, web player, or mobile device).'
    : null;

  const handleStartRound = async () => {
    if (!room?.id || !currentPlayer?.id) return;
    setStartError(null);
    setIsStarting(true);

    try {
      const response = await fetch('/api/rounds/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: room.id,
          playerId: currentPlayer.id,
          scenario: scenario.trim(),
          settings: roomSettings,
        }),
      });

      const data = await response.json();
      setIsStarting(false);

      if (!response.ok) {
        setStartError(data.error || 'Could not start the round.');
        return;
      }

if (data.round?.id) {
        setRoom((prev) => (prev ? { ...prev, active_round_id: data.round.id } : prev));
        // Reset lobby transition state for new round
        fetchRound(data.round.id);
        
// Auto-play first song when round starts (host only)
        if (isHost) {
          const firstUri = data.round?.current_pick?.uri;
          if (firstUri) {
            await playTrackUri(firstUri);
            setPlaybackActive(true);
          }
        }
      }
    } catch (error) {
      setIsStarting(false);
      setStartError('Failed to start the round. Please check your Spotify connection.');
    }
  };

  const handleVoteSubmit = async () => {
    if (!room?.active_round_id || !currentPick || !currentPlayer || voteScore === null) {
      setVoteError('Please select a rating first.');
      return;
    }

    setVoteError(null);
    setVoteSuccess(null);

    const response = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roundId: room.active_round_id, roundPickId: currentPick.id, userId: currentPlayer.id, score: voteScore }),
    });

    const data = await response.json();
    if (!response.ok) {
      setVoteError(data.error || 'Could not save the vote.');
      return;
    }

    setVoteSuccess('Vote saved!');
    if (room.active_round_id) {
      await fetchRound(room.active_round_id);
    }
    setRoundState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        current_pick: prev.current_pick
          ? { ...prev.current_pick, score_total: data.scoreTotal ?? prev.current_pick.score_total, vote_count: data.voteCount ?? prev.current_pick.vote_count }
          : prev.current_pick,
        user_vote: voteScore,
        votes_cast: data.voteCount ?? prev.votes_cast,
      };
    });
  };

  const handleNextPlayer = async () => {
    if (!room?.active_round_id || !currentPlayer?.id || isTransitioning || effectivePaused) return;
    setIsTransitioning(true);
    setNextError(null);

    const response = await fetch(`/api/rounds/${room.active_round_id}/next-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id }),
    });

    const data = await response.json();
    if (!response.ok) {
setNextError(data.error || 'Could not move to next player.');
      setIsTransitioning(false);
      return;
    }

if (data.status === 'finished') {
      await fetchRound(room.active_round_id);
      // FIX: Don't manually set isPlaying state - let SDK state listener handle it
      // We keep currentPlayingUri for reference but let SDK manage playback state
      setIsTransitioning(false);
      return;
    }

if (data.pick) {
      const newPick = {
        id: data.pick.id,
        user_id: data.pick.user_id,
        user_name: players.find((player) => player.id === data.pick.user_id)?.name ?? 'Unbekannt',
        track_name: data.pick.track_name,
        artist_names: data.pick.artist_names,
        album_name: data.pick.album_name,
        cover_url: data.pick.cover_url,
        uri: data.pick.uri,
        played: data.pick.played,
        score_total: 0,
        vote_count: 0,
      };
      
      setRoundState((prev) =>
        prev
          ? {
              ...prev,
              current_turn_index: prev.current_turn_index + 1,
              current_pick: newPick,
              user_vote: null,
              votes_cast: 0,
            }
          : prev
      );
setVoteScore(null);
      setHasTouchedVoteSlider(false);
      setVoteSuccess(null);
      setVoteError(null);
      setIsTransitioning(false);
      
// Auto-play new song when advancing to next player (host only)
      if (isHost) {
        if (data.pick.uri) {
          await playTrackUri(data.pick.uri);
          setPlaybackActive(true);
        }
      } else {
        setCurrentPlayingUri(data.pick.uri);
      }

      // Refresh canonical round state after playback has already switched.
      void fetchRound(room.active_round_id);
    }
  };

// FIX: Add ref for debounce to prevent rapid clicking
  const lastPlaybackActionRef = useRef<number>(0);
  const MIN_ACTION_INTERVAL_MS = 500;

// FIX: Auto-play guard to prevent multiple simultaneous auto-play calls
  const autoPlayInProgressRef = useRef<boolean>(false);

// FIX: Track round status to prevent polling during transitions
  const [isRoundTransitioning, setIsRoundTransitioning] = useState(false);

// FIX: Playback loading state for smooth UI
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const MIN_LOADING_MS = 300;

// FIX: Play/Pause button now controls external Spotify app via REST API
// Button shows: "⏸" when playing (click to pause), "▶" when paused (click to resume)
// FIX: Added polling suppression during manual play/pause to prevent state conflicts
const handlePlayPause = async () => {
    // Debounce - prevent rapid clicking causing race conditions
    const now = Date.now();
    if (now - lastPlaybackActionRef.current < MIN_ACTION_INTERVAL_MS) {
      console.log('[handlePlayPause] Debouncing - too soon after last action');
      return;
    }
    lastPlaybackActionRef.current = now;

    if (!playerCanControl || !currentPlayer?.id || !currentPick || effectivePaused) return;

    // FIX: Suppress polling during manual control
    if (spotify?.suppressPolling) {
      spotify.suppressPolling(true);
    }
    
    // Use the spotify hook to control playback
    setPlaybackLoading(true);
    setPlaybackBusy(true);
    setPlaybackError(null);

try {
      if (playbackActive) {
        // Music is playing - pause it (stays at current position)
        if (spotify?.pause) {
          await spotify.pause();
        }
        // After pausing: button shows "▶" (Play/Resume icon)
        setPlaybackActive(false);
      } else {
        // Music is paused - resume from current position (NOT restart from beginning)
        if (spotify?.resume) {
          await spotify.resume();
        }
        // After resuming: button shows "⏸" (Pause icon)
        setPlaybackActive(true);
      }
    } catch (error: any) {
      setPlaybackError(error?.message ?? 'Error controlling playback.');
    } finally {
      setPlaybackLoading(false);
      setPlaybackBusy(false);
      // FIX: Re-enable polling after manual control
      setTimeout(() => {
        if (spotify?.suppressPolling) {
          spotify.suppressPolling(false);
        }
      }, 1500);
    }
  };

  const handleLeaveRoom = async () => {
    const confirmed = window.confirm('Are you sure you want to leave the lobby?');
    if (!confirmed) return;

    if (savedPlayerId && roomCode) {
      try {
        await fetch(`/api/rooms/${roomCode}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: savedPlayerId }),
        });
      } catch {}
    }
    router.push('/');
  };

const handleReturnToLobby = async () => {
    setShowLobbyAfterRound(true);
    setRoundState((prev) => prev ? { ...prev, status: 'finished' } : prev);

    // Immediate local lobby state; realtime will reconcile for everyone.
    setRoom((prev) => prev ? { ...prev, active_round_id: null } : prev);
    setRoundState(null);

    // Host clears server state for the room.
    if (isHost && room?.room_code && currentPlayer?.id) {
      fetch(`/api/rooms/${room.room_code}/end-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: currentPlayer.id }),
      }).catch(() => {});
    }
  };

  const handleDeleteRoom = async () => {
    if (!room?.room_code || !currentPlayer?.id) return;
    setDeleteError(null);
    setDeleteSuccess(null);
    setIsDeleting(true);
    const response = await fetch(`/api/rooms/${room.room_code}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id }),
    });
    const data = await response.json();
    setIsDeleting(false);
    if (!response.ok) {
      setDeleteError(data.error || 'Could not dissolve the room.');
      return;
    }
    setDeleteSuccess('Room dissolved.');
    router.push('/room/enter');
  };

  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!room?.room_code || !currentPlayer?.id || !isHost) return;
    if (targetPlayerId === currentPlayer.id) return;

    setKickError(null);
    setKickingPlayerId(targetPlayerId);

    try {
      const response = await fetch(`/api/rooms/${room.room_code}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: currentPlayer.id, targetPlayerId }),
      });

      const data = await response.json();
      if (!response.ok) {
        setKickError(data.error || 'Player could not be kicked.');
        setKickingPlayerId(null);
        return;
      }

      // Keep "Kicking..." until realtime lookup confirms player is actually gone from players list.
    } catch {
      setKickError('Player could not be kicked.');
      setKickingPlayerId(null);
    }
  };

  useEffect(() => {
    if (!kickingPlayerId) return;
    const stillInRoom = players.some((p) => p.id === kickingPlayerId);
    if (!stillInRoom) {
      setKickingPlayerId(null);
    }
  }, [players, kickingPlayerId]);

  const SCENARIOS = [
    'Prosecco Afterparty',
    'Late Night Drive',
    'Movie Soundtrack Potential',
    'Club at Midnight',
    'Breakup',
    'Most Popular',
    'Most Niche',
    'Road Trip to Spain',
    'Beach with Aperol',
    'Smoke session',
    'Funeral',
    'Custom...',
  ];

return (
    <section className="hero">

{/* Notification Badge - shown at top for 3-5 seconds */}
      {notification && (
        <div
          className={`notification-badge ${notification.type} ${notificationDismissing ? 'dismissing' : ''}`}
          onClick={() => {
            setNotificationDismissing(true);
            setTimeout(() => {
              setNotification(null);
              setNotificationDismissing(false);
            }, 500);
          }}
          role="alert"
          aria-live="assertive"
        >
          {notification.message}
        </div>
      )}

{/* HIER WIRD ES GEÄNDERT: Settings-Button (⚙️) für ALLE Spieler in Lobby und Runde */}
      {/* FIX: Refresh indicator removed from UI - happens silently in background only */}

      {/* Lobby Header: Gear-Icon für alle Spieler, Leave kommt in Settings Modal */}
      {!isPlayingRound ? (
        <div className="lobby-header">
          <button
            type="button"
            className="room-code-copy-btn"
            onClick={handleCopyCode}
            aria-label="Room Code kopieren"
            title="Code kopieren"
          >
            <span className="room-code-label">Code: <strong>{roomCode}</strong></span>
            <span className="copy-icon">{copied ? '✓' : '⎘'}</span>
          </button>
          <button
            type="button"
            className="settings-icon-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      ) : null}
      
      {(!isPlayingRound || showLobbyAfterRound) ? (
        <>
          <div className="card-row">
<div className="card">
              <h2>Players</h2>
              {players.length > 0 ? (
                <div className="players-list-container">
                  <div className="players-grid">
                  {players.map((player) => {
                    const isMe = player.id === currentPlayer?.id;
                    const isPlayerHost = player.id === room?.host_id;

return (
                      <div key={player.id} className={`player-card ${isMe ? 'is-me' : ''} ${isPlayerHost ? 'is-host' : ''}`}>
<span className="player-name">
                          {isPlayerHost && <span className="host-badge">👑</span>}
                          <span className="player-name-text">{player.name}</span>
                          {isMe && <span className="you-badge"> (you)</span>}
                        </span>
                        <div className="player-card-right">
                          {isHost && !isMe && !room?.active_round_id ? (
                            <button
                              type="button"
                              className="button btn-ghost"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleKickPlayer(player.id);
                              }}
                              disabled={kickingPlayerId === player.id}
                              style={{ marginTop: 0, pointerEvents: kickingPlayerId === player.id ? 'none' : 'auto' }}
                            >
                              {kickingPlayerId === player.id ? 'Kicking…' : 'Kick'}
                            </button>
                          ) : null}
                        </div>
</div>
                    );
                  })}
                  </div>
                </div>
              ) : (
                <p className="hint">Waiting for players...</p>
              )}
            </div>

{/* Spotify connection hint - REMOVED per task - icon in player card is now the connect button */}
          </div>

{/* Task 2: Suggestions now in modal - see below */}

          {currentPlayer ? (
            <div className="room-summary">
              {isHost && !room?.active_round_id ? (
                <div className="scenario-selection-area">
                  {scenario && (
                    <div className="current-scenario-display">
                      <span className="current-scenario-label">Current:</span>
                      <span className="current-scenario-value">{scenario}</span>
                    </div>
                  )}
                  <div className="scenario-buttons-row">
                    <button
                      type="button"
                      className="scenario-button"
                      onClick={() => setShowScenarioMenuModal(true)}
                    >
                      🎬 Scenario
                    </button>
                    <button
                      type="button"
                      className="scenario-button"
                      onClick={() => setShowMusicSelectionModal(true)}
                    >
                      🎵 Music Selection
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="warning">Please join via Create or Join. Your name will be saved.</p>
          )}

{!roundState && room?.active_round_id && !showLobbyAfterRound ? <p>Lade Rundendaten...</p> : null}
          {showLobbyAfterRound && roundState?.status === 'finished' ? <p className="success-message">Round finished — you are back in the lobby.</p> : null}

<div className="actions">
            {!room?.active_round_id ? (
              <>
                {isHost ? (
                  <button type="button" className="button" disabled={!canStartRound || isStarting} onClick={handleStartRound}>
                    {isStarting ? 'Starting …' : 'Start Round'}
                  </button>
                ) : (
                  <div className="waiting-host-row">
                    <div className="waiting-for-host-field">Waiting for Host</div>
                    {currentPlayer && (
<button
                        type="button"
                        className="suggestions-modal-btn"
                        onClick={() => setShowCommunitySuggestions(true)}
                        aria-label="View Suggestions"
                        title="View Suggestions"
                      >
                        🎵 Suggestions
                      </button>
                    )}
                  </div>
                )}

              </>
            ) : null}
</div>
        </>
      ) : null}

{roundState && !showLobbyAfterRound ? (
<section className="round-hero">
{/* FIX: Refresh indicator removed from UI - happens silently in background only */}

{/* Round header - INLINE: scenario | vote-status | settings */}
          <div className="scenario-vote-row">
            <span className="scenario-badge-inline">
              {roundState?.scenario}
            </span>
            {roundState?.status !== 'finished' && (
              <span className="vote-status-inline">
                <span className="vote-count">{roundState?.votes_cast}/{roundState?.votes_needed}</span> voted
              </span>
            )}
            {roundState?.status !== 'finished' && !effectivePaused && (
              <button
                type="button"
                className="settings-icon-btn"
                onClick={() => setShowSettings(true)}
                aria-label="Settings"
                title="Settings"
              >
                ⚙️
              </button>
            )}
          </div>

           {roundState.status === 'finished' ? (
            <div className="round-hero">
<h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.25rem' }}>Round finished</h2>
              
<div className="scoreboard-scroll-container">
                <div className="scoreboard-container">
                {playerScoreboard.length > 0 ? (
                  <>
                    {playerScoreboard.map((player, index) => {
                      const rank = index + 1;
// Show all rows immediately (no animation)
                      
                      // Dynamische Klasse für die Top 3 Verzierungen
                      const rankClass = rank <= 3 ? `rank-${rank}` : '';

                      return (
<div
                          key={player.user_id}
                          className={`scoreboard-row-card score-row-clickable ${rankClass}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedScoreboardPlayerId(player.user_id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedScoreboardPlayerId(player.user_id);
                            }
                          }}
                          title="Show player song details"
                        >
                          {/* Platzierung */}
                          <div className="score-rank">
                            {rank === 1 ? '👑' : rank}
                          </div>

                          {/* Song Cover */}
                          {player.bestSong?.cover_url && (
                            <img src={player.bestSong.cover_url} alt={player.bestSong.track_name} className="score-cover" />
                          )}

                          {/* Infos über Spieler & Song */}
                          <div className="score-info">
                            <span className="score-player-name">{player.user_name}</span>
                            <span className="score-track-details">
                              {player.bestSong ? `${player.bestSong.track_name} • ${player.bestSong.artist_names}` : 'No song data'}
                            </span>
                            <span className="score-vote-count">{player.songCount} songs counted</span>
                          </div>

{/* Punkteauswertung ganz rechts */}
                          <div className="score-points-box">
                            <span className="score-total-pts">{player.avgScore.toFixed(1)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
) : (
                  <div className="scoreboard-row-card">
                    <p className="hint" style={{ margin: 0 }}>No results available.</p>
                  </div>
                )}
                </div>
              </div>

              <div className="actions" style={{ width: '100%', maxWidth: '480px', marginTop: '1.5rem' }}>
{/* Back to Lobby - disabled during 5 second transition */}
              <button 
                type="button" 
                className={`button btn-primary btn-full ${isInTransition ? 'button-loading' : ''}`}
                disabled={isInTransition}
                onClick={handleReturnToLobby}
              >
                {isInTransition ? `Back to Lobby (${lobbyTransitionTime}s)` : 'Back to Lobby'}
              </button>
              {/* Leave Room - also disabled during transition */}
              <button 
                type="button" 
                className={`button btn-ghost btn-full ${isInTransition ? 'button-loading' : ''}`}
                disabled={isInTransition}
                onClick={handleLeaveRoom} 
                style={{ marginTop: '0.5rem' }}
              >
                {isInTransition ? `Leave Room (${lobbyTransitionTime}s)` : 'Leave Room'}
              </button>
              </div>
            </div>
          ) : (
            <>
<div className="track-card scenario-2">
<p className="player-display">
                  {/* Round X/Y with optional player name visibility */}
                  Round {(roundState.current_turn_index ?? 0) + 1}/{roundState.player_order.length}
                  {showPlayerName ? (
                    <>
                      : <strong>{currentPick?.user_name ?? 'Loading …'}</strong>
                    </>
                  ) : null}
                </p>

                {currentPick ? (
                  <div className="track-stack">
                    {currentPick.cover_url ? (
                      <img src={currentPick.cover_url} alt={currentPick.track_name} className="cover-img-large" />
                    ) : (
                      <div className="cover-placeholder">
                        <svg viewBox="0 0 24 24" width="64" height="64" fill="currentColor" style={{ opacity: 0.3 }}>
                          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.982-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.745 3.856-.88 7.15-.51 9.82.124.296.18.387.563.207.866zm1.224-2.724c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.243-.574 11.35 1.335.366.226.486.706.257 1.08zM17.91 11.416c-3.262-1.937-8.644-2.115-11.75-1.173-.5.15-.1.916-.15.414-.15-.5.103-.918.414-1.07 3.585-1.087 9.53-.884 13.29 1.347.45.267.6.848.333 1.3-.267.45-.848.6-1.3.332z"/>
                        </svg>
                      </div>
                    )}

<div className="track-text-stacked">
<h3 ref={titleRef}>{currentPick.track_name}</h3>
                      <p ref={artistRef} className="artist-name">{currentPick.artist_names}</p>
                    </div>
                  </div>
                ) : (
                  <p>Loading next song…</p>
                )}

{/* Play-Button wurde nach oben zum Host Controls Stack verschoben */}

</div>

{/* Host Controls Stack */}
              {isHost && currentPick && !effectivePaused && (
                <div className="host-controls-stack">
<button
                    type="button"
                    className={`button play-button ${playbackLoading ? 'button-loading' : ''}`}
                    disabled={playbackBusy}
                    onClick={handlePlayPause}
                  >
                    {/* Shows "⏸" when playing (click to pause), "▶" when paused (click to resume) */}
                    {playbackLoading ? '⏳' : playbackBusy ? '...' : (playbackActive ? '⏸' : '▶')}
                  </button>
                  
                  {/* Next Player Button - grau/transparent bis alle gevoted haben */}
                  <button 
                    type="button" 
                    className={`button next-button ${!canNext ? 'next-button-disabled' : ''}`}
                    disabled={!canNext || isTransitioning} 
                    onClick={handleNextPlayer}
                  >
                    {/* Timer Anzeige wenn alle gevoted haben und auto_advance aktiviert */}
                    {allVotesReady && autoAdvanceTime !== null ? (
                      <span className="next-button-with-timer">
                        {(roundState.current_turn_index ?? 0) + 1 >= roundState.player_order.length
                          ? 'Reveal Results'
                          : 'Next Player'}
                        <span className="auto-advance-timer">{autoAdvanceTime}s</span>
                      </span>
                    ) : (
                      (roundState.current_turn_index ?? 0) + 1 >= roundState.player_order.length
                        ? 'Reveal Results'
                        : 'Next Player'
                    )}
                  </button>
                </div>
              )}

{/* Die Bewertungs-Box mit Slider 1-10 */}
<div className="card rating-box-card compact">
<div className="slider-rating-wrapper">
                  <span className="slider-label-left">1</span>
                  <div className={`rating-slider-container ${!hasTouchedVoteSlider ? 'is-pristine' : ''}`}>
<input
                      ref={sliderRef}
                      type="range"
                      min="1"
                      max="10"
                      value={voteScore ?? 5}
                      onChange={(e) => {
                        if (!hasTouchedVoteSlider) {
                          setHasTouchedVoteSlider(true);
                        }
                        setVoteScore(Number(e.target.value));
                      }}
className="rating-slider"
                      disabled={hasVoted}
                    />
                  </div>
                  <span className="slider-label-right">10</span>
                  {/* Vote button removed - errors now show in notification only */}
                  <button
                    type="button"
                    className={`submit-vote-button ${hasVoted ? 'voted' : ''}`}
                    disabled={!canVote || voteScore === null || hasVoted}
                    onClick={handleVoteSubmit}
                    aria-label="Stimme abgeben"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>

</div>

{/* Player info now merged into player-display above */}
            </>
          )}
</section>
      ) : null}

      {selectedScoreboardPlayer && roundState?.status === 'finished' ? (
        <div className="modal-overlay" onClick={() => setSelectedScoreboardPlayerId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{selectedScoreboardPlayer.user_name}</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Average {selectedScoreboardPlayer.avgScore.toFixed(1)} • {selectedScoreboardPlayer.songCount} songs
            </p>
            <div className="player-song-detail-list">
              {selectedScoreboardPlayer.songs.map((song, index) => (
                <div key={`${song.id}-${index}`} className="player-song-detail-item">
                  {song.cover_url ? <img src={song.cover_url} alt={song.track_name} className="player-song-detail-cover" /> : null}
                  <div className="player-song-detail-info">
                    <span className="player-song-detail-title">{song.track_name}</span>
                    <span className="player-song-detail-artist">{song.artist_names}</span>
                  </div>
                  <div className="player-song-detail-score">{song.avgScore.toFixed(1)}</div>
                </div>
              ))}
            </div>
            <button type="button" className="button btn-ghost" onClick={() => setSelectedScoreboardPlayerId(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
{/* Settings Modal - nur in Lobby oder aktiver Runde, NICHT im Scoreboard */}
    {showSettings && (!isPlayingRound || roundState?.status === 'playing') && !effectivePaused && (
      <div className="modal-overlay" onClick={() => setShowSettings(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>Game Settings</h2>
<div className="settings-section">
            <p className="room-code-display">Room Code: <strong>{roomCode}</strong></p>
          </div>

{/* Game Control - nur Host kann pausieren/fortsetzen */}
          {roundState && roundState.status === 'playing' && isHost && (
            <div className="settings-section">
              <p className="setting-label">Game Control</p>
              <button
                type="button"
                className={`button ${isPaused ? 'btn-primary' : 'btn-ghost'}`}
                disabled={isPausing}
                onClick={() => handlePauseGame(isPaused ? 'resume' : 'pause')}
              >
                {isPausing ? '...' : isPaused ? '▶ Resume Game' : '⏸ Pause Game'}
              </button>
            </div>
          )}
          {/* Music selection moved to lobby */}
          {isHost && (
            <div className="settings-section">
              <p className="setting-label">Auto-Advance</p>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={roomSettings.auto_advance}
                  onChange={(e) => handleUpdateSettings({ ...roomSettings, auto_advance: e.target.checked })}
                />
                <span>Auto-advance to next player</span>
              </label>
              {roomSettings.auto_advance && (
                <div className="setting-sub">
                  <label style={{ display: 'block', marginBottom: '0.5rem' }}>Delay: {roomSettings.auto_advance_delay}s</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.25rem' }}>
                    {[0, 5, 10, 30].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => handleUpdateSettings({ ...roomSettings, auto_advance_delay: sec })}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: roomSettings.auto_advance_delay === sec ? '#ff6b4a' : '#333',
                          color: roomSettings.auto_advance_delay === sec ? 'white' : '#aaa',
                          border: '1px solid #555',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Anonymous Voting - nur Host kann ändern */}
          {isHost && (
            <div className="settings-section">
              <p className="setting-label">Anonymous Voting</p>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={roomSettings.anonymous_voting}
                  onChange={(e) => handleUpdateSettings({ ...roomSettings, anonymous_voting: e.target.checked })}
                />
                <span>Hide player names during the whole round</span>
              </label>
            </div>
          )}

{/* Leave Room - für ALLE Spieler zugänglich in Settings */}
          <div className="settings-section">
            <button 
              type="button" 
              className="button btn-ghost" 
              onClick={() => {
                setShowSettings(false);
                handleLeaveRoom();
              }}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Leave Room
            </button>
          </div>
<button type="button" className="button btn-ghost" onClick={() => setShowSettings(false)}>
            Close
          </button>
        </div>
      </div>
    )}

{/* Modal 1: Preset Scenarios - Host can select from saved scenarios */}
    {showPresetScenarios && !room?.active_round_id && isHost && (
      <div className="modal-overlay" onClick={() => setShowPresetScenarios(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>📋 Saved</h2>
          <div className="preset-scenarios-list">
            {SCENARIOS.filter((s) => s !== 'Custom...').map((s) => (
              <div
                key={s}
                className={`preset-scenario-item ${scenario === s ? 'selected' : ''}`}
                onClick={() => {
                  setScenario(s);
                  setShowPresetScenarios(false);
                }}
              >
                <span className="preset-scenario-text">{s}</span>
              </div>
            ))}
          </div>
          <button type="button" className="button btn-ghost" onClick={() => setShowPresetScenarios(false)}>
            Close
          </button>
        </div>
      </div>
    )}

    {showMusicSelectionModal && isHost && !room?.active_round_id && (
      <div className="modal-overlay" onClick={closeMusicSelectionModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>Music Selection</h2>
          <div className="music-selection-panel">
            <label className="setting-label" htmlFor="songs-per-player-wheel">Songs per player: {songsPerPlayerDraft}</label>
            <div className="music-wheel-wrapper">
              <input
                id="songs-per-player-wheel"
                className="music-wheel-slider"
                type="range"
                min="1"
                max="10"
                step="1"
                value={songsPerPlayerDraft}
                onChange={(event) => {
                  const amount = Math.min(10, Math.max(1, Number(event.target.value) || 1));
                  setSongsPerPlayerDraft(amount);
                }}
                onPointerDown={() => setIsDraggingSongsWheel(true)}
                onPointerUp={() => {
                  setIsDraggingSongsWheel(false);
                  commitSongsPerPlayer();
                }}
                onPointerCancel={() => setIsDraggingSongsWheel(false)}
                onKeyUp={commitSongsPerPlayer}
              />
              <div className="music-wheel-scale">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>
            <label className="setting-label" htmlFor="library-amount-modal">Library size</label>
            <select
              id="library-amount-modal"
              className="music-select-field"
              value={roomSettings.library_amount}
              onChange={(event) => handleUpdateSettings({ ...roomSettings, library_amount: Number(event.target.value) as RoomSettings['library_amount'] })}
            >
              {[50, 100, 250, 500].map((amount) => <option key={amount} value={amount}>Top {amount}</option>)}
            </select>
            <label className="setting-label" htmlFor="library-period-modal">Time period</label>
            <select
              id="library-period-modal"
              className="music-select-field"
              value={roomSettings.library_period}
              onChange={(event) => handleUpdateSettings({ ...roomSettings, library_period: event.target.value as RoomSettings['library_period'] })}
            >
              <option value="short_term">Last 4 weeks</option>
              <option value="medium_term">Last 6 months</option>
              <option value="long_term">All time</option>
            </select>
          </div>
          <button type="button" className="button btn-ghost" onClick={closeMusicSelectionModal}>
            Close
          </button>
        </div>
      </div>
    )}

    {showScenarioMenuModal && isHost && !room?.active_round_id && (
      <div className="modal-overlay" onClick={() => setShowScenarioMenuModal(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>Scenario</h2>
          <div className="scenario-menu-modal-grid">
            <button
              type="button"
              className="scenario-button scenario-menu-option"
              onClick={() => {
                setShowScenarioMenuModal(false);
                setShowPresetScenarios(true);
              }}
            >
              📋 Saved
            </button>
            <button
              type="button"
              className="scenario-button scenario-menu-option"
              onClick={() => {
                setShowScenarioMenuModal(false);
                setShowCustomScenarioInput(true);
              }}
            >
              ✏️ Custom
            </button>
            <button
              type="button"
              className="scenario-button scenario-menu-option"
              onClick={() => {
                setShowScenarioMenuModal(false);
                setShowCommunitySuggestions(true);
              }}
            >
              🎵 Suggestions
            </button>
          </div>
          <button type="button" className="button btn-ghost" onClick={() => setShowScenarioMenuModal(false)}>
            Close
          </button>
        </div>
      </div>
    )}

    {/* Modal 2: Custom Scenario Input - Host enters custom scenario */}
    {showCustomScenarioInput && !room?.active_round_id && isHost && (
      <div className="modal-overlay" onClick={() => setShowCustomScenarioInput(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>✏️ Custom </h2>
          <div className="custom-scenario-input-section">
<input
              type="text"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Enter your scenario..."
              className="custom-scenario-input"
              autoFocus
            />
          </div>
          <div className="actions" style={{ marginTop: '1rem' }}>
            <button 
              type="button" 
              className="button btn-primary" 
              disabled={!scenario.trim()}
              onClick={() => setShowCustomScenarioInput(false)}
            >
              Save
            </button>
            <button type="button" className="button btn-ghost" onClick={() => setShowCustomScenarioInput(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal 3: Community Suggestions - all players can add, host can select */}
    {showCommunitySuggestions && !room?.active_round_id && (
      <div className="modal-overlay" onClick={() => setShowCommunitySuggestions(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>🎵 Suggestions</h2>
          <div className="suggestions-modal-list">
            {/* Input for ALL players to add suggestions */}
            {currentPlayer && (
              <div className="suggestion-input-row">
                <input
                  type="text"
                  value={customScenarioInput}
                  onChange={(e) => setCustomScenarioInput(e.target.value)}
                  placeholder="Add new suggestion..."
                  className="suggestion-input"
                />
                <button
                  type="button"
                  className="button btn-small"
                  disabled={!customScenarioInput.trim() || customScenarioSent}
                  onClick={handleSubmitCustomScenario}
                >
                  {customScenarioSent ? '✓' : 'Add'}
                </button>
              </div>
            )}
            
            {/* List of suggestions - clickable for Host */}
            {customScenarios.map((s) => (
              <div 
                key={s.id} 
                className="suggestion-item"
                onClick={() => {
                  if (isHost && !room?.active_round_id) {
                    setScenario(s.suggestion);
                    setShowCommunitySuggestions(false);
                  }
                }}
                style={{ cursor: isHost && !room?.active_round_id ? 'pointer' : 'default' }}
              >
                <span className="suggestion-text">{s.suggestion}</span>
                <span className="suggestion-author">by {s.player_name}</span>
              </div>
            ))}
            
            {customScenarios.length === 0 && (
              <p className="hint" style={{ textAlign: 'center' }}>No suggestions yet. Be the first to add one!</p>
            )}
          </div>
          <button type="button" className="button btn-ghost" onClick={() => setShowCommunitySuggestions(false)}>
            Close
          </button>
        </div>
      </div>
    )}

{/* Paused overlay for ALL players - blurred screen + foreground message */}
    {effectivePaused && roundState && roundState.status === 'playing' && (
      <>
        {/* Blurred background layer */}
        <div className="paused-blur-overlay" />
        {/* Foreground message for ALL players */}
        <div className="paused-foreground-message">
          <h2>⏸ Game Paused</h2>
          {isHost ? (
            <>
              <p>Game is paused.</p>
              <div className="host-controls-stack" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="button btn-ghost"
                  onClick={handleLeaveRoom}
                >
                  Leave Room
                </button>
                <button
                  type="button"
                  className="button btn-primary"
                  disabled={isPausing}
                  onClick={() => handlePauseGame('resume')}
                >
                  {isPausing ? '...' : '▶ Resume Game'}
                </button>
              </div>
            </>
          ) : (
            <p>Waiting for host to resume...</p>
          )}
        </div>
      </>
    )}
    </section>
  );
}
