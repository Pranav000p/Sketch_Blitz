require("dotenv").config();

const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const { customAlphabet } = require("nanoid");
const { connectToDatabase, isDatabaseReady } = require("./db");
const GameResult = require("./models/GameResult");
const RoomRecord = require("./models/RoomRecord");
const WordList = require("./models/WordList");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 90,
  wordChoices: 3,
  hints: 2,
  isPrivate: true,
};

const WORDS = [
  "apple",
  "bicycle",
  "camera",
  "castle",
  "diamond",
  "elephant",
  "flower",
  "guitar",
  "helicopter",
  "island",
  "jacket",
  "kangaroo",
  "laptop",
  "mountain",
  "notebook",
  "ocean",
  "pencil",
  "queen",
  "rainbow",
  "sunflower",
  "tiger",
  "umbrella",
  "violin",
  "waterfall",
  "xylophone",
  "yacht",
  "zebra",
  "airplane",
  "balloon",
  "cactus",
  "dolphin",
  "engine",
  "fireworks",
  "glasses",
  "hamburger",
  "igloo",
  "jungle",
  "kitchen",
  "ladder",
  "microscope",
  "necklace",
  "octopus",
  "pumpkin",
  "quill",
  "rocket",
  "scooter",
  "telescope",
  "unicorn",
  "volcano",
  "windmill",
  "yogurt",
];

const clientDistPath = path.join(__dirname, "../client/dist");
const clientIndexPath = path.join(clientDistPath, "index.html");

class Player {
  constructor({ id, name, socketId, isHost }) {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.isHost = isHost;
    this.score = 0;
    this.hasGuessed = false;
  }
}

class Room {
  constructor({ id, settings, hostId }) {
    // This room object keeps the live game state in memory for fast updates.
    this.id = id;
    this.settings = settings;
    this.hostId = hostId;
    this.players = [];
    this.phase = "lobby";
    this.round = 0;
    this.turn = 0;
    this.drawerIndex = -1;
    this.word = "";
    this.wordOptions = [];
    this.revealedIndexes = new Set();
    this.strokes = [];
    this.timers = {
      roundTimeout: null,
      hintInterval: null,
      tickInterval: null,
    };
    this.roundEndsAt = null;
  }

  addPlayer(player) {
    this.players.push(player);
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) return null;
    const [removed] = this.players.splice(idx, 1);
    return { removed, index: idx };
  }

  getPlayerBySocket(socketId) {
    return this.players.find((p) => p.socketId === socketId);
  }

  getPlayerById(id) {
    return this.players.find((p) => p.id === id);
  }

  nextDrawer() {
    if (this.players.length === 0) return null;
    this.drawerIndex = (this.drawerIndex + 1) % this.players.length;
    return this.players[this.drawerIndex];
  }

  resetRoundState() {
    this.word = "";
    this.wordOptions = [];
    this.revealedIndexes = new Set();
    this.strokes = [];
    this.players.forEach((p) => {
      p.hasGuessed = false;
    });
    this.clearTimers();
    this.roundEndsAt = null;
  }

  clearTimers() {
    if (this.timers.roundTimeout) clearTimeout(this.timers.roundTimeout);
    if (this.timers.hintInterval) clearInterval(this.timers.hintInterval);
    if (this.timers.tickInterval) clearInterval(this.timers.tickInterval);
    this.timers.roundTimeout = null;
    this.timers.hintInterval = null;
    this.timers.tickInterval = null;
  }
}

const rooms = new Map();

async function seedWordsIfNeeded() {
  if (!isDatabaseReady()) {
    return;
  }

  const existingCount = await WordList.countDocuments();

  if (existingCount > 0) {
    return;
  }

  const defaultWords = WORDS.map((word) => ({
    word,
    category: "general",
    isActive: true,
  }));

  await WordList.insertMany(defaultWords);
  console.log("Default words saved to MongoDB");
}

async function getWordsFromDatabase() {
  if (!isDatabaseReady()) {
    return WORDS;
  }

  try {
    const dbWords = await WordList.find({ isActive: true }).select("word -_id").lean();

    if (!dbWords.length) {
      return WORDS;
    }

    return dbWords.map((item) => item.word);
  } catch (error) {
    console.error("Could not load words from MongoDB:", error.message);
    return WORDS;
  }
}

async function pickWordOptions(count) {
  const availableWords = await getWordsFromDatabase();
  const safeCount = Math.min(count, availableWords.length);
  const options = [];

  while (options.length < safeCount) {
    const word = availableWords[Math.floor(Math.random() * availableWords.length)];
    if (!options.includes(word)) options.push(word);
  }

  return options;
}

function maskWord(word, revealedIndexes) {
  return word
    .split("")
    .map((ch, idx) => {
      if (ch === " ") return " ";
      return revealedIndexes.has(idx) ? ch : "_";
    })
    .join(" ");
}

function normalizeGuess(text) {
  return text.trim().toLowerCase();
}

function getGameState(room, socketId) {
  const drawer = room.players[room.drawerIndex];
  const isDrawer = drawer && drawer.socketId === socketId;
  return {
    roomId: room.id,
    phase: room.phase,
    round: room.round,
    turn: room.turn,
    drawerId: drawer ? drawer.id : null,
    drawerName: drawer ? drawer.name : null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      isHost: p.isHost,
      hasGuessed: p.hasGuessed,
    })),
    word: isDrawer ? room.word : null,
    maskedWord: room.word ? maskWord(room.word, room.revealedIndexes) : "",
    settings: room.settings,
    timeLeft: room.roundEndsAt
      ? Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1000))
      : null,
  };
}

function emitGameState(room) {
  room.players.forEach((player) => {
    io.to(player.socketId).emit("game_state", getGameState(room, player.socketId));
  });
}

async function saveRoomRecord(room, extraFields = {}) {
  if (!isDatabaseReady()) {
    return;
  }

  // MongoDB stores the room settings and status so they survive restarts.
  const hostPlayer = room.getPlayerById(room.hostId) || room.players[0];

  await RoomRecord.findOneAndUpdate(
    { roomId: room.id },
    {
      roomId: room.id,
      hostName: hostPlayer ? hostPlayer.name : "Host",
      settings: room.settings,
      status: room.phase,
      playerCount: room.players.length,
      ...extraFields,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function saveGameResult(room) {
  if (!isDatabaseReady()) {
    return;
  }

  await GameResult.create({
    roomId: room.id,
    winner: getWinner(room),
    leaderboard: getLeaderboard(room),
    roomSettings: room.settings,
    completedAt: new Date(),
  });
}

async function startTurn(room) {
  if (room.players.length < 2) {
    room.phase = "lobby";
    room.resetRoundState();
    await saveRoomRecord(room, { status: "lobby" });
    emitGameState(room);
    return;
  }

  room.turn += 1;
  const totalTurns = room.settings.rounds * room.players.length;

  if (room.turn > totalTurns) {
    room.phase = "game_over";
    room.clearTimers();
    await saveRoomRecord(room, {
      status: "finished",
      winnerName: getWinner(room)?.name || "",
    });
    await saveGameResult(room);
    emitGameState(room);
    io.to(room.id).emit("game_over", {
      winner: getWinner(room),
      leaderboard: getLeaderboard(room),
    });
    return;
  }

  room.round = Math.ceil(room.turn / room.players.length);
  const drawer = room.nextDrawer();
  room.phase = "choosing";
  room.resetRoundState();
  // The drawer gets a few words to choose from at the start of the turn.
  room.wordOptions = await pickWordOptions(room.settings.wordChoices);
  await saveRoomRecord(room, { status: "choosing" });

  room.players.forEach((player) => {
    if (player.socketId === drawer.socketId) {
      io.to(player.socketId).emit("round_start", {
        drawerId: drawer.id,
        wordOptions: room.wordOptions,
        drawTime: room.settings.drawTime,
        round: room.round,
        turn: room.turn,
      });
    } else {
      io.to(player.socketId).emit("round_start", {
        drawerId: drawer.id,
        wordOptions: null,
        drawTime: room.settings.drawTime,
        round: room.round,
        turn: room.turn,
      });
    }
  });

  emitGameState(room);
}

function startDrawingPhase(room, chosenWord) {
  // Once the drawer picks a word, the timer and hints begin.
  room.word = chosenWord;
  room.phase = "drawing";
  room.revealedIndexes = new Set();
  room.roundEndsAt = Date.now() + room.settings.drawTime * 1000;
  saveRoomRecord(room, { status: "drawing" }).catch((error) => {
    console.error("Could not update room status:", error.message);
  });

  if (room.settings.hints > 0) {
    const revealCount = Math.min(room.settings.hints, room.word.replace(/\s/g, "").length - 1);
    if (revealCount > 0) {
      const intervalMs = Math.floor((room.settings.drawTime * 1000) / (revealCount + 1));
      room.timers.hintInterval = setInterval(() => {
        revealRandomLetter(room);
        emitGameState(room);
      }, intervalMs);
    }
  }

  room.timers.tickInterval = setInterval(() => {
    io.to(room.id).emit("timer", {
      timeLeft: Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1000)),
    });
  }, 1000);

  room.timers.roundTimeout = setTimeout(() => {
    endRound(room, "time");
  }, room.settings.drawTime * 1000);

  emitGameState(room);
}

function revealRandomLetter(room) {
  const indexes = [];
  for (let i = 0; i < room.word.length; i += 1) {
    const ch = room.word[i];
    if (ch === " ") continue;
    if (!room.revealedIndexes.has(i)) indexes.push(i);
  }
  if (indexes.length === 0) return;
  const idx = indexes[Math.floor(Math.random() * indexes.length)];
  room.revealedIndexes.add(idx);
}

function endRound(room, reason) {
  room.phase = "round_end";
  room.clearTimers();
  saveRoomRecord(room, { status: "round_end" }).catch((error) => {
    console.error("Could not update room status:", error.message);
  });
  io.to(room.id).emit("round_end", {
    word: room.word,
    scores: getLeaderboard(room),
    reason,
  });

  setTimeout(() => {
    startTurn(room);
  }, 3000);
}

function getLeaderboard(room) {
  return room.players
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

function getWinner(room) {
  const leaderboard = getLeaderboard(room);
  return leaderboard.length ? leaderboard[0] : null;
}

function assignNewHost(room) {
  if (!room.players.length) return;
  room.players.forEach((p) => (p.isHost = false));
  room.players[0].isHost = true;
  room.hostId = room.players[0].id;
}

function scoreForGuess(room) {
  if (!room.roundEndsAt) return 100;
  const timeLeft = Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1000));
  const base = 100;
  const bonus = Math.floor((timeLeft / room.settings.drawTime) * 100);
  return base + bonus;
}

io.on("connection", (socket) => {
  socket.on("create_room", async ({ hostName, settings }) => {
    const roomId = nanoid();
    const finalSettings = { ...DEFAULT_SETTINGS, ...settings };
    const room = new Room({ id: roomId, settings: finalSettings, hostId: socket.id });
    const player = new Player({
      id: socket.id,
      name: hostName || "Host",
      socketId: socket.id,
      isHost: true,
    });

    room.addPlayer(player);
    rooms.set(roomId, room);
    socket.join(roomId);

    try {
      await saveRoomRecord(room, { status: "lobby" });
    } catch (error) {
      console.error("Could not save room:", error.message);
    }

    socket.emit("room_created", { roomId });
    io.to(roomId).emit("player_joined", { player, players: room.players });
    emitGameState(room);
  });

  socket.on("join_room", async ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error_message", { message: "Room not found." });
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit("error_message", { message: "Room is full." });
      return;
    }

    const player = new Player({
      id: socket.id,
      name: playerName || "Player",
      socketId: socket.id,
      isHost: false,
    });

    room.addPlayer(player);
    socket.join(roomId);

    try {
      await saveRoomRecord(room, { status: room.phase });
    } catch (error) {
      console.error("Could not update room after join:", error.message);
    }

    io.to(roomId).emit("player_joined", { player, players: room.players });
    emitGameState(room);
  });

  socket.on("start_game", async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player || !player.isHost) return;
    room.turn = 0;
    room.round = 0;
    await startTurn(room);
  });

  socket.on("word_chosen", ({ roomId, word }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    if (!room.wordOptions.includes(word)) return;
    startDrawingPhase(room, word);
  });

  socket.on("guess", ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player) return;
    const drawer = room.players[room.drawerIndex];
    if (drawer && drawer.socketId === socket.id) return;

    const normalized = normalizeGuess(text || "");
    if (!normalized) return;

    // Guess matching is kept simple: trim spaces and compare lowercase text.
    if (normalized === normalizeGuess(room.word)) {
      if (player.hasGuessed) return;
      player.hasGuessed = true;
      const points = scoreForGuess(room);
      player.score += points;

      io.to(player.socketId).emit("guess_result", {
        correct: true,
        playerId: player.id,
        playerName: player.name,
        points,
      });
      io.to(room.id).emit("chat_message", {
        system: true,
        text: `${player.name} guessed the word! (+${points})`,
      });

      const remainingGuessers = room.players.filter(
        (p) => p.socketId !== drawer.socketId && !p.hasGuessed
      );
      if (remainingGuessers.length === 0) {
        endRound(room, "all_guessed");
      } else {
        emitGameState(room);
      }
    } else {
      io.to(room.id).emit("chat_message", {
        playerId: player.id,
        playerName: player.name,
        text,
      });
      io.to(player.socketId).emit("guess_result", { correct: false });
    }
  });

  socket.on("chat", ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.getPlayerBySocket(socket.id);
    if (!player) return;
    if (!text || !text.trim()) return;
    io.to(room.id).emit("chat_message", {
      playerId: player.id,
      playerName: player.name,
      text,
    });
  });

  socket.on("draw_start", ({ roomId, stroke }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    // We save the full stroke in memory and send it to everyone in the room.
    room.strokes.push({ ...stroke, points: [stroke.point] });
    io.to(room.id).emit("draw_data", room.strokes[room.strokes.length - 1]);
  });

  socket.on("draw_move", ({ roomId, point }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    const current = room.strokes[room.strokes.length - 1];
    if (!current) return;
    current.points.push(point);
    io.to(room.id).emit("draw_data", current);
  });

  socket.on("draw_end", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    io.to(room.id).emit("draw_end", {});
  });

  socket.on("canvas_clear", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    room.strokes = [];
    io.to(room.id).emit("canvas_clear", {});
  });

  socket.on("draw_undo", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "drawing") return;
    const drawer = room.players[room.drawerIndex];
    if (!drawer || drawer.socketId !== socket.id) return;
    room.strokes.pop();
    io.to(room.id).emit("draw_undo", { strokes: room.strokes });
  });

  socket.on("request_state", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    socket.emit("game_state", getGameState(room, socket.id));
  });

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const currentDrawer = room.players[room.drawerIndex];
      const removal = room.removePlayer(socket.id);
      if (!removal) continue;
      const { removed, index: removedIndex } = removal;

      if (removedIndex <= room.drawerIndex) {
        room.drawerIndex -= 1;
      }

      if (room.players.length === 0) {
        saveRoomRecord(room, { status: "empty", playerCount: 0 }).catch((error) => {
          console.error("Could not close empty room:", error.message);
        });
        rooms.delete(room.id);
        return;
      }

      if (removed.isHost) assignNewHost(room);

      io.to(room.id).emit("player_left", { playerId: removed.id, players: room.players });

      if (removed.id === currentDrawer?.id) {
        endRound(room, "drawer_left");
      }

      if (room.players.length < 2 && room.phase !== "lobby") {
        room.phase = "lobby";
        room.resetRoundState();
      }

      saveRoomRecord(room, { status: room.phase, playerCount: room.players.length }).catch(
        (error) => {
          console.error("Could not update room after disconnect:", error.message);
        }
      );

      emitGameState(room);
      return;
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mongodbConnected: isDatabaseReady(),
  });
});

if (fs.existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(clientIndexPath);
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).send(
      "Sketch Blitz backend is running. In development, start the React app with 'npm run dev' inside the client folder and open http://localhost:5173"
    );
  });
}

async function startServer() {
  await connectToDatabase();

  try {
    await seedWordsIfNeeded();
  } catch (error) {
    console.error("Could not seed words:", error.message);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
