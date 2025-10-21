#!/usr/bin/env python3
"""
guard.sourceTagger - Tag evidence sources in answers

Identifies evidence citations and verifies they reference valid artifacts.
Detects missing citations and invalid references.
"""

import json
import sys
import re
from typing import List, Dict, Any, Tuple


def tag_evidence_sources(answer: str, artifacts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Tag evidence sources in answer text.

    Strategy:
    1. Extract existing citation patterns [evidence:artifact_id]
    2. Verify cited artifacts exist
    3. Identify claims without citations
    4. Build evidence map
    """

    # Extract artifact IDs
    valid_artifact_ids = {a['artifact_id'] for a in artifacts}

    # Find all citation patterns [evidence:artifact_id]
    citation_pattern = r'\[evidence:([^\]]+)\]'
    citations = re.findall(citation_pattern, answer)

    # Build evidence map
    evidence_map = {}
    invalid_citations = []

    for idx, artifact_id in enumerate(citations):
        evidence_key = f"evidence_{idx + 1}"
        evidence_map[evidence_key] = artifact_id

        # Check if artifact exists
        if artifact_id not in valid_artifact_ids:
            invalid_citations.append(artifact_id)

    # Detect missing citations (simple heuristic: sentences without citations)
    missing_citations = detect_missing_citations(answer, citations)

    # Tag answer (keep existing tags)
    tagged_answer = answer

    return {
        "tagged_answer": tagged_answer,
        "evidence_map": evidence_map,
        "missing_citations": missing_citations,
        "invalid_citations": invalid_citations,
    }


def detect_missing_citations(answer: str, citations: List[str]) -> List[str]:
    """
    Detect claims/statements that lack evidence citations.
    Simple heuristic: sentences with factual claims but no [evidence:*] tags.
    """
    # Split into sentences
    sentences = re.split(r'[.!?]+', answer)

    missing = []

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        # Check if sentence has a citation
        has_citation = '[evidence:' in sentence

        # Check if sentence is a factual claim (contains specific keywords)
        factual_indicators = [
            'is', 'are', 'was', 'were', 'will', 'has', 'have', 'shows', 'indicates',
            'according to', 'data', 'results', 'reports', 'studies'
        ]

        is_factual = any(indicator in sentence.lower() for indicator in factual_indicators)

        # If factual claim without citation, mark as missing
        if is_factual and not has_citation:
            missing.append(sentence)

    return missing


def handle(input_data: dict, context: dict) -> dict:
    """Main handler function"""

    # Extract inputs
    answer = input_data.get('answer', '')
    artifacts = input_data.get('artifacts', [])

    if not answer:
        return {"error": "No answer provided for evidence tagging"}

    if not artifacts:
        return {"error": "No artifacts provided for citation verification"}

    # Tag evidence sources
    result = tag_evidence_sources(answer, artifacts)

    return {
        **result,
        "total_citations": len(result['evidence_map']),
        "invalid_count": len(result['invalid_citations']),
        "missing_count": len(result['missing_citations']),
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
