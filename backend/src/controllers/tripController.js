const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');

// @desc    Create a new trip
// @route   POST /api/trips
// @access  Private
exports.createTrip = async (req, res) => {
    try {
        const { vehicleType, pickup, drop, fare, stops, isScheduled, scheduledTime, promoCode } = req.body;

        // Calculate distance and duration (simplified)
        const distance = calculateDistance(
            pickup.lat, pickup.lng,
            drop.lat, drop.lng
        );
        const duration = Math.round(distance * 3); // Approximate: 3 min per km

        // Apply surge pricing
        const surgePricingService = require('../services/surgePricingService');
        const surgeMultiplier = await surgePricingService.calculateSurgeMultiplier(
            pickup.lat, pickup.lng, vehicleType
        );

        // Calculate fare with surge
        const fareBreakdown = surgePricingService.calculateFare(
            distance, duration, vehicleType, surgeMultiplier
        );

        // Apply promo code if provided
        let finalFare = fareBreakdown.totalFare;
        let appliedPromo = null;
        if (promoCode) {
            const PromoCode = require('../models/PromoCode');
            const promo = await PromoCode.findOne({ code: promoCode.toUpperCase(), isActive: true });
            if (promo) {
                const now = new Date();
                if (now >= promo.validFrom && now <= promo.validUntil) {
                    let discount = 0;
                    if (promo.discountType === 'percentage') {
                        discount = (finalFare * promo.discountValue) / 100;
                        if (promo.maxDiscount) discount = Math.min(discount, promo.maxDiscount);
                    } else {
                        discount = promo.discountValue;
                    }
                    finalFare = Math.max(0, finalFare - discount);
                    appliedPromo = promo.code;
                }
            }
        }

        const tripData = {
            riderId: req.user.id,
            vehicleType,
            pickup: {
                address: pickup.address,
                location: {
                    type: 'Point',
                    coordinates: [pickup.lng, pickup.lat]
                }
            },
            drop: {
                address: drop.address,
                location: {
                    type: 'Point',
                    coordinates: [drop.lng, drop.lat]
                }
            },
            fare: {
                amount: Math.round(finalFare * 100) / 100,
                currency: 'INR',
                baseFare: fareBreakdown.baseFare,
                distanceFare: fareBreakdown.distanceFare,
                timeFare: fareBreakdown.timeFare,
                surgeMultiplier: fareBreakdown.surgeMultiplier,
                surgeAmount: fareBreakdown.surgeAmount
            },
            distance: Math.round(distance * 100) / 100,
            duration: duration,
            status: isScheduled ? 'scheduled' : 'searching',
            isScheduled: isScheduled || false,
            scheduledTime: scheduledTime || null
        };

        // Add stops if provided
        if (stops && stops.length > 0) {
            tripData.stops = stops.map((stop, index) => ({
                address: stop.address,
                location: {
                    type: 'Point',
                    coordinates: [stop.lng, stop.lat]
                },
                order: index + 1
            }));
        }

        const trip = await Trip.create(tripData);
        await trip.populate('riderId', 'name phone');

        // Matching is handled via sockets (ride:request) once the rider confirms.
        // We keep the trip in "searching" until a driver accepts.

        logger.info(`Trip created: ${trip._id}`);

        res.status(201).json({ 
            success: true, 
            data: trip,
            appliedPromo: appliedPromo
        });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Helper function to calculate distance
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Simplified matching logic
const findDriver = async (tripId) => {
    try {
        const trip = await Trip.findById(tripId);
        if (!trip) return;

        // Find nearest online driver of same vehicle type
        const drivers = await Driver.find({
            vehicleType: trip.vehicleType,
            status: 'online',
            location: {
                $near: {
                    $geometry: trip.pickup.location,
                    $maxDistance: 5000 // 5km
                }
            }
        }).limit(1);

        if (drivers.length > 0) {
            const driver = drivers[0];
            // Assign driver (in real app, send offer first)
            trip.driverId = driver._id;
            trip.status = 'driver_assigned';
            trip.otp = Math.floor(1000 + Math.random() * 9000).toString();
            await trip.save();

            // Update driver status
            driver.status = 'busy';
            await driver.save();

            logger.info(`Driver ${driver._id} assigned to trip ${trip._id}`);
        } else {
            logger.info(`No drivers found for trip ${trip._id}`);
        }
    } catch (err) {
        logger.error(`Matching error: ${err.message}`);
    }
};

// @desc    Get trip history
// @route   GET /api/trips
// @access  Private
exports.getTripHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const userRole = req.user.role;

        // Build query based on user role
        let query = {};
        if (userRole === 'rider') {
            query.riderId = req.user.id;
        } else if (userRole === 'driver') {
            const driver = await Driver.findOne({ userId: req.user.id });
            if (driver) {
                query.driverId = driver._id;
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Driver profile not found'
                });
            }
        }

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        const trips = await Trip.find(query)
            .populate('riderId', 'name phone')
            .populate('driverId', 'vehicleModel vehicleNumber')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Trip.countDocuments(query);

        res.status(200).json({
            success: true,
            data: trips,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`Get trip history error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get trip details
// @route   GET /api/trips/:id
// @access  Private
exports.getTrip = async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id)
            .populate('driverId')
            .populate('riderId', 'name phone');
        if (!trip) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }
        res.status(200).json({ success: true, data: trip });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Accept a trip (driver)
// @route   POST /api/trips/:id/accept
// @access  Private
exports.acceptTrip = async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);

        if (!trip) {
            logger.error(`Trip not found: ${req.params.id}`);
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        logger.info(`Trip ${trip._id} current status: ${trip.status}`);

        // Accept if searching or pending
        if (trip.status !== 'searching' && trip.status !== 'pending') {
            logger.warn(`Trip ${trip._id} is ${trip.status}, cannot accept`);
            return res.status(400).json({
                success: false,
                message: `Trip is ${trip.status}, not available`
            });
        }

        // Find driver profile
        const driver = await Driver.findOne({ userId: req.user.id });
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver profile not found' });
        }

        // Update trip
        trip.driverId = driver._id;
        trip.status = 'driver_assigned';
        trip.otp = Math.floor(1000 + Math.random() * 9000).toString();
        await trip.save();

        // Update driver status
        driver.status = 'busy';
        await driver.save();

        // Populate driver and rider info
        await trip.populate('driverId');
        await trip.populate('riderId');

        logger.info(`Driver ${driver._id} accepted trip ${trip._id}`);

        res.status(200).json({ success: true, data: trip });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Reject a trip (driver)
// @route   POST /api/trips/:id/reject
// @access  Private
exports.rejectTrip = async (req, res) => {
    try {
        const trip = await Trip.findById(req.params.id);

        if (!trip) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        logger.info(`Trip ${trip._id} rejected by driver`);

        res.status(200).json({ success: true, message: 'Trip rejected' });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update trip status
// @route   PUT /api/trips/:id/status
// @access  Private
exports.updateTripStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const trip = await Trip.findById(req.params.id);

        if (!trip) {
            return res.status(404).json({ success: false, message: 'Trip not found' });
        }

        // Validate status transitions
        const validStatuses = ['driver_assigned', 'driver_arrived', 'trip_started', 'trip_completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        trip.status = status;

        if (status === 'trip_completed') {
            trip.completedAt = Date.now();

            // Update driver status back to online
            const driver = await Driver.findById(trip.driverId);
            if (driver) {
                driver.status = 'online';
                driver.metrics.totalTrips += 1;
                driver.metrics.totalEarnings += trip.fare.amount;
                await driver.save();
            }
        }

        await trip.save();
        await trip.populate('driverId');
        await trip.populate('riderId');

        logger.info(`Trip ${trip._id} status updated to ${status}`);

        res.status(200).json({ success: true, data: trip });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
