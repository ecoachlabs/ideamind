import { Pool } from 'pg';
import { WorkerPool } from '../worker-pool';
import { Worker, ExecutorRegistry } from '../worker';
import { JobQueue } from '../../queue/queue';

// Mock dependencies
jest.mock('../worker');
jest.mock('../../queue/queue');

describe('WorkerPool', () => {
  let pool: WorkerPool;
  let mockPgPool: Pool;
  let mockQueue: jest.Mocked<JobQueue>;
  let mockRegistry: jest.Mocked<ExecutorRegistry>;
  let mockWorkers: jest.Mocked<Worker>[];

  beforeEach(() => {
    mockPgPool = {} as Pool;
    mockRegistry = {
      executeAgent: jest.fn(),
      executeTool: jest.fn(),
    };

    mockQueue = {
      init: jest.fn(),
      consume: jest.fn(),
      stopConsumer: jest.fn(),
      shutdown: jest.fn(),
      getQueueDepth: jest.fn(),
    } as any;

    mockWorkers = [];

    // Mock Worker constructor
    (Worker as jest.MockedClass<typeof Worker>).mockImplementation(() => {
      const worker = {
        init: jest.fn().mockResolvedValue(undefined),
        runTask: jest.fn().mockResolvedValue({ ok: true }),
        getWorkerId: jest.fn().mockReturnValue(`worker-${mockWorkers.length}`),
        shutdown: jest.fn().mockResolvedValue(undefined),
      } as any;

      mockWorkers.push(worker);
      return worker;
    });

    pool = new WorkerPool(mockPgPool, mockQueue, mockRegistry, {
      concurrency: 2,
      consumerGroup: 'test-workers',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should initialize queue and spawn workers', async () => {
      await pool.start();

      expect(mockQueue.init).toHaveBeenCalled();
      expect(Worker).toHaveBeenCalledTimes(2); // concurrency = 2
      expect(mockWorkers).toHaveLength(2);
      expect(mockWorkers[0].init).toHaveBeenCalled();
      expect(mockWorkers[1].init).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      await pool.start();
      mockWorkers = []; // Reset

      await pool.start();

      expect(mockWorkers).toHaveLength(0); // No new workers created
    });

    it('should start consumers for all workers', async () => {
      await pool.start();

      expect(mockQueue.consume).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop', () => {
    it('should stop all consumers and shutdown workers', async () => {
      await pool.start();
      await pool.stop();

      expect(mockQueue.stopConsumer).toHaveBeenCalledTimes(2);
      expect(mockWorkers[0].shutdown).toHaveBeenCalled();
      expect(mockWorkers[1].shutdown).toHaveBeenCalled();
      expect(mockQueue.shutdown).toHaveBeenCalled();
    });

    it('should not stop if not running', async () => {
      await pool.stop();

      expect(mockQueue.stopConsumer).not.toHaveBeenCalled();
    });
  });

  describe('scale', () => {
    it('should scale up workers', async () => {
      await pool.start();
      expect(mockWorkers).toHaveLength(2);

      await pool.scale(4);

      expect(mockWorkers).toHaveLength(4);
      expect(Worker).toHaveBeenCalledTimes(4); // 2 initial + 2 added
    });

    it('should scale down workers', async () => {
      await pool.start();
      expect(mockWorkers).toHaveLength(2);

      await pool.scale(1);

      expect(mockQueue.stopConsumer).toHaveBeenCalledTimes(1);
      expect(mockWorkers[1].shutdown).toHaveBeenCalled();
    });

    it('should do nothing if target size equals current size', async () => {
      await pool.start();
      const initialWorkerCount = mockWorkers.length;

      await pool.scale(2);

      expect(mockWorkers).toHaveLength(initialWorkerCount);
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', async () => {
      await pool.start();

      const stats = pool.getStats();

      expect(stats.workerCount).toBe(2);
      expect(stats.isRunning).toBe(true);
      expect(stats.config.concurrency).toBe(2);
      expect(stats.config.consumerGroup).toBe('test-workers');
    });
  });

  describe('getQueueDepth', () => {
    it('should return queue depth from JobQueue', async () => {
      mockQueue.getQueueDepth.mockResolvedValue(42);

      const depth = await pool.getQueueDepth();

      expect(depth).toBe(42);
      expect(mockQueue.getQueueDepth).toHaveBeenCalledWith('tasks');
    });
  });

  describe('autoScale', () => {
    it('should scale up when queue depth is high', async () => {
      const autoScalePool = new WorkerPool(mockPgPool, mockQueue, mockRegistry, {
        concurrency: 2,
        autoScale: true,
        minWorkers: 1,
        maxWorkers: 5,
      });

      await autoScalePool.start();
      expect(mockWorkers).toHaveLength(2);

      // Queue depth > workers * 5
      mockQueue.getQueueDepth.mockResolvedValue(15);

      await autoScalePool.autoScale();

      expect(mockWorkers.length).toBeGreaterThan(2);
    });

    it('should scale down when queue depth is low', async () => {
      const autoScalePool = new WorkerPool(mockPgPool, mockQueue, mockRegistry, {
        concurrency: 3,
        autoScale: true,
        minWorkers: 1,
        maxWorkers: 5,
      });

      await autoScalePool.start();
      expect(mockWorkers).toHaveLength(3);

      // Queue depth < workers * 2
      mockQueue.getQueueDepth.mockResolvedValue(2);

      await autoScalePool.autoScale();

      // Should scale down but not below minWorkers
      expect(mockWorkers.length).toBeGreaterThanOrEqual(1);
    });

    it('should not scale if autoScale is false', async () => {
      await pool.start();
      const initialWorkerCount = mockWorkers.length;

      mockQueue.getQueueDepth.mockResolvedValue(100);

      await pool.autoScale();

      expect(mockWorkers).toHaveLength(initialWorkerCount);
    });

    it('should respect maxWorkers limit', async () => {
      const autoScalePool = new WorkerPool(mockPgPool, mockQueue, mockRegistry, {
        concurrency: 1,
        autoScale: true,
        minWorkers: 1,
        maxWorkers: 2,
      });

      await autoScalePool.start();

      // Try to scale up with very high queue depth
      mockQueue.getQueueDepth.mockResolvedValue(1000);

      await autoScalePool.autoScale();
      await autoScalePool.autoScale(); // Try again

      expect(mockWorkers.length).toBeLessThanOrEqual(2);
    });

    it('should respect minWorkers limit', async () => {
      const autoScalePool = new WorkerPool(mockPgPool, mockQueue, mockRegistry, {
        concurrency: 3,
        autoScale: true,
        minWorkers: 2,
        maxWorkers: 5,
      });

      await autoScalePool.start();

      // Try to scale down with very low queue depth
      mockQueue.getQueueDepth.mockResolvedValue(0);

      await autoScalePool.autoScale();
      await autoScalePool.autoScale(); // Try again

      expect(mockWorkers.length).toBeGreaterThanOrEqual(2);
    });
  });
});
