import redis from '../config/redis';
import logger from '../utils/logger';

class MatchmakingTelemetryService {
  /**
   * Get comprehensive matchmaking statistics
   */
  async getMatchmakingStats() {
    try {
      const pub = redis.getClient();
      
      // 1. Get Queue Depth per Bucket (using SCAN to avoid blocking)
      const bucketCounts: Record<string, number> = {};
      let totalInQueue = 0;
      
      let cursor = '0';
      do {
        const [nextCursor, keys] = await pub.scan(cursor, 'MATCH', 'matchq:*', 'COUNT', 100);
        cursor = nextCursor;
        
        for (const key of keys) {
          // Skip heartbeats, counters, and locks
          if (
            key.startsWith('matchq:heartbeat:') || 
            key.startsWith('matchq:counter:') || 
            key.startsWith('matchq:lock:') ||
            key.startsWith('matchq:metrics:')
          ) continue;
          
          const count = await pub.llen(key);
          bucketCounts[key] = count;
          totalInQueue += count;
        }
      } while (cursor !== '0');

      // 2. Get Average Latency from the last 100 matches
      const latencies = await pub.lrange('matchq:metrics:latencies', 0, -1);
      const avgLatency = latencies.length > 0
        ? latencies.reduce((sum, val) => sum + parseInt(val), 0) / latencies.length
        : 0;

      // 3. Get Redis Info
      const redisInfo = await pub.info('memory');
      const usedMemoryMatch = redisInfo.match(/used_memory_human:(\S+)/);
      const usedMemory = usedMemoryMatch ? usedMemoryMatch[1] : 'unknown';

      // 4. Get Global Counters
      const totalMatched = await pub.get('matchq:counter:matched') || '0';
      
      // 5. Get Active Rooms Count
      const activeRooms = await pub.hlen('random:rooms');

      // 6. Get User Locations for Globe (formatted for Cobe)
      const userLocations: { location: [number, number], size: number }[] = [];
      
      // Redis GEO stores as zset scores (52-bit integers). 
      // It's easier to just use GEOPOS for all members found.
      const userIds = await pub.zrange('presence:geo', 0, -1);
      if (userIds.length > 0) {
        const positions = await pub.geopos('presence:geo', ...userIds);
        positions.forEach(pos => {
          if (pos) {
            userLocations.push({
              location: [parseFloat(pos[1]), parseFloat(pos[0])], // [lat, long] for globe
              size: 0.05
            });
          }
        });
      }

      return {
        timestamp: new Date().toISOString(),
        queues: {
          totalUsers: totalInQueue,
          bucketCounts,
        },
        metrics: {
          avgLatencyMs: Math.round(avgLatency),
          recentSampleCount: latencies.length,
          totalMatchedSinceStart: parseInt(totalMatched),
          activeRooms,
          userLocations
        },
        health: {
          redisMemoryUsed: usedMemory,
        }
      };
    } catch (error) {
      logger.error('Failed to aggregate matchmaking stats', error);
      throw error;
    }
  }
}

export default new MatchmakingTelemetryService();
