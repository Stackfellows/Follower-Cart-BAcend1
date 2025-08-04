const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/order");
const Payment = require("../models/Payment");
const BlogPost = require("../models/BlogPost");
const Refund = require("../models/Refund"); // NEW: Import the Refund model
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// This module exports a function that accepts the Nodemailer 'transporter' object.
module.exports = (transporter) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // Helper function to send email using the passed transporter
  const sendEmail = async (to, subject, htmlContent) => {
    if (!transporter) {
      console.warn("Nodemailer transporter is not configured. Email not sent.");
      return { success: false, error: "Email transporter not available." };
    }
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        html: htmlContent,
      };
      let info = await transporter.sendMail(mailOptions);
      console.log("Message sent: %s", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      return { success: false, error: error.message };
    }
  };

  // ============================= // User Management Routes // =============================
  // ... (Your existing user management routes here) ...

  // ============================= // Order Management Routes // =============================
  // ... (Your existing order management routes here) ...

  // ============================= // Refund Routes // =============================

  // POST /followerApi/refundRequests - Submit a new refund request
  router.post("/refundRequests", async (req, res) => {
    try {
      const { orderId, clientEmail, clientName, amount, reason } = req.body;
      if (!orderId || !clientEmail || !clientName || !amount || !reason) {
        return res
          .status(400)
          .json({ msg: "All refund request fields are required." });
      }

      // Check if order exists and is not already refunded
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ msg: "Order not found." });
      }
      if (order.status === "Refunded") {
        return res
          .status(409)
          .json({ msg: "This order has already been refunded." });
      }

      const newRefundRequest = await Refund.create({
        userId: order.userId, // Link refund to the user who placed the order
        orderId,
        clientEmail,
        clientName,
        amount,
        reason,
        status: "Pending",
      });

      // Update the order status to "Refund Pending"
      await Order.findByIdAndUpdate(orderId, { status: "Refund Pending" });

      res.status(201).json({
        msg: "Refund request submitted successfully! We will review it shortly.",
        request: newRefundRequest,
      });
    } catch (err) {
      console.error("Refund Request Error:", err);
      res.status(500).json({
        msg: "Server error during refund request",
        error: err.message,
      });
    }
  });

  // GET /followerApi/allRefundRequests - Get all refund requests (Admin only)
  router.get("/allRefundRequests", async (req, res) => {
    try {
      // Find all refund requests and populate the associated order details
      const refundRequests = await Refund.find()
        .populate("orderId")
        .sort({ createdAt: -1 });

      res.status(200).json({ requests: refundRequests });
    } catch (err) {
      console.error("Error fetching refund requests:", err);
      res.status(500).json({
        msg: "Server error fetching refund requests",
        error: err.message,
      });
    }
  });

  // PATCH /followerApi/updateRefund/:id - Approve or Reject a refund request
  router.patch("/updateRefund/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminRemarks } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid refund ID format." });
      }

      if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({
          msg: "Invalid status provided. Must be 'Approved' or 'Rejected'.",
        });
      }

      const refundRequest = await Refund.findByIdAndUpdate(
        id,
        { status, adminRemarks },
        { new: true, runValidators: true }
      ).populate("orderId");

      if (!refundRequest) {
        return res.status(404).json({ msg: "Refund request not found." });
      }

      // Update the associated order's status based on the refund action
      if (status === "Approved") {
        await Order.findByIdAndUpdate(refundRequest.orderId, {
          status: "Refunded",
        });
        // Send a notification email to the user
        const emailSubject = "Your Refund Request Has Been Approved";
        const emailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #10B981;">Hello ${refundRequest.clientName},</h2>
            <p>Your refund request for order ID <strong>${
              refundRequest.orderId._id
            }</strong> has been successfully approved.</p>
            <p>Amount: <strong>${refundRequest.amount}</strong></p>
            <p>Admin Remarks: ${adminRemarks || "N/A"}</p>
            <p>The refund will be processed shortly. If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>The Team</p>
          </div>
        `;
        sendEmail(refundRequest.clientEmail, emailSubject, emailHtmlContent);
      } else if (status === "Rejected") {
        await Order.findByIdAndUpdate(refundRequest.orderId, {
          status: "Refund Rejected",
        });
        // Send a notification email to the user
        const emailSubject = "Your Refund Request Status";
        const emailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #EF4444;">Hello ${refundRequest.clientName},</h2>
            <p>We regret to inform you that your refund request for order ID <strong>${
              refundRequest.orderId._id
            }</strong> has been rejected.</p>
            <p>Admin Remarks: ${adminRemarks || "N/A"}</p>
            <p>If you believe this is a mistake, please reply to this email to discuss your case further.</p>
            <p>Best regards,<br>The Team</p>
          </div>
        `;
        sendEmail(refundRequest.clientEmail, emailSubject, emailHtmlContent);
      }

      res.json({ msg: `Refund request updated to ${status}`, refundRequest });
    } catch (err) {
      console.error("Update Refund Error:", err);
      res.status(500).json({
        msg: "Server error updating refund request",
        error: err.message,
      });
    }
  });

  // ============================= // BlogPost Routes // =============================
  // ... (Your existing BlogPost routes here) ...

  // ============================= // Cloudinary Image Upload/Deletion Routes // =============================
  // ... (Your existing Cloudinary routes here) ...

  // ============================= // Payment Routes // =============================
  // ... (Your existing Payment routes here) ...

  return router;
};
