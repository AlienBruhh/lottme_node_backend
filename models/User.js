import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import { ROLES } from "../constants/roles.js";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [ROLES.USER, ROLES.ADMIN],
      default: ROLES.USER,
    },
    walletBalance: {
      type: mongoose.Types.Decimal128,
      required: function () {
        // Only required if role is USER
        return this.role === ROLES.USER;
      },
      default: function () {
        // Only default if role is USER
        if (this.role === ROLES.USER) {
          return mongoose.Types.Decimal128.fromString("10000.00");
        }
        return undefined;
      },
    },
    resetToken: String,
    resetTokenExpiry: Date,
    blocked: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Instance method to check password
userSchema.methods.comparePassword = function (password) {
  return bcryptjs.compare(password, this.passwordHash);
};

const User = mongoose.model("User", userSchema);
export default User;
