const mongoose = require("mongoose");

const wordListSchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      default: "general",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("WordList", wordListSchema);
