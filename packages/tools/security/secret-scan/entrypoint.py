#!/usr/bin/env python3
"""
Secrets Scanner Tool - Entrypoint
Scans repositories and container images for leaked secrets
"""

import json
import sys
import subprocess
import os
from typing import List, Dict, Any


def redact_secret(secret: str) -> str:
    """Redact secret value for safe logging"""
    if not secret or len(secret) < 8:
        return "***REDACTED***"

    start = secret[:4]
    end = secret[-4:]
    return f"{start}****REDACTED****{end}"


def run_trufflehog(target: str, target_type: str, paths: List[str] = None, exclude: List[str] = None, scan_history: bool = True) -> List[Dict[str, Any]]:
    """Run TruffleHog scanner"""
    findings = []

    try:
        cmd = ["trufflehog"]

        if target_type == "repository":
            cmd.extend(["git", target])

            if not scan_history:
                cmd.append("--since-commit=HEAD")

        elif target_type == "container_image":
            cmd.extend(["docker", "--image", target])

        # Add JSON output format
        cmd.append("--json")

        # Execute TruffleHog
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes max
        )

        # Parse JSON output (one finding per line)
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue

            try:
                finding = json.loads(line)

                # Extract relevant fields
                findings.append({
                    "type": finding.get("DetectorName", "unknown"),
                    "file": finding.get("SourceMetadata", {}).get("Data", {}).get("Filesystem", {}).get("file", ""),
                    "line": finding.get("SourceMetadata", {}).get("Data", {}).get("Filesystem", {}).get("line", 0),
                    "matched": redact_secret(finding.get("Raw", "")),
                    "secret": finding.get("Raw", ""),  # Full secret for internal processing
                    "confidence": 0.9 if finding.get("Verified") else 0.7,
                })
            except json.JSONDecodeError:
                continue

    except subprocess.TimeoutExpired:
        print(f"TruffleHog scan timed out after 5 minutes", file=sys.stderr)
    except Exception as e:
        print(f"TruffleHog scan failed: {e}", file=sys.stderr)

    return findings


def run_gitleaks(target: str, paths: List[str] = None, exclude: List[str] = None) -> List[Dict[str, Any]]:
    """Run Gitleaks scanner"""
    findings = []

    try:
        # Clone repo to temp location if not local
        if target.startswith("http") or target.startswith("git@"):
            clone_dir = "/tmp/repo"
            subprocess.run(
                ["git", "clone", "--depth", "1", target, clone_dir],
                capture_output=True,
                check=True,
                timeout=120
            )
            scan_path = clone_dir
        else:
            scan_path = target

        # Run Gitleaks
        cmd = ["gitleaks", "detect", "--source", scan_path, "--report-format", "json", "--report-path", "/tmp/gitleaks-report.json"]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        # Gitleaks exits with 1 if secrets found, which is expected
        # Read report file
        if os.path.exists("/tmp/gitleaks-report.json"):
            with open("/tmp/gitleaks-report.json", "r") as f:
                report = json.load(f)

            for finding in report:
                findings.append({
                    "type": finding.get("RuleID", "unknown"),
                    "file": finding.get("File", ""),
                    "line": finding.get("StartLine", 0),
                    "matched": redact_secret(finding.get("Secret", "")),
                    "secret": finding.get("Secret", ""),
                    "confidence": 0.8,  # Gitleaks has good detection quality
                })

    except subprocess.TimeoutExpired:
        print(f"Gitleaks scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"Gitleaks scan failed: {e}", file=sys.stderr)

    return findings


def deduplicate_findings(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate findings"""
    seen = set()
    deduped = []

    for finding in findings:
        # Create key from file + line + type
        key = f"{finding['file']}:{finding['line']}:{finding['type']}"

        if key not in seen:
            seen.add(key)
            # Remove internal 'secret' field before returning
            if 'secret' in finding:
                del finding['secret']
            deduped.append(finding)

    return deduped


def main():
    """Main entrypoint"""
    try:
        # Read input from stdin (Tool SDK convention)
        input_data = json.loads(sys.stdin.read())

        target = input_data.get("target")
        target_type = input_data.get("type", "repository")
        paths = input_data.get("paths", [])
        exclude = input_data.get("exclude", [])
        scan_history = input_data.get("scanHistory", True)
        layers = input_data.get("layers", "all")

        if not target:
            print(json.dumps({
                "error": "target is required",
                "findings": [],
                "scanned": "",
                "toolVersion": "trufflehog-3.63.0+gitleaks-8.18.0"
            }))
            sys.exit(1)

        # Run both scanners in parallel
        findings = []

        # TruffleHog (good for verified secrets)
        trufflehog_findings = run_trufflehog(target, target_type, paths, exclude, scan_history)
        findings.extend(trufflehog_findings)

        # Gitleaks (good for pattern-based detection)
        if target_type == "repository":
            gitleaks_findings = run_gitleaks(target, paths, exclude)
            findings.extend(gitleaks_findings)

        # Deduplicate
        findings = deduplicate_findings(findings)

        # Output result
        result = {
            "findings": findings,
            "scanned": target,
            "toolVersion": "trufflehog-3.63.0+gitleaks-8.18.0"
        }

        print(json.dumps(result, indent=2))
        sys.exit(0)

    except json.JSONDecodeError:
        print(json.dumps({
            "error": "Invalid JSON input",
            "findings": [],
            "scanned": "",
            "toolVersion": "trufflehog-3.63.0+gitleaks-8.18.0"
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "findings": [],
            "scanned": "",
            "toolVersion": "trufflehog-3.63.0+gitleaks-8.18.0"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
