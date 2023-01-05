function JoinForm() {
  return {
    formData: {
        name: "",
        room: "",
    },
    init() {
        this.formData.name = Alpine.store("localState").name;
        this.formData.room = Alpine.store("localState").room;
    },
    submitForm() {
        Alpine.store("localState").join(this.formData.name, this.formData.room);
    }
}
}

function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

function Timer() {
  return {
    time: 0,
    init() {
      setInterval(() => {
        const lastPlayerSwitch = Alpine.store("remoteState").lastPlayerSwitch;
        
        if (!lastPlayerSwitch) {
          this.time = null;
        } else {
          this.time = parseInt(
            (90000 - (new Date().getTime() - lastPlayerSwitch)) / 1000
          );
        }
      }, 100);
    },
  };
}

document.addEventListener("alpine:init", () => {
  console.log("Alpine.js is ready to go!");

  Alpine.store("localState", {
    room: null,
    nextPlayer: null,
    name: "",
    id: "",

    init() {
      Alpine.effect(() => {
        const remoteState = Alpine.store("remoteState");
        if (this.room) {
          remoteState.connect();
        }
        else if (remoteState && remoteState.connected){
          remoteState.disconnect();
        }
      });

      this.restore();

      Alpine.effect(() => {
        // write stuff to local storage
        if (this.room) {
          localStorage.setItem("room", this.room);
        } else {
          localStorage.removeItem("room");
        }

        localStorage.setItem("name", this.name);
        localStorage.setItem("id", this.id);
      });
    },

    join(name, room) {
      this.room = room;
      this.name = name;
    },

    leave() {
      this.room = null;
    },

    restore() {
      this.id = localStorage.getItem("id");
      if(!this.id) {
        this.id = uuidv4();
      }

      this.name = localStorage.getItem("name");
      this.room = localStorage.getItem("room");
    },
  });

  Alpine.store("remoteState", {
    players: [],
    currentPlayer: null,
    lastPlayerSwitch: null,
    connected: false,
    isMyTurn: false,

    _client: null,
    _playersTopic: null,
    _currentPlayerTopic: null,
    _gameStateTopic: null,

    init() {
      Alpine.effect(() => {
        if (
          this.connected &&
          Object.keys(this.players).indexOf(Alpine.store("localState").id) ===
            -1
        ) {
          this._client.publish(
            this._playersTopic,
            JSON.stringify({
              [Alpine.store("localState").id]: Alpine.store("localState").name,
              ...this.players,
            }),
            { qos: 1, retain: true }
          );
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
      this._playersTopic = `${topicPrefix}.players`;
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
        // Subscribe to a topic
        that._client.subscribe(that._playersTopic);
        that._client.subscribe(that._currentPlayerTopic);
      });

      this._client.on("message", (topic, message) => {
        // message is Buffer
        console.log(topic, message.toString());

        if (topic === that._playersTopic) {
          const data = JSON.parse(message.toString());
          if (!Alpine.store("remoteState").connected) {
            Alpine.store("remoteState").connected = true;
          }
          Alpine.store("remoteState").players = data;
        } else if (topic === that._currentPlayerTopic) {
          const data = JSON.parse(message.toString());
          Alpine.store("remoteState").currentPlayer = data.id;
          Alpine.store("remoteState").lastPlayerSwitch = data.since;
        }
      });
    },

    giveTurnToNextPlayer() {
      this._client.publish(
        this._currentPlayerTopic,
        JSON.stringify({
          id: Alpine.store("localState").nextPlayer,
          since: new Date().getTime(),
        }),
        { qos: 1, retain: true }
      );
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
      this._playersTopic = null;
      this._currentPlayerTopic = null;

      Alpine.store("localState").nextPlayer = null;
    },

    clear() {
      this._client.publish(
        this._playersTopic,
        JSON.stringify({
          [Alpine.store("localState").id]: Alpine.store("localState").name,
        }),
        { qos: 1, retain: true }
      );
      this._client.publish(
        this._currentPlayerTopic,
        JSON.stringify({
          id: Alpine.store("localState").id,
          since: new Date().getTime(),
        }),
        { qos: 1, retain: true }
      );
    },
  });

  Alpine.store("audio", {
    hasBeenTested: false,
    isAvailable: false,
    isEnabled: false,
    audioPlayer: null,

    init() {
      this.audioPlayer = new Audio("silence.mp3");

      Alpine.effect(() => {
        localStorage.setItem("audio_enabled", this.isEnabled);
      });
    },

    testPermission() {
      if (this.isEnabled) return;
      this.audioPlayer.src = "silence.mp3";
      this.audioPlayer
        .play()
        .then(() => {
          this.isAvailable = true;
          this.isEnabled =
            localStorage.getItem("audio_enabled") === false ? false : true;
          this.hasBeenTested = true;
        })
        .catch((error) => {
          console.warn("Audio permission not granted!");
          this.isAvailable = false;
          this.isEnabled = false;
          this.hasBeenTested = true;
        });
    },

    playDing() {
      if (!this.isEnabled) return;
      this.playSound("ding.mp3");
    },

    playSound(soundFile) {
      if (!this.audioPlayer.paused || !this.isAvailable) {
        return;
      }
      if (!this.audioPlayer.src.endsWith(soundFile)) {
        this.audioPlayer.src = soundFile;
      }
      this.audioPlayer.play();
    },
  });
});
