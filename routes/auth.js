const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const Order = require("../models/order");
const Payment = require("../models/Payment");
const BlogPost = require("../models/BlogPost"); // NEW: Import BlogPost model
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// This module exports a function that accepts the Nodemailer 'transporter' object.
// This allows the routes to use the pre-configured email sending service.
module.exports = (transporter) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage() }); // Configure multer for in-memory storage

  // Helper function to send email using the passed transporter
  const sendEmail = async (to, subject, htmlContent) => {
    if (!transporter) {
      console.warn("Nodemailer transporter is not configured. Email not sent.");
      return { success: false, error: "Email transporter not available." };
    }
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER, // Sender address from .env file
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

  // POST /followerApi/signup - Register a new user
  router.post("/signup", async (req, res) => {
    try {
      const { name, email, password, role, isBanned } = req.body;

      if (!name || !email || !password || !role) {
        return res.status(400).json({
          msg: "Please provide all required fields: name, email, password, role.",
        });
      }

      let user = await User.findOne({ email });
      if (user) {
        return res
          .status(409)
          .json({ msg: "User with this email already exists." });
      }

      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({
          msg: "Invalid role specified. Role must be 'user' or 'admin'.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role,
        isBanned: isBanned ?? false,
      });

      const userEmailSubject = "Welcome to FollowersCart!";
      const userEmailHtmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #6a0dad;">Hello ${name},</h2>
          <p>Thank you for registering with FollowersCart. Your account has been successfully created.</p>
          <p>You can now log in and start using our services.</p>
          <p>Best regards,<br>The FollowersCart Team</p>
        </div>
      `;
      const userEmailResult = await sendEmail(
        email,
        userEmailSubject,
        userEmailHtmlContent
      );
      if (userEmailResult.success) {
        console.log("Registration confirmation email sent to user:", email);
      } else {
        console.error(
          "Failed to send registration email to user:",
          email,
          userEmailResult.error
        );
      }

      res
        .status(201)
        .json({ msg: "User registered successfully", user: newUser });
    } catch (err) {
      console.error("Signup Error:", err);
      res
        .status(500)
        .json({ msg: "Server error during signup", error: err.message });
    }
  });

  // POST /followerApi/login - Authenticate user and issue JWT
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res
          .status(400)
          .json({ msg: "Email and password are required." });
      }

      const user = await User.findOne({ email });
      if (!user)
        return res
          .status(401)
          .json({ msg: "Invalid credentials: User not found." });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res
          .status(401)
          .json({ msg: "Invalid credentials: Incorrect password." });

      if (user.isBanned) {
        return res.status(403).json({
          msg: "Your account has been banned. Please contact support.",
        });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.json({ token, role: user.role, loginUser: user });
    } catch (err) {
      console.error("Login Error:", err);
      res
        .status(500)
        .json({ msg: "Server error during login", error: err.message });
    }
  });

  // GET /followerApi/user - Get user by email
  router.get("/user", async (req, res) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res
          .status(400)
          .json({ msg: "Email query parameter is required." });
      }
      const user = await User.findOne({ email }).select("-password");
      if (!user) {
        return res.status(404).json({ msg: "User not found." });
      }
      res.json(user);
    } catch (err) {
      console.error("Error fetching user data by email:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching user", error: err.message });
    }
  });

  // GET /followerApi/alluser - Get all users (Admin only)
  router.get("/alluser", async (req, res) => {
    console.log("Fetching all users...");
    try {
      const users = await User.find()
        .select("-password")
        .sort({ createdAt: -1 });
      if (!users || users.length === 0) {
        return res.status(200).json([]);
      }
      res.json(users);
    } catch (err) {
      console.error("Error fetching all users:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching all users", error: err.message });
    }
  });

  // DELETE /followerApi/delete/:userId - Delete a user by ID (Admin only)
  router.delete("/delete/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: "Invalid user ID format." });
      }
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ msg: "User not found." });
      }
      await User.findByIdAndDelete(userId);
      res.json({ msg: "User deleted successfully." });
    } catch (err) {
      console.error("Error deleting user:", err);
      res
        .status(500)
        .json({ msg: "Server error deleting user", error: err.message });
    }
  });

  // PATCH /followerApi/update/:id - Update user details (including password change)
  router.patch("/update/:id", async (req, res) => {
    console.log("User update request received for ID:", req.params.id);
    try {
      const { id } = req.params;
      const { oldPassword, newPassword, ...otherUpdates } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid user ID format." });
      }

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ msg: "User not found." });
      }

      if (oldPassword && newPassword) {
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ msg: "Incorrect current password." });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        if (Object.keys(otherUpdates).length === 0) {
          return res.json({ msg: "Password updated successfully." });
        }
      }

      const updatedUser = await User.findByIdAndUpdate(id, otherUpdates, {
        new: true,
        runValidators: true,
      }).select("-password");

      if (!updatedUser) {
        return res
          .status(404)
          .json({ msg: "User not found after update attempt." });
      }

      res.json({ msg: "User updated successfully", updatedUser });
    } catch (err) {
      console.error("User Update Error:", err);
      res
        .status(500)
        .json({ msg: "Server error during user update", error: err.message });
    }
  });

  // ============================= // Cloudinary Image Upload/Deletion Routes // =============================

  // POST /followerApi/upload - Upload an image to Cloudinary
  router.post("/upload", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      const streamUpload = (request) => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { resource_type: "image" },
            (error, result) => {
              if (result) {
                resolve(result);
              } else {
                reject(error);
              }
            }
          );
          stream.end(request.file.buffer);
        });
      };

      const result = await streamUpload(req);
      res.json({ imageUrl: result.secure_url, public_id: result.public_id });
    } catch (error) {
      console.error("Cloudinary Upload Error:", error);
      res.status(500).json({ error: error.message || "Image upload failed." });
    }
  });

  // POST /followerApi/delete-image - Delete an image from Cloudinary
  router.post("/delete-image", async (req, res) => {
    const { public_id } = req.body;
    if (!public_id) {
      return res.status(400).json({ error: "Missing public_id for deletion." });
    }
    try {
      const result = await cloudinary.uploader.destroy(public_id);
      if (result.result === "not found") {
        return res
          .status(404)
          .json({ success: false, msg: "Image not found on Cloudinary." });
      }
      res.json({ success: true, result });
    } catch (error) {
      console.error("Cloudinary Deletion Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Image deletion failed." });
    }
  });

  // ============================= // Order Management Routes // =============================

  // POST /followerApi/createOrder - Create a new order
  router.post("/createOrder", async (req, res) => {
    try {
      console.log("Create Order request received. Request body:", req.body);

      const {
        name,
        email,
        phoneNumber,
        postLink,
        profileLink,
        requiredFollowers,
        platform,
        socialId,
        service,
        price,
      } = req.body;

      // Detailed validation for required fields
      if (
        !name ||
        !email ||
        !phoneNumber ||
        !profileLink ||
        requiredFollowers === undefined || // Check for undefined, as 0 is a valid number
        !platform ||
        !service ||
        price === undefined // Check for undefined
      ) {
        console.error(
          "Validation Error: Missing one or more required order fields."
        );
        return res
          .status(400)
          .json({ msg: "Missing one or more required order fields." });
      }

      // Ensure price and requiredFollowers are numbers
      if (isNaN(price) || isNaN(requiredFollowers)) {
        console.error(
          "Validation Error: Price or requiredFollowers is not a valid number."
        );
        return res
          .status(400)
          .json({ msg: "Price and Required Followers must be valid numbers." });
      }

      // Create new order record
      const newOrder = await Order.create({
        name,
        email,
        phoneNumber,
        postLink,
        profileLink,
        requiredFollowers,
        platform,
        socialId,
        service,
        price,
        status: "Pending", // Default initial status
        createdAt: new Date(),
      });
      console.log("Order created successfully in DB:", newOrder._id);

      // --- Send order confirmation email to the client ---
      const clientEmailSubject = "Your Order Has Been Placed!";
      const clientEmailHtmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #6a0dad;">Hello ${name},</h2>
          <p>Thank you for your order! Your order for <strong>${service}</strong> on <strong>${platform}</strong> has been successfully placed.</p>
          <p><strong>Order ID:</strong> ${newOrder._id}</p>
          <p><strong>Service:</strong> ${service}</p>
          <p><strong>Quantity:</strong> ${newOrder.requiredFollowers.toLocaleString()}</p>
          <p><strong>Price:</strong> PKR ${newOrder.price.toFixed(0)}</p>
          <p>We will process your order shortly. You will receive another email once the status changes.</p>
          <p style="font-size: 0.9em; color: #555;">Best regards,<br>The FollowersCart Team</p>
        </div>
      `;
      const clientEmailResult = await sendEmail(
        email,
        clientEmailSubject,
        clientEmailHtmlContent
      );
      if (clientEmailResult.success) {
        console.log("Order confirmation email sent to client:", email);
      } else {
        console.error(
          "Failed to send order confirmation email to client:",
          email,
          clientEmailResult.error
        );
      }

      // --- Send order notification email to the owner/admin ---
      if (process.env.ADMIN_RECEIVING_EMAIL) {
        const adminEmailSubject = `New Order Placed: ${platform} ${service} - ID: ${newOrder._id
          .toString()
          .substring(0, 8)}...`;
        const adminEmailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6a0dad;">New Order Notification!</h2>
            <p>A new order has been placed on your FollowersCart website.</p>
            <p><strong>Order ID:</strong> ${newOrder._id}</p>
            <p><strong>Client Name:</strong> ${name}</p>
            <p><strong>Client Email:</strong> ${email}</p>
            <p><strong>Phone Number:</strong> ${phoneNumber}</p>
            <p><strong>Platform:</strong> ${platform}</p>
            <p><strong>Service:</strong> ${service}</p>
            <p><strong>Quantity:</strong> ${newOrder.requiredFollowers.toLocaleString()}</p>
            <p><strong>Price:</strong> PKR ${newOrder.price.toFixed(0)}</p>
            <p><strong>Profile Link:</strong> <a href="${profileLink}" target="_blank" rel="noopener noreferrer">${profileLink}</a></p>
            ${
              postLink
                ? `<p><strong>Post Link:</strong> <a href="${postLink}" target="_blank" rel="noopener noreferrer">${postLink}</a></p>`
                : ""
            }
            ${socialId ? `<p><strong>Social ID:</strong> ${socialId}</p>` : ""}
            <p><strong>Status:</strong> ${newOrder.status}</p>
            <p><strong>Order Date:</strong> ${new Date(
              newOrder.createdAt
            ).toLocaleString()}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.9em; color: #555;">Please log in to the admin panel to manage this order.</p>
          </div>
        `;
        const adminEmailResult = await sendEmail(
          process.env.ADMIN_RECEIVING_EMAIL,
          adminEmailSubject,
          adminEmailHtmlContent
        );
        if (adminEmailResult.success) {
          console.log(
            "New order notification email sent to admin:",
            process.env.ADMIN_RECEIVING_EMAIL
          );
        } else {
          console.error(
            "Failed to send new order notification email to admin:",
            process.env.ADMIN_RECEIVING_EMAIL,
            adminEmailResult.error
          );
        }
      } else {
        console.warn(
          "ADMIN_RECEIVING_EMAIL is not set in .env. Owner notification email not sent."
        );
      }

      res.status(201).json({
        msg: "Order placed successfully",
        id: newOrder._id, // Ensure 'id' is returned for frontend navigation
        order: newOrder,
      });
    } catch (err) {
      console.error("❌ Order Creation Failed. Full error:", err);
      // Check for Mongoose validation errors
      if (err.name === "ValidationError") {
        const errors = Object.keys(err.errors).map(
          (key) => err.errors[key].message
        );
        console.error("Mongoose Validation Errors:", errors);
        return res.status(400).json({
          msg: "Validation failed for order creation.",
          errors: errors,
        });
      }
      // Check for duplicate key error (e.g., if socialId was unique and duplicated)
      if (err.code === 11000) {
        console.error("Duplicate Key Error:", err.message);
        return res.status(409).json({
          msg: "Duplicate entry detected. This order might already exist.",
          error: err.message,
        });
      }
      res.status(500).json({
        msg: "An unexpected server error occurred during order creation. Please try again later.",
        error: err.message,
      });
    }
  });

  // GET /followerApi/allOrders - Get all orders (Admin only)
  router.get("/allOrders", async (req, res) => {
    console.log("Fetching all orders...");
    try {
      const orders = await Order.find().sort({ createdAt: -1 });
      if (!orders || orders.length === 0) {
        return res.status(200).json({ orders: [] });
      }
      res.json({
        orders: orders.map((order) => ({
          id: order._id,
          orderId: order._id,
          name: order.name,
          email: order.email,
          service: order.service,
          amount: order.requiredFollowers,
          date: order.createdAt
            ? new Date(order.createdAt).toLocaleDateString()
            : "N/A",
          status: order.status,
          platform: order.platform,
          postLink: order.postLink,
          price: `PKR ${order.price.toFixed(0)}`,
          profileLink: order.profileLink,
          socialId: order.socialId,
          phoneNumber: order.phoneNumber,
          createdAt: order.createdAt, // Keep original createdAt for frontend calculations
        })),
      });
    } catch (err) {
      console.error("Error fetching all orders:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching all orders", error: err.message });
    }
  });

  // GET /followerApi/getOrder/:id - Get a single order by ID
  router.get("/getOrder/:id", async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ msg: "Invalid order ID format." });
    }
    try {
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({ msg: "Order not found." });
      }
      res.json(order);
    } catch (err) {
      console.error("Error fetching order by ID:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching order by ID", error: err.message });
    }
  });

  // GET /followerApi/userOrders/:email - Get orders for a specific user by email
  router.get("/userOrders/:email", async (req, res) => {
    try {
      const { email } = req.params;
      if (!email) {
        return res
          .status(400)
          .json({ msg: "Email parameter is required to fetch user orders." });
      }
      const orders = await Order.find({ email }).sort({ createdAt: -1 });
      if (!orders || orders.length === 0) {
        return res.status(200).json({ orders: [] });
      }
      res.json({
        orders: orders.map((order) => ({
          id: order._id,
          orderId: order._id,
          name: order.name,
          email: order.email,
          service: order.service,
          amount: order.requiredFollowers,
          date: order.createdAt
            ? new Date(order.createdAt).toLocaleDateString()
            : "N/A",
          status: order.status,
          platform: order.platform,
          postLink: order.postLink,
          price: `PKR ${order.price.toFixed(0)}`,
          profileLink: order.profileLink,
          socialId: order.socialId,
          phoneNumber: order.phoneNumber,
        })),
      });
    } catch (err) {
      console.error("Error fetching user orders:", err);
      res.status(500).json({
        msg: "Server error fetching user orders",
        error: err.message,
      });
    }
  });

  // DELETE /followerApi/deleteOrder/:id - Delete an order record (Admin only)
  router.delete("/deleteOrder/:id", async (req, res) => {
    const { id } = req.params;
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid order ID format." });
      }
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({ msg: "Order not found." });
      }
      await Order.findByIdAndDelete(id);
      res.json({ msg: "Order deleted successfully." });
    } catch (err) {
      console.error("Error deleting order:", err);
      res
        .status(500)
        .json({ msg: "Server error deleting order", error: err.message });
    }
  });

  // PATCH /followerApi/updateOrder/:id - Update an order's status or other details
  router.patch("/updateOrder/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid order ID format." });
      }
      const updatedOrder = await Order.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true,
      });
      if (!updatedOrder) {
        return res.status(404).json({ msg: "Order not found." });
      }

      // Send email to client on order status update
      const clientEmailSubject = `Your Order #${updatedOrder._id
        .toString()
        .substring(0, 8)}... Status Updated to ${updatedOrder.status}`;
      const clientEmailHtmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #6a0dad;">Hello ${updatedOrder.name},</h2>
          <p>Your order for <strong>${
            updatedOrder.service
          }</strong> on <strong>${
        updatedOrder.platform
      }</strong> has been updated.</p>
          <p><strong>Order ID:</strong> ${updatedOrder._id}</p>
          <p><strong>New Status:</strong> <span style="color: ${
            updatedOrder.status === "Completed"
              ? "#28a745"
              : updatedOrder.status === "Cancelled" ||
                updatedOrder.status === "Failed" ||
                updatedOrder.status === "Refunded"
              ? "#dc3545"
              : "#ffc107"
          }; font-weight: bold;">${updatedOrder.status}</span></p>
          <p style="font-size: 0.9em; color: #555;">Thank you for your patience.<br>The FollowersCart Team</p>
        </div>
      `;
      const clientEmailResult = await sendEmail(
        updatedOrder.email,
        clientEmailSubject,
        clientEmailHtmlContent
      );
      if (clientEmailResult.success) {
        console.log(
          "Order status update email sent to client:",
          updatedOrder.email
        );
      } else {
        console.error(
          "Failed to send order status update email to client:",
          updatedOrder.email,
          clientEmailResult.error
        );
      }

      // Send email to admin on order status update
      if (process.env.ADMIN_RECEIVING_EMAIL) {
        const adminEmailSubject = `Order Status Changed: Order ID ${updatedOrder._id
          .toString()
          .substring(0, 8)}... - ${updatedOrder.status}`;
        const adminEmailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6a0dad;">Order Status Change Notification!</h2>
            <p>Order ID: <strong>${
              updatedOrder._id
            }</strong> for Client <strong>${
          updatedOrder.name
        }</strong> has been updated to <strong>${
          updatedOrder.status
        }</strong>.</p>
            <p><strong>Client Email:</strong> ${updatedOrder.email}</p>
            <p><strong>Service:</strong> ${updatedOrder.service}</p>
            <p><strong>New Status:</strong> <span style="color: ${
              updatedOrder.status === "Completed"
                ? "#28a745"
                : updatedOrder.status === "Cancelled" ||
                  updatedOrder.status === "Failed" ||
                  updatedOrder.status === "Refunded"
                ? "#dc3545"
                : "#ffc107"
            }; font-weight: bold;">${updatedOrder.status}</span></p>
            <p style="font-size: 0.9em; color: #555;">Please review the order in your admin panel.</p>
          </div>
        `;
        const adminEmailResult = await sendEmail(
          process.env.ADMIN_RECEIVING_EMAIL,
          adminEmailSubject,
          adminEmailHtmlContent
        );
        if (adminEmailResult.success) {
          console.log(
            "Admin notification email sent for order status change:",
            process.env.ADMIN_RECEIVING_EMAIL
          );
        } else {
          console.error(
            "Failed to send admin notification email for order status change:",
            process.env.ADMIN_RECEIVING_EMAIL,
            adminEmailResult.error
          );
        }
      }
      res.json({ msg: "Order updated successfully", order: updatedOrder });
    } catch (err) {
      console.error("Order Update Error:", err);
      res
        .status(500)
        .json({ msg: "Server error updating order", error: err.message });
    }
  });

  // ============================= // Payment Management Routes // =============================

  // POST /followerApi/createPayment - Create a new payment record
  router.post("/createPayment", async (req, res) => {
    try {
      const {
        orderId,
        clientName,
        clientEmail,
        amount,
        paymentMethod,
        transactionId,
        screenshotUrl,
        remarks,
        status, // 'Pending', 'Approved', 'Rejected'
      } = req.body;

      // Basic validation
      if (
        !orderId ||
        !clientName ||
        !clientEmail ||
        amount === undefined ||
        !paymentMethod ||
        !transactionId
      ) {
        return res
          .status(400)
          .json({ msg: "Missing one or more required payment fields." });
      }

      // Create new payment record
      const newPayment = await Payment.create({
        orderId,
        clientName,
        clientEmail,
        amount,
        paymentMethod,
        transactionId,
        screenshotUrl,
        remarks,
        status: status || "Pending", // Default to Pending if not provided
        paymentDate: new Date(),
      });

      // After successful payment creation, update the associated order's status to "Payment Pending"
      const orderToUpdate = await Order.findById(orderId);
      if (orderToUpdate) {
        orderToUpdate.status = "Payment Pending"; // Indicate that payment has been submitted and is awaiting review
        await orderToUpdate.save();
        console.log(
          `Order ${orderId} status updated to 'Payment Pending' after payment confirmation.`
        );
      } else {
        console.warn(
          `Order with ID ${orderId} not found for payment confirmation. Payment record created but order not updated.`
        );
      }

      // Send payment confirmation email to the client
      const clientEmailSubject = "Payment Received for Your Order!";
      const clientEmailHtmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #6a0dad;">Hello ${clientName},</h2>
          <p>We have received your payment for Order ID: <strong>${orderId}</strong>.</p>
          <p><strong>Amount:</strong> PKR ${newPayment.amount.toFixed(0)}</p>
          <p><strong>Payment Method:</strong> ${paymentMethod}</p>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
          <p>Your payment is currently under review. We will notify you once it's approved.</p>
          <p style="font-size: 0.9em; color: #555;">Best regards,<br>The FollowersCart Team</p>
        </div>
      `;
      const clientEmailResult = await sendEmail(
        clientEmail,
        clientEmailSubject,
        clientEmailHtmlContent
      );
      if (clientEmailResult.success) {
        console.log("Payment confirmation email sent to client:", clientEmail);
      } else {
        console.error(
          "Failed to send payment confirmation email to client:",
          clientEmail,
          clientEmailResult.error
        );
      }

      // Send payment notification email to the admin
      if (process.env.ADMIN_RECEIVING_EMAIL) {
        const adminEmailSubject = `New Payment Received for Order ID: ${orderId
          .toString()
          .substring(0, 8)}...`;
        const adminEmailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6a0dad;">New Payment Notification!</h2>
            <p>A new payment has been recorded for Order ID: <strong>${orderId}</strong>.</p>
            <p><strong>Client Name:</strong> ${clientName}</p>
            <p><strong>Client Email:</strong> ${clientEmail}</p>
            <p><strong>Amount:</strong> PKR ${newPayment.amount.toFixed(0)}</p>
            <p><strong>Payment Method:</strong> ${paymentMethod}</p>
            <p><strong>Transaction ID:</strong> ${transactionId}</p>
            ${
              screenshotUrl
                ? `<p><strong>Screenshot:</strong> <a href="${screenshotUrl}" target="_blank" rel="noopener noreferrer">View Screenshot</a></p>`
                : ""
            }
            <p><strong>Status:</strong> ${newPayment.status}</p>
            <p><strong>Payment Date:</strong> ${new Date(
              newPayment.paymentDate
            ).toLocaleString()}</p>
            <p><strong>Remarks:</strong> ${remarks || "N/A"}</p>
            <p style="font-size: 0.9em; color: #555;">Please log in to your admin panel to review and approve this payment.</p>
          </div>
        `;
        const adminEmailResult = await sendEmail(
          process.env.ADMIN_RECEIVING_EMAIL,
          adminEmailSubject,
          adminEmailHtmlContent
        );
        if (adminEmailResult.success) {
          console.log(
            "New payment notification email sent to admin:",
            process.env.ADMIN_RECEIVING_EMAIL
          );
        } else {
          console.error(
            "Failed to send new payment notification email to admin:",
            process.env.ADMIN_RECEIVING_EMAIL,
            adminEmailResult.error
          );
        }
      } else {
        console.warn(
          "ADMIN_RECEIVING_EMAIL is not set in .env. Owner payment notification email not sent."
        );
      }
      res.status(201).json({
        msg: "Payment record created successfully",
        payment: newPayment,
      });
    } catch (err) {
      console.error("Payment Creation Failed:", err);
      if (err.code === 11000) {
        return res.status(409).json({
          msg: "A payment with this transaction ID already exists for this method.",
          error: err.message,
        });
      }
      res.status(500).json({
        msg: "Server error during payment creation",
        error: err.message,
      });
    }
  });

  // GET /followerApi/allPayments - Get all payments (Admin only)
  router.get("/allPayments", async (req, res) => {
    try {
      // Find all payments and sort by payment date (latest first), and populate the orderId to get order details
      const payments = await Payment.find()
        .populate("orderId") // This populates the order details based on orderId
        .sort({ paymentDate: -1 });

      if (!payments || payments.length === 0) {
        return res.status(200).json({ payments: [] });
      }

      // Map payments to a format suitable for frontend display, including populated order details
      res.json({
        payments: payments.map((payment) => ({
          _id: payment._id, // Use _id for consistency
          orderId: payment.orderId ? payment.orderId._id : null,
          orderPrice: payment.orderId ? payment.orderId.price : null, // Access populated order price
          clientName: payment.clientName,
          clientEmail: payment.clientEmail,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          transactionId: payment.transactionId,
          screenshotUrl: payment.screenshotUrl,
          remarks: payment.remarks,
          status: payment.status,
          paymentDate: payment.paymentDate, // Keep as Date object for frontend formatting
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
      });
    } catch (err) {
      console.error("Error fetching all payments:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching payments", error: err.message });
    }
  });

  // PATCH /followerApi/updatePayment/:id - Update a payment record (Admin only)
  router.patch("/updatePayment/:id", async (req, res) => {
    const { id } = req.params;
    const updates = req.body; // Expects fields like { status: "Approved" } or { remarks: "..." }
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid payment ID format." });
      }

      // Find and update the payment. 'new: true' returns the updated document.
      const updatedPayment = await Payment.findByIdAndUpdate(id, updates, {
        new: true,
        runValidators: true, // Ensure schema validators are run on update
      });

      if (!updatedPayment) {
        return res.status(404).json({ msg: "Payment not found." });
      }

      // If the payment status is changed to "Approved", update the associated order's status to "In Progress"
      // Only do this if the order isn't already in a final state (Completed, Cancelled, Refunded, Failed)
      if (updatedPayment.status === "Approved") {
        const orderToUpdate = await Order.findById(updatedPayment.orderId);
        if (orderToUpdate) {
          if (
            orderToUpdate.status !== "Completed" &&
            orderToUpdate.status !== "Cancelled" &&
            orderToUpdate.status !== "Refunded" &&
            orderToUpdate.status !== "Failed" &&
            orderToUpdate.status !== "In Progress" // Prevent re-setting if already in progress
          ) {
            orderToUpdate.status = "In Progress";
            await orderToUpdate.save();
            console.log(
              `Order ${updatedPayment.orderId} status updated to 'In Progress' due to payment approval.`
            );
          } else {
            console.log(
              `Order ${updatedPayment.orderId} status is ${orderToUpdate.status}, not changing to 'In Progress'.`
            );
          }
        } else {
          console.warn(
            `Associated order ${updatedPayment.orderId} not found for payment ${id}.`
          );
        }
      }

      // Send email to client on payment status update
      const clientEmailSubject = `Your Payment for Order #${updatedPayment.orderId
        .toString()
        .substring(0, 8)}... Status: ${updatedPayment.status}`;
      const clientEmailHtmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #6a0dad;">Hello ${updatedPayment.clientName},</h2>
          <p>Your payment for Order ID: <strong>${
            updatedPayment.orderId
          }</strong> has been updated.</p>
          <p><strong>New Status:</strong> <span style="color: ${
            updatedPayment.status === "Approved"
              ? "#28a745"
              : updatedPayment.status === "Rejected"
              ? "#dc3545"
              : "#ffc107"
          }; font-weight: bold;">${updatedPayment.status}</span></p>
          <p><strong>Amount:</strong> PKR ${updatedPayment.amount.toFixed(
            0
          )}</p>
          <p><strong>Payment Method:</strong> ${
            updatedPayment.paymentMethod
          }</p>
          <p><strong>Transaction ID:</strong> ${
            updatedPayment.transactionId
          }</p>
          ${
            updatedPayment.screenshotUrl
              ? `<p><strong>Screenshot:</strong> <a href="${updatedPayment.screenshotUrl}" target="_blank" rel="noopener noreferrer">View Screenshot</a></p>`
              : ""
          }
          ${
            updatedPayment.remarks && updatedPayment.remarks !== "No remarks."
              ? `<p><strong>Remarks:</strong> ${updatedPayment.remarks}</p>`
              : ""
          }
          <p style="font-size: 0.9em; color: #555;">Thank you for your patience.<br>The FollowersCart Team</p>
        </div>
      `;
      const clientEmailResult = await sendEmail(
        updatedPayment.clientEmail,
        clientEmailSubject,
        clientEmailHtmlContent
      );
      if (clientEmailResult.success) {
        console.log(
          "Payment status update email sent to client:",
          updatedPayment.clientEmail
        );
      } else {
        console.error(
          "Failed to send payment status update email to client:",
          updatedPayment.clientEmail,
          clientEmailResult.error
        );
      }

      // Send email to admin on payment status update
      if (process.env.ADMIN_RECEIVING_EMAIL) {
        const adminEmailSubject = `Payment Status Changed: Order ID ${updatedPayment.orderId
          .toString()
          .substring(0, 8)}... - ${updatedPayment.status}`;
        const adminEmailHtmlContent = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #6a0dad;">Payment Status Change Notification!</h2>
            <p>Payment ID: <strong>${
              updatedPayment._id
            }</strong> for Order ID <strong>${
          updatedPayment.orderId
        }</strong> (Client: ${
          updatedPayment.clientName
        }) has been updated to <strong>${updatedPayment.status}</strong>.</p>
            <p><strong>Client Email:</strong> ${updatedPayment.clientEmail}</p>
            <p><strong>Amount:</strong> PKR ${updatedPayment.amount.toFixed(
              0
            )}</p>
            <p><strong>Payment Method:</strong> ${
              updatedPayment.paymentMethod
            }</p>
            <p><strong>Transaction ID:</strong> ${
              updatedPayment.transactionId
            }</p>
            ${
              updatedPayment.screenshotUrl
                ? `<p><strong>Screenshot:</strong> <a href="${updatedPayment.screenshotUrl}" target="_blank" rel="noopener noreferrer">View Screenshot</a></p>`
                : ""
            }
            ${
              updatedPayment.remarks && updatedPayment.remarks !== "No remarks."
                ? `<p><strong>Remarks:</strong> ${updatedPayment.remarks}</p>`
                : ""
            }
            <p style="font-size: 0.9em; color: #555;">Please review the payment in your admin panel.</p>
          </div>
        `;
        const adminEmailResult = await sendEmail(
          process.env.ADMIN_RECEIVING_EMAIL,
          adminEmailSubject,
          adminEmailHtmlContent
        );
        if (adminEmailResult.success) {
          console.log(
            "Admin notification email sent for payment status change:",
            process.env.ADMIN_RECEIVING_EMAIL
          );
        } else {
          console.error(
            "Failed to send admin notification email for payment status change:",
            process.env.ADMIN_RECEIVING_EMAIL,
            adminEmailResult.error
          );
        }
      }

      res.json({
        msg: "Payment updated successfully",
        payment: updatedPayment,
      });
    } catch (err) {
      console.error("Payment Update Error:", err);
      res
        .status(500)
        .json({ msg: "Server error updating payment", error: err.message });
    }
  });

  // ============================= // Blog Post Routes // =============================

  // GET /followerApi/blogPosts - Get all blog posts
  router.get("/blogPosts", async (req, res) => {
    try {
      const posts = await BlogPost.find().sort({ createdAt: -1 });
      res.json({ posts });
    } catch (err) {
      console.error("Error fetching blog posts from DB:", err);
      res.status(500).json({ msg: "Server error fetching blog posts." });
    }
  });

  // POST /followerApi/blogPosts - Create a new blog post (Admin only, or authenticated user)
  router.post("/blogPosts", async (req, res) => {
    try {
      const { title, content, author, snippet, imageUrl } = req.body;

      if (!title || !content) {
        return res
          .status(400)
          .json({ msg: "Title and content are required for a blog post." });
      }

      const newPost = await BlogPost.create({
        title,
        content,
        author: author || "Admin", // Default author if not provided
        snippet, // Will be auto-generated if not provided in schema pre-save hook
        imageUrl,
      });
      res
        .status(201)
        .json({ msg: "Blog post created successfully", post: newPost });
    } catch (err) {
      console.error("Error creating blog post:", err);
      if (err.code === 11000) {
        // Duplicate key error (e.g., duplicate title if unique is set)
        return res.status(409).json({
          msg: "A blog post with this title already exists.",
          error: err.message,
        });
      }
      res
        .status(500)
        .json({ msg: "Server error creating blog post.", error: err.message });
    }
  });

  // GET /followerApi/blogPosts/:id - Get a single blog post by ID
  router.get("/blogPosts/:id", async (req, res) => {
    const { id } = req.params;
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ msg: "Invalid blog post ID format." });
      }
      const post = await BlogPost.findById(id);
      if (!post) {
        return res.status(404).json({ msg: "Blog post not found." });
      }
      res.json({ post });
    } catch (err) {
      console.error("Error fetching single blog post:", err);
      res
        .status(500)
        .json({ msg: "Server error fetching blog post.", error: err.message });
    }
  });

  // ============================= // Owner Profile Routes // =============================

  // GET /followerApi/ownerProfile - Get owner profile details
  router.get("/ownerProfile", async (req, res) => {
    try {
      // For this example, we'll fetch a user with role 'admin' as the owner.
      // In a real application, you might have a dedicated 'Owner' model or a specific user ID for the owner.
      const owner = await User.findOne({ role: "admin" }).select("-password");

      if (!owner) {
        // Fallback if no admin user is found, or if you want static data
        const staticOwnerData = {
          name: "Muhammad Usman",
          title: "Founder & CEO, FollowersCart",
          email: "usman.owner@example.com",
          phone: "+92 345 1234567",
          location: "Lahore, Pakistan",
          bio: "Muhammad Usman is the visionary behind FollowersCart, dedicated to helping individuals and businesses enhance their digital presence across various social media platforms. With years of experience in digital marketing and social media growth strategies, Usman founded FollowersCart to provide reliable and effective solutions for online visibility. He is passionate about empowering clients to achieve their social media goals through ethical and sustainable practices.",
          profileImageUrl:
            "https://placehold.co/150x150/A78BFA/ffffff?text=Usman",
          vision:
            "My vision for FollowersCart is to be the most trusted and effective partner for individuals and businesses aiming to amplify their voice and presence in the digital world. We believe in fostering genuine connections and providing tools that truly help our clients thrive, without compromising on quality or ethics.",
        };
        return res.status(200).json({ owner: staticOwnerData });
      }

      // Map user data to owner profile structure
      const ownerProfileData = {
        name: owner.name,
        title: "Founder & CEO, FollowersCart", // This can be static or come from a user profile field
        email: owner.email,
        phone: owner.phoneNumber || "+92 3XX XXXXXXX", // Use user's phone or default
        location: "Lahore, Pakistan", // This can be static or come from a user profile field
        bio: "Muhammad Usman is the visionary behind FollowersCart, dedicated to helping individuals and businesses enhance their digital presence across various social media platforms. With years of experience in digital marketing and social media growth strategies, Usman founded FollowersCart to provide reliable and effective solutions for online visibility. He is passionate about empowering clients to achieve their social media goals through ethical and sustainable practices.", // This can be static or come from a user profile field
        profileImageUrl:
          owner.profileImage ||
          "https://placehold.co/150x150/A78BFA/ffffff?text=Usman", // Use user's profile image or default
        vision:
          "My vision for FollowersCart is to be the most trusted and effective partner for individuals and businesses aiming to amplify their voice and presence in the digital world. We believe in fostering genuine connections and providing tools that truly help our clients thrive, without compromising on quality or ethics.", // This can be static or come from a user profile field
      };
      res.json({ owner: ownerProfileData });
    } catch (err) {
      console.error("Error fetching owner profile from DB:", err);
      res.status(500).json({ msg: "Server error fetching owner profile." });
    }
  });

  return router;
};
