/**
 * BetaGate - Quality gate for BETA phase
 *
 * Requirements:
 * - Beta readiness score ≥ 65/100
 * - Distribution channels ≥ 2
 * - Beta testers ≥ 20
 * - Privacy compliance ≥ 70/100
 * - Telemetry events ≥ 20
 * - Dashboards ≥ 3
 */

import { Gatekeeper, GateRubric } from './gatekeeper';
import { Recorder } from '../recorder/recorder';

export class BetaGate extends Gatekeeper {
  constructor(recorder?: Recorder) {
    const rubric: GateRubric = {
      id: 'beta-gate',
      name: 'Beta Gate',
      description: 'Validates beta program readiness',
      minimumScore: 65,
      metrics: [
        {
          id: 'beta_readiness_score',
          name: 'Beta Readiness Score',
          description: 'Overall beta program readiness (weighted)',
          type: 'numeric',
          operator: '>=',
          threshold: 65,
          weight: 0.4,
          required: true,
        },
        {
          id: 'distribution_channels',
          name: 'Distribution Channels',
          description: 'Number of beta distribution channels configured',
          type: 'count',
          operator: '>=',
          threshold: 2,
          weight: 0.15,
          required: true,
        },
        {
          id: 'beta_testers',
          name: 'Beta Tester Count',
          description: 'Number of beta testers recruited',
          type: 'count',
          operator: '>=',
          threshold: 20,
          weight: 0.15,
          required: true,
        },
        {
          id: 'privacy_compliance',
          name: 'Privacy Compliance Score',
          description: 'GDPR/CCPA compliance score for telemetry',
          type: 'numeric',
          operator: '>=',
          threshold: 70,
          weight: 0.15,
          required: true,
        },
        {
          id: 'telemetry_events',
          name: 'Telemetry Event Coverage',
          description: 'Number of telemetry events defined',
          type: 'count',
          operator: '>=',
          threshold: 20,
          weight: 0.1,
          required: false,
        },
        {
          id: 'analytics_dashboards',
          name: 'Analytics Dashboards',
          description: 'Number of analytics dashboards configured',
          type: 'count',
          operator: '>=',
          threshold: 3,
          weight: 0.05,
          required: false,
        },
      ],
    };

    const requiredArtifacts = [
      'beta-distribution-plan',
      'telemetry-collection-plan',
      'analytics-report-plan',
    ];

    super('beta-gate', 'Beta Gate', rubric, requiredArtifacts, recorder);
  }
}
