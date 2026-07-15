#!/usr/bin/env python3
"""Log a quick-learn learning project event and update local state."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EVENTS = {
    "contract",
    "source",
    "source-pack",
    "source-review",
    "diagnosis",
    "syllabus",
    "syllabus-confirmation",
    "syllabus-review",
    "lesson",
    "question",
    "answer",
    "teach-back",
    "assessment",
    "stage-review",
    "teaching-review",
    "review",
    "phase-change",
    "summary",
}

REVIEW_EVENTS = {"source-review", "syllabus-review", "stage-review", "teaching-review", "review"}
LEARNING_PROCESS_EVENTS = {"diagnosis", "lesson", "question", "answer", "teach-back", "assessment"}
MASTERY_EVIDENCE_EVENTS = {"answer", "teach-back", "assessment"}
STATUSES = {"draft", "pending_user_confirmation", "confirmed", "in_progress", "paused", "complete"}


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
        raw = raw.strip()
        if key == "retrieval" and raw != "delayed":
            raise SystemExit("metadata retrieval must be delayed")
        metadata[key] = raw
    return metadata


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")


def update_project(path: Path, event: dict[str, Any]) -> dict[str, Any]:
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
            "status": None,
            "current_phase": None,
            "current_module": None,
            "next_action": None,
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
    if event.get("status"):
        state["status"] = event["status"]
    elif event["event"] == "syllabus-confirmation":
        state["status"] = "confirmed"
    elif event["event"] == "lesson" and state.get("status") in {None, "pending_user_confirmation", "confirmed"}:
        state["status"] = "in_progress"
    if event.get("phase"):
        state["current_phase"] = event["phase"]
    elif event["event"] == "lesson" and not state.get("current_phase"):
        state["current_phase"] = "module-session"
    if event.get("module"):
        state["current_module"] = event["module"]
    if event.get("next_action"):
        state["next_action"] = event["next_action"]

    counts = state.setdefault("event_counts", {})
    counts[event["event"]] = counts.get(event["event"], 0) + 1
    state["last_summary"] = event["summary"]

    concept = event.get("concept")
    if concept and event["event"] in LEARNING_PROCESS_EVENTS:
        concepts = state.setdefault("concepts", {})
        record = concepts.setdefault(
            concept,
            {
                "seen": 0,
                "last_seen": None,
                "last_event": None,
                "mastery": None,
                "module": None,
            },
        )
        record["seen"] += 1
        record["last_seen"] = now
        record["last_event"] = event["event"]
        if event.get("mastery") is not None:
            record["mastery"] = event["mastery"]
        if event.get("module"):
            record["module"] = event["module"]

    write_json(path, state)
    return state


def update_progress(path: Path, event: dict[str, Any]) -> dict[str, Any]:
    progress = read_json(
        path,
        {
            "modules": {},
            "weak_concepts": [],
            "review_queue": [],
            "last_event": None,
        },
    )

    is_learning_process_event = event["event"] in LEARNING_PROCESS_EVENTS
    module = event.get("module")
    if module and is_learning_process_event:
        module_state = progress.setdefault("modules", {}).setdefault(module, {"events": 0, "concepts": {}})
        module_state["events"] += 1
        if event.get("concept"):
            concept_state = module_state.setdefault("concepts", {}).setdefault(
                event["concept"],
                {"last_event": None, "mastery": None},
            )
            concept_state["last_event"] = event["event"]
            if event.get("mastery") is not None:
                concept_state["mastery"] = event["mastery"]

    concept = event.get("concept")
    mastery = event.get("mastery")
    if concept and mastery is not None and event["event"] in MASTERY_EVIDENCE_EVENTS:
        weak = progress.setdefault("weak_concepts", [])
        queue = progress.setdefault("review_queue", [])
        if mastery < 4:
            if concept not in weak:
                weak.append(concept)
            if concept not in queue:
                queue.append(concept)
        else:
            progress["weak_concepts"] = [item for item in weak if item != concept]
            if event.get("metadata", {}).get("retrieval") == "delayed":
                progress["review_queue"] = [item for item in queue if item != concept]
            elif concept not in queue:
                queue.append(concept)

    event_summary = {
        "timestamp": event["timestamp"],
        "event": event["event"],
        "summary": event["summary"],
        "status": event.get("status"),
        "phase": event.get("phase"),
        "next_action": event.get("next_action"),
    }
    if event["event"] == "teaching-review":
        progress["last_teaching_review"] = event_summary
    progress["last_event"] = event_summary
    write_json(path, progress)
    return progress


def update_sources(path: Path, event: dict[str, Any]) -> dict[str, Any]:
    sources = read_json(path, {"sources": []})
    if event.get("source_id") or event.get("source_title") or event.get("source_url") or event.get("local_path"):
        sources.setdefault("sources", []).append(
            {
                "timestamp": event["timestamp"],
                "id": event.get("source_id"),
                "title": event.get("source_title"),
                "url": event.get("source_url"),
                "local_path": event.get("local_path"),
                "tier": event.get("tier"),
                "quality": event.get("quality"),
                "freshness": event.get("freshness"),
                "used_for": event.get("used_for", []),
                "gaps": event.get("gaps"),
                "summary": event["summary"],
                "metadata": event.get("metadata", {}),
            }
        )
    write_json(path, sources)
    return sources


def update_syllabus_state(path: Path, event: dict[str, Any]) -> dict[str, Any] | None:
    if not path.exists():
        return None

    syllabus = read_json(path, {})
    status = event.get("status")
    if event["event"] == "syllabus-confirmation" and not status:
        status = "confirmed"
    elif event["event"] == "lesson" and not status:
        current_status = syllabus.get("status")
        if current_status in {None, "pending_user_confirmation", "confirmed"}:
            status = "in_progress"

    if not status and not event.get("phase") and not event.get("next_action") and not event.get("module"):
        return syllabus

    if status:
        syllabus["status"] = status
        if status == "confirmed":
            syllabus["confirmed_at"] = event["timestamp"]
            if syllabus.get("requires_confirmation_before_teaching") is True:
                syllabus["requires_confirmation_before_teaching"] = False
        if status == "in_progress":
            syllabus.setdefault("teaching_started_at", event["timestamp"])
            if syllabus.get("requires_confirmation_before_teaching") is True:
                syllabus["requires_confirmation_before_teaching"] = False
    if event.get("phase"):
        syllabus["current_phase"] = event["phase"]
    if event.get("next_action"):
        syllabus["next_action"] = event["next_action"]
    if event.get("module"):
        syllabus["current_module"] = event["module"]
    syllabus["updated_at"] = event["timestamp"]
    write_json(path, syllabus)
    return syllabus


def update_notes(path: Path, event: dict[str, Any]) -> None:
    if not path.exists():
        path.write_text(f"# {event['topic']} - Quick Learn Notes\n\n", encoding="utf-8")

    lines = [
        f"## {event['timestamp']} - {event['event']}",
        "",
        f"- Summary: {event['summary']}",
    ]
    for key, label in [
        ("status", "Status"),
        ("phase", "Phase"),
        ("module", "Module"),
        ("concept", "Concept"),
        ("mastery", "Mastery"),
        ("next_action", "Next action"),
        ("source_id", "Source ID"),
        ("source_title", "Source"),
        ("source_url", "Source URL"),
        ("local_path", "Local path"),
        ("tier", "Tier"),
        ("quality", "Quality"),
        ("freshness", "Freshness"),
        ("gaps", "Gaps"),
        ("review_status", "Review status"),
    ]:
        if event.get(key) is not None:
            value = event[key]
            if key == "mastery":
                value = f"{value}/5"
            lines.append(f"- {label}: {value}")
    if event.get("used_for"):
        lines.append(f"- Used for: {', '.join(event['used_for'])}")
    lines.append("")

    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(lines))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Log a quick-learn learning event.")
    parser.add_argument("--topic", required=True, help="Learning topic name.")
    parser.add_argument("--event", required=True, choices=sorted(EVENTS), help="Event type.")
    parser.add_argument("--summary", required=True, help="Short event summary.")
    parser.add_argument("--level", help="Current learner level.")
    parser.add_argument("--target", help="Target learning outcome.")
    parser.add_argument("--status", choices=sorted(STATUSES), help="Learning project or syllabus status.")
    parser.add_argument("--phase", help="Current learning lifecycle phase.")
    parser.add_argument("--next-action", help="Concrete next action for resuming the learning project.")
    parser.add_argument("--module", help="Current module or section.")
    parser.add_argument("--concept", help="Concept involved in this event.")
    parser.add_argument("--mastery", type=int, choices=range(1, 6), help="Mastery or teach-back score from 1 to 5.")
    parser.add_argument("--source-id", help="Stable source ID such as S1 or M3-S2.")
    parser.add_argument("--source-title", help="Source title.")
    parser.add_argument("--source-url", help="Source URL or local path.")
    parser.add_argument("--local-path", help="Downloaded local path for a source.")
    parser.add_argument("--tier", help="Source tier: Primary, Secondary, Tertiary, or Local synthesis.")
    parser.add_argument("--quality", choices=["A", "B", "C", "D"], help="Source quality grade.")
    parser.add_argument("--freshness", choices=["stable", "evolving", "volatile"], help="Source freshness category.")
    parser.add_argument("--used-for", action="append", default=[], help="How this source is used. Repeatable.")
    parser.add_argument("--gaps", help="Known source gaps or limits.")
    parser.add_argument("--review-status", choices=["pass", "warn", "fail"], help="Stage review verdict.")
    parser.add_argument("--log-root", default=".quick-learn/projects", help="Directory for quick-learn project logs.")
    parser.add_argument("--metadata", action="append", default=[], help="Extra key=value metadata. Repeatable.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    topic_slug = slugify(args.topic)
    topic_dir = Path(args.log_root) / topic_slug
    topic_dir.mkdir(parents=True, exist_ok=True)
    mastery = args.mastery if args.event in MASTERY_EVIDENCE_EVENTS else None

    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "topic": args.topic,
        "topic_slug": topic_slug,
        "event": args.event,
        "summary": args.summary,
        "level": args.level,
        "target": args.target,
        "status": args.status,
        "phase": args.phase,
        "next_action": args.next_action,
        "module": args.module,
        "concept": args.concept,
        "mastery": mastery,
        "source_id": args.source_id,
        "source_title": args.source_title,
        "source_url": args.source_url,
        "local_path": args.local_path,
        "tier": args.tier,
        "quality": args.quality,
        "freshness": args.freshness,
        "used_for": args.used_for,
        "gaps": args.gaps,
        "review_status": args.review_status,
        "metadata": parse_metadata(args.metadata),
    }

    events_path = topic_dir / "events.jsonl"
    project_path = topic_dir / "project.json"
    progress_path = topic_dir / "progress.json"
    sources_path = topic_dir / "sources.json"
    reviews_path = topic_dir / "reviews.jsonl"
    notes_path = topic_dir / "notes.md"
    syllabus_path = topic_dir / "syllabus.json"

    append_jsonl(events_path, event)
    project = update_project(project_path, event)
    update_progress(progress_path, event)
    update_sources(sources_path, event)
    update_syllabus_state(syllabus_path, event)
    if event["event"] in REVIEW_EVENTS or event.get("review_status"):
        append_jsonl(reviews_path, event)
    elif not reviews_path.exists():
        reviews_path.write_text("", encoding="utf-8")
    update_notes(notes_path, event)

    print(
        json.dumps(
            {
                "status": "ok",
                "topic_slug": topic_slug,
                "event": args.event,
                "events_path": str(events_path),
                "project_path": str(project_path),
                "progress_path": str(progress_path),
                "sources_path": str(sources_path),
                "reviews_path": str(reviews_path),
                "notes_path": str(notes_path),
                "event_count": sum(project.get("event_counts", {}).values()),
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
