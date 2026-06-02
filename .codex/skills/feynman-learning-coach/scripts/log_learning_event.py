#!/usr/bin/env python3
"""Append a Feynman learning event and update topic state."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EVENTS = {
    "scope",
    "concept",
    "question",
    "answer",
    "teach-back",
    "checkpoint",
    "review",
    "summary",
}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    if slug:
        return slug
    digest = hashlib.sha1(value.strip().encode("utf-8")).hexdigest()[:8]
    return f"topic-{digest}"


def parse_metadata(values: list[str]) -> dict[str, str]:
    metadata: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"metadata must be key=value, got: {value}")
        key, raw = value.split("=", 1)
        key = key.strip()
        if not key:
            raise SystemExit(f"metadata key cannot be empty: {value}")
        metadata[key] = raw.strip()
    return metadata


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")


def update_notes(path: Path, event: dict[str, Any]) -> None:
    if not path.exists():
        path.write_text(f"# {event['topic']} - Feynman Learning Notes\n\n", encoding="utf-8")

    lines = [
        f"## {event['timestamp']} - {event['event']}",
        "",
        f"- Summary: {event['summary']}",
    ]
    if event.get("concept"):
        lines.append(f"- Concept: {event['concept']}")
    if event.get("confidence") is not None:
        lines.append(f"- Confidence: {event['confidence']}/5")
    lines.append("")

    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))


def update_state(path: Path, event: dict[str, Any]) -> dict[str, Any]:
    now = event["timestamp"]
    state = read_json(
        path,
        {
            "topic": event["topic"],
            "topic_slug": event["topic_slug"],
            "created_at": now,
            "updated_at": now,
            "level": None,
            "target": None,
            "event_counts": {},
            "concepts": {},
            "last_summary": None,
        },
    )

    state["updated_at"] = now
    if event.get("level"):
        state["level"] = event["level"]
    if event.get("target"):
        state["target"] = event["target"]

    counts = state.setdefault("event_counts", {})
    counts[event["event"]] = counts.get(event["event"], 0) + 1
    state["last_summary"] = event["summary"]

    concept = event.get("concept")
    if concept:
        concepts = state.setdefault("concepts", {})
        record = concepts.setdefault(
            concept,
            {
                "seen": 0,
                "last_seen": None,
                "last_event": None,
                "confidence": None,
            },
        )
        record["seen"] += 1
        record["last_seen"] = now
        record["last_event"] = event["event"]
        if event.get("confidence") is not None:
            record["confidence"] = event["confidence"]

    path.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return state


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Log a Feynman learning event.")
    parser.add_argument("--topic", required=True, help="Learning topic name.")
    parser.add_argument("--event", required=True, choices=sorted(EVENTS), help="Event type.")
    parser.add_argument("--summary", required=True, help="Short event summary.")
    parser.add_argument("--level", help="Current learning level.")
    parser.add_argument("--target", help="Target outcome for the session.")
    parser.add_argument("--concept", help="Concept involved in this event.")
    parser.add_argument("--confidence", type=int, choices=range(1, 6), help="Confidence or teach-back score from 1 to 5.")
    parser.add_argument("--log-root", default=".learning/feynman", help="Directory for learning logs.")
    parser.add_argument("--metadata", action="append", default=[], help="Extra key=value metadata. Repeatable.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    topic_slug = slugify(args.topic)
    topic_dir = Path(args.log_root) / topic_slug
    topic_dir.mkdir(parents=True, exist_ok=True)

    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "topic": args.topic,
        "topic_slug": topic_slug,
        "event": args.event,
        "summary": args.summary,
        "level": args.level,
        "target": args.target,
        "concept": args.concept,
        "confidence": args.confidence,
        "metadata": parse_metadata(args.metadata),
    }

    events_path = topic_dir / "events.jsonl"
    state_path = topic_dir / "state.json"
    notes_path = topic_dir / "notes.md"

    append_jsonl(events_path, event)
    state = update_state(state_path, event)
    update_notes(notes_path, event)

    print(
        json.dumps(
            {
                "status": "ok",
                "topic_slug": topic_slug,
                "event": args.event,
                "events_path": str(events_path),
                "state_path": str(state_path),
                "notes_path": str(notes_path),
                "event_count": sum(state.get("event_counts", {}).values()),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
