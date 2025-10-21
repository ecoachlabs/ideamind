import { Pool } from 'pg';
import { Scheduler } from '../scheduler';
import { JobQueue } from '../../queue/queue';
import { TaskRepository } from '../../database/task-repository';
import { PhasePlan } from '@ideamine/schemas/orchestrator/run-plan';
import { PhaseContext } from '@ideamine/schemas/phase/phase-context';

// Mock dependencies
jest.mock('../../queue/queue');
jest.mock('../../database/task-repository');
jest.mock('@ideamine/schemas/orchestrator/run-plan', () => ({
  parseISO8601Duration: jest.fn((duration: string) => {
    // Simple mock: PT1H = 3600000ms
    if (duration === 'PT1H') return 3600000;
    return 60000; // Default: 1 minute
  }),
}));

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockPool: Pool;
  let mockQueue: jest.Mocked<JobQueue>;
  let mockTaskRepository: jest.Mocked<TaskRepository>;

  beforeEach(() => {
    mockPool = {} as Pool;

    mockQueue = {
      enqueue: jest.fn(),
    } as any;

    mockTaskRepository = {
      create: jest.fn(),
      getByPhase: jest.fn(),
      updateStatus: jest.fn(),
      getStatsByPhase: jest.fn(),
    } as any;

    (JobQueue as jest.MockedClass<typeof JobQueue>).mockImplementation(() => mockQueue);
    (TaskRepository as jest.MockedClass<typeof TaskRepository>).mockImplementation(
      () => mockTaskRepository
    );

    scheduler = new Scheduler(mockPool, mockQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('schedule', () => {
    const mockPlan: PhasePlan = {
      phase: 'INTAKE',
      parallelism: 'sequential',
      agents: ['IntakeClassifierAgent', 'IntakeExpanderAgent', 'IntakeValidatorAgent'],
      budgets: {
        tokens: 300000,
        tools_minutes: 30,
      },
      rubrics: {
        ambiguity_max: 0.1,
        blockers_max: 0,
        grounding_min: 0.85,
      },
      timebox: 'PT1H',
      version: '1',
    };

    const mockContext: PhaseContext & { run_id: string; phase_id: string } = {
      run_id: 'run-123',
      phase_id: 'phase-456',
      inputs: { idea: 'test idea' },
      artifacts: [],
      metadata: {},
    };

    it('should schedule all agents in plan', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue.mockResolvedValue('message-123');

      const result = await scheduler.schedule(mockPlan, mockContext);

      expect(result.totalTasks).toBe(3);
      expect(result.enqueuedTasks).toBe(3);
      expect(result.taskIds).toHaveLength(3);
      expect(mockTaskRepository.create).toHaveBeenCalledTimes(3);
      expect(mockQueue.enqueue).toHaveBeenCalledTimes(3);
    });

    it('should split budgets across agents', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue.mockResolvedValue('message-123');

      await scheduler.schedule(mockPlan, mockContext);

      const expectedTokensPerAgent = Math.floor(300000 / 3); // 100000 per agent

      expect(mockTaskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            budget: expect.objectContaining({
              maxTokens: expectedTokensPerAgent,
            }),
          }),
        })
      );
    });

    it('should generate idempotence keys for deduplication', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue.mockResolvedValue('message-123');

      await scheduler.schedule(mockPlan, mockContext);

      expect(mockQueue.enqueue).toHaveBeenCalledWith(
        'tasks',
        expect.anything(),
        expect.stringMatching(/^INTAKE:[a-f0-9]{16}$/)
      );
    });

    it('should handle duplicate task skip', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue
        .mockResolvedValueOnce('message-1')
        .mockResolvedValueOnce(null) // Duplicate
        .mockResolvedValueOnce('message-3');

      const result = await scheduler.schedule(mockPlan, mockContext);

      expect(result.totalTasks).toBe(3);
      expect(result.enqueuedTasks).toBe(2); // One skipped
    });

    it('should create tasks in database with correct metadata', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue.mockResolvedValue('message-123');

      await scheduler.schedule(mockPlan, mockContext);

      expect(mockTaskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phase_id: 'phase-456',
          run_id: 'run-123',
          type: 'agent',
          target: 'IntakeClassifierAgent',
          idempotence_key: expect.any(String),
        })
      );
    });

    it('should include rubrics in task input', async () => {
      mockTaskRepository.create.mockImplementation(async () => `task-${Date.now()}`);
      mockQueue.enqueue.mockResolvedValue('message-123');

      await scheduler.schedule(mockPlan, mockContext);

      expect(mockTaskRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            rubrics: mockPlan.rubrics,
          }),
        })
      );
    });
  });

  describe('shardTask', () => {
    const mockTaskSpec = {
      id: 'task-123',
      phase: 'QA',
      type: 'agent' as const,
      target: 'TestExecutorAgent',
      input: {
        tests: Array.from({ length: 25 }, (_, i) => ({ id: i, name: `test-${i}` })),
      },
      retries: 0,
      budget: { ms: 60000, tokens: 10000 },
      idempotence_key: 'qa-abc123',
    };

    it('should shard task with large list', () => {
      const shards = scheduler.shardTask(mockTaskSpec, 10);

      expect(shards).toHaveLength(3); // 25 tests / 10 per shard = 3 shards
      expect(shards[0].input.tests).toHaveLength(10);
      expect(shards[1].input.tests).toHaveLength(10);
      expect(shards[2].input.tests).toHaveLength(5);
    });

    it('should include shard metadata', () => {
      const shards = scheduler.shardTask(mockTaskSpec, 10);

      expect(shards[0].input._shard).toEqual({
        index: 0,
        total: 3,
        start: 0,
        end: 10,
      });

      expect(shards[2].input._shard).toEqual({
        index: 2,
        total: 3,
        start: 20,
        end: 25,
      });
    });

    it('should generate unique idempotence keys for shards', () => {
      const shards = scheduler.shardTask(mockTaskSpec, 10);

      expect(shards[0].idempotence_key).toBe('qa-abc123-shard-0');
      expect(shards[1].idempotence_key).toBe('qa-abc123-shard-1');
      expect(shards[2].idempotence_key).toBe('qa-abc123-shard-2');
    });

    it('should not shard if list is small', () => {
      const smallTaskSpec = {
        ...mockTaskSpec,
        input: {
          tests: [{ id: 1 }, { id: 2 }],
        },
      };

      const shards = scheduler.shardTask(smallTaskSpec, 10);

      expect(shards).toHaveLength(1);
      expect(shards[0]).toEqual(smallTaskSpec);
    });

    it('should not shard if no list in input', () => {
      const noListTaskSpec = {
        ...mockTaskSpec,
        input: {
          name: 'test',
          value: 42,
        },
      };

      const shards = scheduler.shardTask(noListTaskSpec, 10);

      expect(shards).toHaveLength(1);
      expect(shards[0]).toEqual(noListTaskSpec);
    });

    it('should detect different list keys', () => {
      const taskWithQuestions = {
        ...mockTaskSpec,
        input: {
          questions: Array.from({ length: 15 }, (_, i) => ({ id: i })),
        },
      };

      const shards = scheduler.shardTask(taskWithQuestions, 10);

      expect(shards).toHaveLength(2);
      expect(shards[0].input.questions).toHaveLength(10);
    });
  });

  describe('cancelPhase', () => {
    it('should cancel all pending tasks for phase', async () => {
      const mockTasks = [
        { id: 'task-1', status: 'pending' },
        { id: 'task-2', status: 'running' },
        { id: 'task-3', status: 'completed' },
      ];

      mockTaskRepository.getByPhase.mockResolvedValue(mockTasks as any);

      const cancelledCount = await scheduler.cancelPhase('phase-456');

      expect(cancelledCount).toBe(2); // pending + running
      expect(mockTaskRepository.updateStatus).toHaveBeenCalledTimes(2);
      expect(mockTaskRepository.updateStatus).toHaveBeenCalledWith('task-1', 'cancelled');
      expect(mockTaskRepository.updateStatus).toHaveBeenCalledWith('task-2', 'cancelled');
    });

    it('should return 0 if no tasks to cancel', async () => {
      mockTaskRepository.getByPhase.mockResolvedValue([]);

      const cancelledCount = await scheduler.cancelPhase('phase-456');

      expect(cancelledCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return scheduling statistics', async () => {
      const mockStats = {
        total: 10,
        completed: 7,
        failed: 2,
        running: 1,
        avgDurationMs: 5000,
        totalCost: 0.5,
        totalTokens: 50000,
      };

      mockTaskRepository.getStatsByPhase.mockResolvedValue(mockStats);

      const stats = await scheduler.getStats('phase-456');

      expect(stats).toEqual(mockStats);
      expect(mockTaskRepository.getStatsByPhase).toHaveBeenCalledWith('phase-456');
    });
  });
});
