# python/app.py
from typing import Any, Dict, List
from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Quirk Helper API", version="0.2.0")

# CORS: wide open for dev so the extension can call localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}

def _to_int(x: Any) -> int:
    try:
        return int(x)
    except Exception:
        return 0

def _summarize_payload(p: Dict[str, Any]) -> str:
    """Build a human-readable one-liner from the dashboard payload."""
    title = str(p.get("title") or "").strip() or "Vinconnect"
    store = str(p.get("store") or "").strip()
    date_range = str(p.get("dateRange") or p.get("daterange") or "").strip()
    url = str(p.get("url") or p.get("URL") or "").strip()

    sales = p.get("salesFunnel") or {}
    kpis = p.get("kpis") or {}

    header_parts: List[str] = []
    if store:
        header_parts.append(store)
    if title:
        header_parts.append(title)
    if date_range:
        header_parts.append(f"for {date_range}")
    header = " — ".join(header_parts) if header_parts else "Dashboard"

    sales_line = (
        f"Leads: {_to_int(sales.get('customers'))} | "
        f"Contacted: {_to_int(sales.get('contacted'))} | "
        f"Appts Set: {_to_int(sales.get('apptsSet'))} | "
        f"Shown: {_to_int(sales.get('apptsShown'))} | "
        f"Sold: {_to_int(sales.get('sold'))}"
    )

    kpi_line = (
        f"KPIs – Unanswered: {_to_int(kpis.get('unansweredComms'))}, "
        f"Open visits: {_to_int(kpis.get('openVisits'))}, "
        f"Buying signals: {_to_int(kpis.get('buyingSignals'))}, "
        f"Pending deals: {_to_int(kpis.get('pendingDeals'))}"
    )

    tail = f"URL: {url}" if url else ""
    parts = [header, sales_line, kpi_line, tail]
    return " | ".join([s for s in parts if s])

@app.post("/summarize")
def summarize(body: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Accept any JSON. If the extension wraps data under {"payload": {...}},
    unwrap it; otherwise use the body itself. Return a plain-text summary.
    """
    payload = body.get("payload", body)
    summary = _summarize_payload(payload)
    return {"summary": summary}
