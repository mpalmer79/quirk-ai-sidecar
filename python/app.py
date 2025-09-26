from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Quirk Sidecar API", version="0.1.3")

# allow calls from VinSolutions + local dev
origins = [
    "http://127.0.0.1:8765",
    "http://localhost:8765",
    "https://vinsolutions.app.coxautoinc.com",
    "https://*.vinsolutions.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # local-only API, ok to allow all
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/summarize")
async def summarize(req: Request):
    """Accept any JSON shape; unwrap {"payload": {...}} if present; return plain text."""
    data = await req.json()
    payload = data.get("payload", data)

    title = str(payload.get("title") or "Vinconnect")
    url = str(payload.get("url") or "")
    store = str(payload.get("store") or "Vinconnect")
    date_range = str(payload.get("dateRange") or "")

    sf = payload.get("salesFunnel") or {}
    k = payload.get("kpis") or {}

    parts = [
        f"{title} — {store}",
        f"Date: {date_range}" if date_range else "",
        f"Contacted: {sf.get('contacted')} | Appts Set: {sf.get('apptsSet')} | Shown: {sf.get('apptsShown')} | Sold: {sf.get('sold')}",
        f"KPIs — Unanswered: {k.get('unansweredComms')}, Open visits: {k.get('openVisits')}, Buying signals: {k.get('buyingSignals')}, Pending deals: {k.get('pendingDeals')}",
        f"URL: {url}"
    ]
    summary = "\n".join(p for p in parts if p)
    return {"summary": summary}
