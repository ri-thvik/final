/**
 * Script to fix the email index in MongoDB
 * Run this once: node fix_email_index.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rapidride', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const fixEmailIndex = async () => {
    try {
        await connectDB();
        
        const db = mongoose.connection.db;
        const collection = db.collection('users');
        
        // Drop existing email index if it exists
        try {
            await collection.dropIndex('email_1');
            console.log('Dropped existing email index');
        } catch (err) {
            if (err.code === 27) {
                console.log('Email index does not exist, will create new one');
            } else {
                throw err;
            }
        }
        
        // Create new sparse unique index on email
        await collection.createIndex({ email: 1 }, { 
            unique: true, 
            sparse: true,
            name: 'email_1'
        });
        
        console.log('Successfully created sparse unique index on email field');
        console.log('This allows multiple documents with null/undefined email values');
        
        process.exit(0);
    } catch (error) {
        console.error('Error fixing email index:', error);
        process.exit(1);
    }
};

fixEmailIndex();

