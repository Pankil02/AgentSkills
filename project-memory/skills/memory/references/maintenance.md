# Update workflow

## Compile sources into the wiki

When an approved source is new or changed:

1. fingerprint and register it;
2. extract important claims, entities, topics, decisions, requirements, and relationships;
3. find existing documents that own those subjects;
4. update an owning document or create the minimum focused document;
5. merge compatible evidence without duplicating excerpts;
6. preserve contradictions with both sources and ask before changing approved intent;
7. revise summaries into a current synthesis;
8. add useful cross-links and citations;
9. update source records, indexes, progress, and log;
10. validate before declaring integration complete.

The wiki is the normal read surface. Reopen raw sources only for changes, gaps, stale claims, contradictions, or high-confidence verification.

## Incremental update workflow

Observe → route → ask → confirm → apply → verify → record → continue.

Generated facts and indexes may update automatically. Goals, preferences, non-goals, acceptance criteria, and material contradiction resolutions require approval. Removed sources/scopes become stale or orphaned; do not delete them automatically.

Every update, mutation, and log append MUST adhere to strict token efficiency: keep sentences brief, omit fluff, use short telegraphic style, and avoid duplicating existing text.

## Progressive read

Read root `index.md`, route to the smallest relevant document set, then read matching goals/progress/history as needed. Consult source records for provenance. Do not load the whole bundle or re-read every raw source for a normal query.

## Recovery

Run `memory validate` before semantic repair. Rebuild generated indexes from documents and repository facts. Never reconstruct user intent by guessing. Invalid or duplicate markers require explicit repair. Use atomic writes and do not create Git commits automatically.
