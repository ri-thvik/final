const mongoose = require('mongoose');
const User = require('./src/models/User');
const Driver = require('./src/models/Driver');
require('dotenv').config();

const onboard = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connected');

        const phone = '9876543214';
        const user = await User.findOne({ phone });

        if (!user) {
            console.log('User not found');
            process.exit(1);
        }

        console.log('User found:', user._id);

        // Check if driver exists
        let driver = await Driver.findOne({ userId: user._id });
        if (driver) {
            console.log('Driver already exists');
        } else {
            driver = await Driver.create({
                userId: user._id,
                vehicleType: 'auto',
                vehicleNumber: 'KA01AB' + Math.floor(1000 + Math.random() * 9000),
                vehicleModel: 'Bajaj RE',
                vehicleColor: 'Yellow',
                status: 'offline'
            });
            console.log('Driver created:', driver);

            // Update user role
            user.role = 'driver';
            await user.save();
            console.log('User role updated');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

onboard();
