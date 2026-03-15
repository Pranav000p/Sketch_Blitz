const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  rounds: 3,
  drawTime: 90,
  wordChoices: 3,
  hints: 2,
  isPrivate: true,
};

module.exports = {
  PORT,
  CLIENT_ORIGIN,
  DEFAULT_SETTINGS,
};
