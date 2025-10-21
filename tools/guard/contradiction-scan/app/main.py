#!/usr/bin/env python3
"""
guard.contradictionScan - Detect contradictions in Knowledge Map

Scans new Q/A pairs against existing KM nodes to find conflicts.
Uses semantic similarity and rule-based detection.

TODO: Integrate with vector DB and LLM for semantic contradiction detection
"""

import json
import sys
import re
from typing import List, Dict, Any, Tuple


def detect_contradictions(new_answer: Dict[str, Any], existing_nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Detect contradictions between new answer and existing KM nodes.

    Strategy:
    1. Extract key entities and values from new answer
    2. Compare with existing nodes
    3. Detect value conflicts (e.g., "90 days" vs "1 year")
    4. Detect logical conflicts (e.g., "required" vs "optional")
    5. Assign severity based on conflict type
    """

    contradictions = []
    similar_nodes = []

    new_text = new_answer.get('answer', '')
    new_question = new_answer.get('question', '')

    # Extract numeric values from new answer
    new_numbers = extract_numbers(new_text)

    # Extract decision keywords
    new_decisions = extract_decisions(new_text)

    for node in existing_nodes:
        node_text = node.get('answer', '')
        node_question = node.get('question', '')
        node_id = node.get('node_id', 'unknown')

        # Check for topic similarity (simple keyword overlap)
        if are_topics_similar(new_question, node_question):
            similar_nodes.append(node_id)

            # Check for value conflicts
            node_numbers = extract_numbers(node_text)
            if has_numeric_conflict(new_numbers, node_numbers, new_question, node_question):
                contradictions.append({
                    "conflict_with": node_id,
                    "conflict_type": "value",
                    "description": f"Conflicting numeric values: new answer suggests {new_numbers}, existing node has {node_numbers}",
                    "severity": "high",
                    "conflicting_claims": [new_text[:100], node_text[:100]],
                })

            # Check for logical conflicts (yes/no, required/optional, etc.)
            node_decisions = extract_decisions(node_text)
            if has_logical_conflict(new_decisions, node_decisions):
                contradictions.append({
                    "conflict_with": node_id,
                    "conflict_type": "logical",
                    "description": f"Conflicting decisions: new answer={new_decisions}, existing={node_decisions}",
                    "severity": "critical",
                    "conflicting_claims": [new_text[:100], node_text[:100]],
                })

    # Calculate consistency score
    consistency_score = calculate_consistency_score(contradictions, len(existing_nodes))

    return {
        "contradictions": contradictions,
        "consistency_score": consistency_score,
        "similar_nodes": similar_nodes,
    }


def extract_numbers(text: str) -> List[Tuple[float, str]]:
    """
    Extract numeric values with units (e.g., "90 days", "$1000", "3.5 seconds")
    """
    # Pattern: number + optional unit
    pattern = r'(\d+(?:\.\d+)?)\s*([a-zA-Z%$]+)?'
    matches = re.findall(pattern, text)

    numbers = []
    for value, unit in matches:
        numbers.append((float(value), unit.lower() if unit else ''))

    return numbers


def extract_decisions(text: str) -> List[str]:
    """
    Extract decision keywords (yes/no, required/optional, must/should, etc.)
    """
    decisions = []
    text_lower = text.lower()

    decision_patterns = [
        ('required', 'optional'),
        ('must', 'may'),
        ('yes', 'no'),
        ('enabled', 'disabled'),
        ('allowed', 'forbidden'),
        ('always', 'never'),
    ]

    for positive, negative in decision_patterns:
        if positive in text_lower:
            decisions.append(positive)
        elif negative in text_lower:
            decisions.append(negative)

    return decisions


def are_topics_similar(question1: str, question2: str) -> bool:
    """
    Check if two questions are about similar topics (simple keyword overlap).
    TODO: Use vector similarity for better matching.
    """
    # Extract keywords (simple tokenization)
    keywords1 = set(re.findall(r'\b\w{4,}\b', question1.lower()))
    keywords2 = set(re.findall(r'\b\w{4,}\b', question2.lower()))

    # Check overlap
    overlap = keywords1 & keywords2
    if not keywords1 or not keywords2:
        return False

    overlap_ratio = len(overlap) / max(len(keywords1), len(keywords2))
    return overlap_ratio > 0.3  # 30% keyword overlap


def has_numeric_conflict(numbers1: List[Tuple[float, str]], numbers2: List[Tuple[float, str]],
                         q1: str, q2: str) -> bool:
    """
    Detect if numeric values conflict (e.g., "90 days" vs "365 days" for same topic).
    """
    # Simple heuristic: if same units but different values by >20%, flag as potential conflict
    for val1, unit1 in numbers1:
        for val2, unit2 in numbers2:
            if unit1 == unit2 and unit1:  # Same unit
                if abs(val1 - val2) / max(val1, val2) > 0.2:  # >20% difference
                    return True
    return False


def has_logical_conflict(decisions1: List[str], decisions2: List[str]) -> bool:
    """
    Detect if decisions conflict (e.g., "required" vs "optional").
    """
    conflict_pairs = [
        ('required', 'optional'),
        ('must', 'may'),
        ('yes', 'no'),
        ('enabled', 'disabled'),
        ('allowed', 'forbidden'),
        ('always', 'never'),
    ]

    for d1 in decisions1:
        for d2 in decisions2:
            for positive, negative in conflict_pairs:
                if (d1 == positive and d2 == negative) or (d1 == negative and d2 == positive):
                    return True

    return False


def calculate_consistency_score(contradictions: List[Dict[str, Any]], total_nodes: int) -> float:
    """
    Calculate consistency score based on number and severity of contradictions.
    """
    if total_nodes == 0:
        return 1.0

    # Weight by severity
    severity_weights = {
        'critical': 1.0,
        'high': 0.7,
        'medium': 0.4,
        'low': 0.2,
    }

    total_penalty = sum(severity_weights.get(c['severity'], 0.5) for c in contradictions)

    # Normalize by number of nodes
    max_penalty = total_nodes * 1.0  # Assume all could be critical
    consistency = 1.0 - min(1.0, total_penalty / max_penalty)

    return round(consistency, 2)


def handle(input_data: dict, context: dict) -> dict:
    """Main handler function"""

    # Extract inputs
    new_answer = input_data.get('new_answer', {})
    existing_nodes = input_data.get('existing_km_nodes', [])

    if not new_answer:
        return {"error": "No new answer provided for contradiction scan"}

    # Detect contradictions
    result = detect_contradictions(new_answer, existing_nodes)

    return {
        **result,
        "total_contradictions": len(result['contradictions']),
        "has_critical_conflicts": any(c['severity'] == 'critical' for c in result['contradictions']),
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
