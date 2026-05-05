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
            return r*rd
        elif self.pattern == "diagonal":
            return r*hd + c*rd
        elif self.pattern == "v_shape":
            mid = (self.cols-1)/2.0
            dist_from_centre = abs(c-mid)
            return round(r*rd + dist_from_centre*hd)
        
    def _build(self):
        hole_id = 1
        for r in range(self.rows):
            for c in range(self.cols):
                delay = self._assign_delay(r,c)
                self.holes.append(
                    Hole(
                        id = hole_id,
                        row = r,
                        col = c,
                        bench = self.bench_no,
                        delay_ms=  delay,
                        pattern = self.pattern,
                        charge_kg = self.charge_per_hole
                    )
                )
                hole_id += 1

        self.holes.sort(key = lambda h: (h.delay_ms, h.row, h.col))
        for i, h in enumerate(self.holes):
            h.id = i+1

        logger.info(
            "Built sequence: pattern%s | %d holes | col_delay=%dms | row_delay=%dms",
            self.pattern, len(self.holes), self.hole_delay_ms, self.row_delay_ms
        )

    def _compute_mcpd(self):
        self.delay_groups: dict[int,list[Hole]] = {}
        WINDOW_MS = 8
        for h in self.holes:
            self.delay_groups.setdefault(h.delay_ms,[]).append(h)

        delays = sorted(self.delay_groups.keys())

        max_simultaneous = 0
        worst_delay_ms   = delays[0] if delays else 0

        for d in delays:
            count = sum(
                len(self.delay_groups[other])
                for other in delays
                if d <= other < d + WINDOW_MS
            )
        if count > max_simultaneous:
            max_simultaneous = count
            worst_delay_ms   = d


        self.max_simultaneous = max_simultaneous
        self.worst_delay_ms = worst_delay_ms
        self.mcpd = round(max_simultaneous * self.charge_per_hole, 2)
        self.window_ms = WINDOW_MS
        self.unique_delays = delays
        self.num_delay_steps = len(delays)
        self.blast_duration = delays[-1] if delays else 0

        self.unique_delays   = delays
        self.num_delay_steps = len(delays)
        self.blast_duration  = delays[-1] if delays else 0

        logger.info(
            "MCPD=%.1f kg | max_simultaneous=%d holes (±%dms window) | %d delay steps | duration=%d ms",
            self.mcpd, self.max_simultaneous, WINDOW_MS,
            self.num_delay_steps, self.blast_duration
        )

    def schedule(self) -> list[dict]:
        rows = []
        for h in self.holes:
            sim = len(self.delay_groups[h.delay_ms])
            rows.append({
                "id":                h.id,
                "row":               h.row + 1,       
                "col":               h.col + 1,
                "bench":             h.bench,
                "delay_ms":          h.delay_ms,
                "simultaneous":      sim,
                "delay_charge_kg":   round(sim * self.charge_per_hole, 2),
            })
        return rows

    def holes_as_dicts(self) -> list[dict]:
        return [
            {
                "id":       h.id,
                "row":      h.row,
                "col":      h.col,
                "bench":    h.bench,
                "delay_ms": h.delay_ms,
                "pattern":  h.pattern,
            }
            for h in self.holes
        ]

    def to_dict(self) -> dict:
        return {
            "pattern":         self.pattern,
            "rows":            self.rows,
            "cols":            self.cols,
            "hole_delay_ms":   self.hole_delay_ms,
            "row_delay_ms":    self.row_delay_ms,
            "charge_per_hole": self.charge_per_hole,
            "mcpd":            self.mcpd,
            "max_simultaneous":self.max_simultaneous,
            "worst_delay_ms":  self.worst_delay_ms,
            "num_delay_steps": self.num_delay_steps,
            "blast_duration":  self.blast_duration,
            "total_holes":     len(self.holes),
            "holes":           self.holes_as_dicts(),
            "schedule":        self.schedule(),
        }