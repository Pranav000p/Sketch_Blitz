const { isDatabaseReady } = require("../db");
const GameResult = require("../models/GameResult");
const RoomRecord = require("../models/RoomRecord");

async function saveRoomRecord(room, extraFields = {}) {
  if (!isDatabaseReady()) {
    return;
  }

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
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

async function saveGameResult(room, winner, leaderboard) {
  if (!isDatabaseReady()) {
    return;
  }

  await GameResult.create({
    roomId: room.id,
    winner,
    leaderboard,
    roomSettings: room.settings,
    completedAt: new Date(),
  });
}

module.exports = {
  saveRoomRecord,
  saveGameResult,
};
