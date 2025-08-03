// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["user", "admin"],
    required: true,
  },
  profileImage: { type: String, default: "" },
  isBanned: { type: Boolean, default: false },
  phoneNumber: { type: String, default: "" },
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
