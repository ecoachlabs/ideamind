/**
 * Design Gate
 */
import { Gatekeeper, GateRubric } from './gatekeeper';
import { Recorder } from '../recorder/recorder';

export class DesignGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'design-gate',
      name: 'Design Gate',
      minimumScore: 70,
      metrics: [
        { id: 'no_critical_issues', threshold: true, weight: 0.5, required: true },
        { id: 'high_issues_below_3', threshold: true, weight: 0.3 },
        { id: 'overall_score_above_70', threshold: true, weight: 0.2 },
      ],
    };
    super(rubric, recorder);
  }
}
