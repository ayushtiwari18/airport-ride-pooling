const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema({
  rides: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride'
  }],
  status: {
    type: String,
    enum: ['forming', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'forming',
    index: true
  },
  seatsOccupied: {
    type: Number,
    default: 0,
    min: 0,
    max: 4
  },
  luggageCount: {
    type: Number,
    default: 0,
    min: 0
  },
  boundingBox: {
    minLat: Number,
    maxLat: Number,
    minLng: Number,
    maxLng: Number
  },
  centroid: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number] // [lng, lat]
  },
  maxDetourKm: {
    type: Number,
    default: 3
  },
  expiresAt: {
    type: Date,
    index: true
  },
  confirmedAt: Date,
  completedAt: Date,
  version: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

poolSchema.index({ status: 1, expiresAt: 1 });
poolSchema.index({ 'centroid.coordinates': '2dsphere' });
poolSchema.index({ status: 1, seatsOccupied: 1, createdAt: -1 });

// TTL index to auto-cleanup expired forming pools
poolSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Pool', poolSchema);