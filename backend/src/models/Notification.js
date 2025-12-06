const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: [
            'trip_requested',
            'trip_accepted',
            'trip_started',
            'trip_completed',
            'trip_cancelled',
            'driver_assigned',
            'driver_arrived',
            'payment_success',
            'payment_failed',
            'rating_received',
            'promo_applied',
            'wallet_topup',
            'system_announcement'
        ],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: {
        tripId: mongoose.Schema.Types.ObjectId,
        paymentId: mongoose.Schema.Types.ObjectId,
        amount: Number,
        link: String
    },
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } } // TTL index
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, createdAt: -1 });

// TTL index for auto-deletion after 90 days
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

module.exports = mongoose.model('Notification', NotificationSchema);

