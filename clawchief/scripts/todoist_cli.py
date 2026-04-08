#!/usr/bin/env python3
"""Local Todoist helper for the clawchief workspace."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


BASE_URL = "https://api.todoist.com/api/v1"
DEFAULT_PROJECT = "Clawchief"
CLAWCHIEF_ROOT = Path(__file__).resolve().parent.parent
OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw")))
PRIORITY_MAP_PATH = CLAWCHIEF_ROOT / "priority-map.md"
GENERAL_SECTION = "General / uncategorized"
LEGACY_WORKFLOW_SECTIONS = ("Today", "Next", "Waiting", "Scheduled", "Someday")
TRANSIENT_HTTP_STATUS_CODES = {408, 429, 500, 502, 503, 504}
TARGET_LABELS = {
    "owner": ["ryan", "r2"],
    "domain": [
        "bd",
        "ea",
        "seo",
        "board",
        "legal",
        "family",
        "121g",
        "eyc",
        "ooh",
        "freshstart",
        "metaads",
        "googleads",
        "clawchief",
    ],
    "state": ["blocked", "travel"],
}

DOMAIN_LABEL_MAP = {
    "aeo / seo": "seo",
    "seo": "seo",
    "business development partnerships": "bd",
    "business development": "bd",
    "executive assistant: inbox, calendar, travel, schedule integrity": "ea",
    "executive assistant": "ea",
    "out-of-home advertising": "ooh",
    "121g": "121g",
    "essex yacht club communications chair": "eyc",
    "birthdays": "family",
    "brinkley": "family",
    "family": "family",
    "health": "family",
    "house tasks": "family",
    "personal": "family",
}

PROGRAM_SECTION_ALIAS_MAP = {
    "first 10 paying customers": "First 10 paying customers",
    "instagram content": "Instagram content",
    "instagram video interviews with linda": "Instagram content",
    "instagram video interviews with divorce experts": "Instagram content",
    "aeo / seo": "AEO / SEO",
    "seo": "AEO / SEO",
    "meta ads": "Meta Ads",
    "metaads": "Meta Ads",
    "google ads": "Google Ads",
    "googleads": "Google Ads",
    "fresh start registry partnership with olivia": "Fresh Start Registry partnership with Olivia",
    "freshstart": "Fresh Start Registry partnership with Olivia",
    "business development partnerships": "Business development partnerships",
    "business development": "Business development partnerships",
    "bd": "Business development partnerships",
    "executive assistant: inbox, calendar, travel, schedule integrity": "Executive assistant: inbox, calendar, travel, schedule integrity",
    "executive assistant": "Executive assistant: inbox, calendar, travel, schedule integrity",
    "ea": "Executive assistant: inbox, calendar, travel, schedule integrity",
    "out-of-home advertising": "Out-of-home advertising",
    "ooh": "Out-of-home advertising",
    "121g venture fund wind-down": "121G venture fund wind-down",
    "121g": "121G venture fund wind-down",
    "board / investor communication": "Board / investor communication",
    "board": "Board / investor communication",
    "family / personal logistics": "Family / personal logistics",
    "family": "Family / personal logistics",
    "birthdays": "Family / personal logistics",
    "personal": "Family / personal logistics",
    "health / medical": "Health / medical",
    "health": "Health / medical",
    "medical": "Health / medical",
    "home / household": "Home / household",
    "house tasks": "Home / household",
    "household": "Home / household",
    "brinkley": "Family / personal logistics",
    "essex yacht club communications chair": "Essex Yacht Club Communications Chair",
    "eyc": "Essex Yacht Club Communications Chair",
    "clawchief improvement": "clawchief improvement",
    "clawchief": "clawchief improvement",
}

PROGRAM_CONTENT_HINTS = [
    ("freshstart", "Fresh Start Registry partnership with Olivia"),
    ("olivia", "Fresh Start Registry partnership with Olivia"),
    ("newsworthy", "Essex Yacht Club Communications Chair"),
    ("spyglass", "Essex Yacht Club Communications Chair"),
    ("essex yacht club", "Essex Yacht Club Communications Chair"),
    ("121g", "121G venture fund wind-down"),
    ("aeo", "AEO / SEO"),
    ("seo", "AEO / SEO"),
    ("meta ads", "Meta Ads"),
    ("facebook ads", "Meta Ads"),
    ("google ads", "Google Ads"),
    ("fresh start", "Fresh Start Registry partnership with Olivia"),
    ("hartford", "Out-of-home advertising"),
    ("lamar", "Out-of-home advertising"),
    ("billups", "Out-of-home advertising"),
    ("investor", "Board / investor communication"),
    ("board", "Board / investor communication"),
    ("phil", "Board / investor communication"),
    ("2fa", "Executive assistant: inbox, calendar, travel, schedule integrity"),
    ("google account", "Executive assistant: inbox, calendar, travel, schedule integrity"),
    ("cac", "First 10 paying customers"),
    ("conversion", "First 10 paying customers"),
    ("customer", "First 10 paying customers"),
    ("pilot", "First 10 paying customers"),
    ("publish/schedule", "Instagram content"),
    ("social", "Instagram content"),
    ("video", "Instagram content"),
    ("birthday", "Family / personal logistics"),
    ("anniversary", "Family / personal logistics"),
    ("dad", "Family / personal logistics"),
    ("mom", "Family / personal logistics"),
    ("gill", "Family / personal logistics"),
    ("jackson", "Family / personal logistics"),
    ("devon", "Family / personal logistics"),
    ("brinkley", "Family / personal logistics"),
    ("doctor", "Health / medical"),
    ("physical", "Health / medical"),
    ("blood test", "Health / medical"),
    ("prostate", "Health / medical"),
    ("cancer", "Health / medical"),
    ("heart valve", "Health / medical"),
    ("colonoscopy", "Health / medical"),
    ("tesla", "Home / household"),
    ("furnace", "Home / household"),
    ("chimney", "Home / household"),
    ("septic", "Home / household"),
    ("hose", "Home / household"),
    ("drains", "Home / household"),
    ("fire extinguisher", "Home / household"),
    ("boat", "Home / household"),
    ("divorce bench", "clawchief improvement"),
    ("linear", "clawchief improvement"),
]

TIMEZONE_MAP = {
    "ET": "America/New_York",
    "EST": "America/New_York",
    "EDT": "America/New_York",
    "CT": "America/Chicago",
    "CST": "America/Chicago",
    "CDT": "America/Chicago",
    "MT": "America/Denver",
    "MST": "America/Denver",
    "MDT": "America/Denver",
    "PT": "America/Los_Angeles",
    "PST": "America/Los_Angeles",
    "PDT": "America/Los_Angeles",
}

OWNER_ALIASES = ("ryan", "r2")
OWNER_EMAIL_HINTS = {
    "r2": {"r2@untangle.us"},
}


class TodoistError(RuntimeError):
    """Raised for Todoist API or CLI usage errors."""


@dataclass
class LegacyTask:
    text: str
    checked: bool
    top_section: str | None
    owner: str | None
    category: str | None
    source_line: int


def print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def stable_import_key(parts: list[str]) -> str:
    joined = " | ".join(parts)
    digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()[:12]
    return f"import-{digest}"


def retry_delay_seconds(attempt: int, retry_after: Any = None) -> int:
    if retry_after not in (None, ""):
        try:
            return max(int(float(retry_after)), 1)
        except (TypeError, ValueError):
            pass
    return min(2**attempt, 10)


def load_priority_program_sections() -> list[str]:
    if not PRIORITY_MAP_PATH.exists():
        raise TodoistError(f"Priority map not found: {PRIORITY_MAP_PATH}")

    programs: list[str] = []
    in_programs = False
    for raw_line in PRIORITY_MAP_PATH.read_text().splitlines():
        line = raw_line.rstrip()
        if line.startswith("## "):
            heading = line[3:].strip()
            if heading == "Programs":
                in_programs = True
                continue
            if in_programs:
                break
        if in_programs and line.startswith("### "):
            name = line[4:].strip()
            if name and name not in programs:
                programs.append(name)

    if not programs:
        raise TodoistError(f"No program sections found in {PRIORITY_MAP_PATH}")
    return programs


def target_sections() -> list[str]:
    sections = load_priority_program_sections()
    if GENERAL_SECTION not in sections:
        sections.append(GENERAL_SECTION)
    return sections


def target_schema() -> dict[str, Any]:
    return {
        "project": DEFAULT_PROJECT,
        "sections": target_sections(),
        "labels": TARGET_LABELS,
    }


def priority_program_lookup() -> dict[str, str]:
    return {name.strip().lower(): name for name in load_priority_program_sections()}


def canonical_program_name(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().lower()
    lookup = priority_program_lookup()
    if normalized in lookup:
        return lookup[normalized]
    alias = PROGRAM_SECTION_ALIAS_MAP.get(normalized)
    if alias:
        return alias
    return None


def load_token() -> str | None:
    env_token = os.environ.get("TODOIST_API_TOKEN") or os.environ.get("TODOIST_TOKEN")
    if env_token:
        return env_token

    env_path = OPENCLAW_HOME / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text().splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key not in {"TODOIST_API_TOKEN", "TODOIST_TOKEN"}:
                continue
            token = value.strip().strip("'").strip('"')
            if token:
                return token
    return None


def split_description_and_metadata(description: str | None) -> tuple[str, dict[str, str]]:
    if not description:
        return "", {}
    raw = description.strip()
    human = ""
    if raw.startswith("---\n"):
        meta_block = raw[4:]
    elif "\n---\n" in raw:
        human, meta_block = raw.split("\n---\n", 1)
    else:
        return raw, {}
    metadata: dict[str, str] = {}
    for line in meta_block.splitlines():
        stripped = line.strip()
        if not stripped or ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        metadata[key.strip()] = value.strip()
    return human.strip(), metadata


def build_description(human: str | None, metadata: dict[str, str] | None) -> str:
    human_text = (human or "").strip()
    metadata = {k: v for k, v in (metadata or {}).items() if v not in (None, "")}
    if not metadata:
        return human_text
    meta_lines = [f"{key}: {metadata[key]}" for key in sorted(metadata)]
    if human_text:
        return f"{human_text}\n\n---\n" + "\n".join(meta_lines)
    return "---\n" + "\n".join(meta_lines)


def parse_kv_pairs(pairs: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            raise TodoistError(f"Metadata must use key=value form: {pair}")
        key, value = pair.split("=", 1)
        key = key.strip()
        if not key:
            raise TodoistError(f"Metadata key is empty: {pair}")
        result[key] = value.strip()
    return result


def parse_labels(values: list[str]) -> list[str]:
    labels: list[str] = []
    for value in values:
        for part in value.split(","):
            label = part.strip()
            if label and label not in labels:
                labels.append(label)
    return labels


def normalize_owner(owner: str | None, text: str) -> str | None:
    if owner:
        normalized = owner.strip().lower()
        if normalized in OWNER_ALIASES:
            return normalized
    if text.startswith("R2: "):
        return "r2"
    return None


def infer_owner_from_labels(labels: list[str] | None) -> str | None:
    for label in labels or []:
        normalized = label.strip().lower()
        if normalized in OWNER_ALIASES:
            return normalized
    return None


def strip_owner_labels(labels: list[str]) -> list[str]:
    return [label for label in labels if label.strip().lower() not in OWNER_ALIASES]


def normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lower()


def normalize_task_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("R2: "):
        cleaned = cleaned[4:].strip()
    return cleaned


def domain_label_for(category: str | None) -> str | None:
    if not category:
        return None
    return DOMAIN_LABEL_MAP.get(category.strip().lower())


def legacy_import_priority(section_name: str, due: dict[str, Any] | None) -> int:
    if section_name == "Today":
        return 2
    if due and due.get("date"):
        due_date = due.get("date", "")[:10]
        if due_date and due_date <= datetime.now().date().isoformat():
            return 2
    if section_name in {"Next up after today", "Backlog with due date"}:
        return 3
    return 4


def legacy_category_from_description(description: str | None) -> str | None:
    human, _ = split_description_and_metadata(description)
    match = re.search(r"Legacy category: (.+?)\.", human)
    if match:
        return match.group(1).strip()
    return None


def infer_program_section(
    *,
    content: str,
    labels: list[str] | None = None,
    category: str | None = None,
    explicit_program: str | None = None,
) -> str | None:
    for candidate in [explicit_program, category]:
        program = canonical_program_name(candidate)
        if program:
            return program

    for label in labels or []:
        program = canonical_program_name(label)
        if program:
            return program

    lowered = content.lower()
    for needle, program_name in PROGRAM_CONTENT_HINTS:
        if needle in lowered:
            return program_name

    return None


def program_section_for_legacy_task(task: LegacyTask, content: str, labels: list[str] | None = None) -> str:
    return infer_program_section(content=content, labels=labels, category=task.category) or GENERAL_SECTION


def program_section_for_task_record(task: dict[str, Any], section_name_by_id: dict[str, str]) -> str:
    _, metadata = split_description_and_metadata(task.get("description"))
    current_section = section_name_by_id.get(task.get("section_id"))
    program = infer_program_section(
        content=task.get("content") or "",
        labels=list(task.get("labels") or []),
        category=legacy_category_from_description(task.get("description")),
        explicit_program=metadata.get("program") or current_section,
    )
    return program or GENERAL_SECTION


def redundant_program_labels(section_name: str) -> set[str]:
    return {
        label
        for label, mapped_section in PROGRAM_SECTION_ALIAS_MAP.items()
        if mapped_section == section_name and label in TARGET_LABELS["domain"]
    }


def contains_travel_language(text: str) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in ["travel", "traveling", "travelling", "away from home"])


def contains_waiting_language(text: str) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in ["waiting on", "awaiting", "if she has not", "if he has not", "if they have not"])


def parse_due_from_text(text: str) -> tuple[str, dict[str, str] | None, str | None]:
    working = text.strip()
    extra_context: str | None = None

    due_match = re.search(r"\s+— due (\d{4}-\d{2}-\d{2})(?: (\d{2}:\d{2}) ([A-Z]{2,5}))?(.*)$", working)
    if due_match:
        due_date = due_match.group(1)
        due_time = due_match.group(2)
        due_tz = due_match.group(3)
        trailing = (due_match.group(4) or "").strip()
        working = working[: due_match.start()].strip()
        if trailing:
            extra_context = trailing
        if due_time and due_tz:
            return working, {"date": f"{due_date}T{due_time}:00", "timezone": normalize_timezone(due_tz)}, extra_context
        return working, {"date": due_date}, extra_context

    meeting_match = re.match(r"^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) ([A-Z]{2,5}) (.+)$", working)
    if meeting_match:
        due_date, due_time, due_tz, remainder = meeting_match.groups()
        return remainder.strip(), {"date": f"{due_date}T{due_time}:00", "timezone": normalize_timezone(due_tz)}, None

    all_day_match = re.match(r"^(\d{4}-\d{2}-\d{2}) (.+)$", working)
    if all_day_match:
        due_date, remainder = all_day_match.groups()
        return remainder.strip(), {"date": due_date}, None

    return working, None, None


def normalize_timezone(value: str | None) -> str | None:
    if not value:
        return value
    return TIMEZONE_MAP.get(value, value)


def parse_legacy_tasks(markdown_text: str) -> list[LegacyTask]:
    tasks: list[LegacyTask] = []
    top_section: str | None = None
    owner: str | None = None
    category: str | None = None

    checkbox_re = re.compile(r"^(?P<indent>\s*)- \[(?P<mark>[ xX])\] (?P<text>.+)$")
    plain_re = re.compile(r"^(?P<indent>\s*)- (?P<text>.+)$")

    for lineno, raw_line in enumerate(markdown_text.splitlines(), start=1):
        line = raw_line.rstrip()
        if line.startswith("## "):
            top_section = line[3:].strip()
            owner = None
            category = None
            continue
        if line.startswith("### "):
            if top_section == "Recurring reminders":
                category = line[4:].strip()
                owner = None
            else:
                owner = line[4:].strip()
                category = None
            continue
        if line.startswith("#### "):
            category = line[5:].strip()
            continue

        checkbox_match = checkbox_re.match(line)
        if checkbox_match:
            tasks.append(
                LegacyTask(
                    text=checkbox_match.group("text").strip(),
                    checked=checkbox_match.group("mark").lower() == "x",
                    top_section=top_section,
                    owner=owner,
                    category=category,
                    source_line=lineno,
                )
            )
            continue

        plain_match = plain_re.match(line)
        if not plain_match:
            continue
        indent = plain_match.group("indent")
        text = plain_match.group("text").strip()
        if indent:
            continue
        if top_section in {"Backlog", "Weekly", "Monthly", "Quarterly"} or category == "Backlog with due date":
            tasks.append(
                LegacyTask(
                    text=text,
                    checked=False,
                    top_section=top_section,
                    owner=owner,
                    category=category,
                    source_line=lineno,
                )
            )

    return tasks


def build_import_plan(tasks: list[LegacyTask], include_backlog: bool) -> dict[str, Any]:
    imports: list[dict[str, Any]] = []
    recurring_suggestions: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for task in tasks:
        if task.checked:
            skipped.append({"reason": "completed", "line": task.source_line, "text": task.text})
            continue

        section_name = task.top_section or ""
        if section_name == "Rules" or section_name == "To research":
            skipped.append({"reason": "non-task section", "line": task.source_line, "text": task.text})
            continue

        if section_name == "Recurring reminders":
            recurring_suggestions.append(
                {
                    "line": task.source_line,
                    "text": task.text,
                    "owner": normalize_owner(task.owner, task.text) or "ryan",
                    "category": task.category,
                }
            )
            continue

        if section_name in {"Weekly", "Monthly", "Quarterly"}:
            recurring_suggestions.append(
                {
                    "line": task.source_line,
                    "text": task.text,
                    "owner": normalize_owner(task.owner, task.text) or "ryan",
                    "category": task.category or section_name,
                }
            )
            continue

        if section_name == "Backlog" and not include_backlog:
            skipped.append({"reason": "backlog excluded", "line": task.source_line, "text": task.text})
            continue

        if section_name not in {"Today", "Next up after today", "Backlog"} and task.category != "Backlog with due date":
            skipped.append({"reason": "not imported by default", "line": task.source_line, "text": task.text})
            continue

        content, due, extra_context = parse_due_from_text(normalize_task_text(task.text))
        owner_label = normalize_owner(task.owner, task.text) or "ryan"
        labels: list[str] = [owner_label]
        domain_label = domain_label_for(task.category)
        todoist_section = program_section_for_legacy_task(task, content, [domain_label] if domain_label else [])
        if domain_label and domain_label not in labels and todoist_section == GENERAL_SECTION:
            labels.append(domain_label)

        if contains_travel_language(task.text) and "travel" not in labels:
            labels.append("travel")
            if "blocked" not in labels and "blocked while" in task.text.lower():
                labels.append("blocked")

        if "blocked while" in task.text.lower() and "blocked" not in labels:
            labels.append("blocked")

        metadata = {
            "source": "clawchief",
            "kind": "imported_markdown",
            "owner": owner_label,
            "legacy_section": section_name,
            "program": todoist_section,
        }
        metadata["key"] = stable_import_key(
            [
                section_name,
                owner_label,
                task.category or "",
                content,
            ]
        )

        human_context: list[str] = [f"Imported from legacy clawchief markdown at line {task.source_line}."]
        if task.category:
            human_context.append(f"Legacy category: {task.category}.")
        if extra_context:
            human_context.append(extra_context)

        imports.append(
            {
                "content": content,
                "description": " ".join(human_context).strip(),
                "labels": labels,
                "priority": legacy_import_priority(section_name if task.category != "Backlog with due date" else "Backlog with due date", due),
                "section": todoist_section,
                "due": due,
                "deadline": None,
                "metadata": metadata,
                "line": task.source_line,
            }
        )

    return {
        "imports": imports,
        "recurring_suggestions": recurring_suggestions,
        "skipped": skipped,
        "counts": {
            "imports": len(imports),
            "recurring_suggestions": len(recurring_suggestions),
            "skipped": len(skipped),
        },
    }


def human_month_day(date_value: datetime) -> str:
    return date_value.strftime("%B %d").replace(" 0", " ")


def human_time(time_value: str) -> str:
    return datetime.strptime(time_value, "%H:%M").strftime("%I:%M %p").lstrip("0")


def ordinal_day(day: int) -> str:
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def recurring_owner_for_task(task: LegacyTask, content: str) -> str:
    owner = normalize_owner(task.owner, task.text)
    if owner:
        return owner

    lowered = content.lower()
    if lowered == "check 121g mail":
        return "r2"
    if lowered == "clear email for ryan@121g.fund":
        return "r2"
    return "ryan"


def recurring_domain_label_for_task(task: LegacyTask, content: str) -> str | None:
    label = domain_label_for(task.category)
    if label:
        return label

    lowered = content.lower()
    if "121g" in lowered:
        return "121g"
    if "seo" in lowered or "aeo" in lowered:
        return "seo"
    if "phil" in lowered or "investors" in lowered:
        return "board"
    if "divorce bench" in lowered or "linear" in lowered:
        return "clawchief"
    return None


def recurring_due_string_from_task(task: LegacyTask) -> tuple[str, dict[str, str]]:
    working = normalize_task_text(task.text)
    recurring_match = re.match(
        r"^(?P<content>.+?) — due (?P<date>\d{4}-\d{2}-\d{2})(?: (?P<time>\d{2}:\d{2}) (?P<tz>[A-Z]{2,5}))? — recurs (?P<unit>weekly|monthly|yearly) every (?P<interval>\d+)(?: (?P<weekday>[A-Za-z]+))?$",
        working,
    )
    if recurring_match:
        content = recurring_match.group("content").strip()
        due_date = datetime.strptime(recurring_match.group("date"), "%Y-%m-%d")
        time_value = recurring_match.group("time")
        timezone_value = normalize_timezone(recurring_match.group("tz"))
        unit = recurring_match.group("unit")
        interval = int(recurring_match.group("interval"))
        weekday = recurring_match.group("weekday")

        if unit == "weekly":
            if weekday:
                due_string = f"every {weekday}"
            elif interval == 1:
                due_string = f"every {due_date.strftime('%A')}"
            else:
                every = "every week" if interval == 1 else f"every {interval} weeks"
                due_string = f"{every} starting {human_month_day(due_date)}"
        elif unit == "monthly":
            if interval == 1 and time_value:
                due_string = f"every month on the {ordinal_day(due_date.day)} at {human_time(time_value)}"
            else:
                every = "every month" if interval == 1 else f"every {interval} months"
                due_string = f"{every} starting {human_month_day(due_date)}"
        else:
            if interval == 1:
                due_string = f"every year on {human_month_day(due_date)}"
            else:
                due_string = f"every {interval} years starting {due_date.date().isoformat()}"

        if time_value and (unit == "weekly" or unit == "yearly"):
            due_string = f"{due_string} at {human_time(time_value)}"

        return content, {
            "string": due_string,
            "timezone": timezone_value,
        } if timezone_value else {"string": due_string}

    section_name = task.top_section or ""
    content = working
    if section_name == "Weekly":
        return content, {"string": "every week starting April 13"}
    if section_name == "Monthly":
        return content, {"string": "every month starting May 1"}
    if section_name == "Quarterly":
        return content, {"string": "every 3 months starting July 1"}

    raise TodoistError(f"Could not build recurring due string from task line {task.source_line}: {task.text}")


def build_recurring_import_plan(tasks: list[LegacyTask]) -> dict[str, Any]:
    imports: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for task in tasks:
        legacy_section_name = task.top_section or ""
        if legacy_section_name not in {"Recurring reminders", "Weekly", "Monthly", "Quarterly"}:
            continue
        if task.checked:
            skipped.append({"reason": "completed", "line": task.source_line, "text": task.text})
            continue

        content, due = recurring_due_string_from_task(task)
        owner = recurring_owner_for_task(task, content)
        labels: list[str] = []
        domain_label = recurring_domain_label_for_task(task, content)
        program_section = program_section_for_legacy_task(task, content, [domain_label] if domain_label else [])
        if domain_label and program_section == GENERAL_SECTION:
            labels.append(domain_label)

        metadata = {
            "source": "clawchief",
            "kind": "recurring_import",
            "owner": owner,
            "legacy_section": legacy_section_name,
            "program": program_section,
        }
        metadata["key"] = stable_import_key(
            [
                "recurring",
                legacy_section_name,
                task.category or "",
                owner,
                content,
                due["string"],
            ]
        )

        description_parts = [f"Imported recurring task from legacy clawchief markdown at line {task.source_line}."]
        if task.category:
            description_parts.append(f"Legacy category: {task.category}.")

        imports.append(
            {
                "content": content,
                "owner": owner,
                "section": program_section,
                "labels": labels,
                "priority": 3,
                "description": " ".join(description_parts),
                "metadata": metadata,
                "due": due,
                "line": task.source_line,
            }
        )

    return {
        "imports": imports,
        "skipped": skipped,
        "counts": {
            "imports": len(imports),
            "skipped": len(skipped),
        },
    }


def iso_utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def completion_window(days: int) -> tuple[str, str]:
    end = datetime.now(timezone.utc).replace(microsecond=0)
    start = end - timedelta(days=days)
    return (
        start.isoformat().replace("+00:00", "Z"),
        end.isoformat().replace("+00:00", "Z"),
    )


def due_date_for_compare(task: dict[str, Any]) -> str | None:
    due = task.get("due") or {}
    date_value = due.get("date")
    if not isinstance(date_value, str) or not date_value:
        return None
    return date_value[:10]


def task_matches_filters(task: dict[str, Any], section_name_by_id: dict[str, str], args: argparse.Namespace) -> bool:
    if args.section:
        wanted = {value.strip() for value in args.section}
        section_name = section_name_by_id.get(task.get("section_id"), "")
        if section_name not in wanted:
            return False
    if args.label:
        labels = set(task.get("labels") or [])
        if not set(parse_labels(args.label)).issubset(labels):
            return False
    if args.owner:
        labels = set(task.get("labels") or [])
        current_owner = task.get("owner_alias") or owner_for_task(task)
        if current_owner:
            if current_owner != args.owner:
                return False
        elif args.owner not in labels:
            return False
    if args.overdue or args.due_today:
        due_date = due_date_for_compare(task)
        if not due_date:
            return False
        today = datetime.now().date().isoformat()
        if args.overdue and not (due_date < today):
            return False
        if args.due_today and due_date != today:
            return False
    return True


class TodoistClient:
    def __init__(self, token: str, base_url: str = BASE_URL) -> None:
        self.token = token
        self.base_url = base_url.rstrip("/")

    def request(self, method: str, path: str, query: dict[str, Any] | None = None, body: dict[str, Any] | None = None) -> Any:
        for attempt in range(6):
            url = f"{self.base_url}{path}"
            if query:
                encoded_query = urllib.parse.urlencode(
                    [(key, value) for key, value in query.items() if value is not None],
                    doseq=True,
                )
                if encoded_query:
                    url = f"{url}?{encoded_query}"

            headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {self.token}",
            }
            data = None
            if body is not None:
                headers["Content-Type"] = "application/json"
                data = json.dumps(body).encode("utf-8")

            request = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
            try:
                with urllib.request.urlopen(request) as response:
                    payload = response.read().decode("utf-8")
                    if response.status == 204 or not payload:
                        return None
                    return json.loads(payload)
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                message = raw
                retry_after = None
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        message = parsed.get("error") or parsed.get("message") or raw
                        retry_after = ((parsed.get("error_extra") or {}).get("retry_after"))
                except json.JSONDecodeError:
                    pass
                if exc.code in TRANSIENT_HTTP_STATUS_CODES and attempt < 5:
                    delay = retry_delay_seconds(attempt, retry_after or exc.headers.get("Retry-After"))
                    time.sleep(delay)
                    continue
                raise TodoistError(f"{method.upper()} {path} failed with {exc.code}: {message}") from exc
            except urllib.error.URLError as exc:
                if attempt < 5:
                    time.sleep(retry_delay_seconds(attempt))
                    continue
                raise TodoistError(f"{method.upper()} {path} failed: {exc.reason}") from exc

    def sync(
        self,
        *,
        sync_token: str = "*",
        resource_types: list[str] | None = None,
        commands: list[dict[str, Any]] | None = None,
        use_lro: bool | None = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}/sync"
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        payload: dict[str, str] = {"sync_token": sync_token}
        if resource_types is not None:
            payload["resource_types"] = json.dumps(resource_types)
        if commands is not None:
            payload["commands"] = json.dumps(commands)
        if use_lro is not None:
            payload["use_lro"] = "true" if use_lro else "false"

        data = urllib.parse.urlencode(payload).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        for attempt in range(6):
            try:
                with urllib.request.urlopen(request) as response:
                    raw = response.read().decode("utf-8")
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as exc:
                raw = exc.read().decode("utf-8", errors="replace")
                message = raw
                retry_after = None
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, dict):
                        message = parsed.get("error") or parsed.get("message") or raw
                        retry_after = ((parsed.get("error_extra") or {}).get("retry_after"))
                except json.JSONDecodeError:
                    pass
                if exc.code in TRANSIENT_HTTP_STATUS_CODES and attempt < 5:
                    delay = retry_delay_seconds(attempt, retry_after or exc.headers.get("Retry-After"))
                    time.sleep(delay)
                    continue
                raise TodoistError(f"POST /sync failed with {exc.code}: {message}") from exc
            except urllib.error.URLError as exc:
                if attempt < 5:
                    time.sleep(retry_delay_seconds(attempt))
                    continue
                raise TodoistError(f"POST /sync failed: {exc.reason}") from exc
        raise TodoistError("POST /sync failed after retries.")

    def sync_command(
        self,
        command_type: str,
        args: dict[str, Any],
        *,
        include_temp_id: bool = False,
        use_lro: bool | None = None,
    ) -> dict[str, Any]:
        command: dict[str, Any] = {
            "type": command_type,
            "uuid": str(uuid.uuid4()),
            "args": args,
        }
        if include_temp_id:
            command["temp_id"] = str(uuid.uuid4())

        response = self.sync(commands=[command], use_lro=use_lro)
        status = (response.get("sync_status") or {}).get(command["uuid"])
        if status is None:
            raise TodoistError(f"Todoist did not return sync status for {command_type}")
        if isinstance(status, str):
            if status != "ok":
                raise TodoistError(f"{command_type} failed: {status}")
            return response
        if isinstance(status, dict):
            operation = status.get("operation")
            if operation:
                op_status = operation.get("status")
                if op_status in {"SUCCESS", "ONGOING"}:
                    return response
                raise TodoistError(f"{command_type} failed: {operation.get('error') or operation}")
            if status.get("error"):
                raise TodoistError(f"{command_type} failed: {status['error']}")
            return response
        raise TodoistError(f"Unexpected sync status for {command_type}: {status}")

    def paginate(self, path: str, query: dict[str, Any] | None = None, results_key: str = "results") -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        cursor = None
        while True:
            payload = dict(query or {})
            if cursor:
                payload["cursor"] = cursor
            response = self.request("GET", path, query=payload)
            if isinstance(response, list):
                items.extend(response)
                return items
            page = response.get(results_key)
            if page is None and results_key != "items":
                page = response.get("items")
            if page is None:
                raise TodoistError(f"Unexpected paginated response shape for {path}")
            items.extend(page)
            cursor = response.get("next_cursor")
            if not cursor:
                return items

    def projects(self) -> list[dict[str, Any]]:
        return self.paginate("/projects")

    def workspaces(self) -> list[dict[str, Any]]:
        response = self.request("GET", "/workspaces")
        if isinstance(response, list):
            return response
        return response.get("results") or []

    def sections(self, project_id: str | None = None) -> list[dict[str, Any]]:
        return self.paginate("/sections", query={"project_id": project_id} if project_id else None)

    def labels(self) -> list[dict[str, Any]]:
        return self.paginate("/labels")

    def tasks(self, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return self.paginate("/tasks", query=query)

    def completed_tasks(self, since: str, until: str, project_id: str | None = None) -> list[dict[str, Any]]:
        query = {"since": since, "until": until, "project_id": project_id}
        return self.paginate("/tasks/completed/by_completion_date", query=query, results_key="items")

    def current_user(self) -> dict[str, Any]:
        response = self.sync(resource_types=["user"])
        user = response.get("user")
        if not isinstance(user, dict):
            raise TodoistError("Todoist did not return the current user profile.")
        return user

    def project_collaborators(self, project_id: str) -> list[dict[str, Any]]:
        return self.paginate(f"/projects/{project_id}/collaborators")

    def create_project(self, name: str) -> dict[str, Any]:
        return self.request("POST", "/projects", body={"name": name})

    def create_section(self, project_id: str, name: str) -> dict[str, Any]:
        return self.request("POST", "/sections", body={"project_id": project_id, "name": name})

    def delete_section(self, section_id: str) -> Any:
        return self.request("DELETE", f"/sections/{section_id}")

    def create_label(self, name: str) -> dict[str, Any]:
        return self.request("POST", "/labels", body={"name": name})

    def create_task(self, body: dict[str, Any]) -> dict[str, Any]:
        return self.request("POST", "/tasks", body=body)

    def get_task(self, task_id: str) -> dict[str, Any]:
        return self.request("GET", f"/tasks/{task_id}")

    def update_task(self, task_id: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.request("POST", f"/tasks/{task_id}", body=body)

    def move_task(self, task_id: str, body: dict[str, Any]) -> Any:
        return self.request("POST", f"/tasks/{task_id}/move", body=body)

    def close_task(self, task_id: str) -> Any:
        return self.request("POST", f"/tasks/{task_id}/close")

    def comment_task(self, task_id: str, content: str) -> dict[str, Any]:
        return self.request("POST", "/comments", body={"task_id": task_id, "content": content})

    def move_project_to_workspace(
        self,
        *,
        project_id: str,
        workspace_id: str,
        is_invite_only: bool = False,
        folder_id: str | None = None,
    ) -> dict[str, Any]:
        args: dict[str, Any] = {
            "project_id": project_id,
            "workspace_id": workspace_id,
            "is_invite_only": is_invite_only,
            "folder_id": folder_id,
        }
        return self.sync_command("project_move_to_workspace", args)

    def share_project(self, *, project_id: str, email: str, role: str | None = None) -> dict[str, Any]:
        args: dict[str, Any] = {"project_id": project_id, "email": email}
        if role:
            args["role"] = role
        return self.sync_command("share_project", args, include_temp_id=True)

    def item_add(self, args: dict[str, Any]) -> str:
        command = {
            "type": "item_add",
            "temp_id": str(uuid.uuid4()),
            "uuid": str(uuid.uuid4()),
            "args": args,
        }
        response = self.sync(commands=[command])
        status = (response.get("sync_status") or {}).get(command["uuid"])
        if status != "ok":
            raise TodoistError(f"item_add failed: {status}")
        mapping = response.get("temp_id_mapping") or {}
        item_id = mapping.get(command["temp_id"])
        if not item_id:
            raise TodoistError("item_add did not return a created task id")
        return str(item_id)

    def item_update(self, item_id: str, args: dict[str, Any]) -> dict[str, Any]:
        payload = {"id": item_id}
        payload.update(args)
        return self.sync_command("item_update", payload)


def require_client() -> TodoistClient:
    token = load_token()
    if not token:
        raise TodoistError(
            f"Missing TODOIST_API_TOKEN. Add it to the environment or {OPENCLAW_HOME / '.env'} before using live Todoist commands."
        )
    return TodoistClient(token=token)


def find_project(projects: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for project in projects:
        if project.get("name") == name:
            return project
    return None


def find_workspace(workspaces: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    for workspace in workspaces:
        if workspace.get("name") == name:
            return workspace
    return None


def ensure_schema(client: TodoistClient, dry_run: bool) -> dict[str, Any]:
    schema = target_schema()
    projects = client.projects()
    project = find_project(projects, schema["project"])
    created: dict[str, list[str]] = {"projects": [], "sections": [], "labels": []}

    if not project:
        if dry_run:
            project = {"id": "<planned-project>", "name": schema["project"]}
            created["projects"].append(schema["project"])
        else:
            project = client.create_project(schema["project"])
            created["projects"].append(schema["project"])

    project_id = project["id"]

    existing_sections = {section["name"]: section for section in client.sections(project_id if project_id != "<planned-project>" else None)} if project_id != "<planned-project>" else {}
    section_map: dict[str, str] = {}
    for section_name in schema["sections"]:
        current = existing_sections.get(section_name)
        if current:
            section_map[section_name] = current["id"]
            continue
        if dry_run:
            section_map[section_name] = f"<planned-section:{section_name}>"
            created["sections"].append(section_name)
        else:
            created_section = client.create_section(project_id, section_name)
            section_map[section_name] = created_section["id"]
            created["sections"].append(section_name)

    existing_labels = {label["name"]: label for label in client.labels()} if project_id != "<planned-project>" else {}
    label_map: dict[str, str] = {}
    for names in schema["labels"].values():
        for label_name in names:
            current = existing_labels.get(label_name)
            if current:
                label_map[label_name] = current["id"]
                continue
            if dry_run:
                label_map[label_name] = f"<planned-label:{label_name}>"
                created["labels"].append(label_name)
            else:
                created_label = client.create_label(label_name)
                label_map[label_name] = created_label["id"]
                created["labels"].append(label_name)

    return {
        "project": project,
        "sections": section_map,
        "labels": label_map,
        "created": created,
    }


def resolve_project_name(client: TodoistClient, project_name: str) -> dict[str, Any]:
    project = find_project(client.projects(), project_name)
    if not project:
        raise TodoistError(f"Project not found: {project_name}")
    return project


def resolve_workspace_name(client: TodoistClient, workspace_name: str) -> dict[str, Any]:
    workspace = find_workspace(client.workspaces(), workspace_name)
    if not workspace:
        raise TodoistError(f"Workspace not found: {workspace_name}")
    return workspace


def resolve_section_id(client: TodoistClient, project_id: str, section_name: str | None) -> str | None:
    if not section_name:
        return None
    for section in client.sections(project_id):
        if section.get("name") == section_name:
            return section["id"]
    raise TodoistError(f"Section not found in project: {section_name}")


def metadata_key_matches(tasks: list[dict[str, Any]], metadata_key: str) -> list[dict[str, Any]]:
    matches = []
    for task in tasks:
        _, metadata = split_description_and_metadata(task.get("description"))
        if metadata.get("key") == metadata_key:
            matches.append(task)
    return matches


def candidate_match_score(
    task: dict[str, Any],
    *,
    content: str,
    labels: list[str],
    section_id: str | None,
    due: dict[str, Any] | None,
) -> int:
    score = 0
    candidate_labels = set(task.get("labels") or [])
    due_date = due.get("date")[:10] if due and due.get("date") else None
    if labels and set(labels).issubset(candidate_labels):
        score += 3
    if section_id and task.get("section_id") == section_id:
        score += 2
    candidate_due = due_date_for_compare(task)
    if due_date and candidate_due == due_date:
        score += 2
    if task.get("content") == content:
        score += 1
    return score


def task_recency_key(task: dict[str, Any]) -> str:
    for key in ("updated_at", "added_at", "created_at"):
        value = task.get(key)
        if isinstance(value, str):
            return value
    return ""


def choose_best_match(
    tasks: list[dict[str, Any]],
    *,
    content: str,
    labels: list[str],
    section_id: str | None,
    due: dict[str, Any] | None,
    metadata_key: str | None,
) -> dict[str, Any] | None:
    if metadata_key:
        matches = metadata_key_matches(tasks, metadata_key)
        if not matches:
            return None
        scored = [
            (
                candidate_match_score(
                    task,
                    content=content,
                    labels=labels,
                    section_id=section_id,
                    due=due,
                ),
                task_recency_key(task),
                str(task.get("id") or ""),
                task,
            )
            for task in matches
        ]
        scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        return scored[0][3]

    candidates = [task for task in tasks if task.get("content") == content]
    if not candidates:
        return None

    scored: list[tuple[int, dict[str, Any]]] = []
    for candidate in candidates:
        score = candidate_match_score(
            candidate,
            content=content,
            labels=labels,
            section_id=section_id,
            due=due,
        )
        scored.append((score, candidate))

    scored.sort(key=lambda item: item[0], reverse=True)
    if not scored or scored[0][0] == 0:
        return None
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None
    return scored[0][1]


def collaborator_uid(collaborator: dict[str, Any]) -> str | None:
    value = collaborator.get("id") or collaborator.get("user_id")
    if value is None:
        return None
    return str(value)


def collaborator_name(collaborator: dict[str, Any] | None) -> str | None:
    if not collaborator:
        return None
    return collaborator.get("name") or collaborator.get("full_name")


def owner_alias_for_user(collaborator: dict[str, Any], current_user: dict[str, Any]) -> str | None:
    current_user_id = str(current_user.get("id")) if current_user.get("id") is not None else None
    current_user_email = normalize_email(current_user.get("email"))
    user_id = collaborator_uid(collaborator)
    emails = {
        email
        for email in [
            normalize_email(collaborator.get("email")),
            normalize_email(collaborator.get("user_email")),
        ]
        if email
    }

    if current_user_id and user_id == current_user_id:
        return "ryan"
    if current_user_email and current_user_email in emails:
        return "ryan"
    if any(email in OWNER_EMAIL_HINTS["r2"] for email in emails):
        return "r2"

    name = (collaborator_name(collaborator) or "").strip().lower()
    if name == "r2" or name.startswith("r2 "):
        return "r2"
    if "ryan" in name:
        return "ryan"
    return None


def owner_context_for_project(client: TodoistClient, project: dict[str, Any]) -> dict[str, Any]:
    current_user = client.current_user()
    collaborators = client.project_collaborators(project["id"])
    alias_by_uid: dict[str, str] = {}
    collaborator_by_uid: dict[str, dict[str, Any]] = {}

    for collaborator in collaborators:
        uid = collaborator_uid(collaborator)
        if not uid:
            continue
        collaborator_by_uid[uid] = collaborator
        alias = owner_alias_for_user(collaborator, current_user)
        if alias:
            alias_by_uid[uid] = alias

    current_uid = str(current_user.get("id")) if current_user.get("id") is not None else None
    if current_uid and current_uid not in collaborator_by_uid:
        collaborator_by_uid[current_uid] = {
            "id": current_uid,
            "name": current_user.get("full_name"),
            "email": current_user.get("email"),
        }
    if current_uid:
        alias_by_uid[current_uid] = "ryan"

    return {
        "current_user": current_user,
        "collaborators": collaborators,
        "alias_by_uid": alias_by_uid,
        "collaborator_by_uid": collaborator_by_uid,
    }


def resolve_assignee_id(client: TodoistClient, project: dict[str, Any], owner: str | None) -> str | None:
    normalized_owner = normalize_owner(owner, "") if owner else None
    if not normalized_owner:
        return None

    context = owner_context_for_project(client, project)
    for uid, alias in context["alias_by_uid"].items():
        if alias == normalized_owner:
            return uid
    return None


def owner_for_task(task: dict[str, Any]) -> str | None:
    _, metadata = split_description_and_metadata(task.get("description"))
    owner = normalize_owner(metadata.get("owner"), task.get("content", ""))
    if owner:
        return owner
    return infer_owner_from_labels(task.get("labels") or [])


def build_sync_due(due: dict[str, Any]) -> dict[str, Any]:
    due_string = due.get("string")
    if not due_string:
        raise TodoistError("Recurring sync due payload requires a due string.")
    payload: dict[str, Any] = {"string": due_string, "lang": "en"}
    timezone_value = normalize_timezone(due.get("timezone"))
    if timezone_value:
        payload["timezone"] = timezone_value
    return payload


def apply_task_changes(
    client: TodoistClient,
    task_id: str,
    *,
    move_section_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if move_section_id is not None:
        client.move_task(task_id, {"section_id": move_section_id})
    if payload:
        return client.update_task(task_id, payload)
    if move_section_id is not None:
        return client.get_task(task_id)
    raise TodoistError("No supported task changes were provided.")


def close_duplicate_metadata_tasks(
    client: TodoistClient,
    *,
    matches: list[dict[str, Any]],
    keep_task_id: str | None,
) -> list[dict[str, str]]:
    closed: list[dict[str, str]] = []
    keep_id = str(keep_task_id) if keep_task_id is not None else None
    for task in matches:
        task_id = str(task.get("id") or "")
        if not task_id or task_id == keep_id:
            continue
        client.close_task(task_id)
        closed.append({"task_id": task_id, "content": task.get("content") or ""})
    return closed


def upsert_recurring_task(
    client: TodoistClient,
    *,
    project_name: str,
    content: str,
    owner: str,
    section_name: str,
    labels: list[str],
    priority: int | None,
    description: str | None,
    metadata: dict[str, str],
    due: dict[str, Any],
    dry_run: bool,
) -> dict[str, Any]:
    project = resolve_project_name(client, project_name)
    project_id = project["id"]
    section_id = resolve_section_id(client, project_id, section_name)

    existing_tasks = client.tasks({"project_id": project_id})
    metadata_key = metadata.get("key")
    metadata_matches = metadata_key_matches(existing_tasks, metadata_key) if metadata_key else []
    match = choose_best_match(
        existing_tasks,
        content=content,
        labels=labels,
        section_id=section_id,
        due=None,
        metadata_key=metadata_key,
    )

    effective_labels = list(labels)
    assignee_id = resolve_assignee_id(client, project, owner)
    if assignee_id:
        effective_labels = strip_owner_labels(effective_labels)
    elif owner not in effective_labels:
        effective_labels.append(owner)

    rest_payload: dict[str, Any] = {}
    if section_id is not None:
        rest_payload["section_id"] = section_id
    rest_payload["content"] = content
    if effective_labels:
        rest_payload["labels"] = effective_labels
    else:
        rest_payload["labels"] = []
    if priority is not None:
        rest_payload["priority"] = priority
    if assignee_id:
        rest_payload["assignee_id"] = assignee_id

    existing_human = ""
    existing_meta: dict[str, str] = {}
    if match:
        existing_human, existing_meta = split_description_and_metadata(match.get("description"))
    merged_meta = dict(existing_meta)
    merged_meta.update(metadata)
    rest_payload["description"] = build_description(description if description is not None else existing_human, merged_meta)

    due_payload = build_sync_due(due)

    if dry_run:
        result = {
            "action": "update" if match else "create",
            "task_id": match.get("id") if match else None,
            "due": due_payload,
            "payload": rest_payload,
        }
        if len(metadata_matches) > 1 and match:
            result["closed_duplicate_task_ids"] = [
                str(task["id"]) for task in metadata_matches if str(task.get("id")) != str(match.get("id"))
            ]
        return result

    if match:
        client.item_update(str(match["id"]), {"due": due_payload})
        move_section_id = section_id if section_id is not None and str(match.get("section_id") or "") != str(section_id) else None
        update_payload = dict(rest_payload)
        update_payload.pop("section_id", None)
        updated = apply_task_changes(client, str(match["id"]), move_section_id=move_section_id, payload=update_payload)
        result: dict[str, Any] = {"action": "update", "task": updated}
        closed = close_duplicate_metadata_tasks(
            client,
            matches=metadata_matches,
            keep_task_id=str(match["id"]),
        )
        if closed:
            result["closed_duplicates"] = closed
        return result

    item_id = client.item_add({"content": content, "project_id": project_id, "due": due_payload})
    update_payload = dict(rest_payload)
    move_section_id = update_payload.pop("section_id", None)
    updated = apply_task_changes(client, item_id, move_section_id=move_section_id, payload=update_payload)
    return {"action": "create", "task": updated}


def upsert_task(
    client: TodoistClient,
    *,
    project_name: str,
    content: str,
    owner: str | None,
    section_name: str | None,
    labels: list[str],
    priority: int | None,
    description: str | None,
    metadata: dict[str, str],
    due: dict[str, Any] | None,
    deadline: dict[str, Any] | None,
    dry_run: bool,
) -> dict[str, Any]:
    project = resolve_project_name(client, project_name)
    project_id = project["id"]
    section_id = resolve_section_id(client, project_id, section_name)

    existing_tasks = client.tasks({"project_id": project_id})
    metadata_key = metadata.get("key")
    metadata_matches = metadata_key_matches(existing_tasks, metadata_key) if metadata_key else []
    match = choose_best_match(
        existing_tasks,
        content=content,
        labels=labels,
        section_id=section_id,
        due=due,
        metadata_key=metadata_key,
    )

    effective_labels = list(labels)
    assignee_id = resolve_assignee_id(client, project, owner)
    if assignee_id:
        effective_labels = strip_owner_labels(effective_labels)
    elif owner and owner not in effective_labels:
        effective_labels.append(owner)

    create_payload: dict[str, Any] = {
        "project_id": project_id,
        "content": content,
    }
    if section_id is not None:
        create_payload["section_id"] = section_id
    if effective_labels:
        create_payload["labels"] = effective_labels
    if priority is not None:
        create_payload["priority"] = priority
    if assignee_id:
        create_payload["assignee_id"] = assignee_id
    translate_due_for_request(create_payload, due)
    if deadline is not None:
        create_payload["deadline"] = deadline
    if description is not None or metadata:
        existing_human = ""
        existing_meta: dict[str, str] = {}
        if match:
            existing_human, existing_meta = split_description_and_metadata(match.get("description"))
        merged_meta = dict(existing_meta)
        merged_meta.update(metadata)
        create_payload["description"] = build_description(description if description is not None else existing_human, merged_meta)

    update_payload = {key: value for key, value in create_payload.items() if key not in {"project_id", "section_id"}}
    move_section_id = section_id if match and section_id is not None and str(match.get("section_id") or "") != str(section_id) else None

    if dry_run:
        result = {
            "action": "update" if match else "create",
            "task_id": match.get("id") if match else None,
            "payload": create_payload,
        }
        if len(metadata_matches) > 1 and match:
            result["closed_duplicate_task_ids"] = [
                str(task["id"]) for task in metadata_matches if str(task.get("id")) != str(match.get("id"))
            ]
        return result

    if match:
        updated = apply_task_changes(client, match["id"], move_section_id=move_section_id, payload=update_payload)
        result: dict[str, Any] = {"action": "update", "task": updated}
        closed = close_duplicate_metadata_tasks(
            client,
            matches=metadata_matches,
            keep_task_id=str(match["id"]),
        )
        if closed:
            result["closed_duplicates"] = closed
        return result

    created = client.create_task(create_payload)
    return {"action": "create", "task": created}


def resolve_task_for_action(client: TodoistClient, args: argparse.Namespace) -> dict[str, Any]:
    if args.task_id:
        tasks = client.tasks({"ids": args.task_id})
        if len(tasks) != 1:
            raise TodoistError(f"Task not found: {args.task_id}")
        return tasks[0]

    project = resolve_project_name(client, args.project)
    tasks = client.tasks({"project_id": project["id"]})
    labels = parse_labels(args.label or [])
    section_id = resolve_section_id(client, project["id"], args.section) if getattr(args, "section", None) else None
    match = choose_best_match(
        tasks,
        content=args.content,
        labels=labels,
        section_id=section_id,
        due=None,
        metadata_key=args.metadata_key,
    )
    if not match:
        raise TodoistError("Could not uniquely resolve a task for this action.")
    return match


def cmd_schema(_: argparse.Namespace) -> int:
    print_json(target_schema())
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    schema = target_schema()
    result = {
        "token_present": bool(load_token()),
        "project": schema["project"],
        "checked_at": iso_utc_now(),
    }
    if args.ping and result["token_present"]:
        client = require_client()
        project = find_project(client.projects(), schema["project"])
        result["project_exists"] = bool(project)
    print_json(result)
    return 0


def cmd_bootstrap(args: argparse.Namespace) -> int:
    client = require_client()
    result = ensure_schema(client, dry_run=args.dry_run)
    print_json(result)
    return 0


def cmd_list_tasks(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    tasks = client.tasks({"project_id": project["id"]})
    sections = client.sections(project["id"])
    section_name_by_id = {section["id"]: section["name"] for section in sections}
    context = owner_context_for_project(client, project)
    enriched_tasks = []
    for task in tasks:
        task_copy = dict(task)
        responsible_uid = task_copy.get("responsible_uid")
        task_copy["owner_alias"] = context["alias_by_uid"].get(str(responsible_uid)) if responsible_uid is not None else None
        enriched_tasks.append(task_copy)
    filtered = [task for task in enriched_tasks if task_matches_filters(task, section_name_by_id, args)]
    enriched = []
    for task in filtered:
        responsible_uid = str(task["responsible_uid"]) if task.get("responsible_uid") is not None else None
        collaborator = context["collaborator_by_uid"].get(responsible_uid) if responsible_uid else None
        enriched.append(
            {
                "id": task["id"],
                "content": task.get("content"),
                "description": task.get("description"),
                "labels": task.get("labels") or [],
                "owner": task.get("owner_alias") or owner_for_task(task),
                "assignee_id": responsible_uid,
                "assignee_name": collaborator_name(collaborator),
                "assignee_email": normalize_email(collaborator.get("email")) if collaborator else None,
                "priority": task.get("priority"),
                "due": task.get("due"),
                "deadline": task.get("deadline"),
                "section": section_name_by_id.get(task.get("section_id")),
                "project": args.project,
                "url": f"https://app.todoist.com/app/task/{task['id']}",
            }
        )
    print_json(enriched)
    return 0


def cmd_completed_tasks(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    if args.since and args.until:
        since = args.since
        until = args.until
    else:
        since, until = completion_window(args.days)
    tasks = client.completed_tasks(since=since, until=until, project_id=project["id"])
    print_json(tasks)
    return 0


def build_due_from_args(args: argparse.Namespace) -> dict[str, Any] | None:
    if getattr(args, "no_due", False):
        return None
    if getattr(args, "due_string", None):
        due = {"string": args.due_string}
        if getattr(args, "due_timezone", None):
            due["timezone"] = normalize_timezone(args.due_timezone)
        return due
    if getattr(args, "due_date", None):
        return {"date": args.due_date}
    if getattr(args, "due_datetime", None):
        due = {"date": args.due_datetime}
        if getattr(args, "due_timezone", None):
            due["timezone"] = normalize_timezone(args.due_timezone)
        return due
    return None


def build_deadline_from_args(args: argparse.Namespace) -> dict[str, Any] | None:
    if getattr(args, "no_deadline", False):
        return None
    if getattr(args, "deadline_date", None):
        return {"date": args.deadline_date}
    return None


def translate_due_for_request(payload: dict[str, Any], due: dict[str, Any] | None) -> None:
    if due is None:
        return

    due_string = due.get("string")
    if due_string:
        payload["due_string"] = due_string
        payload["due_lang"] = "en"
        return

    date_value = due.get("date")
    if not date_value:
        return

    if "T" not in date_value:
        payload["due_date"] = date_value
        return

    timezone_value = normalize_timezone(due.get("timezone")) or "UTC"
    naive = datetime.fromisoformat(date_value)
    aware = naive.replace(tzinfo=ZoneInfo(timezone_value))
    payload["due_datetime"] = aware.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def cmd_upsert_task(args: argparse.Namespace) -> int:
    client = require_client()
    metadata = parse_kv_pairs(args.meta or [])
    if args.metadata_key:
        metadata["key"] = args.metadata_key
    owner = normalize_owner(getattr(args, "owner", None), args.content) if getattr(args, "owner", None) else None
    if not owner:
        owner = normalize_owner(metadata.get("owner"), args.content)
    if not owner:
        owner = infer_owner_from_labels(parse_labels(args.label or []))
    result = upsert_task(
        client,
        project_name=args.project,
        content=args.content,
        owner=owner,
        section_name=args.section,
        labels=parse_labels(args.label or []),
        priority=args.priority,
        description=args.description,
        metadata=metadata,
        due=build_due_from_args(args),
        deadline=build_deadline_from_args(args),
        dry_run=args.dry_run,
    )
    print_json(result)
    return 0


def cmd_update_task(args: argparse.Namespace) -> int:
    client = require_client()
    task = resolve_task_for_action(client, args)
    payload: dict[str, Any] = {}
    owner = normalize_owner(getattr(args, "owner", None), task.get("content", "")) if getattr(args, "owner", None) else None
    move_section_id: str | None = None

    if args.content:
        payload["content"] = args.content
    if args.section:
        project = resolve_project_name(client, args.project)
        move_section_id = resolve_section_id(client, project["id"], args.section)
    if args.label:
        payload["labels"] = parse_labels(args.label)
    if owner is not None:
        project = resolve_project_name(client, args.project)
        assignee_id = resolve_assignee_id(client, project, owner)
        if assignee_id:
            payload["assignee_id"] = assignee_id
            labels = payload.get("labels", list(task.get("labels") or []))
            payload["labels"] = strip_owner_labels(labels)
        else:
            labels = payload.get("labels", list(task.get("labels") or []))
            if owner not in labels:
                labels.append(owner)
            payload["labels"] = labels
    if args.priority is not None:
        payload["priority"] = args.priority

    due = build_due_from_args(args)
    if due is not None or args.no_due:
        if args.no_due:
            payload["due_string"] = ""
        else:
            translate_due_for_request(payload, due)

    deadline = build_deadline_from_args(args)
    if deadline is not None or args.no_deadline:
        payload["deadline"] = deadline

    if args.description is not None or args.meta or args.metadata_key:
        existing_human, existing_meta = split_description_and_metadata(task.get("description"))
        merged_meta = dict(existing_meta)
        merged_meta.update(parse_kv_pairs(args.meta or []))
        if args.metadata_key:
            merged_meta["key"] = args.metadata_key
        payload["description"] = build_description(
            args.description if args.description is not None else existing_human,
            merged_meta,
        )

    if not payload:
        if move_section_id is None:
            raise TodoistError("No changes requested for update-task.")

    if args.dry_run:
        preview_payload = dict(payload)
        if move_section_id is not None:
            preview_payload["section_id"] = move_section_id
        print_json({"action": "update", "task_id": task["id"], "payload": preview_payload})
        return 0

    updated = apply_task_changes(client, task["id"], move_section_id=move_section_id, payload=payload or None)
    print_json({"action": "update", "task": updated})
    return 0


def cmd_complete_task(args: argparse.Namespace) -> int:
    client = require_client()
    task = resolve_task_for_action(client, args)
    if args.comment:
        client.comment_task(task["id"], args.comment)
    if args.dry_run:
        print_json({"action": "close", "task_id": task["id"], "content": task.get("content")})
        return 0
    client.close_task(task["id"])
    print_json({"action": "closed", "task_id": task["id"], "content": task.get("content")})
    return 0


def cmd_comment_task(args: argparse.Namespace) -> int:
    client = require_client()
    task = resolve_task_for_action(client, args)
    if args.dry_run:
        print_json({"action": "comment", "task_id": task["id"], "content": args.comment})
        return 0
    comment = client.comment_task(task["id"], args.comment)
    print_json(comment)
    return 0


def cmd_import_markdown(args: argparse.Namespace) -> int:
    markdown = Path(args.path).read_text()
    parsed = parse_legacy_tasks(markdown)
    plan = build_import_plan(parsed, include_backlog=args.include_backlog)

    if not args.apply:
        print_json(plan)
        return 0

    client = require_client()
    ensure_schema(client, dry_run=False)
    applied: list[dict[str, Any]] = []
    for item in plan["imports"]:
        applied.append(
            upsert_task(
                client,
                project_name=target_schema()["project"],
                content=item["content"],
                owner=item["metadata"].get("owner"),
                section_name=item["section"],
                labels=item["labels"],
                priority=item["priority"],
                description=item["description"],
                metadata=item["metadata"],
                due=item["due"],
                deadline=item["deadline"],
                dry_run=False,
            )
        )

    print_json(
        {
            "applied": applied,
            "counts": {
                "applied": len(applied),
                "recurring_suggestions": len(plan["recurring_suggestions"]),
                "skipped": len(plan["skipped"]),
            },
            "recurring_suggestions": plan["recurring_suggestions"],
            "skipped": plan["skipped"],
        }
    )
    return 0


def cmd_import_recurring(args: argparse.Namespace) -> int:
    markdown = Path(args.path).read_text()
    parsed = parse_legacy_tasks(markdown)
    plan = build_recurring_import_plan(parsed)

    if not args.apply:
        print_json(plan)
        return 0

    client = require_client()
    ensure_schema(client, dry_run=False)
    project = resolve_project_name(client, target_schema()["project"])
    project_id = project["id"]
    owner_context = owner_context_for_project(client, project)
    assignee_id_by_owner = {alias: uid for uid, alias in owner_context["alias_by_uid"].items()}
    existing_tasks = client.tasks({"project_id": project_id})
    applied: list[dict[str, Any]] = []
    for item in plan["imports"]:
        section_id = resolve_section_id(client, project_id, item["section"]) if item.get("section") else None
        match = choose_best_match(
            existing_tasks,
            content=item["content"],
            labels=item["labels"],
            section_id=section_id,
            due=None,
            metadata_key=item["metadata"]["key"],
        )
        if not match:
            for candidate in existing_tasks:
                _, candidate_meta = split_description_and_metadata(candidate.get("description"))
                candidate_due = candidate.get("due") or {}
                if candidate_meta.get("kind") != "recurring_import":
                    continue
                if candidate.get("content") != item["content"]:
                    continue
                if owner_for_task(candidate) != item["owner"]:
                    continue
                if candidate_due.get("string") != item["due"]["string"]:
                    continue
                match = candidate
                break
        assignee_id = assignee_id_by_owner.get(item["owner"])
        labels = list(item["labels"])
        if not assignee_id and item["owner"] not in labels:
            labels.append(item["owner"])
        due_payload = build_sync_due(item["due"])
        rest_payload: dict[str, Any] = {
            "content": item["content"],
            "priority": item["priority"],
            "description": build_description(item["description"], item["metadata"]),
            "labels": labels,
        }
        if assignee_id:
            rest_payload["assignee_id"] = assignee_id

        if match:
            client.item_update(str(match["id"]), {"due": due_payload})
            move_section_id = section_id if section_id is not None and str(match.get("section_id") or "") != str(section_id) else None
            updated = apply_task_changes(client, str(match["id"]), move_section_id=move_section_id, payload=rest_payload)
            applied.append({"action": "update", "task": updated})
            for index, task in enumerate(existing_tasks):
                if str(task.get("id")) == str(match["id"]):
                    existing_tasks[index] = updated
                    break
        else:
            item_id = client.item_add({"content": item["content"], "project_id": project_id, "due": due_payload})
            updated = apply_task_changes(client, item_id, move_section_id=section_id, payload=rest_payload)
            applied.append({"action": "create", "task": updated})
            existing_tasks.append(updated)

        time.sleep(1)

    print_json(
        {
            "applied": applied,
            "counts": {
                "applied": len(applied),
                "skipped": len(plan["skipped"]),
            },
            "skipped": plan["skipped"],
        }
    )
    return 0


def cmd_workspace_status(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    context = owner_context_for_project(client, project)
    workspaces = client.workspaces()
    workspace = find_workspace(workspaces, args.workspace) if args.workspace else None
    current_user = context["current_user"]
    result: dict[str, Any] = {
        "project": {
            "id": project.get("id"),
            "name": project.get("name"),
            "workspace_id": project.get("workspace_id"),
            "is_shared": project.get("is_shared"),
            "can_assign_tasks": project.get("can_assign_tasks"),
        },
        "current_user": {
            "id": current_user.get("id"),
            "email": current_user.get("email"),
            "full_name": current_user.get("full_name"),
        },
        "collaborators": [
            {
                "id": collaborator_uid(collaborator),
                "name": collaborator_name(collaborator),
                "email": normalize_email(collaborator.get("email") or collaborator.get("user_email")),
                "owner_alias": owner_alias_for_user(collaborator, current_user),
            }
            for collaborator in context["collaborators"]
        ],
        "workspaces": [{"id": item.get("id"), "name": item.get("name")} for item in workspaces],
    }
    if workspace:
        result["selected_workspace"] = {"id": workspace.get("id"), "name": workspace.get("name")}
    print_json(result)
    return 0


def cmd_move_project_to_workspace(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    workspace = resolve_workspace_name(client, args.workspace)

    if str(project.get("workspace_id")) == str(workspace["id"]):
        print_json(
            {
                "action": "noop",
                "reason": "project already belongs to workspace",
                "project_id": project["id"],
                "workspace_id": workspace["id"],
            }
        )
        return 0

    if args.dry_run:
        print_json(
            {
                "action": "move_project_to_workspace",
                "project_id": project["id"],
                "project": project["name"],
                "workspace_id": workspace["id"],
                "workspace": workspace["name"],
            }
        )
        return 0

    response = client.move_project_to_workspace(project_id=project["id"], workspace_id=str(workspace["id"]))
    updated_project = resolve_project_name(client, args.project)
    print_json(
        {
            "action": "move_project_to_workspace",
            "sync_status": response.get("sync_status"),
            "project": updated_project,
        }
    )
    return 0


def cmd_share_project(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    email = normalize_email(args.email)
    for collaborator in client.project_collaborators(project["id"]):
        collaborator_email = normalize_email(collaborator.get("email") or collaborator.get("user_email"))
        if collaborator_email == email:
            print_json(
                {
                    "action": "noop",
                    "reason": "collaborator already present",
                    "project_id": project["id"],
                    "email": email,
                }
            )
            return 0

    if args.dry_run:
        print_json({"action": "share_project", "project_id": project["id"], "email": email})
        return 0

    response = client.share_project(project_id=project["id"], email=email, role=args.role)
    print_json(
        {
            "action": "share_project",
            "sync_status": response.get("sync_status"),
            "project_id": project["id"],
            "email": email,
            "collaborators": client.project_collaborators(project["id"]),
        }
    )
    return 0


def cmd_backfill_assignments(args: argparse.Namespace) -> int:
    client = require_client()
    project = resolve_project_name(client, args.project)
    tasks = client.tasks({"project_id": project["id"]})
    updated: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for task in tasks:
        owner = owner_for_task(task)
        if not owner:
            skipped.append({"task_id": task["id"], "content": task.get("content"), "reason": "owner not found"})
            continue

        assignee_id = resolve_assignee_id(client, project, owner)
        if not assignee_id:
            skipped.append(
                {
                    "task_id": task["id"],
                    "content": task.get("content"),
                    "owner": owner,
                    "reason": "assignee not currently resolvable",
                }
            )
            continue

        payload: dict[str, Any] = {}
        current_assignee = str(task.get("responsible_uid")) if task.get("responsible_uid") is not None else None
        if current_assignee != assignee_id:
            payload["assignee_id"] = assignee_id
        if args.strip_owner_labels:
            stripped = strip_owner_labels(list(task.get("labels") or []))
            if stripped != list(task.get("labels") or []):
                payload["labels"] = stripped

        if not payload:
            skipped.append(
                {
                    "task_id": task["id"],
                    "content": task.get("content"),
                    "owner": owner,
                    "reason": "already assigned",
                }
            )
            continue

        if args.dry_run:
            updated.append({"task_id": task["id"], "content": task.get("content"), "payload": payload})
            continue

        result = client.update_task(task["id"], payload)
        updated.append(
            {
                "task_id": task["id"],
                "content": task.get("content"),
                "assignee_id": result.get("responsible_uid"),
                "labels": result.get("labels") or [],
            }
        )

    print_json({"updated": updated, "skipped": skipped, "counts": {"updated": len(updated), "skipped": len(skipped)}})
    return 0


def cmd_sync_program_sections(args: argparse.Namespace) -> int:
    client = require_client()
    ensure_schema(client, dry_run=False)
    project = resolve_project_name(client, args.project)
    sections = client.sections(project["id"])
    section_by_name = {section["name"]: section for section in sections}
    section_name_by_id = {section["id"]: section["name"] for section in sections}
    tasks = client.tasks({"project_id": project["id"]})

    moved: list[dict[str, Any]] = []
    updated_labels: list[dict[str, Any]] = []
    untouched: list[dict[str, Any]] = []

    for task in tasks:
        desired_section = program_section_for_task_record(task, section_name_by_id)
        desired_section_id = section_by_name[desired_section]["id"]
        payload: dict[str, Any] = {}

        if str(task.get("section_id") or "") != str(desired_section_id):
            payload["section_id"] = desired_section_id

        current_labels = list(task.get("labels") or [])
        desired_labels = list(current_labels)
        if args.strip_redundant_program_labels:
            redundant = redundant_program_labels(desired_section)
            desired_labels = [label for label in desired_labels if label not in redundant and label != "waiting"]
            if desired_labels != current_labels:
                payload["labels"] = desired_labels

        if not payload:
            untouched.append({"task_id": task["id"], "content": task.get("content"), "section": desired_section})
            continue

        if args.dry_run:
            if "section_id" in payload:
                moved.append(
                    {
                        "task_id": task["id"],
                        "content": task.get("content"),
                        "from": section_name_by_id.get(task.get("section_id")),
                        "to": desired_section,
                    }
                )
            if "labels" in payload:
                updated_labels.append(
                    {
                        "task_id": task["id"],
                        "content": task.get("content"),
                        "labels": payload["labels"],
                    }
                )
            continue

        had_section_move = "section_id" in payload
        move_section_id = payload.pop("section_id", None)
        result = apply_task_changes(client, task["id"], move_section_id=move_section_id, payload=payload or None)
        if had_section_move:
            moved.append(
                {
                    "task_id": task["id"],
                    "content": task.get("content"),
                    "from": section_name_by_id.get(task.get("section_id")),
                    "to": desired_section,
                }
            )
        if "labels" in payload:
            updated_labels.append(
                {
                    "task_id": task["id"],
                    "content": task.get("content"),
                    "labels": result.get("labels") or [],
                }
            )
        time.sleep(0.2)

    deleted_sections: list[str] = []
    if args.delete_legacy_sections and not args.dry_run:
        refreshed_tasks = client.tasks({"project_id": project["id"]})
        used_section_ids = {str(task.get("section_id")) for task in refreshed_tasks if task.get("section_id")}
        refreshed_sections = client.sections(project["id"])
        for section in refreshed_sections:
            name = section.get("name")
            if name in LEGACY_WORKFLOW_SECTIONS and str(section["id"]) not in used_section_ids:
                client.delete_section(section["id"])
                deleted_sections.append(name)

    print_json(
        {
            "moved": moved,
            "updated_labels": updated_labels,
            "untouched_count": len(untouched),
            "deleted_sections": deleted_sections,
            "counts": {
                "moved": len(moved),
                "updated_labels": len(updated_labels),
                "untouched": len(untouched),
                "deleted_sections": len(deleted_sections),
            },
        }
    )
    return 0


def add_common_task_identity_args(parser: argparse.ArgumentParser, *, require_identity: bool = True) -> None:
    parser.add_argument("--project", default=DEFAULT_PROJECT)
    parser.add_argument("--task-id")
    parser.add_argument("--metadata-key")
    parser.add_argument("--content", required=require_identity)
    parser.add_argument("--label", action="append")
    parser.add_argument("--section")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Todoist helper for clawchief")
    subparsers = parser.add_subparsers(dest="command", required=True)

    schema = subparsers.add_parser("schema", help="Print the target Todoist schema")
    schema.set_defaults(func=cmd_schema)

    doctor = subparsers.add_parser("doctor", help="Check local Todoist configuration")
    doctor.add_argument("--ping", action="store_true", help="Also check whether the Clawchief project exists")
    doctor.set_defaults(func=cmd_doctor)

    bootstrap = subparsers.add_parser("bootstrap", help="Ensure the Clawchief project, priority-map program sections, and labels exist")
    bootstrap.add_argument("--dry-run", action="store_true")
    bootstrap.set_defaults(func=cmd_bootstrap)

    list_tasks = subparsers.add_parser("list-tasks", help="List active tasks from the Clawchief project")
    list_tasks.add_argument("--project", default=DEFAULT_PROJECT)
    list_tasks.add_argument("--section", action="append")
    list_tasks.add_argument("--label", action="append")
    list_tasks.add_argument("--owner", choices=["ryan", "r2"])
    list_tasks.add_argument("--due-today", action="store_true")
    list_tasks.add_argument("--overdue", action="store_true")
    list_tasks.set_defaults(func=cmd_list_tasks)

    completed = subparsers.add_parser("completed-tasks", help="List recently completed tasks from the Clawchief project")
    completed.add_argument("--project", default=DEFAULT_PROJECT)
    completed.add_argument("--days", type=int, default=7)
    completed.add_argument("--since")
    completed.add_argument("--until")
    completed.set_defaults(func=cmd_completed_tasks)

    upsert = subparsers.add_parser("upsert-task", help="Create or safely update a task")
    upsert.add_argument("--project", default=DEFAULT_PROJECT)
    upsert.add_argument("--content", required=True)
    upsert.add_argument("--owner", choices=list(OWNER_ALIASES))
    upsert.add_argument("--section")
    upsert.add_argument("--label", action="append")
    upsert.add_argument("--priority", type=int, choices=[1, 2, 3, 4])
    upsert.add_argument("--description")
    upsert.add_argument("--meta", action="append")
    upsert.add_argument("--metadata-key")
    upsert.add_argument("--due-string")
    upsert.add_argument("--due-date")
    upsert.add_argument("--due-datetime")
    upsert.add_argument("--due-timezone")
    upsert.add_argument("--no-due", action="store_true")
    upsert.add_argument("--deadline-date")
    upsert.add_argument("--no-deadline", action="store_true")
    upsert.add_argument("--dry-run", action="store_true")
    upsert.set_defaults(func=cmd_upsert_task)

    update = subparsers.add_parser("update-task", help="Update an existing task by id, metadata key, or content")
    add_common_task_identity_args(update, require_identity=False)
    update.add_argument("--owner", choices=list(OWNER_ALIASES))
    update.add_argument("--priority", type=int, choices=[1, 2, 3, 4])
    update.add_argument("--description")
    update.add_argument("--meta", action="append")
    update.add_argument("--due-string")
    update.add_argument("--due-date")
    update.add_argument("--due-datetime")
    update.add_argument("--due-timezone")
    update.add_argument("--no-due", action="store_true")
    update.add_argument("--deadline-date")
    update.add_argument("--no-deadline", action="store_true")
    update.add_argument("--dry-run", action="store_true")
    update.set_defaults(func=cmd_update_task)

    complete = subparsers.add_parser("complete-task", help="Complete a task by id, metadata key, or content")
    add_common_task_identity_args(complete, require_identity=False)
    complete.add_argument("--comment")
    complete.add_argument("--dry-run", action="store_true")
    complete.set_defaults(func=cmd_complete_task)

    comment = subparsers.add_parser("comment-task", help="Add a comment to a task")
    add_common_task_identity_args(comment, require_identity=False)
    comment.add_argument("--comment", required=True)
    comment.add_argument("--dry-run", action="store_true")
    comment.set_defaults(func=cmd_comment_task)

    import_markdown = subparsers.add_parser("import-markdown", help="Convert the legacy markdown task file into Todoist tasks using program sections")
    import_markdown.add_argument("--path", default=str(CLAWCHIEF_ROOT / "archive" / "legacy-tasks.md"))
    import_markdown.add_argument("--include-backlog", action="store_true")
    import_markdown.add_argument("--apply", action="store_true")
    import_markdown.set_defaults(func=cmd_import_markdown)

    import_recurring = subparsers.add_parser("import-recurring", help="Convert legacy recurring markdown tasks into native recurring Todoist tasks using program sections")
    import_recurring.add_argument("--path", default=str(CLAWCHIEF_ROOT / "archive" / "legacy-tasks.md"))
    import_recurring.add_argument("--apply", action="store_true")
    import_recurring.set_defaults(func=cmd_import_recurring)

    workspace_status = subparsers.add_parser("workspace-status", help="Show current workspace and collaborator state")
    workspace_status.add_argument("--project", default=DEFAULT_PROJECT)
    workspace_status.add_argument("--workspace")
    workspace_status.set_defaults(func=cmd_workspace_status)

    move_project = subparsers.add_parser("move-project-to-workspace", help="Move a personal project into a workspace")
    move_project.add_argument("--project", default=DEFAULT_PROJECT)
    move_project.add_argument("--workspace", required=True)
    move_project.add_argument("--dry-run", action="store_true")
    move_project.set_defaults(func=cmd_move_project_to_workspace)

    share_project = subparsers.add_parser("share-project", help="Share a project with another Todoist user")
    share_project.add_argument("--project", default=DEFAULT_PROJECT)
    share_project.add_argument("--email", required=True)
    share_project.add_argument("--role")
    share_project.add_argument("--dry-run", action="store_true")
    share_project.set_defaults(func=cmd_share_project)

    backfill = subparsers.add_parser("backfill-assignments", help="Convert owner metadata into Todoist assignees")
    backfill.add_argument("--project", default=DEFAULT_PROJECT)
    backfill.add_argument("--strip-owner-labels", action="store_true")
    backfill.add_argument("--dry-run", action="store_true")
    backfill.set_defaults(func=cmd_backfill_assignments)

    sync_programs = subparsers.add_parser("sync-program-sections", help="Align Todoist sections and task placement to programs from priority-map.md")
    sync_programs.add_argument("--project", default=DEFAULT_PROJECT)
    sync_programs.add_argument("--strip-redundant-program-labels", action="store_true")
    sync_programs.add_argument("--delete-legacy-sections", action="store_true")
    sync_programs.add_argument("--dry-run", action="store_true")
    sync_programs.set_defaults(func=cmd_sync_program_sections)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except TodoistError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
