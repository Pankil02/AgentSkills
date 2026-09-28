# Upgrade

Project Memory 2.0 (bundle format 0.3) removes goal and task tracking and adds conventions, decisions, and a filtered log.

```sh
memory migrate --dry-run
memory migrate
memory validate
```

Legacy `goal.md` / `progress.md` / `tasks.md` are archived verbatim to `.memory/archive/legacy/`; nothing is deleted. Full guide: [`skills/memory/references/upgrade.md`](skills/memory/references/upgrade.md).
