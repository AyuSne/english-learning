# Domain Docs

This repo uses a single-context layout: `GLOSSARY.md` at the repo root and ADRs under `docs/adr/`.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root for domain concepts and their names.
- **`docs/adr/`** for decisions relevant to the area being explored.

If these files do not exist, proceed silently. The `domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

```text
/
├── GLOSSARY.md
└── docs/
    └── adr/
        └── NNNN-decision-title.md
```

## Use the glossary's vocabulary

When naming a domain concept in an issue, spec, refactor proposal, hypothesis, or test, use the term defined in `GLOSSARY.md`.

If a needed concept is missing, check whether the project already uses another term; record a real gap for `domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain the conflict explicitly before changing the decision.
