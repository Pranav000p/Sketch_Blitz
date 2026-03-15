const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const healthRoutes = require("./routes/healthRoutes");

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.endsWith(".vercel.app")) return true;
  return false;
}

function createApp() {
  const app = express();
  const clientDistPath = path.join(__dirname, "../client/dist");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    }
  }));
  app.use(express.json());
  app.use(healthRoutes);

  if (fs.existsSync(clientIndexPath)) {
    app.use(express.static(clientDistPath));
    app.get("*", (_req, res) => {
      res.sendFile(clientIndexPath);
    });
  } else {
    app.get("/", (_req, res) => {
      res.status(200).send(
        "Sketch Blitz backend is running. In development, start the React app with 'npm run dev' inside the client folder and open http://localhost:5173"
      );
    });
  }

  return app;
}

module.exports = createApp;