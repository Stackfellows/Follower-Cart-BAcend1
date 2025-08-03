// models/BlogPost.js
const mongoose = require("mongoose");

const BlogPostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Ensure blog post titles are unique
    },
    content: {
      type: String,
      required: true,
    },
    author: {
      type: String,
      default: "Admin", // Default author if not specified
      trim: true,
    },
    // Optional: A short summary for display in blog listings
    snippet: {
      type: String,
      trim: true,
      maxlength: [300, "Snippet cannot be more than 300 characters"],
    },
    imageUrl: {
      type: String,
      default: "", // Optional: URL for a featured image
      trim: true,
    },
    // You can add categories, tags, etc.
    // categories: [{ type: String, trim: true }],
    // tags: [{ type: String, trim: true }],
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Pre-save hook to generate snippet if not provided
BlogPostSchema.pre("save", function (next) {
  if (!this.snippet && this.content) {
    this.snippet =
      this.content.substring(0, 150) + (this.content.length > 150 ? "..." : "");
  }
  next();
});

const BlogPost = mongoose.model("BlogPost", BlogPostSchema);

module.exports = BlogPost;
