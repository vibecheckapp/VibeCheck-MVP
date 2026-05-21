'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RoomClientProps {
  roomCode: string;
  playerId?: string;
}

interface Player {
  id: string;
  name: string;
  spotify_connected?: boolean;
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
}

interface LookupResponse {
  room: { id: string; room_code: string; host_id?: string | null; active_round_id?: string | null };
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

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
        setRoom(data.room ?? null);
        setPlayers(data.players ?? []);
        setCurrentPlayer(data.currentPlayer ?? null);
      })
      .catch(() => setRoom(null));
  }, [roomCode, savedPlayerId]);

  useEffect(() => {
    if (!room?.active_round_id || !savedPlayerId) {
      setRoundState(null);
      return;
    }

    let mounted = true;
    const fetchRound = async () => {
      try {
        const response = await fetch(`/api/rounds/${room.active_round_id}?playerId=${savedPlayerId}`);
        const data = await response.json();
        if (mounted && response.ok) {
          setRoundState(data.round ?? null);
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
    const interval = window.setInterval(fetchRound, 5000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [room?.active_round_id, savedPlayerId]);

  const handleConnectSpotify = () => {
    if (!savedPlayerId) return;
    window.location.href = `/api/spotify/auth?playerId=${savedPlayerId}`;
  };

  const allSpotifyConnected = players.length > 0 && players.every((player) => player.spotify_connected);
  const isHost = currentPlayer?.id && room?.host_id ? currentPlayer.id === room.host_id : false;
  const canStartRound = isHost && allSpotifyConnected && !!scenario.trim() && !room?.active_round_id;
  const isPlayingRound = !!room?.active_round_id && !showLobbyAfterRound;
  const currentPick = roundState?.current_pick;
  const canVote = !!currentPlayer && roundState?.status === 'playing' && !!currentPick;
  const hasVoted = roundState?.user_vote != null;
  const allVotesReady = roundState ? roundState.votes_cast >= roundState.votes_needed : false;
  const canNext = isHost && roundState?.status === 'playing' && allVotesReady;
  const playerCanControl = currentPlayer?.id === currentPick?.user_id || isHost;
  const spotifyDeviceHint = playbackError?.includes('Kein aktives Spotify-Gerät gefunden')
    ? 'Start Spotify auf deinem Gerät und wähle es im Geräte-Menü aus (Desktop, Web Player oder Mobilgerät).'
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
        setStartError(data.error || 'Konnte die Runde nicht starten.');
        return;
      }

      if (data.round?.id) {
        setRoom((prev) => (prev ? { ...prev, active_round_id: data.round.id } : prev));
      }
    } catch (error) {
      setIsStarting(false);
      setStartError('Fehler beim Starten der Runde. Bitte prüfe deine Spotify-Verbindung.');
    }
  };

  const handleVoteSubmit = async () => {
    if (!room?.active_round_id || !currentPick || !currentPlayer || voteScore === null) {
      setVoteError('Wähle zuerst eine Bewertung aus.');
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
      setVoteError(data.error || 'Vote konnte nicht gespeichert werden.');
      return;
    }

    setVoteSuccess('Stimme gespeichert!');
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
    if (!room?.active_round_id || !currentPlayer?.id) return;
    setNextError(null);

    const response = await fetch(`/api/rounds/${room.active_round_id}/next-track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: currentPlayer.id }),
    });

    const data = await response.json();
    if (!response.ok) {
      setNextError(data.error || 'Konnte nicht zum nächsten Spieler wechseln.');
      return;
    }

    if (data.status === 'finished') {
      setRoundState((prev) => (prev ? { ...prev, status: 'finished' } : prev));
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
        setPlaybackError(data.error || 'Fehler beim Steuern der Wiedergabe.');
        return;
      }

      setIsPlaying(!isPlaying);
    } catch (error: any) {
      setPlaybackError(error?.message ?? 'Fehler beim Steuern der Wiedergabe.');
    } finally {
      setPlaybackBusy(false);
    }
  };

  const handleLeaveRoom = () => {
    router.push('/room/enter');
  };

  const handleReturnToLobby = () => {
    setShowLobbyAfterRound(true);
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
      setDeleteError(data.error || 'Konnte den Raum nicht auflösen.');
      return;
    }
    setDeleteSuccess('Raum aufgelöst.');
    router.push('/room/enter');
  };

  const scoreButtons = [1, 2, 3, 4, 5];

  return (
    <section className="hero">
      <h1 className={roundState?.scenario ? 'round-title' : ''}>
        {roundState?.scenario && isPlayingRound ? roundState.scenario : `Game Lobby: ${roomCode}`}
      </h1>
      {(!isPlayingRound || showLobbyAfterRound) ? (
        <>
          <div className="card-row">
            <div className="card">
              <h2>Players</h2>
          <ul>
            {players.length > 0 ? (
              players.map((player) => (
                <li key={player.id}>
                  {player.name} {player.id === currentPlayer?.id ? '(du)' : null}
                  {player.spotify_connected ? ' · Spotify verbunden' : ' · Spotify nicht verbunden'}
                </li>
              ))
            ) : (
              <li>Warte auf Spieler...</li>
            )}
          </ul>
        </div>
        <div className="card">
          <h2>Spotify</h2>
          <button type="button" className="button" onClick={handleConnectSpotify} disabled={!savedPlayerId || currentPlayer?.spotify_connected}>
            {currentPlayer?.spotify_connected ? 'Spotify verbunden' : 'Connect Spotify'}
          </button>
          {!savedPlayerId ? <p>Zum Spotify-Connect musst du zuerst mit einem Namen beitreten.</p> : null}
        </div>
      </div>

      {currentPlayer ? (
        <div className="room-summary">
          <p>Du bist angemeldet als <strong>{currentPlayer.name}</strong>.</p>
          {isHost && !room?.active_round_id ? (
            <div className="card">
              <label>
                Titel der Runde:
                <input
                  type="text"
                  className="input"
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  placeholder="z. B. Gute Laune Party"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="warning">Bitte trete über Create oder Join bei. Dein Name wird dann gespeichert.</p>
      )}

      {!roundState && room?.active_round_id && !showLobbyAfterRound ? <p>Lade Rundendaten...</p> : null}
      {showLobbyAfterRound && roundState?.status === 'finished' ? <p className="success-message">Round finished — you are back in the lobby.</p> : null}
      {roundError ? <p className="error-message">{roundError}</p> : null}

      <div className="actions">
        {!room?.active_round_id ? (
          <>
            <button type="button" className="button" disabled={!canStartRound || isStarting} onClick={handleStartRound}>
              {isStarting ? 'Starting …' : 'Start Round'}
            </button>
            {startError ? <p className="error-message">{startError}</p> : null}
            {currentPlayer && !isHost ? <p className="hint">Nur der Host kann die Runde starten.</p> : null}
            {currentPlayer && isHost && !allSpotifyConnected ? <p className="hint">Alle Spieler müssen Spotify verbinden, bevor gestartet werden kann.</p> : null}
          </>
        ) : null}
      </div>
      </>
      ) : null}

      {roundState && !showLobbyAfterRound ? (
        <section className="card">
          <h2>{roundState.scenario}</h2>
          {roundState.status === 'finished' ? (
            <>
              <p>Die Runde ist beendet. Hier ist das Scoreboard:</p>
              <ul>
                {roundState.scoreboard.length > 0 ? (
                  roundState.scoreboard
                    .sort((a, b) => b.score_total - a.score_total)
                    .map((row) => (
                      <li key={row.id}>
                        <strong>{row.user_name}</strong>: {row.track_name} ({row.artist_names}) — {row.score_total} Punkte aus {row.vote_count} Stimmen
                      </li>
                    ))
                ) : (
                  <li>Keine Ergebnisse verfügbar.</li>
                )}
              </ul>
              <div className="actions">
                <button type="button" className="button" onClick={handleLeaveRoom}>
                  Leave Room
                </button>
                {isHost ? (
                  <button type="button" className="button" onClick={handleReturnToLobby}>
                    Return to Lobby
                  </button>
                ) : null}
                {isHost ? (
                  <button type="button" className="button danger" disabled={isDeleting} onClick={handleDeleteRoom}>
                    {isDeleting ? 'Disbanding …' : 'Disband Room'}
                  </button>
                ) : null}
              </div>
              {deleteError ? <p className="error-message">{deleteError}</p> : null}
              {deleteSuccess ? <p className="success-message">{deleteSuccess}</p> : null}
            </>
          ) : (
            <>
              <p>Aktueller Spieler: <strong>{currentPick?.user_name ?? 'Lädt …'}</strong></p>
              {currentPick ? (
                <>
                  <div className="song-card">
                    {currentPick.cover_url ? <img src={currentPick.cover_url} alt={currentPick.track_name} className="cover" /> : null}
                    <div>
                      <h3>{currentPick.track_name}</h3>
                      <p>{currentPick.artist_names}</p>
                    </div>
                    <button type="button" className="button" disabled={!playerCanControl || playbackBusy} onClick={handlePlayPause}>
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    {playbackError ? <>
                      <p className="error-message">{playbackError}</p>
                      {spotifyDeviceHint ? <p className="hint">{spotifyDeviceHint}</p> : null}
                    </> : null}
                    {!playerCanControl ? <p className="hint">Only the host and current player can control playback.</p> : null}
                  </div>
                  <div className="rating-card card">
                    <h3>Bewertung</h3>
                    <div className="rating-row">
                      {scoreButtons.map((score) => (
                        <button
                          key={score}
                          type="button"
                          className={`star-button ${voteScore !== null && score <= voteScore ? 'selected' : ''}`}
                          onClick={() => setVoteScore(score)}
                          aria-label={`Bewertung ${score} von 5`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <button type="button" className="button" disabled={!canVote || voteScore === null || hasVoted} onClick={handleVoteSubmit}>
                      {hasVoted ? 'Voted' : 'Confirm'}
                    </button>
                    {voteError ? <p className="error-message">{voteError}</p> : null}
                    {voteSuccess ? <p className="success-message">{voteSuccess}</p> : null}
                    <p>{roundState.votes_cast}/{roundState.votes_needed} Stimmen abgegeben</p>
                  </div>
                </>
              ) : (
                <p>Lade den nächsten Song …</p>
              )}
              <div className="actions">
                <button type="button" className="button" disabled={!canNext} onClick={handleNextPlayer}>
                  Next Player
                </button>
                {nextError ? <p className="error-message">{nextError}</p> : null}
                {!canNext ? <p className="hint">Der Host sollte warten, bis alle Spieler abgestimmt haben.</p> : null}
              </div>
            </>
          )}
        </section>
      ) : null}
    </section>
  );
}
