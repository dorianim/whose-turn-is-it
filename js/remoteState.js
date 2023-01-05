document.addEventListener("alpine:init", () => {
  Alpine.store("remoteState", {
    players: [],
    interval: null,
    currentPlayer: null,
    lastPlayerSwitch: null,
    connected: false,
    isMyTurn: false,
    skipMe: false,

    _client: null,
    _currentPlayerTopic: null,
    _gameStateTopic: null,
    _lastGameState: null,
    _key: null,
    _iv: null,

    init() {
      Alpine.effect(() => {
        if (
          this.connected &&
          Object.keys(this.players).indexOf(Alpine.store("localState").id) ===
            -1
        ) {
          this._updatePlayers({
            [Alpine.store("localState").id]: Alpine.store("localState").name,
            ...this.players,
          });
        }
      });

      Alpine.effect(() => {
        const myTurn = this.currentPlayer == Alpine.store("localState").id
        if (myTurn && !this.skipMe) {
          this.isMyTurn = true;
          Alpine.store("audio").playDing();
        } 
        else if(myTurn && this.skipMe) {
          this.giveTurnToNextPlayer()
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

      Alpine.effect(() => {
        if (this.connected) {
          this.updateInterval(this.interval);
        }
      });
    },

    connect() {
      const that = this;
      const url = "wss://broker.emqx.io:8084/mqtt";
      const keySize = 512;
      const ivSize = 128;
      // derive key from room name
      this._key = CryptoJS.PBKDF2(Alpine.store("localState").room, url, {
        keySize: keySize / 32,
        iterations: 1000,
      });
      // random iv
      this._iv = CryptoJS.PBKDF2(Alpine.store("localState").room, url, {
        keySize: ivSize / 32,
        iterations: 5000,
      });

      const topicPrefix = `im.dorian.whose-turn-is-it.${btoa(
        Alpine.store("localState").room
      )}`;
      this._gameStateTopic = CryptoJS.SHA256(
        this._encrypt(`${topicPrefix}.gameState`)
      ).toString();
      this._currentPlayerTopic = CryptoJS.SHA256(
        this._encrypt(`${topicPrefix}.currentPlayer`)
      ).toString();

      console.log("Connecting to MQTT broker...");
      console.log("Game state topic:", this._gameStateTopic);
      console.log("Current player topic:", this._currentPlayerTopic);

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
          if (!that.connected) {
            // reset game if not connected after 5 seconds
            that.clear();
          }
        }, 1000 * 4);

        that._client.subscribe(that._gameStateTopic);
        that._client.subscribe(that._currentPlayerTopic);
      });

      this._client.on("message", (topic, message) => {
        // message is Buffer
        message = that._decrypt(message.toString());
        const data = JSON.parse(JSON.parse(message));

        if (topic === that._gameStateTopic) {
          if (data.version !== 1 || !data.players || !data.interval) {
            console.log("Invalid game state, resetting...");
            that.clear();
            return;
          }
          if (!that.connected) {
            that.connected = true;
          }
          that._lastGameState = data;
          that.players = data.players;
          that.interval = data.interval;
        } else if (topic === that._currentPlayerTopic) {
          if (!data.id || !data.since) {
            console.log("Invalid current player, resetting...");
            that.clear();
            return;
          }
          if (data.since < that.lastPlayerSwitch) {
            return;
          }
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

    updateInterval(interval) {
      this._updateGameState(this.players, interval);
    },

    _updatePlayers(players) {
      if (!this.interval) {
        this.interval = 30;
      }
      this._updateGameState(players, this.interval);
    },

    _updateGameState(players, interval) {
      const newGameState = {
        version: 1,
        players: players,
        interval: interval,
      };

      if (
        this._lastGameState &&
        JSON.stringify(this._lastGameState) === JSON.stringify(newGameState)
      )
        return;

      console.log("Updating game state:", newGameState);
      this._client.publish(
        this._gameStateTopic,
        this._encrypt(JSON.stringify(newGameState)),
        {
          qos: 1,
          retain: true,
        }
      );
    },

    _updateCurrentPlayer(id) {
      this._client.publish(
        this._currentPlayerTopic,
        this._encrypt(
          JSON.stringify({
            id: id,
            since: new Date().getTime(),
          })
        ),
        { qos: 1, retain: true }
      );
    },

    _encrypt(data) {
      return CryptoJS.AES.encrypt(JSON.stringify(data), this._key, {
        iv: this._iv,
      }).toString();
    },

    _decrypt(data) {
      const decrypted = CryptoJS.AES.decrypt(data, this._key, { iv: this._iv });
      return decrypted.toString(CryptoJS.enc.Utf8);
    },
  });
});
