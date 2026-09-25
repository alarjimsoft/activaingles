# EPIC-010: API Changes

**Scope:** Oracle ORDS (new endpoints) + FastAPI (new routes + modifications)
**Existing endpoints:** No breaking changes — all additive
**Decisión ADR-01:** Oracle es la única fuente de contenido desde el inicio. Sin archivos JS de respaldo.

---

## 1. Oracle ORDS Changes

### 1.1 New Endpoints

#### GET /missions/content/:missionId

Retrieves the static learning content for a mission.

```
Method:  GET
Path:    /ords/api/missions/content/:missionId
Auth:    Same as existing ORDS endpoints
Caller:  Frontend (missionContentService.js)
```

**Request:** Path param only — `missionId`

**Response:**
```json
{
  "mission_id": 5,
  "objectives": [
    "Use present continuous to describe ongoing actions",
    "Distinguish between present simple and present continuous"
  ],
  "vocabulary": [
    {
      "term": "currently",
      "definition": "at the present time; right now",
      "example": "She is currently studying for her exam.",
      "part_of_speech": "adverb"
    }
  ],
  "grammar": {
    "title": "Present Continuous",
    "rule": "Subject + am/is/are + verb-ing",
    "explanation": "We use the present continuous to talk about actions happening at this moment.",
    "dos": ["I am working right now.", "They are studying."],
    "donts": ["I am knowing. (wrong)", "She is belonging. (wrong)"],
    "note": "Stative verbs cannot take the continuous form."
  },
  "examples": [
    {
      "phrase": "What are you working on right now?",
      "context": "Asking a colleague about current tasks",
      "response": "I am preparing a presentation for tomorrow."
    }
  ],
  "content_version": 1
}
```

**Notes:**
- Returns 404 si `missionId` aún no tiene contenido cargado (el CMS aún no lo ha creado) — MissionPage omite la fase de LearningGuide y va directo a TutorChat
- Frontend cachea por `content_version` — si la versión no cambia, no vuelve a pedir

---

#### PUT /missions/content/:missionId

Crea o reemplaza el contenido pedagógico de una misión. Llamado exclusivamente desde el CMS (MissionContentEditor).

```
Method:  PUT
Path:    /ords/api/missions/content/:missionId
Auth:    Solo usuarios con rol admin (validado en el ORDS handler o en la lógica de negocio)
Caller:  Frontend (missionContentService.js, desde MissionContentEditor)
```

**Request Body:** — mismo schema que el GET response:
```json
{
  "objectives": [
    "Use present continuous to describe ongoing actions",
    "Distinguish between present simple and present continuous"
  ],
  "vocabulary": [
    {
      "term": "currently",
      "definition": "at the present time; right now",
      "example": "She is currently studying for her exam.",
      "part_of_speech": "adverb"
    }
  ],
  "grammar": {
    "title": "Present Continuous",
    "rule": "Subject + am/is/are + verb-ing",
    "explanation": "We use the present continuous to talk about actions happening at this moment.",
    "dos": ["I am working right now.", "They are studying."],
    "donts": ["I am knowing. (wrong)", "She is belonging. (wrong)"],
    "note": "Stative verbs cannot take the continuous form."
  },
  "examples": [
    {
      "phrase": "What are you working on right now?",
      "context": "Asking a colleague about current tasks",
      "response": "I am preparing a presentation for tomorrow."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "mission_id": 5,
  "content_version": 2
}
```

**Notes:**
- El ORDS handler hace MERGE sobre MISSIONS por `mission_id`
- Serializa cada sección como JSON string antes de guardar en CLOB
- Incrementa `content_version` en cada PUT exitoso (permite invalidar caché en clientes)
- Actualiza `content_updated_at = SYSTIMESTAMP`
- Si Oracle no implementa validación de rol a nivel ORDS, el frontend debe asegurar que solo usuarios admin lleguen a esta pantalla (validación en `AdminRoute`)

---

#### POST /progress/phase

Updates the student's current phase and phase completion flags for a mission.

```
Method:  POST
Path:    /ords/api/progress/phase
Auth:    Same as existing ORDS endpoints
Caller:  Frontend (progressService.js)
```

**Request Body:**
```json
{
  "id_inscripcion": 123,
  "mission_id": 5,
  "current_phase": "practice",
  "learning_completed": "Y",
  "practice_completed": "N",
  "practice_score": 0,
  "assessment_completed": "N"
}
```

**Response:**
```json
{
  "success": true,
  "current_phase": "practice"
}
```

**Notes:**
- ORDS handler should MERGE (upsert) into `USER_PROGRESS` by `(id_inscripcion, mission_id)`
- All fields optional except `id_inscripcion` and `mission_id` — only provided fields updated
- Should update `phase_updated_at = SYSTIMESTAMP`

---

#### GET /progress/phase/:idInscripcion/:missionId

Returns current phase status for a student's mission.

```
Method:  GET
Path:    /ords/api/progress/phase/:idInscripcion/:missionId
Auth:    Same as existing ORDS endpoints
Caller:  Frontend (progressService.js) on mission entry
```

**Response:**
```json
{
  "id_inscripcion": 123,
  "mission_id": 5,
  "current_phase": "practice",
  "learning_completed": "Y",
  "practice_completed": "N",
  "practice_score": 0,
  "assessment_completed": "N",
  "phase_updated_at": "2026-06-11T14:30:00Z"
}
```

**Notes:**
- Returns `null` body (or 404) if no USER_PROGRESS row exists — triggers phase initialization
- Used by MissionPage to resume at correct phase on re-entry

---

#### POST /activities/result

Saves a single practice activity result.

```
Method:  POST
Path:    /ords/api/activities/result
Auth:    Same as existing ORDS endpoints
Caller:  Frontend (activityService.js)
```

**Request Body:**
```json
{
  "id_inscripcion": 123,
  "mission_id": 5,
  "activity_type": "fill_blank",
  "activity_prompt": "She ___ (study) English right now.",
  "correct_answer": "is studying",
  "student_answer": "is studying",
  "is_correct": "Y",
  "score": 100,
  "ai_explanation": null
}
```

**Response:**
```json
{
  "result_id": 789,
  "success": true
}
```

---

#### GET /activities/results/:idInscripcion/:missionId

Returns all activity results for a student-mission pair.

```
Method:  GET
Path:    /ords/api/activities/results/:idInscripcion/:missionId
Auth:    Same as existing ORDS endpoints
Caller:  Frontend (for completion screen analytics)
```

**Response:**
```json
{
  "items": [
    {
      "result_id": 789,
      "activity_type": "fill_blank",
      "activity_prompt": "She ___ (study) English right now.",
      "student_answer": "is studying",
      "is_correct": "Y",
      "score": 100,
      "created_at": "2026-06-11T14:30:00Z"
    }
  ],
  "count": 4,
  "avg_score": 82.5
}
```

---

### 1.2 Modified Existing Endpoints

#### GET /progress/stats/:idInscripcion (Modified)

Add new aggregate fields if `USER_PROGRESS` has the new columns.

**Current response fields:**
```json
{
  "total_xp": 350,
  "level": 3,
  "xp_next_level": 500,
  "completed_missions": 2,
  "total_missions": 8,
  "total_time": 45,
  "avg_progress": 65,
  "avg_pronunciation": 0,
  "avg_grammar": 85
}
```

**Additional fields (Phase 1b — after DB columns added):**
```json
{
  "avg_practice_score": 78.5,
  "missions_with_learning_completed": 2,
  "missions_with_practice_completed": 1
}
```

**Notes:** These fields should be added as optional/nullable — existing code ignores unknown fields.

---

#### GET /missions/course/:idCurso/:idInscripcion (Modified)

Add `content_version` to each mission in the response (Phase 1b).

**Current mission fields:** `missionId, title, description, levelCode, durationMinutes, status, grammarTitle, grammarExample, sortOrder, topicId, topicTitle, topicSortOrder`

**Additional field:**
```json
"contentVersion": 1
```

Allows frontend to invalidate cached content when content is updated.

---

## 2. FastAPI Changes

### 2.1 New Routes

#### POST /activities/generate

Generates practice activities for a mission using GPT.

```
Method:  POST
Path:    /activities/generate
Auth:    Same as existing FastAPI (currently none — see TD-A01)
File:    backend/app/routes/activities.py (new file)
```

**Request Body:**
```json
{
  "mission_id": 5,
  "mission_title": "Daily Conversations: Present Continuous",
  "level_code": "A2",
  "vocabulary": [
    { "term": "currently", "definition": "at the present time" }
  ],
  "grammar_rule": "Subject + am/is/are + verb-ing",
  "grammar_title": "Present Continuous",
  "activity_count": 4,
  "activity_types": ["fill_blank", "multiple_choice", "translation"]
}
```

**Response:**
```json
{
  "activities": [
    {
      "id": "act_1",
      "type": "fill_blank",
      "prompt": "Maria ___ (study) for her English exam right now.",
      "correct_answer": "is studying",
      "hint": "Use present continuous form of 'study'.",
      "difficulty": "easy"
    },
    {
      "id": "act_2",
      "type": "multiple_choice",
      "prompt": "Which sentence uses the present continuous correctly?",
      "options": [
        "She is knowing the answer.",
        "They are playing soccer at the moment.",
        "He currently works in the library.",
        "I am believe you."
      ],
      "correct_answer": "They are playing soccer at the moment.",
      "hint": null,
      "difficulty": "medium"
    },
    {
      "id": "act_3",
      "type": "translation",
      "prompt": "Traduce al inglés: 'Ella está hablando por teléfono ahora mismo.'",
      "correct_answer": "She is talking on the phone right now.",
      "hint": "Use the verb 'talk' in present continuous.",
      "difficulty": "medium"
    }
  ],
  "generated_at": "2026-06-11T14:30:00Z",
  "model": "gpt-4.1-mini"
}
```

**GPT Prompt Strategy:**
- System role: "You are a language activity generator for A1-B2 English learners."
- Include vocabulary list and grammar rule in the prompt
- Force `response_format: { type: "json_object" }` — same pattern as existing chat.py
- Generate activities varied by type to avoid repetition

---

#### POST /activities/evaluate

Evaluates a student's open-ended answer (fill-blank or translation).

```
Method:  POST
Path:    /activities/evaluate
Auth:    Same as existing FastAPI
File:    backend/app/routes/activities.py (same file as /generate)
```

**Request Body:**
```json
{
  "activity_type": "fill_blank",
  "prompt": "Maria ___ (study) for her English exam right now.",
  "correct_answer": "is studying",
  "student_answer": "studying",
  "level_code": "A2"
}
```

**Response:**
```json
{
  "is_correct": false,
  "score": 60,
  "explanation": "Close! 'studying' is correct, but you need to include the auxiliary verb 'is': 'Maria **is studying** for her English exam right now.'",
  "accepted_alternatives": ["is studying"],
  "grammar_feedback": "Present continuous requires: subject + am/is/are + verb-ing"
}
```

**Notes:**
- Multiple-choice answers are evaluated client-side (exact match) — no GPT needed
- Only fill-blank and translation call this endpoint
- GPT is prompted to be lenient with minor spelling errors
- Score: 100 = fully correct, 60-80 = partially correct (right word, wrong form), 0-50 = wrong
- `accepted_alternatives` lists other valid answers (for display to student)

---

### 2.2 Modified Existing Routes

#### POST /chat/message (Modified)

Add `learning_context` parameter to enrich the tutor's system prompt.

**Current request (chat.py ChatRequest model):**
```json
{
  "id_inscripcion": 123,
  "mission_id": 5,
  "mission": { "title": "...", "description": "...", "level_code": "A2" },
  "message": "Hello, how are you?",
  "progress_percent": 45
}
```

**New fields added:**
```json
{
  "learning_context": {
    "vocabulary_studied": ["currently", "at the moment", "right now"],
    "grammar_focus": "Present Continuous",
    "grammar_rule": "Subject + am/is/are + verb-ing",
    "practice_score": 78,
    "phases_completed": ["learning", "practice"]
  },
  "conversation_history": [
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi! How are you today?" }
  ]
}
```

**Notes:**
- Both new fields are optional — backward compatible
- `conversation_history` is last 10 messages max
- `learning_context` is assembled by MissionPage from the current learning phase data
- `openai_service.get_tutor_response()` signature extends to accept these
- If `learning_context` is null, GPT prompt remains unchanged (backward compatibility)

---

### 2.3 New File Structure (Backend)

```
backend/app/routes/
├── chat.py          (existing — modified)
├── speech.py        (existing)
├── tts.py           (existing)
└── activities.py    (NEW)

backend/app/services/
├── openai_service.py     (existing — modified)
├── azure_pronunciation.py (existing)
├── google_speech.py      (existing)
├── google_tts.py         (existing)
├── progress_service.py   (existing)
└── activity_service.py   (NEW)
```

---

## 3. Summary of All API Changes

| Type | Endpoint | Status | Phase |
|---|---|---|---|
| ORDS GET | `/missions/content/:missionId` | New | P1 (DBA) |
| ORDS POST | `/progress/phase` | New | P1 (DBA) |
| ORDS GET | `/progress/phase/:idInscripcion/:missionId` | New | P1 (DBA) |
| ORDS POST | `/activities/result` | New | P1 (DBA) |
| ORDS GET | `/activities/results/:idInscripcion/:missionId` | New | P1 (DBA) |
| ORDS GET | `/progress/stats/:idInscripcion` | Modified (+2 fields) | P1b (DBA) |
| ORDS GET | `/missions/course/:idCurso/:idInscripcion` | Modified (+contentVersion) | P1b (DBA) |
| FastAPI POST | `/activities/generate` | New | P3 |
| FastAPI POST | `/activities/evaluate` | New | P3 |
| FastAPI POST | `/chat/message` | Modified (+2 optional fields) | P4 |

---

## 4. Backward Compatibility Notes

- All ORDS changes are additive (new endpoints + optional new fields on existing ones)
- `POST /chat/message` accepts `learning_context` and `conversation_history` as optional — old clients (if any) continue working
- `GET /progress/stats` new fields appear only after DB columns exist — frontend reads them with null-safe accessors
- Frontend `missionContentService.js` falls back to local content files when ORDS returns 404 — zero disruption during DBA onboarding
