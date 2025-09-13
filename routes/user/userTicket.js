import express from "express";
import TicketPurchase from "../../models/TicketPurchase.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import { ROLES } from "../../constants/roles.js";
import mongoose from "mongoose";

const router = express.Router();

router.get(
  "/active-purchased-lotteries",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const userId = req.user._id;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // First, get ALL user tickets with populated lottery
      const tickets = await TicketPurchase.find({ userId })
        .populate({
          path: "lotteryId",
          match: { "flags.isActive": true },
          select:
            "title category drawDatetime winnerStructure numWinners estimatedPrize flags",
        })
        .sort({ purchasedAt: -1 });

      // Keep only tickets with active lotteries
      const activeTickets = tickets.filter((t) => t.lotteryId);

      // Calculate total count BEFORE slicing
      const totalItems = activeTickets.length;
      const totalPages = Math.ceil(totalItems / limit);

      // Apply pagination on filtered list
      const paginatedTickets = activeTickets.slice(skip, skip + limit);

      const formattedTickets = paginatedTickets.map((t) => ({
        _id: t._id,
        quantity: t.quantity,
        perTicketPrice: t.perTicketPrice,
        totalPrice: t.totalPrice,
        purchasedAt: t.purchasedAt,
        lotteryDetails: {
          lotteryId: t.lotteryId._id,
          title: t.lotteryId.title,
          category: t.lotteryId.category,
          drawDatetime: t.lotteryId.drawDatetime,
          estimatedPrize: t.lotteryId.estimatedPrize,
        },
      }));

      return res.status(200).json({
        tickets: formattedTickets,
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          pageSize: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching active user tickets:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /tickets/inactive-purchased-lotteries - only inactive lotteries
router.get(
  "/inactive-purchased-lotteries",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const userId = req.user._id;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Fetch all tickets, don't paginate yet
      const tickets = await TicketPurchase.find({ userId })
        .populate({
          path: "lotteryId",
          match: { "flags.isActive": false },
          select:
            "title category drawDatetime winnerStructure numWinners estimatedPrize flags",
        })
        .sort({ purchasedAt: -1 });

      // Filter out only inactive lotteries
      const inactiveTickets = tickets.filter((t) => t.lotteryId);

      // Calculate total count BEFORE slicing
      const totalItems = inactiveTickets.length;
      const totalPages = Math.ceil(totalItems / limit);

      // Apply pagination AFTER filtering
      const paginatedTickets = inactiveTickets.slice(skip, skip + limit);

      const formattedTickets = paginatedTickets.map((t) => ({
        _id: t._id,
        quantity: t.quantity,
        perTicketPrice: t.perTicketPrice,
        totalPrice: t.totalPrice,
        purchasedAt: t.purchasedAt,
        lotteryDetails: {
          lotteryId: t.lotteryId._id,
          title: t.lotteryId.title,
          category: t.lotteryId.category,
          drawDatetime: t.lotteryId.drawDatetime,
          estimatedPrize: t.lotteryId.estimatedPrize,
        },
      }));

      return res.status(200).json({
        tickets: formattedTickets,
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          pageSize: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching inactive user tickets:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ✅ GET /tickets/:ticketId - get details of a single purchased ticket (lightweight, no ticketNumbers)
router.get(
  "/purchased-lotteries/:ticketId/details",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user._id;

      // validate ID
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      // Find the ticket by ID and user ownership
      const ticket = await TicketPurchase.findOne({
        _id: ticketId,
        userId,
      }).populate({
        path: "lotteryId",
        select: "title category drawDatetime winnerStructure numWinners",
      });

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // 🚫 Removed ticketNumbers (they are now fetched from the new paginated API)
      const formattedTicket = {
        _id: ticket._id,
        quantity: ticket.quantity,
        perTicketPrice: ticket.perTicketPrice,
        totalPrice: ticket.totalPrice,
        purchasedAt: ticket.purchasedAt,
        lotteryDetails: ticket.lotteryId
          ? {
              lotteryId: ticket.lotteryId?._id,
              title: ticket.lotteryId.title,
              category: ticket.lotteryId.category,
              drawDatetime: ticket.lotteryId.drawDatetime,
              winnerStructure: ticket.lotteryId.winnerStructure,
              numWinners: ticket.lotteryId.numWinners,
            }
          : null,
      };

      return res.status(200).json(formattedTicket);
    } catch (error) {
      console.error("Error fetching ticket details:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ✅ GET /purchased-lotteries/:ticketId/ticket-numbers (paginated ticket numbers)
router.get(
  "/purchased-lotteries/:ticketId/ticket-numbers",
  authMiddleware([ROLES.USER], [ROLES.USER]),
  async (req, res) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user._id;

      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20; // default 20 tickets per page
      const skip = (page - 1) * limit;

      // Find the ticket purchase (ownership check included)
      const ticket = await TicketPurchase.findOne({
        _id: ticketId,
        userId,
      }).select("ticketNumbers quantity purchasedAt");

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Paginate ticket numbers
      const totalItems = ticket.ticketNumbers.length;
      const totalPages = Math.ceil(totalItems / limit);

      const paginatedTicketNumbers = ticket.ticketNumbers.slice(
        skip,
        skip + limit
      );

      return res.status(200).json({
        ticketId: ticket._id,
        quantity: ticket.quantity,
        purchasedAt: ticket.purchasedAt,
        ticketNumbers: paginatedTicketNumbers,
        pagination: {
          totalItems,
          totalPages,
          currentPage: page,
          pageSize: limit,
        },
      });
    } catch (error) {
      console.error("Error fetching paginated ticket numbers:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
