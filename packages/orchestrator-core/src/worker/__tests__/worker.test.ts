import { Pool } from 'pg';
import { Worker, ExecutorRegistry } from '../worker';
import { CheckpointManager } from '../../checkpoint/checkpoint-manager';
import { TaskRepository, TaskStatus } from '../../database/task-repository';
import RedisConnection from '../../queue/redis-connection';

// Mock dependencies
jest.mock('../../checkpoint/checkpoint-manager');
jest.mock('../../database/task-repository');
jest.mock('../../queue/redis-connection');

describe('Worker', () => {
  let worker: Worker;
  let mockPool: Pool;
  let mockRegistry: jest.Mocked<ExecutorRegistry>;
  let mockCheckpointManager: jest.Mocked<CheckpointManager>;
  let mockTaskRepository: jest.Mocked<TaskRepository>;
  let mockRedis: any;

  beforeEach(async () => {
    mockPool = {} as Pool;

    // Mock executor registry
    mockRegistry = {
      executeAgent: jest.fn(),
      executeTool: jest.fn(),
    };

    // Mock Redis
    mockRedis = {
      setex: jest.fn(),
    };
    (RedisConnection.getConnection as jest.Mock).mockResolvedValue(mockRedis);

    // Mock CheckpointManager
    mockCheckpointManager = {
      loadCheckpoint: jest.fn(),
      saveCheckpoint: jest.fn(),
      deleteCheckpoint: jest.fn(),
      createCheckpointCallback: jest.fn(),
    } as any;

    (CheckpointManager as jest.MockedClass<typeof CheckpointManager>).mockImplementation(
      () => mockCheckpointManager
    );

    // Mock TaskRepository
    mockTaskRepository = {
      updateStatus: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      updateHeartbeat: jest.fn(),
    } as any;

    (TaskRepository as jest.MockedClass<typeof TaskRepository>).mockImplementation(
      () => mockTaskRepository
    );

    worker = new Worker(mockPool, mockRegistry, 'worker-test');
    await worker.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runTask', () => {
    const mockTask = {
      id: 'task-123',
      phase: 'INTAKE',
      type: 'agent' as const,
      target: 'IntakeClassifierAgent',
      input: { idea: 'test idea' },
      retries: 0,
      budget: { ms: 60000, tokens: 10000 },
      idempotence_key: 'intake-abc123',
    };

    it('should execute agent task successfully', async () => {
      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(jest.fn());
      mockRegistry.executeAgent.mockResolvedValue({
        success: true,
        artifacts: [],
        tokensUsed: 500,
        costUsd: 0.01,
      });

      const result = await worker.runTask(mockTask);

      expect(result.ok).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.ms).toBeGreaterThan(0);
      expect(mockTaskRepository.updateStatus).toHaveBeenCalledWith(
        'task-123',
        TaskStatus.RUNNING,
        'worker-test'
      );
      expect(mockTaskRepository.complete).toHaveBeenCalled();
      expect(mockCheckpointManager.deleteCheckpoint).toHaveBeenCalledWith('task-123');
    });

    it('should execute tool task successfully', async () => {
      const toolTask = { ...mockTask, type: 'tool' as const, target: 'search-tool' };

      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockRegistry.executeTool.mockResolvedValue({ data: 'tool result' });

      const result = await worker.runTask(toolTask);

      expect(result.ok).toBe(true);
      expect(mockRegistry.executeTool).toHaveBeenCalled();
    });

    it('should resume from checkpoint if exists', async () => {
      const checkpoint = {
        id: 'checkpoint-456',
        task_id: 'task-123',
        token: 'step-2-complete',
        data: { progress: 50 },
        size_bytes: 100,
        created_at: new Date(),
      };

      mockCheckpointManager.loadCheckpoint.mockResolvedValue(checkpoint);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(jest.fn());
      mockRegistry.executeAgent.mockResolvedValue({ success: true, artifacts: [] });

      await worker.runTask(mockTask);

      expect(mockRegistry.executeAgent).toHaveBeenCalledWith(
        'IntakeClassifierAgent',
        expect.objectContaining({
          checkpoint: 'step-2-complete',
          checkpointData: { progress: 50 },
        })
      );
    });

    it('should emit heartbeats during execution', async () => {
      jest.useFakeTimers();

      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(jest.fn());

      // Simulate long-running task
      mockRegistry.executeAgent.mockImplementation(async () => {
        // Advance timers to trigger heartbeat
        jest.advanceTimersByTime(60000); // 60 seconds
        await Promise.resolve();
        return { success: true, artifacts: [] };
      });

      await worker.runTask(mockTask);

      expect(mockTaskRepository.updateHeartbeat).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should handle agent execution failure', async () => {
      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(jest.fn());
      mockRegistry.executeAgent.mockRejectedValue(new Error('Agent failed'));

      const result = await worker.runTask(mockTask);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Agent failed');
      expect(mockTaskRepository.fail).toHaveBeenCalledWith(
        'task-123',
        'Agent failed',
        0
      );
    });

    it('should extract metrics from result', async () => {
      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(jest.fn());
      mockRegistry.executeAgent.mockResolvedValue({
        success: true,
        artifacts: [],
        tokensUsed: 1000,
        costUsd: 0.05,
      });

      const result = await worker.runTask(mockTask);

      expect(result.tokensUsed).toBe(1000);
      expect(result.costUsd).toBe(0.05);
      expect(mockTaskRepository.complete).toHaveBeenCalledWith(
        'task-123',
        expect.anything(),
        expect.objectContaining({
          tokens_used: 1000,
          cost_usd: 0.05,
        })
      );
    });

    it('should inject checkpoint callback into context', async () => {
      const mockCallback = jest.fn();
      mockCheckpointManager.loadCheckpoint.mockResolvedValue(null);
      mockCheckpointManager.createCheckpointCallback.mockReturnValue(mockCallback);
      mockRegistry.executeAgent.mockResolvedValue({ success: true, artifacts: [] });

      await worker.runTask(mockTask);

      expect(mockRegistry.executeAgent).toHaveBeenCalledWith(
        'IntakeClassifierAgent',
        expect.objectContaining({
          _checkpointCallback: mockCallback,
        })
      );
    });
  });

  describe('getWorkerId', () => {
    it('should return worker ID', () => {
      expect(worker.getWorkerId()).toBe('worker-test');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await worker.shutdown();

      // Should complete without errors
      expect(true).toBe(true);
    });
  });
});
