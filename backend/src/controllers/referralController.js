const Referral = require('../models/Referral');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

// @desc    Generate referral code
// @route   POST /api/referrals/generate
// @access  Private
exports.generateReferralCode = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user.referralCode) {
            // Generate unique referral code
            const code = `REF${user.phone.slice(-6)}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
            user.referralCode = code;
            await user.save();
        }

        res.status(200).json({
            success: true,
            data: {
                code: user.referralCode
            }
        });
    } catch (err) {
        logger.error(`Generate referral code error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error generating referral code'
        });
    }
};

// @desc    Apply referral code
// @route   POST /api/referrals/apply
// @access  Public
exports.applyReferralCode = async (req, res) => {
    try {
        const { code, phone } = req.body;

        if (!code || !phone) {
            return res.status(400).json({
                success: false,
                message: 'Referral code and phone are required'
            });
        }

        // Find referrer
        const referrer = await User.findOne({ referralCode: code.toUpperCase() });
        if (!referrer) {
            return res.status(404).json({
                success: false,
                message: 'Invalid referral code'
            });
        }

        // Check if user is trying to refer themselves
        if (referrer.phone === phone) {
            return res.status(400).json({
                success: false,
                message: 'You cannot use your own referral code'
            });
        }

        // Check if user already exists
        const referredUser = await User.findOne({ phone });
        if (!referredUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found. Please register first'
            });
        }

        // Check if referral already exists
        const existingReferral = await Referral.findOne({ referredId: referredUser._id });
        if (existingReferral) {
            return res.status(400).json({
                success: false,
                message: 'Referral code already applied'
            });
        }

        // Create referral
        const referral = await Referral.create({
            referrerId: referrer._id,
            referredId: referredUser._id,
            referralCode: code.toUpperCase(),
            status: 'pending'
        });

        res.status(200).json({
            success: true,
            message: 'Referral code applied successfully',
            data: referral
        });
    } catch (err) {
        logger.error(`Apply referral code error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error applying referral code'
        });
    }
};

// @desc    Complete referral (when referred user completes first trip)
// @route   POST /api/referrals/complete
// @access  Private
exports.completeReferral = async (req, res) => {
    try {
        const { tripId } = req.body;

        // Find referral for this user
        const referral = await Referral.findOne({
            referredId: req.user.id,
            status: 'pending'
        });

        if (!referral) {
            return res.status(404).json({
                success: false,
                message: 'No pending referral found'
            });
        }

        // Check if this is user's first trip
        const Trip = require('../models/Trip');
        const tripCount = await Trip.countDocuments({
            riderId: req.user.id,
            status: 'trip_completed'
        });

        if (tripCount > 1) {
            return res.status(400).json({
                success: false,
                message: 'Referral can only be completed on first trip'
            });
        }

        // Update referral status
        referral.status = 'completed';
        referral.completedAt = new Date();
        await referral.save();

        // Reward referrer
        const rewardAmount = 100; // ₹100 reward
        const referrer = await User.findById(referral.referrerId);
        referrer.wallet.balance = (referrer.wallet.balance || 0) + rewardAmount;
        await referrer.save();

        // Create transaction for referrer
        await Transaction.create({
            userId: referrer._id,
            type: 'credit',
            category: 'referral_reward',
            amount: rewardAmount,
            balance: referrer.wallet.balance,
            description: 'Referral reward',
            referenceId: referral._id.toString(),
            referenceType: 'referral',
            status: 'completed'
        });

        // Reward referred user
        const referredReward = 50; // ₹50 for new user
        const referredUser = await User.findById(req.user.id);
        referredUser.wallet.balance = (referredUser.wallet.balance || 0) + referredReward;
        await referredUser.save();

        await Transaction.create({
            userId: referredUser._id,
            type: 'credit',
            category: 'referral_reward',
            amount: referredReward,
            balance: referredUser.wallet.balance,
            description: 'Welcome bonus',
            referenceId: referral._id.toString(),
            referenceType: 'referral',
            status: 'completed'
        });

        referral.status = 'rewarded';
        referral.rewardAmount = rewardAmount;
        referral.rewardedAt = new Date();
        await referral.save();

        res.status(200).json({
            success: true,
            message: 'Referral completed and rewards credited',
            data: {
                referrerReward: rewardAmount,
                referredReward: referredReward
            }
        });
    } catch (err) {
        logger.error(`Complete referral error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error completing referral'
        });
    }
};

// @desc    Get referral stats
// @route   GET /api/referrals/stats
// @access  Private
exports.getReferralStats = async (req, res) => {
    try {
        const referrals = await Referral.find({ referrerId: req.user.id });
        
        const stats = {
            totalReferrals: referrals.length,
            completedReferrals: referrals.filter(r => r.status === 'completed' || r.status === 'rewarded').length,
            totalRewards: referrals.reduce((sum, r) => sum + (r.rewardAmount || 0), 0),
            pendingReferrals: referrals.filter(r => r.status === 'pending').length
        };

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (err) {
        logger.error(`Get referral stats error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching referral stats'
        });
    }
};

