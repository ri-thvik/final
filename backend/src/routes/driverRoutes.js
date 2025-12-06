const express = require('express');
const { 
    onboardDriver, 
    getDriverProfile, 
    updateStatus,
    getEarnings,
    getDriverTrips,
    uploadDocuments,
    getVerificationStatus
} = require('../controllers/driverController');
const { protect } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');

const router = express.Router();

router.post('/onboard', protect, onboardDriver);
router.get('/me', protect, getDriverProfile);
router.put('/status', protect, updateStatus);
router.get('/earnings', protect, getEarnings);
router.get('/trips', protect, getDriverTrips);
router.post('/documents', protect, uploadSingle('file'), handleUploadError, uploadDocuments);
router.get('/verification', protect, getVerificationStatus);

module.exports = router;
