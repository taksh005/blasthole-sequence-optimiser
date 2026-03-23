import math
import logging

logger = logging.getLogger(__name__)

class BlastGeometry:
    EXPLOSIVES = {
        "ANFO": 0.85,
        "EMULSION": 1.15,
        "ANFO/Emulsion blend": 1.00,
        "Heavy ANFO": 1.05,
        "Slurry": 1.20
    }

    def __init__(
            self,
            diameter_mm: float,
            rock_density: float,
            bench_depth: float,
            explosive_type: str,
            ks: float = 1.25,
            kt: float = 0.70,
            kj: float = 0.30
    ):
        self.diameter_mm = diameter_mm
        self.rock_density = rock_density
        self.bench_depth = bench_depth
        self.explosive_type = explosive_type
        self.explosive_density = self.EXPLOSIVES.get(explosive_type)
        self.ks = ks
        self.kt = kt
        self.kj = kj
        self._compute()

    def _compute(self):
        d = self.diameter_mm / 1000.0
        self.burden = round(25*d,3)
        self.spacing = round(self.ks*self.burden,3)
        self.stemming = round(self.kt*self.burden,3)
        self.subgrade = round(self.kj*self.burden,3)
        self.charge_length = round(self.bench_depth + self.subgrade - self.stemming,3)

        hole_area = math.pi*(d/2)**2
        self.charge_per_hole = round(
            hole_area*self.charge_length*self.explosive_density*1000, 2
                )
        self.vol_per_hole = round(
            self.burden * self.spacing * self.bench_depth,3
        )
        self.tonnes_per_hole = round(
            self.vol_per_hole * self.rock_density, 2
        )
        self.powder_factor = round(
            self.charge_per_hole / self.tonnes_per_hole, 4
        )

        logger.info(
            "Geometry: B=%.2f m, S=%.2f m, T=%.2f m, Q=%.1f kg/hole",
            self.burden, self.spacing, self.stemming, self.charge_per_hole
        )

    def to_dict(self)->dict:
        return {
            "diameter_mm":      self.diameter_mm,
            "rock_density":     self.rock_density,
            "bench_depth":      self.bench_depth,
            "explosive_type":   self.explosive_type,
            "explosive_density":self.explosive_density,
            "burden":           self.burden,
            "spacing":          self.spacing,
            "stemming":         self.stemming,
            "subgrade":         self.subgrade,
            "charge_length":    self.charge_length,
            "charge_per_hole":  self.charge_per_hole,
            "vol_per_hole":     self.vol_per_hole,
            "tonnes_per_hole":  self.tonnes_per_hole,
            "powder_factor":    self.powder_factor,
        }