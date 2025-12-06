const express = require('express');
const {
    createTicket,
    getTickets,
    getTicket,
    addMessage,
    updateTicketStatus
} = require('../controllers/supportController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/tickets', protect, createTicket);
router.get('/tickets', protect, getTickets);
router.get('/tickets/:id', protect, getTicket);
router.post('/tickets/:id/messages', protect, addMessage);
router.put('/tickets/:id/status', protect, updateTicketStatus);

module.exports = router;

