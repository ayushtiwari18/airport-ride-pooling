require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

const setupIndexes = async () => {
  await connectDB();
  
  console.log('Setting up database indexes...');
  
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  for (const collection of collections) {
    const indexes = await mongoose.connection.db
      .collection(collection.name)
      .indexes();
    console.log(`\n${collection.name} indexes:`, indexes.map(i => i.name));
  }
  
  console.log('\nIndexes setup complete');
  process.exit(0);
};

setupIndexes();