from blast_geometry import BlastGeometry
from hole_distribution import HoleDistribution
from firing_sequence import FiringSequence, STANDARD_DELAYS, select_row_delay
from ppv_model import PPVModel
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
        geometry_mode: str ="standard",
        custom_burden: float = None,
        spacing_ratio: float = 1.15,
        stemming_ratio: float = 1.00,
        subgrade_ratio: float = 0.30,
        input_mode: str = "production",
        manual_rows: int = None,
        manual_cols: int = None,
    ):
        self.geo = BlastGeometry(
            diameter_mm=diameter_mm,
            rock_density=rock_density,
            bench_depth=bench_depth,
            explosive_type=explosive_type,
            geometry_mode= geometry_mode,
            custom_burden=custom_burden,
            spacing_ratio   = spacing_ratio,  
            stemming_ratio  = stemming_ratio,   
            subgrade_ratio  = subgrade_ratio,
        )
        if input_mode == "manual" and manual_rows and manual_cols:
            self.dist = HoleDistribution(
                production_tonnes=manual_cols*manual_rows*num_benches*self.geo.tonnes_per_hole,
                tonnes_per_hole=self.geo.tonnes_per_hole,
                num_benches=num_benches,
            )
            self.dist.rows = manual_rows
            self.dist.cols = manual_cols
            self.dist.holes_per_bench = manual_rows * manual_cols
            self.dist.total_holes = manual_rows * manual_cols * num_benches
        else:
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

    def _pick_best(self) -> str:
        if self.preferred_pattern != "auto" and self.preferred_pattern in self.results:
            return self.preferred_pattern
        
        frag_penalty = {"row": 0.0, "diagonal": -0.05, "v_shape": -0.05}

        for pat in self.PATTERNS:
            r = self.results[pat]
            mcpd = round(r["mcpd"], 2)
            duration = r["seq_dict"]["blast_duration"]
            score = mcpd + (duration / 10000.0) + frag_penalty.get(pat, 0)
            r["score"] = round(score, 3)
            r["mcpd_rounded"] = mcpd 
            
            logger.info("Pattern: %-10s | MCPD: %.2f kg | Duration: %d ms | Score: %.3f", 
                        pat, mcpd, duration, score)
        def selection_criteria(p):
            return (
                self.results[p]["mcpd_rounded"], 
                self.results[p]["seq_dict"]["blast_duration"]
            )

        best_pattern = min(self.PATTERNS, key=selection_criteria)
        
        logger.info("Selected Best Pattern: %s", best_pattern.upper())
        return best_pattern

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
