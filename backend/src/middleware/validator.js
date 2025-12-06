const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// Common validation rules
const phoneValidation = body('phone')
    .trim()
    .isLength({ min: 10, max: 10 })
    .withMessage('Phone number must be 10 digits')
    .isNumeric()
    .withMessage('Phone number must contain only numbers');

// Allow login with either phone or email (at least one required)
const loginValidation = [
    body('phone')
        .optional()
        .trim()
        .isLength({ min: 10, max: 10 })
        .withMessage('Phone number must be 10 digits')
        .isNumeric()
        .withMessage('Phone number must contain only numbers'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body().custom((value) => {
        if (!value.phone && !value.email) {
            throw new Error('Phone or email is required');
        }
        return true;
    }),
    handleValidationErrors
];

const emailValidation = body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail();

const nameValidation = body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces');

const otpValidation = body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .isNumeric()
    .withMessage('OTP must contain only numbers');

// Trip validation
const tripValidation = [
    body('vehicleType')
        .isIn(['bike', 'auto', 'car'])
        .withMessage('Invalid vehicle type'),
    body('pickup.address')
        .trim()
        .notEmpty()
        .withMessage('Pickup address is required'),
    body('pickup.lat')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid pickup latitude'),
    body('pickup.lng')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid pickup longitude'),
    body('drop.address')
        .trim()
        .notEmpty()
        .withMessage('Drop address is required'),
    body('drop.lat')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid drop latitude'),
    body('drop.lng')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid drop longitude'),
    body('fare')
        .isFloat({ min: 0 })
        .withMessage('Fare must be a positive number'),
    handleValidationErrors
];

// Rating validation
const ratingValidation = [
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('review')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Review must be less than 500 characters'),
    handleValidationErrors
];

// Payment validation
const paymentValidation = [
    body('amount')
        .isFloat({ min: 1 })
        .withMessage('Amount must be at least ₹1'),
    body('paymentMethod')
        .isIn(['wallet', 'razorpay', 'paytm', 'cash', 'card', 'upi'])
        .withMessage('Invalid payment method'),
    handleValidationErrors
];

module.exports = {
    handleValidationErrors,
    phoneValidation,
    emailValidation,
    nameValidation,
    otpValidation,
    loginValidation,
    tripValidation,
    ratingValidation,
    paymentValidation
};

