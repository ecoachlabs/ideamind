import { JobQueue } from '../queue';
import RedisConnection from '../redis-connection';

// Mock Redis
jest.mock('../redis-connection');

describe('JobQueue', () => {
  let queue: JobQueue;
  let mockRedis: any;

  beforeEach(async () => {
    // Mock Redis instance
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      xadd: jest.fn(),
      xgroup: jest.fn(),
      xreadgroup: jest.fn(),
      xack: jest.fn(),
      xinfo: jest.fn(),
      xpending: jest.fn(),
      xclaim: jest.fn(),
    };

    (RedisConnection.getConnection as jest.Mock).mockResolvedValue(mockRedis);

    queue = new JobQueue();
    await queue.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should enqueue message with auto-generated key', async () => {
      mockRedis.get.mockResolvedValue(null); // Not processed
      mockRedis.xadd.mockResolvedValue('1234567890-0');

      const msg = { task: 'test-task', data: 'hello' };
      const messageId = await queue.enqueue('tasks', msg);

      expect(messageId).toBe('1234567890-0');
      expect(mockRedis.xadd).toHaveBeenCalledWith(
        'tasks',
        '*',
        'key',
        expect.any(String),
        'payload',
        JSON.stringify(msg),
        'timestamp',
        expect.any(String)
      );
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should skip duplicate messages (idempotence)', async () => {
      mockRedis.get.mockResolvedValue('1234567890-0'); // Already processed

      const msg = { task: 'test-task' };
      const messageId = await queue.enqueue('tasks', msg, 'duplicate-key');

      expect(messageId).toBeNull();
      expect(mockRedis.xadd).not.toHaveBeenCalled();
    });

    it('should use custom idempotence key', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.xadd.mockResolvedValue('1234567890-0');

      const msg = { task: 'test' };
      const customKey = 'my-custom-key';

      await queue.enqueue('tasks', msg, customKey);

      expect(mockRedis.get).toHaveBeenCalledWith(`idempotence:${customKey}`);
    });
  });

  describe('generateKey', () => {
    it('should generate deterministic idempotence key', () => {
      const key1 = JobQueue.generateKey('INTAKE', { idea: 'test' }, '1');
      const key2 = JobQueue.generateKey('INTAKE', { idea: 'test' }, '1');

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^INTAKE:[a-f0-9]{16}$/);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = JobQueue.generateKey('INTAKE', { idea: 'test1' }, '1');
      const key2 = JobQueue.generateKey('INTAKE', { idea: 'test2' }, '1');

      expect(key1).not.toBe(key2);
    });

    it('should include version in key', () => {
      const key1 = JobQueue.generateKey('INTAKE', { idea: 'test' }, '1');
      const key2 = JobQueue.generateKey('INTAKE', { idea: 'test' }, '2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('getQueueDepth', () => {
    it('should return queue depth from XINFO', async () => {
      mockRedis.xinfo.mockResolvedValue([
        'length',
        '42',
        'radix-tree-keys',
        '1',
      ]);

      const depth = await queue.getQueueDepth('tasks');

      expect(depth).toBe(42);
      expect(mockRedis.xinfo).toHaveBeenCalledWith('STREAM', 'tasks');
    });

    it('should return 0 for non-existent stream', async () => {
      mockRedis.xinfo.mockRejectedValue(new Error('ERR no such key'));

      const depth = await queue.getQueueDepth('nonexistent');

      expect(depth).toBe(0);
    });
  });

  describe('claimPending', () => {
    it('should claim pending messages older than minIdleTime', async () => {
      const pendingMessages = [
        ['1234567890-0', 'consumer1', 120000], // 2 minutes idle
        ['1234567891-0', 'consumer2', 30000], // 30 seconds idle
      ];

      mockRedis.xpending.mockResolvedValue(pendingMessages);
      mockRedis.xclaim.mockResolvedValue([]);

      const claimed = await queue.claimPending(
        'tasks',
        'phase-workers',
        'worker-1',
        60000 // 1 minute
      );

      expect(claimed).toBe(1); // Only first message claimed
      expect(mockRedis.xclaim).toHaveBeenCalledTimes(1);
    });

    it('should return 0 if no pending messages', async () => {
      mockRedis.xpending.mockResolvedValue([]);

      const claimed = await queue.claimPending(
        'tasks',
        'phase-workers',
        'worker-1',
        60000
      );

      expect(claimed).toBe(0);
    });
  });
});
