const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    category: {
        type: String,
        enum: [
            'trip_payment',
            'trip_refund',
            'wallet_topup',
            'wallet_withdrawal',
            'bonus',
            'penalty',
            'commission',
            'referral_reward'
        ],
        required: true
    },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true }, // Balance after this transaction
    currency: { type: String, default: 'INR' },
    description: String,
    referenceId: { type: String, index: true }, // Payment ID, Trip ID, etc.
    referenceType: {
        type: String,
        enum: ['payment', 'trip', 'promo', 'referral']
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed',
        index: true
    },
    metadata: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, category: 1, createdAt: -1 });
TransactionSchema.index({ referenceId: 1 });

module.exports = mongoose.model('Transaction', TransactionSchema);

