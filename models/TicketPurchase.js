import mongoose from "mongoose";
import crypto from "crypto";

const TicketPurchaseSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.UUID,
    default: () => crypto.randomUUID(),
  },
  lotteryId: {
    type: mongoose.Schema.Types.UUID,
    ref: "Lottery",
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  ticketNumbers: { type: [String], required: true },
  quantity: { type: Number, required: true },
  perTicketPrice: { type: Number, required: true },  // 💰 Price of one ticket
  totalPrice: { type: Number, required: true },      // 💰 Total cost of purchase
  purchasedAt: { type: Date, default: Date.now },
});

export default mongoose.model("TicketPurchase", TicketPurchaseSchema);
