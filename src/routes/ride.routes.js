const express = require('express');
const router = express.Router();
const rideController = require('../controllers/ride.controller');

router.post('/rides', rideController.createRide);
router.post('/rides/:rideId/cancel', rideController.cancelRide);
router.get('/rides/:rideId', rideController.getRideStatus);
router.get('/pools/:poolId', rideController.getPoolDetails);
router.post('/estimate', rideController.estimatePrice);

module.exports = router;