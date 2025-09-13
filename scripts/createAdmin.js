// server/scripts/create-admin.js
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js"; // must also be an ESM export

// Change as needed
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "adminpass123";
const ADMIN_NAME = "Admin";

(async () => {
  try {
    // Read Mongo URI from environment variable
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error("❌ MONGO_URI not found in .env file");
    }

    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const existing = await User.findOne({ email: ADMIN_EMAIL });

    if (existing) {
      console.log("Admin already exists.");
    } else {
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

      await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        passwordHash,
        role: "admin",
      });

      console.log("✅ Admin user created successfully!");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating admin:", err);
    process.exit(1);
  }
})();
