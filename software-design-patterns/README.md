# Software Design Patterns

A small knowledge skill that makes AI coding agents apply SOLID and the right design pattern to each problem, and keeps them from overengineering.

## How it works

- `SKILL.md` has about 90 lines and holds the enforced rules plus a **symptom → pattern router**. The agent reads it once.
- Each reference file has fewer than 120 lines. The agent opens one only when it needs a pattern's Use / Avoid / Shape / Pitfalls.

```text
software-design-patterns/
├── SKILL.md                  # Rules, symptom→pattern router, red flags
└── references/
    ├── solid.md              # OOP, UML notation, SRP/OCP/LSP/ISP/DIP
    ├── creational.md         # Singleton, Builder, Factory, Abstract Factory, Prototype (+DI, Pool)
    ├── structural.md         # Adapter, Decorator, Proxy, Composite, Facade, Flyweight, Bridge
    ├── behavioral.md         # Memento, Observer, Strategy, Command, Template Method, Iterator,
    │                         # State, Mediator, Chain of Responsibility, Visitor, Interpreter, Null Object
    ├── decisions.md          # Confusable pairs + ride-sharing app worked refactor
    └── architecture.md       # Layered/Hexagonal, DDD, Outbox, Saga, resilience, concurrency
```

## What the agent must do

1. Apply SOLID to any code it adds or changes.
2. Name the symptom before using a pattern. If there is no symptom, it uses no pattern.
3. Try the simplest option first: a function, a map, an enum, or composition.
4. Add an abstraction only when there are two or more implementations or a real boundary.
5. In reviews, flag both missing patterns and patterns that aren't justified.

## Install

```bash
npx github:Pankil02/AgentSkills install software-design-patterns --symlink
# or
npx skills@latest add Pankil02/AgentSkills --skill software-design-patterns
```

## Verify

```bash
npm run validate   # frontmatter schema
npm test
```

Try this manually: ask an agent to "add a new ride type to the fare calculator." It should introduce a Strategy map and should not extend the `switch`. Then ask it to "add a helper for a single constant." It should add no pattern.

## License

MIT
