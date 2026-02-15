# Performance & Scaling Strategy

## Current Architecture Capabilities

### Request Handling
- **Target**: 100 req/sec sustained
- **Current**: Single Node.js process can handle ~5-10k req/sec for simple operations
- **Bottleneck**: Database operations, not application code

### Latency Targets
- **P50**: < 100ms
- **P95**: < 300ms
- **P99**: < 500ms

Achieved through:
- Geospatial indexes for O(log n) location queries
- Compound indexes for common query patterns
- Connection pooling (10 max connections)
- Response caching for read-heavy operations

## Database Indexing Strategy

### Critical Indexes

1. **Geospatial Index** (`pickup.coordinates: 2dsphere`)
   - Enables fast proximity searches for pool matching
   - Time complexity: O(log n)
   - Used in: Finding candidate pools within radius

2. **Compound Index** (`status + requestedAt`)
   - Optimizes queries filtering by status and time
   - Reduces query time from O(n) to O(log n)
   - Used in: Dashboard queries, analytics

3. **Status + Location** (`status + pickup.coordinates`)
   - Combined filter for active pools in area
   - Critical for pool matching algorithm
   - Reduces candidate set before distance calculations

4. **TTL Index** (`expiresAt`)
   - Automatic cleanup of expired pools
   - Reduces storage and query overhead
   - Background process, no application logic needed

### Index Selection Rationale

**Why 2dsphere over 2d?**
- Supports spherical geometry (accurate for Earth)
- Required for $near queries with $maxDistance
- Better for real-world distance calculations

**Why compound indexes?**
- MongoDB can only use one index per query
- Compound indexes cover multiple query patterns
- Order matters: equality filters first, then ranges

## Scaling to 10,000 Concurrent Users

### Horizontal Scaling

#### Application Layer
- Deploy multiple Node.js instances behind load balancer
- Stateless design enables easy horizontal scaling
- Each instance handles ~2-3k concurrent connections
- 4-5 instances sufficient for 10k users

#### Database Layer
- MongoDB replica set for read scaling
  - Primary for writes
  - Secondaries for read operations
  - Distributes load across replicas

- Sharding strategy (if needed beyond 100k users):
  ```
  Shard key: Hash(pickup.coordinates)
  Rationale: Even distribution, location-based queries
  ```

### Vertical Scaling
- Current setup: 2-10 connection pool
- Scale to: 20-50 connections under load
- Memory: 2GB minimum, 4GB recommended per instance
- CPU: 2 cores minimum, 4 cores for peak load

### Caching Strategy

**Current**: In-memory cache per instance
**Production**: Redis cluster
- Cache ride details (2 min TTL)
- Cache pool information (1 min TTL)
- Cache price estimates (5 min TTL)

**Cache Hit Rate Target**: 60-70% for reads

### Load Distribution

```
                        Load Balancer (Nginx/HAProxy)
                              /      |       \
                            /        |         \
                          /          |           \
                    Node 1        Node 2       Node 3
                         \          |          /
                          \         |         /
                           MongoDB Replica Set
                           (Primary + 2 Secondaries)
                                    |
                              Redis Cluster
```

## Algorithm Complexity

### Pool Matching Algorithm

**Time Complexity**: O(m * r)
- m = candidate pools (typically 10-20 after geospatial filter)
- r = rides per pool (max 4)
- Total: ~40-80 distance calculations per request

**Space Complexity**: O(m)
- Store candidate pools in memory
- No recursive calls, no deep data structures

**Optimizations**:
1. Geospatial index reduces search space from O(n) to O(log n)
2. Early termination when perfect match found
3. Limit candidate pools to 20
4. Sort by fullness to prefer established pools

### Alternative Approaches Considered

**K-means clustering**:
- Pro: Better global optimization
- Con: O(n * k * i) where i = iterations
- Con: Requires batch processing, not real-time
- **Verdict**: Overkill for real-time matching

**Graph-based (TSP solver)**:
- Pro: Optimal route calculation
- Con: NP-hard problem, O(2^n * n^2)
- Con: Too slow for real-time (>1s for 10 points)
- **Verdict**: Good for route optimization after pooling

**Greedy nearest-neighbor**:
- Pro: O(m * r), very fast
- Pro: Simple to understand and debug
- Con: Not globally optimal
- **Verdict**: ✓ Selected - good enough tradeoff

## Monitoring & Observability

### Key Metrics to Track

1. **Request Metrics**
   - Request rate (req/sec)
   - Response time (p50, p95, p99)
   - Error rate

2. **Database Metrics**
   - Query execution time
   - Index hit rate
   - Connection pool utilization
   - Lock wait time

3. **Business Metrics**
   - Pool fill rate (avg rides per pool)
   - Cancellation rate
   - Average detour distance
   - Price distribution

### Alerting Thresholds
- P95 latency > 500ms
- Error rate > 1%
- Database connection pool > 80% utilized
- Cache hit rate < 50%

## Future Optimizations

1. **Implement Redis for distributed caching**
2. **Add database read replicas** for read-heavy operations
3. **Implement circuit breakers** for external service calls
4. **Add rate limiting** per passenger to prevent abuse
5. **Optimize pool expiry logic** with background jobs
6. **Consider geohashing** for faster spatial queries at scale