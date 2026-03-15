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

module.exports = Player;
