const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/rapidride')
    .then(async () => {
        console.log('Connected to MongoDB');

        // Delete all users and drivers with phone starting with test numbers
        const User = require('./src/models/User');
        const Driver = require('./src/models/Driver');

        const testPhones = ['0000000000', '9999888877', '8888777766', '7777666655'];

        console.log('Deleting test users and drivers...');

        for (const phone of testPhones) {
            const user = await User.findOne({ phone });
            if (user) {
                await Driver.deleteMany({ userId: user._id });
                await User.deleteOne({ _id: user._id });
                console.log(`Deleted user and driver for phone: ${phone}`);
            }
        }

        console.log('Cleanup complete!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
