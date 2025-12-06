const User = require('../models/User');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const otpService = require('../services/otpService');

// @desc    Send OTP
// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOTP = async (req, res) => {
    try {
        const { phone, email } = req.body;

        if (!phone || phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: 'Valid phone number is required'
            });
        }

        // Generate OTP
        const otp = otpService.generateOTP();

        // Store OTP
        await otpService.storeOTP(phone, otp);

        // Send OTP via email if provided
        if (email && email.trim() !== '') {
            await otpService.sendOTPEmail(email, otp);
        } else {
            // Send OTP via SMS (placeholder)
            await otpService.sendOTPSMS(phone, otp);
        }

        // In development, return OTP for testing
        if (process.env.NODE_ENV === 'development') {
            logger.info(`OTP for ${phone}: ${otp}`);
            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully',
                otp: otp // Only in development
            });
        }

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully'
        });
    } catch (err) {
        logger.error(`Send OTP error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP'
        });
    }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone and OTP are required'
            });
        }

        // Verify OTP
        const isValid = await otpService.verifyOTP(phone, otp);

        if (!isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (err) {
        logger.error(`Verify OTP error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP'
        });
    }
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, phone, role, otp } = req.body;

        // Verify OTP if provided (optional for now, can be made mandatory)
        if (otp) {
            const isValid = await otpService.verifyOTP(phone, otp);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired OTP'
                });
            }
        }

        let user = await User.findOne({ phone });
        if (user) {
            return res.status(400).json({ success: false, message: 'User already exists' });
        }

        // Prevent duplicate email registrations
        if (email && email.trim() !== '') {
            const existingEmail = await User.findOne({ email: email.trim() });
            if (existingEmail) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
        }

        // Only include email if it's provided and not empty
        const userData = {
            name,
            phone,
            role: role || 'rider'
        };
        
        if (email && email.trim() !== '') {
            userData.email = email.trim();
        }
        
        user = await User.create(userData);

        // Send welcome email if email provided
        if (email && email.trim() !== '') {
            try {
                const emailService = require('../services/emailService');
                await emailService.sendWelcomeEmail(email, name);
            } catch (emailErr) {
                logger.warn(`Failed to send welcome email: ${emailErr.message}`);
            }
        }

        sendTokenResponse(user, 201, res);
    } catch (err) {
        logger.error(err.message);
        
        // Handle duplicate key errors more gracefully
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0];
            if (field === 'phone') {
                return res.status(400).json({ success: false, message: 'Phone number already registered' });
            } else if (field === 'email') {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            return res.status(400).json({ success: false, message: 'Duplicate entry error' });
        }
        
        // Handle validation errors
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message).join(', ');
            return res.status(400).json({ success: false, message: messages });
        }
        
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { phone, email, otp } = req.body;

        // Support login by either phone or email
        const query = [];
        if (phone) query.push({ phone });
        if (email) query.push({ email });

        const user = await User.findOne(query.length ? { $or: query } : {});

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Verify OTP if provided (can be made mandatory)
        if (otp) {
            const otpTarget = phone || user.phone;
            const isValid = await otpService.verifyOTP(otpTarget, otp);
            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired OTP'
                });
            }
        }

        sendTokenResponse(user, 200, res);
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-refreshToken');
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        logger.error(err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, profilePhoto } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (profilePhoto) updateData.profilePhoto = profilePhoto;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-refreshToken');

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        logger.error(`Update profile error: ${err.message}`);
        
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Email already in use'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
};

// @desc    Add saved address
// @route   POST /api/auth/addresses
// @access  Private
exports.addAddress = async (req, res) => {
    try {
        const { label, address, lat, lng } = req.body;

        if (!label || !address || !lat || !lng) {
            return res.status(400).json({
                success: false,
                message: 'Label, address, and coordinates are required'
            });
        }

        const user = await User.findById(req.user.id);
        
        // Check if label already exists
        const existingAddress = user.savedAddresses.find(addr => addr.label === label);
        if (existingAddress) {
            return res.status(400).json({
                success: false,
                message: 'Address with this label already exists'
            });
        }

        user.savedAddresses.push({
            label,
            address,
            location: {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
            }
        });

        await user.save();

        res.status(201).json({
            success: true,
            data: user.savedAddresses[user.savedAddresses.length - 1]
        });
    } catch (err) {
        logger.error(`Add address error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error adding address'
        });
    }
};

// @desc    Get saved addresses
// @route   GET /api/auth/addresses
// @access  Private
exports.getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('savedAddresses');
        res.status(200).json({
            success: true,
            data: user.savedAddresses || []
        });
    } catch (err) {
        logger.error(`Get addresses error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error fetching addresses'
        });
    }
};

// @desc    Update saved address
// @route   PUT /api/auth/addresses/:addressId
// @access  Private
exports.updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const { label, address, lat, lng } = req.body;

        const user = await User.findById(req.user.id);
        const addressIndex = user.savedAddresses.findIndex(
            addr => addr._id.toString() === addressId
        );

        if (addressIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Address not found'
            });
        }

        if (label) user.savedAddresses[addressIndex].label = label;
        if (address) user.savedAddresses[addressIndex].address = address;
        if (lat && lng) {
            user.savedAddresses[addressIndex].location = {
                type: 'Point',
                coordinates: [parseFloat(lng), parseFloat(lat)]
            };
        }

        await user.save();

        res.status(200).json({
            success: true,
            data: user.savedAddresses[addressIndex]
        });
    } catch (err) {
        logger.error(`Update address error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error updating address'
        });
    }
};

// @desc    Delete saved address
// @route   DELETE /api/auth/addresses/:addressId
// @access  Private
exports.deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;

        const user = await User.findById(req.user.id);
        user.savedAddresses = user.savedAddresses.filter(
            addr => addr._id.toString() !== addressId
        );

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Address deleted successfully'
        });
    } catch (err) {
        logger.error(`Delete address error: ${err.message}`);
        res.status(500).json({
            success: false,
            message: 'Error deleting address'
        });
    }
};

// Helper to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
    const token = user.getSignedJwtToken();
    const refreshToken = user.getRefreshToken();

    // Save refresh token to DB (hashed in real app)
    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        httpOnly: true
    };

    res
        .status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            refreshToken
        });
};
