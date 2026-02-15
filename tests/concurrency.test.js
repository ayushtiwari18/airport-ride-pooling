require('dotenv').config();
const mongoose = require('mongoose');
const Ride = require('../src/models/Ride');
const Pool = require('../src/models/Pool');
const Passenger = require('../src/models/Passenger');
const rideService = require('../src/services/ride.service');
const connectDB = require('../src/config/database');

/**
 * Simulates concurrent ride requests to same pool
 * Tests optimistic locking and transaction handling
 */
async function testConcurrentPooling() {
  await connectDB();
  
  console.log('Setting up test data...');
  
  // Create test passengers
  const passengers = await Passenger.create([
    { name: 'Alice', phone: '9876543210', email: 'alice@test.com' },
    { name: 'Bob', phone: '9876543211', email: 'bob@test.com' },
    { name: 'Charlie', phone: '9876543212', email: 'charlie@test.com' },
    { name: 'David', phone: '9876543213', email: 'david@test.com' }
  ]);

  // Same location cluster for all rides
  const airportCoords = [77.1025, 28.5562]; // [lng, lat]

  console.log('\nSimulating 4 concurrent ride requests...');

  const rideRequests = passengers.map((p, i) => ({
    passengerId: p._id,
    pickup: {
      type: 'Point',
      coordinates: airportCoords,
      address: 'IGI Airport T3'
    },
    dropoff: {
      type: 'Point',
      coordinates: [77.1025 + (i * 0.001), 28.5562 + (i * 0.001)],
      address: `Destination ${i + 1}`
    },
    luggageCount: 1
  }));

  // Fire all requests concurrently
  const startTime = Date.now();
  
  const results = await Promise.allSettled(
    rideRequests.map(req => rideService.createRide(req))
  );

  const endTime = Date.now();
  
  console.log(`\nCompleted in ${endTime - startTime}ms`);
  
  const successful = results.filter(r => r.status === 'fulfilled');
  const failed = results.filter(r => r.status === 'rejected');

  console.log(`✓ Successful: ${successful.length}`);
  console.log(`✗ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailure reasons:');
    failed.forEach((f, i) => {
      console.log(`${i + 1}. ${f.reason.message}`);
    });
  }

  // Verify pool integrity
  const pools = await Pool.find({}).populate('rides');
  
  console.log(`\nPools created: ${pools.length}`);
  
  pools.forEach((pool, i) => {
    console.log(`\nPool ${i + 1}:`);
    console.log(`  Rides: ${pool.rides.length}`);
    console.log(`  Seats: ${pool.seatsOccupied}`);
    console.log(`  Luggage: ${pool.luggageCount}`);
    console.log(`  Status: ${pool.status}`);
  });

  // Verify no overbooking
  const invalidPools = pools.filter(p => 
    p.seatsOccupied > 4 || 
    p.rides.length !== p.seatsOccupied
  );

  if (invalidPools.length === 0) {
    console.log('\n✓ No overbooking detected - concurrency handling works!');
  } else {
    console.log('\n✗ OVERBOOKING DETECTED!');
    invalidPools.forEach(p => {
      console.log(`  Pool ${p._id}: ${p.seatsOccupied} seats, ${p.rides.length} rides`);
    });
  }

  await mongoose.connection.close();
}

// Run test
if (require.main === module) {
  testConcurrentPooling().catch(console.error);
}

module.exports = { testConcurrentPooling };