require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const createApp = require("./app");
const { connectToDatabase } = require("./db");
const { PORT } = require("./config/gameConfig");
const { seedWordsIfNeeded } = require("./services/wordService");
const registerGameSocketHandlers = require("./controllers/socketController");

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.endsWith(".vercel.app")) return true;
  if (origin === "https://sketch-blitz.vercel.app") return true;
  return false;
}

async function startServer() {
  await connectToDatabase();

  try {
    await seedWordsIfNeeded();
  } catch (error) {
    console.error("Could not seed words:", error.message);
  }

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      methods: ["GET", "POST"],
    },
  });

  const rooms = new Map();
  registerGameSocketHandlers(io, rooms);

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();