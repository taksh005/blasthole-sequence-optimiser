import math
import logging
logger = logging.getLogger(__name__)

PPV_LIMITS = [
    {
        "category":  "A",
        "structure": "Domestic houses / Kuchha brick & cement",
        "freq_low":  5,
        "freq_mid":  10,
        "freq_high": 15,
    },
    {
        "category":  "A",
        "structure": "Industrial buildings — RCC & framed structures",
        "freq_low":  10,
        "freq_mid":  20,
        "freq_high": 25,
    },
    {
        "category":  "A",
        "structure": "Historical & sensitive structures",
        "freq_low":  2,
        "freq_mid":  5,
        "freq_high": 10,
    },
    {
        "category":  "B",
        "structure": "Domestic houses / Kuchha brick & cement (owner)",
        "freq_low":  10,
        "freq_mid":  15,
        "freq_high": 25,
    },
    {
        "category":  "B",
        "structure": "Industrial buildings — RCC & framed (owner)",
        "freq_low":  15,
        "freq_mid":  25,
        "freq_high": 50,
    },
]
class PPVModel:
    def __init__(
            self,
            K: float,
            alpha: float,
            distance_m: float
    ):
        self.K = K
        self.alpha = alpha
        self.distance_m = distance_m

    def predict(self, mcpd_kg: float)->dict:
        scaled_dist = self.distance_m/math.sqrt(mcpd_kg)
        scaled_dist = round(scaled_dist,3)
        ppv = self.K*(scaled_dist**(-self.alpha))
        ppv = round(ppv,3)
        classification = self._classify(ppv)
        safe_mcpd = self._safe_mcpd_for_limit(50)
        distance_curve = self._ppv_distance_curve(mcpd_kg)

        logger.info(
            "PPV prediction: MCPD=%.1f kg | D=%.0f m | SD=%.2f | PPV=%.2f mm/s | %s",
            mcpd_kg, self.distance_m, scaled_dist, ppv, classification
        )

        return {
            "ppv_mm_s":        ppv,
            "scaled_distance": scaled_dist,
            "mcpd_kg":         mcpd_kg,
            "distance_m":      self.distance_m,
            "K":               self.K,
            "alpha":           self.alpha,
            "classification":  classification,
            "safe_mcpd_commercial": safe_mcpd,
            "limits":          PPV_LIMITS,
            "distance_curve":  distance_curve,
        }
    
    def _classify(self, ppv: float) -> dict:
    # Uses the most conservative limit (historical structures, <8Hz = 2 mm/s)
    # as the threshold for safe/unsafe classification
        if ppv < 2:
            return {"level": "Safe",     "color": "#1D9E75",
                    "description": "Below all IS 6922 limits including sensitive structures."}
        elif ppv < 5:
            return {"level": "Low risk", "color": "#1D9E75",
                    "description": "Safe for most structures. Monitor sensitive/historical structures."}
        elif ppv < 10:
            return {"level": "Moderate", "color": "#EF9F27",
                    "description": "Within industrial limits. Exceeds sensitive structure limits."}
        elif ppv < 25:
            return {"level": "High",     "color": "#E24B4A",
                    "description": "Exceeds domestic structure limits. Review blast design."}
        else:
            return {"level": "Extreme",  "color": "#E24B4A",
                    "description": "Exceeds all IS 6922 limits. Blast design must be revised."}
                
    def _safe_mcpd_for_limit(self, ppv_limit_mm_s: float) -> float:
        try:
            safe_w = (self.distance_m / ((ppv_limit_mm_s / self.K) ** (1 / self.alpha))) ** 2
            return round(safe_w, 2)
        except (ZeroDivisionError, ValueError):
            return 0.0

    def _ppv_distance_curve(self, mcpd_kg: float) -> list[dict]:
        points = []
        for d in range(50, 1001, 32):
            sd  = d / math.sqrt(mcpd_kg)
            ppv = round(self.K * (sd ** (-self.alpha)), 3)
            points.append({"distance_m": d, "ppv_mm_s": ppv, "scaled_dist": round(sd, 2)})
        return points

    def compare_patterns(self, pattern_results: list[dict]) -> list[dict]:
        compared = []
        for p in pattern_results:
            pred = self.predict(p["mcpd"])
            compared.append({
                "pattern":    p["pattern"],
                "mcpd":       p["mcpd"],
                "ppv_mm_s":   pred["ppv_mm_s"],
                "scaled_dist":pred["scaled_distance"],
                "risk":       pred["classification"]["level"],
            })
        return sorted(compared, key=lambda x: x["mcpd"])
