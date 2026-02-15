const Pool = require('../models/Pool');
const Ride = require('../models/Ride');
const { calculateDistance, calculateBoundingBox, calculateCentroid } = require('../utils/geo');

class PoolingService {
  constructor() {
    this.MAX_SEATS = parseInt(process.env.MAX_SEATS_PER_POOL) || 4;
    this.MAX_LUGGAGE = parseInt(process.env.MAX_LUGGAGE_PER_POOL) || 6;
    this.MAX_DETOUR = parseFloat(process.env.MAX_DETOUR_KM) || 3;
    this.POOL_EXPIRY_MIN = parseInt(process.env.POOL_EXPIRY_MINUTES) || 15;
  }

  /**
   * Greedy nearest-neighbor matching with constraint validation
   * Time: O(n * m) where n = pending rides, m = active pools
   * Space: O(1) additional
   */
  async findOrCreatePool(ride) {
    const session = await Pool.startSession();
    session.startTransaction();

    try {
      // Search radius: start small, expand if needed
      const searchRadius = 5000; // 5km initial radius
      
      const candidatePools = await Pool.find({
        status: 'forming',
        seatsOccupied: { $lt: this.MAX_SEATS },
        expiresAt: { $gt: new Date() },
        'centroid.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: ride.pickup.coordinates
            },
            $maxDistance: searchRadius
          }
        }
      })
      .sort({ seatsOccupied: -1, createdAt: 1 }) // Prefer fuller pools first
      .limit(20)
      .session(session);

      let bestPool = null;
      let minDetour = Infinity;

      // Greedy search for best matching pool
      for (const pool of candidatePools) {
        if (!this._canAddToPool(pool, ride)) {
          continue;
        }

        const detour = await this._calculatePoolDetour(pool, ride);
        
        if (detour <= this.MAX_DETOUR && detour < minDetour) {
          minDetour = detour;
          bestPool = pool;
        }
      }

      if (bestPool) {
        await this._addRideToPool(bestPool, ride, session);
        await session.commitTransaction();
        return bestPool;
      }

      // No suitable pool found, create new one
      const newPool = await this._createNewPool(ride, session);
      await session.commitTransaction();
      return newPool;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  _canAddToPool(pool, ride) {
    const seatsNeeded = 1;
    const luggageNeeded = ride.luggageCount;

    return (
      pool.seatsOccupied + seatsNeeded <= this.MAX_SEATS &&
      pool.luggageCount + luggageNeeded <= this.MAX_LUGGAGE
    );
  }

  /**
   * Calculate additional distance if ride added to pool
   * Uses simple centroid deviation as proxy for route detour
   */
  async _calculatePoolDetour(pool, newRide) {
    const poolRides = await Ride.find({ 
      _id: { $in: pool.rides } 
    }).select('pickup dropoff');

    const allPickups = [
      ...poolRides.map(r => r.pickup.coordinates),
      newRide.pickup.coordinates
    ];
    
    const allDropoffs = [
      ...poolRides.map(r => r.dropoff.coordinates),
      newRide.dropoff.coordinates
    ];

    const pickupSpread = this._calculateSpread(allPickups);
    const dropoffSpread = this._calculateSpread(allDropoffs);

    return (pickupSpread + dropoffSpread) / 2;
  }

  _calculateSpread(coordinates) {
    if (coordinates.length === 1) return 0;

    const centroid = calculateCentroid(coordinates);
    let maxDistance = 0;

    for (const coord of coordinates) {
      const dist = calculateDistance(centroid, coord);
      if (dist > maxDistance) maxDistance = dist;
    }

    return maxDistance;
  }

  async _addRideToPool(pool, ride, session) {
    // Optimistic locking via version check
    const updateResult = await Pool.findOneAndUpdate(
      { 
        _id: pool._id, 
        version: pool.version,
        seatsOccupied: { $lt: this.MAX_SEATS }
      },
      {
        $push: { rides: ride._id },
        $inc: { 
          seatsOccupied: 1,
          luggageCount: ride.luggageCount,
          version: 1
        }
      },
      { session, new: true }
    );

    if (!updateResult) {
      throw new Error('Pool was modified by another request, retry');
    }

    await Ride.findByIdAndUpdate(
      ride._id,
      { 
        status: 'pooled',
        pool: pool._id,
        $inc: { version: 1 }
      },
      { session }
    );

    // Recalculate pool centroid
    await this._updatePoolGeometry(updateResult, session);

    return updateResult;
  }

  async _createNewPool(ride, session) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.POOL_EXPIRY_MIN);

    const pool = await Pool.create([{
      rides: [ride._id],
      seatsOccupied: 1,
      luggageCount: ride.luggageCount,
      centroid: {
        type: 'Point',
        coordinates: ride.pickup.coordinates
      },
      boundingBox: calculateBoundingBox([ride.pickup.coordinates]),
      expiresAt
    }], { session });

    await Ride.findByIdAndUpdate(
      ride._id,
      { 
        status: 'pooled',
        pool: pool[0]._id,
        $inc: { version: 1 }
      },
      { session }
    );

    return pool[0];
  }

  async _updatePoolGeometry(pool, session) {
    const rides = await Ride.find({ 
      _id: { $in: pool.rides } 
    }).select('pickup dropoff');

    const allCoordinates = rides.flatMap(r => [
      r.pickup.coordinates,
      r.dropoff.coordinates
    ]);

    const centroid = calculateCentroid(allCoordinates);
    const boundingBox = calculateBoundingBox(allCoordinates);

    await Pool.findByIdAndUpdate(
      pool._id,
      { centroid: { type: 'Point', coordinates: centroid }, boundingBox },
      { session }
    );
  }

  async cancelRide(rideId) {
    const session = await Ride.startSession();
    session.startTransaction();

    try {
      const ride = await Ride.findById(rideId).session(session);
      
      if (!ride) {
        throw new Error('Ride not found');
      }

      if (ride.status === 'cancelled' || ride.status === 'completed') {
        throw new Error('Cannot cancel ride in current status');
      }

      if (ride.pool) {
        await Pool.findOneAndUpdate(
          { _id: ride.pool, version: { $exists: true } },
          {
            $pull: { rides: rideId },
            $inc: { 
              seatsOccupied: -1,
              luggageCount: -ride.luggageCount,
              version: 1
            }
          },
          { session }
        );
      }

      await Ride.findByIdAndUpdate(
        rideId,
        { 
          status: 'cancelled',
          cancelledAt: new Date(),
          $inc: { version: 1 }
        },
        { session }
      );

      await session.commitTransaction();
      return true;

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new PoolingService();