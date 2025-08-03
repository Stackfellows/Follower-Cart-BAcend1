// Load environment variables from .env file
require("dotenv").config(); // THIS MUST BE THE VERY FIRST LINE

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const nodemailer = require("nodemailer"); // RE-ADDED: Nodemailer import

// Initialize Express app
const app = express();

// ===================================
// Middleware Configuration
// ===================================

// Parse JSON request bodies
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// CORS (Cross-Origin Resource Sharing) configuration
const corsOptions = {
  origin: "*", // Allows requests from any origin. For production, specify your frontend's domain(s).
  methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"], // Allowed HTTP methods
  credentials: true, // Allow cookies and authorization headers to be sent
};
app.use(cors(corsOptions));

// ===================================
// Database Connection
// ===================================

// Connect to MongoDB using Mongoose
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// ===================================
// Cloudinary Configuration
// ===================================

// Configure Cloudinary with credentials from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===================================
// Nodemailer Configuration (RE-ENABLED)
// ===================================
let transporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail", // Using Gmail service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      // Required for some SMTP servers, especially if not using SSL on port 465
      rejectUnauthorized: false, // This can be set to true in production if you have a valid SSL cert
    },
  });

  transporter.verify(function (error, success) {
    if (error) {
      console.error("❌ Nodemailer transporter verification failed:", error);
      console.error(
        "Please check EMAIL_USER and EMAIL_PASS in your .env file."
      );
      console.error(
        "For Gmail, you might need an App Password if 2FA is enabled."
      );
      console.error("Error details:", error.response || error.message); // More detailed error
    } else {
      console.log("✅ Nodemailer transporter ready for sending emails");
    }
  });
} else {
  console.warn(
    "⚠️ Nodemailer: EMAIL_USER or EMAIL_PASS not set in .env. Email notifications will be disabled."
  );
}

// ===================================
// Route Handling
// ===================================

// Import and use your authentication and order routes
const authRoutes = require("./routes/auth.js");

// Pass the transporter to your authRoutes module
app.use("/followerApi", authRoutes(transporter)); // RE-ADDED: Passing transporter

// Basic root route for API health check
app.get("/", (req, res) => res.send("API is working correctly!"));

// ===================================
// Global Error Handling Middleware
// ===================================
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  res.status(500).json({
    msg: "An unexpected server error occurred.",
    error: err.message,
  });
});

// ===================================
// Server Start
// ===================================

const PORT = process.env.PORT || 5000;

// Start the server
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Server running on port ${PORT} (http://0.0.0.0:${PORT})`)
);
