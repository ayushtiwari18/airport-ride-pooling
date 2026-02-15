/**
 * Retry middleware for handling optimistic locking failures
 * Retries requests that fail due to version conflicts
 */
function retryOnConflict(maxRetries = 3) {
  return async (req, res, next) => {
    req.attemptCount = 0;
    req.maxRetries = maxRetries;
    
    const originalSend = res.send;
    
    res.send = function(data) {
      if (res.statusCode === 409 && req.attemptCount < req.maxRetries) {
        req.attemptCount++;
        console.log(`Retry attempt ${req.attemptCount} for ${req.method} ${req.path}`);
        
        // Reset response
        res.statusCode = 200;
        
        // Re-execute route handler
        return next();
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

module.exports = { retryOnConflict };