const redis = require('../config/redis');
const Driver = require('../models/Driver');
const Trip = require('../models/Trip');
const logger = require('../utils/logger');

// Store trip to rider socket mapping
const tripToRiderSocket = new Map();

module.exports = (io) => {
    io.on('connection', (socket) => {
        logger.info(`New client connected: ${socket.id}`);

        // Join a room (e.g., 'driver:123', 'rider:456')
        socket.on('join', (room) => {
            socket.join(room);
            logger.info(`Socket ${socket.id} joined room ${room}`);
        });

        // Driver Location Update
        socket.on('location:update', async (data) => {
            // data: { driverId, lat, lng, bearing, speed }
            try {
                // Store location in Redis with TTL (5 minutes) - if Redis is available
                if (redis) {
                    try {
                        await redis.setex(
                            `driver:location:${data.driverId}`,
                            300,
                            JSON.stringify({
                                lat: data.lat,
                                lng: data.lng,
                                bearing: data.bearing || 0,
                                speed: data.speed || 0,
                                timestamp: Date.now()
                            })
                        );
                    } catch (err) {
                        logger.warn('Redis cache failed:', err.message);
                    }
                }

                // Update MongoDB driver location
                await Driver.findOneAndUpdate(
                    { _id: data.driverId },
                    {
                        location: {
                            type: 'Point',
                            coordinates: [data.lng, data.lat],
                            lastUpdate: Date.now()
                        }
                    }
                );

                // Find active trip for this driver and broadcast to rider
                const activeTrip = await Trip.findOne({
                    driverId: data.driverId,
                    status: { $in: ['driver_assigned', 'driver_arrived', 'trip_started'] }
                });

                if (activeTrip) {
                    io.to(`rider:${activeTrip.riderId}`).emit('driver:location', {
                        lat: data.lat,
                        lng: data.lng,
                        bearing: data.bearing,
                        speed: data.speed
                    });
                }

            } catch (err) {
                logger.error(`Socket error: ${err.message}`);
            }
        });

        // Ride Request
        socket.on('ride:request', async (data) => {
            // data: { tripId, pickup, drop, fare, rider, vehicleType }
            try {
                logger.info(`Ride requested: ${data.tripId}`);

                // Store the socket ID for this trip
                tripToRiderSocket.set(data.tripId, socket.id);

                // Find nearby online drivers with matching vehicle type
                const nearbyDrivers = await Driver.find({
                    status: 'online',
                    vehicleType: data.vehicleType || 'auto',
                    location: {
                        $near: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [data.pickup.lng, data.pickup.lat]
                            },
                            $maxDistance: 5000 // 5km radius
                        }
                    }
                }).limit(5); // Send to up to 5 drivers

                logger.info(`Found ${nearbyDrivers.length} nearby drivers for vehicle type: ${data.vehicleType || 'auto'}`);

                if (nearbyDrivers.length > 0) {
                    // Broadcast request to all nearby drivers
                    nearbyDrivers.forEach(driver => {
                        io.to(`driver:${driver._id}`).emit('ride:request', {
                            _id: data.tripId,
                            tripId: data.tripId,
                            pickup: data.pickup,
                            drop: data.drop,
                            fare: data.fare,
                            rider: data.rider,
                            vehicleType: data.vehicleType
                        });
                        logger.info(`Sent request to driver ${driver._id}`);
                    });
                } else {
                    // Notify rider no drivers found
                    socket.emit('ride:no_drivers', { message: 'No drivers nearby' });
                    logger.info(`No drivers found for trip ${data.tripId}`);
                }
            } catch (err) {
                logger.error(`Matching error: ${err.message}`);
                socket.emit('ride:error', { message: 'Error finding drivers' });
            }
        });

        // Driver Response (Accept/Reject)
        socket.on('ride:accept', async (data) => {
            // data: { tripId, driverId, driver }
            try {
                logger.info(`Driver ${data.driverId} accepted trip ${data.tripId}`);

                // Get the trip to find rider
                const trip = await Trip.findById(data.tripId).populate('riderId').populate('driverId');

                if (trip) {
                    // Notify rider via their socket room
                    io.to(`rider:${trip.riderId._id}`).emit('trip:driver_assigned', {
                        tripId: data.tripId,
                        status: 'driver_assigned',
                        driver: {
                            _id: trip.driverId._id,
                            name: trip.driverId.userId?.name || 'Driver',
                            rating: trip.driverId.metrics?.avgRating || 5.0,
                            vehicleModel: trip.driverId.vehicleModel,
                            vehicleNumber: trip.driverId.vehicleNumber,
                            phone: trip.driverId.userId?.phone
                        },
                        otp: trip.otp
                    });

                    logger.info(`Notified rider ${trip.riderId._id} of driver assignment`);
                }

            } catch (err) {
                logger.error(`Accept error: ${err.message}`);
            }
        });

        // Driver Rejection
        socket.on('ride:reject', async (data) => {
            // data: { tripId, driverId }
            try {
                logger.info(`Driver ${data.driverId} rejected trip ${data.tripId}`);

                // Get the trip to check if it's still available
                const trip = await Trip.findById(data.tripId);

                if (trip && trip.status === 'searching') {
                    // Find next available driver
                    const rejectedDriverIds = data.rejectedDriverIds || [data.driverId];

                    const nextDriver = await Driver.findOne({
                        _id: { $nin: rejectedDriverIds },
                        status: 'online',
                        vehicleType: trip.vehicleType,
                        location: {
                            $near: {
                                $geometry: trip.pickup.location,
                                $maxDistance: 5000
                            }
                        }
                    });

                    if (nextDriver) {
                        // Send request to next driver
                        io.to(`driver:${nextDriver._id}`).emit('ride:request', {
                            _id: trip._id,
                            tripId: trip._id,
                            pickup: {
                                lat: trip.pickup.location.coordinates[1],
                                lng: trip.pickup.location.coordinates[0],
                                address: trip.pickup.address
                            },
                            drop: {
                                lat: trip.drop.location.coordinates[1],
                                lng: trip.drop.location.coordinates[0],
                                address: trip.drop.address
                            },
                            fare: trip.fare.amount,
                            rider: {
                                name: trip.riderId?.name || 'Rider',
                                rating: 4.5
                            },
                            vehicleType: trip.vehicleType,
                            rejectedDriverIds: [...rejectedDriverIds]
                        });
                        logger.info(`Sent request to next driver ${nextDriver._id}`);
                    } else {
                        // No more drivers available
                        io.to(`rider:${trip.riderId}`).emit('ride:no_drivers', {
                            message: 'No more drivers available'
                        });
                        logger.info(`No more drivers available for trip ${trip._id}`);
                    }
                }
            } catch (err) {
                logger.error(`Reject error: ${err.message}`);
            }
        });

        // Ride Cancellation
        socket.on('ride:cancel', async (data) => {
            // data: { tripId, reason }
            try {
                logger.info(`Ride cancelled: ${data.tripId}, reason: ${data.reason || 'Unknown'}`);

                const trip = await Trip.findById(data.tripId);

                if (trip) {
                    // Notify the specific rider about cancellation
                    io.to(`rider:${trip.riderId}`).emit('trip:cancelled', {
                        tripId: data.tripId,
                        reason: data.reason || 'Trip was cancelled'
                    });

                    // Notify all drivers that the ride was cancelled
                    io.emit('ride:cancelled', { tripId: data.tripId });

                    // Update trip status
                    trip.status = 'cancelled';
                    trip.cancellationReason = data.reason || 'Unknown';
                    await trip.save();

                    // If driver was assigned, set them back to online
                    if (trip.driverId) {
                        const driver = await Driver.findById(trip.driverId);
                        if (driver && driver.status === 'busy') {
                            driver.status = 'online';
                            await driver.save();
                        }
                    }

                    logger.info(`Trip ${data.tripId} cancelled successfully`);
                }
            } catch (err) {
                logger.error(`Cancel error: ${err.message}`);
            }
        });

        // Trip Status Update
        socket.on('trip:status_update', async (data) => {
            // data: { tripId, status }
            try {
                const trip = await Trip.findById(data.tripId);

                if (trip) {
                    // Broadcast to both rider and driver
                    io.to(`rider:${trip.riderId}`).emit('trip:status_changed', {
                        tripId: data.tripId,
                        status: data.status
                    });

                    io.to(`driver:${trip.driverId}`).emit('trip:status_changed', {
                        tripId: data.tripId,
                        status: data.status
                    });

                    logger.info(`Trip ${data.tripId} status updated to ${data.status}`);
                }
            } catch (err) {
                logger.error(`Status update error: ${err.message}`);
            }
        });

        socket.on('disconnect', () => {
            logger.info(`Client disconnected: ${socket.id}`);

            // Clean up trip mapping
            for (const [tripId, socketId] of tripToRiderSocket.entries()) {
                if (socketId === socket.id) {
                    tripToRiderSocket.delete(tripId);
                }
            }
        });
    });
};
