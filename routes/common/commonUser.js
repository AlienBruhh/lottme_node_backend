import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js"; // Make sure roles.js uses `export`

const router = express.Router();

// Protect route, allow any authenticated user (USER or ADMIN)
router.get(
  "/get-user-details",
  authMiddleware([ROLES.USER, ROLES.ADMIN], [ROLES.USER, ROLES.ADMIN]),
  (req, res) => {
    res.json({ user: req.user });
  }
);

export default router;
