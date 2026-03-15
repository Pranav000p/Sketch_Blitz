const { isDatabaseReady } = require("../db");
const WordList = require("../models/WordList");
const defaultWords = require("../data/defaultWords");

async function seedWordsIfNeeded() {
  if (!isDatabaseReady()) {
    return;
  }

  const existingCount = await WordList.countDocuments();

  if (existingCount > 0) {
    return;
  }

  const wordsToSave = defaultWords.map((word) => ({
    word,
    category: "general",
    isActive: true,
  }));

  await WordList.insertMany(wordsToSave);
  console.log("Default words saved to MongoDB");
}

async function getWordsFromDatabase() {
  if (!isDatabaseReady()) {
    return defaultWords;
  }

  try {
    const dbWords = await WordList.find({ isActive: true }).select("word -_id").lean();

    if (!dbWords.length) {
      return defaultWords;
    }

    return dbWords.map((item) => item.word);
  } catch (error) {
    console.error("Could not load words from MongoDB:", error.message);
    return defaultWords;
  }
}

async function pickWordOptions(count) {
  const availableWords = await getWordsFromDatabase();
  const safeCount = Math.min(count, availableWords.length);
  const options = [];

  while (options.length < safeCount) {
    const word = availableWords[Math.floor(Math.random() * availableWords.length)];

    if (!options.includes(word)) {
      options.push(word);
    }
  }

  return options;
}

module.exports = {
  seedWordsIfNeeded,
  getWordsFromDatabase,
  pickWordOptions,
};
