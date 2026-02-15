# Low Level Design

## Class Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Controllers Layer                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │
                    ┌───────────▼───────────┐
                    │   RideController      │
                    ├───────────────────────┤
                    │ + createRide()        │
                    │ + cancelRide()        │
                    │ + getRideStatus()     │
                    │ + estimatePrice()     │
                    │ + getPoolDetails()    │
                    └───────────┬───────────┘
                                │
                                │ depends on
┌─────────────────────────────────────────────────────────────────┐
│                          Services Layer                          │
└─────────────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
    ┌─────────▼────────┐ ┌─────▼──────┐ ┌───────▼────────┐
    │  RideService     │ │ PoolingService│ │PricingService│
    ├──────────────────┤ ├────────────────┤├──────────────┤
    │- poolingService  │ │- MAX_SEATS     ││- BASE_FARE   │
    │- pricingService  │ │- MAX_LUGGAGE   ││- RATE_PER_KM │
    │- cache           │ │- MAX_DETOUR    ││- SHARED_DISC │
    ├──────────────────┤ ├────────────────┤├──────────────┤
    │+ createRide()    │ │+ findOrCreate  ││+ estimatePrice│
    │+ cancelRide()    │ │  Pool()        ││+ calculatePool│
    │+ getRideWithPool │ │+ cancelRide()  ││  edPrice()    │
    │+ getPoolDetails()│ │- _canAddToPool││- _getDemand   │
    └─────────┬────────┘ │- _calculatePool││  Multiplier() │
              │          │  Detour()      │└───────────────┘
              │          │- _addRideToPool│
              │          │- _createNewPool│
              │          │- _updatePool   │
              │          │  Geometry()    │
              │          └────────┬───────┘
              │                   │
              │                   │ uses
              │          ┌────────▼───────┐
              │          │   GeoUtils     │
              │          ├────────────────┤
              │          │+ calculateDist │
              │          │+ calculateCentr│
              │          │+ calculateBBox │
              │          └────────────────┘
              │
              │ uses
┌─────────────────────────────────────────────────────────────────┐
│                      Repository/Model Layer                      │
└─────────────────────────────────────────────────────────────────┘
              │
    ┌─────────┼──────────┬──────────────┐
    │         │          │              │
┌───▼────┐ ┌─▼──────┐ ┌─▼───────┐ ┌───▼────────┐
│Passenger│ │  Ride  │ │  Pool   │ │CacheManager│
├─────────┤ ├────────┤ ├─────────┤ ├────────────┤
│- name   │ │- pass  │ │- rides  │ │- cache     │
│- phone  │ │- pickup│ │- status │ │- ttl       │
│- email  │ │- dropoff│ │- seats │ ├────────────┤
│- rating │ │- status│ │- luggage│ │+ set()     │
│- rides  │ │- pool  │ │- centroid│ │+ get()    │
├─────────┤ │- luggage│ │- expires│ │+ delete()  │
│Indexes: │ │- price │ │- version│ │+ clear()   │
│phone    │ │- distance│├─────────┤ │+ cleanup() │
│email    │ │- version│ │Indexes: │ └────────────┘
└─────────┘ ├────────┤ │status   │
            │Indexes:│ │expires  │
            │pickup  │ │centroid │
            │status  │ │seats    │
            │pool    │ └─────────┘
            └────────┘
                │
                │ persists to
        ┌───────▼────────┐
        │    MongoDB     │
        ├────────────────┤
        │- Transactions  │
        │- 2dsphere Index│
        │- TTL Index     │
        │- Replica Set   │
        └────────────────┘
```

## Design Patterns Used

### 1. **Singleton Pattern**
**Where**: Database Connection (`database.js`), Service Instances

**Why**: Ensure single instance of database connection and services throughout application lifecycle.

```javascript
// database.js
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return; // Singleton check
  // ... connection logic
};

// Services exported as singleton
module.exports = new PoolingService();
```

**Benefits**:
- Prevents multiple database connections
- Shares service state across application
- Reduces memory overhead

---

### 2. **Repository Pattern**
**Where**: Mongoose Models (`Passenger`, `Ride`, `Pool`)

**Why**: Abstracts data access logic from business logic.

```javascript
// Models act as repositories
const Ride = require('../models/Ride');

// Service uses repository methods
const ride = await Ride.findById(rideId);
const rides = await Ride.find({ status: 'pooled' });
```

**Benefits**:
- Decouples business logic from database
- Easy to mock for testing
- Can switch database without changing services

---

### 3. **Strategy Pattern**
**Where**: Pricing Service (`pricing.service.js`)

**Why**: Different pricing strategies based on pool size and demand.

```javascript
class PricingService {
  async estimatePrice() { /* Solo pricing strategy */ }
  
  async calculatePooledPrice(ride, poolSize) {
    // Strategy changes based on pool size
    let discountRate = 0;
    if (poolSize === 2) discountRate = 0.15;
    else if (poolSize === 3) discountRate = 0.20;
    else if (poolSize >= 4) discountRate = 0.25;
    // ...
  }
}
```

**Benefits**:
- Easy to add new pricing strategies
- Keeps pricing logic centralized
- Supports A/B testing of pricing models

---

### 4. **Factory Pattern**
**Where**: Pool Creation (`_createNewPool()` in `pooling.service.js`)

**Why**: Encapsulates complex pool creation logic.

```javascript
async _createNewPool(ride, session) {
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + this.POOL_EXPIRY_MIN);

  const pool = await Pool.create([{
    rides: [ride._id],
    seatsOccupied: 1,
    luggageCount: ride.luggageCount,
    centroid: { type: 'Point', coordinates: ride.pickup.coordinates },
    boundingBox: calculateBoundingBox([ride.pickup.coordinates]),
    expiresAt
  }], { session });
  // ...
}
```

**Benefits**:
- Centralizes pool initialization logic
- Ensures all pools created with proper defaults
- Easy to modify pool creation rules

---

### 5. **Cache-Aside Pattern**
**Where**: `RideService.getRideWithPool()` with `CacheManager`

**Why**: Improve read performance by caching frequently accessed data.

```javascript
async getRideWithPool(rideId) {
  const cacheKey = `ride:${rideId}`;
  const cached = cache.get(cacheKey);
  
  if (cached) return cached; // Cache hit
  
  const ride = await Ride.findById(rideId).populate(...); // Cache miss
  
  if (ride && ride.status !== 'pending') {
    cache.set(cacheKey, ride, 2 * 60 * 1000); // Update cache
  }
  
  return ride;
}
```

**Benefits**:
- Reduces database load
- Improves response times
- Application controls cache invalidation

---

### 6. **Command Pattern (Implicit)**
**Where**: API Controllers

**Why**: Each controller method represents a command that encapsulates a request.

```javascript
class RideController {
  async createRide(req, res) { /* Command: Create Ride */ }
  async cancelRide(req, res) { /* Command: Cancel Ride */ }
  async getRideStatus(req, res) { /* Command: Get Status */ }
}
```

**Benefits**:
- Clear separation of concerns
- Easy to add middleware/logging
- Request validation in one place

---

### 7. **Observer Pattern (Event-Driven)**
**Where**: MongoDB Change Streams potential, TTL Index

**Why**: React to data changes automatically.

```javascript
// TTL Index acts as observer for expiry
poolSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Future: WebSocket notifications on pool updates
pool.on('update', () => notifyPassengers());
```

**Benefits**:
- Decouples pool expiry from application logic
- Enables real-time notifications
- Reduces polling overhead

---

## Data Flow

### Create Ride Request Flow

```
1. HTTP Request
   ↓
2. RideController.createRide()
   ↓
3. RideService.createRide()
   ├─→ Validate passenger exists
   ├─→ Calculate distance (GeoUtils)
   ├─→ Create Ride document
   └─→ PoolingService.findOrCreatePool()
       ├─→ Find candidate pools (geospatial query)
       ├─→ Filter by constraints
       ├─→ Calculate detours
       ├─→ Select best pool OR create new
       └─→ Update pool atomically (optimistic lock)
   ↓
4. PricingService.calculatePooledPrice()
   ├─→ Calculate demand multiplier
   └─→ Apply shared discount
   ↓
5. Update ride with estimated price
   ↓
6. Return ride with pool details
   ↓
7. HTTP Response (201)
```

### Concurrency Handling Flow

```
Request A (concurrent)     Request B (concurrent)
    ↓                           ↓
    ├─→ Read Pool (v1)         ├─→ Read Pool (v1)
    ↓                           ↓
    ├─→ Check seats < 4        ├─→ Check seats < 4
    ↓                           ↓
    ├─→ Attempt update         ├─→ Attempt update
    │   WHERE version=1        │   WHERE version=1
    ↓                           ↓
    ✓ SUCCESS                   ✗ FAIL (version mismatch)
    Pool updated to v2          ↓
                                Retry with v2
                                ↓
                                ✓ SUCCESS
```

---

## Key Design Decisions

### 1. **Optimistic Locking over Pessimistic**

**Decision**: Use version-based optimistic locking

**Rationale**:
- Higher throughput under concurrent load
- No lock contention or deadlocks
- Natural fit for MongoDB
- Failed updates are rare and retry is cheap

**Trade-off**: Requires retry logic but better overall performance

---

### 2. **Greedy Algorithm over Optimal**

**Decision**: Use greedy nearest-neighbor instead of optimal TSP solver

**Rationale**:
- O(m × r) vs O(2^n × n^2)
- Real-time response requirement (<300ms)
- Local optimum is "good enough" for user experience
- Simpler to debug and maintain

**Trade-off**: Not globally optimal but 100x faster

---

### 3. **Centroid Detour vs Actual Route**

**Decision**: Use centroid spread as detour proxy

**Rationale**:
- No external API dependency
- Sub-millisecond calculation
- Good approximation for short distances
- Scales to high request volume

**Trade-off**: Less accurate but meets latency requirements

---

### 4. **In-Memory Cache vs Redis (Current)**

**Decision**: Start with in-memory, migrate to Redis for production

**Rationale**:
- Simpler local development
- No external dependencies initially
- Easy to swap implementation
- Interface already designed for Redis

**Trade-off**: Not distributed but sufficient for MVP

---

### 5. **Geospatial Index over Grid/Geohash**

**Decision**: Use MongoDB 2dsphere index

**Rationale**:
- Native support for $near queries
- Accurate distance calculations
- Automatic index maintenance
- Handles Earth's curvature

**Trade-off**: Slightly slower than geohash but more accurate

---

## Database Schema Design

### Relationships

```
Passenger (1) ──< (N) Ride (N) >── (1) Pool

One passenger can have many rides
Many rides can belong to one pool
```

### Indexing Strategy

| Index | Type | Purpose | Query Pattern |
|-------|------|---------|---------------|
| `pickup.coordinates` | 2dsphere | Find nearby pools | `$near` geospatial |
| `status + requestedAt` | Compound | List recent rides by status | Dashboard queries |
| `status + pickup.coordinates` | Compound | Active pools in area | Pool matching |
| `expiresAt` | TTL | Auto-cleanup expired pools | Background process |
| `pool + status` | Compound | Rides in specific pool | Pool details |

### Why These Indexes?

1. **Geospatial First**: Primary query pattern is location-based
2. **Compound for Filters**: MongoDB uses one index per query
3. **TTL for Cleanup**: Automatic, no cron job needed
4. **Covering Indexes**: Some queries satisfied entirely by index

---

## Scalability Considerations

### Horizontal Scaling Points

1. **Application Layer**: Stateless, add more instances behind load balancer
2. **Database Layer**: MongoDB replica set, then sharding if needed
3. **Cache Layer**: Upgrade to Redis cluster for distributed caching
4. **Queue Layer**: Add message queue for background processing

### Bottlenecks to Watch

1. **Database Connections**: Pool size = 10 per instance
2. **Geospatial Query**: Limit candidate pools to 20
3. **Transaction Overhead**: Keep transactions short
4. **Cache Miss Storm**: Warm cache on deployment

---

## Testing Strategy

### Unit Tests (Service Layer)
- Test pooling logic with mocked models
- Test pricing calculations
- Test geo utility functions

### Integration Tests (API Layer)
- Test full request/response cycle
- Test error handling
- Test validation logic

### Concurrency Tests
- Simulate 4+ concurrent requests
- Verify no overbooking
- Check atomic operations

### Load Tests (Future)
- Use k6 or Artillery
- Target: 100 req/sec sustained
- Verify P95 < 300ms

---

## Future Enhancements

### Architectural Improvements

1. **Event Sourcing**: Track all state changes for audit
2. **CQRS**: Separate read/write models for better scaling
3. **Service Mesh**: Add Istio for observability
4. **API Gateway**: Add Kong/AWS API Gateway

### Feature Additions

1. **WebSocket**: Real-time pool updates to passengers
2. **ML Model**: Predict demand for better pricing
3. **Route Optimization**: Integrate actual routing API
4. **Driver Assignment**: Add driver matching logic
5. **Payment Integration**: Add Stripe/Razorpay

### Operational Improvements

1. **Monitoring**: Add Prometheus + Grafana
2. **Logging**: Structured logging with ELK stack
3. **Tracing**: Add Jaeger for distributed tracing
4. **Alerts**: PagerDuty integration for on-call
