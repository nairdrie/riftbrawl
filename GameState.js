class GameState {
    constructor() {
      this.players = {};
    }

    addPlayer(socketId, initialPosition) {
      this.players[socketId] = {
        character: null, // set once the player picks a fighter and starts
        position: initialPosition,
        facing: 1,
        clip: 'Idle',
        ghost: false,
        blocking: false,
        damage: 0,
      };
    }

    removePlayer(socketId) {
      delete this.players[socketId];
    }

    // Clients are authoritative over their own fighter; the server stores
    // and rebroadcasts the latest published state.
    updatePlayer(socketId, state) {
      const player = this.players[socketId];

      if (!player || !state) {
        return;
      }

      Object.assign(player, state);
    }

    getState() {
      return this.players;
    }
  }

  module.exports = GameState;
