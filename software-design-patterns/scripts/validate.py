#!/usr/bin/env python3
"""Validate the software-design-patterns skill using only the Python standard library."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "SKILL.md"

REQUIRED_FILES = {
    "SKILL.md",
    "assets/adr-template.md",
    "evals/evals.json",
    "examples/README.md",
    "examples/no-pattern-typescript.md",
    "examples/adapter-migration-typescript.md",
    "examples/idiomatic-forms.md",
    "examples/architecture-evolution-outbox.md",
    "references/object-patterns.md",
    "references/architecture-patterns.md",
    "references/domain-data-patterns.md",
    "references/distributed-concurrency.md",
    "references/comparisons.md",
    "references/review-playbook.md",
    "references/further-reading.md",
    "references/coverage-index.md",
    "scripts/validate.py",
}

CORE_ROUTES = {
    "assets/adr-template.md",
    "examples/README.md",
    "references/object-patterns.md",
    "references/architecture-patterns.md",
    "references/domain-data-patterns.md",
    "references/distributed-concurrency.md",
    "references/comparisons.md",
    "references/review-playbook.md",
    "references/further-reading.md",
    "references/coverage-index.md",
}

CATALOG_FIELDS = ("Intent", "Use when", "Avoid when", "Structure", "Trade-offs", "Mistakes / related")
REQUIRED_EVAL_TAGS = {
    "no-pattern",
    "correct-as-is",
    "implementation",
    "architecture",
    "distributed",
    "idiomatic",
    "migration",
    "review",
}

# Prefixes allow headings to carry a compact taxonomy suffix such as "— GoF".
REQUIRED_HEADINGS: dict[str, list[str]] = {
    "references/object-patterns.md": [
        "Simple Factory / Static Factory",
        "Factory Method",
        "Abstract Factory",
        "Builder",
        "Prototype",
        "Singleton",
        "Object Pool",
        "Dependency Injection",
        "Provider / Scoped Context",
        "Adapter",
        "Bridge",
        "Composite",
        "Decorator",
        "Facade",
        "Flyweight",
        "Proxy",
        "Module",
        "Mixin / Trait",
        "Chain of Responsibility",
        "Command",
        "Interpreter",
        "Iterator",
        "Mediator",
        "Memento",
        "Observer",
        "State",
        "Strategy",
        "Template Method",
        "Visitor",
        "Null Object",
        "Policy",
    ],
    "references/architecture-patterns.md": [
        "Layered Architecture",
        "Hexagonal Architecture / Ports and Adapters",
        "Clean Architecture",
        "Onion Architecture",
        "Modular Monolith",
        "Microservices",
        "Event-Driven Architecture",
        "Event Sourcing",
        "CQRS",
        "Serverless",
        "Pipeline / Pipes and Filters",
        "Plugin Architecture",
        "Microkernel",
        "Backend for Frontend (BFF)",
        "API Gateway",
        "Strangler Fig",
        "MVC",
        "MVP",
        "MVVM",
        "Islands Architecture",
    ],
    "references/domain-data-patterns.md": [
        "Domain-Driven Design",
        "Bounded Context",
        "Anti-Corruption Layer (ACL)",
        "Entity",
        "Value Object",
        "Aggregate and Aggregate Root",
        "Domain Service",
        "Application Service",
        "Domain Event",
        "Specification",
        "Repository",
        "Data Access Object (DAO)",
        "Data Mapper",
        "Unit of Work",
        "Identity Map",
        "Lazy Load",
        "Data Transfer Object (DTO)",
    ],
    "references/distributed-concurrency.md": [
        "Producer–Consumer",
        "Work Queue",
        "Competing Consumers",
        "Publish–Subscribe",
        "Dead-Letter Queue (DLQ)",
        "Backpressure / Bounded Buffer",
        "Thread Pool",
        "Actor Model",
        "Reactor",
        "Futures / Promises",
        "Structured Concurrency",
        "Mutex",
        "Semaphore",
        "Immutable Data",
        "Optimistic Locking",
        "Pessimistic Locking",
        "Timeout / Deadline",
        "Retry with Exponential Backoff and Jitter",
        "Circuit Breaker",
        "Bulkhead",
        "Idempotency",
        "Transactional Outbox",
        "Saga",
        "Distributed Transaction / Two-Phase Commit",
        "Leader Election",
        "Service Discovery",
        "Cache-Aside",
        "Rate Limiting",
    ],
}

ALLOWED_FRONTMATTER_KEYS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
    "disable-model-invocation",
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def frontmatter(text: str, errors: list[str]) -> dict[str, str]:
    if not text.startswith("---\n"):
        fail(errors, "SKILL.md must start with YAML frontmatter")
        return {}
    end = text.find("\n---\n", 4)
    if end < 0:
        fail(errors, "SKILL.md frontmatter has no closing delimiter")
        return {}
    block = text[4:end]
    result: dict[str, str] = {}
    for line in block.splitlines():
        match = re.match(r"^([A-Za-z0-9_-]+):(?:\s*(.*))?$", line)
        if match:  # top-level only; indented metadata values do not match
            result[match.group(1)] = (match.group(2) or "").strip().strip('"\'')
    unknown = sorted(set(result) - ALLOWED_FRONTMATTER_KEYS)
    if unknown:
        fail(errors, f"unknown top-level frontmatter keys: {', '.join(unknown)}")
    return result


def markdown_headings(text: str) -> list[str]:
    in_fence = False
    headings: list[str] = []
    for line in text.splitlines():
        if re.match(r"^\s*(```|~~~)", line):
            in_fence = not in_fence
            continue
        if not in_fence:
            match = re.match(r"^#{1,6}\s+(.+?)\s*#*\s*$", line)
            if match:
                headings.append(match.group(1).strip())
    return headings


def heading_matches(actual: str, required: str) -> bool:
    return actual == required or actual.startswith(required + " —")


def validate_links(path: Path, text: str, errors: list[str]) -> None:
    # Images are also accepted by the same destination check.
    for match in re.finditer(r"!?\[[^\]]*\]\(([^)]+)\)", text):
        destination = match.group(1).strip().split()[0].strip("<>")
        if not destination or destination.startswith(("http://", "https://", "mailto:", "#")):
            continue
        file_part = destination.split("#", 1)[0]
        if not file_part:
            continue
        target = (path.parent / file_part).resolve()
        try:
            target.relative_to(ROOT.resolve())
        except ValueError:
            fail(errors, f"{path.relative_to(ROOT)}: link escapes skill root: {destination}")
            continue
        if not target.exists():
            fail(errors, f"{path.relative_to(ROOT)}: broken local link: {destination}")


def heading_sections(text: str) -> list[tuple[int, str, str]]:
    """Return heading level, title, and body while ignoring fenced examples."""
    lines = text.splitlines()
    records: list[tuple[int, int, str]] = []
    in_fence = False
    for index, line in enumerate(lines):
        if re.match(r"^\s*(```|~~~)", line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if match:
            records.append((index, len(match.group(1)), match.group(2).strip()))

    sections: list[tuple[int, str, str]] = []
    for position, (start, level, title) in enumerate(records):
        end = len(lines)
        for next_start, next_level, _ in records[position + 1 :]:
            if next_level <= level:
                end = next_start
                break
        sections.append((level, title, "\n".join(lines[start + 1 : end])))
    return sections


def validate_catalog_sections(relative: str, text: str, errors: list[str]) -> None:
    sections = heading_sections(text)
    required = REQUIRED_HEADINGS[relative]
    for expected in required:
        matches = [(title, body) for _, title, body in sections if heading_matches(title, expected)]
        if not matches:
            continue  # Missing headings are reported separately.
        title, body = matches[0]
        for field in CATALOG_FIELDS:
            if not re.search(rf"\*\*{re.escape(field)}:\*\*", body):
                fail(errors, f"{relative}: {title!r} is missing catalog field {field!r}")


def validate_evals(errors: list[str]) -> int:
    path = ROOT / "evals/evals.json"
    if not path.is_file():
        return 0
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(errors, f"evals/evals.json: invalid JSON: {exc}")
        return 0

    evals = document.get("evals") if isinstance(document, dict) else None
    if not isinstance(evals, list) or not evals:
        fail(errors, "evals/evals.json: 'evals' must be a non-empty list")
        return 0

    ids: list[str] = []
    seen_tags: set[str] = set()
    for index, case in enumerate(evals):
        label = f"evals/evals.json: eval #{index + 1}"
        if not isinstance(case, dict):
            fail(errors, f"{label} must be an object")
            continue
        eval_id = case.get("id")
        if not isinstance(eval_id, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", eval_id):
            fail(errors, f"{label} has an invalid id {eval_id!r}")
        else:
            ids.append(eval_id)
        prompt = case.get("prompt")
        if not isinstance(prompt, str) or len(prompt.strip()) < 40:
            fail(errors, f"{label} must have a substantive prompt")
        tags = case.get("tags")
        if not isinstance(tags, list) or not tags or not all(isinstance(tag, str) and tag for tag in tags):
            fail(errors, f"{label} must have non-empty string tags")
        else:
            seen_tags.update(tags)
        expectations = case.get("expectations")
        if (
            not isinstance(expectations, list)
            or len(expectations) < 3
            or not all(isinstance(item, str) and len(item.strip()) >= 20 for item in expectations)
        ):
            fail(errors, f"{label} must have at least three substantive expectations")

    duplicate_ids = [eval_id for eval_id, count in Counter(ids).items() if count > 1]
    if duplicate_ids:
        fail(errors, f"evals/evals.json: duplicate ids: {', '.join(sorted(duplicate_ids))}")
    missing_tags = sorted(REQUIRED_EVAL_TAGS - seen_tags)
    if missing_tags:
        fail(errors, f"evals/evals.json: missing required coverage tags: {', '.join(missing_tags)}")
    return len(evals)


def main() -> int:
    errors: list[str] = []

    for relative in sorted(REQUIRED_FILES):
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size == 0:
            fail(errors, f"missing or empty required file: {relative}")

    if not SKILL.is_file():
        print("FAIL: SKILL.md is missing", file=sys.stderr)
        return 1

    skill_text = SKILL.read_text(encoding="utf-8")
    meta = frontmatter(skill_text, errors)
    name = meta.get("name", "")
    description = meta.get("description", "")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) or len(name) > 64:
        fail(errors, f"invalid skill name: {name!r}")
    if name != ROOT.name:
        fail(errors, f"skill name {name!r} must match folder {ROOT.name!r}")
    if not description or len(description) > 1024:
        fail(errors, f"description must contain 1..1024 characters (found {len(description)})")
    if SKILL.stat().st_size > 12_000:
        fail(errors, f"SKILL.md exceeds compact-core budget: {SKILL.stat().st_size} > 12000 bytes")

    # Validate every Markdown file, so newly added references cannot bypass link checks.
    for path in sorted(ROOT.rglob("*.md")):
        relative = str(path.relative_to(ROOT))
        text = path.read_text(encoding="utf-8")
        validate_links(path, text, errors)
        headings = markdown_headings(text)
        duplicates = [heading for heading, count in Counter(headings).items() if count > 1]
        if duplicates:
            fail(errors, f"{relative}: duplicate headings: {', '.join(duplicates)}")

    for relative, required in REQUIRED_HEADINGS.items():
        path = ROOT / relative
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        actual = markdown_headings(text)
        for expected in required:
            if not any(heading_matches(heading, expected) for heading in actual):
                fail(errors, f"{relative}: missing required heading {expected!r}")
        validate_catalog_sections(relative, text, errors)

    # Progressive disclosure: route top-level runtime material from the core and
    # individual worked examples from their index.
    for relative in sorted(CORE_ROUTES):
        if relative not in skill_text:
            fail(errors, f"SKILL.md does not route to {relative}")
    examples_index = ROOT / "examples/README.md"
    if examples_index.exists():
        index_text = examples_index.read_text(encoding="utf-8")
        for example in sorted((ROOT / "examples").glob("*.md")):
            if example.name != "README.md" and example.name not in index_text:
                fail(errors, f"examples/README.md does not route to examples/{example.name}")

    eval_total = validate_evals(errors)

    if errors:
        print(f"FAIL: {len(errors)} validation error(s)", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    heading_total = sum(len(items) for items in REQUIRED_HEADINGS.values())
    markdown_total = sum(1 for _ in ROOT.rglob("*.md"))
    print(
        "PASS: skill structure, frontmatter, progressive routes, all local links, "
        f"{heading_total} complete catalog entries, {eval_total} behavioral eval schemas, "
        f"and {markdown_total} Markdown files validated"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
