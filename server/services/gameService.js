const { pickWordOptions } = require("./wordService");
const { saveRoomRecord, saveGameResult } = require("./persistenceService");

function createGameService(io) {
  function maskWord(word, revealedIndexes) {
    return word
      .split("")
      .map((char, index) => {
        if (char === " ") {
          return " ";
        }

        return revealedIndexes.has(index) ? char : "_";
      })
      .join(" ");
  }

  function normalizeGuess(text) {
    return text.trim().toLowerCase();
  }

  function getLeaderboard(room) {
    return room.players
      .map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
      }))
      .sort((first, second) => second.score - first.score);
  }

  function getWinner(room) {
    const leaderboard = getLeaderboard(room);
    return leaderboard.length ? leaderboard[0] : null;
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
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        isHost: player.isHost,
        hasGuessed: player.hasGuessed,
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

  function assignNewHost(room) {
    if (!room.players.length) {
      return;
    }

    room.players.forEach((player) => {
      player.isHost = false;
    });

    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
  }

  function scoreForGuess(room) {
    if (!room.roundEndsAt) {
      return 100;
    }

    const timeLeft = Math.max(0, Math.ceil((room.roundEndsAt - Date.now()) / 1000));
    const base = 100;
    const bonus = Math.floor((timeLeft / room.settings.drawTime) * 100);

    return base + bonus;
  }

  function revealRandomLetter(room) {
    const indexes = [];

    for (let index = 0; index < room.word.length; index += 1) {
      const char = room.word[index];

      if (char === " ") {
        continue;
      }

      if (!room.revealedIndexes.has(index)) {
        indexes.push(index);
      }
    }

    if (!indexes.length) {
      return;
    }

    const randomIndex = indexes[Math.floor(Math.random() * indexes.length)];
    room.revealedIndexes.add(randomIndex);
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

      const winner = getWinner(room);
      const leaderboard = getLeaderboard(room);

      await saveRoomRecord(room, {
        status: "finished",
        winnerName: winner ? winner.name : "",
      });
      await saveGameResult(room, winner, leaderboard);

      emitGameState(room);
      io.to(room.id).emit("game_over", { winner, leaderboard });
      return;
    }

    room.round = Math.ceil(room.turn / room.players.length);
    const drawer = room.nextDrawer();
    room.phase = "choosing";
    room.resetRoundState();
    room.wordOptions = await pickWordOptions(room.settings.wordChoices);
    await saveRoomRecord(room, { status: "choosing" });

    room.players.forEach((player) => {
      const payload = {
        drawerId: drawer.id,
        wordOptions: player.socketId === drawer.socketId ? room.wordOptions : null,
        drawTime: room.settings.drawTime,
        round: room.round,
        turn: room.turn,
      };

      io.to(player.socketId).emit("round_start", payload);
    });

    emitGameState(room);
  }

  function startDrawingPhase(room, chosenWord) {
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

  return {
    normalizeGuess,
    getGameState,
    emitGameState,
    getLeaderboard,
    getWinner,
    assignNewHost,
    scoreForGuess,
    startTurn,
    startDrawingPhase,
    endRound,
  };
}

module.exports = createGameService;
