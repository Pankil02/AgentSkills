# Worked Design Decisions

These examples demonstrate the decision process, not templates to copy blindly. Match the repository's language, framework, naming, error model, and test style.

- [No pattern: keep an exhaustive TypeScript function](no-pattern-typescript.md) — a local variation that does not justify Strategy classes.
- [Adapter migration in TypeScript](adapter-migration-typescript.md) — preserve semantics while replacing a vendor boundary incrementally.
- [Idiomatic pattern forms](idiomatic-forms.md) — functions, protocols, ADTs, and native framework mechanisms instead of ceremonial classes.
- [Architecture evolution with Outbox](architecture-evolution-outbox.md) — establish a module boundary and reliable publication before considering service extraction.

For each example, notice the same sequence: evidence and forces, minimum decision, rejected alternative, incremental implementation, and verification.
