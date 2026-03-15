const { isDatabaseReady } = require("../db");

function getHealth(_req, res) {
  res.json({
    ok: true,
    mongodbConnected: isDatabaseReady(),
  });
}

module.exports = {
  getHealth,
};


