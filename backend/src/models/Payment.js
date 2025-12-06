const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', index: true },
    type: {
        type: String,
        enum: ['trip_payment', 'wallet_topup', 'refund', 'withdrawal'],
        required: true
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
        default: 'pending',
        index: true
    },
    paymentMethod: {
        type: String,
        enum: ['wallet', 'razorpay', 'paytm', 'cash', 'card', 'upi'],
        required: true
    },
    paymentGateway: {
        provider: { type: String, enum: ['razorpay', 'paytm', 'stripe'] },
        orderId: String,
        paymentId: String,
        signature: String,
        transactionId: String
    },
    metadata: {
        description: String,
        invoiceNumber: String,
        receipt: String
    },
    refund: {
        amount: Number,
        reason: String,
        processedAt: Date,
        refundId: String
    },
    createdAt: { type: Date, default: Date.now, index: true },
    completedAt: Date
}, { timestamps: true });

PaymentSchema.index({ userId: 1, createdAt: -1 });
PaymentSchema.index({ tripId: 1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', PaymentSchema);

