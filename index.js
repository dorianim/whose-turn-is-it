function JoinForm() {
    return {
        formData: {
            name: ""
        },
        submitForm() {
            Alpine.store("localState").join(this.formData.name)
        }
    }
}

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

function Timer() {
    return {
        time: 0,
        init() {
            setInterval(() => {
                this.time = parseInt((90000 - ((new Date()).getTime() - Alpine.store("remoteState").lastPlayerSwitch)) / 1000);
            }, 1000);
        },
    }
}

document.addEventListener('alpine:init', () => {
    console.log("Alpine.js is ready to go!")


    Alpine.store("localState", {
        joined: false,
        nextPlayer: null,
        name: "",
        id: "",

        init() {
            Alpine.effect(() => {
                if (this.joined) {
                    Alpine.store("remoteState").connect();
                }
            })

            this.restore();
        },

        join(name) {
            this.joined = true;
            this.name = name;
            this.id = uuidv4();
            localStorage.clear();
            localStorage.setItem("joined", this.joined)
            localStorage.setItem("name", this.name);
            localStorage.setItem("id", this.id)
        },

        leave() {
            this.joined = false;
            this.name = "";
            localStorage.clear();
            localStorage.setItem("id", this.id)
            Alpine.store("remoteState").disconnect();
        },

        restore() {
            const joined = localStorage.getItem("joined");
            if (joined) {
                this.joined = true;
                this.name = localStorage.getItem("name");
                this.id = localStorage.getItem("id");
            }
        },
    })

    Alpine.store("remoteState", {
        players: [],
        currentPlayer: null,
        lastPlayerSwitch: 0,
        connected: false,
        isMyTurn: false,
        _client: null,

        init() {
            Alpine.effect(() => {
                if (this.connected && Object.keys(this.players).indexOf(Alpine.store("localState").id) === -1) {
                    this._client.publish('im.dorian.whos-turn-is-it.players', JSON.stringify({
                        [Alpine.store("localState").id]: Alpine.store("localState").name,
                        ...this.players
                    }), { qos: 1, retain: true })
                }
            })

            Alpine.effect(() => {
                this.lastPlayerSwitch = new Date().getTime();
                if (this.currentPlayer == Alpine.store("localState").id) {
                    this.isMyTurn = true;
                }
                else {
                    this.isMyTurn = false;
                }
            })

            Alpine.effect(() => {
                if (Alpine.store("localState").nextPlayer == null || Alpine.store("localState").nextPlayer == Alpine.store("localState").id || !Object.keys(this.players).includes(Alpine.store("localState").nextPlayer)) {
                    const players = Object.keys(this.players).sort();
                    const nextPlayer = players[(players.indexOf(Alpine.store("localState").id) + 1) % players.length]
                    Alpine.store("localState").nextPlayer = nextPlayer;
                }
            })

            Alpine.effect(() => {
                if (this.isMyTurn) {
                    Alpine.store("audio").playDing()
                }
            })
        },

        connect() {
            const url = 'wss://broker.emqx.io:8084/mqtt'

            const options = {
                // Clean session
                clean: true,
                connectTimeout: 4000,
                // Authentication
                clientId: Alpine.store("localState").id,
            }

            this._client = mqtt.connect(url, options)
            const client = this._client;
            this._client.on('connect', function () {
                // Subscribe to a topic
                client.subscribe('im.dorian.whos-turn-is-it.players')
                client.subscribe('im.dorian.whos-turn-is-it.currentPlayer')
            })


            this._client.on('message', function (topic, message) {
                // message is Buffer
                console.log(topic, message.toString())

                if (topic === "im.dorian.whos-turn-is-it.players") {
                    const data = JSON.parse(message.toString());
                    if (!Alpine.store("remoteState").connected) {
                        Alpine.store("remoteState").connected = true;
                    }
                    Alpine.store("remoteState").players = data;
                }
                else if (topic === "im.dorian.whos-turn-is-it.currentPlayer") {
                    Alpine.store("remoteState").currentPlayer = message.toString();
                }
            })
        },

        giveTurnToNextPlayer() {
            this._client.publish('im.dorian.whos-turn-is-it.currentPlayer', Alpine.store("localState").nextPlayer, { qos: 1, retain: true })
        },


        disconnect() {
            this._client.end(true);
        },

        clear() {
            this._client.publish('im.dorian.whos-turn-is-it.players', JSON.stringify({
                [Alpine.store("localState").id]: Alpine.store("localState").name,
            }), { qos: 1, retain: true })
            this._client.publish('im.dorian.whos-turn-is-it.currentPlayer', Alpine.store("localState").id, { qos: 1, retain: true })
        }
    })

    Alpine.store("audio", {
        hasBeenTested: false,
        isAvailable: false,
        isEnabled: false,
        audioPlayer: null,

        init() {
            this.audioPlayer = new Audio('silence.mp3');

            Alpine.effect(() => {
                localStorage.setItem("audio_enabled", this.isEnabled)
            })
        },

        testPermission() {
            if (this.isEnabled) return;
            this.audioPlayer.src = 'silence.mp3';
            this.audioPlayer.play().then(() => {
                this.isAvailable = true
                this.isEnabled = localStorage.getItem("audio_enabled") === false ? false : true
                this.hasBeenTested = true
            }).catch((error) => {
                console.warn("Audio permission not granted!")
                this.isAvailable = false
                this.isEnabled = false
                this.hasBeenTested = true
            })
        },

        playDing() {
            if (!this.isEnabled) return;
            this.playSound('ding.mp3')
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


    })
})