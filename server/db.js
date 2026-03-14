const mongoose = require("mongoose");

let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return true;
  }

  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.log("MONGO_URI not found. Running without MongoDB.");
    return false;
  }

  try {
    await mongoose.connect(mongoUri);
    isConnected = true;
    console.log("MongoDB connected");
    return true;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    return false;
  }
}

function isDatabaseReady() {
  return isConnected;
}

module.exports = {
  connectToDatabase,
  isDatabaseReady,
};
