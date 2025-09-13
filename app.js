// server.js
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

// Routes
import registerRoute from "./routes/auth/register.js";
import loginRoute from "./routes/auth/login.js";
import forgotRoute from "./routes/auth/forgotPassword.js";
import commonUserRoute from "./routes/common/commonUser.js";
import adminLotteryRoute from "./routes/admin/adminLottery.js";
import commonLotteryTypeRoute from "./routes/common/commonLotteryType.js";
import commonLotteryRoute from "./routes/common/commonLottery.js";
import adminUserRoute from "./routes/admin/adminUser.js";
import userTicketRoute from "./routes/user/userTicket.js";
import userLotteryRoute from "./routes/user/userLottery.js";
import walletRoute from "./routes/common/wallet.js";
import adminWalletRoute from "./routes/admin/adminWallet.js";

// Cron jobs
import { startCronJobs } from "./cron-jobs/cronJobs.js";

const app = express();

// --------------------
// ✅ CORS Config
// --------------------
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
  : [];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(express.json());

// --------------------
// ✅ HTTP + WebSocket
// --------------------
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🔌 A user connected");
  socket.emit("newMessage", "Welcome from socket server!");
});

// --------------------
// ✅ Routes
// --------------------

// Public Auth
app.use("/api/auth", registerRoute);
app.use("/api/auth", loginRoute);
app.use("/api/auth", forgotRoute);

// Common
app.use("/api", commonUserRoute);
app.use("/api", commonLotteryRoute);
app.use("/api", userTicketRoute);
app.use("/api", walletRoute);
app.use("/api", commonLotteryTypeRoute);

// User
app.use("/api/user", userLotteryRoute);

// Admin
app.use("/api/admin", adminUserRoute);
app.use("/api/admin", adminLotteryRoute);
app.use("/api/admin", adminWalletRoute);

// Health Check / Test
app.get("/api/someData", (req, res) => {
  res.json({ message: "Hello World" });
});

// --------------------
// ✅ MongoDB + Start Server
// --------------------
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lottme"; // fallback for local dev

mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected:", MONGO_URI);

    // start cron jobs after DB is connected
    startCronJobs();

    // start express + websocket server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log("🌍 Allowed CORS origins:", allowedOrigins);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB", err.message);
    process.exit(1); // stop if DB fails
  });
