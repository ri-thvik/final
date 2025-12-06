const mongoose = require('mongoose');

const TripSchema = new mongoose.Schema({
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', index: true },
    vehicleType: {
        type: String,
        enum: ['bike', 'auto', 'car'],
        required: true
    },
    status: {
        type: String,
        enum: [
            'searching',
            'driver_assigned',
            'driver_arrived',
            'trip_started',
            'trip_completed',
            'cancelled'
        ],
        default: 'searching',
        index: true
    },
    pickup: {
        address: String,
        location: {
            type: { type: String, default: 'Point' },
            coordinates: [Number]
        },
        timestamp: Date
    },
    drop: {
        address: String,
        location: {
            type: { type: String, default: 'Point' },
            coordinates: [Number]
        },
        timestamp: Date
    },
    stops: [{
        address: String,
        location: {
            type: { type: String, default: 'Point' },
            coordinates: [Number]
        },
        order: Number,
        timestamp: Date
    }],
    isScheduled: { type: Boolean, default: false },
    scheduledTime: Date,
    isShared: { type: Boolean, default: false },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    fare: {
        amount: Number,
        currency: { type: String, default: 'INR' },
        baseFare: Number,
        distanceFare: Number,
        timeFare: Number,
        surgeMultiplier: { type: Number, default: 1.0 },
        tollCharges: { type: Number, default: 0 },
        waitingCharges: { type: Number, default: 0 },
        paid: { type: Boolean, default: false }
    },
    otp: String,
    distance: Number, // in km
    duration: Number, // in minutes
    cancellationFee: { type: Number, default: 0 },
    cancellationReason: String,
    cancelledBy: {
        type: String,
        enum: ['rider', 'driver', 'system']
    },
    completedAt: Date,
    createdAt: { type: Date, default: Date.now, index: true },
    updatedAt: Date
}, { timestamps: true });

TripSchema.index({ 'pickup.location': '2dsphere' });
TripSchema.index({ 'drop.location': '2dsphere' });
TripSchema.index({ riderId: 1, createdAt: -1 });
TripSchema.index({ driverId: 1, createdAt: -1 });
TripSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Trip', TripSchema);
