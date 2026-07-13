# Reference implementation (Phase 1)

Independent Python reimplementation of the `packages/engine` math (§9 of the brief).

- Mirrors the exact numeric contract: integer cents, float64 growth factors,
  round-half-to-even quantization every monthly step.
- Regenerates the golden vectors in `fixtures/` (inputs → expected cents at each
  step/milestone, plus Monte-Carlo percentiles for fixed seeds).
- The TypeScript engine's golden-value tests must match these fixtures **to the cent**
  (deterministic scenarios) and **bit-for-bit** (Monte-Carlo percentiles) — possible
  because both implementations use the same software ln/exp with fixed operation order
  instead of platform libm.

Regenerate after any engine math change (then re-run the TS golden tests):

```sh
python3 reference/generate_golden.py
pnpm --filter @530a/engine test
```

Scenario matrix lives in `generate_golden.py` (`SCENARIOS` / `MC_SCENARIOS`); add new
edge cases there and in `packages/engine/test/golden.test.ts`'s sanity list.
