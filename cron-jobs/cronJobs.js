import cron from "node-cron";
import Lottery from "../models/Lottery.js";
import { drawLottery } from "../services/drawLotteryService.js";

export function startCronJobs() {
  // Runs every minute
  cron.schedule("* * * * *", async () => {
    console.log("⏳ Running lottery maintenance...");

    const now = new Date();

    try {
      // 1️⃣ Mark lotteries as UPCOMING (future lotteries)
      const upcomingResult = await Lottery.updateMany(
        {
          "flags.isUpcoming": false,
          "flags.isActive": false,
          "flags.isEnded": false,
          startDatetime: { $gt: now },
        },
        { $set: { "flags.isUpcoming": true } }
      );

      if (upcomingResult.modifiedCount > 0) {
        console.log(
          `🕒 Marked ${upcomingResult.modifiedCount} lotteries as upcoming.`
        );
      }

      // 2️⃣ Mark lotteries as ACTIVE (started but not ended)
      const activeResult = await Lottery.updateMany(
        {
          "flags.isActive": false,
          "flags.isEnded": false,
          startDatetime: { $lte: now },
          endDatetime: { $gt: now },
        },
        { $set: { "flags.isActive": true, "flags.isUpcoming": false } }
      );

      if (activeResult.modifiedCount > 0) {
        console.log(
          `✅ Marked ${activeResult.modifiedCount} lotteries as active.`
        );
      }

      // 3️⃣ Mark lotteries as ENDED (time up OR all tickets sold)
      const endedResult = await Lottery.updateMany(
        {
          "flags.isEnded": false,
          $or: [
            { endDatetime: { $lte: now } },
            { $expr: { $gte: ["$ticketsSold", "$maxTickets"] } },
          ],
        },
        {
          $set: {
            "flags.isEnded": true,
            "flags.isActive": false,
            "flags.isUpcoming": false,
          },
        }
      );

      if (endedResult.modifiedCount > 0) {
        console.log(
          `✅ Marked ${endedResult.modifiedCount} lotteries as ended (time up or sold out).`
        );
      }

      // 4️⃣ Auto-draw lotteries that have ended but result not announced AND drawDatetime <= now
      const lotteriesToDraw = await Lottery.find({
        "flags.resultAnnounced": false,
        "flags.isEnded": true,
        drawDatetime: { $lte: now },
      });

      for (const lottery of lotteriesToDraw) {
        try {
          if (lottery.ticketsSold === 0) {
            // No tickets sold → skip actual draw but mark as resultAnnounced
            await Lottery.updateOne(
              { _id: lottery._id },
              { $set: { "flags.resultAnnounced": true } }
            );
            console.log(
              `⚠️ Lottery ${lottery._id} has no tickets sold. Marked as resultAnnounced without drawing.`
            );
            continue;
          }

          // Tickets sold → do normal draw
          console.log(`🎲 Auto-drawing lottery ${lottery._id}...`);
          await drawLottery(lottery._id);

          await Lottery.updateOne(
            { _id: lottery._id },
            { $set: { "flags.resultAnnounced": true } }
          );

          console.log(`🏆 Results announced for lottery ${lottery._id}.`);
        } catch (err) {
          console.error(`❌ Auto draw failed for ${lottery._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error("❌ Cron job error:", err.message);
    }
  });
}
