const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const createTransporter = () => {
    // Use environment variables for email configuration
    // For development, you can use Gmail or other SMTP services
    // For production, use services like SendGrid, AWS SES, etc.
    
    if (process.env.EMAIL_SERVICE === 'gmail') {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    } else if (process.env.EMAIL_SERVICE === 'smtp') {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    } else {
        // Default: Use Ethereal Email for testing (no real emails sent)
        return nodemailer.createTransporter({
            host: 'smtp.ethereal.email',
            port: 587,
            auth: {
                user: 'ethereal.user@ethereal.email',
                pass: 'ethereal.pass'
            }
        });
    }
};

const transporter = createTransporter();

// Send OTP Email
const sendOTPEmail = async (email, otp) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'RapidRide <noreply@rapidride.com>',
            to: email,
            subject: 'Your RapidRide OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #000;">RapidRide Verification</h2>
                    <p>Your OTP for verification is:</p>
                    <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                        ${otp}
                    </div>
                    <p>This OTP is valid for 5 minutes.</p>
                    <p style="color: #666; font-size: 12px;">If you didn't request this OTP, please ignore this email.</p>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`OTP email sent to ${email}: ${info.messageId}`);
        return true;
    } catch (error) {
        logger.error(`Error sending OTP email: ${error.message}`);
        throw error;
    }
};

// Send Welcome Email
const sendWelcomeEmail = async (email, name) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'RapidRide <noreply@rapidride.com>',
            to: email,
            subject: 'Welcome to RapidRide!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #000;">Welcome to RapidRide, ${name}!</h2>
                    <p>Thank you for joining RapidRide. We're excited to have you on board!</p>
                    <p>Start booking your rides and enjoy seamless transportation.</p>
                    <p>Best regards,<br>The RapidRide Team</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        logger.info(`Welcome email sent to ${email}`);
        return true;
    } catch (error) {
        logger.error(`Error sending welcome email: ${error.message}`);
        throw error;
    }
};

// Send Trip Confirmation Email
const sendTripConfirmationEmail = async (email, tripDetails) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_FROM || 'RapidRide <noreply@rapidride.com>',
            to: email,
            subject: 'Trip Confirmed - RapidRide',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #000;">Trip Confirmed!</h2>
                    <p><strong>Pickup:</strong> ${tripDetails.pickup}</p>
                    <p><strong>Drop:</strong> ${tripDetails.drop}</p>
                    <p><strong>Fare:</strong> ₹${tripDetails.fare}</p>
                    <p><strong>Vehicle:</strong> ${tripDetails.vehicleType}</p>
                    <p>Your driver will arrive shortly. Track your ride in the app.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        logger.info(`Trip confirmation email sent to ${email}`);
        return true;
    } catch (error) {
        logger.error(`Error sending trip confirmation email: ${error.message}`);
        throw error;
    }
};

module.exports = {
    sendOTPEmail,
    sendWelcomeEmail,
    sendTripConfirmationEmail
};

