import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * Update wallet balance and store transaction
 * @param {String} userId - User's ID
 * @param {Number|String} amount - Amount to change (positive for credit, negative for debit)
 * @param {String} description - Description of the transaction
 */
export async function updateWallet(
  userId,
  amount,
  description = "",
  session = null
) {
  if (!amount || isNaN(amount)) {
    throw new Error("Invalid amount");
  }

  let externalSession = !!session;
  if (!externalSession) {
    session = await mongoose.startSession();
    session.startTransaction();
  }

  try {
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    if (user.role !== "user") throw new Error("Only users have wallets");

    const currentBalance = parseFloat(user.walletBalance.toString());
    const change = parseFloat(amount);
    const newBalance = currentBalance + change;

    if (newBalance < 0) {
      const err = new Error("Insufficient funds");
      err.code = "INSUFFICIENT_FUNDS";
      throw err;
    }

    user.walletBalance = mongoose.Types.Decimal128.fromString(
      newBalance.toFixed(2)
    );
    await user.save({ session });

    await Transaction.create(
      [
        {
          user: user._id,
          amount: mongoose.Types.Decimal128.fromString(
            Math.abs(change).toFixed(2)
          ),
          type: change >= 0 ? "credit" : "debit",
          description,
          balanceAfter: mongoose.Types.Decimal128.fromString(
            newBalance.toFixed(2)
          ),
        },
      ],
      { session }
    );

    if (!externalSession) {
      await session.commitTransaction();
      session.endSession();
    }

    return { balance: newBalance };
  } catch (err) {
    if (!externalSession) {
      await session.abortTransaction();
      session.endSession();
    }
    throw err;
  }
}
