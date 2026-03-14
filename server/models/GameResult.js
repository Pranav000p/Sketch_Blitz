const mongoose = require("mongoose");

const gameResultSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
    },
    winner: {
      id: String,
      name: String,
      score: Number,
    },
    leaderboard: [
      {
        id: String,
        name: String,
        score: Number,
      },
    ],
    roomSettings: {
      maxPlayers: Number,
      rounds: Number,
      drawTime: Number,
      wordChoices: Number,
      hints: Number,
      isPrivate: Boolean,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("GameResult", gameResultSchema);
