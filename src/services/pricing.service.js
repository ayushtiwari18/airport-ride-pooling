const { calculateDistance } = require('../utils/geo');
const Ride = require('../models/Ride');

class PricingService {
  constructor() {
    this.BASE_FARE = parseFloat(process.env.BASE_FARE) || 50;
    this.RATE_PER_KM = parseFloat(process.env.RATE_PER_KM) || 12;
    this.MAX_DEMAND_MULTIPLIER = parseFloat(process.env.MAX_DEMAND_MULTIPLIER) || 2.5;
    this.SHARED_DISCOUNT = parseFloat(process.env.SHARED_DISCOUNT) || 0.25;
  }

  /**
   * Calculate estimated price before pooling
   * Formula: baseFare + (distance × ratePerKm × demandMultiplier)
   */
  async estimatePrice({ pickup, dropoff, luggageCount }) {
    const distanceKm = calculateDistance(pickup.coordinates, dropoff.coordinates);
    const demandMultiplier = await this._getDemandMultiplier(pickup.coordinates);
    
    const basePrice = this.BASE_FARE + (distanceKm * this.RATE_PER_KM);
    const finalPrice = basePrice * demandMultiplier;

    // Luggage surcharge
    const luggageFee = luggageCount > 1 ? (luggageCount - 1) * 10 : 0;

    return {
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      basePrice: parseFloat(basePrice.toFixed(2)),
      demandMultiplier: parseFloat(demandMultiplier.toFixed(2)),
      luggageFee,
      estimatedPrice: parseFloat((finalPrice + luggageFee).toFixed(2)),
      currency: 'INR'
    };
  }

  /**
   * Calculate pooled price with shared discount
   * Discount increases with pool size: 2 riders = 15%, 3 = 20%, 4 = 25%
   */
  async calculatePooledPrice(ride, poolSize) {
    const estimate = await this.estimatePrice({
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      luggageCount: ride.luggageCount
    });

    let discountRate = 0;
    if (poolSize === 2) discountRate = 0.15;
    else if (poolSize === 3) discountRate = 0.20;
    else if (poolSize >= 4) discountRate = this.SHARED_DISCOUNT;

    const discount = estimate.estimatedPrice * discountRate;
    const pooledPrice = estimate.estimatedPrice - discount;

    return {
      ...estimate,
      poolSize,
      discountRate: parseFloat(discountRate.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      finalPrice: parseFloat(pooledPrice.toFixed(2))
    };
  }

  /**
   * Calculate demand multiplier based on recent ride density
   * Higher demand in last 30 mins = higher multiplier
   */
  async _getDemandMultiplier(coordinates) {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const recentRidesCount = await Ride.countDocuments({
      'pickup.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: 2000 // 2km radius
        }
      },
      requestedAt: { $gte: thirtyMinsAgo }
    });

    // Multiplier increases with demand but caps at MAX_DEMAND_MULTIPLIER
    // 0-5 rides: 1.0x, 6-10: 1.2x, 11-15: 1.5x, 16-20: 1.8x, 21+: 2.5x
    let multiplier = 1.0;
    
    if (recentRidesCount > 20) multiplier = this.MAX_DEMAND_MULTIPLIER;
    else if (recentRidesCount > 15) multiplier = 1.8;
    else if (recentRidesCount > 10) multiplier = 1.5;
    else if (recentRidesCount > 5) multiplier = 1.2;

    return multiplier;
  }

  /**
   * Calculate final price after ride completion
   * Can factor in actual distance, wait time, tolls etc
   */
  calculateFinalPrice({ estimatedPrice, actualDistanceKm, estimatedDistanceKm }) {
    const distanceDeviation = actualDistanceKm - estimatedDistanceKm;
    
    // Adjust for distance differences (±10% tolerance)
    let adjustment = 0;
    if (Math.abs(distanceDeviation) > estimatedDistanceKm * 0.1) {
      adjustment = distanceDeviation * this.RATE_PER_KM;
    }

    return Math.max(this.BASE_FARE, estimatedPrice + adjustment);
  }
}

module.exports = new PricingService();