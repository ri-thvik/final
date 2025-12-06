const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['trip_issue', 'payment_issue', 'account_issue', 'technical_issue', 'other'],
        required: true
    },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
    status: {
        type: String,
        enum: ['open', 'in_progress', 'resolved', 'closed'],
        default: 'open',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messages: [{
        sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        message: { type: String, required: true },
        attachments: [String],
        createdAt: { type: Date, default: Date.now }
    }],
    resolvedAt: Date,
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

SupportTicketSchema.index({ userId: 1, createdAt: -1 });
SupportTicketSchema.index({ status: 1, priority: 1 });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);

