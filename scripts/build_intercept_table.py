#!/usr/bin/env python3
"""
Build an interceptor launch parameter lookup table.

For each scenario (distance_km, icbm_altitude_km, icbm_speed_km_s),
find the optimal launch pitch angle and pitch-over rate that results
in < 1 km miss distance.

Uses the same physics as the game:
- Gravity: GM / r^2
- Thrust: constant during burn phase
- No atmosphere (interceptors are exoatmospheric)

Output: JSON table that the game reads at runtime.
"""

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

# ── Constants (match game config) ──────────────────────────────────────
EARTH_RADIUS_KM = 6371.0
GM = 3.986004418e14  # m^3/s^2
SCALE_METERS = 1_000_000  # game scale: 1 unit = 1000 km

# NGI specs (Next Generation Interceptor)
NGI_THRUST_MPS2 = 50.0
NGI_BURN_TIME_S = 200.0
NGI_MAX_SPEED_KMS = 9.0

DT = 0.5  # simulation timestep (seconds)


def simulate_intercept(
    interceptor_pos_km,
    interceptor_vel_kms,
    icbm_pos_km,
    icbm_vel_kms,
    pitch_angle_deg,
    pitchover_rate_deg_s,
    thrust_mps2,
    burn_time_s,
    max_speed_kms,
    max_time_s=400.0,
):
    """
    Simulate an interceptor flight and return the minimum miss distance (km).

    The interceptor launches vertically, then pitches over toward the ICBM
    at the given rate. After burnout, it coasts.

    pitch_angle_deg: initial angle from vertical toward the ICBM (0 = straight up)
    pitchover_rate_deg_s: how fast the pitch increases per second
    """
    # Convert to meters
    ipos = np.array(interceptor_pos_km) * 1000.0
    ivel = np.array(interceptor_vel_kms) * 1000.0
    tpos = np.array(icbm_pos_km) * 1000.0
    tvel = np.array(icbm_vel_kms) * 1000.0

    t = 0.0
    min_dist_m = float("inf")

    while t < max_time_s:
        # Distance check
        diff = tpos - ipos
        dist_m = np.linalg.norm(diff)
        if dist_m < min_dist_m:
            min_dist_m = dist_m

        # If we passed closest approach after getting close, stop
        if dist_m > min_dist_m * 1.5 and min_dist_m < 50_000:
            break

        # ICBM: gravity only (ballistic)
        tr = np.linalg.norm(tpos)
        if tr < EARTH_RADIUS_KM * 1000:
            break  # ICBM hit ground
        tgrav = -GM / (tr * tr) * (tpos / tr)
        tvel = tvel + tgrav * DT
        tpos = tpos + tvel * DT

        # Interceptor: thrust + gravity
        ir = np.linalg.norm(ipos)
        if ir < EARTH_RADIUS_KM * 1000:
            # Hit ground — bad parameters
            return 999999.0

        igrav = -GM / (ir * ir) * (ipos / ir)

        if t < burn_time_s:
            # Compute thrust direction
            radial = ipos / ir  # up direction

            # Pitch angle increases over time
            current_pitch_deg = min(
                pitch_angle_deg + pitchover_rate_deg_s * t, 85.0
            )
            pitch_rad = math.radians(current_pitch_deg)

            # Horizontal direction: toward ICBM projected onto tangent plane
            to_target = tpos - ipos
            # Remove radial component
            horizontal = to_target - np.dot(to_target, radial) * radial
            h_norm = np.linalg.norm(horizontal)
            if h_norm > 1.0:
                horizontal = horizontal / h_norm
            else:
                # Fallback: any tangent direction
                horizontal = np.array([radial[1], -radial[0], 0.0])
                h_norm = np.linalg.norm(horizontal)
                if h_norm > 0:
                    horizontal = horizontal / h_norm

            # Thrust direction: blend vertical and horizontal based on pitch
            thrust_dir = (
                radial * math.cos(pitch_rad) + horizontal * math.sin(pitch_rad)
            )
            thrust_dir = thrust_dir / np.linalg.norm(thrust_dir)

            thrust_accel = thrust_dir * thrust_mps2
            ivel = ivel + (igrav + thrust_accel) * DT

            # Clamp speed
            speed = np.linalg.norm(ivel)
            if speed > max_speed_kms * 1000:
                ivel = ivel / speed * max_speed_kms * 1000
        else:
            # Coast phase — gravity only
            ivel = ivel + igrav * DT

        ipos = ipos + ivel * DT
        t += DT

    return min_dist_m / 1000.0  # return in km


def build_scenario(dist_km, alt_km, speed_kms, approach_angle_deg=0):
    """
    Build interceptor and ICBM initial conditions for a scenario.

    interceptor is at (EARTH_RADIUS + 0, 0, 0) — on the surface
    ICBM is at distance dist_km away, at altitude alt_km, moving toward
    the interceptor at speed_kms.
    """
    # Interceptor on surface
    ipos = np.array([EARTH_RADIUS_KM, 0.0, 0.0])
    ivel = np.array([0.0, 0.0, 0.0])  # stationary (ignoring Earth rotation for table)

    # ICBM position: dist_km away on the surface, at alt_km altitude
    angle_rad = dist_km / EARTH_RADIUS_KM  # central angle
    approach_rad = math.radians(approach_angle_deg)

    icbm_r = EARTH_RADIUS_KM + alt_km
    icbm_x = icbm_r * math.cos(angle_rad)
    icbm_y = icbm_r * math.sin(angle_rad) * math.cos(approach_rad)
    icbm_z = icbm_r * math.sin(angle_rad) * math.sin(approach_rad)
    tpos = np.array([icbm_x, icbm_y, icbm_z])

    # ICBM velocity: toward the interceptor (descending)
    # Direction: from ICBM toward interceptor, with a downward component
    to_interceptor = ipos - tpos
    to_interceptor = to_interceptor / np.linalg.norm(to_interceptor)

    # Add downward component (ICBM is descending)
    radial_at_icbm = tpos / np.linalg.norm(tpos)
    descent_dir = to_interceptor * 0.7 - radial_at_icbm * 0.3
    descent_dir = descent_dir / np.linalg.norm(descent_dir)

    tvel = descent_dir * speed_kms

    return ipos, ivel, tpos, tvel


def optimize_scenario(dist_km, alt_km, speed_kms):
    """Find optimal launch parameters for a scenario."""
    thrust = NGI_THRUST_MPS2
    burn = NGI_BURN_TIME_S
    max_speed = NGI_MAX_SPEED_KMS

    ipos, ivel, tpos, tvel = build_scenario(dist_km, alt_km, speed_kms)

    def objective(params):
        pitch_angle = params[0]
        pitchover_rate = params[1]
        miss_km = simulate_intercept(
            ipos, ivel, tpos, tvel,
            pitch_angle, pitchover_rate,
            thrust, burn, max_speed,
        )
        return miss_km

    best_result = None
    best_miss = float("inf")

    # Try multiple initial guesses
    for pitch0 in [5, 15, 30, 45, 60]:
        for rate0 in [0.5, 1.5, 3.0, 5.0]:
            try:
                result = minimize(
                    objective,
                    x0=[pitch0, rate0],
                    method="Nelder-Mead",
                    options={"maxiter": 200, "xatol": 0.1, "fatol": 0.1},
                )
                if result.fun < best_miss:
                    best_miss = result.fun
                    best_result = result
            except Exception:
                continue

    if best_result is None:
        return None

    return {
        "pitch_angle_deg": float(np.clip(best_result.x[0], 0, 85)),
        "pitchover_rate_deg_s": float(np.clip(best_result.x[1], 0, 10)),
        "miss_km": float(best_miss),
    }


def build_table():
    """Build the full lookup table."""
    distances = [200, 500, 1000, 2000, 3000, 4000, 6000, 8000]
    altitudes = [100, 300, 500, 800, 1200, 1800, 2500]
    speeds = [3.0, 4.0, 5.0, 6.0, 7.0, 8.0]

    table = []
    total = len(distances) * len(altitudes) * len(speeds)
    count = 0

    for dist in distances:
        for alt in altitudes:
            for speed in speeds:
                count += 1
                sys.stdout.write(
                    f"\r[NGI] {count}/{total} "
                    f"d={dist}km alt={alt}km v={speed}km/s ... "
                )
                sys.stdout.flush()

                result = optimize_scenario(dist, alt, speed)
                if result and result["miss_km"] < 50:
                    entry = {
                        "dist_km": dist,
                        "alt_km": alt,
                        "speed_kms": speed,
                        **result,
                    }
                    table.append(entry)
                    sys.stdout.write(f"miss={result['miss_km']:.1f}km ✓")
                else:
                    miss = result["miss_km"] if result else "FAIL"
                    sys.stdout.write(f"miss={miss}km ✗")

    print(f"\n\nGenerated {len(table)} entries for NGI")

    # Filter to only entries with < 5km miss
    good = [e for e in table if e["miss_km"] < 5]
    print(f"Entries with <5km miss: {len(good)}")
    ok = [e for e in table if e["miss_km"] < 1]
    print(f"Entries with <1km miss: {len(ok)}")

    return table


def main():
    print("Building NGI intercept lookup table...")
    ngi_table = build_table()

    output = {
        "ngi": ngi_table,
        "metadata": {
            "earth_radius_km": EARTH_RADIUS_KM,
            "gm": GM,
            "dt": DT,
            "ngi": {
                "thrust_mps2": NGI_THRUST_MPS2,
                "burn_time_s": NGI_BURN_TIME_S,
                "max_speed_kms": NGI_MAX_SPEED_KMS,
            },
        },
    }

    out_path = Path(__file__).parent.parent / "packages" / "app" / "public" / "data" / "intercept-table.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nTable written to {out_path}")
    print(f"NGI entries: {len(ngi_table)}")


if __name__ == "__main__":
    main()