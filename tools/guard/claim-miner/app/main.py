#!/usr/bin/env python3
"""
guard.claimMiner - Extract atomic claims from text

Extracts individual, verifiable claims that can be independently grounded with evidence.
Uses simple NLP heuristics to split text into atomic statements.

TODO: Integrate with LLM for more sophisticated claim extraction
"""

import json
import sys
import re
from typing import List, Dict, Any


def extract_claims(text: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract atomic claims from text.

    Strategy:
    1. Split text into sentences
    2. Identify claim types (fact, assumption, estimate, opinion)
    3. Mark which claims require evidence
    4. Assign confidence scores

    TODO: Replace heuristics with LLM-based extraction
    """
    claims = []

    # Split into sentences (simple splitting - could use spaCy/NLTK)
    sentences = split_into_sentences(text)

    for idx, sentence in enumerate(sentences):
        claim_type = identify_claim_type(sentence)
        requires_evidence = should_require_evidence(claim_type, sentence)
        confidence = estimate_confidence(sentence)

        claims.append({
            "claim_id": f"claim-{context.get('question_id', 'unknown')}-{idx + 1}",
            "text": sentence.strip(),
            "type": claim_type,
            "confidence": confidence,
            "requires_evidence": requires_evidence,
        })

    return claims


def split_into_sentences(text: str) -> List[str]:
    """
    Split text into sentences using simple heuristics.
    TODO: Use proper sentence tokenizer (spaCy, NLTK)
    """
    # Simple sentence splitting by periods, question marks, exclamation marks
    sentences = re.split(r'[.!?]+', text)
    return [s.strip() for s in sentences if s.strip()]


def identify_claim_type(sentence: str) -> str:
    """
    Identify the type of claim based on keywords and patterns.
    """
    sentence_lower = sentence.lower()

    # Assumption markers
    assumption_markers = [
        "we assume", "assuming", "expected to", "likely", "probably",
        "presumably", "it is assumed", "we believe"
    ]
    if any(marker in sentence_lower for marker in assumption_markers):
        return "assumption"

    # Estimate markers
    estimate_markers = [
        "approximately", "around", "roughly", "about", "estimated",
        "expected", "projected", "forecasted"
    ]
    if any(marker in sentence_lower for marker in estimate_markers):
        return "estimate"

    # Opinion markers
    opinion_markers = [
        "we think", "in our opinion", "we feel", "seems like",
        "appears to", "suggests that"
    ]
    if any(marker in sentence_lower for marker in opinion_markers):
        return "opinion"

    # Default to fact if no special markers
    return "fact"


def should_require_evidence(claim_type: str, sentence: str) -> bool:
    """
    Determine if a claim requires evidence citation.
    """
    # Facts and estimates require evidence
    if claim_type in ["fact", "estimate"]:
        return True

    # Assumptions need evidence if they're critical
    if claim_type == "assumption":
        critical_words = ["must", "will", "critical", "essential", "required"]
        return any(word in sentence.lower() for word in critical_words)

    # Opinions don't require hard evidence
    return False


def estimate_confidence(sentence: str) -> float:
    """
    Estimate confidence in claim extraction.
    Higher confidence for clear, declarative statements.
    """
    # Simple heuristic: longer sentences with hedging words = lower confidence
    hedging_words = ["maybe", "perhaps", "might", "could", "possibly"]
    hedge_count = sum(1 for word in hedging_words if word in sentence.lower())

    # Base confidence
    confidence = 0.9

    # Reduce confidence for hedging
    confidence -= hedge_count * 0.1

    # Reduce confidence for very long sentences
    word_count = len(sentence.split())
    if word_count > 30:
        confidence -= 0.1

    return max(0.5, min(1.0, confidence))


def handle(input_data: dict, context: dict) -> dict:
    """Main handler function"""

    # Extract text from input
    text = input_data.get('text', '')
    claim_context = input_data.get('context', {})

    if not text:
        return {
            "error": "No text provided for claim extraction"
        }

    # Extract claims
    claims = extract_claims(text, claim_context)

    return {
        "claims": claims,
        "total_claims": len(claims),
        "claims_requiring_evidence": sum(1 for c in claims if c['requires_evidence']),
        "metadata": {
            "phase": claim_context.get('phase', 'unknown'),
            "question_id": claim_context.get('question_id', 'unknown'),
        }
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
