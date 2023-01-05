function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

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
    },
  };
}

function RoomForm() {
  return {
    formData: {
      interval: null,
    },
    init() {
      this.formData.interval = Alpine.store("remoteState").interval;
    },
    submitForm() {
      Alpine.store("remoteState").updateInterval(this.formData.interval);
    },
  };
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
          this.time = Math.floor(
            (Alpine.store("remoteState").interval * 1000 -
              (new Date().getTime() - lastPlayerSwitch)) /
              1000
          );
        }
      }, 100);
    },
  };
}

document.addEventListener("alpine:init", () => {
  console.log("Alpine.js is ready to go!");

  Alpine.store("audio", {
    hasBeenTested: false,
    isAvailable: false,
    isEnabled: false,
    audioPlayer: null,

    init() {
      this.audioPlayer = new Audio("sound/silence.mp3");

      Alpine.effect(() => {
        localStorage.setItem("audio_enabled", this.isEnabled);
      });
    },

    testPermission() {
      if (this.isEnabled) return;
      this.audioPlayer.src = "sound/silence.mp3";
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
      this.playSound("sound/ding.mp3");
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
