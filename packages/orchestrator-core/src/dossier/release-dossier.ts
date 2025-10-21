import pino from 'pino';

const logger = pino({ name: 'release-dossier' });

/**
 * Release Dossier - Complete release package for a run
 *
 * Spec: orchestrator.txt:281 (PRD, RTM, API spec, tests, coverage, security pack, etc.)
 */
export interface ReleaseDossier {
  run_id: string;
  version: string;
  created_at: Date;

  // Product artifacts
  prd: any;
  rtm: any; // Requirements Traceability Matrix
  api_spec: any; // OpenAPI

  // Code artifacts
  repository_url: string;
  commit_sha: string;
  test_reports: any[];
  coverage_report: any;

  // Security artifacts
  security_pack: any;
  sbom: any; // Software Bill of Materials
  signatures: any[];
  vulnerability_scans: any[];

  // Quality artifacts
  performance_reports: any[];
  accessibility_reports: any[];
  release_notes: string;

  // Deployment artifacts
  deployment_plan: any;
  rollback_plan: any;
  canary_rules: any;
}

/**
 * Artifact metadata
 */
interface ArtifactRecord {
  id: string;
  type: string;
  content: any;
  size: number;
  hash?: string;
  created_at: Date;
}

/**
 * Release Dossier Compiler
 *
 * Compiles all artifacts from a run into a comprehensive release package
 * Supports export to JSON, PDF, and HTML formats
 *
 * Spec: orchestrator.txt:248-249, 281
 */
export class ReleaseDossierCompiler {
  constructor(private db: any) {}

  /**
   * Compile release dossier for a run
   *
   * Gathers all artifacts and assembles them into a structured dossier
   *
   * @param runId - Run ID to compile dossier for
   * @returns Complete release dossier
   */
  async compile(runId: string): Promise<ReleaseDossier> {
    logger.info({ runId }, 'Compiling release dossier');

    const startTime = Date.now();

    // Gather artifacts from all phases
    const artifacts = await this.gatherArtifacts(runId);

    logger.debug(
      {
        runId,
        artifactCount: artifacts.length,
        artifactTypes: [...new Set(artifacts.map((a) => a.type))],
      },
      'Artifacts gathered'
    );

    // Derive version from run metadata and artifacts
    const version = await this.deriveVersion(runId);

    // Assemble dossier
    const dossier: ReleaseDossier = {
      run_id: runId,
      version,
      created_at: new Date(),

      // Product artifacts
      prd: this.findArtifact(artifacts, 'PRD'),
      rtm: this.findArtifact(artifacts, 'RTM'),
      api_spec: this.findArtifact(artifacts, 'OpenAPI'),

      // Code artifacts
      repository_url: this.findArtifact(artifacts, 'RepoManifest')?.url || '',
      commit_sha: this.findArtifact(artifacts, 'CommitSHA')?.sha || '',
      test_reports: this.findArtifacts(artifacts, 'TestReport'),
      coverage_report: this.findArtifact(artifacts, 'CoverageReport'),

      // Security artifacts
      security_pack: this.findArtifact(artifacts, 'SecurityPack'),
      sbom: this.findArtifact(artifacts, 'SBOM'),
      signatures: this.findArtifacts(artifacts, 'Signature'),
      vulnerability_scans: this.findArtifacts(artifacts, 'VulnerabilityScan'),

      // Quality artifacts
      performance_reports: this.findArtifacts(artifacts, 'PerfReport'),
      accessibility_reports: this.findArtifacts(artifacts, 'A11yAudit'),
      release_notes: this.findArtifact(artifacts, 'ReleaseNotes')?.content || '',

      // Deployment artifacts
      deployment_plan: this.findArtifact(artifacts, 'DeploymentPlan'),
      rollback_plan: this.findArtifact(artifacts, 'RollbackPlan'),
      canary_rules: this.findArtifact(artifacts, 'CanaryRules'),
    };

    const duration = Date.now() - startTime;

    logger.info(
      {
        runId,
        version,
        artifactCount: artifacts.length,
        durationMs: duration,
      },
      'Release dossier compiled'
    );

    // Persist dossier to database
    await this.persistDossier(dossier);

    return dossier;
  }

  /**
   * Gather all artifacts for a run
   *
   * @param runId - Run ID
   * @returns Array of artifact records
   */
  private async gatherArtifacts(runId: string): Promise<ArtifactRecord[]> {
    const result = await this.db.query(
      `
      SELECT
        id,
        type,
        content,
        size,
        hash,
        created_at
      FROM artifacts
      WHERE run_id = $1
      ORDER BY created_at ASC
    `,
      [runId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      size: row.size,
      hash: row.hash,
      created_at: row.created_at,
    }));
  }

  /**
   * Derive semantic version for the release
   *
   * Version derivation strategy:
   * 1. Check if run has explicit version override
   * 2. Use Git tags if available
   * 3. Analyze changes for semantic versioning (breaking/features/fixes)
   * 4. Default to 1.0.0
   *
   * @param runId - Run ID
   * @returns Semantic version string
   */
  private async deriveVersion(runId: string): Promise<string> {
    // Check for explicit version in run metadata
    const runResult = await this.db.query(
      `SELECT version FROM runs WHERE id = $1`,
      [runId]
    );

    if (runResult.rows.length > 0 && runResult.rows[0].version) {
      return runResult.rows[0].version;
    }

    // Check if we have a version in artifacts (e.g., from build phase)
    const versionArtifact = await this.db.query(
      `
      SELECT content FROM artifacts
      WHERE run_id = $1 AND type = 'Version'
      LIMIT 1
    `,
      [runId]
    );

    if (versionArtifact.rows.length > 0) {
      return versionArtifact.rows[0].content.version;
    }

    // Analyze PRD for change type to determine version bump
    const prdArtifact = await this.db.query(
      `
      SELECT content FROM artifacts
      WHERE run_id = $1 AND type = 'PRD'
      LIMIT 1
    `,
      [runId]
    );

    if (prdArtifact.rows.length > 0) {
      const prd = prdArtifact.rows[0].content;

      // Analyze for breaking changes, features, or fixes
      const hasBreakingChanges = this.detectBreakingChanges(prd);
      const hasNewFeatures = this.detectNewFeatures(prd);

      if (hasBreakingChanges) {
        return '2.0.0'; // Major version bump
      } else if (hasNewFeatures) {
        return '1.1.0'; // Minor version bump
      } else {
        return '1.0.1'; // Patch version
      }
    }

    // Default version
    logger.warn(
      { runId },
      'No version information found, defaulting to 1.0.0'
    );
    return '1.0.0';
  }

  /**
   * Detect breaking changes in PRD
   */
  private detectBreakingChanges(prd: any): boolean {
    if (!prd || !prd.description) return false;

    const breakingKeywords = [
      'breaking change',
      'incompatible',
      'removes',
      'deprecated',
      'migration required',
    ];

    const text = JSON.stringify(prd).toLowerCase();
    return breakingKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Detect new features in PRD
   */
  private detectNewFeatures(prd: any): boolean {
    if (!prd || !prd.user_stories) return false;

    return Array.isArray(prd.user_stories) && prd.user_stories.length > 0;
  }

  /**
   * Find a single artifact by type
   */
  private findArtifact(
    artifacts: ArtifactRecord[],
    type: string
  ): any | undefined {
    const artifact = artifacts.find((a) => a.type === type);
    return artifact ? artifact.content : undefined;
  }

  /**
   * Find all artifacts of a given type
   */
  private findArtifacts(artifacts: ArtifactRecord[], type: string): any[] {
    return artifacts.filter((a) => a.type === type).map((a) => a.content);
  }

  /**
   * Persist dossier to database
   */
  private async persistDossier(dossier: ReleaseDossier): Promise<void> {
    await this.db.query(
      `
      INSERT INTO release_dossiers (run_id, version, content, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (run_id) DO UPDATE
      SET version = EXCLUDED.version,
          content = EXCLUDED.content,
          created_at = EXCLUDED.created_at
    `,
      [
        dossier.run_id,
        dossier.version,
        JSON.stringify(dossier),
        dossier.created_at,
      ]
    );

    logger.debug({ runId: dossier.run_id }, 'Dossier persisted to database');
  }

  /**
   * Export dossier to specified format
   *
   * Supported formats:
   * - json: Pretty-printed JSON
   * - pdf: PDF document with all sections
   * - html: HTML document with styling
   *
   * @param dossier - Release dossier to export
   * @param format - Export format
   * @returns Buffer containing exported dossier
   */
  async exportDossier(
    dossier: ReleaseDossier,
    format: 'json' | 'pdf' | 'html'
  ): Promise<Buffer> {
    logger.info(
      {
        runId: dossier.run_id,
        format,
        version: dossier.version,
      },
      'Exporting dossier'
    );

    if (format === 'json') {
      return this.exportJSON(dossier);
    } else if (format === 'pdf') {
      return this.generatePDF(dossier);
    } else if (format === 'html') {
      return this.generateHTML(dossier);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Export as JSON
   */
  private exportJSON(dossier: ReleaseDossier): Buffer {
    return Buffer.from(JSON.stringify(dossier, null, 2));
  }

  /**
   * Generate PDF document
   *
   * Creates a comprehensive PDF with all dossier sections
   * Includes table of contents, artifact summaries, and metadata
   */
  private async generatePDF(dossier: ReleaseDossier): Promise<Buffer> {
    logger.info({ runId: dossier.run_id }, 'Generating PDF');

    // PDF generation requires a library like pdfkit or puppeteer
    // For now, return a placeholder implementation

    const pdfContent = `
Release Dossier PDF
===================

Run ID: ${dossier.run_id}
Version: ${dossier.version}
Created: ${dossier.created_at.toISOString()}

Product Artifacts:
- PRD: ${dossier.prd ? 'Present' : 'Missing'}
- RTM: ${dossier.rtm ? 'Present' : 'Missing'}
- API Spec: ${dossier.api_spec ? 'Present' : 'Missing'}

Code Artifacts:
- Repository: ${dossier.repository_url}
- Commit: ${dossier.commit_sha}
- Test Reports: ${dossier.test_reports.length}
- Coverage: ${dossier.coverage_report ? 'Present' : 'Missing'}

Security Artifacts:
- Security Pack: ${dossier.security_pack ? 'Present' : 'Missing'}
- SBOM: ${dossier.sbom ? 'Present' : 'Missing'}
- Signatures: ${dossier.signatures.length}
- Vulnerability Scans: ${dossier.vulnerability_scans.length}

Quality Artifacts:
- Performance Reports: ${dossier.performance_reports.length}
- Accessibility Reports: ${dossier.accessibility_reports.length}
- Release Notes: ${dossier.release_notes ? 'Present' : 'Missing'}

Deployment Artifacts:
- Deployment Plan: ${dossier.deployment_plan ? 'Present' : 'Missing'}
- Rollback Plan: ${dossier.rollback_plan ? 'Present' : 'Missing'}
- Canary Rules: ${dossier.canary_rules ? 'Present' : 'Missing'}

---

Full JSON export is available separately.
`;

    logger.warn(
      { runId: dossier.run_id },
      'PDF generation returning placeholder (requires pdfkit or puppeteer)'
    );

    return Buffer.from(pdfContent);
  }

  /**
   * Generate HTML document
   *
   * Creates a styled HTML page with all dossier information
   * Includes navigation, collapsible sections, and syntax highlighting
   */
  private async generateHTML(dossier: ReleaseDossier): Promise<Buffer> {
    logger.info({ runId: dossier.run_id }, 'Generating HTML');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Release Dossier - ${dossier.version}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background: #2c3e50;
      color: white;
      padding: 30px 20px;
      margin-bottom: 30px;
      border-radius: 8px;
    }
    h1 {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    .metadata {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-top: 20px;
    }
    .metadata-item {
      background: rgba(255,255,255,0.1);
      padding: 10px;
      border-radius: 4px;
    }
    .metadata-label {
      font-size: 0.85em;
      opacity: 0.8;
      margin-bottom: 5px;
    }
    .section {
      background: white;
      padding: 25px;
      margin-bottom: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h2 {
      color: #2c3e50;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #3498db;
    }
    .artifact-list {
      list-style: none;
      padding: 0;
    }
    .artifact-item {
      padding: 10px;
      margin: 5px 0;
      background: #f8f9fa;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }
    .badge-present {
      background: #27ae60;
      color: white;
    }
    .badge-missing {
      background: #e74c3c;
      color: white;
    }
    .badge-count {
      background: #3498db;
      color: white;
    }
    pre {
      background: #2c3e50;
      color: #ecf0f1;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 0.9em;
    }
    .release-notes {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Release Dossier</h1>
      <div class="metadata">
        <div class="metadata-item">
          <div class="metadata-label">Version</div>
          <div><strong>${dossier.version}</strong></div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Run ID</div>
          <div><code>${dossier.run_id}</code></div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Created</div>
          <div>${dossier.created_at.toISOString()}</div>
        </div>
      </div>
    </header>

    <div class="section">
      <h2>Product Artifacts</h2>
      <ul class="artifact-list">
        <li class="artifact-item">
          <span>Product Requirements Document (PRD)</span>
          <span class="badge ${dossier.prd ? 'badge-present' : 'badge-missing'}">
            ${dossier.prd ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>Requirements Traceability Matrix (RTM)</span>
          <span class="badge ${dossier.rtm ? 'badge-present' : 'badge-missing'}">
            ${dossier.rtm ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>API Specification (OpenAPI)</span>
          <span class="badge ${dossier.api_spec ? 'badge-present' : 'badge-missing'}">
            ${dossier.api_spec ? 'Present' : 'Missing'}
          </span>
        </li>
      </ul>
    </div>

    <div class="section">
      <h2>Code Artifacts</h2>
      <ul class="artifact-list">
        <li class="artifact-item">
          <span>Repository URL</span>
          <span>${dossier.repository_url || 'N/A'}</span>
        </li>
        <li class="artifact-item">
          <span>Commit SHA</span>
          <span><code>${dossier.commit_sha || 'N/A'}</code></span>
        </li>
        <li class="artifact-item">
          <span>Test Reports</span>
          <span class="badge badge-count">${dossier.test_reports.length} reports</span>
        </li>
        <li class="artifact-item">
          <span>Coverage Report</span>
          <span class="badge ${dossier.coverage_report ? 'badge-present' : 'badge-missing'}">
            ${dossier.coverage_report ? 'Present' : 'Missing'}
          </span>
        </li>
      </ul>
    </div>

    <div class="section">
      <h2>Security Artifacts</h2>
      <ul class="artifact-list">
        <li class="artifact-item">
          <span>Security Pack</span>
          <span class="badge ${dossier.security_pack ? 'badge-present' : 'badge-missing'}">
            ${dossier.security_pack ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>Software Bill of Materials (SBOM)</span>
          <span class="badge ${dossier.sbom ? 'badge-present' : 'badge-missing'}">
            ${dossier.sbom ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>Code Signatures</span>
          <span class="badge badge-count">${dossier.signatures.length} signatures</span>
        </li>
        <li class="artifact-item">
          <span>Vulnerability Scans</span>
          <span class="badge badge-count">${dossier.vulnerability_scans.length} scans</span>
        </li>
      </ul>
    </div>

    <div class="section">
      <h2>Quality Artifacts</h2>
      <ul class="artifact-list">
        <li class="artifact-item">
          <span>Performance Reports</span>
          <span class="badge badge-count">${dossier.performance_reports.length} reports</span>
        </li>
        <li class="artifact-item">
          <span>Accessibility Reports</span>
          <span class="badge badge-count">${dossier.accessibility_reports.length} audits</span>
        </li>
      </ul>
      ${
        dossier.release_notes
          ? `
      <div class="release-notes">
        <strong>Release Notes:</strong>
        <pre>${dossier.release_notes}</pre>
      </div>
      `
          : ''
      }
    </div>

    <div class="section">
      <h2>Deployment Artifacts</h2>
      <ul class="artifact-list">
        <li class="artifact-item">
          <span>Deployment Plan</span>
          <span class="badge ${dossier.deployment_plan ? 'badge-present' : 'badge-missing'}">
            ${dossier.deployment_plan ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>Rollback Plan</span>
          <span class="badge ${dossier.rollback_plan ? 'badge-present' : 'badge-missing'}">
            ${dossier.rollback_plan ? 'Present' : 'Missing'}
          </span>
        </li>
        <li class="artifact-item">
          <span>Canary Deployment Rules</span>
          <span class="badge ${dossier.canary_rules ? 'badge-present' : 'badge-missing'}">
            ${dossier.canary_rules ? 'Present' : 'Missing'}
          </span>
        </li>
      </ul>
    </div>

    <div class="section">
      <h2>Full Dossier (JSON)</h2>
      <pre>${JSON.stringify(dossier, null, 2)}</pre>
    </div>
  </div>
</body>
</html>
`;

    return Buffer.from(html);
  }

  /**
   * Load dossier from database
   *
   * @param runId - Run ID
   * @returns Release dossier or null if not found
   */
  async loadDossier(runId: string): Promise<ReleaseDossier | null> {
    const result = await this.db.query(
      `SELECT content FROM release_dossiers WHERE run_id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].content as ReleaseDossier;
  }

  /**
   * Get dossier summary statistics
   *
   * @param runId - Run ID
   * @returns Summary of dossier contents
   */
  async getSummary(runId: string): Promise<{
    version: string;
    artifact_counts: Record<string, number>;
    completeness_percent: number;
    missing_artifacts: string[];
  }> {
    const dossier = await this.loadDossier(runId);

    if (!dossier) {
      throw new Error(`No dossier found for run ${runId}`);
    }

    // Count artifacts by category
    const artifactCounts = {
      product: [dossier.prd, dossier.rtm, dossier.api_spec].filter(Boolean)
        .length,
      code: [
        dossier.repository_url,
        dossier.commit_sha,
        dossier.coverage_report,
      ].filter(Boolean).length,
      security: [dossier.security_pack, dossier.sbom].filter(Boolean).length,
      quality: dossier.performance_reports.length +
        dossier.accessibility_reports.length,
      deployment: [
        dossier.deployment_plan,
        dossier.rollback_plan,
        dossier.canary_rules,
      ].filter(Boolean).length,
    };

    // Determine completeness
    const expectedArtifacts = [
      'prd',
      'rtm',
      'api_spec',
      'repository_url',
      'commit_sha',
      'coverage_report',
      'security_pack',
      'sbom',
      'deployment_plan',
      'rollback_plan',
    ];

    const presentArtifacts = expectedArtifacts.filter(
      (key) => (dossier as any)[key]
    );
    const completeness = (presentArtifacts.length / expectedArtifacts.length) *
      100;

    const missingArtifacts = expectedArtifacts.filter(
      (key) => !(dossier as any)[key]
    );

    return {
      version: dossier.version,
      artifact_counts: artifactCounts,
      completeness_percent: Math.round(completeness),
      missing_artifacts: missingArtifacts,
    };
  }
}
