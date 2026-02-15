const rideService = require('../services/ride.service');
const pricingService = require('../services/pricing.service');

class RideController {
  async createRide(req, res) {
    const { passengerId, pickup, dropoff, luggageCount = 1 } = req.body;

    if (!passengerId || !pickup || !dropoff) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ride = await rideService.createRide({
      passengerId,
      pickup,
      dropoff,
      luggageCount
    });

    res.status(201).json({
      success: true,
      data: ride
    });
  }

  async cancelRide(req, res) {
    const { rideId } = req.params;

    await rideService.cancelRide(rideId);

    res.json({
      success: true,
      message: 'Ride cancelled successfully'
    });
  }

  async getRideStatus(req, res) {
    const { rideId } = req.params;

    const ride = await rideService.getRideWithPool(rideId);

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    res.json({
      success: true,
      data: ride
    });
  }

  async estimatePrice(req, res) {
    const { pickup, dropoff, luggageCount = 1 } = req.body;

    if (!pickup || !dropoff) {
      return res.status(400).json({ error: 'Pickup and dropoff required' });
    }

    const estimate = await pricingService.estimatePrice({
      pickup,
      dropoff,
      luggageCount
    });

    res.json({
      success: true,
      data: estimate
    });
  }

  async getPoolDetails(req, res) {
    const { poolId } = req.params;

    const pool = await rideService.getPoolDetails(poolId);

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    res.json({
      success: true,
      data: pool
    });
  }
}

module.exports = new RideController();