import express from "express";
import bcryptjs from "bcryptjs";
import User from "../../models/User.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

/**
 * @desc Get all users (ADMIN only) with optional search by name, email, or mobileNo
 */
router.get(
  "/users",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { search } = req.query;

      let query = {};

      if (search) {
        const regex = new RegExp(search, "i"); // case-insensitive search
        query = {
          $or: [{ name: regex }, { email: regex }, { mobileNo: regex }],
        };
      }

      const users = await User.find(query).select("-passwordHash");
      return res.status(200).json({ users });
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @desc Soft delete a user (mark as deleted for 30 days)
 */
router.delete(
  "/users/:id",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const deletedUser = await User.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
      );

      if (!deletedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message:
          "User marked as deleted. Will be permanently removed after 30 days.",
        user: deletedUser,
      });
    } catch (error) {
      console.error("Error soft deleting user:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @desc Recover a soft-deleted user
 */
router.patch(
  "/users/:id/recover",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const recoveredUser = await User.findByIdAndUpdate(
        id,
        { isDeleted: false, deletedAt: null },
        { new: true }
      ).select("-passwordHash");

      if (!recoveredUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message: "User account recovered successfully",
        user: recoveredUser,
      });
    } catch (error) {
      console.error("Error recovering user:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @desc Edit user details (name, email, role)
 */
router.put(
  "/users/:id",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, role } = req.body;

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { name, email, role },
        { new: true, runValidators: true }
      ).select("-passwordHash");

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res
        .status(200)
        .json({ message: "User updated", user: updatedUser });
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @desc Change user password
 */
router.put(
  "/users/:id/password",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters long" });
      }

      const passwordHash = await bcryptjs.hash(newPassword, 10);
      const user = await User.findByIdAndUpdate(
        id,
        { passwordHash },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * @desc Block or unblock user
 */
router.patch(
  "/users/:id/block",
  authMiddleware([ROLES.ADMIN], [ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { blocked } = req.body; // true = block, false = unblock

      const user = await User.findByIdAndUpdate(
        id,
        { blocked: Boolean(blocked) },
        { new: true }
      ).select("-passwordHash");

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({
        message: `User ${blocked ? "blocked" : "unblocked"} successfully`,
        user,
      });
    } catch (error) {
      console.error("Error blocking/unblocking user:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
