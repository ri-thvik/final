const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true, index: true },
    riderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    ratingBy: {
        type: String,
        enum: ['rider', 'driver'],
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    review: {
        type: String,
        maxlength: 500
    },
    categories: {
        cleanliness: { type: Number, min: 1, max: 5 },
        driving: { type: Number, min: 1, max: 5 },
        behavior: { type: Number, min: 1, max: 5 },
        punctuality: { type: Number, min: 1, max: 5 }
    },
    isVisible: { type: Boolean, default: true },
    reported: { type: Boolean, default: false },
    reportedReason: String,
    createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

RatingSchema.index({ driverId: 1, createdAt: -1 });
RatingSchema.index({ riderId: 1, createdAt: -1 });
RatingSchema.index({ rating: 1 });

// Pre-save hook to update driver/rider average rating
RatingSchema.post('save', async function() {
    try {
        const Driver = require('./Driver');
        const User = require('./User');
        
        if (this.ratingBy === 'rider') {
            // Update driver's average rating
            const driver = await Driver.findById(this.driverId);
            if (driver) {
                const ratings = await mongoose.model('Rating').find({ 
                    driverId: this.driverId,
                    ratingBy: 'rider'
                });
                const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
                driver.metrics.avgRating = Math.round(avgRating * 10) / 10;
                await driver.save();
            }
        } else {
            // Update rider's average rating
            const rider = await User.findById(this.riderId);
            if (rider) {
                const ratings = await mongoose.model('Rating').find({ 
                    riderId: this.riderId,
                    ratingBy: 'driver'
                });
                const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
                rider.rating = Math.round(avgRating * 10) / 10;
                await rider.save();
            }
        }
    } catch (error) {
        console.error('Error updating rating:', error);
    }
});

module.exports = mongoose.model('Rating', RatingSchema);

