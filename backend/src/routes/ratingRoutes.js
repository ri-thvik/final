const express = require('express');
const {
    submitRating,
    getDriverRatings,
    getRiderRatings,
    getMyRatings
} = require('../controllers/ratingController');
const { protect } = require('../middleware/auth');
const { ratingValidation } = require('../middleware/validator');

const router = express.Router();

router.post('/', protect, ratingValidation, submitRating);
router.get('/driver/:driverId', protect, getDriverRatings);
router.get('/rider/:riderId', protect, getRiderRatings);
router.get('/my-ratings', protect, getMyRatings);

module.exports = router;

