// models/TopUpRequest.js
import mongoose from "mongoose";

const topUpRequestSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: mongoose.Types.Decimal128, required: true },
  description: { type: String, default: "Wallet top-up" },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
  reviewedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin who reviewed
});

export default mongoose.model("TopUpRequest", topUpRequestSchema);
