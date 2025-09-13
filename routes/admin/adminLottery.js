import express from "express";
import Lottery from "../../models/Lottery.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";
import mongoose from "mongoose";
import { LOTTERY_TYPES } from "../../constants/lottery-types.js";
import { DRAW_METHODS } from "../../constants/draw-methods.js";
import { LOTTERY_STATUS } from "../../constants/lottery-statuses.js";
import { drawLottery } from "../../services/drawLotteryService.js";

const router = express.Router();

/**
 * Create Lottery (no bulk ticket generation)
 */
router.post(
  "/create-lottery",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const {
        title,
        category,
        description,
        ticketPrice,
        maxTickets,
        maxTicketsPerUser,
        winnerStructure,
        drawMethod,
        startDatetime,
        imageUrl,
      } = req.body;

      // ✅ Required validation
      const requiredFields = {
        title,
        category,
        ticketPrice,
        maxTickets,
        drawMethod,
        startDatetime,
        winnerStructure,
      };
      for (const [key, value] of Object.entries(requiredFields)) {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
        ) {
          return res
            .status(400)
            .json({ error: `Missing required field: ${key}` });
        }
      }

      // ✅ Validate category
      const type = Object.values(LOTTERY_TYPES).find(
        (t) => t.name === category
      );
      if (!type) {
        return res.status(400).json({ error: "Invalid lottery category" });
      }

      if (!Object.values(DRAW_METHODS).includes(drawMethod)) {
        return res.status(400).json({ error: "Invalid draw method" });
      }

      // 🕒 Calculate timings using type.durationSeconds
      const start = new Date(startDatetime);
      const end = new Date(start.getTime() + type.durationSeconds * 1000);
      const draw = new Date(end.getTime() + 60 * 1000); // 1 min after end

      // 🔠 Generate Single Prefix
      const titleCode = title
        .split(" ")
        .map((w) => w[0])
        .join("")
        .substring(0, 2)
        .toUpperCase(); // "Premium Lottery" -> "PL"

      const formattedDate = `${start.getDate().toString().padStart(2, "0")}${(
        start.getMonth() + 1
      )
        .toString()
        .padStart(2, "0")}${start.getFullYear()}`;

      const prefix = `${titleCode}-${type.code}-${formattedDate}`;

      // 🎟️ Create Lottery
      const lottery = new Lottery({
        title,
        category: type.name,
        description,
        ticketPrice,
        maxTickets,
        maxTicketsPerUser: maxTicketsPerUser || 1,
        winnerStructure,
        drawMethod,
        startDatetime: start,
        endDatetime: end,
        drawDatetime: draw,
        imageUrl,
        status: LOTTERY_STATUS.DRAFT,
        flags: {
          isUpcoming: true,
          isActive: false,
          isEnded: false,
          resultAnnounced: false,
        },
        createdBy: req.user._id,
        lotteryPrefix: prefix,
      });

      await lottery.save();

      return res.status(201).json({
        message: "Lottery created successfully (tickets generated on demand)",
        lotteryId: lottery._id,
        prefixExample: `${prefix}-0000001`,
        totalTickets: lottery.maxTickets,
      });
    } catch (error) {
      console.error("Error creating lottery:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get(
  "/lotteries",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const lotteries = await Lottery.find().sort({ startDatetime: 1 });

      return res.status(200).json({
        lotteries: lotteries.map((lottery) => ({
          ...lottery.toObject(),
          _id: lottery._id.toString(),
        })),
      });
    } catch (error) {
      console.error("Error fetching lotteries:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * 🎯 POST /lottery/:id/draw
 * Secure draw with cryptographic shuffle + audit seed
 */
router.post(
  "/lottery/:id/draw",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      // ✅ Pass force = true for admin override
      const winners = await drawLottery(id, session, true);

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: "Lottery result drawn successfully",
        winners,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();

      console.error("Manual draw failed:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

export default router;
