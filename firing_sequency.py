import math
import logging
from dataclasses import dataclass, field
from typing import Literal

logger = logging.getLogger(__name__)
STANDARD_DELAYS = [17,25,42]
PatternType = Literal["row","diagonal","v_shape"]

def select_row_delay(hole_delay_ms: int)->int:
    for d in STANDARD_DELAYS:
        if d> hole_delay_ms:
            return d
    return 85

@dataclass
class Hole:
    id: int
    row: int
    col: int
    bench: int
    delay_ms: int
    pattern: str
    charge_kg: float = 0.0

class FiringSequence:
    def __init__(
            self,
            rows: int,
            cols: int,
            pattern: PatternType,
            hole_delay_ms: int,
            charge_per_hole: float,
            bench_no: int = 1
    ):
        self.rows = rows
        self.cols = cols
        self.pattern = pattern
        self.hole_delay_ms = hole_delay_ms
        self.row_delay_ms = select_row_delay(hole_delay_ms)
        self.charge_per_hole = charge_per_hole
        self.bench_no = bench_no

        self.holes: list[Hole] = []
        self._build()
        self._compute_mcpd()

    def _assign_delay(self, r:int, c:int)->int:
        hd = self.hole_delay_ms
        rd = self.row_delay_ms

        if self.pattern == "row":
            return r*rd + c*hd
        elif self.pattern == "diagonal":
            return (r+c)*hd
        elif self.pattern == "v_shape":
            mid = (self.cols-1)/2.0
            dist_from_centre = abs(c-mid)
            return round(r*rd + dist_from_centre*hd)