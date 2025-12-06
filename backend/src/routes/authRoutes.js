const express = require('express');
const { 
    sendOTP, 
    verifyOTP, 
    register, 
    login, 
    getMe, 
    updateProfile,
    addAddress,
    getAddresses,
    updateAddress,
    deleteAddress
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { phoneValidation, emailValidation, nameValidation, otpValidation, loginValidation, handleValidationErrors } = require('../middleware/validator');

const router = express.Router();

// Public routes
router.post('/send-otp', otpLimiter, [phoneValidation, emailValidation, handleValidationErrors], sendOTP);
router.post('/verify-otp', [phoneValidation, otpValidation, handleValidationErrors], verifyOTP);
router.post('/register', authLimiter, [phoneValidation, nameValidation, emailValidation, handleValidationErrors], register);
router.post('/login', authLimiter, loginValidation, login);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, [nameValidation, emailValidation, handleValidationErrors], updateProfile);
router.post('/addresses', protect, addAddress);
router.get('/addresses', protect, getAddresses);
router.put('/addresses/:addressId', protect, updateAddress);
router.delete('/addresses/:addressId', protect, deleteAddress);

module.exports = router;
