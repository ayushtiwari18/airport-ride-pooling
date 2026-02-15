require('dotenv').config();
const mongoose = require('mongoose');
const Passenger = require('../src/models/Passenger');
const connectDB = require('../src/config/database');

const seedData = async () => {
  await connectDB();
  
  console.log('Clearing existing data...');
  await Passenger.deleteMany({});
  
  console.log('Seeding passengers...');
  const passengers = await Passenger.create([
    {
      name: 'Rajesh Kumar',
      phone: '9876543210',
      email: 'rajesh.kumar@example.com',
      rating: 4.8,
      totalRides: 45
    },
    {
      name: 'Priya Sharma',
      phone: '9876543211',
      email: 'priya.sharma@example.com',
      rating: 4.9,
      totalRides: 67
    },
    {
      name: 'Amit Patel',
      phone: '9876543212',
      email: 'amit.patel@example.com',
      rating: 4.7,
      totalRides: 34
    },
    {
      name: 'Sneha Reddy',
      phone: '9876543213',
      email: 'sneha.reddy@example.com',
      rating: 5.0,
      totalRides: 89
    },
    {
      name: 'Vikram Singh',
      phone: '9876543214',
      email: 'vikram.singh@example.com',
      rating: 4.6,
      totalRides: 23
    }
  ]);
  
  console.log(`\n✓ Created ${passengers.length} passengers`);
  passengers.forEach(p => {
    console.log(`  - ${p.name} (ID: ${p._id})`);
  });
  
  console.log('\nSample ride request:');
  console.log(JSON.stringify({
    passengerId: passengers[0]._id,
    pickup: {
      type: "Point",
      coordinates: [77.1025, 28.5562],
      address: "Indira Gandhi International Airport T3"
    },
    dropoff: {
      type: "Point",
      coordinates: [77.2167, 28.6139],
      address: "Connaught Place, New Delhi"
    },
    luggageCount: 1
  }, null, 2));
  
  await mongoose.connection.close();
  console.log('\nDatabase connection closed');
};

seedData().catch(console.error);