class Room {
  constructor({ id, settings, hostId }) {
    // Live game state stays in memory because it changes very often.
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
    const index = this.players.findIndex((player) => player.socketId === socketId);

    if (index === -1) {
      return null;
    }

    const [removed] = this.players.splice(index, 1);
    return { removed, index };
  }

  getPlayerBySocket(socketId) {
    return this.players.find((player) => player.socketId === socketId);
  }

  getPlayerById(id) {
    return this.players.find((player) => player.id === id);
  }

  nextDrawer() {
    if (this.players.length === 0) {
      return null;
    }

    this.drawerIndex = (this.drawerIndex + 1) % this.players.length;
    return this.players[this.drawerIndex];
  }

  resetRoundState() {
    this.word = "";
    this.wordOptions = [];
    this.revealedIndexes = new Set();
    this.strokes = [];

    this.players.forEach((player) => {
      player.hasGuessed = false;
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

module.exports = Room;
