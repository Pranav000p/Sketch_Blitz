const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { CLIENT_ORIGIN } = require("./config/gameConfig");
const healthRoutes = require("./routes/healthRoutes");

function createApp() {
  const app = express();
  const clientDistPath = path.join(__dirname, "../client/dist");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  app.use(cors({ origin: CLIENT_ORIGIN }));
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
