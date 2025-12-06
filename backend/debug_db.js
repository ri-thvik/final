const mongoose = require('mongoose');
const User = require('./src/models/User');
const Driver = require('./src/models/Driver');
require('dotenv').config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB Connected');

        const phone = '9876543214';
        const user = await User.findOne({ phone });
        console.log('User:', user);

        if (user) {
            const driver = await Driver.findOne({ userId: user._id });
            console.log('Driver:', driver);
        } else {
            console.log('User not found');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkData();
