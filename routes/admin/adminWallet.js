import express from "express";
import mongoose from "mongoose";

// Middleware & Constants
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";

// Models
import User from "../../models/User.js";
import WalletTransactionRecord from "../../models/WalletTransactionRecord.js";

const router = express.Router();

/**
 * ==============================
 *  ADMIN WALLET MANAGEMENT ROUTES
 * ==============================
 *
 * Covers moderation of:
 *  - Top-up (deposit) requests
 *  - Withdraw requests
 *  - Wallet analytics (top depositors, withdrawers, etc.)
 *
 * All routes are protected by ADMIN role.
 */

// Utility: safely convert Decimal128 to float
const decimalToFloat = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (value._bsontype === "Decimal128") return parseFloat(value.toString());
  return parseFloat(value);
};

/* -------------------------------------------------------
 *  TOP-UP (Deposit) Moderation
 * ----------------------------------------------------- */

/**
 * @route   GET /wallet/top-up-requests
 * @desc    Get all pending top-up requests
 * @access  Private (ADMIN only)
 */
router.get(
  "/wallet/top-up-requests",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const requests = await WalletTransactionRecord.find({
        type: "topup",
        status: "pending",
      })
        .populate("user", "email name")
        .sort({ createdAt: -1 })
        .lean();

      const converted = requests.map((r) => ({
        ...r,
        amount: decimalToFloat(r.amount),
      }));

      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/top-up-requests/:id/approve
 * @desc    Approve a top-up request and add funds to wallet
 * @access  Private (ADMIN only)
 */
router.post(
  "/wallet/top-up-requests/:id/approve",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const record = await WalletTransactionRecord.findById(req.params.id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      if (record.type !== "topup")
        return res.status(400).json({ message: "Not a top-up record" });
      if (record.status !== "pending")
        return res.status(400).json({ message: "Already processed" });

      const user = await User.findById(record.user);
      if (!user) return res.status(404).json({ message: "User not found" });

      const balance = decimalToFloat(user.walletBalance);
      const amount = decimalToFloat(record.amount);

      // Add funds to wallet
      user.walletBalance = mongoose.Types.Decimal128.fromString(
        (balance + amount).toFixed(2)
      );
      await user.save();

      // Update record
      record.status = "approved";
      record.reviewedAt = new Date();
      record.reviewedBy = req.user.id;
      await record.save();

      res.json({
        message: "Top-up approved and wallet updated",
        newBalance: decimalToFloat(user.walletBalance),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/top-up-requests/:id/reject
 * @desc    Reject a top-up request
 * @access  Private (ADMIN only)
 */
router.post(
  "/wallet/top-up-requests/:id/reject",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { reason } = req.body; // ✅ get reason from request body

      const record = await WalletTransactionRecord.findById(req.params.id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      if (record.type !== "topup")
        return res.status(400).json({ message: "Not a top-up record" });
      if (record.status !== "pending")
        return res.status(400).json({ message: "Already processed" });

      // Update record with rejection reason
      record.status = "rejected";
      record.reviewedAt = new Date();
      record.reviewedBy = req.user.id;
      record.rejectionReason = reason || "No reason provided"; // ✅ save reason
      await record.save();

      res.json({
        message: "Top-up request rejected",
        rejectionReason: record.rejectionReason,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* -------------------------------------------------------
 *  WITHDRAW Moderation
 * ----------------------------------------------------- */

/**
 * @route   GET /wallet/withdraw-requests
 * @desc    Get all pending withdraw requests
 * @access  Private (ADMIN only)
 */
router.get(
  "/wallet/withdraw-requests",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const requests = await WalletTransactionRecord.find({
        type: "withdraw",
        status: "pending",
      })
        .populate("user", "email name")
        .sort({ createdAt: -1 })
        .lean();

      const converted = requests.map((r) => ({
        ...r,
        amount: decimalToFloat(r.amount),
      }));

      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/withdraw-requests/:id/approve
 * @desc    Approve a withdrawal request
 * @access  Private (ADMIN only)
 */
router.post(
  "/wallet/withdraw-requests/:id/approve",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const record = await WalletTransactionRecord.findById(req.params.id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      if (record.type !== "withdraw")
        return res.status(400).json({ message: "Not a withdrawal record" });
      if (record.status !== "pending")
        return res.status(400).json({ message: "Already processed" });

      // NOTE: Funds were already deducted when request was created
      record.status = "approved";
      record.reviewedAt = new Date();
      record.reviewedBy = req.user.id;
      await record.save();

      res.json({ message: "Withdrawal approved successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/withdraw-requests/:id/reject
 * @desc    Reject a withdrawal request and restore reserved funds
 * @access  Private (ADMIN only)
 */
router.post(
  "/wallet/withdraw-requests/:id/reject",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { reason } = req.body; // ✅ get rejection reason
      if (!reason || reason.trim() === "") {
        return res
          .status(400)
          .json({ message: "Rejection reason is required" });
      }

      const record = await WalletTransactionRecord.findById(req.params.id);
      if (!record) return res.status(404).json({ message: "Record not found" });
      if (record.type !== "withdraw")
        return res.status(400).json({ message: "Not a withdrawal record" });
      if (record.status !== "pending")
        return res.status(400).json({ message: "Already processed" });

      const user = await User.findById(record.user);
      if (!user) return res.status(404).json({ message: "User not found" });

      const balance = decimalToFloat(user.walletBalance);
      const amount = decimalToFloat(record.amount);

      // ✅ Restore reserved funds
      user.walletBalance = mongoose.Types.Decimal128.fromString(
        (balance + amount).toFixed(2)
      );
      await user.save();

      // ✅ Update record with rejection reason
      record.status = "rejected";
      record.rejectionReason = reason; // <- added
      record.reviewedAt = new Date();
      record.reviewedBy = req.user.id;
      await record.save();

      res.json({
        message: "Withdrawal request rejected and funds restored",
        rejectionReason: reason,
        newBalance: decimalToFloat(user.walletBalance),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* -------------------------------------------------------
 *  WALLET ANALYTICS (Reports)
 * ----------------------------------------------------- */

/**
 * @route   GET /wallet/top-depositors
 * @desc    Get top 10 depositors (by total approved deposits)
 * @access  Private (ADMIN only)
 */
router.get(
  "/wallet/top-depositors",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const topDepositors = await WalletTransactionRecord.aggregate([
        { $match: { type: "topup", status: "approved" } },
        { $group: { _id: "$user", totalDeposits: { $sum: "$amount" } } },
        { $sort: { totalDeposits: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        { $project: { "user.name": 1, "user.email": 1, totalDeposits: 1 } },
      ]);

      const converted = topDepositors.map((d) => ({
        ...d,
        totalDeposits: decimalToFloat(d.totalDeposits),
      }));

      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   GET /wallet/top-withdrawalers
 * @desc    Get top 10 withdrawers (by total approved withdrawals)
 * @access  Private (ADMIN only)
 */
router.get(
  "/wallet/top-withdrawalers",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const topWithdrawalers = await WalletTransactionRecord.aggregate([
        { $match: { type: "withdraw", status: "approved" } },
        { $group: { _id: "$user", totalWithdrawals: { $sum: "$amount" } } },
        { $sort: { totalWithdrawals: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        { $project: { "user.name": 1, "user.email": 1, totalWithdrawals: 1 } },
      ]);

      const converted = topWithdrawalers.map((w) => ({
        ...w,
        totalWithdrawals: decimalToFloat(w.totalWithdrawals),
      }));

      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   GET /wallet/deposit-vs-withdraw
 * @desc    Compare deposits vs withdrawals (last 1 month, grouped daily)
 * @access  Private (ADMIN only)
 */
router.get(
  "/wallet/deposit-vs-withdraw",
  authMiddleware([ROLES.ADMIN]),
  async (req, res) => {
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      const data = await WalletTransactionRecord.aggregate([
        { $match: { createdAt: { $gte: oneMonthAgo }, status: "approved" } },
        {
          $group: {
            _id: { day: { $dayOfMonth: "$createdAt" }, type: "$type" },
            total: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]);

      const converted = data.map((d) => ({
        ...d,
        total: decimalToFloat(d.total),
      }));

      res.json(converted);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
