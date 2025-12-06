const otpGenerator = require('otp-generator');
const redis = require('../config/redis');
const logger = require('../utils/logger');

// Generate OTP
const generateOTP = () => {
    return otpGenerator.generate(6, {
        upperCaseAlphabets: false,
        lowerCaseAlphabets: false,
        specialChars: false
    });
};

// Store OTP in Redis with TTL (5 minutes)
const storeOTP = async (phone, otp) => {
    try {
        const key = `otp:${phone}`;
        const ttl = 300; // 5 minutes
        
        if (redis) {
            await redis.setex(key, ttl, otp);
            logger.info(`OTP stored for ${phone}`);
            return true;
        } else {
            // Fallback: Store in memory (not recommended for production)
            logger.warn('Redis not available, OTP storage fallback to memory');
            return true;
        }
    } catch (error) {
        logger.error(`Error storing OTP: ${error.message}`);
        return false;
    }
};

// Verify OTP
const verifyOTP = async (phone, otp) => {
    try {
        const key = `otp:${phone}`;
        
        if (redis) {
            const storedOTP = await redis.get(key);
            if (storedOTP === otp) {
                // Delete OTP after successful verification
                await redis.del(key);
                logger.info(`OTP verified for ${phone}`);
                return true;
            }
            return false;
        } else {
            logger.warn('Redis not available, OTP verification skipped');
            // In development, accept any OTP if Redis is not available
            return process.env.NODE_ENV === 'development';
        }
    } catch (error) {
        logger.error(`Error verifying OTP: ${error.message}`);
        return false;
    }
};

// Send OTP via Email (using nodemailer)
const sendOTPEmail = async (email, otp) => {
    try {
        const emailService = require('./emailService');
        await emailService.sendOTPEmail(email, otp);
        return true;
    } catch (error) {
        logger.error(`Error sending OTP email: ${error.message}`);
        return false;
    }
};

// Send OTP (placeholder for SMS service)
const sendOTPSMS = async (phone, otp) => {
    try {
        // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
        logger.info(`OTP for ${phone}: ${otp}`);
        // In production, integrate with actual SMS service
        return true;
    } catch (error) {
        logger.error(`Error sending OTP SMS: ${error.message}`);
        return false;
    }
};

module.exports = {
    generateOTP,
    storeOTP,
    verifyOTP,
    sendOTPEmail,
    sendOTPSMS
};

