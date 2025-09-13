import mongoose from "mongoose";
import crypto from "crypto";

const WinnerSchema = new mongoose.Schema({
  rankRange: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  ticketNumber: { type: String, required: true },
  prizeAmount: { type: mongoose.Types.Decimal128, required: true },
  name: { type: String },
  email: { type: String },
});

const LotteryResultSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.UUID,
    default: () => crypto.randomUUID(),
  },
  lotteryId: {
    type: mongoose.Schema.Types.UUID,
    ref: "Lottery",
    required: true,
  },
  winners: [WinnerSchema],
  drawnAt: { type: Date, default: Date.now },
});

export default mongoose.model("LotteryResult", LotteryResultSchema);
