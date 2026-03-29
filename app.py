"""
app.py
──────
BlastSeq — single entry point.
Flask serves the frontend HTML at GET /
and all API endpoints at /api/...

Run:
    python app.py
    pip install flask flask-cors
    → open http://localhost:5000
"""

import logging
import traceback
import os
import sys

from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

# ── Path setup so 'models' package is importable ────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from optimizer       import BlastOptimizer
from ppv_model       import PPVModel, PPV_LIMITS
from firing_sequence import FiringSequence, STANDARD_DELAYS
from blast_geometry  import BlastGeometry

# ── App ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(
    __name__,
    template_folder="templates",   # index.html lives here
    static_folder="static",        # JS / CSS live here
    static_url_path="/static",
)
CORS(app)   # allow all origins (fine for local dev)


# ════════════════════════════════════════════════════════════════
# FRONTEND ROUTES  — serve the web app
# ════════════════════════════════════════════════════════════════

@app.get("/")
def index():
    """Serve the main web app."""
    return render_template("index.html")


# ════════════════════════════════════════════════════════════════
# API ROUTES
# ════════════════════════════════════════════════════════════════

def bad_request(message: str, details: str = ""):
    return jsonify({"error": message, "details": details}), 400

def server_error(message: str, details: str = ""):
    return jsonify({"error": message, "details": details}), 500


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "BlastSeq"})


@app.get("/api/delays")
def get_delays():
    from .firing_sequence import select_row_delay
    return jsonify({
        "standard_delays": STANDARD_DELAYS,
        "row_delay_map": {d: select_row_delay(d) for d in STANDARD_DELAYS},
    })


@app.get("/api/explosives")
def get_explosives():
    return jsonify({
        "explosives": list(BlastGeometry.EXPLOSIVES.keys()),
        "densities":  BlastGeometry.EXPLOSIVES,
    })


@app.post("/api/optimise")
def optimise():
    """
    Full blast optimisation pipeline.

    Body (JSON):
        production_tonnes, diameter_mm, rock_density, bench_depth,
        num_benches, hole_delay_ms, ppv_distance_m, K, alpha,
        explosive_type (opt), preferred_pattern (opt)
    """
    try:
        data = request.get_json(force=True)
        logger.info("POST /api/optimise | %s", data)

        required = [
            "production_tonnes", "diameter_mm", "rock_density",
            "bench_depth", "num_benches", "hole_delay_ms",
            "ppv_distance_m", "K", "alpha",
        ]
        missing = [k for k in required if k not in data]
        if missing:
            return bad_request(f"Missing fields: {missing}")

        hole_delay_ms = int(data["hole_delay_ms"])
        if hole_delay_ms not in STANDARD_DELAYS:
            return bad_request(f"hole_delay_ms must be one of {STANDARD_DELAYS}")

        optimizer = BlastOptimizer(
            production_tonnes = float(data["production_tonnes"]),
            diameter_mm       = float(data["diameter_mm"]),
            rock_density      = float(data["rock_density"]),
            bench_depth       = float(data["bench_depth"]),
            num_benches       = int(data["num_benches"]),
            hole_delay_ms     = hole_delay_ms,
            ppv_distance_m    = float(data["ppv_distance_m"]),
            K                 = float(data["K"]),
            alpha             = float(data["alpha"]),
            explosive_type    = data.get("explosive_type", "ANFO"),
            preferred_pattern = data.get("preferred_pattern", "auto"),
        )
        return jsonify(optimizer.to_dict())

    except ValueError as e:
        logger.warning("Validation error: %s", e)
        return bad_request("Validation error", str(e))
    except Exception as e:
        logger.error("Optimiser crashed:\n%s", traceback.format_exc())
        return server_error("Optimisation failed", str(e))


@app.post("/api/pattern")
def single_pattern():
    """Switch to a single pattern without full re-optimisation."""
    try:
        data = request.get_json(force=True)
        seq  = FiringSequence(
            rows            = int(data["rows"]),
            cols            = int(data["cols"]),
            pattern         = data["pattern"],
            hole_delay_ms   = int(data["hole_delay_ms"]),
            charge_per_hole = float(data["charge_per_hole"]),
        )
        ppv_result = PPVModel(
            K          = float(data["K"]),
            alpha      = float(data["alpha"]),
            distance_m = float(data["ppv_distance_m"]),
        ).predict(seq.mcpd)

        return jsonify({**seq.to_dict(), "ppv": ppv_result})

    except ValueError as e:
        return bad_request("Invalid parameters", str(e))
    except Exception as e:
        logger.error("Pattern error: %s", e)
        return server_error("Pattern computation failed", str(e))


@app.get("/api/ppv-curve")
def ppv_curve():
    """PPV vs distance points for a given MCPD, K, alpha."""
    try:
        import math
        mcpd  = float(request.args["mcpd"])
        K     = float(request.args["K"])
        alpha = float(request.args["alpha"])
        max_d = int(request.args.get("max_dist", 1000))

        points = [
            {"distance_m": d, "ppv_mm_s": round(K * ((d / math.sqrt(mcpd)) ** -alpha), 3)}
            for d in range(50, max_d + 1, 25)
        ]
        return jsonify({"mcpd": mcpd, "K": K, "alpha": alpha,
                        "points": points, "limits": PPV_LIMITS})

    except (KeyError, ValueError) as e:
        return bad_request("Invalid query params", str(e))


# ── Start ────────────────────────────────────────────────────────
if __name__ == "__main__":
    print()
    print("=" * 52)
    print("  BlastSeq — http://localhost:5000")
    print("  Open that URL in your browser.")
    print("=" * 52)
    print()
    app.run(debug=True, host="0.0.0.0", port=8000)
