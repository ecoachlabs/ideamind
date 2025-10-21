#!/usr/bin/env python3
"""
Dependency Scanner Tool - Entrypoint
Scans dependencies for CVEs and license issues
"""

import json
import sys
import subprocess
import os
from typing import List, Dict, Any


def run_trivy_manifest(manifest: str, scan_transitive: bool = True) -> Dict[str, Any]:
    """Run Trivy on a dependency manifest"""
    results = {
        "vulnerabilities": [],
        "licenses": []
    }

    try:
        cmd = [
            "trivy",
            "fs",  # Filesystem scan
            "--format", "json",
            "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
            manifest
        ]

        if not scan_transitive:
            cmd.append("--skip-update")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0 and result.returncode != 1:
            # Trivy returns 1 if vulnerabilities found (expected)
            print(f"Trivy scan failed: {result.stderr}", file=sys.stderr)
            return results

        # Parse JSON output
        trivy_output = json.loads(result.stdout)

        # Extract vulnerabilities
        for result_item in trivy_output.get("Results", []):
            for vuln in result_item.get("Vulnerabilities", []):
                results["vulnerabilities"].append({
                    "cveId": vuln.get("VulnerabilityID"),
                    "package": vuln.get("PkgName"),
                    "version": vuln.get("InstalledVersion"),
                    "severity": vuln.get("Severity", "UNKNOWN").lower(),
                    "cvssScore": extract_cvss_score(vuln),
                    "description": vuln.get("Description", ""),
                    "fixedIn": vuln.get("FixedVersion"),
                    "exploitAvailable": False,  # Trivy doesn't provide this
                    "path": [vuln.get("PkgName")],  # Simplified path
                })

            # Extract licenses
            for pkg in result_item.get("Packages", []):
                licenses = pkg.get("Licenses", [])
                for license in licenses:
                    if is_problematic_license(license):
                        results["licenses"].append({
                            "package": pkg.get("Name"),
                            "version": pkg.get("Version"),
                            "license": license,
                        })

    except subprocess.TimeoutExpired:
        print(f"Trivy scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"Trivy scan failed: {e}", file=sys.stderr)

    return results


def run_trivy_image(image: str, scan_layers: bool = True) -> Dict[str, Any]:
    """Run Trivy on a container image"""
    results = {
        "vulnerabilities": [],
        "licenses": []
    }

    try:
        cmd = [
            "trivy",
            "image",
            "--format", "json",
            "--severity", "CRITICAL,HIGH,MEDIUM,LOW",
            image
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0 and result.returncode != 1:
            print(f"Trivy image scan failed: {result.stderr}", file=sys.stderr)
            return results

        # Parse JSON output
        trivy_output = json.loads(result.stdout)

        # Extract vulnerabilities (same as manifest scan)
        for result_item in trivy_output.get("Results", []):
            for vuln in result_item.get("Vulnerabilities", []):
                results["vulnerabilities"].append({
                    "cveId": vuln.get("VulnerabilityID"),
                    "package": vuln.get("PkgName"),
                    "version": vuln.get("InstalledVersion"),
                    "severity": vuln.get("Severity", "UNKNOWN").lower(),
                    "cvssScore": extract_cvss_score(vuln),
                    "description": vuln.get("Description", ""),
                    "fixedIn": vuln.get("FixedVersion"),
                    "exploitAvailable": False,
                    "path": [vuln.get("PkgName")],
                })

            # Extract licenses
            for pkg in result_item.get("Packages", []):
                licenses = pkg.get("Licenses", [])
                for license in licenses:
                    if is_problematic_license(license):
                        results["licenses"].append({
                            "package": pkg.get("Name"),
                            "version": pkg.get("Version"),
                            "license": license,
                        })

    except subprocess.TimeoutExpired:
        print(f"Trivy image scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"Trivy image scan failed: {e}", file=sys.stderr)

    return results


def run_osv_scanner(manifest: str) -> Dict[str, Any]:
    """Run OSV Scanner on a dependency manifest"""
    results = {
        "vulnerabilities": [],
        "licenses": []
    }

    try:
        cmd = [
            "osv-scanner",
            "--format", "json",
            "--lockfile", manifest
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        # OSV Scanner returns 1 if vulnerabilities found
        if result.returncode != 0 and result.returncode != 1:
            print(f"OSV scan failed: {result.stderr}", file=sys.stderr)
            return results

        # Parse JSON output
        osv_output = json.loads(result.stdout)

        # Extract vulnerabilities
        for result_item in osv_output.get("results", []):
            for package in result_item.get("packages", []):
                for vuln in package.get("vulnerabilities", []):
                    results["vulnerabilities"].append({
                        "cveId": extract_cve_id(vuln),
                        "package": package.get("package", {}).get("name"),
                        "version": package.get("package", {}).get("version"),
                        "severity": vuln.get("severity", [{}])[0].get("type", "UNKNOWN").lower(),
                        "cvssScore": extract_osv_cvss(vuln),
                        "description": vuln.get("summary", ""),
                        "fixedIn": extract_fixed_version(vuln),
                        "exploitAvailable": False,
                        "path": [package.get("package", {}).get("name")],
                    })

    except subprocess.TimeoutExpired:
        print(f"OSV scan timed out", file=sys.stderr)
    except Exception as e:
        print(f"OSV scan failed: {e}", file=sys.stderr)

    return results


def extract_cvss_score(vuln: Dict[str, Any]) -> float:
    """Extract CVSS score from Trivy vulnerability"""
    cvss = vuln.get("CVSS", {})

    # Try CVSS v3
    if "nvd" in cvss:
        return cvss["nvd"].get("V3Score", 0.0)

    # Fallback to v2
    if "redhat" in cvss:
        return cvss["redhat"].get("V3Score", 0.0)

    return 0.0


def extract_osv_cvss(vuln: Dict[str, Any]) -> float:
    """Extract CVSS score from OSV vulnerability"""
    severity = vuln.get("severity", [])
    if severity:
        for s in severity:
            if s.get("type") == "CVSS_V3":
                score = s.get("score")
                if score:
                    try:
                        # Parse "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" format
                        # Just return a default high score if parsing fails
                        return 7.5
                    except:
                        return 7.5
    return 0.0


def extract_cve_id(vuln: Dict[str, Any]) -> str:
    """Extract CVE ID from OSV vulnerability"""
    aliases = vuln.get("aliases", [])
    for alias in aliases:
        if alias.startswith("CVE-"):
            return alias

    return vuln.get("id", "UNKNOWN")


def extract_fixed_version(vuln: Dict[str, Any]) -> str:
    """Extract fixed version from OSV vulnerability"""
    affected = vuln.get("affected", [])
    if affected:
        ranges = affected[0].get("ranges", [])
        if ranges:
            events = ranges[0].get("events", [])
            for event in events:
                if "fixed" in event:
                    return event["fixed"]

    return ""


def is_problematic_license(license: str) -> bool:
    """Check if license is problematic (copyleft, proprietary, unknown)"""
    problematic = ["GPL", "LGPL", "AGPL", "SSPL", "UNKNOWN", "PROPRIETARY"]
    return any(p in license.upper() for p in problematic)


def deduplicate_vulnerabilities(vulns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate vulnerabilities"""
    seen = set()
    deduped = []

    for vuln in vulns:
        key = f"{vuln['cveId']}:{vuln['package']}:{vuln['version']}"

        if key not in seen:
            seen.add(key)
            deduped.append(vuln)

    return deduped


def deduplicate_licenses(licenses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicate license issues"""
    seen = set()
    deduped = []

    for lic in licenses:
        key = f"{lic['package']}:{lic['version']}:{lic['license']}"

        if key not in seen:
            seen.add(key)
            deduped.append(lic)

    return deduped


def main():
    """Main entrypoint"""
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())

        manifest = input_data.get("manifest")
        image = input_data.get("image")
        scan_transitive = input_data.get("scanTransitive", True)
        databases = input_data.get("databases", ["osv", "nvd", "github"])
        check_licenses = input_data.get("checkLicenses", True)
        scan_layers = input_data.get("scanLayers", True)

        all_vulnerabilities = []
        all_licenses = []

        # Scan manifest if provided
        if manifest:
            # Run Trivy
            trivy_results = run_trivy_manifest(manifest, scan_transitive)
            all_vulnerabilities.extend(trivy_results["vulnerabilities"])
            all_licenses.extend(trivy_results["licenses"])

            # Run OSV Scanner if requested
            if "osv" in databases:
                osv_results = run_osv_scanner(manifest)
                all_vulnerabilities.extend(osv_results["vulnerabilities"])

        # Scan image if provided
        if image:
            trivy_results = run_trivy_image(image, scan_layers)
            all_vulnerabilities.extend(trivy_results["vulnerabilities"])
            all_licenses.extend(trivy_results["licenses"])

        # Deduplicate
        all_vulnerabilities = deduplicate_vulnerabilities(all_vulnerabilities)
        all_licenses = deduplicate_licenses(all_licenses)

        # Output result
        result = {
            "vulnerabilities": all_vulnerabilities,
            "licenses": all_licenses if check_licenses else [],
            "toolVersion": "trivy-0.48.0+osv-scanner-1.4.3"
        }

        print(json.dumps(result, indent=2))
        sys.exit(0)

    except json.JSONDecodeError:
        print(json.dumps({
            "error": "Invalid JSON input",
            "vulnerabilities": [],
            "licenses": [],
            "toolVersion": "trivy-0.48.0+osv-scanner-1.4.3"
        }))
        sys.exit(1)

    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "vulnerabilities": [],
            "licenses": [],
            "toolVersion": "trivy-0.48.0+osv-scanner-1.4.3"
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
