// models/Payment.js
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    // Link to the Order model. Each payment should ideally be associated with an order.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order", // Ensure this references your Order model
      required: true, // A payment must be linked to an order
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    clientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      // Updated regex for more general email validation
      match: [
        /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
        "Please fill a valid email address",
      ],
    },
    amount: {
      type: Number,
      required: true,
      min: 0, // Amount cannot be negative
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["easypaisa", "jazzcash", "bankTransfer", "paypal", "googlePay"], // Allowed payment methods
      trim: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true, // Ensures no duplicate transaction IDs
      trim: true,
    },
    screenshotUrl: {
      type: String,
      required: false, // Screenshot might be optional or not applicable for all payment types
      trim: true,
    },
    remarks: {
      type: String,
      default: "No remarks.",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"], // Specific statuses for payments
      default: "Pending",
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Mongoose will automatically add `createdAt` and `updatedAt` fields
  }
);

// Create a compound unique index to ensure that a combination of transactionId and paymentMethod is unique.
// This helps prevent duplicate payment entries, even if transaction IDs might overlap across different methods.
PaymentSchema.index({ transactionId: 1, paymentMethod: 1 }, { unique: true });

const Payment = mongoose.model("Payment", PaymentSchema);
module.exports = Payment;
