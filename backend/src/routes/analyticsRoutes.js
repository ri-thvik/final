const express = require('express');
const {
    getDriverAnalytics,
    getPlatformAnalytics
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/driver', protect, getDriverAnalytics);
router.get('/platform', protect, getPlatformAnalytics);

module.exports = router;

