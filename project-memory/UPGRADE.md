# Upgrade

## 2.1.0 (Entry Points & Fact Catalog)

Project Memory 2.1.0 introduces continuous entry points derived from a single typed catalog (`.memory/.meta/entrypoints.json`), task routing (`memory route`), strict quality rubric (`memory validate --entrypoints --quality`), and human instruction review (`memory agents-sync --review`).

- **Migration**: None required. Existing 0.3 bundles automatically generate the `.meta/entrypoints.json` catalog upon the next `memory sync` or `memory agents-sync`.
- **Reference**: [`skills/memory/references/entrypoints.md`](skills/memory/references/entrypoints.md) and [`skills/memory/references/maintenance.md`](skills/memory/references/maintenance.md).

---

## 2.0.0 (Bundle format 0.3)

Project Memory 2.0 (bundle format 0.3) removes goal and task tracking and adds conventions, decisions, and a filtered log.

```sh
memory migrate --dry-run
memory migrate
memory validate
```

Legacy `goal.md` / `progress.md` / `tasks.md` are archived verbatim to `.memory/archive/legacy/`; nothing is deleted. Full guide: [`skills/memory/references/upgrade.md`](skills/memory/references/upgrade.md).
