const express = require('express');
const {
    generateReferralCode,
    applyReferralCode,
    completeReferral,
    getReferralStats
} = require('../controllers/referralController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/generate', protect, generateReferralCode);
router.post('/apply', applyReferralCode);
router.post('/complete', protect, completeReferral);
router.get('/stats', protect, getReferralStats);

module.exports = router;

