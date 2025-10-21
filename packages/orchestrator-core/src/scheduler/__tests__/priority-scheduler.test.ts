/**
 * Priority Scheduler Tests
 */
import { PriorityScheduler } from '../priority-scheduler';
import { PriorityClass, PreemptionReason } from '../priority-types';

describe('PriorityScheduler', () => {
  let scheduler: PriorityScheduler;

  beforeEach(() => {
    scheduler = new PriorityScheduler({} as any);
  });

  it('should assign priority to task', async () => {
    await scheduler.assignPriority({
      taskId: 'task-1',
      priorityClass: PriorityClass.P0,
      reason: 'Critical task',
      overridable: false,
    });

    const priority = scheduler.getTaskPriority('task-1');
    expect(priority).toBeDefined();
    expect(priority?.priorityClass).toBe(PriorityClass.P0);
  });

  it('should not preempt P0 tasks', async () => {
    await scheduler.assignPriority({
      taskId: 'task-1',
      priorityClass: PriorityClass.P0,
      reason: 'Critical',
      overridable: false,
    });

    await expect(
      scheduler.preemptTask('task-1', PreemptionReason.RESOURCE_CONSTRAINT)
    ).resolves.not.toThrow();

    expect(scheduler.getPreemptionCount('task-1')).toBe(0);
  });
});
