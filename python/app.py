# python/app.py
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# allow the extension to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],  # MV3
    allow_methods=["*"],
    allow_headers=["*"],
)

class Lead(BaseModel):
    note: str

@app.post("/summarize")
def summarize(lead: Lead):
    # TODO: replace with real logic (LLM, rules, etc.)
    return {"summary": lead.note.strip().upper()}
