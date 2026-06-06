'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase-client';

interface RoomClientProps {
  roomCode: string;
  playerId?: string;
}

interface Player {
  id: string;
  name: string;
  spotify_connected?: boolean;
  last_seen?: string | null;
}

interface RoundPick {
  id: string;
  user_id: string;
  user_name: string;
  track_name: string;
  artist_names: string;
  album_name: string;
  cover_url: string;
  uri: string;
  played: boolean;
  score_total: number;
  vote_count: number;
}

interface ScoreboardRow {
  id: string;
  user_id: string;
  user_name: string;
  track_name: string;
  artist_names: string;
  cover_url: string;
  score_total: number;
  vote_count: number;
  uri?: string;
}

interface RoomSettings {
  auto_advance: boolean;
  auto_advance_delay: number;
  anonymous_voting: boolean;
}

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
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null);
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
  // Room settings
const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    auto_advance: true,
    auto_advance_delay: 10,
    anonymous_voting: true,
  });
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
// Player has last_seen
const [playerLastSeen, setPlayerLastSeen] = useState<Record<string, string>>({});
// Best song playback
  const [bestSongUri, setBestSongUri] = useState<string | null>(null);
  const [autoPlayedBest, setAutoPlayedBest] = useState(false);
// Auto-start lobby transition timer when scoreboard is shown
  useEffect(() => {
    if (roundState?.status === 'finished' && !isInTransition) {
      // Immediately start 5-second countdown when scoreboard is displayed
      setIsInTransition(true);
      setLobbyTransitionTime(5);
      
      const timer = setInterval(() => {
        setLobbyTransitionTime((prev) => {
          const next = (prev ?? 1) - 1;
          if (next <= 0) {
            clearInterval(timer);
            setIsInTransition(false);
            return null;
          }
          return next;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [roundState?.status]);
  // Unterdrückt das Lookup-Round-Sync kurzzeitig — verhindert Race zwischen
  // lokaler Round-Neuanlage (Start Game) und stale Server-active_round_id.
  const [suppressRoundSync, setSuppressRoundSync] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

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
          setRoomSettings({
            auto_advance: data.room.settings.auto_advance ?? true,
            auto_advance_delay: data.room.settings.auto_advance_delay ?? 10,
            anonymous_voting: data.room.settings.anonymous_voting ?? true,
          });
        }
      })
      .catch(() => setRoom(null));
}, [roomCode, savedPlayerId]);

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
                        if (data.round) setShowLobbyAfterRound(false);
                      }
                    })
                    .catch(() => {});
                }
              }
            }

            // host_id hat sich geändert → Spieler neu laden
            try {
              const res = await fetch(`/api/rooms/lookup?roomCode=${roomCode}${savedPlayerId ? `&playerId=${savedPlayerId}` : ''}`);
              const data: LookupResponse = await res.json();
              if (mounted) {
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
      setVoteSuccess(null);
      setVoteError(null);
    }
  }, [roundState?.current_pick?.id]);

  // Immediate round sync when active_round_id transitions from null -> new round id
  const fetchRound = async (roundId: string) => {
    if (!savedPlayerId) return;
    try {
      const response = await fetch(`/api/rounds/${roundId}?playerId=${savedPlayerId}`);
      const data = await response.json();
      if (response.ok) {
        setRoundState(data.round ?? null);
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
      const response = await fetch(`/api/rooms/${room.room_code}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: currentPlayer.id, settings: newSettings }),
      });
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
  const isHost = currentPlayer?.id && room?.host_id ? currentPlayer.id === room.host_id : false;
  const canStartRound = isHost && allSpotifyConnected && !!scenario.trim() && !room?.active_round_id;
  const isPlayingRound = !!room?.active_round_id && !showLobbyAfterRound;
  const currentPick = roundState?.current_pick;
  const canVote = !!currentPlayer && roundState?.status === 'playing' && !!currentPick;
  const hasVoted = roundState?.user_vote != null;
const allVotesReady = roundState ? roundState.votes_cast >= roundState.votes_needed : false;
// Track previous turn index to detect when we advance to next player
const [prevTurnIndex, setPrevTurnIndex] = useState<number | null>(null);
// Show player name only AFTER advancing to next turn (not when votes are locally ready)
// This ensures ALL players see the name at the same time
const showPlayerName = !roomSettings.anonymous_voting || (prevTurnIndex !== null && prevTurnIndex !== roundState?.current_turn_index);
  
  // Update prevTurnIndex when the current turn index changes
  useEffect(() => {
    if (roundState?.current_turn_index !== undefined && roundState.current_turn_index !== prevTurnIndex) {
      setPrevTurnIndex(roundState.current_turn_index);
    }
  }, [roundState?.current_turn_index, prevTurnIndex]);
  
  // Auto-advance timer: start countdown when all votes are ready and setting is enabled
  useEffect(() => {
    if (!allVotesReady || !roomSettings.auto_advance || !isHost || roundState?.status !== 'playing') {
      setAutoAdvanceTime(null);
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
  }, [allVotesReady, roomSettings.auto_advance, roomSettings.auto_advance_delay, isHost, roundState?.status]);

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
        body: JSON.stringify({ roomId: room.id, playerId: currentPlayer.id, scenario: scenario.trim() }),
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
    if (!room?.active_round_id || !currentPlayer?.id || isTransitioning) return;
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
      setRoundState((prev) => (prev ? { ...prev, status: 'finished' } : prev));
      setIsTransitioning(false);
      return;
    }

    if (data.pick) {
      setRoundState((prev) =>
        prev
          ? {
              ...prev,
              current_turn_index: prev.current_turn_index + 1,
              current_pick: {
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
              },
              user_vote: null,
              votes_cast: 0,
            }
          : prev
      );
      setVoteScore(null);
      setVoteSuccess(null);
      setVoteError(null);
      setIsTransitioning(false);
    }
  };

  const handlePlayPause = async () => {
    if (!playerCanControl || !currentPlayer?.id || !currentPick) return;
    setPlaybackBusy(true);
    setPlaybackError(null);

    try {
      const response = await fetch(isPlaying ? '/api/spotify/pause' : '/api/spotify/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPlaying ? { playerId: currentPlayer.id } : { playerId: currentPlayer.id, uri: currentPick.uri }),
      });

      const data = await response.json();
      if (!response.ok) {
        setPlaybackError(data.error || 'Error controlling playback.');
        return;
      }

      setIsPlaying(!isPlaying);
    } catch (error: any) {
      setPlaybackError(error?.message ?? 'Error controlling playback.');
    } finally {
      setPlaybackBusy(false);
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
    // Go directly to lobby - immediately redirect when button is clicked
    // No need to check isInTransition - user can click anytime to return immediately
    setShowLobbyAfterRound(true);
    setRoundState((prev) => prev ? { ...prev, status: 'finished' } : prev);
    setRoom((prev) => prev ? { ...prev, active_round_id: null } : null);
    
    // If host, also clear active_round_id on server (without broadcasting)
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

{/* HIER WIRD ES GEÄNDERT: Settings-Button (⚙️) für ALLE Spieler in Lobby und Runde */}
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
                <div className="players-grid">
                  {players.map((player) => {
                    const isMe = player.id === currentPlayer?.id;
                    const hasSpotify = player.spotify_connected;
                    const isPlayerHost = player.id === room?.host_id;

return (
                      <div key={player.id} className={`player-card ${isMe ? 'is-me' : ''} ${isPlayerHost ? 'is-host' : ''}`}>
                        <span className="player-name">
                          {isPlayerHost && <span className="host-badge">👑</span>}
                          {player.name}
                          {isMe && <span style={{ opacity: 0.6, fontSize: '0.8rem' }}> (du)</span>}
                        </span>
                        {/* Task 1: Clickable Spotify button - only clickable by the player themselves */}
                        {isMe ? (
                          <button
                            type="button"
                            className={`spotify-status-icon ${hasSpotify ? 'connected' : 'disconnected'}`}
                            onClick={handleConnectSpotify}
                            aria-label={hasSpotify ? 'Spotify connected' : 'Connect Spotify'}
                            title={hasSpotify ? 'Spotify connected' : 'Click to connect Spotify'}
                          >
                            {hasSpotify ? (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.982-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.745 3.856-.88 7.15-.51 9.82.124.296.18.387.563.207.866zm1.224-2.724c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.243-.574 11.35 1.335.366.226.486.706.257 1.08zM17.91 11.416c-3.262-1.937-8.644-2.115-11.75-1.173-.5.15-.1.916-.15.414-.15-.5.103-.918.414-1.07 3.585-1.087 9.53-.884 13.29 1.347.45.267.6.848.333 1.3-.267.45-.848.6-1.3.332z"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18V5l12-2v13"></path>
                                <circle cx="6" cy="18" r="3"></circle>
                                <circle cx="18" cy="16" r="3"></circle>
                                <line x1="3" y1="3" x2="21" y2="21"></line>
                              </svg>
                            )}
                          </button>
                        ) : (
                          <div className={`spotify-status-icon ${hasSpotify ? 'connected' : 'disconnected'}`}>
                            {hasSpotify ? (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.565.387-.86.207-2.377-1.454-5.37-1.783-8.893-.982-.336.075-.668-.135-.744-.47-.077-.337.135-.668.47-.745 3.856-.88 7.15-.51 9.82.124.296.18.387.563.207.866zm1.224-2.724c-.226.367-.707.487-1.074.26-2.72-1.672-6.87-2.157-10.08-1.182-.413.125-.847-.107-.972-.52-.125-.413.108-.847.52-.972 3.67-1.114 8.243-.574 11.35 1.335.366.226.486.706.257 1.08zM17.91 11.416c-3.262-1.937-8.644-2.115-11.75-1.173-.5.15-.1.916-.15.414-.15-.5.103-.918.414-1.07 3.585-1.087 9.53-.884 13.29 1.347.45.267.6.848.333 1.3-.267.45-.848.6-1.3.332z"/>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 18V5l12-2v13"></path>
                                <circle cx="6" cy="18" r="3"></circle>
                                <circle cx="18" cy="16" r="3"></circle>
                                <line x1="3" y1="3" x2="21" y2="21"></line>
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      onClick={() => setShowPresetScenarios(true)}
                    >
                      📋 Saved Scenarios
                    </button>
                    <button
                      type="button"
                      className="scenario-button"
                      onClick={() => setShowCustomScenarioInput(true)}
                    >
                      ✏️ Custom Scenario
                    </button>
                    <button
                      type="button"
                      className="scenario-button"
                      onClick={() => setShowCommunitySuggestions(true)}
                    >
                      🎵 Suggestions ({customScenarios.length})
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
          {roundError ? <p className="error-message">{roundError}</p> : null}

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
                        🎵 Suggestions ({customScenarios.length})
                      </button>
                    )}
                  </div>
                )}
                {startError ? <p className="error-message">{startError}</p> : null}
                {currentPlayer && isHost && !allSpotifyConnected ? <p className="hint">All players must connect Spotify before starting.</p> : null}
              </>
            ) : null}
</div>
        </>
      ) : null}

{roundState && !showLobbyAfterRound ? (
<section className="round-hero">
          {/* Round header - INLINE scenario badge + vote status */}
<div className="player-scenario-row">
            <span className="scenario-badge">{roundState?.scenario}</span>
            {/* Show vote count only during active gameplay, not on scoreboard */}
            {roundState?.status !== 'finished' && (
              <span className="vote-status-inline">
                <span className="vote-count">{roundState?.votes_cast}/{roundState?.votes_needed}</span> voted
              </span>
            )}
            {/* Show settings for ALL players when NOT in scoreboard (finished status) */}
            {roundState?.status !== 'finished' && (
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
              <p className="hint" style={{ marginBottom: '1rem' }}>Results:</p>
              
<div className="scoreboard-container">
                {roundState.scoreboard.length > 0 ? (
                  roundState.scoreboard
                    .sort((a, b) => b.score_total - a.score_total)
                    .map((row, index) => {
                      const rank = index + 1;
// Show all rows immediately (no animation)
                      
                      // Dynamische Klasse für die Top 3 Verzierungen
                      const rankClass = rank <= 3 ? `rank-${rank}` : '';

                      return (
<div key={row.id} className={`scoreboard-row-card ${rankClass}`}>
                          {/* Platzierung */}
                          <div className="score-rank">
                            {rank === 1 ? '👑' : rank}
                          </div>

                          {/* Song Cover */}
                          {row.cover_url && (
                            <img src={row.cover_url} alt={row.track_name} className="score-cover" />
                          )}

                          {/* Infos über Spieler & Song */}
                          <div className="score-info">
                            <span className="score-player-name">{row.user_name}</span>
                            <span className="score-track-details">
                              {row.track_name} • {row.artist_names}
                            </span>
                          </div>

                          {/* Punkteauswertung ganz rechts */}
                          <div className="score-points-box">
<span className="score-total-pts">{row.vote_count > 0 ? (row.score_total / row.vote_count).toFixed(1) : '0.0'}</span>
                            <span className="score-vote-count">{row.vote_count} Votes</span>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="scoreboard-row-card">
                    <p className="hint" style={{ margin: 0 }}>No results available.</p>
                  </div>
                )}
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
                  {/* Merged: Player X/Y: 'name' - Anonymous Voting hides name until ALL votes are cast */}
Player {(roundState.current_turn_index ?? 0) + 1}/{roundState.player_order.length}: <strong>
                    {showPlayerName 
                      ? currentPick?.user_name ?? 'Loading …' 
                      : `Player ${(roundState.current_turn_index ?? 0) + 1}`}
                  </strong>
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
                      <h3>{currentPick.track_name}</h3>
                      <p className="artist-name">{currentPick.artist_names}</p>
                    </div>
                  </div>
                ) : (
                  <p>Loading next song…</p>
                )}

{/* Play-Button wurde nach oben zum Host Controls Stack verschoben */}

                {playbackError && <p className="error-message">{playbackError}</p>}
              </div>

              {/* Host Controls Stack: Play/Pause + Next Player Button - MOVED ABOVE voting block */}
              {isHost && currentPick && (
                <div className="host-controls-stack">
                  <button
                    type="button"
                    className="button play-button"
                    disabled={playbackBusy}
                    onClick={handlePlayPause}
                  >
                    {playbackBusy ? '...' : isPlaying ? '⏸ Pause' : '▶ Play'}
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
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={voteScore ?? 5}
                    onChange={(e) => setVoteScore(Number(e.target.value))}
                    className="rating-slider"
                    disabled={hasVoted}
                  />
                  <span className="slider-label-right">10</span>
                  {/* Vote button moved to right of slider */}
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
{/* Settings Modal - nur in Lobby oder aktiver Runde, NICHT im Scoreboard */}
    {showSettings && (!isPlayingRound || roundState?.status === 'playing') && (
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
          {/* Auto-Advance - nur Host kann ändern */}
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
                  <label>Delay (seconds):</label>
                  <input
                    type="number"
                    min="5"
                    max="30"
                    value={roomSettings.auto_advance_delay}
                    onChange={(e) => handleUpdateSettings({ ...roomSettings, auto_advance_delay: parseInt(e.target.value) || 10 })}
                  />
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
                <span>Hide player names until everyone votes</span>
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
          <h2>📋 Saved Scenarios</h2>
          <div className="preset-scenarios-list">
            {SCENARIOS.filter(s => s !== 'Custom...').map((s) => (
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

    {/* Modal 2: Custom Scenario Input - Host enters custom scenario */}
    {showCustomScenarioInput && !room?.active_round_id && isHost && (
      <div className="modal-overlay" onClick={() => setShowCustomScenarioInput(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>✏️ Custom Scenario</h2>
          <div className="custom-scenario-input-section">
            <input
              type="text"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="Enter your scenario..."
              className="custom-scenario-input"
              autoFocus
            />
            {scenario && (
              <p className="hint" style={{ marginTop: '0.5rem' }}>Current: <strong>{scenario}</strong></p>
            )}
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
    {isPaused && roundState && roundState.status === 'playing' && (
      <>
        {/* Blurred background layer */}
        <div className="paused-blur-overlay" />
        {/* Foreground message for ALL players */}
        <div className="paused-foreground-message">
          <h2>⏸ Game Paused</h2>
          {isHost ? (
            <p>Click Settings (⚙️) to resume</p>
          ) : (
            <p>Waiting for host to resume...</p>
          )}
          {/* Allow leave room during pause */}
          <button 
            type="button" 
            className="button btn-ghost" 
            onClick={handleLeaveRoom}
            style={{ marginTop: '1rem' }}
          >
            Leave Room
          </button>
        </div>
      </>
    )}
    </section>
  );
}
