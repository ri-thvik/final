const Rating = require('../models/Rating');
const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Submit rating
// @route   POST /api/ratings
// @access  Private
exports.submitRating = async (req, res) => {
    try {
        const { tripId, rating, review, categories, ratingBy } = req.body;

        // Validate trip exists
        const trip = await Trip.findById(tripId);
        if (!trip) {
            return res.status(404).json({
                success: false,
                message: 'Trip not found'
            });
        }

        // Check if user is authorized to rate
        const isRider = trip.riderId.toString() === req.user.id.toString();
        const driver = await Driver.findOne({ userId: req.user.id });
        const isDriver = driver && trip.driverId && trip.driverId.toString() === driver._id.toString();

        if (!isRider && !isDriver) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to rate this trip'
            });
        }

        // Determine who is rating
        const actualRatingBy = ratingBy || (isRider ? 'rider' : 'driver');
        const targetDriverId = trip.driverId;
        const targetRiderId = trip.riderId;

        // Check if rating already exists
        const existingRating = await Rating.findOne({
            tripId,
            ratingBy: actualRatingBy
        });

        if (existingRating) {
            return res.status(400).json({
                success: false,
                message: 'You have already rated this trip'
            });
        }

        // Create rating
        const newRating = await Rating.create({
            tripId,
            riderId: targetRiderId,
            driverId: targetDriverId,
            ratingBy: actualRatingBy,
            rating,
            review: review || '',
            categories: categories || {}
        });

        // Populate references
        await newRating.populate('riderId', 'name phone');
        await newRating.populate('driverId', 'vehicleModel vehicleNumber');

        logger.info(`Rating submitted for trip ${tripId} by ${actualRatingBy}`);

        res.status(201).json({
            success: true,
            data: newRating
        });
    } catch (err) {
        logger.error(`Submit rating error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error submitting rating'
        });
    }
};

// @desc    Get ratings for driver
// @route   GET /api/ratings/driver/:driverId
// @access  Private
exports.getDriverRatings = async (req, res) => {
    try {
        const { driverId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const ratings = await Rating.find({
            driverId,
            ratingBy: 'rider',
            isVisible: true
        })
            .populate('riderId', 'name')
            .populate('tripId', 'pickup drop')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Rating.countDocuments({
            driverId,
            ratingBy: 'rider',
            isVisible: true
        });

        // Calculate average rating
        const allRatings = await Rating.find({
            driverId,
            ratingBy: 'rider',
            isVisible: true
        });
        const avgRating = allRatings.length > 0
            ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
            : 0;

        res.status(200).json({
            success: true,
            data: {
                ratings,
                averageRating: Math.round(avgRating * 10) / 10,
                totalRatings: total
            },
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get driver ratings error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching driver ratings'
        });
    }
};

// @desc    Get ratings for rider
// @route   GET /api/ratings/rider/:riderId
// @access  Private
exports.getRiderRatings = async (req, res) => {
    try {
        const { riderId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const ratings = await Rating.find({
            riderId,
            ratingBy: 'driver',
            isVisible: true
        })
            .populate('driverId', 'vehicleModel vehicleNumber')
            .populate('tripId', 'pickup drop')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Rating.countDocuments({
            riderId,
            ratingBy: 'driver',
            isVisible: true
        });

        res.status(200).json({
            success: true,
            data: ratings,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get rider ratings error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching rider ratings'
        });
    }
};

// @desc    Get user's rating history
// @route   GET /api/ratings/my-ratings
// @access  Private
exports.getMyRatings = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Get driver profile if user is driver
        const driver = await Driver.findOne({ userId: req.user.id });
        
        // Build query based on user role
        let query = {};
        if (driver) {
            query = { driverId: driver._id, ratingBy: 'driver' };
        } else {
            query = { riderId: req.user.id, ratingBy: 'rider' };
        }

        // Get ratings given by user
        const ratingsGiven = await Rating.find(query)
            .populate('tripId', 'pickup drop fare')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Rating.countDocuments(query);

        res.status(200).json({
            success: true,
            data: ratingsGiven,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get my ratings error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching ratings'
        });
    }
};

