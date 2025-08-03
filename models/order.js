// models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [
        /^(\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+)$/, // Corrected regex for email validation
        "Please fill a valid email address",
      ],
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    postLink: {
      type: String,
      trim: true,
      default: "",
    },
    profileLink: {
      type: String,
      required: true,
      trim: true,
    },
    requiredFollowers: {
      type: Number,
      required: true,
      min: [1, "Required followers must be at least 1"],
    },
    platform: {
      type: String,
      required: true,
      trim: true,
      enum: ["Instagram", "TikTok", "YouTube", "Facebook", "Twitter", "Other"],
    },
    socialId: {
      type: String,
      trim: true,
      default: "",
    },
    service: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Followers",
        "Likes",
        "Views",
        "Subscribers",
        "Comments",
        "Shares",
        "Watch Time",
        "Live Stream",
        "Page Likes",
        "Female Followers",
        "English Followers",
        "Reels Views",
        "Story Views", // <--- ADDED THIS ENUM VALUE
        "Other",
      ], // Example services
    },
    price: {
      type: Number,
      required: true,
      min: [0, "Price cannot be negative"],
    },
    status: {
      type: String,
      enum: [
        "Pending",
        "Payment Pending",
        "In Progress",
        "Completed",
        "Cancelled",
        "Refunded",
        "Failed",
      ],
      default: "Pending",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
