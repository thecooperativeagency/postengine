#!/usr/bin/env python3

"""Executive-assistant Calendar helper.

This wrapper gives the EA skill one stable Calendar command surface built on `gws`.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_ACCOUNT = "r2@untangle.us"
RYAN_PROFILE_ACCOUNT = "ryan@ryancarson.com"
RYAN_PROFILE_ADDRESSES = {
    "ryan@ryancarson.com",
    "communications.chair@essexyc.org",
    "ryan@121g.fund",
    "hello@untangle.us",
    "hello@untangle-us.com",
}
PROFILE_CONFIG_DIRS = {
    DEFAULT_ACCOUNT: Path.home() / ".config" / "gws-r2",
    RYAN_PROFILE_ACCOUNT: Path.home() / ".config" / "gws-ryan",
}
PROFILE_CREDENTIAL_FILES = {
    account: config_dir / "credentials.json" for account, config_dir in PROFILE_CONFIG_DIRS.items()
}


@dataclass
class CommandFailure(Exception):
    command: list[str]
    returncode: int
    stdout: str
    stderr: str

    def combined_output(self) -> str:
        return "\n".join(part for part in (self.stdout.strip(), self.stderr.strip()) if part)


def profile_account_for_email(email: str) -> str:
    normalized = email.strip().lower()
    if normalized in RYAN_PROFILE_ADDRESSES:
        return RYAN_PROFILE_ACCOUNT
    return DEFAULT_ACCOUNT


def gws_env(profile_account: str) -> dict[str, str]:
    env = os.environ.copy()
    config_dir = PROFILE_CONFIG_DIRS.get(profile_account, PROFILE_CONFIG_DIRS[DEFAULT_ACCOUNT])
    env["GOOGLE_WORKSPACE_CLI_CONFIG_DIR"] = str(config_dir)
    env["GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND"] = "file"
    credentials_file = PROFILE_CREDENTIAL_FILES.get(profile_account)
    if credentials_file and credentials_file.exists():
        env["GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE"] = str(credentials_file)
    return env


def run(command: list[str], *, expect_json: bool = False, profile_account: str = DEFAULT_ACCOUNT) -> Any:
    proc = subprocess.run(command, capture_output=True, text=True, env=gws_env(profile_account))
    if proc.returncode != 0:
        raise CommandFailure(command, proc.returncode, proc.stdout, proc.stderr)
    if not expect_json:
        return proc.stdout
    text = proc.stdout.strip()
    if not text:
        return {}
    return json.loads(text)


def read_text_arg(text: str, text_file: str) -> str:
    if text_file:
        return Path(text_file).read_text()
    return text


def normalize_items(raw: Any) -> Any:
    if isinstance(raw, dict) and "items" in raw:
        return raw["items"]
    return raw


def gws_calendars(max_results: int, min_access_role: str, *, profile_account: str) -> Any:
    return run(
        [
            "gws",
            "calendar",
            "calendarList",
            "list",
            "--params",
            json.dumps({"maxResults": max_results, "minAccessRole": min_access_role}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def gws_agenda(args: argparse.Namespace) -> Any:
    command = ["gws", "calendar", "+agenda", "--format", "json"]
    if args.today:
        command.append("--today")
    elif args.tomorrow:
        command.append("--tomorrow")
    elif args.week:
        command.append("--week")
    else:
        command.extend(["--days", str(args.days)])
    if args.calendar:
        command.extend(["--calendar", args.calendar])
    if args.timezone:
        command.extend(["--timezone", args.timezone])
    return run(command, expect_json=True, profile_account=profile_account_for_email(args.account))


def gws_get(calendar_id: str, event_id: str, *, profile_account: str) -> Any:
    return run(
        [
            "gws",
            "calendar",
            "events",
            "get",
            "--params",
            json.dumps({"calendarId": calendar_id, "eventId": event_id}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def build_event_body(
    *,
    summary: str,
    start: str,
    end: str,
    description: str,
    location: str,
    attendees: list[str],
    meet: bool,
) -> tuple[dict[str, Any], int]:
    body: dict[str, Any] = {
        "summary": summary,
        "start": {"dateTime": start},
        "end": {"dateTime": end},
    }
    if description:
        body["description"] = description
    if location:
        body["location"] = location
    if attendees:
        body["attendees"] = [{"email": email} for email in attendees]
    conference_version = 0
    if meet:
        conference_version = 1
        body["conferenceData"] = {
            "createRequest": {
                "requestId": f"ea-calendar-{uuid.uuid4()}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        }
    return body, conference_version


def gws_create(args: argparse.Namespace) -> Any:
    description = read_text_arg(args.description, args.description_file)
    body, conference_version = build_event_body(
        summary=args.summary,
        start=args.start,
        end=args.end,
        description=description,
        location=args.location,
        attendees=args.attendee,
        meet=args.meet,
    )
    params: dict[str, Any] = {"calendarId": args.calendar, "sendUpdates": args.send_updates}
    if conference_version:
        params["conferenceDataVersion"] = conference_version
    return run(
        [
            "gws",
            "calendar",
            "events",
            "insert",
            "--params",
            json.dumps(params),
            "--json",
            json.dumps(body),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account_for_email(args.account),
    )


def build_patch_body(
    *,
    summary: str | None,
    start: str,
    end: str,
    description: str | None,
    location: str | None,
    attendees: list[str],
    add_attendees: list[str],
    current_event: dict[str, Any] | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {}
    if summary is not None:
        body["summary"] = summary
    if start or end:
        if not start or not end:
            raise ValueError("--start and --end must be provided together")
        body["start"] = {"dateTime": start}
        body["end"] = {"dateTime": end}
    if description is not None:
        body["description"] = description
    if location is not None:
        body["location"] = location
    if attendees:
        body["attendees"] = [{"email": email} for email in attendees]
    elif add_attendees:
        merged: dict[str, dict[str, Any]] = {}
        for attendee in current_event.get("attendees", []) if current_event else []:
            email = attendee.get("email")
            if email:
                merged[email] = attendee
        for email in add_attendees:
            merged[email] = {"email": email}
        body["attendees"] = list(merged.values())
    return body


def gws_update(args: argparse.Namespace) -> Any:
    description: str | None = None
    if args.description_file or args.description is not None:
        description = read_text_arg(args.description or "", args.description_file)
    current_event: dict[str, Any] | None = None
    profile_account = profile_account_for_email(args.account)
    if args.add_attendee:
        current_event = gws_get(args.calendar, args.event_id, profile_account=profile_account)
    body = build_patch_body(
        summary=args.summary,
        start=args.start,
        end=args.end,
        description=description,
        location=args.location,
        attendees=args.attendee,
        add_attendees=args.add_attendee,
        current_event=current_event,
    )
    params = {"calendarId": args.calendar, "eventId": args.event_id, "sendUpdates": args.send_updates}
    return run(
        [
            "gws",
            "calendar",
            "events",
            "patch",
            "--params",
            json.dumps(params),
            "--json",
            json.dumps(body),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EA Calendar helper")
    parser.add_argument("--account", default=DEFAULT_ACCOUNT)
    subparsers = parser.add_subparsers(dest="command", required=True)

    calendars_parser = subparsers.add_parser("calendars")
    calendars_parser.add_argument("--max", type=int, default=100)
    calendars_parser.add_argument("--min-access-role", default="reader")

    agenda_parser = subparsers.add_parser("agenda")
    agenda_parser.add_argument("--days", type=int, default=3)
    agenda_parser.add_argument("--today", action="store_true")
    agenda_parser.add_argument("--tomorrow", action="store_true")
    agenda_parser.add_argument("--week", action="store_true")
    agenda_parser.add_argument("--calendar", default="")
    agenda_parser.add_argument("--timezone", default="")
    agenda_parser.add_argument("--max", type=int, default=50)

    get_parser = subparsers.add_parser("get")
    get_parser.add_argument("--calendar", required=True)
    get_parser.add_argument("--event-id", required=True)

    create_parser = subparsers.add_parser("create")
    create_parser.add_argument("--calendar", required=True)
    create_parser.add_argument("--summary", required=True)
    create_parser.add_argument("--start", required=True)
    create_parser.add_argument("--end", required=True)
    create_parser.add_argument("--description", default="")
    create_parser.add_argument("--description-file", default="")
    create_parser.add_argument("--location", default="")
    create_parser.add_argument("--attendee", action="append", default=[])
    create_parser.add_argument("--meet", action="store_true")
    create_parser.add_argument("--send-updates", default="all")

    update_parser = subparsers.add_parser("update")
    update_parser.add_argument("--calendar", required=True)
    update_parser.add_argument("--event-id", required=True)
    update_parser.add_argument("--summary")
    update_parser.add_argument("--start", default="")
    update_parser.add_argument("--end", default="")
    update_parser.add_argument("--description")
    update_parser.add_argument("--description-file", default="")
    update_parser.add_argument("--location")
    update_parser.add_argument("--attendee", action="append", default=[])
    update_parser.add_argument("--add-attendee", action="append", default=[])
    update_parser.add_argument("--send-updates", default="all")

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "calendars":
            result = normalize_items(
                gws_calendars(
                    args.max,
                    args.min_access_role,
                    profile_account=profile_account_for_email(args.account),
                )
            )
        elif args.command == "agenda":
            result = gws_agenda(args)
        elif args.command == "get":
            result = gws_get(
                args.calendar,
                args.event_id,
                profile_account=profile_account_for_email(args.account),
            )
        elif args.command == "create":
            result = gws_create(args)
        elif args.command == "update":
            result = gws_update(args)
        else:
            raise AssertionError(f"Unhandled command: {args.command}")
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except CommandFailure as exc:
        print(exc.combined_output() or f"Command failed: {' '.join(exc.command)}", file=sys.stderr)
        return exc.returncode

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
