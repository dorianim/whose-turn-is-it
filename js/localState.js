document.addEventListener("alpine:init", () => {
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
        } else if (remoteState && remoteState.connected) {
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
      if (!this.id) {
        this.id = uuidv4();
      }

      this.name = localStorage.getItem("name");
      this.room = localStorage.getItem("room");
    },
  });
});
