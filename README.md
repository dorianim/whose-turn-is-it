<h1 align="center">
    Whose turn is it?
</h1>

<p align="center">
    <a href="https://www.gnu.org/licenses/agpl-3.0">
        <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" />
    </a>
</p>

Simple webapp to keep track of who is currently playing and how much time they have left. Originally designed for [Rummikub](https://de.wikipedia.org/wiki/Rummikub).  
Please note: this is by no means perfect and just meant to be a simple solution to a simple problem :)

# Featues
- Create an independent room
- Play with multiple players across multiple devices
- Decentralized
- End-to-end encrypted

# How it works
The browsers of all players connect to a common MQTT server and communicate through that server. An AES Key is derived from the room name, which is then used to encrypt all communication.

# Technologies
- [MQTT.js](https://github.com/mqttjs/MQTT.js)
- [Alpine.js](https://alpinejs.dev/)
- [Pico.css](https://picocss.com/)
- [crypto-js](https://github.com/brix/crypto-js)