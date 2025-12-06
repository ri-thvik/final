const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Create support ticket
// @route   POST /api/support/tickets
// @access  Private
exports.createTicket = async (req, res) => {
    try {
        const { type, subject, description, tripId, priority } = req.body;

        if (!type || !subject || !description) {
            return res.status(400).json({
                success: false,
                message: 'Type, subject, and description are required'
            });
        }

        const ticket = await SupportTicket.create({
            userId: req.user.id,
            type,
            subject,
            description,
            tripId: tripId || null,
            priority: priority || 'medium',
            messages: [{
                sender: req.user.id,
                message: description
            }]
        });

        await ticket.populate('userId', 'name phone email');

        logger.info(`Support ticket created: ${ticket._id}`);

        res.status(201).json({
            success: true,
            data: ticket
        });
    } catch (err) {
        logger.error(`Create ticket error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error creating support ticket'
        });
    }
};

// @desc    Get user's tickets
// @route   GET /api/support/tickets
// @access  Private
exports.getTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status;

        const query = { userId: req.user.id };
        if (status) {
            query.status = status;
        }

        const tickets = await SupportTicket.find(query)
            .populate('tripId', 'pickup drop fare')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await SupportTicket.countDocuments(query);

        res.status(200).json({
            success: true,
            data: tickets,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get tickets error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching tickets'
        });
    }
};

// @desc    Get ticket details
// @route   GET /api/support/tickets/:id
// @access  Private
exports.getTicket = async (req, res) => {
    try {
        const ticket = await SupportTicket.findById(req.params.id)
            .populate('userId', 'name phone email')
            .populate('tripId', 'pickup drop fare')
            .populate('messages.sender', 'name');

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user owns the ticket
        if (ticket.userId._id.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (err) {
        logger.error(`Get ticket error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching ticket'
        });
    }
};

// @desc    Add message to ticket
// @route   POST /api/support/tickets/:id/messages
// @access  Private
exports.addMessage = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user owns the ticket
        if (ticket.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        ticket.messages.push({
            sender: req.user.id,
            message
        });

        if (ticket.status === 'resolved' || ticket.status === 'closed') {
            ticket.status = 'open';
        }

        await ticket.save();
        await ticket.populate('messages.sender', 'name');

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (err) {
        logger.error(`Add message error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error adding message'
        });
    }
};

// @desc    Update ticket status
// @route   PUT /api/support/tickets/:id/status
// @access  Private
exports.updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const ticket = await SupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                success: false,
                message: 'Ticket not found'
            });
        }

        // Check if user owns the ticket
        if (ticket.userId.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        ticket.status = status;
        if (status === 'resolved' || status === 'closed') {
            ticket.resolvedAt = new Date();
        }

        await ticket.save();

        res.status(200).json({
            success: true,
            data: ticket
        });
    } catch (err) {
        logger.error(`Update ticket status error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error updating ticket status'
        });
    }
};

