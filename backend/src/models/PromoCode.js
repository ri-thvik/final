const mongoose = require('mongoose');

const PromoCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    description: String,
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: { type: Number, required: true },
    minAmount: { type: Number, default: 0 },
    maxDiscount: Number, // For percentage discounts
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    maxUses: Number, // Total uses allowed
    currentUses: { type: Number, default: 0 },
    maxUsesPerUser: { type: Number, default: 1 },
    applicableTo: {
        type: String,
        enum: ['all', 'bike', 'auto', 'car'],
        default: 'all'
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

PromoCodeSchema.index({ code: 1, isActive: 1 });
PromoCodeSchema.index({ validUntil: 1 });

module.exports = mongoose.model('PromoCode', PromoCodeSchema);

