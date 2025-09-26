# quirk-ai-sidecar/python/app.py
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow calls from the extension (and dev tools); you can tighten later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*", "http://127.0.0.1:*", "http://localhost:*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Lead(BaseModel):
    note: str

@app.get("/health")
def health():
    """Simple readiness probe."""
    return {"ok": True}

@app.post("/summarize")
def summarize(lead: Lead):
    # TODO: replace with real logic / LLM call
    return {"summary": lead.note.strip().upper()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8765, reload=True)
from typing import Dict, List, Optional
from pydantic import BaseModel

class DashboardPayload(BaseModel):
    ts: str
    page: str
    url: str
    dealer: Dict[str, Optional[str]]
    dateRange: Dict[str, Optional[str]]
    salesFunnel: Dict[str, Optional[int]] = {}
    kpis: Dict[str, Optional[int]] = {}
    dailyActivity: Dict[str, Dict[str, Optional[int]]] = {}
    appointments: List[Dict[str, Optional[str]]] = []
    responseTimes: Dict[str, Optional[int]] = {}
    user: Optional[str] = None

@app.post("/dashboard")
def ingest_dashboard(data: DashboardPayload):
    print(f"[API] Dashboard from {data.dealer} range {data.dateRange}")
    # TODO: write to CSV, SQLite, or a file per dealer
    # with open("dashboard_log.jsonl","a",encoding="utf-8") as f: f.write(data.model_dump_json() + "\n")
    return {"status": "ok"}
