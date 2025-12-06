const Trip = require('../models/Trip');
const Driver = require('../models/Driver');
const User = require('../models/User');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');

// @desc    Get driver analytics
// @route   GET /api/analytics/driver
// @access  Private
exports.getDriverAnalytics = async (req, res) => {
    try {
        const driver = await Driver.findOne({ userId: req.user.id });
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver profile not found'
            });
        }

        const period = req.query.period || 'month'; // week, month, year
        let startDate;
        const now = new Date();

        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        // Get trips
        const trips = await Trip.find({
            driverId: driver._id,
            status: 'trip_completed',
            completedAt: { $gte: startDate }
        });

        // Calculate metrics
        const totalTrips = trips.length;
        const totalEarnings = trips.reduce((sum, trip) => sum + (trip.fare.amount || 0), 0);
        const avgEarningPerTrip = totalTrips > 0 ? totalEarnings / totalTrips : 0;
        const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);
        const avgRating = driver.metrics.avgRating || 0;

        // Daily breakdown
        const dailyData = {};
        trips.forEach(trip => {
            if (trip.completedAt) {
                const date = new Date(trip.completedAt).toISOString().split('T')[0];
                if (!dailyData[date]) {
                    dailyData[date] = { trips: 0, earnings: 0, distance: 0 };
                }
                dailyData[date].trips += 1;
                dailyData[date].earnings += trip.fare.amount || 0;
                dailyData[date].distance += trip.distance || 0;
            }
        });

        // Vehicle type breakdown
        const vehicleBreakdown = {};
        trips.forEach(trip => {
            if (!vehicleBreakdown[trip.vehicleType]) {
                vehicleBreakdown[trip.vehicleType] = { trips: 0, earnings: 0 };
            }
            vehicleBreakdown[trip.vehicleType].trips += 1;
            vehicleBreakdown[trip.vehicleType].earnings += trip.fare.amount || 0;
        });

        res.status(200).json({
            success: true,
            data: {
                period,
                summary: {
                    totalTrips,
                    totalEarnings: Math.round(totalEarnings * 100) / 100,
                    avgEarningPerTrip: Math.round(avgEarningPerTrip * 100) / 100,
                    totalDistance: Math.round(totalDistance * 100) / 100,
                    avgRating: Math.round(avgRating * 10) / 10,
                    acceptanceRate: driver.metrics.acceptanceRate || 0,
                    cancellationRate: driver.metrics.cancellationRate || 0
                },
                dailyBreakdown: Object.entries(dailyData).map(([date, data]) => ({
                    date,
                    trips: data.trips,
                    earnings: Math.round(data.earnings * 100) / 100,
                    distance: Math.round(data.distance * 100) / 100
                })),
                vehicleBreakdown: Object.entries(vehicleBreakdown).map(([type, data]) => ({
                    type,
                    trips: data.trips,
                    earnings: Math.round(data.earnings * 100) / 100
                }))
            }
        });
    } catch (err) {
        logger.error(`Get driver analytics error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching analytics'
        });
    }
};

// @desc    Get platform analytics (admin)
// @route   GET /api/analytics/platform
// @access  Private (Admin only - add admin check)
exports.getPlatformAnalytics = async (req, res) => {
    try {
        const period = req.query.period || 'month';
        let startDate;
        const now = new Date();

        switch (period) {
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const [totalUsers, totalDrivers, totalTrips, totalRevenue] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: startDate } }),
            Driver.countDocuments({ createdAt: { $gte: startDate } }),
            Trip.countDocuments({ createdAt: { $gte: startDate } }),
            Payment.aggregate([
                {
                    $match: {
                        status: 'completed',
                        createdAt: { $gte: startDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ])
        ]);

        res.status(200).json({
            success: true,
            data: {
                period,
                totalUsers,
                totalDrivers,
                totalTrips,
                totalRevenue: totalRevenue[0]?.total || 0
            }
        });
    } catch (err) {
        logger.error(`Get platform analytics error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching platform analytics'
        });
    }
};

