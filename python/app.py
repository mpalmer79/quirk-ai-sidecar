# python/app.py
from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import os

app = FastAPI(title="Quirk Sidecar API")

# ---------- Schemas ----------
class Msg(BaseModel):
    role: Literal["customer", "agent", "system"] = "customer"
    content: str

class SuggestRequest(BaseModel):
    store: Optional[str] = ""
    title: Optional[str] = ""
    url: Optional[str] = ""
    messages: List[Msg] = Field(default_factory=list)
    tone: Optional[str] = "friendly, concise, professional"
    max_chars: Optional[int] = 800

class SuggestResponse(BaseModel):
    reply: str

# ---------- Simple token/length guard ----------
def truncate_messages(messages: List[Msg], limit: int = 1500) -> List[Msg]:
    out, total = [], 0
    for m in reversed(messages):        # newest first
        add = len(m.content)
        if total + add > limit: break
        out.append(m)
        total += add
    return list(reversed(out))

# ---------- OpenAI (optional) ----------
def generate_with_openai(req: SuggestRequest) -> Optional[str]:
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)

        # Build a compact chat history
        msgs = truncate_messages(req.messages, 1500)
        user_text = "\n".join(
            (f"Customer: {m.content}" if m.role == "customer" else f"Agent: {m.content}")
            for m in msgs
        ) or "Customer started a new conversation."

        system_prompt = f"""
You are Quirk's sales assistant for automotive dealerships.
Write ONE reply message for the agent to send. Keep it {req.tone}.
Goals:
- Be helpful and personal; reflect the customer's intent.
- Ask exactly one clear next-step question (when appropriate).
- Offer a concrete CTA: schedule test drive, request details, or move deal forward.
- Stay under {req.max_chars} characters. No emojis, no markdown.
- Never invent pricing; if asked, suggest setting up a quick call to review options.

Context:
- Store: {req.store or "Unknown"}
- Page: {req.title or "Vinconnect"}

Return ONLY the message body.
"""
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt.strip()},
                {"role": "user", "content": user_text}
            ],
            temperature=0.5,
        )
        return (completion.choices[0].message.content or "").strip()
    except Exception as e:
        print("OpenAI error:", e)
        return None

# ---------- Fallback generator ----------
def fallback_suggestion(req: SuggestRequest) -> str:
    last = ""
    for m in reversed(req.messages):
        if m.role == "customer":
            last = m.content.strip()
            break
    opener = "Thanks for reaching out!"
    if last:
        opener = f"Thanks for the details — I hear you: “{last[:140]}”"
    body = (
        "I’d be happy to walk through options and next steps with you. "
        "Would you prefer a quick call today, or should I send a few choices by email?"
    )
    return f"{opener} {body}"

# ---------- Routes ----------
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/suggest", response_model=SuggestResponse)
def suggest(req: SuggestRequest):
    # Try OpenAI first
    ai = generate_with_openai(req)
    if ai:
        # hard cap characters
        return SuggestResponse(reply=ai[: req.max_chars or 800].strip())
    # Fallback
    return SuggestResponse(reply=fallback_suggestion(req)[: (req.max_chars or 800)])

# (Keep your existing /summarize route here if you still use it)
