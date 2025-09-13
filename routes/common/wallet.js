import express from "express";
import mongoose from "mongoose";

// Models
import User from "../../models/User.js";
import Transaction from "../../models/Transaction.js";
import WalletTransactionRecord from "../../models/WalletTransactionRecord.js";

// Middleware & Constants
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

/**
 * ========================
 * USER WALLET ROUTES
 * ========================
 *
 * These routes handle:
 * - Checking wallet balance
 * - Viewing transactions
 * - Adding funds (top-up)
 * - Withdrawing funds
 * - Viewing transaction records (audit logs)
 *
 * Approval mode:
 * - If APPROVAL_MODE=auto → Transactions are processed instantly
 * - If APPROVAL_MODE=manual → Transactions require admin approval
 */

// Utility: safely convert Decimal128 to float
const decimalToFloat = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value);
  if (value._bsontype === "Decimal128") return parseFloat(value.toString());
  return parseFloat(value);
};

/**
 * @route   GET /wallet/balance
 * @desc    Get the current wallet balance for the logged-in user
 * @access  Private (USER role only)
 */
router.get(
  "/wallet/balance",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select("walletBalance");
      if (!user) return res.status(404).json({ message: "User not found" });

      res.json({ balance: decimalToFloat(user.walletBalance) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   GET /wallet/transactions
 * @desc    Get paginated wallet transactions
 * @access  Private (USER role only)
 */
router.get(
  "/wallet/all-transactions",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      // Get page and limit from query params with defaults
      let { page = 1, limit = 10 } = req.query;
      page = parseInt(page, 10);
      limit = parseInt(limit, 10);

      // Count total transactions for pagination metadata
      const total = await Transaction.countDocuments({ user: req.user.id });

      // Fetch paginated transactions
      const transactions = await Transaction.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      // Convert Decimal128 fields to floats
      const converted = transactions.map((tx) => ({
        ...tx,
        amount: decimalToFloat(tx.amount),
        balanceAfter: decimalToFloat(tx.balanceAfter),
        id: tx._id.toString(),
      }));

      res.json({
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        content: converted,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/add
 * @desc    Create a wallet deposit (top-up) request
 * @access  Private (USER role only)
 */
router.post(
  "/wallet/add",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const { amount, description, referenceNumber } = req.body; // ✅ added referenceNumber
      const parsedAmount = parseFloat(amount);

      if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      if (!referenceNumber || referenceNumber.trim() === "") {
        return res.status(400).json({ error: "Reference number is required" });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Auto-approval mode
      if (process.env.APPROVAL_MODE === "auto") {
        const currentBalance = decimalToFloat(user.walletBalance);
        user.walletBalance = mongoose.Types.Decimal128.fromString(
          (currentBalance + parsedAmount).toFixed(2)
        );
        await user.save();

        const record = await WalletTransactionRecord.create({
          user: req.user.id,
          type: "topup",
          amount: mongoose.Types.Decimal128.fromString(parsedAmount.toFixed(2)),
          description: description || "Wallet top-up",
          referenceNumber, // ✅ store reference
          status: "approved",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
        });

        return res.json({
          message: "Wallet updated automatically",
          newBalance: decimalToFloat(user.walletBalance),
          transactionId: record._id,
        });
      }

      // Manual mode
      const record = await WalletTransactionRecord.create({
        user: req.user.id,
        type: "topup",
        amount: mongoose.Types.Decimal128.fromString(parsedAmount.toFixed(2)),
        description: description || "Wallet top-up",
        referenceNumber, // ✅ store reference
        status: "pending",
      });

      res.json({
        message: "Top-up request created, pending admin approval",
        transactionId: record._id,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   POST /wallet/withdraw
 * @desc    Request to withdraw funds
 * @access  Private (USER role only)
 */
router.post(
  "/wallet/withdraw",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const { amount, description } = req.body;
      const parsedAmount = parseFloat(amount);

      if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const balance = decimalToFloat(user.walletBalance);

      // Auto-approval mode
      if (process.env.APPROVAL_MODE === "auto") {
        if (balance < parsedAmount) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        user.walletBalance = mongoose.Types.Decimal128.fromString(
          (balance - parsedAmount).toFixed(2)
        );
        await user.save();

        const record = await WalletTransactionRecord.create({
          user: req.user.id,
          type: "withdraw",
          amount: mongoose.Types.Decimal128.fromString(parsedAmount.toFixed(2)),
          description: description || "Wallet withdrawal",
          status: "approved",
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
        });

        return res.json({
          message: "Withdrawal processed automatically",
          newBalance: decimalToFloat(user.walletBalance),
          transactionId: record._id,
        });
      }

      // Manual-approval mode
      if (balance < parsedAmount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }

      user.walletBalance = mongoose.Types.Decimal128.fromString(
        (balance - parsedAmount).toFixed(2)
      );
      await user.save();

      const record = await WalletTransactionRecord.create({
        user: req.user.id,
        type: "withdraw",
        amount: mongoose.Types.Decimal128.fromString(parsedAmount.toFixed(2)),
        description: description || "Wallet withdrawal",
        status: "pending",
      });

      return res.json({
        message:
          "Withdrawal request created, amount reserved, pending admin approval",
        newBalance: decimalToFloat(user.walletBalance),
        transactionId: record._id,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * @route   GET /wallet/transaction-records
 * @desc    Get paginated wallet transaction records (audit log)
 * @access  Private (USER role only)
 */
router.get(
  "/wallet/transaction-records",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      // Get page and limit from query, fallback to defaults
      let { page = 1, limit = 10 } = req.query;
      page = parseInt(page, 10);
      limit = parseInt(limit, 10);

      // Count total records for pagination metadata
      const total = await WalletTransactionRecord.countDocuments({
        user: req.user.id,
      });

      // Fetch paginated records
      const transactions = await WalletTransactionRecord.find({
        user: req.user.id,
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      const converted = transactions.map((tx) => ({
        ...tx,
        amount: decimalToFloat(tx.amount),
        referenceNumber: tx.referenceNumber || null,
      }));

      res.json({
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        content: converted,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
