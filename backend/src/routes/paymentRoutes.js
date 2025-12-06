const express = require('express');
const {
    createOrder,
    verifyPayment,
    getTransactions,
    getWalletBalance
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const { paymentValidation } = require('../middleware/validator');

const router = express.Router();

router.post('/create-order', protect, paymentLimiter, paymentValidation, createOrder);
router.post('/verify', protect, paymentLimiter, verifyPayment);
router.get('/transactions', protect, getTransactions);
router.get('/wallet', protect, getWalletBalance);

module.exports = router;

