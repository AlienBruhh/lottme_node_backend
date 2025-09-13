import express from "express";
import { ROLES } from "../../constants/roles.js";
import Lottery from "../../models/Lottery.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import LotteryResult from "../../models/LotteryResult.js";

const router = express.Router();

/**
 * 🎯 GET /lotteries/trending
 * Fetch top trending lotteries (by ticketsSold & estimatedPrize)
 */
router.get(
  "/lotteries/trending",
  authMiddleware([ROLES.USER]),
  async (req, res) => {
    try {
      const lotteries = await Lottery.find({
        "flags.isActive": true,
      })
        .lean()
        .sort({ ticketsSold: -1 }) // 👈 Sort by tickets sold (highest first)
        .limit(5); // top 5 trending

      return res.status(200).json({ lotteries });
    } catch (error) {
      console.error("Error fetching trending lotteries:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * 🎯 GET /lotteries/results/today
 * Fetch lotteries whose draw date is today (results pending or declared)
 */
router.get(
  "/lotteries/results/today",
  authMiddleware([ROLES.USER]),
  async (req, res) => {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const lotteries = await Lottery.find({
        drawDatetime: { $gte: startOfDay, $lte: endOfDay },
      })
        .lean()
        .select("_id title category endDatetime drawDatetime flags");

      const response = await Promise.all(
        lotteries.map(async (lottery) => {
          const result = await LotteryResult.findOne({
            lotteryId: lottery._id,
          }).lean();

          return {
            ...lottery,
            resultDeclared: !!result,
            totalWinners: result ? result.winners.length : 0,
          };
        })
      );

      return res.status(200).json({ lotteries: response });
    } catch (error) {
      console.error("Error fetching today’s results:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
