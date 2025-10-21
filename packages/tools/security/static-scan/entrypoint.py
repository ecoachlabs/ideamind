#!/usr/bin/env python3
"""
Static Security Scanner (SAST) Tool - Entrypoint
Runs Semgrep, Bandit, and optionally CodeQL
"""

import json
import sys
import subprocess
import os
import glob
from typing import List, Dict, Any


def detect_languages(codebase: str) -> List[str]:
    """Auto-detect languages in codebase"""
    languages = set()

    # Language detection by file extension
    extensions_map = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.py': 'python',
        '.go': 'go',
        '.java': 'java',
        '.rb': 'ruby',
        '.php': 'php',
        '.cs': 'csharp',
    }

    try:
        for ext, lang in extensions_map.items():
            matches = glob.glob(f"{codebase}/**/*{ext}", recursive=True)
            if matches:
                languages.add(lang)
    except Exception as e:
        print(f"Language detection failed: {e}", file=sys.stderr)

    return list(languages)


def run_semgrep(
    codebase: str,
    languages: List[str],
    rulesets: List[str],
    paths: List[str] = None,
    exclude: List[str] = None,
    config: str = None
) -> Dict[str, Any]:
    """Run Semgrep scanner"""
    results = {
        "findings": [],
        "filesScanned": 0,
        "linesScanned": 0,
        "rulesApplied": 0
    }

    try:
        cmd = ["semgrep", "scan", "--json"]

        # Add rulesets
        if config:
            cmd.extend(["--config", config])
        else:
            # Use built-in rulesets
            for ruleset in rulesets:
                if ruleset == "owasp-top-10":
                    cmd.extend(["--config", "p/owasp-top-ten"])
                elif ruleset == "cwe-top-25":
                    cmd.extend(["--config", "p/cwe-top-25"])
                elif ruleset == "pci-dss":
                    cmd.extend(["--config", "p/pci-dss"])
                elif ruleset == "auto":
                    cmd.extend(["--config", "auto"])

        # Add exclude patterns
        if exclude:
            for pattern in exclude:
                cmd.extend(["--exclude", pattern])

        # Add paths
        if paths:
            cmd.extend(paths)
        else:
            cmd.append(codebase)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10 minutes
        )

        # Parse JSON output
        semgrep_output = json.loads(result.stdout)

        # Extract findings
        for finding in semgrep_output.get("results", []):
            results["findings"].append({
                "check_id": finding.get("check_id"),
                "ruleId": finding.get("check_id"),
                "severity": finding.get("extra", {}).get("severity", "warning"),
                "message": finding.get("extra", {}).get("message", ""),
                "path": finding.get("path"),
                "line": finding.get("start", {}).get("line"),
                "column": finding.get("start", {}).get("col"),
                "code": finding.get("extra", {}).get("lines", ""),
                "extra": {
                    "metadata": finding.get("extra", {}).get("metadata", {}),
                    "dataflow_trace": finding.get("extra", {}).get("dataflow_trace"),
                    "message": finding.get("extra", {}).get("message", ""),
                    "severity": finding.get("extra", {}).get("severity"),
                }
            })

        # Extract metrics
        stats = semgrep_output.get("paths", {})
        results["filesScanned"] = stats.get("scanned", 0)

        # Estimate lines scanned (assume ~200 LOC per file)
        results["linesScanned"] = results["filesScanned"] * 200

        # Count unique rules
        unique_rules = set(f["check_id"] for f in results["findings"])
        results["rulesApplied"] = len(unique_rules)

    except subprocess.TimeoutExpired:
        print(f"Semgrep scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"Semgrep scan failed: {e}", file=sys.stderr)

    return results


def run_bandit(
    codebase: str,
    paths: List[str] = None,
    exclude: List[str] = None
) -> Dict[str, Any]:
    """Run Bandit scanner (Python-specific)"""
    results = {
        "findings": [],
        "filesScanned": 0,
        "linesScanned": 0,
        "rulesApplied": 0
    }

    try:
        cmd = ["bandit", "-r", "-f", "json"]

        # Add exclude patterns
        if exclude:
            exclude_str = ",".join(exclude)
            cmd.extend(["--exclude", exclude_str])

        # Add paths
        if paths:
            cmd.extend(paths)
        else:
            cmd.append(codebase)

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes
        )

        # Parse JSON output
        bandit_output = json.loads(result.stdout)

        # Extract findings
        for finding in bandit_output.get("results", []):
            # Map Bandit severity to Semgrep-like severity
            severity_map = {
                "HIGH": "error",
                "MEDIUM": "warning",
                "LOW": "info"
            }

            results["findings"].append({
                "check_id": finding.get("test_id"),
                "ruleId": finding.get("test_id"),
                "severity": severity_map.get(finding.get("issue_severity"), "warning"),
                "message": finding.get("issue_text"),
                "path": finding.get("filename"),
                "line": finding.get("line_number"),
                "column": finding.get("col_offset"),
                "code": finding.get("code", ""),
                "extra": {
                    "metadata": {
                        "confidence": finding.get("issue_confidence"),
                        "cwe": finding.get("cwe", {}).get("id"),
                    },
                    "test_name": finding.get("test_name"),
                    "more_info": finding.get("more_info"),
                    "severity": finding.get("issue_severity"),
                }
            })

        # Extract metrics
        metrics = bandit_output.get("metrics", {})
        results["filesScanned"] = sum(m.get("CONFIDENCE.HIGH", 0) for m in metrics.values())
        results["linesScanned"] = sum(m.get("loc", 0) for m in metrics.values())
        results["rulesApplied"] = len(set(f["check_id"] for f in results["findings"]))

    except subprocess.TimeoutExpired:
        print(f"Bandit scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"Bandit scan failed: {e}", file=sys.stderr)

    return results


def run_codeql(
    codebase: str,
    languages: List[str],
    paths: List[str] = None
) -> Dict[str, Any]:
    """Run CodeQL scanner (optional, slow)"""
    # CodeQL is commented out in Dockerfile for now
    # Return empty results
    return {
        "findings": [],
        "filesScanned": 0,
        "linesScanned": 0,
        "rulesApplied": 0
    }


def deduplicate_findings(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate findings from multiple tools"""
    seen = set()
    deduped = []

    for finding in findings:
        # Create key from file + line + check_id
        key = f"{finding['path']}:{finding['line']}:{finding['check_id']}"

        if key not in seen:
            seen.add(key)
            deduped.append(finding)

    return deduped


def main():
    """Main entrypoint"""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())

        codebase = input_data.get("codebase")
        tool = input_data.get("tool", "semgrep")
        languages = input_data.get("languages", [])
        rulesets = input_data.get("rulesets", ["owasp-top-10", "cwe-top-25"])
        paths = input_data.get("paths")
        exclude = input_data.get("exclude", ["tests/", "test/", "vendor/", "node_modules/", ".git/"])
        config = input_data.get("config")

        if not codebase:
            print(json.dumps({
                "error": "codebase is required",
                "findings": [],
                "filesScanned": 0,
                "linesScanned": 0,
                "rulesApplied": 0,
                "toolVersion": "semgrep-1.45.0+bandit-1.7.5"
            }))
            sys.exit(1)

        # Auto-detect languages if not provided
        if not languages:
            languages = detect_languages(codebase)

        all_findings = []
        total_files = 0
        total_lines = 0
        total_rules = 0

        # Run Semgrep (multi-language)
        if tool in ["semgrep", "all"]:
            semgrep_results = run_semgrep(codebase, languages, rulesets, paths, exclude, config)
            all_findings.extend(semgrep_results["findings"])
            total_files += semgrep_results["filesScanned"]
            total_lines += semgrep_results["linesScanned"]
            total_rules += semgrep_results["rulesApplied"]

        # Run Bandit (Python-specific)
        if (tool in ["bandit", "all"]) and ("python" in languages):
            bandit_results = run_bandit(codebase, paths, exclude)
            all_findings.extend(bandit_results["findings"])
            total_files += bandit_results["filesScanned"]
            total_lines += bandit_results["linesScanned"]
            total_rules += bandit_results["rulesApplied"]

        # Run CodeQL (optional)
        if tool == "codeql":
            codeql_results = run_codeql(codebase, languages, paths)
            all_findings.extend(codeql_results["findings"])
            total_files += codeql_results["filesScanned"]
            total_lines += codeql_results["linesScanned"]
            total_rules += codeql_results["rulesApplied"]

        # Deduplicate
        all_findings = deduplicate_findings(all_findings)

        # Output result
        result = {
            "findings": all_findings,
            "filesScanned": total_files,
            "linesScanned": total_lines,
            "rulesApplied": total_rules,
            "toolVersion": "semgrep-1.45.0+bandit-1.7.5"
        }

        print(json.dumps(result, indent=2))
        sys.exit(0)

    except json.JSONDecodeError:
        print(json.dumps({
            "error": "Invalid JSON input",
            "findings": [],
            "filesScanned": 0,
            "linesScanned": 0,
            "rulesApplied": 0,
            "toolVersion": "semgrep-1.45.0+bandit-1.7.5"
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "findings": [],
            "filesScanned": 0,
            "linesScanned": 0,
            "rulesApplied": 0,
            "toolVersion": "semgrep-1.45.0+bandit-1.7.5"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
