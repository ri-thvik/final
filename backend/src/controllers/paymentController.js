const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Trip = require('../models/Trip');
const logger = require('../utils/logger');

// Initialize Razorpay only if credentials are provided
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    logger.info('Razorpay payment gateway initialized');
} else {
    logger.warn('Razorpay credentials not configured - payment gateway disabled');
}

// @desc    Create payment order
// @route   POST /api/payments/create-order
// @access  Private
exports.createOrder = async (req, res) => {
    try {
        const { amount, tripId, paymentMethod } = req.body;

        if (!amount || amount < 1) {
            return res.status(400).json({
                success: false,
                message: 'Invalid amount'
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // If payment method is wallet, check balance
        if (paymentMethod === 'wallet') {
            if (user.wallet.balance < amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance'
                });
            }

            // Process wallet payment directly
            return processWalletPayment(req, res, amount, tripId, user);
        }

        // Create Razorpay order
        if (!razorpay) {
            return res.status(503).json({
                success: false,
                message: 'Payment gateway not configured. Please use wallet payment or contact support.'
            });
        }

        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: `trip_${tripId || Date.now()}`,
            notes: {
                userId: req.user.id,
                tripId: tripId || null
            }
        };

        const order = await razorpay.orders.create(options);

        // Create payment record
        const payment = await Payment.create({
            userId: req.user.id,
            tripId: tripId || null,
            type: tripId ? 'trip_payment' : 'wallet_topup',
            amount: amount,
            status: 'pending',
            paymentMethod: paymentMethod || 'razorpay',
            paymentGateway: {
                provider: 'razorpay',
                orderId: order.id
            }
        });

        res.status(200).json({
            success: true,
            data: {
                orderId: order.id,
                amount: order.amount / 100,
                currency: order.currency,
                paymentId: payment._id,
                key: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (err) {
        logger.error(`Payment order creation error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error creating payment order'
        });
    }
};

// @desc    Verify payment
// @route   POST /api/payments/verify
// @access  Private
exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

        // Verify signature
        const sign = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest('hex');

        if (razorpay_signature !== expectedSign) {
            return res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }

        // Update payment record
        const payment = await Payment.findById(paymentId);
        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        payment.status = 'completed';
        payment.paymentGateway.paymentId = razorpay_payment_id;
        payment.paymentGateway.signature = razorpay_signature;
        payment.completedAt = Date.now();
        await payment.save();

        // Create transaction record
        const user = await User.findById(req.user.id);
        const newBalance = (user.wallet.balance || 0) + payment.amount;

        await Transaction.create({
            userId: req.user.id,
            type: 'credit',
            category: payment.type === 'wallet_topup' ? 'wallet_topup' : 'trip_payment',
            amount: payment.amount,
            balance: newBalance,
            description: payment.type === 'wallet_topup' ? 'Wallet top-up' : 'Trip payment',
            referenceId: payment._id.toString(),
            referenceType: 'payment',
            status: 'completed'
        });

        // Update user wallet
        user.wallet.balance = newBalance;
        await user.save();

        // If it's a trip payment, update trip status
        if (payment.tripId) {
            const trip = await Trip.findById(payment.tripId);
            if (trip) {
                trip.fare.paid = true;
                await trip.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            data: payment
        });
    } catch (err) {
        logger.error(`Payment verification error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error verifying payment'
        });
    }
};

// Process wallet payment
const processWalletPayment = async (req, res, amount, tripId, user) => {
    try {
        // Deduct from wallet
        const newBalance = user.wallet.balance - amount;

        // Create payment record
        const payment = await Payment.create({
            userId: req.user.id,
            tripId: tripId || null,
            type: tripId ? 'trip_payment' : 'wallet_withdrawal',
            amount: amount,
            status: 'completed',
            paymentMethod: 'wallet',
            completedAt: Date.now()
        });

        // Create transaction record
        await Transaction.create({
            userId: req.user.id,
            type: 'debit',
            category: tripId ? 'trip_payment' : 'wallet_withdrawal',
            amount: amount,
            balance: newBalance,
            description: tripId ? 'Trip payment' : 'Wallet withdrawal',
            referenceId: payment._id.toString(),
            referenceType: 'payment',
            status: 'completed'
        });

        // Update user wallet
        user.wallet.balance = newBalance;
        await user.save();

        // Update trip if applicable
        if (tripId) {
            const trip = await Trip.findById(tripId);
            if (trip) {
                trip.fare.paid = true;
                await trip.save();
            }
        }

        res.status(200).json({
            success: true,
            message: 'Payment processed successfully',
            data: payment
        });
    } catch (err) {
        logger.error(`Wallet payment error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error processing wallet payment'
        });
    }
};

// @desc    Get transaction history
// @route   GET /api/payments/transactions
// @access  Private
exports.getTransactions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const transactions = await Transaction.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Transaction.countDocuments({ userId: req.user.id });

        res.status(200).json({
            success: true,
            data: transactions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get transactions error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching transactions'
        });
    }
};

// @desc    Get wallet balance
// @route   GET /api/payments/wallet
// @access  Private
exports.getWalletBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                balance: user.wallet.balance || 0,
                currency: user.wallet.currency || 'INR'
            }
        });
    } catch (err) {
        logger.error(`Get wallet balance error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching wallet balance'
        });
    }
};

