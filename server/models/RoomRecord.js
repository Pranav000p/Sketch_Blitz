const mongoose = require("mongoose");

const roomRecordSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
    },
    hostName: {
      type: String,
      required: true,
    },
    settings: {
      maxPlayers: Number,
      rounds: Number,
      drawTime: Number,
      wordChoices: Number,
      hints: Number,
      isPrivate: Boolean,
    },
    status: {
      type: String,
      default: "lobby",
    },
    playerCount: {
      type: Number,
      default: 1,
    },
    winnerName: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("RoomRecord", roomRecordSchema);
