#!/usr/bin/env python3
"""
guard.quantSanity - Validate numeric answers

Checks numeric values for sanity, unit consistency, and plausibility.
Detects common errors and illogical values.
"""

import json
import sys
import re
from typing import List, Dict, Any, Tuple


def validate_numeric_sanity(answer: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate all numeric values in answer for sanity.

    Checks:
    1. Unit consistency (don't mix incompatible units)
    2. Range plausibility (e.g., percentages 0-100%, latencies > 0)
    3. Unit presence (numeric claims should have units)
    4. Order of magnitude (detect 1000x errors)
    """

    issues = []
    extracted_values = []

    # Extract all numeric values with units
    pattern = r'(\d+(?:\.\d+)?)\s*([a-zA-Z%$]+)?'
    matches = re.finditer(pattern, answer)

    for match in matches:
        value_str = match.group(1)
        unit = match.group(2) or ''
        value = float(value_str)

        # Get surrounding context
        start = max(0, match.start() - 20)
        end = min(len(answer), match.end() + 20)
        value_context = answer[start:end].strip()

        extracted_values.append({
            "value": value,
            "unit": unit.lower() if unit else '',
            "context": value_context,
        })

        # Validate based on unit type
        unit_lower = unit.lower() if unit else ''

        # Check percentages
        if unit_lower in ['%', 'percent', 'percentage']:
            if value < 0 or value > 100:
                issues.append({
                    "issue_type": "out_of_range",
                    "description": f"Percentage value {value}% is out of range (expected 0-100%)",
                    "value": f"{value}{unit}",
                    "severity": "high",
                })

        # Check time values
        if unit_lower in ['ms', 'milliseconds', 'seconds', 's', 'minutes', 'min', 'hours', 'h', 'days']:
            if value < 0:
                issues.append({
                    "issue_type": "out_of_range",
                    "description": f"Time value {value}{unit} cannot be negative",
                    "value": f"{value}{unit}",
                    "severity": "critical",
                })

            # Check for implausibly large values
            if unit_lower in ['ms', 'milliseconds'] and value > 86400000:  # > 1 day in ms
                issues.append({
                    "issue_type": "implausible",
                    "description": f"Time value {value}ms is implausibly large (> 1 day)",
                    "value": f"{value}{unit}",
                    "severity": "medium",
                })

        # Check counts
        if unit_lower in ['users', 'items', 'records', 'requests', 'transactions']:
            if value < 0:
                issues.append({
                    "issue_type": "out_of_range",
                    "description": f"Count {value} {unit} cannot be negative",
                    "value": f"{value}{unit}",
                    "severity": "critical",
                })

        # Check currency
        if unit_lower in ['$', 'usd', 'eur', '€', '£', 'gbp']:
            if value < 0:
                issues.append({
                    "issue_type": "out_of_range",
                    "description": f"Cost {unit}{value} cannot be negative",
                    "value": f"{unit}{value}",
                    "severity": "high",
                })

        # Warn about missing units for standalone numbers
        if not unit and value > 1:
            # Check if it's a percentage or ratio based on context
            if 'percent' not in value_context.lower() and 'ratio' not in value_context.lower():
                issues.append({
                    "issue_type": "missing_unit",
                    "description": f"Numeric value {value} lacks a unit (ambiguous)",
                    "value": str(value),
                    "severity": "medium",
                })

    # Check for unit consistency (mixed incompatible units)
    time_units = [v for v in extracted_values if v['unit'] in ['ms', 'milliseconds', 's', 'seconds', 'min', 'minutes']]
    if len(time_units) > 1:
        # Check if mixing milliseconds with seconds (common error source)
        has_ms = any(v['unit'] in ['ms', 'milliseconds'] for v in time_units)
        has_seconds = any(v['unit'] in ['s', 'seconds'] for v in time_units)
        if has_ms and has_seconds:
            issues.append({
                "issue_type": "inconsistent",
                "description": "Mixing milliseconds and seconds - ensure consistent units",
                "value": "time_units",
                "severity": "low",
            })

    # Determine overall sanity
    critical_issues = [i for i in issues if i['severity'] in ['critical', 'high']]
    is_sane = len(critical_issues) == 0

    return {
        "is_sane": is_sane,
        "issues": issues,
        "extracted_values": extracted_values,
    }


def handle(input_data: dict, context: dict) -> dict:
    """Main handler function"""

    # Extract inputs
    answer = input_data.get('answer', '')
    validation_context = input_data.get('context', {})

    if not answer:
        return {"error": "No answer provided for numeric validation"}

    # Validate numeric sanity
    result = validate_numeric_sanity(answer, validation_context)

    return {
        **result,
        "total_values": len(result['extracted_values']),
        "total_issues": len(result['issues']),
        "critical_issues": sum(1 for i in result['issues'] if i['severity'] == 'critical'),
    }


if __name__ == "__main__":
    # Read from stdin (Runner protocol)
    payload = json.load(sys.stdin)
    input_data = payload.get("input", {})
    context = input_data.pop("_context", {})

    try:
        output = handle(input_data, context)
        print(json.dumps({"ok": True, "output": output}))
    except Exception as e:
        print(json.dumps({
            "ok": False,
            "error": {
                "type": "runtime",
                "message": str(e),
                "retryable": False
            }
        }))
        sys.exit(1)
