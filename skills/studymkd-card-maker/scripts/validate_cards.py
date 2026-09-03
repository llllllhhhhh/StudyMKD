#!/usr/bin/env python3
import argparse
import json
import sys
import unicodedata
from pathlib import Path


def fail(message: str) -> None:
    raise ValueError(message)


def normalized_question(value: str) -> str:
    ignored = " \t\r\n?？!！.,，。:：;；'\"“”‘’()（）[]{}"
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return "".join(char for char in normalized if char not in ignored)


def validate(value: object) -> int:
    if not isinstance(value, dict):
        fail("root must be an object")
    if value.get("format") != "studymkd-cards" or value.get("version") != 1:
        fail("unsupported format or version")
    source = value.get("source")
    if not isinstance(source, dict):
        fail("source must be an object")
    for field in ("projectId", "projectTitle", "chapterId", "chapterTitle", "contentHash"):
        if not isinstance(source.get(field), str) or not source[field].strip():
            fail(f"source.{field} must be a non-empty string")
    cards = value.get("cards")
    if not isinstance(cards, list) or not 1 <= len(cards) <= 100:
        fail("cards must contain 1-100 items")
    seen: set[str] = set()
    for index, card in enumerate(cards, start=1):
        if not isinstance(card, dict):
            fail(f"card {index} must be an object")
        question = card.get("question")
        answer = card.get("answer")
        if not isinstance(question, str) or not question.strip() or len(question.strip()) > 500:
            fail(f"card {index} has an invalid question")
        if not isinstance(answer, str) or not answer.strip() or len(answer.strip()) > 5000:
            fail(f"card {index} has an invalid answer")
        normalized = normalized_question(question)
        if normalized in seen:
            fail(f"card {index} duplicates an earlier question")
        seen.add(normalized)
        excerpt = card.get("sourceExcerpt")
        if excerpt is not None and (not isinstance(excerpt, str) or len(excerpt) > 1000):
            fail(f"card {index} has an invalid sourceExcerpt")
        tags = card.get("tags")
        if tags is not None:
            if not isinstance(tags, list) or len(tags) > 10:
                fail(f"card {index} has invalid tags")
            if any(not isinstance(tag, str) or not tag.strip() for tag in tags):
                fail(f"card {index} has an empty or non-string tag")
    return len(cards)


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a StudyMKD generated card file")
    parser.add_argument("path", help="JSON file path, or - to read stdin")
    args = parser.parse_args()
    try:
        text = sys.stdin.read() if args.path == "-" else Path(args.path).read_text(encoding="utf-8")
        count = validate(json.loads(text))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print(f"VALID: {count} cards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
