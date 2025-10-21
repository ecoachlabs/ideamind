import { Pool } from 'pg';
import { CheckpointManager } from '../checkpoint-manager';
import { CheckpointRepository } from '../../database/checkpoint-repository';

// Mock CheckpointRepository
jest.mock('../../database/checkpoint-repository');

describe('CheckpointManager', () => {
  let manager: CheckpointManager;
  let mockPool: Pool;
  let mockRepository: jest.Mocked<CheckpointRepository>;

  beforeEach(() => {
    mockPool = {} as Pool;

    // Mock repository methods
    mockRepository = {
      save: jest.fn(),
      load: jest.fn(),
      delete: jest.fn(),
      getStats: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    (CheckpointRepository as jest.MockedClass<typeof CheckpointRepository>).mockImplementation(
      () => mockRepository
    );

    manager = new CheckpointManager(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('saveCheckpoint', () => {
    it('should save checkpoint successfully', async () => {
      const taskId = 'task-123';
      const token = 'step-2-complete';
      const data = { progress: 50, items: ['a', 'b'] };
      const checkpointId = 'checkpoint-456';

      mockRepository.save.mockResolvedValue(checkpointId);

      const result = await manager.saveCheckpoint(taskId, token, data);

      expect(result).toBe(checkpointId);
      expect(mockRepository.save).toHaveBeenCalledWith(taskId, token, data);
    });

    it('should throw error if save fails', async () => {
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        manager.saveCheckpoint('task-123', 'token', {})
      ).rejects.toThrow('Checkpoint save failed');
    });
  });

  describe('loadCheckpoint', () => {
    it('should load checkpoint successfully', async () => {
      const taskId = 'task-123';
      const checkpoint = {
        id: 'checkpoint-456',
        task_id: taskId,
        token: 'step-2-complete',
        data: { progress: 50 },
        size_bytes: 100,
        created_at: new Date(),
      };

      mockRepository.load.mockResolvedValue(checkpoint);

      const result = await manager.loadCheckpoint(taskId);

      expect(result).toEqual(checkpoint);
      expect(mockRepository.load).toHaveBeenCalledWith(taskId);
    });

    it('should return null if no checkpoint found', async () => {
      mockRepository.load.mockResolvedValue(null);

      const result = await manager.loadCheckpoint('task-123');

      expect(result).toBeNull();
    });

    it('should throw error if load fails', async () => {
      mockRepository.load.mockRejectedValue(new Error('Database error'));

      await expect(
        manager.loadCheckpoint('task-123')
      ).rejects.toThrow('Checkpoint load failed');
    });
  });

  describe('resumeTask', () => {
    it('should resume task with checkpoint', async () => {
      const taskId = 'task-123';
      const checkpoint = {
        id: 'checkpoint-456',
        task_id: taskId,
        token: 'step-2-complete',
        data: { progress: 50 },
        size_bytes: 100,
        created_at: new Date(),
      };

      mockRepository.load.mockResolvedValue(checkpoint);
      mockRepository.delete.mockResolvedValue();

      const executor = jest.fn().mockResolvedValue({ success: true });
      const result = await manager.resumeTask(taskId, executor);

      expect(executor).toHaveBeenCalledWith(checkpoint);
      expect(result).toEqual({ success: true });
      expect(mockRepository.delete).toHaveBeenCalledWith(taskId);
    });

    it('should start from beginning if no checkpoint', async () => {
      mockRepository.load.mockResolvedValue(null);

      const executor = jest.fn().mockResolvedValue({ success: true });
      const result = await manager.resumeTask('task-123', executor);

      expect(executor).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true });
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error if executor fails', async () => {
      mockRepository.load.mockResolvedValue(null);

      const executor = jest.fn().mockRejectedValue(new Error('Execution failed'));

      await expect(
        manager.resumeTask('task-123', executor)
      ).rejects.toThrow('Execution failed');
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete checkpoint successfully', async () => {
      mockRepository.delete.mockResolvedValue();

      await manager.deleteCheckpoint('task-123');

      expect(mockRepository.delete).toHaveBeenCalledWith('task-123');
    });

    it('should not throw if delete fails', async () => {
      mockRepository.delete.mockRejectedValue(new Error('Delete failed'));

      // Should not throw - cleanup failures shouldn't break flow
      await expect(
        manager.deleteCheckpoint('task-123')
      ).resolves.toBeUndefined();
    });
  });

  describe('createCheckpointCallback', () => {
    it('should return callback that saves checkpoint', async () => {
      const taskId = 'task-123';
      mockRepository.save.mockResolvedValue('checkpoint-456');

      const callback = manager.createCheckpointCallback(taskId);

      const token = 'step-1-complete';
      const data = { progress: 25 };
      await callback(token, data);

      expect(mockRepository.save).toHaveBeenCalledWith(taskId, token, data);
    });
  });

  describe('getStats', () => {
    it('should return checkpoint statistics', async () => {
      const stats = {
        total: 10,
        totalSizeBytes: 5000,
        avgSizeBytes: 500,
      };

      mockRepository.getStats.mockResolvedValue(stats);

      const result = await manager.getStats();

      expect(result).toEqual(stats);
      expect(mockRepository.getStats).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup old checkpoints', async () => {
      mockRepository.cleanup.mockResolvedValue(5);

      const deletedCount = await manager.cleanup(7);

      expect(deletedCount).toBe(5);
      expect(mockRepository.cleanup).toHaveBeenCalledWith(7);
    });

    it('should use default retention if not specified', async () => {
      mockRepository.cleanup.mockResolvedValue(3);

      await manager.cleanup();

      expect(mockRepository.cleanup).toHaveBeenCalledWith(7);
    });

    it('should return 0 if cleanup fails', async () => {
      mockRepository.cleanup.mockRejectedValue(new Error('Cleanup failed'));

      const deletedCount = await manager.cleanup();

      expect(deletedCount).toBe(0);
    });
  });
});
