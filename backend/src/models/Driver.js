const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    vehicleType: {
        type: String,
        enum: ['bike', 'auto', 'car'],
        required: true
    },
    vehicleNumber: { type: String, required: true, unique: true },
    vehicleModel: String,
    vehicleColor: String,
    documents: {
        license: { url: String, verified: { type: Boolean, default: false }, uploadedAt: Date, expiryDate: Date },
        rc: { url: String, verified: { type: Boolean, default: false }, uploadedAt: Date },
        insurance: { url: String, verified: { type: Boolean, default: false }, uploadedAt: Date, expiryDate: Date },
        aadhar: { url: String, verified: { type: Boolean, default: false }, uploadedAt: Date },
        photo: { url: String, verified: { type: Boolean, default: false }, uploadedAt: Date }
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    verificationNotes: String,
    incentives: {
        totalEarned: { type: Number, default: 0 },
        currentPeriod: { type: Number, default: 0 },
        bonusTrips: { type: Number, default: 0 }
    },
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number], // [lng, lat]
        lastUpdate: Date
    },
    status: {
        type: String,
        enum: ['offline', 'online', 'busy', 'in_ride'],
        default: 'offline'
    },
    metrics: {
        totalTrips: { type: Number, default: 0 },
        acceptedTrips: { type: Number, default: 0 },
        rejectedTrips: { type: Number, default: 0 },
        cancelledTrips: { type: Number, default: 0 },
        acceptanceRate: { type: Number, default: 1.0 },
        cancellationRate: { type: Number, default: 0 },
        avgRating: { type: Number, default: 5.0 },
        totalEarnings: { type: Number, default: 0 },
        idleMinutes: { type: Number, default: 0 },
        lastRideAt: Date
    },
    serviceArea: {
        type: { type: String, default: 'Polygon' },
        coordinates: [[Number]] // GeoJSON polygon
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false },
}, { timestamps: true });

DriverSchema.index({ location: '2dsphere' });
DriverSchema.index({ status: 1, isActive: 1 });
DriverSchema.index({ 'metrics.acceptanceRate': -1 });

module.exports = mongoose.model('Driver', DriverSchema);
