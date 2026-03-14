# Sketch Blitz

Sketch Blitz is a simple multiplayer drawing and guessing game inspired by skribbl.io. One player draws, the others guess in real time, and the player with the highest score wins after all rounds are finished.

## Features

- Create or join a room with a room code
- Host can choose room settings like rounds, draw time, hints, and max players
- Real-time drawing using Socket.IO
- Real-time guessing and chat
- Scoreboard and winner screen
- Hints that reveal letters over time
- MongoDB storage for rooms, words, and completed game results

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Realtime: Socket.IO
- Database: MongoDB + Mongoose

## Project Structure

```text
client/
  src/
    App.jsx
    socket.js
    components/CanvasBoard.jsx

server/
  index.js
  db.js
  models/
```

## How To Run Locally

### 1. Install dependencies

Open two terminals and install packages:

```bash
cd server
npm install

cd ../client
npm install
```

### 2. Add MongoDB connection

Create a `.env` file inside the `server` folder or set environment variables in your terminal.

Example values:

```bash
MONGO_URI=mongodb://127.0.0.1:27017/sketch-blitz
CLIENT_ORIGIN=http://localhost:5173
PORT=4000
```

If `MONGO_URI` is not set, the app still runs, but MongoDB saving is skipped.

### 3. Start the backend

```bash
cd server
node index.js
```

Open `http://localhost:4000/health` to check the backend.

### 4. Start the frontend

```bash
cd client
npm run dev
```

Open `http://localhost:5173`.

## Important Note About 404

If you open `http://localhost:4000` during development, that is only the backend server. The React app runs on `http://localhost:5173`.

If you want the backend to serve the frontend in production, build the client first:

```bash
cd client
npm run build
```

After that, the `server` can serve the built React app from `client/dist`.

## MongoDB Collections Used

### 1. `wordlists`

Stores drawing words. The server seeds default words into MongoDB the first time it connects if the collection is empty.

### 2. `roomrecords`

Stores room settings and room status such as lobby, drawing, round_end, and finished.

### 3. `gameresults`

Stores finished game data like:

- room id
- winner
- leaderboard
- room settings
- completed date

## Architecture Overview

### Frontend

- `App.jsx` handles the screens: home, lobby, game, and game over
- `CanvasBoard.jsx` handles drawing on the HTML canvas
- `socket.js` connects the React app to the backend with Socket.IO

### Backend

- `index.js` stores live room state in memory for fast realtime updates
- Socket events handle room creation, joining, drawing, guesses, and rounds
- Mongoose models save only permanent data to MongoDB

### Why some data is in memory and some data is in MongoDB

Live game state like timer, current drawer, strokes, and current guesses changes very fast, so it stays in memory.

Permanent data like room settings, word list, and finished game results is saved to MongoDB so it survives server restarts.

## WebSocket Flow

1. Player creates or joins a room
2. Host starts the game
3. Server chooses the next drawer
4. Drawer receives word choices
5. Drawer picks a word and starts drawing
6. Drawing strokes are broadcast to all players
7. Guessers send guesses through chat
8. Server checks the guess and gives points
9. Round ends when time is over or everyone guesses
10. Final leaderboard is shown and saved to MongoDB

## Deliverables Status

- Working multiplayer room flow: done
- Realtime drawing: done
- Guessing and scoring: done
- Hints: done
- MongoDB persistence: done
- README with setup steps: done
- Live deployment URL: add after deployment

## Live Deployment URL

[Add your deployed URL here]
