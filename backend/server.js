const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
const User = require("./models/User");
const { setIO } = require("./socket/ioInstance");
const { registerUser, removeUserSocket } = require("./socket/socketManager");

dotenv.config();
connectDB();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Enhanced CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());

console.log(`[Server] CORS configured for origin: ${corsOptions.origin}`);

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const ip = req.ip;
  
  console.log(`[${timestamp}] ${method} ${path} (from ${ip})`);
  
  if (path.includes("/auth/google")) {
    console.log(`[OAuth] Request body keys:`, Object.keys(req.body));
  }
  
  next();
});

// Serve uploaded files
app.use("/uploads", express.static(uploadsDir));

// Import Routes
const authRoutes = require("./routes/authRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const studyMaterialRoutes = require("./routes/studyMaterialRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const peerSessionRoutes = require("./routes/peerSessionRoutes");
const testRoutes = require("./routes/testRoutes");
const { handleRecordTabSwitch } = require("./controllers/testController");

// Use Routes
app.use("/api/auth", authRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/materials", studyMaterialRoutes);
app.use("/api/doubts", require("./routes/doubtRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/analytics", analyticsRoutes);
app.use("/api/peer-sessions", peerSessionRoutes);
app.use("/api/tests", testRoutes);

app.get("/", (req, res) => {
  res.send("CollabClass API Running...");
});

// HTTP Server
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

setIO(io);

// JWT Authentication for Socket
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Not authorized, no token"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return next(new Error("User not found"));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error("Not authorized, token failed"));
  }
});

// Connection lifecycle
io.on("connection", (socket) => {
  const userId = socket.user._id.toString();
  registerUser(userId, socket.id);
  console.log(`[Socket] User ${userId} connected (socket: ${socket.id})`);

  socket.on("test_tab_switch", async ({ attemptId }, ack) => {
    try {
      const result = await handleRecordTabSwitch({
        attemptId,
        userId: socket.user._id,
        req: {
          headers: socket.handshake.headers,
          ip: socket.handshake.address,
          socket: { remoteAddress: socket.handshake.address },
        },
      });
      if (typeof ack === "function") {
        ack(result.body);
      }
    } catch (error) {
      if (typeof ack === "function") {
        ack({ message: "Failed to record tab switch" });
      }
    }
  });

  socket.on("disconnect", () => {
    removeUserSocket(socket.id);
    console.log(`[Socket] User ${userId} disconnected (socket: ${socket.id})`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ CollabClass Server Started`);
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🔐 Google OAuth Enabled`);
  console.log(`${PORT === 5000 ? '⚡ Development Mode' : '🚀 Production Mode'}`);
  console.log(`${'='.repeat(60)}\n`);
});

module.exports = { app, server, io };
