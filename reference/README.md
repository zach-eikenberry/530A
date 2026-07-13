# Reference implementation (Phase 1)

Independent Python reimplementation of the `packages/engine` math (§9 of the brief).

- Mirrors the exact numeric contract: integer cents, float64 growth factors,
  round-half-to-even quantization every monthly step.
- Regenerates the golden vectors in `fixtures/` (inputs → expected cents at each
  step/milestone, plus Monte-Carlo percentiles for fixed seeds).
- The TypeScript engine's golden-value tests must match these fixtures **to the cent**.

Built in Phase 1 alongside the engine.
