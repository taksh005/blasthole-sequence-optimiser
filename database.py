import sqlite3
import json
from datetime import datetime

DB_PATH = "blastseq_logs.db"

def init_db():
    """
    Creates the database table if it doesn't exist.
    Call this once when Flask starts up.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS blast_runs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp   TEXT,
            inputs      TEXT,
            outputs     TEXT
        )
    """)
    conn.commit()
    conn.close()

def log_run(inputs: dict, outputs: dict):
    """
    Saves one blast run to the database.
    Call this every time /api/optimise succeeds.
    inputs and outputs are Python dicts — we convert them to JSON strings for storage.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO blast_runs (timestamp, inputs, outputs) VALUES (?, ?, ?)",
        (datetime.utcnow().isoformat(), json.dumps(inputs), json.dumps(outputs))
    )
    conn.commit()
    conn.close()

def get_all_runs():
    """
    Returns all logged runs as a list of dicts.
    Use this if you want to build an analytics dashboard later.
    """
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, timestamp, inputs, outputs FROM blast_runs ORDER BY id DESC"
    ).fetchall()
    conn.close()
    return [
        {
            "id":        r[0],
            "timestamp": r[1],
            "inputs":    json.loads(r[2]),
            "outputs":   json.loads(r[3]),
        }
        for r in rows
    ]
