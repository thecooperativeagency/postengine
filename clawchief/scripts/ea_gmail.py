#!/usr/bin/env python3

"""Executive-assistant Gmail helper.

This wrapper gives the EA skill one stable Gmail command surface built on `gws`.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
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


def format_addr(addr: dict[str, Any] | None) -> str:
    if not addr:
        return ""
    name = addr.get("name")
    email = addr.get("email")
    if not email:
        return ""
    return f"{name} <{email}>" if name else email


def format_addr_list(addrs: list[dict[str, Any]] | None) -> str:
    if not addrs:
        return ""
    return ", ".join(filter(None, (format_addr(addr) for addr in addrs)))


def read_body_file(path: str) -> str:
    return Path(path).read_text()


def gws_search(query: str, max_results: int, *, profile_account: str) -> Any:
    return run(
        [
            "gws",
            "gmail",
            "users",
            "messages",
            "list",
            "--params",
            json.dumps({"userId": "me", "q": query, "maxResults": max_results}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def normalize_search_result(raw: Any) -> Any:
    if isinstance(raw, dict) and "messages" in raw:
        return raw["messages"]
    return raw


def gws_read(message_id: str, *, profile_account: str) -> dict[str, Any]:
    message = run(
        [
            "gws",
            "gmail",
            "users",
            "messages",
            "get",
            "--params",
            json.dumps({"userId": "me", "id": message_id, "format": "full"}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )
    rendered = run(
        ["gws", "gmail", "+read", "--id", message_id, "--headers", "--format", "json"],
        expect_json=True,
        profile_account=profile_account,
    )
    return {
        "body": rendered.get("body_text", ""),
        "headers": {
            "from": format_addr(rendered.get("from")),
            "reply_to": format_addr(rendered.get("reply_to")),
            "to": format_addr_list(rendered.get("to")),
            "cc": format_addr_list(rendered.get("cc")),
            "subject": rendered.get("subject", ""),
            "date": rendered.get("date", ""),
        },
        "message": {
            "id": message.get("id"),
            "threadId": message.get("threadId"),
            "labelIds": message.get("labelIds", []),
            "historyId": message.get("historyId"),
            "snippet": message.get("snippet", ""),
        },
    }


def gws_thread(thread_id: str, *, profile_account: str) -> Any:
    return run(
        [
            "gws",
            "gmail",
            "users",
            "threads",
            "get",
            "--params",
            json.dumps({"userId": "me", "id": thread_id, "format": "full"}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def reply_with_gws(
    *,
    message_id: str,
    body: str,
    reply_all: bool,
    profile_account: str,
    html: bool = False,
    to: str = "",
    cc: str = "",
    bcc: str = "",
    from_addr: str = "",
) -> Any:
    command = ["gws", "gmail", "+reply-all" if reply_all else "+reply", "--message-id", message_id, "--body", body]
    if html:
        command.append("--html")
    if to:
        command.extend(["--to", to])
    if cc:
        command.extend(["--cc", cc])
    if bcc:
        command.extend(["--bcc", bcc])
    if from_addr:
        command.extend(["--from", from_addr])
    return run(command, expect_json=True, profile_account=profile_account)


def send_with_gws(
    *,
    to: str,
    subject: str,
    body: str,
    profile_account: str,
    html: bool = False,
    cc: str = "",
    bcc: str = "",
    from_addr: str = "",
) -> Any:
    command = ["gws", "gmail", "+send", "--to", to, "--subject", subject, "--body", body]
    if html:
        command.append("--html")
    if cc:
        command.extend(["--cc", cc])
    if bcc:
        command.extend(["--bcc", bcc])
    if from_addr:
        command.extend(["--from", from_addr])
    return run(command, expect_json=True, profile_account=profile_account)


def modify_with_gws(message_id: str, *, remove_labels: list[str], profile_account: str) -> Any:
    return run(
        [
            "gws",
            "gmail",
            "users",
            "messages",
            "modify",
            "--params",
            json.dumps({"userId": "me", "id": message_id}),
            "--json",
            json.dumps({"removeLabelIds": remove_labels}),
            "--format",
            "json",
        ],
        expect_json=True,
        profile_account=profile_account,
    )


def reply(args: argparse.Namespace) -> Any:
    body = read_body_file(args.body_file)
    profile_account = profile_account_for_email(args.from_addr or args.account)
    return reply_with_gws(
        message_id=args.message_id,
        body=body,
        reply_all=args.reply_all,
        profile_account=profile_account,
        html=args.html,
        to=args.to,
        cc=args.cc,
        bcc=args.bcc,
        from_addr=args.from_addr,
    )


def send(args: argparse.Namespace) -> Any:
    body = read_body_file(args.body_file)
    profile_account = profile_account_for_email(args.from_addr or args.account)
    return send_with_gws(
        to=args.to,
        subject=args.subject,
        body=body,
        profile_account=profile_account,
        html=args.html,
        cc=args.cc,
        bcc=args.bcc,
        from_addr=args.from_addr,
    )


def mark_read(args: argparse.Namespace) -> Any:
    return modify_with_gws(
        args.message_id,
        remove_labels=["UNREAD"],
        profile_account=profile_account_for_email(args.account),
    )


def archive(args: argparse.Namespace) -> Any:
    return modify_with_gws(
        args.message_id,
        remove_labels=["INBOX"],
        profile_account=profile_account_for_email(args.account),
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="EA Gmail helper")
    parser.add_argument("--account", default=DEFAULT_ACCOUNT)
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search")
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument("--max", type=int, default=10)

    read_parser = subparsers.add_parser("read")
    read_parser.add_argument("--message-id", required=True)

    thread_parser = subparsers.add_parser("thread")
    thread_parser.add_argument("--thread-id", required=True)

    reply_parser = subparsers.add_parser("reply")
    reply_parser.add_argument("--message-id", required=True)
    reply_parser.add_argument("--body-file", required=True)
    reply_parser.add_argument("--reply-all", action="store_true")
    reply_parser.add_argument("--to", default="")
    reply_parser.add_argument("--cc", default="")
    reply_parser.add_argument("--bcc", default="")
    reply_parser.add_argument("--html", action="store_true")
    reply_parser.add_argument("--from", dest="from_addr", default="")

    send_parser = subparsers.add_parser("send")
    send_parser.add_argument("--to", required=True)
    send_parser.add_argument("--subject", required=True)
    send_parser.add_argument("--body-file", required=True)
    send_parser.add_argument("--cc", default="")
    send_parser.add_argument("--bcc", default="")
    send_parser.add_argument("--html", action="store_true")
    send_parser.add_argument("--from", dest="from_addr", default="")

    mark_read_parser = subparsers.add_parser("mark-read")
    mark_read_parser.add_argument("--message-id", required=True)

    archive_parser = subparsers.add_parser("archive")
    archive_parser.add_argument("--message-id", required=True)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "search":
            result = normalize_search_result(
                gws_search(args.query, args.max, profile_account=profile_account_for_email(args.account))
            )
        elif args.command == "read":
            result = gws_read(args.message_id, profile_account=profile_account_for_email(args.account))
        elif args.command == "thread":
            result = gws_thread(args.thread_id, profile_account=profile_account_for_email(args.account))
        elif args.command == "reply":
            result = reply(args)
        elif args.command == "send":
            result = send(args)
        elif args.command == "mark-read":
            result = mark_read(args)
        elif args.command == "archive":
            result = archive(args)
        else:
            raise AssertionError(f"Unhandled command: {args.command}")
    except CommandFailure as exc:
        print(exc.combined_output() or f"Command failed: {' '.join(exc.command)}", file=sys.stderr)
        return exc.returncode

    if isinstance(result, str):
        print(result)
    else:
        print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
