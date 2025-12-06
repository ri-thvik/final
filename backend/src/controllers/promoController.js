const PromoCode = require('../models/PromoCode');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

// @desc    Validate promo code
// @route   POST /api/promos/validate
// @access  Private
exports.validatePromo = async (req, res) => {
    try {
        const { code, amount, vehicleType } = req.body;

        if (!code || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Code and amount are required'
            });
        }

        const promo = await PromoCode.findOne({
            code: code.toUpperCase(),
            isActive: true
        });

        if (!promo) {
            return res.status(404).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        // Check validity dates
        const now = new Date();
        if (now < promo.validFrom || now > promo.validUntil) {
            return res.status(400).json({
                success: false,
                message: 'Promo code has expired'
            });
        }

        // Check max uses
        if (promo.maxUses && promo.currentUses >= promo.maxUses) {
            return res.status(400).json({
                success: false,
                message: 'Promo code usage limit reached'
            });
        }

        // Check minimum amount
        if (amount < promo.minAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum amount of ₹${promo.minAmount} required`
            });
        }

        // Check vehicle type
        if (promo.applicableTo !== 'all' && promo.applicableTo !== vehicleType) {
            return res.status(400).json({
                success: false,
                message: `This promo code is not applicable for ${vehicleType}`
            });
        }

        // Calculate discount
        let discount = 0;
        if (promo.discountType === 'percentage') {
            discount = (amount * promo.discountValue) / 100;
            if (promo.maxDiscount) {
                discount = Math.min(discount, promo.maxDiscount);
            }
        } else {
            discount = promo.discountValue;
        }

        const finalAmount = Math.max(0, amount - discount);

        res.status(200).json({
            success: true,
            data: {
                code: promo.code,
                discount: Math.round(discount * 100) / 100,
                finalAmount: Math.round(finalAmount * 100) / 100,
                description: promo.description
            }
        });
    } catch (err) {
        logger.error(`Validate promo error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error validating promo code'
        });
    }
};

// @desc    Apply promo code
// @route   POST /api/promos/apply
// @access  Private
exports.applyPromo = async (req, res) => {
    try {
        const { code, tripId, amount } = req.body;

        const promo = await PromoCode.findOne({
            code: code.toUpperCase(),
            isActive: true
        });

        if (!promo) {
            return res.status(404).json({
                success: false,
                message: 'Invalid promo code'
            });
        }

        // Check if user has already used this code
        const userPromoUsage = await Payment.countDocuments({
            userId: req.user.id,
            'metadata.promoCode': promo.code
        });

        if (userPromoUsage >= promo.maxUsesPerUser) {
            return res.status(400).json({
                success: false,
                message: 'You have already used this promo code'
            });
        }

        // Increment usage
        promo.currentUses += 1;
        await promo.save();

        res.status(200).json({
            success: true,
            message: 'Promo code applied successfully',
            data: {
                code: promo.code,
                discount: promo.discountType === 'percentage' 
                    ? Math.min((amount * promo.discountValue) / 100, promo.maxDiscount || Infinity)
                    : promo.discountValue
            }
        });
    } catch (err) {
        logger.error(`Apply promo error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error applying promo code'
        });
    }
};

// @desc    Get all active promo codes
// @route   GET /api/promos
// @access  Public
exports.getPromos = async (req, res) => {
    try {
        const promos = await PromoCode.find({
            isActive: true,
            validFrom: { $lte: new Date() },
            validUntil: { $gte: new Date() }
        }).select('code description discountType discountValue minAmount maxDiscount applicableTo');

        res.status(200).json({
            success: true,
            data: promos
        });
    } catch (err) {
        logger.error(`Get promos error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching promo codes'
        });
    }
};

