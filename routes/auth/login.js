// server/routes/auth/login.js
import express from "express";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res
        .status(400)
        .json({ error: "Email and password are required." });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(401).json({ error: "Invalid email or password." });

    if (user.isDeleted) {
      return res.status(403).json({ error: "This account is deleted, you can register again after 30 days." });
    }

    if (user.blocked) {
      return res
        .status(403)
        .json({ error: "Account is blocked. Please contact support." });
    }

    const match = await user.comparePassword(password);
    if (!match)
      return res.status(401).json({ error: "Invalid email or password." });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Unexpected server error. Please try again." });
  }
});

export default router;
