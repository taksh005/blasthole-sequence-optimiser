import math
import logging
logger = logging.getLogger(__name__)

class HoleDistribution:
    def __init__(
            self,
            production_tonnes: float,
            tonnes_per_hole: float,
            num_benches: int,
            aspect_ratio: float = 1.3
    ):
        self.production_tonnes = production_tonnes
        self.tonnes_per_hole = tonnes_per_hole
        self.num_benches = num_benches
        self.aspect_ratio = aspect_ratio
        self._compute()

    def _compute(self):
        total_holes_needed = math.ceil(self.production_tonnes/self.tonnes_per_hole)
        holes_per_bench = math.ceil(total_holes_needed/self.num_benches)

        cols = max(2, round(math.sqrt(holes_per_bench * self.aspect_ratio)))
        rows = max(1, math.ceil(holes_per_bench / cols))

        self.rows = rows
        self.cols = cols
        self.holes_per_bench  = holes_per_bench
        self.total_holes = self.holes_per_bench * self.num_benches

        self.actual_production = round(self.total_holes * self.tonnes_per_hole, 0)
        self.overbreak_pct     = round(
            (self.actual_production - self.production_tonnes) / self.production_tonnes * 100, 2
        )

        logger.info(
            "Distribution: %d benches × %d rows × %d cols = %d holes | Production: %.0f t",
            self.num_benches, self.rows, self.cols,
            self.total_holes, self.actual_production
        )

    def bench_layouts(self) -> list[dict]:
        return [
            {
                "bench_no":    b + 1,
                "rows":        self.rows,
                "cols":        self.cols,
                "holes":       self.holes_per_bench,
            }
            for b in range(self.num_benches)
        ]

    def to_dict(self) -> dict:
        return {
            "production_target":   self.production_tonnes,
            "actual_production":   self.actual_production,
            "overbreak_pct":       self.overbreak_pct,
            "total_holes":         self.total_holes,
            "holes_per_bench":     self.holes_per_bench,
            "rows":                self.rows,
            "cols":                self.cols,
            "num_benches":         self.num_benches,
            "bench_layouts":       self.bench_layouts(),
        }