document.addEventListener("alpine:init", () => {
  Alpine.store("remoteState", {
    players: [],
    interval: null,
    currentPlayer: null,
    lastPlayerSwitch: null,
    connected: false,
    isMyTurn: false,

    _client: null,
    _currentPlayerTopic: null,
    _gameStateTopic: null,

    init() {
      Alpine.effect(() => {
        if (
          this.connected &&
          Object.keys(this.players).indexOf(Alpine.store("localState").id) ===
            -1
        ) {
          this._updatePlayers({
            [Alpine.store("localState").id]: Alpine.store("localState").name,
            ...this.players
          });
        }
      });

      Alpine.effect(() => {
        if (this.currentPlayer == Alpine.store("localState").id) {
          this.isMyTurn = true;
          Alpine.store("audio").playDing();
        } else {
          this.isMyTurn = false;
        }
      });

      Alpine.effect(() => {
        if (
          Alpine.store("localState").nextPlayer == null ||
          Alpine.store("localState").nextPlayer ==
            Alpine.store("localState").id ||
          !Object.keys(this.players).includes(
            Alpine.store("localState").nextPlayer
          )
        ) {
          const players = Object.keys(this.players).sort();
          const nextPlayer =
            players[
              (players.indexOf(Alpine.store("localState").id) + 1) %
                players.length
            ];
          Alpine.store("localState").nextPlayer = nextPlayer;
        }
      });
    },

    connect() {
      const that = this;
      const url = "wss://broker.emqx.io:8084/mqtt";
      const topicPrefix = `im.dorian.whos-turn-is-it.${btoa(Alpine.store(
        "localState"
      ).room)}`;

      this._gameStateTopic = `${topicPrefix}.gameState`;
      this._currentPlayerTopic = `${topicPrefix}.currentPlayer`;

      const options = {
        // Clean session
        clean: true,
        connectTimeout: 4000,
        // Authentication
        clientId: Alpine.store("localState").id,
      };

      this._client = mqtt.connect(url, options);

      this._client.on("connect", () => {
        setTimeout(() => {
          if(!that.connected) {
            // reset game if not connected after 5 seconds
            that.clear();
          }
        }, 1000 * 5);

        that._client.subscribe(that._gameStateTopic);
        that._client.subscribe(that._currentPlayerTopic);
      });

      this._client.on("message", (topic, message) => {
        // message is Buffer
        console.log(topic, message.toString());

        if (topic === that._gameStateTopic) {
          const data = JSON.parse(message.toString());
          if (!that.connected) {
            that.connected = true;
          }
          that.players = data.players;
          that.interval = data.interval;
        } else if (topic === that._currentPlayerTopic) {
          const data = JSON.parse(message.toString());
          that.currentPlayer = data.id;
          that.lastPlayerSwitch = data.since;
        }
      });
    },

    giveTurnToNextPlayer() {
      this._updateCurrentPlayer(Alpine.store("localState").nextPlayer);
    },

    disconnect() {
      this._client.end(true);
      this._client = null;
      this.players = [];
      this.currentPlayer = null;
      this.lastPlayerSwitch = null;
      this.connected = false;
      this.isMyTurn = false;

      this._gameStateTopic = null;
      this._currentPlayerTopic = null;

      Alpine.store("localState").nextPlayer = null;
    },

    clear() {
      this._updatePlayers({
        [Alpine.store("localState").id]: Alpine.store("localState").name,
      });
      this._updateCurrentPlayer(Alpine.store("localState").id);
    },

    _updatePlayers(players) {
      if(!this.interval) {
        this.interval = 30;
      }
      this._updateGameState(players, this.interval);
    },

    _updateGameState(players, interval) {
      this._client.publish(
        this._gameStateTopic,
        JSON.stringify({
          version: 1,
          players: players,
          interval: interval,
        }),
        { qos: 1, retain: true }
      );
    },

    _updateCurrentPlayer(id) {
      this._client.publish(
        this._currentPlayerTopic,
        JSON.stringify({
          id: id,
          since: new Date().getTime(),
        }),
        { qos: 1, retain: true }
      );
    }
  });
});