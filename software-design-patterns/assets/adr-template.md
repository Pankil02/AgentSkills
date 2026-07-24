# ADR-NNN: Decision title

- **Status:** proposed | accepted | superseded | rejected
- **Date:** YYYY-MM-DD
- **Owners:** team or role
- **Scope:** module/system and affected contracts

## Context and evidence

Describe the required behavior, invariants, observed pain, quality attributes, ownership, scale, deployment and failure constraints. Link measurements, incidents, code locations, and compatibility promises. Mark assumptions and unknowns.

## Decision

State the selected pattern/style—or “no new pattern”—and its exact boundary, dependency direction, state/resource owner, and lifecycle. Explain why this is the minimum sufficient design.

## Alternatives considered

For each serious alternative, record the force it fails or the unnecessary cost it adds. Include the current/no-pattern baseline.

## Consequences

Record benefits and costs: coupling, testability, latency, consistency, capacity, security, operational burden, and skills required. Include risks and intentional constraints.

## Migration and compatibility

List incremental slices, source of truth, contract/schema versioning, data movement, coexistence, decommission criteria, and owner. Preserve externally visible behavior unless a versioned change is intentional.

## Verification and fitness functions

Define tests, dependency rules, performance/capacity checks, failure injection, telemetry, SLOs, and review dates that show the decision still works.

## Rollout and rollback

Define feature/configuration gates, observation window, alerts, reconciliation, fallback, and the point after which rollback requires a forward migration.
