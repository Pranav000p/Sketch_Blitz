const { customAlphabet } = require("nanoid");
const { DEFAULT_SETTINGS } = require("../config/gameConfig");
const Player = require("../classes/Player");
const Room = require("../classes/Room");
const { saveRoomRecord } = require("../services/persistenceService");
const createGameService = require("../services/gameService");

const createRoomCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

function registerGameSocketHandlers(io, rooms) {
  const gameService = createGameService(io);

  io.on("connection", (socket) => {
    socket.on("create_room", async ({ hostName, settings }) => {
      const roomId = createRoomCode();
      const room = new Room({
        id: roomId,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        hostId: socket.id,
      });

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
      gameService.emitGameState(room);
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
      gameService.emitGameState(room);
    });

    socket.on("start_game", async ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) {
        return;
      }

      const player = room.getPlayerBySocket(socket.id);

      if (!player || !player.isHost) {
        return;
      }

      room.turn = 0;
      room.round = 0;
      await gameService.startTurn(room);
    });

    socket.on("word_chosen", ({ roomId, word }) => {
      const room = rooms.get(roomId);

      if (!room) {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      if (!room.wordOptions.includes(word)) {
        return;
      }

      gameService.startDrawingPhase(room, word);
    });

    socket.on("guess", ({ roomId, text }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const player = room.getPlayerBySocket(socket.id);
      const drawer = room.players[room.drawerIndex];

      if (!player) {
        return;
      }

      if (drawer && drawer.socketId === socket.id) {
        return;
      }

      const normalizedGuess = gameService.normalizeGuess(text || "");

      if (!normalizedGuess) {
        return;
      }

      if (normalizedGuess === gameService.normalizeGuess(room.word)) {
        if (player.hasGuessed) {
          return;
        }

        player.hasGuessed = true;
        const points = gameService.scoreForGuess(room);
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
          (roomPlayer) => roomPlayer.socketId !== drawer.socketId && !roomPlayer.hasGuessed
        );

        if (!remainingGuessers.length) {
          gameService.endRound(room, "all_guessed");
        } else {
          gameService.emitGameState(room);
        }

        return;
      }

      io.to(room.id).emit("chat_message", {
        playerId: player.id,
        playerName: player.name,
        text,
      });
      io.to(player.socketId).emit("guess_result", { correct: false });
    });

    socket.on("chat", ({ roomId, text }) => {
      const room = rooms.get(roomId);

      if (!room) {
        return;
      }

      const player = room.getPlayerBySocket(socket.id);

      if (!player || !text || !text.trim()) {
        return;
      }

      io.to(room.id).emit("chat_message", {
        playerId: player.id,
        playerName: player.name,
        text,
      });
    });

    socket.on("draw_start", ({ roomId, stroke }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      room.strokes.push({ ...stroke, points: [stroke.point] });
      io.to(room.id).emit("draw_data", room.strokes[room.strokes.length - 1]);
    });

    socket.on("draw_move", ({ roomId, point }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      const currentStroke = room.strokes[room.strokes.length - 1];

      if (!currentStroke) {
        return;
      }

      currentStroke.points.push(point);
      io.to(room.id).emit("draw_data", currentStroke);
    });

    socket.on("draw_end", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      io.to(room.id).emit("draw_end", {});
    });

    socket.on("canvas_clear", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      room.strokes = [];
      io.to(room.id).emit("canvas_clear", {});
    });

    socket.on("draw_undo", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room || room.phase !== "drawing") {
        return;
      }

      const drawer = room.players[room.drawerIndex];

      if (!drawer || drawer.socketId !== socket.id) {
        return;
      }

      room.strokes.pop();
      io.to(room.id).emit("draw_undo", { strokes: room.strokes });
    });

    socket.on("request_state", ({ roomId }) => {
      const room = rooms.get(roomId);

      if (!room) {
        return;
      }

      socket.emit("game_state", gameService.getGameState(room, socket.id));
    });

    socket.on("disconnect", () => {
      for (const room of rooms.values()) {
        const currentDrawer = room.players[room.drawerIndex];
        const removal = room.removePlayer(socket.id);

        if (!removal) {
          continue;
        }

        const { removed, index } = removal;

        if (index <= room.drawerIndex) {
          room.drawerIndex -= 1;
        }

        if (!room.players.length) {
          saveRoomRecord(room, { status: "empty", playerCount: 0 }).catch((error) => {
            console.error("Could not close empty room:", error.message);
          });
          rooms.delete(room.id);
          return;
        }

        if (removed.isHost) {
          gameService.assignNewHost(room);
        }

        io.to(room.id).emit("player_left", {
          playerId: removed.id,
          players: room.players,
        });

        if (removed.id === (currentDrawer && currentDrawer.id)) {
          gameService.endRound(room, "drawer_left");
        }

        if (room.players.length < 2 && room.phase !== "lobby") {
          room.phase = "lobby";
          room.resetRoundState();
        }

        saveRoomRecord(room, {
          status: room.phase,
          playerCount: room.players.length,
        }).catch((error) => {
          console.error("Could not update room after disconnect:", error.message);
        });

        gameService.emitGameState(room);
        return;
      }
    });
  });
}

module.exports = registerGameSocketHandlers;
