/**
 * Very Complex Orchestration: AI Healthcare Diagnostic Platform
 *
 * Complexity: Very Complex
 * Budget: $500,000
 * Timeline: 12 months
 * Phases: All (Intake → Ideation → PRD → Architecture → Security → Build → Test → Release)
 *
 * This example demonstrates a highly complex orchestration with:
 * - Regulatory compliance (HIPAA, FDA)
 * - AI/ML integration
 * - Multi-stakeholder requirements
 * - Extensive security and testing requirements
 */

import { Pool } from 'pg';
import pino from 'pino';
import { initializeTracer } from '../../packages/orchestrator-core/src/tracing';
import { EnhancedOrchestrator } from '../../packages/orchestrator-core/src/enhanced-orchestrator';

const logger = pino({
  name: 'healthcare-platform-orchestration',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function main() {
  logger.info('🚀 Starting Healthcare Platform Orchestration\n');

  // Initialize tracing
  initializeTracer({
    serviceName: 'ideamine-orchestrator',
    jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    environment: process.env.NODE_ENV || 'development',
    enabled: true,
  });

  // Initialize database
  const db = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ideamine',
  });

  try {
    await db.query('SELECT 1');
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error({ error }, '❌ Database connection failed');
    process.exit(1);
  }

  // Initialize orchestrator
  const orchestrator = new EnhancedOrchestrator({
    db,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  });

  // Define idea
  const idea = {
    name: 'AI-Powered Healthcare Diagnostic Platform',
    description: 'Machine learning platform for analyzing medical images and providing diagnostic assistance to healthcare professionals',
    target_users: 'Radiologists, physicians, and healthcare institutions',
    category: 'healthcare',
    scale: {
      users: 10000,
      institutions: 500,
      daily_scans: 50000,
      availability: '99.99%',
    },
    features: [
      'AI-powered medical image analysis (X-ray, CT, MRI)',
      'Real-time diagnostic suggestions',
      'EHR integration (HL7 FHIR)',
      'Multi-modal AI models (vision + NLP)',
      'Collaborative workflow tools',
      'Audit trail for all decisions',
      'Patient data anonymization',
      'Explainable AI visualizations',
    ],
    technical_requirements: [
      'ML model serving (TensorFlow Serving)',
      'GPU acceleration for inference',
      'DICOM image processing',
      'HL7 FHIR API integration',
      'Real-time collaboration (WebSocket)',
      'Distributed training pipeline',
      'Feature store (Feast)',
      'Model versioning (MLflow)',
    ],
    compliance_requirements: [
      'HIPAA compliance (Privacy Rule, Security Rule, Breach Notification)',
      'FDA 510(k) approval pathway',
      'SOC 2 Type II certification',
      'GDPR compliance (EU patients)',
      'State-specific medical device regulations',
      'Clinical validation studies',
    ],
    security_requirements: [
      'End-to-end encryption (at rest and in transit)',
      'Role-based access control (RBAC)',
      'Multi-factor authentication (MFA)',
      'PHI data segregation',
      'Automated vulnerability scanning',
      'Penetration testing (annual)',
      'SIEM integration',
      'Disaster recovery (RTO < 4 hours, RPO < 1 hour)',
    ],
    constraints: [
      'Must process 50,000 scans/day with < 30 second latency',
      'Model accuracy: > 95% sensitivity, > 90% specificity',
      'Zero downtime deployments',
      'Full audit trail for regulatory inspections',
      'Data residency requirements (US, EU)',
    ],
    stakeholders: [
      'Radiologists',
      'Hospital administrators',
      'Regulatory affairs',
      'Legal/compliance',
      'ML engineers',
      'Clinical validation team',
    ],
    budget: 500000,
    timeline: '12 months',
  };

  logger.info({ idea }, '📝 Complex healthcare platform idea defined');

  // Execute full orchestration (all phases)
  const run = await orchestrator.execute({
    runId: `healthcare_platform_${Date.now()}`,
    idea,
    phases: 'all',  // Run all 11 phases
    budgets: {
      tokens: 500000,  // Large budget for complex app
      tools_minutes: 480,  // 8 hours
      wallclock_minutes: 1440,  // 24 hours
    },
    options: {
      autonomousMode: true,  // Fully autonomous
      strictGates: true,  // Enforce strict gate requirements
      compliance: ['HIPAA', 'FDA', 'SOC2'],
    },
  });

  logger.info('\n✅ Orchestration complete!');
  logger.info(`Status: ${run.status}`);
  logger.info(`Duration: ${(run.duration_ms / 1000 / 60 / 60).toFixed(2)} hours`);
  logger.info(`Phases completed: ${run.phases_completed.length}/11`);
  logger.info(`Artifacts: ${run.artifacts.length}`);
  logger.info(`Total cost: $${run.total_cost_usd.toFixed(2)}`);

  // Display comprehensive artifact summary
  logger.info('\n📦 Complete Artifact Inventory:');
  const artifactsByPhase: Record<string, any[]> = {};

  for (const artifact of run.artifacts) {
    const phase = artifact.phase || 'unknown';
    if (!artifactsByPhase[phase]) {
      artifactsByPhase[phase] = [];
    }
    artifactsByPhase[phase].push(artifact);
  }

  for (const [phase, artifacts] of Object.entries(artifactsByPhase)) {
    logger.info(`\n  ${phase.toUpperCase()}:`);
    for (const artifact of artifacts) {
      logger.info(`    - ${artifact.type}: ${artifact.id}`);
    }
  }

  // Display gate results
  logger.info('\n🚦 Gate Evaluation Results:');
  for (const phase of run.phases_completed) {
    const evidence = run.evidence_packs.find((e: any) => e.phase === phase);
    if (evidence) {
      const passed = evidence.guard_reports.every((r: any) => r.pass);
      logger.info(`  ${phase}: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
      if (!passed) {
        const failures = evidence.guard_reports.filter((r: any) => !r.pass);
        for (const failure of failures) {
          logger.info(`    - ${failure.type}: ${failure.message}`);
        }
      }
    }
  }

  // Display compliance verification
  logger.info('\n🔒 Compliance Verification:');
  const securityArtifact = run.artifacts.find((a: any) => a.type === 'SecurityPlan');
  if (securityArtifact) {
    const compliance = securityArtifact.content?.compliance || [];
    for (const requirement of ['HIPAA', 'FDA', 'SOC2', 'GDPR']) {
      const satisfied = compliance.some((c: any) => c.standard === requirement && c.satisfied);
      logger.info(`  ${requirement}: ${satisfied ? '✅ Satisfied' : '⚠️  Needs Review'}`);
    }
  }

  // Display release readiness
  logger.info('\n🚀 Release Readiness:');
  const releaseDossier = run.artifacts.find((a: any) => a.type === 'ReleaseDossier');
  if (releaseDossier) {
    logger.info('  ✅ Release Dossier generated');
    logger.info(`  Version: ${releaseDossier.content?.version}`);
    logger.info(`  Artifacts included: ${releaseDossier.content?.artifacts?.length || 0}`);
    logger.info(`  Tests passed: ${releaseDossier.content?.test_summary?.passed || 0}/${releaseDossier.content?.test_summary?.total || 0}`);
  }

  // Display cost breakdown
  logger.info('\n💰 Cost Breakdown:');
  let totalCost = 0;
  for (const phase of run.phases_completed) {
    const metrics = run.metrics.find((m: any) => m.phase === phase);
    if (metrics) {
      totalCost += metrics.cost_usd;
      logger.info(`  ${phase}: $${metrics.cost_usd.toFixed(2)} (${metrics.tokens_used.toLocaleString()} tokens)`);
    }
  }
  logger.info(`\n  TOTAL: $${totalCost.toFixed(2)}`);

  logger.info('\n📊 View distributed traces at: http://localhost:16686');
  logger.info('🔍 Search for run ID: ' + run.id);

  await db.end();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Orchestration failed:', error);
    process.exit(1);
  });
}

export default main;
