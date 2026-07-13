"""Regenerate the golden vectors (reference/fixtures/golden.json).

Run:  python3 reference/generate_golden.py

The TypeScript engine's golden tests must match these EXACTLY, to the cent.
Cents are serialized as strings (they exceed JSON-safe integers at age 119).
"""

from __future__ import annotations

import json
import os

from engine_ref import Rules, Scenario, Schedule, Source, monte_carlo, project


def monthly(id_: str, cents: int, kind: str = "family", start: int = 0,
            end: int = 18 * 12, step_up: float = 0.0) -> Source:
    return Source(id=id_, kind=kind, step_up_rate=step_up,
                  schedule=Schedule(type="monthly", amount_cents=cents,
                                    start_age_months=start, end_age_months=end))


def base(**overrides) -> Scenario:
    params = dict(
        as_of="2026-07-12",
        birth_date="2026-01-15",
        include_seed=True,
        sources=[monthly("parent", 10_000)],
        annual_return=0.07,
        return_is_real=True,
        annual_inflation=0.025,
        annual_fee=0.0003,
        annual_volatility=0.15,
        target_age_months=72 * 12,
        rules=Rules(),
    )
    params.update(overrides)
    return Scenario(**params)


SCENARIOS = {
    "baseline-widget": base(),
    "zero-rates-age18": base(
        target_age_months=18 * 12, annual_return=0.0, return_is_real=False,
        annual_inflation=0.0, annual_fee=0.0,
    ),
    "cap-exceeding-two-sources": base(
        target_age_months=18 * 12,
        sources=[monthly("a", 30_000), monthly("b", 30_000)],
    ),
    "employer-overcap": base(
        target_age_months=18 * 12,
        sources=[monthly("emp", 30_000, kind="employer")],
    ),
    "step-up-3pct": base(
        target_age_months=18 * 12,
        sources=[monthly("p", 10_000, step_up=0.03)],
    ),
    "gifts-mix": base(
        target_age_months=36 * 12,
        sources=[
            monthly("parent", 5_000),
            Source(id="grandma", kind="relative",
                   schedule=Schedule(type="annual", amount_cents=20_000,
                                     month_of_year=1, start_age_months=0,
                                     end_age_months=18 * 12)),
            Source(id="baptism", kind="relative",
                   schedule=Schedule(type="once", amount_cents=50_000,
                                     at_age_months=12)),
        ],
    ),
    "no-seed-born-2024": base(
        birth_date="2024-06-15", target_age_months=18 * 12,
    ),
    "teen-start": base(
        birth_date="2009-03-10", include_seed=False, target_age_months=65 * 12,
        sources=[monthly("parent", 20_000, end=18 * 12)],
    ),
    "max-age-119": base(target_age_months=119 * 12, sources=[monthly("p", 41_666)]),
    "nominal-return": base(
        target_age_months=18 * 12, annual_return=0.096750, return_is_real=False,
    ),
}

MC_SCENARIOS = {
    "mc-baseline-18": (base(target_age_months=18 * 12), 42, 500),
    "mc-lump-sum": (
        base(
            include_seed=False,
            target_age_months=30,
            sources=[Source(id="lump", kind="family",
                            schedule=Schedule(type="once", amount_cents=400_000,
                                              at_age_months=6))],
            annual_return=0.07, return_is_real=False, annual_inflation=0.0,
            annual_fee=0.0,
        ),
        7,
        200,
    ),
}


def scenario_json(s: Scenario) -> dict:
    return {
        "asOf": s.as_of,
        "birthDate": s.birth_date,
        "includeSeed": s.include_seed,
        "annualReturn": s.annual_return,
        "returnIsReal": s.return_is_real,
        "annualInflation": s.annual_inflation,
        "annualFee": s.annual_fee,
        "annualVolatility": s.annual_volatility,
        "targetAgeMonths": s.target_age_months,
        "sources": [
            {
                "id": src.id,
                "kind": src.kind,
                "stepUpRate": src.step_up_rate,
                "schedule": {
                    "type": src.schedule.type,
                    "amountCents": str(src.schedule.amount_cents),
                    "startAgeMonths": src.schedule.start_age_months,
                    "endAgeMonths": src.schedule.end_age_months,
                    "monthOfYear": src.schedule.month_of_year,
                    "atAgeMonths": src.schedule.at_age_months,
                },
            }
            for src in s.sources
        ],
    }


def main() -> None:
    out = {"generator": "reference/generate_golden.py", "deterministic": {}, "monteCarlo": {}}

    for name, s in sorted(SCENARIOS.items()):
        p = project(s)
        # store every 12th month + final to keep fixtures compact
        sampled = {
            str(t): str(p["nominalCents"][t])
            for t in range(0, p["months"] + 1)
            if t % 12 == 0 or t == p["months"]
        }
        sampled_real = {
            str(t): str(p["realCents"][t])
            for t in range(0, p["months"] + 1)
            if t % 12 == 0 or t == p["months"]
        }
        out["deterministic"][name] = {
            "scenario": scenario_json(s),
            "months": p["months"],
            "startAgeMonths": p["startAgeMonths"],
            "nominalCentsByMonth": sampled,
            "realCentsByMonth": sampled_real,
            "milestones": [
                {"ageMonths": m["ageMonths"], "nominalCents": str(m["nominalCents"]),
                 "realCents": str(m["realCents"])}
                for m in p["milestones"]
            ],
            "breakdown": {k: str(v) for k, v in p["breakdown"].items()},
            "warningCount": len(p["warnings"]),
            "excessTotalCents": str(sum(w["excessCents"] for w in p["warnings"])),
        }

    for name, (s, seed, paths) in sorted(MC_SCENARIOS.items()):
        mc = monte_carlo(s, seed, paths)
        out["monteCarlo"][name] = {
            "scenario": scenario_json(s),
            "seed": seed,
            "paths": paths,
            "sampleAgesMonths": mc["sampleAgesMonths"],
            "percentileCents": [[str(v) for v in row] for row in mc["percentileCents"]],
            "percentileRealCents": [[str(v) for v in row] for row in mc["percentileRealCents"]],
        }

    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    path = os.path.join(fixtures_dir, "golden.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
