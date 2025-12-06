const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['rider', 'driver', 'admin'], default: 'rider' },
    profilePhoto: String,
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    rating: { type: Number, default: 5.0 },
    totalRides: { type: Number, default: 0 },
    refreshToken: String,
    wallet: {
        balance: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' }
    },
    savedAddresses: [{
        label: String, // 'home', 'work', 'other'
        address: String,
        location: {
            type: { type: String, default: 'Point' },
            coordinates: [Number] // [lng, lat]
        }
    }],
    referralCode: { type: String, unique: true, sparse: true, index: true },
    emergencyContacts: [{
        name: String,
        phone: String,
        relationship: String
    }],
}, { timestamps: true });

UserSchema.index({ 'savedAddresses.location': '2dsphere' });

// Ensure email index is sparse (allows multiple nulls)
// This will drop and recreate the index if it exists
UserSchema.index({ email: 1 }, { sparse: true, unique: true });

// Encrypt password (if we were using passwords, but we are using OTP mostly. 
// However, for admin or email login, we might need it. 
// The doc says "Email/Phone signup with OTP verification".
// I'll add a password field just in case, or rely on OTP verification logic in controller.)

// Sign JWT
UserSchema.methods.getSignedJwtToken = function () {
    return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET, {
        expiresIn: '15m' // Short lived
    });
};

// Sign Refresh Token
UserSchema.methods.getRefreshToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: '7d'
    });
};

module.exports = mongoose.model('User', UserSchema);
