import mongoose from "mongoose";
import crypto from "crypto";
import { LOTTERY_STATUS } from "../constants/lottery-statuses.js";
import { DRAW_METHOD_NAMES } from "../constants/draw-methods.js";
import { LOTTERY_TYPE_NAMES } from "../constants/lottery-types.js";

// Sub-schema for winners
const WinnerStructureSchema = new mongoose.Schema(
  {
    fromRank: { type: Number, required: true },
    toRank: { type: Number, required: true },
    prizeAmount: { type: mongoose.Types.Decimal128, required: true },
  },
  { _id: false }
);

const LotterySchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.UUID,
    default: () => crypto.randomUUID(),
  },

  title: { type: String, required: true },
  description: { type: String },

  ticketPrice: { type: mongoose.Types.Decimal128, required: true },
  maxTickets: { type: Number, required: true },
  maxTicketsPerUser: { type: Number, default: 1 },

  winnerStructure: [WinnerStructureSchema],

  startDatetime: { type: Date, required: true },
  endDatetime: { type: Date, required: true },
  drawDatetime: { type: Date, required: true },

  category: {
    type: String,
    enum: LOTTERY_TYPE_NAMES,
    required: true,
  },

  drawMethod: {
    type: String,
    enum: DRAW_METHOD_NAMES,
    required: true,
  },

  imageUrl: { type: String },

  ticketsSold: { type: Number, default: 0 },

  status: {
    type: String,
    enum: Object.values(LOTTERY_STATUS),
    default: LOTTERY_STATUS.DRAFT,
  },

  flags: {
    isUpcoming: { type: Boolean, default: true }, // NEW
    isActive: { type: Boolean, default: false },
    isEnded: { type: Boolean, default: false },
    resultAnnounced: { type: Boolean, default: false },
  },

  lotteryPrefix: { type: String, required: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Virtual: Number of winners
LotterySchema.virtual("numWinners").get(function () {
  if (!this.winnerStructure || this.winnerStructure.length === 0) return 0;
  return this.winnerStructure.reduce(
    (total, w) => total + (w.toRank - w.fromRank + 1),
    0
  );
});

// Virtual: Estimated total prize
LotterySchema.virtual("estimatedPrize").get(function () {
  if (!this.winnerStructure || this.winnerStructure.length === 0) return 0;
  return this.winnerStructure.reduce((total, w) => {
    const winnersCount = w.toRank - w.fromRank + 1;
    return total + winnersCount * parseFloat(w.prizeAmount.toString());
  }, 0);
});

// Virtual: Current status for frontend logic
LotterySchema.virtual("currentStatus").get(function () {
  const now = new Date();

  if (this.flags.resultAnnounced) return "closed"; // hide from user
  if (this.flags.isEnded) return "ended"; // sold out or expired
  if (this.flags.isActive) return "active"; // ongoing
  if (this.flags.isUpcoming || this.startDatetime > now) return "upcoming"; // future

  return "draft"; // fallback
});

// JSON & Object virtuals
LotterySchema.set("toJSON", { virtuals: true });
LotterySchema.set("toObject", { virtuals: true });

// Indexes to optimize cron queries & updates
LotterySchema.index({ "flags.isActive": 1, startDatetime: 1, endDatetime: 1 });
LotterySchema.index({ "flags.isEnded": 1, endDatetime: 1 });
LotterySchema.index({ "flags.resultAnnounced": 1, "flags.isEnded": 1 });
LotterySchema.index({ "flags.resultAnnounced": 1, endDatetime: 1 });

export default mongoose.model("Lottery", LotterySchema);
