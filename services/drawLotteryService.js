// services/drawService.js
import Lottery from "../models/Lottery.js";
import TicketPurchase from "../models/TicketPurchase.js";
import LotteryResult from "../models/LotteryResult.js";
import mongoose from "mongoose";
import { updateWallet } from "./walletService.js";

export async function drawLottery(lotteryId, session = null, force = false) {
  let localSession = null;
  if (!session) {
    localSession = await mongoose.startSession();
    session = localSession;
    session.startTransaction();
  }

  try {
    // 🔍 Validate lottery
    const lottery = await Lottery.findById(lotteryId).session(session);
    if (!lottery) throw new Error("Lottery not found");
    if (lottery.flags.resultAnnounced)
      throw new Error("Result already announced");

    const now = new Date();
    const endedByTime = now >= new Date(lottery.endDatetime);
    const endedByTickets =
      lottery.flags.isEnded && lottery.ticketsSold >= lottery.maxTickets;
    const reachedDrawTime = now >= new Date(lottery.drawDatetime);

    // ⛔ Only block if not forced and drawDatetime not reached
    if (!force && !reachedDrawTime) {
      throw new Error("Lottery draw time not reached yet");
    }

    // Also check that lottery is ended before draw (time or tickets)
    if (!endedByTime && !endedByTickets && !force) {
      throw new Error("Lottery not ended yet");
    }

    // 📦 Get all tickets
    const purchases = await TicketPurchase.find({ lotteryId })
      .populate("userId", "name email")
      .session(session);

    const allTickets = [];
    purchases.forEach((p) => {
      p.ticketNumbers.forEach((num) => {
        allTickets.push({
          ticketNumber: num,
          userId: p.userId._id,
          name: p.userId.name || "Unknown",
          email: p.userId.email || "N/A",
        });
      });
    });

    if (allTickets.length === 0)
      throw new Error("No tickets sold for this lottery");

    // 🎲 Shuffle
    const shuffled = allTickets.sort(() => Math.random() - 0.5);

    // 🏆 Pick winners
    const winners = [];
    let currentIndex = 0;
    let rankCounter = 1; // 👈 keep track of actual rank

    for (const ws of lottery.winnerStructure) {
      const groupSize = ws.toRank - ws.fromRank + 1;

      for (let i = 0; i < groupSize && currentIndex < shuffled.length; i++) {
        const winnerTicket = shuffled[currentIndex++];

        winners.push({
          rank: rankCounter, // 👈 actual rank number
          rankRange: `${ws.fromRank}-${ws.toRank}`,
          userId: winnerTicket.userId,
          ticketNumber: winnerTicket.ticketNumber,
          prizeAmount: ws.prizeAmount,
          name: winnerTicket.name,
          email: winnerTicket.email,
        });

        // 💰 Credit wallet
        await updateWallet(
          winnerTicket.userId,
          Number(ws.prizeAmount.toString()),
          `Prize for lottery ${lottery.title} (Ticket ${winnerTicket.ticketNumber})`,
          session
        );

        rankCounter++; // 👈 increment after assigning
      }
    }

    // 💾 Save result
    const result = new LotteryResult({
      lotteryId,
      winners,
    });
    await result.save({ session });

    // 🔄 Update lottery
    lottery.flags.resultAnnounced = true;
    await lottery.save({ session });

    if (localSession) {
      await session.commitTransaction();
      session.endSession();
    }

    return winners;
  } catch (err) {
    if (localSession) {
      await session.abortTransaction();
      session.endSession();
    }
    throw err;
  }
}
