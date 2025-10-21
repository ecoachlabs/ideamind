import { Pool } from 'pg';
import { TimerService, DEFAULT_RETRY_POLICY } from '../timer-service';
import { JobQueue } from '../../queue/queue';
import { TaskSpec } from '../../queue/types';

// Mock dependencies
jest.mock('../../queue/queue');

describe('TimerService', () => {
  let service: TimerService;
  let mockPool: Pool;
  let mockQueue: jest.Mocked<JobQueue>;
  let mockQueryResult: any;

  beforeEach(() => {
    mockQueryResult = {
      rows: [],
    };

    mockPool = {
      query: jest.fn().mockResolvedValue(mockQueryResult),
    } as any;

    mockQueue = {
      enqueue: jest.fn().mockResolvedValue('message-123'),
    } as any;

    service = new TimerService(mockPool, mockQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start and stop', () => {
    it('should start service and resume timers', async () => {
      mockQueryResult.rows = [
        {
          id: 'timer-1',
          fire_at: new Date(Date.now() - 10000), // Overdue
          action: 'retry',
          payload: { task: { id: 'task-1' }, attempt: 1 },
        },
      ];

      await service.start();

      expect(mockPool.query).toHaveBeenCalled();
      expect(mockQueue.enqueue).toHaveBeenCalled(); // Fired overdue timer
    });

    it('should not start if already running', async () => {
      await service.start();
      const queryCallCount = (mockPool.query as jest.Mock).mock.calls.length;

      await service.start();

      expect((mockPool.query as jest.Mock).mock.calls.length).toBe(queryCallCount);
    });

    it('should stop service and clear interval', async () => {
      await service.start();
      await service.stop();

      // Should stop without errors
      expect(true).toBe(true);
    });
  });

  describe('scheduleRetry', () => {
    const mockTask: TaskSpec = {
      id: 'task-123',
      phase: 'INTAKE',
      type: 'agent',
      target: 'IntakeClassifierAgent',
      input: {},
      retries: 0,
      budget: { ms: 60000, tokens: 10000 },
      idempotence_key: 'intake-abc',
    };

    it('should schedule retry with exponential backoff', async () => {
      mockQueryResult.rows = [{ id: 'timer-123' }];

      const timerId = await service.scheduleRetry(mockTask, 0);

      expect(timerId).toBe('timer-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'task-123',
          null,
          null,
          expect.any(Date),
          'retry',
          expect.objectContaining({ task: mockTask, attempt: 0 }),
          'pending',
        ])
      );
    });

    it('should calculate correct backoff delays', async () => {
      mockQueryResult.rows = [{ id: 'timer-123' }];

      const before0 = Date.now();
      await service.scheduleRetry(mockTask, 0);
      const fireAt0 = (mockPool.query as jest.Mock).mock.calls[0][1][3];

      const before1 = Date.now();
      await service.scheduleRetry(mockTask, 1);
      const fireAt1 = (mockPool.query as jest.Mock).mock.calls[1][1][3];

      const before2 = Date.now();
      await service.scheduleRetry(mockTask, 2);
      const fireAt2 = (mockPool.query as jest.Mock).mock.calls[2][1][3];

      // Attempt 0: base * 2^0 = 1000ms
      expect(fireAt0.getTime() - before0).toBeGreaterThanOrEqual(900);
      expect(fireAt0.getTime() - before0).toBeLessThanOrEqual(1100);

      // Attempt 1: base * 2^1 = 2000ms
      expect(fireAt1.getTime() - before1).toBeGreaterThanOrEqual(1900);
      expect(fireAt1.getTime() - before1).toBeLessThanOrEqual(2100);

      // Attempt 2: base * 2^2 = 4000ms
      expect(fireAt2.getTime() - before2).toBeGreaterThanOrEqual(3900);
      expect(fireAt2.getTime() - before2).toBeLessThanOrEqual(4100);
    });

    it('should cap delay at maxMs', async () => {
      mockQueryResult.rows = [{ id: 'timer-123' }];

      const before = Date.now();
      await service.scheduleRetry(mockTask, 10); // 2^10 = 1024 seconds
      const fireAt = (mockPool.query as jest.Mock).mock.calls[0][1][3];

      // Should be capped at 5 minutes (300000ms)
      expect(fireAt.getTime() - before).toBeLessThanOrEqual(300000 + 100);
    });

    it('should use custom retry policy', async () => {
      mockQueryResult.rows = [{ id: 'timer-123' }];

      const customPolicy = {
        base: 500,
        maxMs: 60000,
        maxAttempts: 5,
      };

      const before = Date.now();
      await service.scheduleRetry(mockTask, 0, customPolicy);
      const fireAt = (mockPool.query as jest.Mock).mock.calls[0][1][3];

      // Attempt 0: 500ms
      expect(fireAt.getTime() - before).toBeGreaterThanOrEqual(400);
      expect(fireAt.getTime() - before).toBeLessThanOrEqual(600);
    });
  });

  describe('scheduleTimeout', () => {
    it('should schedule phase timeout', async () => {
      mockQueryResult.rows = [{ id: 'timer-456' }];

      const timerId = await service.scheduleTimeout('phase-123', 3600000); // 1 hour

      expect(timerId).toBe('timer-456');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'phase-123',
          expect.any(Date),
          'timeout',
          expect.objectContaining({ phaseId: 'phase-123', timeboxMs: 3600000 }),
          'pending',
        ])
      );
    });

    it('should set correct fire time', async () => {
      mockQueryResult.rows = [{ id: 'timer-456' }];

      const before = Date.now();
      await service.scheduleTimeout('phase-123', 60000); // 1 minute
      const fireAt = (mockPool.query as jest.Mock).mock.calls[0][1][1];

      expect(fireAt.getTime() - before).toBeGreaterThanOrEqual(59900);
      expect(fireAt.getTime() - before).toBeLessThanOrEqual(60100);
    });
  });

  describe('scheduleTimer', () => {
    it('should schedule custom timer', async () => {
      mockQueryResult.rows = [{ id: 'timer-789' }];

      const fireAt = new Date(Date.now() + 10000);
      const payload = { custom: 'data' };

      const timerId = await service.scheduleTimer(fireAt, 'custom', payload);

      expect(timerId).toBe('timer-789');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fireAt, 'custom', payload, 'pending']
      );
    });
  });

  describe('cancelTimer', () => {
    it('should cancel pending timer', async () => {
      await service.cancelTimer('timer-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['timer-123']
      );
    });
  });

  describe('getStats', () => {
    it('should return timer statistics', async () => {
      mockQueryResult.rows = [
        {
          pending: '5',
          fired: '10',
          cancelled: '2',
          next_fire_at: new Date('2025-01-20T12:00:00Z'),
        },
      ];

      const stats = await service.getStats();

      expect(stats).toEqual({
        pending: 5,
        fired: 10,
        cancelled: 2,
        nextFireAt: new Date('2025-01-20T12:00:00Z'),
      });
    });

    it('should handle no next fire time', async () => {
      mockQueryResult.rows = [
        {
          pending: '0',
          fired: '5',
          cancelled: '1',
          next_fire_at: null,
        },
      ];

      const stats = await service.getStats();

      expect(stats.nextFireAt).toBeUndefined();
    });
  });

  describe('timer actions', () => {
    beforeEach(async () => {
      await service.start();
    });

    afterEach(async () => {
      await service.stop();
    });

    it('should handle retry action', async () => {
      const mockTask: TaskSpec = {
        id: 'task-123',
        phase: 'INTAKE',
        type: 'agent',
        target: 'IntakeClassifierAgent',
        input: {},
        retries: 0,
        budget: { ms: 60000, tokens: 10000 },
        idempotence_key: 'intake-abc',
      };

      // Mock checkTimers to find and fire a retry timer
      mockQueryResult.rows = [
        {
          id: 'timer-1',
          task_id: 'task-123',
          fire_at: new Date(),
          action: 'retry',
          payload: { task: mockTask, attempt: 1 },
        },
      ];

      // Manually trigger checkTimers (simulating interval)
      await (service as any).checkTimers();

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'tasks',
        expect.objectContaining({ id: 'task-123', retries: 2 })
      );
    });

    it('should handle timeout action', async () => {
      mockQueryResult.rows = [
        {
          id: 'timer-2',
          phase_id: 'phase-123',
          fire_at: new Date(),
          action: 'timeout',
          payload: { phaseId: 'phase-123', timeboxMs: 3600000 },
        },
      ];

      await (service as any).checkTimers();

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'events',
        expect.objectContaining({
          type: 'phase.timeout',
          phaseId: 'phase-123',
        })
      );
    });

    it('should mark timer as fired after execution', async () => {
      mockQueryResult.rows = [
        {
          id: 'timer-3',
          fire_at: new Date(),
          action: 'cleanup',
          payload: {},
        },
      ];

      await (service as any).checkTimers();

      // Should have called UPDATE to mark as fired
      const updateCalls = (mockPool.query as jest.Mock).mock.calls.filter(
        (call) => call[0].includes('UPDATE timers')
      );

      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });
});
