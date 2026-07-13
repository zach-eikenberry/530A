"""Independent reference implementation of packages/engine (§11.1).

Mirrors the TypeScript engine OPERATION-FOR-OPERATION so results match to
the cent, bit-for-bit:
- money is integer cents; balances quantized round-half-to-even each month
- ln/exp are the same software implementations (same constants, same Horner
  order, same term counts) — Python floats are IEEE-754 doubles and +,-,*,/
  and sqrt are correctly rounded, so identical operation order gives
  identical bits
- the PRNG is the same xoshiro128** / splitmix32 with the same draw order

Any divergence from packages/engine/src is a bug in one of the two.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

# --- deterministic math (mirrors detmath.ts) --------------------------------

LN2 = 0.6931471805599453
LN2_HI = 0.6931471803691238
LN2_LO = 1.9082149292705877e-10

_LN_COEFFS = [1.0 / (2 * n + 1) for n in range(16)]

_EXP_COEFFS = [1.0]
for _n in range(1, 27):
    _EXP_COEFFS.append(_EXP_COEFFS[_n - 1] / _n)


def pow2(k: int) -> float:
    result = 1.0
    base = 0.5 if k < 0 else 2.0
    n = abs(k)
    while n > 0:
        if n & 1:
            result *= base
        base *= base
        n >>= 1
    return result


def det_ln(x: float) -> float:
    if not (x > 0) or math.isinf(x):
        raise ValueError(f"det_ln requires x > 0, got {x}")
    bits = struct.unpack(">Q", struct.pack(">d", x))[0]
    raw_exp = (bits >> 52) & 0x7FF
    if raw_exp == 0:
        raise ValueError(f"det_ln does not support subnormal {x}")
    e = raw_exp - 1023
    m = x * pow2(-e)
    if m > 1.4142135623730951:
        m *= 0.5
        e += 1
    z = (m - 1) / (m + 1)
    z2 = z * z
    s = _LN_COEFFS[-1]
    for i in range(len(_LN_COEFFS) - 2, -1, -1):
        s = s * z2 + _LN_COEFFS[i]
    return e * LN2 + 2 * z * s


def det_exp(x: float) -> float:
    if math.isnan(x) or abs(x) > 700:
        raise ValueError(f"det_exp requires finite |x| <= 700, got {x}")
    k = math.floor(x / LN2 + 0.5)
    r = x - k * LN2_HI - k * LN2_LO
    s = _EXP_COEFFS[-1]
    for i in range(len(_EXP_COEFFS) - 2, -1, -1):
        s = s * r + _EXP_COEFFS[i]
    return s * pow2(k)


# --- money (mirrors money.ts) ------------------------------------------------

def round_half_to_even(x: float) -> int:
    fl = math.floor(x)
    frac = x - fl
    if frac > 0.5:
        return fl + 1
    if frac < 0.5:
        return fl
    return fl if fl % 2 == 0 else fl + 1


# --- PRNG (mirrors prng.ts) ---------------------------------------------------

MASK32 = 0xFFFFFFFF


def _rotl(x: int, k: int) -> int:
    return ((x << k) | (x >> (32 - k))) & MASK32


class Xoshiro128StarStar:
    def __init__(self, seed: int) -> None:
        if seed < 0 or seed > MASK32:
            raise ValueError("seed must be a uint32")
        s = seed & MASK32
        state = []
        for _ in range(4):
            s = (s + 0x9E3779B9) & MASK32
            z = s
            z = ((z ^ (z >> 16)) * 0x21F0AAAD) & MASK32
            z = ((z ^ (z >> 15)) * 0x735A2D97) & MASK32
            state.append((z ^ (z >> 15)) & MASK32)
        self.s0, self.s1, self.s2, self.s3 = state
        if (self.s0 | self.s1 | self.s2 | self.s3) == 0:
            self.s3 = 1
        self._spare: Optional[float] = None

    def next_uint32(self) -> int:
        result = (_rotl((self.s1 * 5) & MASK32, 7) * 9) & MASK32
        t = (self.s1 << 9) & MASK32
        self.s2 ^= self.s0
        self.s3 ^= self.s1
        self.s1 ^= self.s2
        self.s0 ^= self.s3
        self.s2 ^= t
        self.s3 = _rotl(self.s3, 11)
        return result

    def next_uniform53(self) -> float:
        hi = self.next_uint32() >> 5
        lo = self.next_uint32() >> 6
        return (hi * 67108864 + lo) / 9007199254740992

    def next_normal(self) -> float:
        if self._spare is not None:
            v = self._spare
            self._spare = None
            return v
        while True:
            u = 2 * self.next_uniform53() - 1
            v = 2 * self.next_uniform53() - 1
            s = u * u + v * v
            if 0 < s < 1:
                mult = math.sqrt((-2 * det_ln(s)) / s)
                self._spare = v * mult
                return u * mult


# --- scenario / schedule (mirrors types.ts + schedule.ts) ---------------------

@dataclass
class Schedule:
    type: str  # 'monthly' | 'annual' | 'once'
    amount_cents: int
    start_age_months: int = 0
    end_age_months: int = 0
    month_of_year: int = 0
    at_age_months: int = 0


@dataclass
class Source:
    id: str
    kind: str  # 'family' | 'relative' | 'charity' | 'employer'
    schedule: Schedule
    step_up_rate: float = 0.0


@dataclass
class Rules:
    seed_cents: int = 100_000
    seed_birth_window: Tuple[str, str] = ("2025-01-01", "2028-12-31")
    annual_cap_cents: int = 500_000
    employer_annual_cap_cents: int = 250_000
    contribution_floor: str = "2026-07-04"


@dataclass
class Scenario:
    as_of: str
    birth_date: str
    include_seed: bool
    sources: List[Source]
    annual_return: float
    return_is_real: bool
    annual_inflation: float
    annual_fee: float
    annual_volatility: float
    target_age_months: int
    rules: Rules = field(default_factory=Rules)


def _parse_ym(iso: str) -> Tuple[int, int]:
    y, m, _ = iso.split("-")
    return int(y), int(m)


def _months_between(a: Tuple[int, int], b: Tuple[int, int]) -> int:
    return (b[0] - a[0]) * 12 + (b[1] - a[1])


def _add_months(a: Tuple[int, int], n: int) -> Tuple[int, int]:
    total = a[0] * 12 + (a[1] - 1) + n
    return total // 12, (total % 12) + 1


def _stepped(base: int, rate: float, year_index: int) -> int:
    amount = base
    for _ in range(year_index):
        amount = round_half_to_even(amount * (1 + rate))
    return amount


def _desired(source: Source, age_months: int, calendar_month: int) -> int:
    sc = source.schedule
    if sc.type == "monthly":
        if age_months < sc.start_age_months or age_months >= sc.end_age_months:
            return 0
        return _stepped(sc.amount_cents, source.step_up_rate, (age_months - sc.start_age_months) // 12)
    if sc.type == "annual":
        if age_months < sc.start_age_months or age_months >= sc.end_age_months:
            return 0
        if calendar_month != sc.month_of_year:
            return 0
        return _stepped(sc.amount_cents, source.step_up_rate, (age_months - sc.start_age_months) // 12)
    return sc.amount_cents if age_months == sc.at_age_months else 0


def build_contribution_stream(s: Scenario):
    as_of = _parse_ym(s.as_of)
    birth = _parse_ym(s.birth_date)
    floor = _parse_ym(s.rules.contribution_floor)

    start_age = _months_between(birth, as_of)
    assert 0 <= start_age < s.target_age_months
    months = s.target_age_months - start_age

    seed_eligible = (
        s.include_seed
        and s.rules.seed_birth_window[0] <= s.birth_date <= s.rules.seed_birth_window[1]
    )

    contributions: List[int] = []
    warnings: List[dict] = []
    cap_year = as_of[0]
    used_annual = 0
    used_employer = 0

    for t in range(months):
        cur = _add_months(as_of, t)
        age = start_age + t
        if cur[0] != cap_year:
            cap_year = cur[0]
            used_annual = 0
            used_employer = 0
        month_total = 0
        before_floor = cur[0] < floor[0] or (cur[0] == floor[0] and cur[1] < floor[1])
        if not before_floor:
            for source in s.sources:
                desired = _desired(source, age, cur[1])
                if desired == 0:
                    continue
                allowed = desired
                if source.kind == "employer":
                    room = max(s.rules.employer_annual_cap_cents - used_employer, 0)
                    if allowed > room:
                        warnings.append(
                            {"calendarYear": cur[0], "sourceId": source.id,
                             "excessCents": allowed - room, "cap": "employer"}
                        )
                        allowed = room
                room = max(s.rules.annual_cap_cents - used_annual, 0)
                if allowed > room:
                    warnings.append(
                        {"calendarYear": cur[0], "sourceId": source.id,
                         "excessCents": allowed - room, "cap": "annual"}
                    )
                    allowed = room
                if allowed > 0:
                    month_total += allowed
                    used_annual += allowed
                    if source.kind == "employer":
                        used_employer += allowed
        contributions.append(month_total)

    return months, start_age, contributions, (s.rules.seed_cents if seed_eligible else 0), warnings


def monthly_factors(s: Scenario) -> Tuple[float, float, float]:
    annual_nominal = (
        (1 + s.annual_return) * (1 + s.annual_inflation) - 1
        if s.return_is_real
        else s.annual_return
    )
    g = det_exp(det_ln(1 + annual_nominal) / 12)
    f = det_exp(det_ln(1 - s.annual_fee) / 12)
    d = det_exp(det_ln(1 + s.annual_inflation) / 12)
    return g, f, d


def project(s: Scenario) -> dict:
    months, start_age, contributions, seed_cents, warnings = build_contribution_stream(s)
    g, f, d = monthly_factors(s)

    nominal = [0] * (months + 1)
    real = [0] * (months + 1)
    balance = seed_cents
    contributed = 0
    deflator = 1.0
    nominal[0] = balance
    real[0] = balance

    for t in range(1, months + 1):
        c = contributions[t - 1]
        balance += c
        contributed += c
        balance = round_half_to_even(balance * g * f)
        deflator *= d
        nominal[t] = balance
        real[t] = round_half_to_even(balance / deflator)

    milestones = []
    for age in [18 * 12, 36 * 12, 72 * 12, s.target_age_months]:
        idx = age - start_age
        if idx < 0 or idx > months:
            continue
        if any(m["ageMonths"] == age for m in milestones):
            continue
        milestones.append(
            {"ageMonths": age, "nominalCents": nominal[idx], "realCents": real[idx]}
        )

    return {
        "months": months,
        "startAgeMonths": start_age,
        "nominalCents": nominal,
        "realCents": real,
        "milestones": milestones,
        "breakdown": {
            "contributedCents": contributed,
            "seedCents": seed_cents,
            "growthCents": nominal[months] - contributed - seed_cents,
        },
        "warnings": warnings,
    }


PERCENTILES = [10, 25, 50, 75, 90]


def _percentile_nearest_rank(sorted_vals: List[float], p: int) -> float:
    n = len(sorted_vals)
    rank = math.ceil(p / 100 * n)
    idx = min(max(rank, 1), n) - 1
    return sorted_vals[idx]


def monte_carlo(s: Scenario, seed: int, paths: int) -> dict:
    months, start_age, contributions, seed_cents, _ = build_contribution_stream(s)
    g, f, d = monthly_factors(s)

    annual_nominal = (
        (1 + s.annual_return) * (1 + s.annual_inflation) - 1
        if s.return_is_real
        else s.annual_return
    )
    mu_m = det_ln(1 + annual_nominal) / 12
    sigma_m = s.annual_volatility / math.sqrt(12)
    drift = mu_m - (sigma_m * sigma_m) / 2

    sample_idx = [
        t for t in range(months + 1) if (start_age + t) % 12 == 0 or t == months
    ]

    rng = Xoshiro128StarStar(seed)
    balances = [float(seed_cents)] * paths
    samples: List[List[float]] = []
    s_i = 0
    if sample_idx[0] == 0:
        samples.append(list(balances))
        s_i = 1

    deflators = [1.0] * (months + 1)
    deflator = 1.0
    for t in range(1, months + 1):
        deflator *= d
        deflators[t] = deflator

    for t in range(1, months + 1):
        c = float(contributions[t - 1])
        for p in range(paths):
            z = rng.next_normal()
            factor = det_exp(drift + sigma_m * z) * f
            grown = (balances[p] + c) * factor
            fl = math.floor(grown)
            frac = grown - fl
            if frac > 0.5:
                q = fl + 1
            elif frac < 0.5:
                q = fl
            else:
                q = fl if fl % 2 == 0 else fl + 1
            balances[p] = float(q)
        if s_i < len(sample_idx) and sample_idx[s_i] == t:
            samples.append(list(balances))
            s_i += 1

    pct: List[List[int]] = [[] for _ in PERCENTILES]
    pct_real: List[List[int]] = [[] for _ in PERCENTILES]
    for j, t in enumerate(sample_idx):
        vals = sorted(samples[j])
        for i, p in enumerate(PERCENTILES):
            v = _percentile_nearest_rank(vals, p)
            pct[i].append(int(v))
            pct_real[i].append(round_half_to_even(v / deflators[t]))

    return {
        "seed": seed,
        "paths": paths,
        "months": months,
        "startAgeMonths": start_age,
        "sampleAgesMonths": [start_age + t for t in sample_idx],
        "percentileCents": pct,
        "percentileRealCents": pct_real,
    }
