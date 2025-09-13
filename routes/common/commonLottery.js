import express from "express";
import mongoose from "mongoose";
import { validate as isUUID } from "uuid";
import Lottery from "../../models/Lottery.js";
import TicketPurchase from "../../models/TicketPurchase.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";
import { computeLotteryFlags } from "../../utils/computeLotteryFlags.js";
import { updateWallet } from "../../services/walletService.js";
import LotteryResult from "../../models/LotteryResult.js";

const router = express.Router();

/**
 * 🎯 GET /public-lotteries
 * List active, upcoming, and ended lotteries (excluding closed)
 */
router.get(
  "/public-lotteries",
  authMiddleware([ROLES.USER, ROLES.ADMIN]),
  async (req, res) => {
    try {
      // Fetch all lotteries
      const lotteries = await Lottery.find({}).lean();

      // Filter and map lotteries for public display
      const publicLotteries = lotteries
        .filter((lottery) => !lottery.flags?.resultAnnounced) // hide closed lotteries
        .map((lottery) => {
          // Safely compute estimated prize
          const estimatedPrize =
            lottery.winnerStructure?.reduce((total, w) => {
              const winnersCount = w.toRank - w.fromRank + 1;
              return total + winnersCount * Number(w.prizeAmount.toString());
            }, 0) || 0;

          return {
            _id: lottery._id.toString(),
            title: lottery.title,
            category: lottery.category,
            description: lottery.description,
            ticketPrice: Number(lottery.ticketPrice?.toString() || 0),
            ticketsSold: lottery.ticketsSold,
            maxTickets: lottery.maxTickets,
            ticketsRemaining: lottery.maxTickets - lottery.ticketsSold,
            startDatetime: lottery.startDatetime,
            endDatetime: lottery.endDatetime,
            drawDatetime: lottery.drawDatetime,
            imageUrl: lottery.imageUrl,
            estimatedPrize,
            currentStatus: lottery.currentStatus, // virtual for frontend logic
            flags: {
              isUpcoming: lottery.flags?.isUpcoming,
              isActive: lottery.flags?.isActive,
              isEnded: lottery.flags?.isEnded,
              resultAnnounced: lottery.flags?.resultAnnounced,
            },
          };
        });

      return res.status(200).json({ lotteries: publicLotteries });
    } catch (error) {
      console.error("Error fetching public lotteries:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * 🎯 GET /lottery/:id/details
 * Fetch full details of a lottery
 */
router.get(
  "/lottery/:id/details",
  authMiddleware([ROLES.USER, ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isUUID(id)) {
        return res.status(400).json({ error: "Invalid lotteryId" });
      }

      const lottery = await Lottery.findById(id).lean();
      if (!lottery) {
        return res.status(404).json({ error: "Lottery not found" });
      }

      // ✅ Normalize decimal fields and compute estimated prize
      const estimatedPrize =
        lottery.winnerStructure?.reduce((total, w) => {
          const winnersCount = w.toRank - w.fromRank + 1;
          return total + winnersCount * Number(w.prizeAmount.toString());
        }, 0) || 0;

      // Ensure flags exist and include isUpcoming
      const flags = {
        isUpcoming: lottery.flags?.isUpcoming ?? false,
        isActive: lottery.flags?.isActive ?? false,
        isEnded: lottery.flags?.isEnded ?? false,
        resultAnnounced: lottery.flags?.resultAnnounced ?? false,
      };

      return res.status(200).json({
        ...lottery,
        ticketPrice: Number(lottery.ticketPrice?.toString() || 0),
        maxTickets: Number(lottery.maxTickets || 0),
        maxTicketsPerUser: Number(lottery.maxTicketsPerUser || 0),
        ticketsSold: Number(lottery.ticketsSold || 0),
        winnerStructure: lottery.winnerStructure?.map((w) => ({
          fromRank: w.fromRank,
          toRank: w.toRank,
          prizeAmount: Number(w.prizeAmount?.toString() || 0),
        })),
        estimatedPrize,
        flags,
      });
    } catch (error) {
      console.error("Error fetching lottery details:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// 🎯 GET /lottery/:id/available-tickets (Paginated)
router.get(
  "/lottery/:id/available-tickets",
  authMiddleware([ROLES.USER, ROLES.ADMIN]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        search = "",
        page = 1,
        limit = 10, // default 10 items per page
      } = req.query;

      // ✅ Validate UUID (make sure you import isUUID from "validator")
      if (!isUUID(id)) {
        return res.status(400).json({ error: "Invalid lotteryId" });
      }

      // ✅ Fetch lottery by UUID
      const lottery = await Lottery.findById(id).lean();
      if (!lottery) {
        return res.status(404).json({ error: "Lottery not found" });
      }

      // ✅ Fetch sold tickets for this lottery
      const purchases = await TicketPurchase.find({
        lotteryId: lottery._id,
      }).lean();
      const soldTickets = purchases.flatMap((p) => p.ticketNumbers);
      const soldTicketsSet = new Set(soldTickets); // Faster lookup

      // ✅ Generate all available tickets using single lotteryPrefix
      let availableTickets = [];
      for (let i = 1; i <= lottery.maxTickets; i++) {
        const ticketNum = `${lottery.lotteryPrefix}-${String(i).padStart(
          4,
          "0"
        )}`;
        if (!soldTicketsSet.has(ticketNum)) {
          availableTickets.push(ticketNum);
        }
      }

      // ✅ Filter by search query if provided
      if (search.trim()) {
        const searchLower = search.toLowerCase();
        availableTickets = availableTickets.filter((t) =>
          t.toLowerCase().includes(searchLower)
        );
      }

      // ✅ Pagination
      const totalAvailable = availableTickets.length;
      const perPage = Math.max(1, parseInt(limit, 10));
      const totalPages = Math.ceil(totalAvailable / perPage);
      const currentPage = Math.min(
        Math.max(1, parseInt(page, 10)),
        totalPages || 1
      );

      const startIndex = (currentPage - 1) * perPage;
      const paginatedTickets = availableTickets.slice(
        startIndex,
        startIndex + perPage
      );

      return res.status(200).json({
        lotteryId: lottery._id,
        totalAvailable,
        totalPages,
        currentPage,
        perPage,
        tickets: paginatedTickets,
      });
    } catch (error) {
      console.error("Error fetching available tickets:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * 🎯 POST /lottery/:id/purchase
 * User purchases specific ticket numbers or auto-assigns
 */
router.post(
  "/lottery/:id/purchase",
  authMiddleware([ROLES.USER]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { quantity, chosenTickets = [] } = req.body;

      // 🔍 Validate quantity
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ error: "Invalid ticket quantity" });
      }

      // 🔍 Validate lotteryId format
      if (!isUUID(id)) {
        return res.status(400).json({ error: "Invalid lotteryId" });
      }

      // 📦 Fetch lottery
      const lottery = await Lottery.findById(id).session(session);
      if (!lottery) {
        return res.status(404).json({ error: "Lottery not found" });
      }

      // 📅 Check lottery status
      const flags = computeLotteryFlags(lottery);
      if (!flags.isActive || flags.isEnded) {
        return res.status(400).json({ error: "Lottery is not active" });
      }

      // 🏷 Get already sold tickets
      const purchases = await TicketPurchase.find({
        lotteryId: lottery._id,
      }).session(session);
      const soldTickets = purchases.flatMap((p) => p.ticketNumbers);
      const soldTicketsSet = new Set(soldTickets);

      // 🎟 Build list of available tickets
      const availableTickets = [];
      for (let i = 1; i <= lottery.maxTickets; i++) {
        const ticketNum = `${lottery.lotteryPrefix}-${String(i).padStart(
          4,
          "0"
        )}`;
        if (!soldTicketsSet.has(ticketNum)) {
          availableTickets.push(ticketNum);
        }
      }
      const availableTicketsSet = new Set(availableTickets);

      // 🧮 Check per-user ticket limit
      const existingPurchase = await TicketPurchase.findOne({
        lotteryId: lottery._id,
        userId: req.user._id,
      }).session(session);

      const existingQty = existingPurchase ? existingPurchase.quantity : 0;
      if (existingQty + quantity > lottery.maxTicketsPerUser) {
        return res.status(400).json({
          error: `Cannot purchase more than ${lottery.maxTicketsPerUser} ticket(s) for this lottery.`,
        });
      }

      // ✅ Determine tickets to buy
      let ticketsToBuy;
      if (chosenTickets.length > 0) {
        const expectedPrefix = `${lottery.lotteryPrefix}-`;
        const invalid = chosenTickets.filter(
          (t) => !t.startsWith(expectedPrefix) || !availableTicketsSet.has(t)
        );

        if (invalid.length > 0) {
          return res.status(400).json({
            error: "Some chosen tickets are invalid or already sold",
            invalid,
          });
        }

        if (chosenTickets.length !== quantity) {
          return res.status(400).json({
            error: "Quantity does not match chosen tickets count",
          });
        }
        ticketsToBuy = chosenTickets;
      } else {
        if (availableTickets.length < quantity) {
          return res
            .status(400)
            .json({ error: "Not enough tickets available" });
        }
        ticketsToBuy = availableTickets.slice(0, quantity);
      }

      // 💰 Ensure price is numeric
      const ticketPrice = Number(lottery.ticketPrice.toString());
      const qty = Number(quantity);

      if (isNaN(ticketPrice) || isNaN(qty)) {
        return res
          .status(400)
          .json({ error: "Invalid ticket price or quantity" });
      }

      const totalCost = ticketPrice * qty;

      // Deduct Money from wallet
      await updateWallet(
        req.user._id,
        -totalCost,
        `Purchase ${qty} ticket(s) for ${lottery.title}`,
        session
      );

      // 🔄 Upsert purchase record
      if (existingPurchase) {
        existingPurchase.ticketNumbers.push(...ticketsToBuy);
        existingPurchase.quantity += qty;
        existingPurchase.totalPrice =
          (existingPurchase.totalPrice || 0) + totalCost;
        existingPurchase.perTicketPrice = ticketPrice;
        await existingPurchase.save({ session });
      } else {
        const newPurchase = new TicketPurchase({
          lotteryId: lottery._id,
          userId: req.user._id,
          ticketNumbers: ticketsToBuy,
          quantity: qty,
          perTicketPrice: ticketPrice,
          totalPrice: totalCost,
        });
        await newPurchase.save({ session });
      }

      // 📈 Update tickets sold count
      lottery.ticketsSold += qty;
      await lottery.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(201).json({
        message: "Tickets purchased successfully",
        tickets: ticketsToBuy,
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      console.error("Error purchasing tickets:", error);

      if (error.code === "INSUFFICIENT_FUNDS") {
        return res.status(400).json({
          error: "You don't have enough funds to complete this purchase.",
        });
      }
      if (error.message === "User not found") {
        return res
          .status(404)
          .json({ error: "Your account could not be found." });
      }
      if (error.message === "Only users have wallets") {
        return res.status(403).json({
          error: "Wallet transactions are only allowed for user accounts.",
        });
      }
      if (error.name === "ValidationError") {
        return res.status(400).json({
          error: "Invalid data provided.",
          details: error.errors,
        });
      }

      return res.status(500).json({
        error: "Something went wrong. Please try again later.",
      });
    }
  }
);

// GET /api/lotteries/results
// Example queries:
//   /api/lotteries/results?date=2025-08-18&page=1&limit=20
//   /api/lotteries/results?last30=true&page=1&limit=20

// ✅ GET /api/lotteries/results
// Example queries:
//   /api/lotteries/results?date=2025-08-18&page=1&limit=20
//   /api/lotteries/results?last30=true&page=1&limit=20
//   /api/lotteries/results?today=true&page=1&limit=20

router.get("/lotteries/results", async (req, res) => {
  try {
    const { date, last30, today, page = 1, limit = 10 } = req.query;

    let startDate, endDate;

    if (today) {
      // ✅ Today's results only
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    } else if (date) {
      // ✅ Specific date results
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else if (last30) {
      // ✅ Last 30 days
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    } else {
      // ✅ Default: last 30 days
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }

    // Pagination setup
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const perPage = parseInt(limit);

    // ✅ Query: result must be announced + within date range
    const query = {
      "flags.resultAnnounced": true,
      endDatetime: { $gte: startDate, $lte: endDate },
    };

    const [results, total] = await Promise.all([
      Lottery.find(query).sort({ endDatetime: -1 }).skip(skip).limit(perPage),
      Lottery.countDocuments(query),
    ]);

    return res.status(200).json({
      results,
      pagination: {
        total,
        page: parseInt(page),
        limit: perPage,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (err) {
    console.error("Error fetching lottery results:", err);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * 🎯 GET /lottery/:id/result
 * Fetch results of a specific lottery
 */
router.get(
  "/lottery/:id/result",
  authMiddleware([ROLES.ADMIN, ROLES.USER], [ROLES.ADMIN, ROLES.USER]), // both admin & user can view
  async (req, res) => {
    try {
      const { id } = req.params;

      const lottery = await Lottery.findById(id);
      if (!lottery) {
        return res.status(404).json({ error: "Lottery not found" });
      }

      const result = await LotteryResult.findOne({ lotteryId: id }).lean();
      if (!result) {
        return res.status(404).json({ error: "Result not declared yet" });
      }

      return res.status(200).json({
        lottery: {
          _id: lottery._id,
          title: lottery.title,
          category: lottery.category,
          endDatetime: lottery.endDatetime,
          drawDatetime: lottery.drawDatetime,
        },
        winners: result.winners,
        createdAt: result.createdAt,
      });
    } catch (error) {
      console.error("Error fetching result:", error);
      return res.status(500).json({ error: "Failed to fetch result" });
    }
  }
);

/**
 * 🎯 GET /lottery/:id/result
 * Fetch lottery details + result metadata (without winners)
 */
router.get(
  "/lottery/:id/result/details",
  authMiddleware([ROLES.ADMIN, ROLES.USER]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const lottery = await Lottery.findById(id).lean();
      if (!lottery) {
        return res.status(404).json({ error: "Lottery not found" });
      }

      const result = await LotteryResult.findOne({ lotteryId: id }).lean();
      if (!result) {
        return res.status(404).json({ error: "Result not declared yet" });
      }

      return res.status(200).json({
        lottery: {
          _id: lottery._id,
          title: lottery.title,
          category: lottery.category,
          endDatetime: lottery.endDatetime,
          drawDatetime: lottery.drawDatetime,
        },
        result: {
          createdAt: result.createdAt,
          totalWinners: result.winners.length,
        },
      });
    } catch (error) {
      console.error("Error fetching result:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/**
 * 🎯 GET /lottery/:id/result/winners?page=1&limit=20&search=LOT123
 * Fetch paginated winners with optional search by lottery number
 */
router.get(
  "/lottery/:id/result/winners",
  authMiddleware([ROLES.ADMIN, ROLES.USER]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      const search = req.query.search ? req.query.search.trim() : null;

      const result = await LotteryResult.findOne({ lotteryId: id }).lean();
      if (!result) {
        return res.status(404).json({ error: "Result not declared yet" });
      }

      // Winners list
      let winners = result.winners;

      // 🔍 Apply search by lottery number (if provided)
      if (search) {
        winners = winners.filter((w) =>
          w.lotteryNumber?.toString().includes(search)
        );
      }

      // ✨ Mask utilities
      const maskName = (fullName = "") => {
        const parts = fullName.trim().split(" ");
        return parts
          .map((part) => {
            if (part.length <= 2) {
              return part[0] + "**"; // very short names
            }
            if (part.length <= 3) {
              return part.slice(0, 2) + "**"; // keep 2 letters + 2 stars
            }
            return part.slice(0, 3) + "**"; // always 3 letters + 2 stars
          })
          .join(" ");
      };

      const maskEmail = (email = "") => {
        const [local, domain] = email.split("@");
        if (!domain) return email; // fallback

        const [domainName, tld] = domain.split(".");
        if (!domainName || !tld) return email;

        const maskedLocal =
          local.length <= 2 ? local[0] + "**" : local.slice(0, 2) + "**";

        const maskedDomain =
          domainName.length <= 1 ? domainName[0] + "**" : domainName[0] + "**";

        const maskedTld = tld.length <= 1 ? tld[0] + "**" : tld[0] + "**";

        return `${maskedLocal}@${maskedDomain}.${maskedTld}`;
      };

      // 🛠 Apply masking + prizeAmount conversion
      const maskedWinners = winners.map((w) => ({
        ...w,
        name: w.name ? maskName(w.name) : null,
        email: w.email ? maskEmail(w.email) : null,
        prizeAmount: w.prizeAmount
          ? parseFloat(w.prizeAmount.$numberDecimal || w.prizeAmount.toString())
          : null,
      }));

      const totalItems = maskedWinners.length;
      const totalPages = Math.ceil(totalItems / limit);
      const paginatedWinners = maskedWinners.slice(skip, skip + limit);

      return res.status(200).json({
        winners: paginatedWinners,
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          pageSize: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching paginated winners:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
