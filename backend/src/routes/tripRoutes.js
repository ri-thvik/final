const express = require('express');
const { 
    createTrip, 
    getTripHistory,
    getTrip, 
    acceptTrip, 
    rejectTrip, 
    updateTripStatus 
} = require('../controllers/tripController');
const { protect } = require('../middleware/auth');
const { tripValidation } = require('../middleware/validator');

const router = express.Router();

router.get('/', protect, getTripHistory);
router.post('/', protect, tripValidation, createTrip);
router.get('/:id', protect, getTrip);
router.post('/:id/accept', protect, acceptTrip);
router.post('/:id/reject', protect, rejectTrip);
router.put('/:id/status', protect, updateTripStatus);

module.exports = router;
