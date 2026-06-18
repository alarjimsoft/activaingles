# EPIC-010: Database Changes

**Status:** Proposal — requires DBA coordination
**Affects:** Oracle Autonomous Database (ADB) via Oracle ORDS
**Priority:** High — blocks full persistence of phase tracking and activity results

---

## 1. Impact Assessment

| Table                   | Change Type            | Severity                            | Blocking                            |
| ----------------------- | ---------------------- | ----------------------------------- | ----------------------------------- |
| `MISSIONS`              | Add columns (nullable) | Low — additive only                 | Optional (interim: content in code) |
| `USER_PROGRESS`         | Add columns (nullable) | Medium — changes progress semantics | Yes — phase tracking requires these |
| `USER_ACTIVITY_RESULTS` | New table              | Medium                              | Yes — activity persistence          |
| `MISSION_ACTIVITIES`    | New table (optional)   | Low — for caching only              | No                                  |

All changes are **additive** — no existing columns are modified or removed. Existing ORDS endpoints continue to work without modification.

---

## 2. Modified Table: MISSIONS

### Rationale

The current MISSIONS table has `grammar_title` and `grammar_example` as simple VARCHAR fields. EPIC-010 requires structured, rich content per mission: multiple objectives, a vocabulary list, a grammar explanation block, and multiple examples. These cannot fit in single VARCHARs.

### Proposed Columns to Add

```sql
ALTER TABLE MISSIONS ADD (
    objectives_json    CLOB,        -- JSON array of learning objective strings
    vocabulary_json    CLOB,        -- JSON array of vocabulary objects
    grammar_json       CLOB,        -- JSON object with grammar focus data
    examples_json      CLOB,        -- JSON array of example objects
    content_version    NUMBER DEFAULT 1,  -- for cache invalidation
    content_updated_at TIMESTAMP    -- last content update
);

-- Optional: add JSON constraint for validation
ALTER TABLE MISSIONS ADD CONSTRAINT missions_objectives_json_chk
    CHECK (objectives_json IS NULL OR objectives_json IS JSON);
ALTER TABLE MISSIONS ADD CONSTRAINT missions_vocabulary_json_chk
    CHECK (vocabulary_json IS NULL OR vocabulary_json IS JSON);
ALTER TABLE MISSIONS ADD CONSTRAINT missions_grammar_json_chk
    CHECK (grammar_json IS NULL OR grammar_json IS JSON);
ALTER TABLE MISSIONS ADD CONSTRAINT missions_examples_json_chk
    CHECK (examples_json IS NULL OR examples_json IS JSON);
```

### JSON Schema Definitions

**objectives_json** — array of strings:

```json
[
  "Use present continuous to describe ongoing actions",
  "Distinguish between present simple and present continuous",
  "Ask and answer questions about current activities"
]
```

**vocabulary_json** — array of vocabulary objects:

```json
[
  {
    "term": "currently",
    "definition": "at the present time; right now",
    "example": "She is currently studying for her exam.",
    "part_of_speech": "adverb"
  }
]
```

**grammar_json** — object with grammar rule:

```json
{
  "title": "Present Continuous",
  "rule": "Subject + am/is/are + verb-ing",
  "explanation": "We use the present continuous to talk about actions happening right now or around the current period.",
  "dos": [
    "I am working on a project right now.",
    "They are studying at the library."
  ],
  "donts": [
    "I am knowing the answer. (use: I know)",
    "She is belonging to that group. (use: She belongs)"
  ],
  "note": "Stative verbs (know, love, believe, belong) are NOT used in continuous form."
}
```

**examples_json** — array of contextual examples:

```json
[
  {
    "phrase": "What are you working on right now?",
    "context": "Asking a colleague about current tasks",
    "response": "I'm preparing a presentation for tomorrow's meeting."
  }
]
```

### Migration Notes

- All new columns are NULLABLE — existing MISSIONS rows continue working
- Oracle's native JSON support (CLOB + IS JSON constraint) is preferred over VARCHAR2 for this volume
- Content can be loaded initially via the ORDS handler or an admin import script
- `content_version` allows the frontend to cache content per version

---

## 3. Modified Table: USER_PROGRESS

### Rationale

Phase tracking cannot live only in the frontend — it must persist in Oracle so that re-entering a mission resumes at the correct phase. Activity performance must be stored to influence XP calculation.

### Proposed Columns to Add

```sql
ALTER TABLE USER_PROGRESS ADD (
    current_phase           VARCHAR2(20)  DEFAULT 'learning',
    -- Values: 'learning' | 'practice' | 'conversation' | 'assessment' | 'completed'

    learning_completed      CHAR(1)       DEFAULT 'N',
    -- 'Y' when student visits all 4 tabs in LearningGuide

    practice_completed      CHAR(1)       DEFAULT 'N',
    -- 'Y' when student finishes all activities in PracticeZone

    practice_score          NUMBER(5,2)   DEFAULT 0,
    -- Average score across practice activities (0-100)

    assessment_completed    CHAR(1)       DEFAULT 'N',
    -- 'Y' when student completes at least one pronunciation assessment

    phase_updated_at        TIMESTAMP,
    -- Last time current_phase was updated

    activities_attempted    NUMBER        DEFAULT 0,
    -- Count of practice activities attempted

    activities_correct      NUMBER        DEFAULT 0
    -- Count of activities answered correctly
);
```

### Progress Calculation Change

The `progress_percent` column changes its semantics. It will now reflect true phase completion, not message count.

**Current formula:** `progress_percent = MIN(total_messages * 10, 100)`

**New formula (to be calculated in frontend and sent to Oracle):**

```
progress_percent = (
    (learning_completed = 'Y' ? 20 : 0) +
    (practice_completed = 'Y' ? 20 : MIN(practice_score * 0.2, 20)) +
    (conversation_progress * 0.40) +      -- 0-40% based on message count in conversation phase
    (assessment_completed = 'Y' ? 20 : 0)
)
```

Where `conversation_progress = MIN(messages_in_conversation_phase / 5, 1)` — 5 messages for full contribution.

**Backward compatibility:** Missions started before EPIC-010 will have `current_phase = 'learning'` and all phase flags `'N'`. Their `progress_percent` reflects message count. On re-entry, MissionPage detects empty phase flags and redirects to learning phase.

---

## 4. New Table: USER_ACTIVITY_RESULTS

### Rationale

Practice activity performance is the primary measurement of learning in phases 1-4 of the learning guide. Results must persist to Oracle (source of truth) so they contribute to analytics and can be reviewed.

### DDL

```sql
CREATE TABLE USER_ACTIVITY_RESULTS (
    result_id           NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_inscripcion      NUMBER          NOT NULL,
    mission_id          NUMBER          NOT NULL,
    conversation_id     NUMBER,                     -- nullable: link to conversation session
    activity_type       VARCHAR2(30)    NOT NULL,   -- 'fill_blank' | 'translation' | 'multiple_choice'
    activity_prompt     CLOB            NOT NULL,   -- the question/prompt shown to student
    correct_answer      CLOB            NOT NULL,   -- expected answer
    student_answer      CLOB,                       -- what student submitted
    is_correct          CHAR(1)         DEFAULT 'N',
    score               NUMBER(5,2)     DEFAULT 0,  -- 0-100
    ai_explanation      CLOB,                       -- GPT explanation (for incorrect answers)
    attempt_number      NUMBER          DEFAULT 1,  -- 1-based, if we allow retries
    created_at          TIMESTAMP       DEFAULT SYSTIMESTAMP,
    CONSTRAINT fk_uar_inscripcion FOREIGN KEY (id_inscripcion)
        REFERENCES INSCRIPCIONES(id_inscripcion),
    CONSTRAINT fk_uar_mission FOREIGN KEY (mission_id)
        REFERENCES MISSIONS(mission_id),
    CONSTRAINT ck_uar_correct CHECK (is_correct IN ('Y', 'N')),
    CONSTRAINT ck_uar_type CHECK (activity_type IN ('fill_blank', 'translation', 'multiple_choice'))
);

CREATE INDEX idx_uar_inscripcion_mission ON USER_ACTIVITY_RESULTS(id_inscripcion, mission_id);
CREATE INDEX idx_uar_created ON USER_ACTIVITY_RESULTS(created_at);
```

---

## 5. New Table: MISSION_ACTIVITIES (Optional / Phase 2)

### Rationale

If we want to reuse AI-generated activities across students (cost optimization), or allow pedagogical experts to define canonical activity banks per mission, we need a table to store them. This is **not required** for MVP — activities can be generated fresh per session.

### DDL

```sql
CREATE TABLE MISSION_ACTIVITIES (
    activity_id         NUMBER          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mission_id          NUMBER          NOT NULL,
    activity_type       VARCHAR2(30)    NOT NULL,
    prompt              CLOB            NOT NULL,
    correct_answer      CLOB            NOT NULL,
    distractors_json    CLOB,           -- for multiple-choice: array of wrong options
    difficulty          VARCHAR2(10)    DEFAULT 'medium',  -- 'easy' | 'medium' | 'hard'
    is_ai_generated     CHAR(1)         DEFAULT 'Y',
    is_active           CHAR(1)         DEFAULT 'Y',
    created_at          TIMESTAMP       DEFAULT SYSTIMESTAMP,
    CONSTRAINT fk_ma_mission FOREIGN KEY (mission_id)
        REFERENCES MISSIONS(mission_id),
    CONSTRAINT ck_ma_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CONSTRAINT ck_ma_active CHECK (is_active IN ('Y', 'N'))
);

CREATE INDEX idx_ma_mission ON MISSION_ACTIVITIES(mission_id, is_active);
```

---

## 6. Oracle Package: PKG_AUTH_ACADEMICO

### Rationale

El sistema de autenticación actual (`PKG_AUTH.LOGIN_ESTUDIANTE`) solo opera sobre la tabla `ESTUDIANTES`. Los usuarios académicos (`ACADEMICOS`) son una entidad distinta con su propio campo `ROL VARCHAR2(10)`. Se requiere un paquete separado para autenticar a estos usuarios desde el CMS.

La tabla `ACADEMICOS` ya existe con la siguiente estructura:

```
ID_ACADEMICO    VARCHAR2(20)  NOT NULL
APELLIDOMATERNO VARCHAR2(20)
APELLIDOPATERNO VARCHAR2(20)
NOMBRE          VARCHAR2(20)
PASSWORD        VARCHAR2(512)
ROL             VARCHAR2(10)   -- 'ADMIN', 'DOCENTE', etc.
```

### Package Spec

```sql
CREATE OR REPLACE PACKAGE PKG_AUTH_ACADEMICO AS
    PROCEDURE LOGIN_ACADEMICO(
        p_id_academico IN VARCHAR2,
        p_password     IN VARCHAR2
    );
END PKG_AUTH_ACADEMICO;
/
```

### Package Body (ejemplo de implementación)

```sql
CREATE OR REPLACE PACKAGE BODY PKG_AUTH_ACADEMICO AS
    PROCEDURE LOGIN_ACADEMICO(
        p_id_academico IN VARCHAR2,
        p_password     IN VARCHAR2
    ) AS
        v_count     NUMBER;
        v_nombre    VARCHAR2(20);
        v_apepat    VARCHAR2(20);
        v_apemat    VARCHAR2(20);
        v_rol       VARCHAR2(10);
    BEGIN
        SELECT COUNT(*),
               MAX(nombre), MAX(apellidopaterno), MAX(apellidomaterno), MAX(rol)
        INTO   v_count, v_nombre, v_apepat, v_apemat, v_rol
        FROM   ACADEMICOS
        WHERE  id_academico = p_id_academico
          AND  password = p_password;  -- ajustar si el hash es diferente al de estudiantes

        IF v_count = 0 THEN
            -- ORDS devuelve 200 con success: false (mismo patrón que LOGIN_ESTUDIANTE)
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', FALSE);
            APEX_JSON.WRITE('message', 'Credenciales inválidas');
            APEX_JSON.CLOSE_OBJECT;
        ELSE
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', TRUE);
            APEX_JSON.OPEN_OBJECT('academico');
            APEX_JSON.WRITE('idAcademico', p_id_academico);
            APEX_JSON.WRITE('nombre', v_nombre);
            APEX_JSON.WRITE('apellidoPaterno', v_apepat);
            APEX_JSON.WRITE('apellidoMaterno', v_apemat);
            APEX_JSON.WRITE('rol', v_rol);
            APEX_JSON.CLOSE_OBJECT;
            APEX_JSON.CLOSE_OBJECT;
        END IF;
    END LOGIN_ACADEMICO;
END PKG_AUTH_ACADEMICO;
/
```

**Nota:** El hash de `password` debe usar el mismo mecanismo que `PKG_AUTH.LOGIN_ESTUDIANTE`. Si `ESTUDIANTES` usa SHA-256, usar el mismo en `ACADEMICOS`.

---

## 7. Required ORDS Endpoints

These must be implemented by the DBA/ORDS administrator. The frontend and FastAPI will call them.

### New Endpoints

| Method | Path                                            | Purpose                                                        | Caller       |
| ------ | ----------------------------------------------- | -------------------------------------------------------------- | ------------ |
| POST   | `/auth/loginacademicos`                         | Autenticación de usuarios académicos (ACADEMICOS table)        | Frontend     |
| GET    | `/missions/admin/list`                          | Lista todas las misiones sin requerir idInscripcion (para CMS) | Frontend CMS |
| GET    | `/missions/content/:missionId`                  | Returns content columns from MISSIONS                          | Frontend     |
| PUT    | `/missions/content/:missionId`                  | Saves/updates mission content (CMS write endpoint)             | Frontend CMS |
| POST   | `/progress/phase`                               | Updates `current_phase` + phase completion flags               | Frontend     |
| GET    | `/progress/phase/:idInscripcion/:missionId`     | Returns phase status for a mission                             | Frontend     |
| POST   | `/activities/result`                            | Saves one `USER_ACTIVITY_RESULTS` row                          | Frontend     |
| GET    | `/activities/results/:idInscripcion/:missionId` | Returns all results for a student+mission                      | Frontend     |

### Schemas adicionales (nuevos endpoints)

**POST /auth/loginacademicos**

```json
Request:
{ "x01": "DOC001", "x02": "password123" }
Content-Type: application/x-www-form-urlencoded

Response (éxito):
{
  "success": true,
  "academico": {
    "idAcademico": "DOC001",
    "nombre": "María",
    "apellidoPaterno": "García",
    "apellidoMaterno": "López",
    "rol": "ADMIN"
  }
}

Response (falla):
{ "success": false, "message": "Credenciales inválidas" }
```

**GET /missions/admin/list**

```json
Response:
[
  {
    "missionId": 1,
    "title": "Daily Conversations: Present Simple",
    "topicTitle": "Everyday English",
    "topicId": 1,
    "sortOrder": 1,
    "hasContent": true,
    "contentVersion": 2
  },
  {
    "missionId": 2,
    "title": "Meeting New People",
    "topicTitle": "Everyday English",
    "topicId": 1,
    "sortOrder": 2,
    "hasContent": false,
    "contentVersion": null
  }
]
```

El campo `hasContent` se calcula como `CASE WHEN objectives_json IS NOT NULL THEN 1 ELSE 0 END`.

**PUT /missions/content/:missionId** — ver esquema completo en `API_CHANGES.md`, sección 1.1.

### Request/Response Schemas

**POST /progress/phase**

```json
Request:
{
  "id_inscripcion": 123,
  "mission_id": 5,
  "current_phase": "practice",
  "learning_completed": "Y",
  "practice_completed": "N",
  "practice_score": 0
}

Response:
{ "success": true }
```

**POST /activities/result**

```json
Request:
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

Response:
{ "result_id": 456, "success": true }
```

**GET /missions/content/:missionId**

```json
Response:
{
  "mission_id": 5,
  "objectives_json": "[\"Use present continuous...\"]",
  "vocabulary_json": "[{\"term\":\"currently\",...}]",
  "grammar_json": "{\"title\":\"Present Continuous\",...}",
  "examples_json": "[{\"phrase\":\"What are you doing?\"}]",
  "content_version": 1
}
```

---

## 8. Interim Strategy (No DBA Required)

While awaiting DBA approval and implementation, the following approach allows frontend development to proceed:

1. **Content storage:** Mission content in `src/content/missions/{missionId}.js` files
2. **Phase tracking:** `localStorage` key `activa-phases-{idInscripcion}-{missionId}` (per student, per mission)
3. **Activity results:** Held in component state, lost on page reload (acceptable interim)

The `missionContentService.js` interface is designed so that switching from `localStorage` / local files to Oracle ORDS requires only changing the implementation, not the calling code.

---

## 9. Coordination Checklist for DBA

- [ ] Review DDL proposals in sections 2-5
- [ ] Confirm Oracle ADB CLOB supports IS JSON constraint in current version
- [ ] Create `USER_ACTIVITY_RESULTS` table
- [ ] Add phase columns to `USER_PROGRESS`
- [ ] Add content columns to `MISSIONS` (nullable, additive)
- [ ] Create `PKG_AUTH_ACADEMICO` package (sección 6) — verificar que el hash de password es compatible con `PKG_AUTH`
- [ ] Implement ORDS handler `POST /auth/loginacademicos` → `PKG_AUTH_ACADEMICO.LOGIN_ACADEMICO`
- [ ] Implement ORDS handler `GET /missions/admin/list` → query sobre MISSIONS con `hasContent` calculado
- [ ] Implement ORDS handler `GET /missions/content/:missionId` → SELECT content columns from MISSIONS
- [ ] Implement ORDS handler `PUT /missions/content/:missionId` → MERGE sobre MISSIONS (incrementa content_version)
- [ ] Implement ORDS handlers `POST /progress/phase` y `GET /progress/phase/:id/:missionId`
- [ ] Implement ORDS handlers `POST /activities/result` y `GET /activities/results/:id/:missionId`
- [ ] Grant SELECT/INSERT/UPDATE permissions al service account de ORDS
- [ ] Test todos los endpoints nuevos en dev con cURL
- [ ] Proveer ejemplos de respuesta reales para validación del frontend
