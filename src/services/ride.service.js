const Ride = require('../models/Ride');
const Pool = require('../models/Pool');
const Passenger = require('../models/Passenger');
const poolingService = require('./pooling.service');
const pricingService = require('./pricing.service');
const { calculateDistance } = require('../utils/geo');

class RideService {
  async createRide({ passengerId, pickup, dropoff, luggageCount }) {
    const passenger = await Passenger.findById(passengerId);
    if (!passenger) {
      throw new Error('Passenger not found');
    }

    const distanceKm = calculateDistance(pickup.coordinates, dropoff.coordinates);
    
    const ride = await Ride.create({
      passenger: passengerId,
      pickup,
      dropoff,
      luggageCount,
      distanceKm,
      status: 'pending'
    });

    // Attempt to pool the ride
    try {
      const pool = await poolingService.findOrCreatePool(ride);
      
      // Calculate price after pooling
      const rides = await Ride.find({ pool: pool._id, status: 'pooled' });
      const estimatedPrice = await pricingService.calculatePooledPrice(ride, rides.length);
      
      await Ride.findByIdAndUpdate(ride._id, { estimatedPrice: estimatedPrice.finalPrice });

      return this.getRideWithPool(ride._id);
    } catch (error) {
      console.error('Pooling failed:', error);
      // Fallback: keep ride as pending
      return ride;
    }
  }

  async cancelRide(rideId) {
    return poolingService.cancelRide(rideId);
  }

  async getRideWithPool(rideId) {
    const ride = await Ride.findById(rideId)
      .populate('passenger', 'name phone email')
      .populate({
        path: 'pool',
        populate: {
          path: 'rides',
          select: 'passenger pickup dropoff status'
        }
      })
      .lean();

    return ride;
  }

  async getPoolDetails(poolId) {
    const pool = await Pool.findById(poolId)
      .populate({
        path: 'rides',
        populate: {
          path: 'passenger',
          select: 'name phone'
        }
      })
      .lean();

    return pool;
  }
}

module.exports = new RideService();