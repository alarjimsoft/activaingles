# EPIC-010: Backend Changes

**Stack:** FastAPI + Python 3.13, OpenAI GPT-4.1-mini
**Principle:** Minimal backend footprint — EPIC-010 is primarily a frontend and data-layer epic.

---

## 1. New Files

### 1.1 backend/app/routes/activities.py

New router for practice activity generation and evaluation.

```
Prefix:    /activities
Endpoints: POST /activities/generate
           POST /activities/evaluate
```

**Pydantic Models:**

```python
class VocabularyItem(BaseModel):
    term: str
    definition: str

class ActivityGenerationRequest(BaseModel):
    mission_id: int
    mission_title: str
    level_code: str                        # 'A1' | 'A2' | 'B1' | 'B2'
    vocabulary: list[VocabularyItem]
    grammar_rule: str
    grammar_title: str
    activity_count: int = 4                # default 4 activities
    activity_types: list[str] = ["fill_blank", "multiple_choice", "translation"]

class Activity(BaseModel):
    id: str
    type: str                              # 'fill_blank' | 'translation' | 'multiple_choice'
    prompt: str
    options: list[str] | None = None       # only for multiple_choice
    correct_answer: str
    hint: str | None = None
    difficulty: str = "medium"

class ActivityGenerationResponse(BaseModel):
    activities: list[Activity]
    generated_at: str
    model: str

class ActivityEvaluationRequest(BaseModel):
    activity_type: str
    prompt: str
    correct_answer: str
    student_answer: str
    level_code: str

class ActivityEvaluationResponse(BaseModel):
    is_correct: bool
    score: int                             # 0–100
    explanation: str
    accepted_alternatives: list[str] = []
    grammar_feedback: str | None = None
```

**Route implementations:**

```python
@router.post("/generate", response_model=ActivityGenerationResponse)
async def generate_activities(request: ActivityGenerationRequest):
    activities = await activity_service.generate_activities(request)
    return ActivityGenerationResponse(
        activities=activities,
        generated_at=datetime.utcnow().isoformat(),
        model="gpt-4.1-mini"
    )

@router.post("/evaluate", response_model=ActivityEvaluationResponse)
async def evaluate_activity(request: ActivityEvaluationRequest):
    result = await activity_service.evaluate_answer(request)
    return result
```

---

### 1.2 backend/app/services/activity_service.py

Core logic for activity generation and evaluation via GPT.

**Key design decisions:**
- Uses `asyncio.to_thread()` pattern (same as any sync call wrapping in FastAPI)
- Generates all activities in a single GPT call (one API call per session, not per activity)
- Evaluation is a separate, lightweight GPT call (or client-side for multiple-choice)
- Both calls use `response_format: json_object` — same pattern as `openai_service.py`

#### generate_activities()

**GPT System Prompt Template:**
```
You are an English language activity generator for {level_code} learners.
Your task: generate exactly {activity_count} practice activities based on the lesson content below.

LESSON CONTENT:
Mission: {mission_title}
Grammar Focus: {grammar_title}
Rule: {grammar_rule}
Vocabulary: {vocabulary_list}

ACTIVITY TYPES to include:
{activity_types_instructions}

RULES:
- All activities must directly use the vocabulary and grammar rule above
- Activities must be appropriate for {level_code} level (CEFR)
- Sentences must be natural, contextually realistic
- Multiple choice: exactly 4 options, exactly 1 correct
- Fill-blank: underline the blank with ___
- Translation: provide a Spanish sentence to translate to English
- Each activity must have a unique ID: "act_1", "act_2", etc.
- For incorrect multiple choice options: use plausible but clearly wrong alternatives

Return a JSON object with the key "activities" containing an array of activity objects.
Each activity: { id, type, prompt, options (if MC), correct_answer, hint, difficulty }
```

**GPT call parameters:**
```python
model = "gpt-4.1-mini"
temperature = 0.8          # slightly higher than tutor for variety
response_format = { "type": "json_object" }
max_tokens = 1500          # sufficient for 4 activities
```

**Error handling:**
- JSONDecodeError → retry once with simplified prompt
- After 2 failures → raise HTTPException(503, "Activity generation temporarily unavailable")
- Validation: ensure each activity has required fields; drop malformed activities

#### evaluate_answer()

**GPT System Prompt Template:**
```
You are an English language answer evaluator for {level_code} learners.
Your task: evaluate whether the student's answer is correct.

ACTIVITY:
Type: {activity_type}
Prompt: {prompt}
Expected answer: {correct_answer}

STUDENT'S ANSWER: {student_answer}

EVALUATION RULES:
- For fill-blank: accept minor spelling errors, accept different valid forms if grammatically correct
- For translation: accept any semantically equivalent English sentence, not just exact match
- Score: 100 = fully correct, 70-90 = minor error (acceptable), 40-60 = partially correct, 0-30 = wrong
- Be LENIENT with spelling, strict with grammar structure
- Explain briefly what was wrong (if anything) — max 2 sentences

Return JSON: { "is_correct": bool, "score": int, "explanation": str, "accepted_alternatives": [str], "grammar_feedback": str | null }
```

**GPT call parameters:**
```python
model = "gpt-4.1-mini"
temperature = 0.3          # low — evaluation should be consistent
response_format = { "type": "json_object" }
max_tokens = 300
```

---

## 2. Modified Files

### 2.1 backend/app/main.py

**Change 1 — Fix speech_router duplicate (TD-A06 / Phase 0):**
```python
# Remove duplicate import and include_router
# Current (broken):
from app.routes.speech import router as speech_router  # line 8
from app.routes.speech import router as speech_router  # line 11 (DELETE THIS)
app.include_router(speech_router)                       # line 25
app.include_router(speech_router)                       # line 28 (DELETE THIS)

# Fixed:
from app.routes.speech import router as speech_router  # keep one
app.include_router(speech_router)                      # keep one
```

**Change 2 — Register new activities router:**
```python
from app.routes.activities import router as activities_router
app.include_router(activities_router, prefix="/activities", tags=["activities"])
```

---

### 2.2 backend/app/routes/chat.py

**Change 1 — Accept learning_context and conversation_history (Phase 4):**

```python
# Modified ChatRequest model
class LearningContext(BaseModel):
    vocabulary_studied: list[str] = []
    grammar_focus: str | None = None
    grammar_rule: str | None = None
    practice_score: int | None = None
    phases_completed: list[str] = []

class ConversationMessage(BaseModel):
    role: str              # 'user' | 'assistant'
    content: str

class ChatRequest(BaseModel):
    id_inscripcion: int
    mission_id: int
    mission: dict
    message: str
    progress_percent: int
    learning_context: LearningContext | None = None      # NEW optional
    conversation_history: list[ConversationMessage] = [] # NEW optional (max 10)
```

**Change 2 — Pass new params to openai_service:**
```python
@router.post("/message")
async def chat_message(request: ChatRequest):
    response = await openai_service.get_tutor_response(
        mission=request.mission,
        user_message=request.message,
        learning_context=request.learning_context,       # NEW
        conversation_history=request.conversation_history  # NEW
    )
    ...
```

**Change 3 — Grammar score from corrections (Phase 0 / STORY-P0-02):**
```python
# After GPT response:
correction = response.get("correction")

# Derive grammar score from correction presence
# If correction is None: student made no detectable error → high score
# If correction is present: moderate score (student made an error but engaged)
grammar_score = 90 if correction is None else 65

# Pass real grammar_score to add-xp and progress update
```

**Note on grammar score:** This is a heuristic, not a true grammar assessment. A proper grammar score requires analyzing the correction's severity, which would need a separate GPT call or a more structured correction schema. This heuristic is better than `85` hardcoded.

---

### 2.3 backend/app/services/openai_service.py

**Change 1 — Extended function signature:**
```python
async def get_tutor_response(
    mission: dict,
    user_message: str,
    learning_context: dict | None = None,     # NEW
    conversation_history: list[dict] = []     # NEW
) -> dict:
```

**Change 2 — Enhanced system prompt with learning context:**

When `learning_context` is provided, the system prompt gains a section:

```
STUDENT'S LEARNING PREPARATION:
The student just completed the Learning Guide for this mission.
Vocabulary studied: {vocabulary_list}
Grammar focus: {grammar_title} — Rule: {grammar_rule}
Practice activity score: {practice_score}%
Completed phases: {phases_list}

TUTOR GUIDANCE:
- Encourage the student to use the vocabulary listed above
- When they use the vocabulary correctly, acknowledge it positively
- If their practice score was below 70, spend more time reinforcing the grammar rule
- If their practice score was above 85, you can introduce slightly more complex variations
```

When `learning_context` is None: system prompt unchanged from current.

**Change 3 — Conversation history in GPT call:**
```python
# Build messages array
messages = [
    {"role": "system", "content": system_prompt}
]

# Add conversation history (up to 10 messages)
for msg in conversation_history[-10:]:
    messages.append({"role": msg["role"], "content": msg["content"]})

# Add current user message
messages.append({"role": "user", "content": user_message})

# Call GPT
response = await client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=messages,
    response_format={"type": "json_object"},
    temperature=0.7
)
```

**Impact:** Token usage increases with conversation history. With 10 messages × ~50 tokens average = ~500 additional tokens per call. At `gpt-4.1-mini` pricing this is negligible. Monitor in production.

---

### 2.4 backend/app/services/progress_service.py

**Change 1 — Accept real grammar_score parameter:**
```python
def calculate_xp(
    grammar_score: int,
    pronunciation_score: int,
    message_count: int,
    completed: bool = False,
    practice_score: int = 0    # NEW
) -> int:
    xp = message_count * 5
    if grammar_score >= 80:
        xp += 10
    if pronunciation_score >= 70:
        xp += 5
    if pronunciation_score >= 80:
        xp += 10
    if pronunciation_score >= 90:
        xp += 20
    if completed:
        xp += 50
    # NEW: practice activity bonus
    if practice_score >= 60:
        xp += 15
    if practice_score >= 80:
        xp += 15   # cumulative: 80+ gets +30 total
    if practice_score >= 95:
        xp += 20   # cumulative: 95+ gets +50 total
    return xp
```

**Change 2 — Add practice_score parameter to add_xp_to_progress():**

Since `practice_score` is a session-level metric (computed once per practice session, not per message), it should be passed to `add-xp` only on the first message after completing the practice phase.

The cleanest approach: `practice_score` is sent as a field in `ChatRequest.learning_context`. `chat.py` passes it to `calculate_xp()` on the first message of the conversation phase.

---

## 3. New Registration in main.py

```python
# Full updated router registration (after fixes)
from app.routes.chat import router as chat_router
from app.routes.speech import router as speech_router       # once only
from app.routes.tts import router as tts_router
from app.routes.activities import router as activities_router  # NEW

app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(speech_router, prefix="/speech", tags=["speech"])
app.include_router(tts_router, prefix="/tts", tags=["tts"])
app.include_router(activities_router, prefix="/activities", tags=["activities"])  # NEW
```

---

## 4. Summary of Backend Changes

| File | Change Type | Phase | Impact |
|---|---|---|---|
| `main.py` | Fix speech_router duplicate | P0 | Low |
| `main.py` | Register activities router | P3 | Low |
| `routes/activities.py` | New file | P3 | Medium |
| `services/activity_service.py` | New file | P3 | Medium |
| `routes/chat.py` | Extended request model | P4 | Low |
| `routes/chat.py` | Real grammar score | P0 | Low |
| `services/openai_service.py` | Extended function signature | P4 | Medium |
| `services/openai_service.py` | Learning context in prompt | P4 | Medium |
| `services/openai_service.py` | Conversation history in GPT call | P4 | Medium |
| `services/progress_service.py` | Practice score in XP | P5 | Low |

---

## 5. Token Budget Analysis

| Call Type | Current Tokens/Call | After EPIC-010 |
|---|---|---|
| Tutor chat (no history) | ~800 | ~800 |
| Tutor chat (with 10-msg history) | ~800 | ~1300 (+500) |
| Tutor chat (with learning context) | ~800 | ~1600 (+800) |
| Activity generation (new) | N/A | ~1500 per session |
| Activity evaluation (new) | N/A | ~300 per open answer |

**Estimated additional cost per full mission session (after EPIC-010):**
- 1 activity generation call: ~1500 tokens
- ~2 activity evaluations (fill_blank + translation): ~600 tokens
- 5 chat messages with history + context: ~5 × 800 additional tokens = ~4000
- **Total additional tokens per session:** ~6100 tokens on `gpt-4.1-mini`
- At current `gpt-4.1-mini` pricing: negligible (< $0.01 per session)

---

## 6. Testing Requirements (Backend)

| Component | Test Type | Key Scenarios |
|---|---|---|
| `activity_service.generate_activities()` | Integration | GPT returns valid JSON; GPT returns malformed JSON (retry); API key missing |
| `activity_service.evaluate_answer()` | Integration | Correct answer; minor spelling error (should pass); completely wrong; translation variation |
| `POST /activities/generate` | API test | Valid request; missing fields; level_code out of range |
| `POST /activities/evaluate` | API test | Multiple-choice (not routed here); fill_blank lenient check |
| `openai_service.get_tutor_response()` | Integration | With history; with learning_context; without both (backward compat) |
| `calculate_xp()` | Unit | All practice_score thresholds; combined bonuses |
