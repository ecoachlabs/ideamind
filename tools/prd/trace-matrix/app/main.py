#!/usr/bin/env python3
"""
Tool: tool.prd.traceMatrix
Build Requirements Traceability Matrix linking use-cases to stories to tests
"""

import sys
import json
from typing import List, Dict, Any
from difflib import SequenceMatcher


def compute_similarity(text1: str, text2: str) -> float:
    """
    Compute text similarity score between 0 and 1

    Args:
        text1: First text
        text2: Second text

    Returns:
        Similarity score (0-1)
    """
    # Simple implementation - in production, use more sophisticated NLP
    # like sentence transformers, BERT embeddings, etc.
    return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()


def link_stories_to_use_cases(
    use_cases: List[Dict[str, Any]],
    stories: List[Dict[str, Any]],
    threshold: float
) -> Dict[str, Dict[str, Any]]:
    """
    Link stories to use cases based on text similarity

    Args:
        use_cases: List of use cases
        stories: List of stories
        threshold: Minimum similarity threshold

    Returns:
        Dictionary mapping use_case_id to linked stories with scores
    """
    links = {}

    for use_case in use_cases:
        uc_id = use_case["id"]
        uc_text = f"{use_case['title']} {use_case['description']}"

        links[uc_id] = {
            "story_ids": [],
            "scores": {}
        }

        for story in stories:
            story_id = story["id"]
            story_text = f"{story['title']} {story.get('description', '')}"

            # Compute similarity
            score = compute_similarity(uc_text, story_text)

            if score >= threshold:
                links[uc_id]["story_ids"].append(story_id)
                links[uc_id]["scores"][story_id] = score

    return links


def link_tests_to_stories(
    stories: List[Dict[str, Any]],
    tests: List[Dict[str, Any]],
    threshold: float
) -> Dict[str, List[str]]:
    """
    Link tests to stories based on text similarity

    Args:
        stories: List of stories
        tests: List of tests
        threshold: Minimum similarity threshold

    Returns:
        Dictionary mapping story_id to linked test IDs
    """
    links = {}

    for story in stories:
        story_id = story["id"]
        story_text = f"{story['title']} {story.get('description', '')}"

        links[story_id] = []

        for test in tests:
            test_id = test["id"]
            test_text = f"{test['title']}"

            # Compute similarity
            score = compute_similarity(story_text, test_text)

            if score >= threshold:
                links[story_id].append(test_id)

    return links


def identify_gaps(
    use_cases: List[Dict[str, Any]],
    stories: List[Dict[str, Any]],
    tests: List[Dict[str, Any]],
    uc_story_links: Dict[str, Dict[str, Any]],
    story_test_links: Dict[str, List[str]],
    threshold: float
) -> List[Dict[str, str]]:
    """
    Identify gaps in traceability coverage

    Args:
        use_cases: List of use cases
        stories: List of stories
        tests: List of tests
        uc_story_links: Use case to story links
        story_test_links: Story to test links
        threshold: Similarity threshold

    Returns:
        List of gap objects
    """
    gaps = []

    # Use cases with no stories
    for uc in use_cases:
        if not uc_story_links[uc["id"]]["story_ids"]:
            gaps.append({
                "type": "use_case_no_stories",
                "entity_id": uc["id"],
                "message": f"Use case '{uc['title']}' has no linked stories"
            })

    # Stories not linked to any use case
    linked_stories = set()
    for links in uc_story_links.values():
        linked_stories.update(links["story_ids"])

    for story in stories:
        if story["id"] not in linked_stories:
            gaps.append({
                "type": "story_no_use_case",
                "entity_id": story["id"],
                "message": f"Story '{story['title']}' is not linked to any use case"
            })

    # Use cases with stories but no tests
    if tests:
        for uc in use_cases:
            uc_id = uc["id"]
            story_ids = uc_story_links[uc_id]["story_ids"]

            has_tests = any(
                story_test_links.get(sid, [])
                for sid in story_ids
            )

            if story_ids and not has_tests:
                gaps.append({
                    "type": "use_case_no_tests",
                    "entity_id": uc_id,
                    "message": f"Use case '{uc['title']}' has stories but no linked tests"
                })

    # Low confidence links
    for uc_id, links in uc_story_links.items():
        for story_id, score in links["scores"].items():
            if score < threshold + 0.1:  # Within 10% of threshold
                gaps.append({
                    "type": "low_confidence",
                    "entity_id": f"{uc_id}→{story_id}",
                    "message": f"Low confidence link (score: {score:.2f})"
                })

    return gaps


def handle(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main handler function

    Args:
        input_data: Tool input

    Returns:
        Traceability matrix output
    """
    use_cases = input_data["use_cases"]
    stories = input_data["stories"]
    tests = input_data.get("tests", [])
    threshold = input_data.get("similarity_threshold", 0.7)

    # Link stories to use cases
    uc_story_links = link_stories_to_use_cases(use_cases, stories, threshold)

    # Link tests to stories (if tests provided)
    story_test_links = {}
    if tests:
        story_test_links = link_tests_to_stories(stories, tests, threshold)

    # Build RTM entries
    rtm = []
    for uc in use_cases:
        uc_id = uc["id"]
        story_ids = uc_story_links[uc_id]["story_ids"]

        # Get test IDs from linked stories
        test_ids = []
        for story_id in story_ids:
            test_ids.extend(story_test_links.get(story_id, []))

        # Remove duplicates
        test_ids = list(set(test_ids))

        # Calculate coverage percentage
        coverage = 100.0 if story_ids else 0.0
        if tests and story_ids:
            coverage = (len(test_ids) / len(story_ids)) * 100

        rtm.append({
            "use_case_id": uc_id,
            "story_ids": story_ids,
            "test_ids": test_ids,
            "confidence_scores": uc_story_links[uc_id]["scores"],
            "coverage_percentage": round(coverage, 2)
        })

    # Identify gaps
    gaps = identify_gaps(
        use_cases, stories, tests,
        uc_story_links, story_test_links, threshold
    )

    # Calculate metrics
    total_links = sum(len(links["story_ids"]) for links in uc_story_links.values())
    covered_uc = sum(1 for links in uc_story_links.values() if links["story_ids"])
    orphaned = len([s for s in stories if s["id"] not in
                    set(sid for links in uc_story_links.values()
                        for sid in links["story_ids"])])

    metrics = {
        "total_use_cases": len(use_cases),
        "total_stories": len(stories),
        "total_tests": len(tests),
        "coverage_percentage": round((covered_uc / len(use_cases)) * 100, 2),
        "orphaned_stories": orphaned,
        "uncovered_use_cases": len(use_cases) - covered_uc
    }

    return {
        "rtm": rtm,
        "gaps": gaps,
        "metrics": metrics
    }


if __name__ == "__main__":
    try:
        # Read input from stdin
        payload = json.load(sys.stdin)

        # Execute handler
        output = handle(payload["input"])

        # Write output to stdout
        result = {
            "ok": True,
            "output": output
        }
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        # Write error to stdout
        error_result = {
            "ok": False,
            "error": {
                "code": "HANDLER_ERROR",
                "message": str(e)
            }
        }
        print(json.dumps(error_result))
        sys.exit(1)
