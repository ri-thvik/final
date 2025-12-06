const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const logger = require('../utils/logger');

/**
 * Calculate surge multiplier based on demand and supply
 * @param {Number} lat - Pickup latitude
 * @param {Number} lng - Pickup longitude
 * @param {String} vehicleType - Vehicle type
 * @returns {Number} Surge multiplier (1.0 to 3.0)
 */
const calculateSurgeMultiplier = async (lat, lng, vehicleType) => {
    try {
        // Find nearby drivers of the requested vehicle type
        const nearbyDrivers = await Driver.countDocuments({
            vehicleType,
            status: 'online',
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: 5000 // 5km radius
                }
            }
        });

        // Find active trip requests in the area
        const activeRequests = await Trip.countDocuments({
            status: 'searching',
            vehicleType,
            'pickup.location': {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [lng, lat]
                    },
                    $maxDistance: 5000
                }
            },
            createdAt: {
                $gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
            }
        });

        // Calculate demand-to-supply ratio
        const demandSupplyRatio = nearbyDrivers > 0 
            ? activeRequests / nearbyDrivers 
            : activeRequests;

        // Time-based surge (rush hours: 7-10 AM, 5-8 PM)
        const now = new Date();
        const hour = now.getHours();
        const isRushHour = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20);
        const timeMultiplier = isRushHour ? 1.2 : 1.0;

        // Calculate surge multiplier
        let surgeMultiplier = 1.0;

        if (demandSupplyRatio > 2) {
            surgeMultiplier = 2.5; // High demand
        } else if (demandSupplyRatio > 1.5) {
            surgeMultiplier = 2.0; // Medium-high demand
        } else if (demandSupplyRatio > 1) {
            surgeMultiplier = 1.5; // Medium demand
        } else if (demandSupplyRatio > 0.5) {
            surgeMultiplier = 1.2; // Low-medium demand
        }

        // Apply time multiplier
        surgeMultiplier *= timeMultiplier;

        // Cap at 3.0x
        surgeMultiplier = Math.min(surgeMultiplier, 3.0);
        surgeMultiplier = Math.round(surgeMultiplier * 10) / 10;

        logger.info(`Surge multiplier calculated: ${surgeMultiplier}x for ${vehicleType} at (${lat}, ${lng})`);

        return surgeMultiplier;
    } catch (error) {
        logger.error(`Surge pricing calculation error: ${error.message}`);
        return 1.0; // Default to no surge on error
    }
};

/**
 * Calculate trip fare
 * @param {Number} distanceKm - Distance in kilometers
 * @param {Number} durationMinutes - Duration in minutes
 * @param {String} vehicleType - Vehicle type
 * @param {Number} surgeMultiplier - Surge multiplier
 * @returns {Object} Fare breakdown
 */
const calculateFare = (distanceKm, durationMinutes, vehicleType, surgeMultiplier = 1.0) => {
    // Base fares per vehicle type
    const baseFares = {
        bike: 20,
        auto: 30,
        car: 50
    };

    // Per km rates
    const perKmRates = {
        bike: 8,
        auto: 12,
        car: 18
    };

    // Per minute rates (for waiting/time)
    const perMinuteRates = {
        bike: 0.5,
        auto: 0.8,
        car: 1.2
    };

    const baseFare = baseFares[vehicleType] || 30;
    const distanceFare = distanceKm * (perKmRates[vehicleType] || 12);
    const timeFare = durationMinutes * (perMinuteRates[vehicleType] || 0.8);

    const subtotal = baseFare + distanceFare + timeFare;
    const surgeAmount = subtotal * (surgeMultiplier - 1);
    const totalFare = subtotal * surgeMultiplier;

    return {
        baseFare: Math.round(baseFare * 100) / 100,
        distanceFare: Math.round(distanceFare * 100) / 100,
        timeFare: Math.round(timeFare * 100) / 100,
        surgeMultiplier: Math.round(surgeMultiplier * 10) / 10,
        surgeAmount: Math.round(surgeAmount * 100) / 100,
        totalFare: Math.round(totalFare * 100) / 100
    };
};

/**
 * Calculate cancellation fee
 * @param {String} status - Current trip status
 * @param {Number} fare - Trip fare
 * @param {String} cancelledBy - Who cancelled (rider/driver)
 * @returns {Number} Cancellation fee
 */
const calculateCancellationFee = (status, fare, cancelledBy) => {
    // Free cancellation if driver hasn't been assigned
    if (status === 'searching') {
        return 0;
    }

    // If driver cancelled, no fee for rider
    if (cancelledBy === 'driver') {
        return 0;
    }

    // Rider cancellation fees based on status
    if (status === 'driver_assigned' || status === 'driver_arriving') {
        return Math.min(fare * 0.1, 50); // 10% or max ₹50
    }

    if (status === 'trip_started') {
        return Math.min(fare * 0.5, 200); // 50% or max ₹200
    }

    return 0;
};

module.exports = {
    calculateSurgeMultiplier,
    calculateFare,
    calculateCancellationFee
};

