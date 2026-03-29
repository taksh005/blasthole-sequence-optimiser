from blast_geometry    import BlastGeometry
from hole_distribution import HoleDistribution
from firing_sequence   import FiringSequence, STANDARD_DELAYS, select_row_delay
from ppv_model         import PPVModel
import logging
logger = logging.getLogger(__name__)


PATTERN_META = {
    "row": {
        "label":       "Row-to-Row",
        "description": "All holes in each row fire sequentially. Simple, predictable, "
                       "good for flat faces. Tends to have higher MCPD if rows are wide.",
        "pros":        ["Simple delay assignment", "Good face control", "Predictable muck pile"],
        "cons":        ["Higher MCPD for wide rows", "Less burden relief"],
    },
    "diagonal": {
        "label":       "Diagonal (Echelon)",
        "description": "Holes on the same anti-diagonal fire simultaneously. Each diagonal "
                       "advances by one hole delay. Excellent burden relief and fragmentation.",
        "pros":        ["Best burden relief", "Good fragmentation", "Low MCPD for square grids"],
        "cons":        ["Complex detonator numbering", "Longer blast duration"],
    },
    "v_shape": {
        "label":       "V-Shape (Chevron)",
        "description": "Fires from the centre column outward. Creates a chevron wave front "
                       "that throws rock toward the centre, giving a compact muck pile.",
        "pros":        ["Compact muck pile", "Controlled throw direction", "Good fragmentation"],
        "cons":        ["Slightly higher MCPD on centre column", "Requires accurate centre marking"],
    },
}


class BlastOptimizer:
    PATTERNS = ["row", "diagonal", "v_shape"]

    def __init__(
        self,
        production_tonnes: float,
        diameter_mm: float,
        rock_density: float,
        bench_depth: float,
        num_benches: int,
        hole_delay_ms: int,
        ppv_distance_m: float,
        K: float,
        alpha: float,
        explosive_type: str = "ANFO",
        preferred_pattern: str = "auto",
    ):
        self.geo = BlastGeometry(
            diameter_mm=diameter_mm,
            rock_density=rock_density,
            bench_depth=bench_depth,
            explosive_type=explosive_type,
        )

        self.dist = HoleDistribution(
            production_tonnes=production_tonnes,
            tonnes_per_hole=self.geo.tonnes_per_hole,
            num_benches=num_benches,
        )

        self.ppv_model = PPVModel(K=K, alpha=alpha, distance_m=ppv_distance_m)

        self.hole_delay_ms      = hole_delay_ms
        self.row_delay_ms       = select_row_delay(hole_delay_ms)
        self.preferred_pattern  = preferred_pattern

        self.results: dict[str, dict] = {}
        self._run_all_patterns()

        self.best_pattern = self._pick_best()
        self.chosen       = self.results[self.best_pattern]

        logger.info("Optimiser complete. Best pattern: %s | MCPD: %.1f kg | PPV: %.2f mm/s",
                    self.best_pattern, self.chosen["mcpd"], self.chosen["ppv"]["ppv_mm_s"])

    def _run_all_patterns(self):
        for pat in self.PATTERNS:
            seq = FiringSequence(
                rows=self.dist.rows,
                cols=self.dist.cols,
                pattern=pat,
                hole_delay_ms=self.hole_delay_ms,
                charge_per_hole=self.geo.charge_per_hole,
            )
            ppv_result = self.ppv_model.predict(seq.mcpd)

            self.results[pat] = {
                "pattern":      pat,
                "label":        PATTERN_META[pat]["label"],
                "description":  PATTERN_META[pat]["description"],
                "pros":         PATTERN_META[pat]["pros"],
                "cons":         PATTERN_META[pat]["cons"],
                "mcpd":         seq.mcpd,
                "ppv":          ppv_result,
                "sequence":     seq,
                "seq_dict":     seq.to_dict(),
                "score":        0,
            }

    def _score(self, pat: str) -> float:
        mcpds    = [self.results[p]["mcpd"]                           for p in self.PATTERNS]
        durs     = [self.results[p]["seq_dict"]["blast_duration"]      for p in self.PATTERNS]

        mcpd_min, mcpd_max = min(mcpds), max(mcpds)
        dur_min,  dur_max  = min(durs),  max(durs)

        r = self.results[pat]

        mcpd_norm = ((r["mcpd"] - mcpd_min) / (mcpd_max - mcpd_min + 1e-9))
        dur_norm  = ((r["seq_dict"]["blast_duration"] - dur_min) / (dur_max - dur_min + 1e-9))

        frag_bonus = {"row": 0.05, "diagonal": 0.0, "v_shape": 0.0}

        return 0.60 * mcpd_norm + 0.30 * dur_norm + frag_bonus.get(pat, 0)

    def _pick_best(self) -> str:
        if self.preferred_pattern != "auto" and self.preferred_pattern in self.results:
            logger.info("User-preferred pattern: %s", self.preferred_pattern)
            return self.preferred_pattern

        scores = {pat: self._score(pat) for pat in self.PATTERNS}
        for pat, score in scores.items():
            self.results[pat]["score"] = round(score, 4)

        best = min(scores, key=scores.get)
        logger.info("Pattern scores: %s | Winner: %s", scores, best)
        return best

    def to_dict(self) -> dict:
        comparison = []
        for pat in self.PATTERNS:
            r = self.results[pat]
            comparison.append({
                "pattern":          pat,
                "label":            r["label"],
                "description":      r["description"],
                "pros":             r["pros"],
                "cons":             r["cons"],
                "mcpd":             r["mcpd"],
                "ppv_mm_s":         r["ppv"]["ppv_mm_s"],
                "scaled_dist":      r["ppv"]["scaled_distance"],
                "risk_level":       r["ppv"]["classification"]["level"],
                "risk_color":       r["ppv"]["classification"]["color"],
                "num_delay_steps":  r["seq_dict"]["num_delay_steps"],
                "blast_duration":   r["seq_dict"]["blast_duration"],
                "hole_delay_ms":    r["seq_dict"]["hole_delay_ms"],
                "row_delay_ms":     r["seq_dict"]["row_delay_ms"],
                "score":            r["score"],
                "is_best":          pat == self.best_pattern,
            })

        return {
            "geometry":         self.geo.to_dict(),
            "distribution":     self.dist.to_dict(),
            "best_pattern":     self.best_pattern,
            "best_label":       PATTERN_META[self.best_pattern]["label"],
            "chosen": {
                **self.chosen["seq_dict"],
                "ppv":          self.chosen["ppv"],
                "score":        self.chosen["score"],
            },
            "comparison":       comparison,
            "ppv_distance_curve": self.chosen["ppv"]["distance_curve"],
            "ppv_limits":       self.chosen["ppv"]["limits"],
            "standard_delays":  STANDARD_DELAYS,
            "hole_delay_ms":    self.hole_delay_ms,
            "row_delay_ms":     self.row_delay_ms,
        }