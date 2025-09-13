// models/WalletTransactionRecord.js
import mongoose from "mongoose";

const walletTransactionRecordSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["topup", "withdraw"], required: true },
  amount: { type: mongoose.Types.Decimal128, required: true },
  description: { type: String },
  referenceNumber: { type: String },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  relatedRequest: { type: mongoose.Schema.Types.ObjectId, refPath: "type" },
  rejectionReason: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: { type: Date },
});

walletTransactionRecordSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model(
  "WalletTransactionRecord",
  walletTransactionRecordSchema
);
