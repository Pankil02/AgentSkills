# Deep Codebase Ingestion & Onboarding

Perform a comprehensive, deep-dive scan of an existing or mid-project codebase to populate `.memory/` as a complete project brain.

1. Activate the `project-memory` skill and read its initialization instructions.
2. Execute `memory init --deep` (or run Node on `scripts/memory.mjs init --deep`).
3. The deep scanner will automatically inspect:
   - Directory structure & monorepo packages (`apps/*`, `packages/*`, `src/features/*`).
   - Project manifests (`package.json`, `turbo.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, etc.).
   - Database schemas & models (Prisma, Drizzle, SQLAlchemy, migrations, SQL files).
   - Primary entry points & API route surfaces (`app/api`, `routes`, `controllers`).
   - Environment variable names (`.env.example`) without secret values.
4. Review generated `.memory/goal.md` and `.memory/index.md` for completeness and high token efficiency.
5. If the project goal is still in `draft` state, conduct the onboarding project interview.
6. Run `memory validate` to confirm wiki health.
