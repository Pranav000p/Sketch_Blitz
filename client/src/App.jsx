import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket";
import CanvasBoard from "./components/CanvasBoard.jsx";

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 90,
  wordChoices: 3,
  hints: 2,
  isPrivate: true,
};

const COLORS = [
  "#0f172a",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#10b981",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
];

export default function App() {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [players, setPlayers] = useState([]);
  const [phase, setPhase] = useState("home");
  const [homeError, setHomeError] = useState("");
  const [drawerId, setDrawerId] = useState(null);
  const [drawerName, setDrawerName] = useState("");
  const [wordOptions, setWordOptions] = useState([]);
  const [maskedWord, setMaskedWord] = useState("");
  const [word, setWord] = useState("");
  const [timer, setTimer] = useState(null);
  const [round, setRound] = useState(0);
  const [gameOver, setGameOver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [guessInput, setGuessInput] = useState("");
  const [strokes, setStrokes] = useState([]);
  const [brushColor, setBrushColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(6);
  const chatLogRef = useRef(null);
  const phaseRef = useRef(phase);

  const me = useMemo(() => players.find((p) => p.id === socket.id), [players]);
  const isHost = me?.isHost;
  const isDrawer = me && me.id === drawerId;
  const hasGuessed = me?.hasGuessed;
  const guessLocked = !isDrawer && hasGuessed;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    // All socket listeners are registered once when the app loads.
    socket.connect();

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("room_created", ({ roomId: newRoomId }) => {
      setRoomId(newRoomId);
      setPhase("lobby");
      setHomeError("");
      setGameOver(null);
    });

    socket.on("player_joined", ({ players }) => {
      setPlayers(players);
    });

    socket.on("player_left", ({ players }) => {
      setPlayers(players);
    });

    socket.on("game_state", (state) => {
      setRoomId((currentRoomId) => state.roomId || currentRoomId);
      const nextPhase =
        state.phase === "lobby"
          ? "lobby"
          : state.phase === "game_over"
          ? "game_over"
          : "game";
      setPhase(nextPhase);
      setPlayers(state.players || []);
      setDrawerId(state.drawerId);
      setDrawerName(state.drawerName || "");
      setMaskedWord(state.maskedWord || "");
      setWord(state.word || "");
      setTimer(state.timeLeft ?? null);
      setSettings(state.settings || DEFAULT_SETTINGS);
      setRound(state.round || 0);
      if (nextPhase !== "home") {
        setHomeError("");
      }
    });

    socket.on("round_start", ({ drawerId, wordOptions }) => {
      setPhase("game");
      setDrawerId(drawerId);
      setWordOptions(wordOptions || []);
      setMessages([]);
      setStrokes([]);
      setMaskedWord("");
      setHomeError("");
    });

    socket.on("round_end", ({ word, scores }) => {
      setMessages((prev) => [
        ...prev,
        { system: true, text: `Round over! Word was: ${word}` },
      ]);
      setPlayers((prev) =>
        prev.map((p) => {
          const updated = scores.find((s) => s.id === p.id);
          return updated ? { ...p, score: updated.score } : p;
        })
      );
      setStrokes([]);
    });

    socket.on("game_over", ({ winner, leaderboard }) => {
      setGameOver({ winner, leaderboard });
      setPhase("game_over");
    });

    socket.on("chat_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("guess_result", ({ correct, points }) => {
      if (correct) {
        setMessages((prev) => [
          ...prev,
          { system: true, text: `You guessed correctly! (+${points})` },
        ]);
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === socket.id ? { ...p, hasGuessed: true } : p
          )
        );
      }
    });

    socket.on("timer", ({ timeLeft }) => {
      setTimer(timeLeft);
    });

    socket.on("draw_data", (stroke) => {
      setStrokes((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (!last || last.id !== stroke.id) {
          next.push(stroke);
        } else {
          next[next.length - 1] = stroke;
        }
        return next;
      });
    });

    socket.on("draw_undo", ({ strokes }) => {
      setStrokes(strokes || []);
    });

    socket.on("canvas_clear", () => {
      setStrokes([]);
    });

    socket.on("error_message", ({ message }) => {
      if (phaseRef.current === "home") {
        setHomeError(message);
      } else {
        setMessages((prev) => [...prev, { system: true, text: message }]);
      }
    });

    return () => {
      socket.off();
    };
  }, []);

  useEffect(() => {
    if (!chatLogRef.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [messages]);

  const handleCreateRoom = () => {
    if (!connected || !playerName.trim()) return;
    setHomeError("");
    socket.emit("create_room", { hostName: playerName, settings });
  };

  const handleJoinRoom = () => {
    if (!connected || !playerName.trim() || !joinCode.trim()) return;
    setHomeError("");
    socket.emit("join_room", { roomId: joinCode.toUpperCase(), playerName });
    setRoomId(joinCode.toUpperCase());
  };

  const handleStartGame = () => {
    socket.emit("start_game", { roomId });
  };

  const handleChooseWord = (word) => {
    socket.emit("word_chosen", { roomId, word });
    setWordOptions([]);
  };

  const handleGuess = (event) => {
    event.preventDefault();
    if (guessLocked || !guessInput.trim()) return;
    socket.emit("guess", { roomId, text: guessInput });
    setGuessInput("");
  };

  const handleChat = (event) => {
    event.preventDefault();
    if (!guessInput.trim()) return;
    socket.emit("chat", { roomId, text: guessInput });
    setGuessInput("");
  };

  const handleDrawStart = (point) => {
    // A new stroke starts with the first point, color, and brush size.
    const stroke = {
      id: `${socket.id}-${Date.now()}`,
      color: brushColor,
      size: brushSize,
      point,
      points: [point],
    };
    socket.emit("draw_start", { roomId, stroke });
  };

  const handleDrawMove = (point) => {
    socket.emit("draw_move", { roomId, point });
  };

  const handleDrawEnd = () => {
    socket.emit("draw_end", { roomId });
  };

  const handleClear = () => {
    socket.emit("canvas_clear", { roomId });
  };

  const handleUndo = () => {
    socket.emit("draw_undo", { roomId });
  };

  const resetToHome = () => {
    setPhase("home");
    setRoomId("");
    setJoinCode("");
    setPlayers([]);
    setMessages([]);
    setWordOptions([]);
    setMaskedWord("");
    setWord("");
    setTimer(null);
    setRound(0);
    setStrokes([]);
    setGameOver(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Sketch Blitz</h1>
          <p>Fast multiplayer drawing and guessing</p>
        </div>
        <div className="status">
          <span className={connected ? "dot online" : "dot"} />
          <span>{connected ? "Connected" : "Offline"}</span>
        </div>
      </header>

      {phase === "home" && (
        <section className="card grid">
          <div className="panel">
            <h2>Join the chaos</h2>
            {!connected && (
              <p className="warning">Connecting to server...</p>
            )}
            <label>
              Your name
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Player name"
              />
            </label>
            <label>
              Room code
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123"
              />
            </label>
            {homeError && <p className="error-text">{homeError}</p>}
            <button className="primary" onClick={handleJoinRoom} disabled={!connected}>
              Join room
            </button>
          </div>

          <div className="panel">
            <h2>Create a room</h2>
            {!connected && (
              <p className="warning">Connecting to server...</p>
            )}
            <label>
              Your name
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Host name"
              />
            </label>
            <div className="settings">
              <label>
                Max players
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={settings.maxPlayers}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxPlayers: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Rounds
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={settings.rounds}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, rounds: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Draw time (sec)
                <input
                  type="number"
                  min="15"
                  max="240"
                  value={settings.drawTime}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, drawTime: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Word choices
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={settings.wordChoices}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      wordChoices: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Hints
                <input
                  type="number"
                  min="0"
                  max="5"
                  value={settings.hints}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, hints: Number(e.target.value) }))
                  }
                />
              </label>
            </div>
            <button className="primary" onClick={handleCreateRoom} disabled={!connected}>
              Create room
            </button>
          </div>
        </section>
      )}

      {phase === "lobby" && (
        <section className="card">
          <div className="lobby-header">
            <div>
              <h2>Room {roomId}</h2>
              <p>Waiting for players...</p>
            </div>
            {isHost && (
              <button className="primary" onClick={handleStartGame}>
                Start game
              </button>
            )}
          </div>
          <div className="players">
            {players.map((p) => (
              <div key={p.id} className="player-pill">
                <span>{p.name}</span>
                {p.isHost && <span className="tag">Host</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === "game" && (
        <section className="game">
          <div className="game-main">
            <div className="game-header">
              <div>
                <h2>Room {roomId}</h2>
                <p>
                  Drawer: <strong>{drawerName}</strong>
                </p>
                <p className="round-info">
                  Round {round} / {settings.rounds}
                </p>
              </div>
              <div className="timer">
                <span>Time</span>
                <strong>{timer ?? "--"}s</strong>
              </div>
            </div>

            <div className="word-panel">
              {isDrawer ? (
                <h3>Word: {word || "Pick a word..."}</h3>
              ) : maskedWord ? (
                <h3>Guess the word</h3>
              ) : (
                <h3>Waiting for drawer to pick a word...</h3>
              )}
              {wordOptions.length > 0 && isDrawer && (
                <div className="word-options">
                  {wordOptions.map((option) => (
                    <button key={option} onClick={() => handleChooseWord(option)}>
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="canvas-wrap">
              <CanvasBoard
                strokes={strokes}
                isDrawer={isDrawer}
                onStart={handleDrawStart}
                onMove={handleDrawMove}
                onEnd={handleDrawEnd}
              />
              {!isDrawer && (
                <div className="hint-display">{maskedWord || "_ _ _ _ _"}</div>
              )}
              {isDrawer && (
                <div className="tools">
                  <div className="colors">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        className={color === brushColor ? "active" : ""}
                        style={{ background: color }}
                        onClick={() => setBrushColor(color)}
                      />
                    ))}
                  </div>
                  <div className="sizes">
                    <label>
                      Size
                      <input
                        type="range"
                        min="2"
                        max="20"
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button onClick={handleUndo}>Undo</button>
                    <button onClick={handleClear}>Clear</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar">
            <div className="scoreboard card">
              <h3>Leaderboard</h3>
              {players
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p) => (
                  <div key={p.id} className="score-row">
                    <span>{p.name}</span>
                    <strong>{p.score}</strong>
                  </div>
                ))}
            </div>

            <div className="chat card">
              <h3>Chat</h3>
              <div className="chat-log" ref={chatLogRef}>
                {messages.map((msg, idx) => (
                  <div key={idx} className={msg.system ? "system" : ""}>
                    {msg.system ? (
                      <em>{msg.text}</em>
                    ) : (
                      <span>
                        <strong>{msg.playerName}:</strong> {msg.text}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={isDrawer ? handleChat : handleGuess}>
                <input
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder={
                    isDrawer
                      ? "Chat"
                      : guessLocked
                      ? "You already guessed it!"
                      : "Guess the word"
                  }
                  disabled={guessLocked}
                />
                <button type="submit" disabled={guessLocked}>
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {phase === "game_over" && gameOver && (
        <section className="card game-over">
          <h2>Game Over!</h2>
          {gameOver.winner ? (
            <p className="winner">
              Winner: <strong>{gameOver.winner.name}</strong> ({gameOver.winner.score}
              )
            </p>
          ) : (
            <p>No winner yet.</p>
          )}
          <div className="scoreboard">
            {gameOver.leaderboard?.map((p) => (
              <div key={p.id} className="score-row">
                <span>{p.name}</span>
                <strong>{p.score}</strong>
              </div>
            ))}
          </div>
          <button className="primary" onClick={resetToHome}>
            Back to Home
          </button>
        </section>
      )}
    </div>
  );
}
