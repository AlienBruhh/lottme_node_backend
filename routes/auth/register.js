// server/routes/auth/register.js
import express from "express";
import bcrypt from "bcryptjs";
import User from "../../models/User.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required." });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email, passwordHash: hash });
    await user.save();

    res
      .status(201)
      .json({ message: "Registration successful. Please log in." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Unexpected server error. Please try again." });
  }
});

export default router;
