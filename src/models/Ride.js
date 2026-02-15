const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  passenger: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Passenger',
    required: true
  },
  pickup: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: String
  },
  dropoff: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    address: String
  },
  requestedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'pooled', 'cancelled', 'completed'],
    default: 'pending',
    index: true
  },
  pool: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pool'
  },
  luggageCount: {
    type: Number,
    default: 1,
    min: 0,
    max: 3
  },
  estimatedPrice: {
    type: Number,
    min: 0
  },
  actualPrice: {
    type: Number,
    min: 0
  },
  distanceKm: {
    type: Number,
    required: true
  },
  cancelledAt: Date,
  completedAt: Date,
  version: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// Geospatial index for proximity searches
rideSchema.index({ 'pickup.coordinates': '2dsphere' });
rideSchema.index({ 'dropoff.coordinates': '2dsphere' });

// Compound indexes for common queries
rideSchema.index({ status: 1, requestedAt: -1 });
rideSchema.index({ passenger: 1, status: 1 });
rideSchema.index({ pool: 1, status: 1 });

// For matching algorithm efficiency
rideSchema.index({ status: 1, 'pickup.coordinates': '2dsphere' });

module.exports = mongoose.model('Ride', rideSchema);