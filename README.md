# 🎨 Sketch Blitz

> A real-time multiplayer drawing and guessing game — one player draws, everyone else guesses, highest score wins.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [Frontend Architecture](#frontend-architecture)
  - [Backend Architecture](#backend-architecture)
  - [Memory vs MongoDB — What Lives Where](#memory-vs-mongodb--what-lives-where)
- [Socket.IO Event Reference](#socketio-event-reference)
  - [Client → Server Events](#client--server-events)
  - [Server → Client Events](#server--client-events)
  - [Full WebSocket Flow](#full-websocket-flow)
- [MongoDB Collections](#mongodb-collections)
- [Game Flow Walkthrough](#game-flow-walkthrough)
- [Deployment](#deployment)

---

## Overview

Sketch Blitz is inspired by skribbl.io. Players join a room using a room code, take turns drawing a secret word on a shared canvas, and race to guess each other's drawings in real time. Points are awarded based on how quickly a player guesses correctly. After all rounds, the leaderboard is saved to MongoDB and the winner is announced.

---

## Features

- Create or join a room using a short room code
- Host controls: rounds, draw time, hints, max players
- Real-time canvas drawing synced to all players via Socket.IO
- Real-time chat and guessing
- Automatic hint system that reveals letters progressively
- Live scoreboard updated after every turn
- Winner screen and final leaderboard
- MongoDB persistence for rooms, word lists, and completed game results

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Real-time | Socket.IO |
| Database | MongoDB + Mongoose |

---

## Project Structure

```
sketch-blitz/
│
├── client/                        # React frontend (Vite)
│   └── src/
│       ├── App.jsx                # Main screen router: home → lobby → game → game over
│       ├── socket.js              # Socket.IO client instance (singleton)
│       └── components/
│           └── CanvasBoard.jsx    # HTML canvas drawing component
│
└── server/                        # Node.js backend
    ├── index.js                   # Entry point — starts HTTP server, connects DB
    ├── app.js                     # Express app setup, middleware, routes
    ├── db.js                      # MongoDB connection via Mongoose
    ├── config/                    # App configuration (PORT, origins, etc.)
    ├── classes/
    │   ├── Room.js                # In-memory room state (players, turn, strokes)
    │   └── Player.js              # In-memory player state (score, socket ID)
    ├── controllers/
    │   └── socketController.js    # All Socket.IO event handlers
    ├── services/
    │   └── gameService.js         # Core game logic: turns, scoring, hints, rounds
    ├── models/                    # Mongoose schemas
    │   ├── WordList.js
    │   ├── RoomRecord.js
    │   └── GameResult.js
    └── routes/                    # REST API routes (health check, etc.)
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB running locally or a MongoDB Atlas URI

### 1. Clone and install

```bash
git clone https://github.com/your-username/sketch-blitz.git
cd sketch-blitz

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../client && npm install
```

### 2. Configure environment

Create a `.env` file inside the `server/` folder:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/sketch-blitz
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
```

> If `MONGO_URI` is not set, the app still runs but skips all MongoDB saving.

### 3. Start the backend

```bash
cd server
node index.js
```

Check it's running: `http://localhost:4000/health`

### 4. Start the frontend

```bash
cd client
npm run dev
```

Open: `http://localhost:5173`

> **Note:** `http://localhost:4000` is the backend API only. The React UI always runs on port `5173` in development.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | No | — | MongoDB connection string. Skips DB if not set. |
| `CLIENT_ORIGIN` | Yes | — | Frontend URL for Socket.IO CORS policy |
| `PORT` | No | `4000` | Port the Express server listens on |

---

## Architecture Deep Dive

### Frontend Architecture

The entire frontend is driven by `App.jsx`, which acts as a screen state machine. At any moment the user is on one of four screens:

```
home  →  lobby  →  game  →  game-over
```

Screen transitions are triggered by Socket.IO events received from the server, not by client-side routing. For example, when the host clicks "Start Game", the server emits `game:start` and all clients simultaneously switch from the lobby screen to the game screen.

**`socket.js`** exports a single Socket.IO client instance created once when the app loads. All components import the same instance — there is never more than one connection per browser tab.

**`CanvasBoard.jsx`** manages the HTML `<canvas>` element. When the local player is the drawer:
- Mouse/touch events are captured and converted to stroke data
- Each stroke segment is emitted to the server via `draw:stroke`
- The stroke is also drawn locally for zero-latency feedback

When the local player is a guesser:
- The canvas is read-only
- Incoming `draw:stroke` events from the server are drawn on the canvas in real time

---

### Backend Architecture

```
index.js
  └── app.js (Express)
  └── db.js (MongoDB)
  └── Socket.IO server
        └── socketController.js
              └── gameService.js
                    ├── Room (in-memory)
                    └── Player (in-memory)
                    └── Mongoose models (MongoDB)
```

**`index.js`** is the entry point. It creates the HTTP server, attaches the Socket.IO server to it, connects to MongoDB, and registers all socket event handlers via `socketController.js`.

**`app.js`** sets up Express middleware, CORS headers, and REST routes. REST is only used for health checks and any future HTTP endpoints — the game itself runs entirely over WebSockets.

**`socketController.js`** is the bridge between raw Socket.IO events and the game logic. It listens for events from clients (join room, start game, send stroke, send guess) and delegates business logic to `gameService.js`. It never holds game state itself.

**`gameService.js`** is the heart of the backend. It handles:
- Selecting a drawer and assigning word choices
- Starting and stopping the draw timer
- Checking guesses and awarding points
- Revealing hint letters at timed intervals
- Advancing to the next turn or ending the game
- Saving final results to MongoDB

**`Room.js` and `Player.js`** are plain JavaScript classes (not Mongoose models). They hold the live game state that changes every few milliseconds — current drawer, stroke history, guesses, scores, timer state. They are instantiated in memory and discarded when the game ends.

---

### Memory vs MongoDB — What Lives Where

| Data | Storage | Reason |
|---|---|---|
| Current drawer | Memory (`Room`) | Changes every turn, needs instant access |
| Canvas strokes | Memory (`Room`) | Updated dozens of times per second |
| Player scores | Memory (`Player`) | Updated on every correct guess |
| Timer state | Memory (`Room`) | Ticks every second, no persistence needed |
| Current guesses | Memory (`Room`) | Ephemeral per-turn data |
| Word list | MongoDB (`wordlists`) | Persists across restarts, seeded once |
| Room settings | MongoDB (`roomrecords`) | Needed for reconnect / record-keeping |
| Final leaderboard | MongoDB (`gameresults`) | Permanent game history |

---

## Socket.IO Event Reference

### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `room:create` | `{ playerName, settings }` | Create a new room and become host |
| `room:join` | `{ roomCode, playerName }` | Join an existing room by code |
| `game:start` | — | Host starts the game (host only) |
| `draw:stroke` | `{ x, y, color, size, type }` | Send a stroke segment to all players |
| `draw:clear` | — | Clear the canvas (drawer only) |
| `chat:guess` | `{ message }` | Send a guess or chat message |
| `word:choose` | `{ word }` | Drawer picks a word from the offered choices |

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `room:created` | `{ roomCode, settings }` | Confirms room creation, returns room code |
| `room:joined` | `{ players, settings }` | Confirms join, sends current room state |
| `room:updated` | `{ players }` | Broadcast when a player joins or leaves |
| `game:start` | `{ firstDrawer }` | Tells all clients to switch to the game screen |
| `turn:start` | `{ drawer, wordLength, round }` | New turn begins; non-drawers get word length only |
| `draw:word-choices` | `{ words: [w1, w2, w3] }` | Sent only to the current drawer |
| `draw:stroke` | `{ x, y, color, size, type }` | Broadcast stroke to all non-drawing clients |
| `draw:clear` | — | Broadcast canvas clear to all clients |
| `chat:message` | `{ player, message, correct }` | Chat message; `correct: true` if it was the right guess |
| `hint:update` | `{ hint }` | Partially revealed word, e.g. `"_ p p _ e"` |
| `score:update` | `{ scores }` | Updated scores after a correct guess |
| `turn:end` | `{ word, scores }` | Turn over; reveals the word and current scores |
| `game:over` | `{ winner, leaderboard }` | Game finished; final results |

---

### Full WebSocket Flow

```
CLIENT                             SERVER
  |                                  |
  |--- room:create ----------------->|  Creates Room + Player in memory
  |<-- room:created -----------------|  Returns room code
  |                                  |
  |--- room:join ------------------->|  Adds Player to Room
  |<-- room:joined ------------------|  Sends current room state
  |<-- room:updated (broadcast) -----|  All players notified
  |                                  |
  |--- game:start ------------------>|  (host only)
  |<-- game:start (broadcast) -------|  All clients switch to game screen
  |                                  |
  |<-- turn:start (broadcast) -------|  Announces drawer + round number
  |<-- draw:word-choices ------------|  Only sent to the drawer
  |                                  |
  |--- word:choose ----------------->|  Drawer picks a word
  |                                  |  Server starts draw timer
  |                                  |  Server starts hint interval
  |--- draw:stroke ----------------->|  Drawer sends stroke data
  |<-- draw:stroke (broadcast) ------|  All guessers receive the stroke
  |                                  |
  |--- chat:guess ------------------>|  Guesser sends a guess
  |                                  |  gameService checks the guess
  |<-- chat:message (broadcast) -----|  Wrong: shown as normal chat
  |<-- score:update (broadcast) -----|  Correct: scores updated
  |<-- hint:update (interval) -------|  Letters revealed over time
  |                                  |
  |                                  |  [Timer ends OR all guessed]
  |<-- turn:end (broadcast) ---------|  Word revealed, scores shown
  |                                  |
  |                                  |  [More turns remaining]
  |<-- turn:start (broadcast) -------|  Next drawer selected
  |                                  |
  |                                  |  [All rounds complete]
  |<-- game:over (broadcast) --------|  Winner + leaderboard
  |                                  |  gameService saves to MongoDB
```

---

## MongoDB Collections

### `wordlists`

Stores drawing words. On first server startup, if the collection is empty, the server seeds a default set of words automatically.

```json
{
  "word": "elephant",
  "category": "animals",
  "difficulty": "medium"
}
```

### `roomrecords`

Stores room configuration and lifecycle status. Status values: `lobby`, `drawing`, `round_end`, `finished`.

```json
{
  "roomCode": "XKCD",
  "status": "finished",
  "settings": {
    "rounds": 3,
    "drawTime": 80,
    "maxPlayers": 8,
    "hints": true
  },
  "createdAt": "2024-01-01T12:00:00Z"
}
```

### `gameresults`

Stores the permanent record of a completed game.

```json
{
  "roomId": "...",
  "winner": "alice",
  "leaderboard": [
    { "name": "alice", "score": 420 },
    { "name": "bob",   "score": 310 }
  ],
  "settings": { "rounds": 3, "drawTime": 80 },
  "completedAt": "2024-01-01T12:15:00Z"
}
```

---

## Game Flow Walkthrough

1. **Home screen** — Player enters their name and either creates a room or enters a room code to join.
2. **Lobby** — All players wait here. The host sees room settings controls. Everyone sees the player list update live as others join.
3. **Host starts the game** — Server picks the first drawer (typically the host), sends `turn:start` to all clients.
4. **Word selection** — Server sends three word choices to the drawer only. Drawer picks one.
5. **Drawing phase** — Drawer uses the canvas, strokes stream to all guessers in real time. Hints reveal one letter at a time on an interval.
6. **Guessing** — Guessers type in the chat. Server compares each guess (case-insensitive, trimmed) to the secret word. Correct guessers earn points (more points for faster guesses). The drawer also earns points for each correct guess.
7. **Turn end** — Triggered when: (a) the timer expires, or (b) everyone has guessed correctly. The word is revealed to all players.
8. **Next turn** — Server selects the next drawer. After all players have drawn in a round, the round counter increments.
9. **Game over** — After all configured rounds, `game:over` is broadcast. The leaderboard and winner are displayed and saved to MongoDB.

---

## Deployment

### Build the frontend

```bash
cd client
npm run build
```

This outputs to `client/dist/`. The Express server is already configured to serve this folder in production, so a single server handles both API and UI.

### Production environment variables

```bash
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/sketch-blitz
CLIENT_ORIGIN=https://your-domain.com
PORT=8080
```

### Live URL

> 🚀 [Add your deployed URL here]

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss what you'd like to change.

---

## License

MIT