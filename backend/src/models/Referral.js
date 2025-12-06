const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referredId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    referralCode: { type: String, required: true, unique: true, index: true },
    status: {
        type: String,
        enum: ['pending', 'completed', 'rewarded'],
        default: 'pending',
        index: true
    },
    rewardAmount: { type: Number, default: 0 },
    rewardType: {
        type: String,
        enum: ['cash', 'wallet', 'discount'],
        default: 'wallet'
    },
    completedAt: Date,
    rewardedAt: Date,
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

ReferralSchema.index({ referrerId: 1, status: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);

