// routes/common/lotteryTypeConst.js
import express from "express";
import { LOTTERY_TYPES } from "../../constants/lottery-types.js";

const router = express.Router();

// 🎯 GET /lottery-types/const
// Fetch all lottery types from constant for frontend
router.get("/lottery-types", (req, res) => {
  try {
    // Convert the LOTTERY_TYPES object to an array
    const types = Object.values(LOTTERY_TYPES).map((type) => ({
      name: type.name,
      code: type.code,
      durationSeconds: type.durationSeconds,
    }));

    return res.status(200).json({ types });
  } catch (error) {
    console.error("Error fetching lottery types from constants:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
