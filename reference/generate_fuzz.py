"""Generate the cross-language fuzz corpus (reference/fixtures/fuzz.json).

300 randomized scenarios (seeded PRNG → reproducible) spanning the full
input space: ages 0–119, every schedule type, cap collisions, step-ups,
seed eligibility windows, fee/inflation/return extremes. The TypeScript
engine must match every one TO THE CENT. Run:

    python3 reference/generate_fuzz.py
"""

from __future__ import annotations

import json
import os
import random

from engine_ref import Rules, Scenario, Schedule, Source, project

rng = random.Random(530530)

KINDS = ["family", "relative", "charity", "employer"]


def random_source(i: int, start_age: int, target_age: int) -> Source:
    kind = rng.choice(KINDS)
    stype = rng.choice(["monthly", "annual", "once"])
    amount = rng.choice([100, 2_500, 10_000, 25_000, 41_700, 100_000, 500_000, 700_000])
    step_up = rng.choice([0.0, 0.0, 0.0, 0.03, 0.05, 1.0])
    lo = rng.randint(0, max(target_age - 2, 1))
    hi = rng.randint(lo + 1, target_age)
    if stype == "monthly":
        sched = Schedule(type="monthly", amount_cents=amount, start_age_months=lo, end_age_months=hi)
    elif stype == "annual":
        sched = Schedule(
            type="annual", amount_cents=amount, month_of_year=rng.randint(1, 12),
            start_age_months=lo, end_age_months=hi,
        )
    else:
        sched = Schedule(type="once", amount_cents=amount, at_age_months=rng.randint(start_age, target_age - 1))
    return Source(id=f"s{i}", kind=kind, schedule=sched, step_up_rate=step_up)


def random_scenario() -> Scenario:
    # Birth 2015–2028 exercises both sides of the seed window
    birth_year = rng.randint(2015, 2028)
    birth = f"{birth_year}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    # asOf within a couple years of "launch", always after birth
    as_of_year = max(birth_year, 2026) + rng.randint(0, 2)
    as_of = f"{as_of_year}-{rng.randint(1, 12):02d}-15"
    if as_of <= birth:
        as_of = f"{birth_year + 1}-06-15"
    start_age = (int(as_of[:4]) - birth_year) * 12 + (int(as_of[5:7]) - int(birth[5:7]))
    target_age = rng.choice([start_age + 1, 18 * 12, 36 * 12, 65 * 12, 72 * 12, 119 * 12])
    if target_age <= start_age:
        target_age = start_age + rng.randint(1, 600)
    target_age = min(target_age, 119 * 12)

    n_sources = rng.randint(0, 4)
    return Scenario(
        as_of=as_of,
        birth_date=birth,
        include_seed=rng.random() < 0.8,
        sources=[random_source(i, start_age, target_age) for i in range(n_sources)],
        annual_return=rng.choice([0.0, 0.03, 0.07, 0.096, 0.12, -0.02]),
        return_is_real=rng.random() < 0.5,
        annual_inflation=rng.choice([0.0, 0.02, 0.025, 0.04, 0.08]),
        annual_fee=rng.choice([0.0, 0.0003, 0.005, 0.0095]),
        annual_volatility=rng.choice([0.0, 0.10, 0.15, 0.22]),
        target_age_months=target_age,
        rules=Rules(),
    )


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
    cases = []
    for _ in range(300):
        s = random_scenario()
        p = project(s)
        cases.append(
            {
                "scenario": scenario_json(s),
                "months": p["months"],
                "finalNominalCents": str(p["nominalCents"][p["months"]]),
                "finalRealCents": str(p["realCents"][p["months"]]),
                "contributedCents": str(p["breakdown"]["contributedCents"]),
                "seedCents": str(p["breakdown"]["seedCents"]),
                "growthCents": str(p["breakdown"]["growthCents"]),
                "warningCount": len(p["warnings"]),
                "excessTotalCents": str(sum(w["excessCents"] for w in p["warnings"])),
                "midpointNominalCents": str(p["nominalCents"][p["months"] // 2]),
            }
        )
    fixtures_dir = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    path = os.path.join(fixtures_dir, "fuzz.json")
    with open(path, "w") as fh:
        json.dump({"generator": "reference/generate_fuzz.py", "cases": cases}, fh, indent=0)
        fh.write("\n")
    print(f"wrote {path} ({len(cases)} cases)")


if __name__ == "__main__":
    main()
