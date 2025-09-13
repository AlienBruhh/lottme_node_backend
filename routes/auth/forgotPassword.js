import express from "express";
import crypto from "crypto";
import User from "../../models/User.js"; // Ensure .js extension is present

const router = express.Router();

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(200)
        .json({ message: "If an account exists, a reset link has been sent." });
    }

    if (user.isDeleted) {
      return res.status(403).json({ error: "Account has been deleted." });
    }

    if (user.blocked) {
      return res
        .status(403)
        .json({ error: "Account is blocked. Please contact support." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    // TODO: Replace with actual email sending
    console.log(
      `Reset link: http://yourfrontend.com/auth/reset-password?token=${token}`
    );

    res.json({
      message: "Password reset instructions have been sent to your email.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res
      .status(500)
      .json({ error: "Unexpected server error. Please try again." });
  }
});

export default router;
