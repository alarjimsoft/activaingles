# EPIC-010: Risks and Architectural Decisions

---

## Part 1: Architectural Decisions (ADR Format)

---

### ADR-01: Content Storage Strategy — Oracle Directamente

**Status:** Decidido (actualizado — reemplaza decisión previa de Opción D)
**Date:** 2026-06

**Context:**
Mission learning content (objectives, vocabulary, grammar, examples) needs to be stored somewhere. Two requirements shape this decision: (1) Oracle ADB must be the source of truth; (2) non-technical users (teachers, pedagogical coordinators) must be able to add and edit mission content without touching code or the database directly.

**Options Considered:**

| Opción | Pros | Contras |
|---|---|---|
| A: Oracle CLOB columns directamente | Fuente de verdad desde el día 1; habilita CMS no técnico; un solo origen de datos | Requiere DBA para schema + ORDS endpoints |
| B: Frontend JS files permanentes | Sin dependencia de DBA | Viola "Oracle es fuente de verdad"; no técnicos no pueden editar; requiere deploy para cambiar contenido |
| C: FastAPI JSON files | Desacopla frontend de Oracle | Misma pregunta de almacenamiento un nivel arriba; capa extra sin valor claro |
| D: JS files primero, Oracle después | Ships sin DBA | Fuente dual temporal; contenido en código; no habilita CMS no técnico |

**Decision:** Opción A — Oracle directamente, desde el inicio.

**Rationale:**
- **Sin cuello de botella con el DBA:** el equipo tiene acceso directo y disponibilidad para ejecutar los cambios de schema.
- **Requisito de CMS no técnico:** el objetivo es que coordinadores pedagógicos puedan agregar y editar contenido de misiones desde una interfaz web, sin abrir código ni hacer SQL. Esto solo es posible si Oracle es el origen desde el principio — una interfaz de edición que escriba a archivos JS no es viable.
- **Consistencia arquitectónica:** Oracle como única fuente elimina el riesgo de desincronización que introduce la Opción D.
- **Escalabilidad del contenido:** cuando el curso tenga 20 o 50 misiones, mantener archivos JS por misión es inmanejable. Oracle escala naturalmente.
- **`missionContentService.js` se simplifica:** ya no necesita lógica de fallback dual — solo lee de Oracle.

**Consequences:**
- Requiere ejecutar el DDL y los ORDS handlers de `DATABASE_CHANGES.md` antes de que el frontend pueda mostrar contenido.
- Requiere una **interfaz de gestión de contenido** (nueva página en la app) para que usuarios no técnicos puedan crear y editar contenido de misiones — ver `FRONTEND_CHANGES.md` sección CMS.
- Requiere un nuevo endpoint ORDS de escritura: `PUT /missions/content/:missionId`.
- Requiere distinción de roles en el sistema de autenticación (estudiante vs. administrador de contenido).
- El `src/content/missions/` directory **no se crea**. No hay archivos de contenido estático en el repositorio.
- `content_version` en Oracle permite invalidar caché cuando el contenido cambia.

---

### ADR-02: Phase Sequencing — Soft Gates

**Status:** Decided
**Date:** 2026-06

**Context:**
The 5 macro-phases (Learning, Practice, Conversation, Assessment, Completion) are designed to be sequential. The question is whether to enforce this sequencing strictly or allow students to navigate freely.

**Options Considered:**

| Option | Pros | Cons |
|---|---|---|
| A: Hard gates (cannot proceed without completing previous phase) | Ensures pedagogical sequence | Frustrating if student knows the material; blocks returning students |
| B: No gates (free navigation between all phases) | Maximum flexibility | Students skip preparation, defeating the purpose |
| C: Soft gates (guided but not blocked) | Balance of structure and flexibility | More complex UI state |

**Decision:** Option C — Soft gates.

**Implementation:**
- Forward navigation requires completing current phase
- Backward navigation always allowed (revisit completed phases)
- A "Skip Phase" affordance exists but is secondary (confirmation prompt)
- Returning students (mission ACTIVE, had previous session) resume at their current phase

**Rationale:**
- Hard gates create friction for motivated students who want to jump to chat
- No gates would let students click through without engaging with content
- Soft gates preserve pedagogical intent while respecting student agency
- The `MissionPhaseNavigator` makes the recommended path visually clear

---

### ADR-03: Activity Generation — Per-Session, Not Pre-Cached

**Status:** Decided
**Date:** 2026-06

**Context:**
Practice activities can be generated per student session (fresh GPT call each time) or pre-generated and stored in `MISSION_ACTIVITIES` for reuse.

**Options Considered:**

| Option | Pros | Cons |
|---|---|---|
| A: Pre-generate and cache in Oracle | Lower API cost per session; consistent for all students | DBA table needed; activities become stale; no personalization |
| B: Generate per session | Fresh, varied activities; no DBA dependency; future personalization | API cost per session; generation delay |
| C: Hybrid (cache but regenerate occasionally) | Best cost/quality ratio | Most complex |

**Decision:** Option B — Generate per session for MVP.

**Rationale:**
- `gpt-4.1-mini` cost for one generation call is negligible (< $0.002)
- Variety keeps the activity experience fresh for returning students
- No DBA table dependency (`MISSION_ACTIVITIES` is optional, not MVP)
- In-session generation allows future personalization (e.g., adjust difficulty based on last session)
- If cost becomes significant at scale, caching can be added later with minimal refactoring

**Consequences:**
- 1-2 second generation delay when entering Practice phase (show skeleton loader)
- Must have robust fallback if generation fails (student must not be blocked)
- `USER_ACTIVITY_RESULTS` stores the generated prompt so historical results are self-contained (not dependent on re-generating the same activity)

---

### ADR-04: Phase State — Component State with Oracle Persistence

**Status:** Decided
**Date:** 2026-06

**Context:**
Phase progress can live in: React component state only (lost on refresh), Zustand store (persists localStorage but can desync from Oracle), or Oracle as primary with frontend reads.

**Decision:** Component state as working copy, Oracle as persistent source of truth.

**Implementation:**
1. On `MissionPage` mount: load phase status from Oracle via `GET /progress/phase/:inscripcion/:missionId`
2. Phase state held in `MissionPage` component state during session
3. On each phase transition: write to Oracle via `POST /progress/phase`
4. On page refresh: reload from Oracle — resumes correctly

**Why not Zustand:**
- Zustand persists to `localStorage["activa-ingles-store"]`
- Zustand store already has versioning issues (TD-M04 with hardcoded initial conversations)
- Phase state is per-mission, per-session — adding it to the global store increases surface area
- Oracle is authoritative — querying it on mount is the correct pattern (same as TutorChat loading history)

---

### ADR-05: TutorChat Refactoring — Defer to Separate Epic

**Status:** Decided (defer)
**Date:** 2026-06

**Context:**
`TutorChat.jsx` (785 lines, TD-A04) is the most complex component and EPIC-010 requires extending it with `learningContext` and `onPhaseComplete` props. The question is whether to refactor it now as part of EPIC-010.

**Decision:** Defer full refactoring. Make minimum necessary changes for EPIC-010.

**Rationale:**
- Refactoring TutorChat while simultaneously adding EPIC-010 features doubles the risk
- The duplicate `sendMessage/sendTranscriptMessage` functions (TD-A05) must both receive new props regardless
- The full extraction into `useAudioRecorder`, `useTutorChat`, `useMissionProgress` hooks is valuable but independent
- A dedicated "Tech Debt Sprint" after EPIC-010 delivery is the safer path
- EPIC-010 adds 2 props and modifies the progress calculation — manageable without full refactor

**Consequence:** After EPIC-010, TutorChat will be ~820-840 lines. The refactoring debt increases slightly but remains addressable.

---

### ADR-06: Progress Formula Change — Non-Retroactive

**Status:** Decided
**Date:** 2026-06

**Context:**
Changing `progress_percent = messages × 10` to a phase-weighted formula creates inconsistency between old and new records in `USER_PROGRESS`.

**Decision:** New formula applies only to missions entered after EPIC-010 Phase 2 deployment. Old records keep their `progress_percent` value.

**Implementation:**
- Detection: if `USER_PROGRESS` row has `current_phase IS NULL` (pre-EPIC-010 default before DBA migration runs) → old formula record, display as-is
- Detection: if `current_phase` column exists and is set → new formula record
- Dashboard `avg_progress` stat mixes old and new for a period — this is acceptable

**Rationale:**
- Retroactively recalculating old progress is risky (redefines a student's history)
- Students who were 70% complete under the old formula shouldn't be shown 30% under the new
- Self-corrects as students engage with missions (new sessions create new records)

---

## Part 2: Technical Risks

### RISK-01: DBA Timeline Dependency
**Severity:** High
**Probability:** Medium
**Description:** The DB changes (new columns, new table, new ORDS endpoints) are required for full EPIC-010 functionality. If DBA bandwidth is limited, delivery of P1b, P3-persistence, and P5 could be delayed by weeks.

**Mitigation:**
- Submit DB change request at project kickoff (don't wait for P2 to be done)
- Phase 1a and Phase 2 (LearningGuide) can be deployed without any DB changes
- Interim localStorage fallback for phase tracking allows UX work to proceed

**Residual risk:** Activity results cannot persist to Oracle without `USER_ACTIVITY_RESULTS` table. Students may retake activities on refresh — this is cosmetically imperfect but not data-destroying.

---

### RISK-02: GPT Activity Quality Variance
**Severity:** Medium
**Probability:** Medium
**Description:** GPT-generated activities may be grammatically awkward, culturally irrelevant, too easy, too hard, or contain subtle errors. This directly impacts the pedagogical value of Phase 3.

**Mitigation:**
- Tight system prompt with examples of good activities (few-shot)
- Activity review mode: admin-viewable log of generated activities (Phase 3 extension)
- Fallback: if generated activities are rejected by future review, pre-author activities per mission
- A/B test: compare student performance between missions with/without activities

**Detection:** Monitor `USER_ACTIVITY_RESULTS.score` distributions. If average score < 40% consistently, prompt is too hard. If average > 95% consistently, too easy.

---

### RISK-03: Activity Evaluation Subjectivity (Translation)
**Severity:** Medium
**Probability:** High
**Description:** Translation activities are evaluated by GPT. GPT may mark a correct translation as wrong (false negative) or a wrong one as correct (false positive). This affects student confidence and XP accuracy.

**Mitigation:**
- System prompt for evaluation: be lenient, accept semantically equivalent translations
- Score range (not binary): 70+ = "close enough" shown as correct, 0-60 = incorrect
- Students can see `explanation` + `accepted_alternatives` even when marked wrong
- No retry penalty — students can't "farm" activities by resubmitting

**Open question:** Should the student be able to flag an evaluation as incorrect? This would require a reporting mechanism not in scope for EPIC-010.

---

### RISK-04: Content Creation — Mitigado por CMS (actualizado)
**Severity:** Medio (reducido de Alto tras decisión ADR-01 Opción A)
**Probability:** Medio
**Description:** EPIC-010 requiere contenido pedagógico revisado para cada misión. La creación de contenido es trabajo no trivial que debe hacer alguien con conocimiento de pedagogía del inglés.

**Mitigación (actualizada):**
- El CMS (`MissionContentEditor`) elimina la barrera técnica: el coordinador pedagógico entra a `/content` y escribe directamente sin PR, sin SQL, sin deploy
- El formulario estructurado del CMS guía al usuario no técnico (campos con labels claras, validaciones, vista previa en tiempo real)
- Flujo recomendado: usar GPT para generar un borrador, pegarlo en el CMS, el coordinador ajusta y guarda
- Lanzar con contenido de misiones 1-3 primero — misiones sin contenido van directo a TutorChat (sin bloqueo para el estudiante)
- El badge "Sin contenido" en el MissionSelector del CMS hace visible qué misiones faltan

**Timeline:** Una vez el CMS está listo, el progreso de contenido es independiente del ciclo de desarrollo — el coordinador puede crear contenido mientras el equipo construye P3 y P4 en paralelo.

---

### RISK-05: TutorChat Learning Context Increases Cost
**Severity:** Low
**Probability:** Low
**Description:** Adding `conversation_history` (10 messages × ~50 tokens) and `learning_context` (~300 tokens) to each GPT call increases cost per message.

**Current cost estimate:** ~$0.003 per full session (5 messages) → **New estimate:** ~$0.006 per full session.

**At 100 daily active students:** $0.60/day → $18/month additional. Negligible.

**At 1000 daily active students:** $6/day → $180/month additional. Still manageable.

**Mitigation:** Monitor OpenAI API costs dashboard. If costs spike unexpectedly, `conversation_history` window can be reduced from 10 to 5 messages with no code change (just change the constant).

---

### RISK-06: Pronunciation Assessment Phase Undefined
**Severity:** Low
**Probability:** Low
**Description:** Phase 7 (Pronunciation Assessment) is listed in the mission structure but not fully designed. The current pronunciation functionality is embedded in TutorChat's voice recording. A separate "Pronunciation Review" phase is implied but not specified.

**Mitigation:** In EPIC-010, Phase 7 is satisfied by existing TutorChat pronunciation functionality. The `assessment_completed = 'Y'` flag is set when the student has completed at least one voice message with pronunciation scoring. A dedicated pronunciation assessment screen (comparing student pronunciation to target phrases) is deferred to Iteration 6 / EPIC-011.

---

### RISK-07: Progress Calculation Desync
**Severity:** Low
**Probability:** Medium
**Description:** Progress is calculated in the frontend and sent to Oracle. If the student closes the browser mid-phase, the Oracle phase state may not reflect the exact completion percentage within that phase.

**Mitigation:**
- Phase transitions are binary (complete or not) — partial state within a phase is acceptable
- Oracle stores `current_phase`, not a sub-phase progress — simpler and less fragile
- On re-entry: student is placed at the start of their current (incomplete) phase
- The 2-3 minutes of re-work when re-entering an incomplete phase is acceptable

---

## Part 3: Open Questions

| # | Pregunta | Decidir antes de | Owner |
|---|---|---|---|
| OQ-01 | ¿Las misiones con estado COMPLETED muestran LearningGuide o van directo a TutorChat en re-entrada? | Diseño P2 | Product |
| OQ-02 | ¿Puede el estudiante "Saltar" una fase? ¿Qué es el UX para eso? | Diseño P2 | Product |
| OQ-03 | ¿4 actividades por sesión es el número correcto? Más = mejor aprendizaje pero más fricción. | Kickoff P3 | Pedagogía |
| OQ-04 | ¿La evaluación de actividades permite reintentos? | Diseño P3 | Product |
| OQ-05 | ~~¿Quién crea el contenido?~~ **Resuelto:** El coordinador pedagógico lo crea vía CMS. | ✓ Resuelto | — |
| OQ-06 | ¿Cuál es el `practice_score` mínimo para "pasar" la fase de práctica y desbloquear la conversación? | Kickoff P3 | Pedagogía |
| OQ-07 | ¿La evaluación de pronunciación (Fase 7) es obligatoria o el estudiante puede completar la misión sin ella? | Diseño P5 | Pedagogía |
| OQ-08 | ¿El MissionPhaseNavigator se muestra durante la pantalla de finalización? | Diseño P2 | Product |
| OQ-09 | ¿El CMS tiene auto-save o solo guarda al presionar el botón "Guardar"? | Kickoff CMS | Product |
| OQ-10 | ~~¿Qué campo de la tabla ESTUDIANTES / INSCRIPCIONES determina el rol admin? ¿O se crea una tabla separada ADMIN_USERS?~~ **Resuelto:** La tabla `ACADEMICOS` ya existe con `ROL VARCHAR2(10)`. Los usuarios admin son una entidad distinta a los estudiantes. Se requiere nuevo paquete `PKG_AUTH_ACADEMICO.LOGIN_ACADEMICO` en Oracle y endpoint `POST /auth/login-academico`. | ✓ Resuelto | — |
| OQ-11 | ~~¿El CMS es por curso o global?~~ **Resuelto:** El CMS es global — un académico puede editar el contenido de TODAS las misiones, sin filtrado por curso. | ✓ Resuelto | — |

---

## Part 4: Dependencies Map

```
EPIC-010-P0 (Fixes)
    │
    ├── Unblocks P2 (completeMission real + scores reales)
    │
    ▼
P1 (Oracle Schema + ORDS + Roles + CMS)
    │
    ├── P1-01/02/03: DDL + ORDS → unblocks missionContentService
    ├── P1-04: roles → unblocks /content route + AdminRoute
    ├── P1-05: missionContentService → unblocks P2 (LearningGuide)
    ├── P1-06: activityService → unblocks P3
    └── P1-07: MissionContentEditor CMS → entregable independiente
         (coordinador puede crear contenido mientras P2 se construye)
    │
    ▼
P2 (LearningGuide)            ← requires P0 + P1-01 + P1-05
    │
    ▼
P3 (Practice Activities)      ← requires P2 + P1-02 + P1-06
    │
    ▼
P4 (Enhanced Tutor)           ← requires P3 (practice_score)
    │
    ├── conversation_history fix deployable standalone
    ├── learning_context requires P2 to be meaningful
    │
    ▼
P5 (Completion + Analytics)   ← requires P3 + P4 + P1b
```

**Critical path:** P0 → P1a + P1b (parallel) → P2 → P3 → P4 → P5

**Earliest shippable value:** P0 + P1a + P2 (LearningGuide with local content, phase state in localStorage). This can ship without any DBA changes and delivers the pedagogical preparation phase.

---

## Part 5: Decisions Already Made (Not Up for Discussion)

1. **Oracle ADB stays as the source of truth.** No evaluation of alternatives.
2. **USER_PROGRESS stays as the pedagogical core.** All new metrics must land there.
3. **TutorChat is the practice phase, not the teaching phase.** Learning happens before chat.
4. **gpt-4.1-mini stays as the model.** Cost vs capability is acceptable for activities.
5. **No TypeScript.** JS only, per project convention.
6. **Tailwind CSS v4 only.** No CSS modules or additional styling libraries.
7. **Lucide React for icons.** No additional icon libraries.
8. **Framer Motion for animations.** No CSS transition workarounds.
