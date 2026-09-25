# EPIC-010: Mission Learning Path — Implementation Plan

**Branch:** `epic/mission-learning-path`
**Status:** Planning
**Author:** Luis Ángel
**Date:** 2026-06
**Model:** Hybrid (Static Content + AI-Generated Activities)

---

## 1. Executive Summary

EPIC-010 transforms missions from single-phase conversation experiences into structured 8-phase learning units. The Hybrid Model delivers pedagogically consistent static content (objectives, vocabulary, grammar, examples) alongside AI-generated practice activities that adapt to each student's performance.

The current flow — enter mission → chat with tutor → done — skips the preparation that makes conversation practice meaningful. Students arrive at the conversation without vocabulary or grammar scaffolding, which limits the quality of their output and the accuracy of their pronunciation scores.

After EPIC-010, students follow a guided learning path before reaching the tutor, which is expected to improve grammar scores, pronunciation scores, and mission completion rates.

---

## 2. Current State vs. Target State

### Current Mission Flow

```
Dashboard (click ACTIVE mission)
  → MissionPage loads
      → TutorChat initializes (conversation starts immediately)
          → Student chats (text or voice)
          → Progress = message_count × 10
          → Mission "complete" at 10 messages (alert only, Oracle not updated)
```

**Problems with current flow:**
- Students start chatting without preparation
- Progress is a proxy metric (message count), not real learning
- Grammar and pronunciation scores are corrupted (hardcoded values)
- Completion never persists to Oracle
- TutorChat has no context of what the student prepared

### Target Mission Flow

```
Dashboard (click ACTIVE mission)
  → MissionPage loads
      → Phase 1: Learning Objectives    [static, ~2 min]
      → Phase 2: Vocabulary Guide       [static, ~5 min]
      → Phase 3: Grammar Focus          [static, ~5 min]
      → Phase 4: Examples               [static, ~3 min]
      → Phase 5: Practice Activities    [AI-generated, ~10 min]
      → Phase 6: Tutor Conversation     [existing TutorChat, enhanced]
      → Phase 7: Pronunciation Check    [existing, enhanced]
      → Phase 8: Mission Completion     [new completion screen]
```

**What changes:**
- Student arrives at TutorChat prepared
- Progress reflects real phase completion, not message count
- Grammar score derived from GPT corrections (fix TD-A07)
- Pronunciation score real for all voice messages
- Mission completion persists to Oracle (fix BUG-01)
- Tutor receives learning context in its system prompt

---

## 3. Architecture Overview

### Component Hierarchy (Target)

```
MissionPage
├── MissionPhaseNavigator          [NEW] — top-level phase stepper
├── Phase 1-4: LearningGuide       [NEW] — tabbed static content viewer
│   ├── ObjectivesTab
│   ├── VocabularyTab
│   ├── GrammarTab
│   └── ExamplesTab
├── Phase 5: PracticeZone          [NEW] — AI activity container
│   ├── ActivityCard               [NEW] — individual activity
│   └── ActivityFeedback           [NEW] — result + explanation
├── Phase 6: TutorChat             [MODIFIED] — receives learning context
├── Phase 7: PronunciationReview   [MODIFIED] — enhanced summary view
├── Phase 8: CompletionScreen      [NEW] — mission summary + XP breakdown
└── MissionSidebar                 [MODIFIED] — shows current phase
```

### Data Flow (Target)

```
MissionPage
  reads mission from Oracle (via missionService)
  reads mission content from content files (Phase 1 / interim)
  reads USER_PROGRESS to determine current phase
  writes phase completion events to Oracle via progressService
  passes learning context to TutorChat props
  passes current phase to MissionSidebar

FastAPI (new)
  POST /activities/generate
    ← mission content context
    → GPT-4.1-mini (activity generation prompt)
    → returns 3-5 activities

  POST /activities/evaluate
    ← student_answer + correct_answer + activity_type
    → GPT-4.1-mini (evaluation prompt)
    → returns { is_correct, score, explanation }

Oracle ORDS (new endpoints, Phase 1 implementation)
  POST /progress/phase          — marks a phase as completed
  POST /activities/result       — saves USER_ACTIVITY_RESULTS row
  GET  /activities/results/:idInscripcion/:missionId
```

### Content Storage Strategy (Hybrid/Incremental)

Given the constraint that Oracle schema changes require DBA coordination:

| Content Type | Interim Storage | Target Storage |
|---|---|---|
| Learning Objectives | `src/content/missions/*.js` | `MISSIONS.objectives_json` (Oracle) |
| Vocabulary | `src/content/missions/*.js` | `MISSIONS.vocabulary_json` (Oracle) |
| Grammar Focus | `src/content/missions/*.js` | `MISSIONS.grammar_json` (Oracle) |
| Examples | `src/content/missions/*.js` | `MISSIONS.examples_json` (Oracle) |
| AI Activities | FastAPI (generated per-session) | FastAPI + optional MISSION_ACTIVITIES cache |
| Activity Results | Oracle `USER_ACTIVITY_RESULTS` | Same |
| Phase Progress | Oracle `USER_PROGRESS` (new cols) | Same |

The `missionContentService.js` frontend service abstracts the source — the same interface works whether reading from local files or Oracle.

---

## 4. Phase Breakdown

### Phase 0 — Prerequisites (Must complete before EPIC-010)

Fix existing bugs that EPIC-010 depends on or will inherit.

| Item | Ref | Description |
|---|---|---|
| Fix completeMission() | BUG-01 / TD-M01 | Mission must persist COMPLETED state to Oracle |
| Fix grammarScore | TD-A07 | Must derive from GPT corrections, not hardcode 85 |
| Fix real time tracking | TD-M05 | Measure `Date.now()` delta, not hardcode 5 min |
| Fix speech_router duplicate | TD-A06 | One registration in main.py |
| Fix message deduplication | TD-M04 | Remove hardcoded initial messages from useAppStore |

**Why Phase 0 first:** EPIC-010 adds new phases that produce metrics (activity scores, grammar scores). If the underlying measurement infrastructure is broken, the new metrics will be as corrupted as the current ones.

---

### Phase 1 — Data Layer & Content Infrastructure

Establish the data foundations EPIC-010 requires. Oracle es la única fuente desde el inicio — no hay archivos de contenido en el repositorio.

**Deliverables:**
- DDL ejecutado en Oracle ADB: nuevas columnas en MISSIONS, nuevas tablas, nuevos handlers ORDS
- `missionContentService.js` — lee exclusivamente de Oracle ORDS
- `USER_PROGRESS` actualizado con columnas de fase
- ORDS endpoints para contenido, fases y actividades
- `activityService.js` — frontend service para activity API calls
- **Interfaz de gestión de contenido** (CMS) para que usuarios no técnicos creen contenido de misiones

**Orden de trabajo:** DDL y ORDS primero → luego missionContentService.js → luego LearningGuide UI → luego CMS.

---

### Phase 2 — Learning Guide (Phases 1-4 of the mission)

Build the static content presentation experience.

**Deliverables:**
- `LearningGuide.jsx` component with 4 tabs
- `MissionPhaseNavigator.jsx` — step indicator at top of MissionPage
- Updated `MissionPage.jsx` — phase state machine (`learning | practice | conversation | assessment | completion`)
- Updated `MissionSidebar.jsx` — shows current phase, not just progress bar
- Phase 1-4 completion tracked in Oracle via `POST /progress/phase`
- Phase 2 unlocks after Phase 1 complete (all tabs visited)

---

### Phase 3 — Practice Activities (Phase 5 of the mission)

AI-generated activities based on mission content.

**Deliverables:**
- `activity_service.py` — FastAPI service, calls GPT for generation and evaluation
- `POST /activities/generate` FastAPI route
- `POST /activities/evaluate` FastAPI route
- `PracticeZone.jsx` — container for activity session
- `ActivityCard.jsx` — renders one activity (type-polymorphic)
- `ActivityFeedback.jsx` — shows result, score, explanation
- 3 activity types: fill-in-blank, translation, multiple-choice
- Activity score saved to Oracle `USER_ACTIVITY_RESULTS`
- `practice_score` averaged and saved to `USER_PROGRESS`

---

### Phase 4 — Enhanced Tutor Conversation (Phase 6)

Make TutorChat aware of what the student learned in phases 1-5.

**Deliverables:**
- `openai_service.py` updated system prompt: includes vocabulary, grammar focus, activity score summary
- Conversation history passed to GPT (last N messages) — fixes TD-M13
- `TutorChat.jsx` receives `learningContext` prop from MissionPage
- Progress calculation changes: conversation contributes 40% of total, not 100%
- Minimum conversation requirement: 5 messages (not 10) to complete this phase

---

### Phase 5 — Completion & Analytics

Enhanced completion experience and dashboard updates.

**Deliverables:**
- `CompletionScreen.jsx` — shows XP breakdown by phase, scores, next mission preview
- Phase-based progress: Learning 20% + Practice 20% + Conversation 40% + Pronunciation 20%
- XP calculation updated to include activity score bonuses
- Dashboard stats updated to show new metrics (if Oracle columns available)
- `POST /progress/complete` actually called (fix BUG-01 final integration)

---

## 5. Epic / Story / Task Breakdown

### EPIC-010-P0: Prerequisites

**STORY-P0-01: Fix completeMission() Integration**
- Task: Call `completeMission()` from TutorChat when `progress >= 100`
- Task: Replace `alert()` with notification system (ALT-06 already done)
- Task: Verify Oracle status updates to COMPLETED
- Estimate: 3 pts

**STORY-P0-02: Real Grammar Score from GPT**
- Task: Parse GPT response — count corrections vs messages to derive a score
- Task: Remove hardcoded `grammarScore = 85` in TutorChat.jsx
- Task: Remove hardcoded `grammar_score = 85` in chat.py
- Task: Update `updateProgress` call with real score
- Estimate: 5 pts

**STORY-P0-03: Real Time Tracking**
- Task: Add `sessionStartTime = Date.now()` on mission enter
- Task: Calculate elapsed minutes on each `updateProgress` call
- Task: Pass real `totalTimeMinutes` to Oracle
- Estimate: 2 pts

**STORY-P0-04: Fix speech_router Duplicate**
- Task: Remove duplicate import and `include_router` call in `main.py`
- Task: Verify /speech/* endpoints still work after fix
- Estimate: 1 pt

**STORY-P0-05: Remove Hardcoded Initial Conversation**
- Task: Remove `initialConversation` data from `useAppStore.js`
- Task: Verify missions 1, 2, 3 load correctly from Oracle history
- Task: Add loading state while history loads
- Estimate: 3 pts

---

### EPIC-010-P1: Data Layer & Content Infrastructure

**STORY-P1-01: Oracle Schema — Columnas de contenido en MISSIONS**
- Task: Ejecutar DDL: agregar `objectives_json`, `vocabulary_json`, `grammar_json`, `examples_json`, `content_version` a MISSIONS
- Task: Agregar constraint IS JSON a cada columna CLOB
- Task: Crear ORDS handler `GET /missions/content/:missionId`
- Task: Crear ORDS handler `PUT /missions/content/:missionId` (para el CMS)
- Estimate: 5 pts

**STORY-P1-02: Oracle Schema — Tablas nuevas**
- Task: Ejecutar DDL: crear `USER_ACTIVITY_RESULTS`
- Task: Crear ORDS handler `POST /activities/result`
- Task: Crear ORDS handler `GET /activities/results/:inscripcion/:missionId`
- Estimate: 4 pts

**STORY-P1-03: Oracle Schema — Columnas de fase en USER_PROGRESS**
- Task: Ejecutar DDL: agregar `current_phase`, `learning_completed`, `practice_completed`, `practice_score`, `assessment_completed`
- Task: Ejecutar SQL de migración: registros COMPLETED existentes → todos los flags en 'Y'
- Task: Crear ORDS handler `POST /progress/phase`
- Task: Crear ORDS handler `GET /progress/phase/:idInscripcion/:missionId`
- Estimate: 5 pts

**STORY-P1-04: Sistema de roles para CMS**
- Task: Agregar campo `rol` (o `is_admin`) a la respuesta de `POST /auth/login`
- Task: `authStore.js` persiste el rol junto con los datos del estudiante
- Task: Nueva ruta protegida `/content` — solo accesible si `rol === 'admin'`
- Task: `ProtectedRoute.jsx` extendido: `<AdminRoute>` verifica rol
- Estimate: 4 pts

**STORY-P1-05: missionContentService.js**
- Task: Lee exclusivamente de Oracle ORDS `GET /missions/content/:missionId`
- Task: Cache en memoria por `(missionId, content_version)` — evita refetch innecesario
- Task: Retorna `{ objectives[], vocabulary[], grammar{}, examples[] }` o `null` si no hay contenido
- Task: `hasContent(missionId)` — usado por MissionPage para mostrar/omitir LearningGuide
- Estimate: 2 pts

**STORY-P1-06: activityService.js**
- Task: `generateActivities(missionContext)` — llama FastAPI
- Task: `evaluateActivity(answer, activity)` — llama FastAPI
- Task: `saveActivityResult(result)` — llama Oracle ORDS
- Estimate: 3 pts

**STORY-P1-07: MissionContentEditor — CMS para usuarios no técnicos**
- Task: Nueva página `src/pages/MissionContentEditor.jsx`
- Task: Selector de misión al inicio (dropdown con todas las misiones del curso)
- Task: Formulario de Objetivos: lista editable (agregar/reordenar/eliminar ítems de texto)
- Task: Formulario de Vocabulario: tarjetas editables `{término, definición, ejemplo, parte del discurso}` con botones agregar/eliminar
- Task: Formulario de Gramática: campos estructurados `{título, regla, explicación, dos[], donts[], nota}`
- Task: Formulario de Ejemplos: filas editables `{frase, contexto, respuesta}`
- Task: Vista previa en tiempo real: muestra cómo verá el estudiante el contenido (componentes reales de LearningGuide)
- Task: Botón "Guardar" → `PUT /missions/content/:missionId` → notificación de éxito
- Task: Indicador de misiones sin contenido (badge "Sin contenido" en el selector)
- Estimate: 13 pts

---

### EPIC-010-P2: Learning Guide

**STORY-P2-01: MissionPhaseNavigator Component**
- Task: Visual step indicator (8 steps or 5 macro-phases)
- Task: Shows current phase, completed phases, locked phases
- Task: Animated with Framer Motion
- Estimate: 3 pts

**STORY-P2-02: LearningGuide Component**
- Task: Container with 4 tabs (Objectives, Vocabulary, Grammar, Examples)
- Task: Tab navigation with completion tracking per tab
- Task: "Continue" button enabled only when all tabs visited
- Task: Persist tab visit state (at minimum in component state, ideally in Oracle)
- Estimate: 5 pts

**STORY-P2-03: ObjectivesTab**
- Task: Renders ordered list of learning objectives
- Task: Student can mark each objective as read/understood
- Task: Visual checkmark feedback per objective
- Estimate: 2 pts

**STORY-P2-04: VocabularyTab**
- Task: Word list with definition and example sentence
- Task: Visual design: word card with translation reveal
- Task: Optional: TTS for each vocabulary word (reuse ttsService)
- Estimate: 3 pts

**STORY-P2-05: GrammarTab**
- Task: Grammar rule with explanation
- Task: Rule breakdown with highlighted pattern
- Task: Do/Don't examples section
- Estimate: 3 pts

**STORY-P2-06: ExamplesTab**
- Task: Phrase cards with context note
- Task: Optional: TTS for each example phrase
- Task: Encourages repetition before conversation
- Estimate: 2 pts

**STORY-P2-07: MissionPage Phase State Machine**
- Task: Add `currentPhase` state to MissionPage
- Task: Phase transitions: `learning → practice → conversation → assessment → completion`
- Task: Load `current_phase` from `USER_PROGRESS` on mission start
- Task: Resume at correct phase when re-entering mission
- Estimate: 5 pts

**STORY-P2-08: MissionSidebar Phase Awareness**
- Task: Replace plain progress bar with phase indicator
- Task: Show: phase name + completion percentage within phase
- Task: Animate phase transitions
- Estimate: 3 pts

---

### EPIC-010-P3: Practice Activities

**STORY-P3-01: activity_service.py**
- Task: `generate_activities(mission_context, activity_count=4)` — calls GPT with structured prompt
- Task: GPT prompt generates activities in JSON format: `[{type, prompt, options?, correct_answer, hint}]`
- Task: `evaluate_answer(activity, student_answer)` — GPT evaluates open answers (fill-blank, translation)
- Task: Error handling for generation failures (fallback to simpler prompt)
- Estimate: 5 pts

**STORY-P3-02: FastAPI /activities/generate Route**
- Task: `POST /activities/generate` — accepts `{mission_id, vocabulary, grammar, level_code}`
- Task: Calls `activity_service.generate_activities()`
- Task: Returns `activities[]` array
- Task: Pydantic models for request/response
- Estimate: 3 pts

**STORY-P3-03: FastAPI /activities/evaluate Route**
- Task: `POST /activities/evaluate` — accepts `{activity_type, prompt, correct_answer, student_answer}`
- Task: For multiple-choice: exact match (no GPT needed)
- Task: For fill-blank/translation: calls GPT to evaluate semantically
- Task: Returns `{is_correct, score, explanation}`
- Estimate: 3 pts

**STORY-P3-04: PracticeZone Component**
- Task: Loads activities from FastAPI on mount
- Task: Shows loading state during generation
- Task: Manages activity sequence (1 of 4, 2 of 4, etc.)
- Task: Shows final score summary when all activities done
- Task: "Continue to Chat" enabled when score >= threshold (60%)
- Estimate: 5 pts

**STORY-P3-05: ActivityCard Component**
- Task: Type-polymorphic: renders fill-blank / translation / multiple-choice
- Task: Submit button + input validation
- Task: Passes answer to parent for evaluation
- Estimate: 5 pts

**STORY-P3-06: Fill-in-Blank Activity Type**
- Task: Sentence with blank rendered as input field
- Task: Answer evaluated via `/activities/evaluate` (GPT semantic)
- Task: Accepts minor spelling variations as correct
- Estimate: 2 pts

**STORY-P3-07: Translation Activity Type**
- Task: Spanish phrase shown, student writes English translation
- Task: Evaluated semantically by GPT (not exact match)
- Task: Multiple correct translations accepted
- Estimate: 2 pts

**STORY-P3-08: Multiple-Choice Activity Type**
- Task: Question + 4 options rendered as radio buttons or clickable cards
- Task: Evaluated client-side (exact match)
- Task: No GPT call needed
- Estimate: 2 pts

**STORY-P3-09: ActivityFeedback Component**
- Task: Shows after each activity submission
- Task: Correct: green animation + score + positive reinforcement
- Task: Incorrect: shows correct answer + explanation
- Task: "Next" button to proceed to next activity
- Estimate: 3 pts

**STORY-P3-10: Activity Results Persistence**
- Task: Save each result to `USER_ACTIVITY_RESULTS` via activityService
- Task: Calculate session `practice_score` = average of all activity scores
- Task: Update `USER_PROGRESS.practice_score` and `practice_completed = 'Y'`
- Estimate: 3 pts

---

### EPIC-010-P4: Enhanced Tutor Conversation

**STORY-P4-01: Learning Context in GPT System Prompt**
- Task: `openai_service.py` receives `learning_context` parameter
- Task: System prompt includes: vocabulary list, grammar rule, practice_score summary
- Task: Example: "The student just studied [vocabulary]. They scored [X]% on practice. Guide them to use these words naturally."
- Task: FastAPI `/chat/message` route updated to accept and pass `learning_context`
- Task: `chatService.js` and `TutorChat.jsx` updated to send learning context
- Estimate: 5 pts

**STORY-P4-02: Conversation History for GPT**
- Task: `TutorChat.jsx` maintains message history array in component state
- Task: `openai_service.py` accepts `conversation_history` parameter
- Task: GPT call includes last N messages (N=10 initially) as context
- Task: Fix TD-M13
- Estimate: 3 pts

**STORY-P4-03: Learning-Aware TutorChat Initialization**
- Task: MissionPage passes `learningContext` prop to TutorChat
- Task: `learningContext` includes vocabulary, grammar, examples, practice_score
- Task: TutorChat displays phase context in sidebar (e.g., "Today's focus: Present Continuous")
- Estimate: 3 pts

**STORY-P4-04: Conversation Progress Rules**
- Task: Change conversation phase completion: minimum 5 messages (not 10)
- Task: Progress within conversation phase: 0→40% of total, messages-driven
- Task: Combined: Learning(20) + Practice(20) + Conversation(40) + Assessment(20) = 100%
- Estimate: 3 pts

---

### EPIC-010-P5: Completion & Analytics

**STORY-P5-01: CompletionScreen Component**
- Task: Triggered when all phases complete (not just alert)
- Task: Shows: XP earned breakdown, grammar score, pronunciation score, practice score
- Task: Shows: time spent, comparison to previous missions
- Task: "Next Mission" button (if ACTIVE), "Review" button (to revisit)
- Task: Calls `completeMission()` on mount (Oracle COMPLETED)
- Estimate: 5 pts

**STORY-P5-02: Phase-Based Progress Calculation**
- Task: Remove `progress = messages * 10` formula
- Task: New formula: `progress = (learning_pct * 0.20) + (practice_pct * 0.20) + (conversation_pct * 0.40) + (assessment_pct * 0.20)`
- Task: Each phase contributes its sub-percentage weighted
- Task: All calculations happen in frontend, result sent to Oracle
- Estimate: 5 pts

**STORY-P5-03: Activity Score in XP Calculation**
- Task: Update `progress_service.py`: `calculate_xp` receives `practice_score` parameter
- Task: +15 XP if `practice_score >= 60`
- Task: +30 XP if `practice_score >= 80`
- Task: +50 XP if `practice_score >= 95`
- Estimate: 2 pts

**STORY-P5-04: Dashboard Analytics Update**
- Task: Dashboard shows new metrics if Oracle columns available
- Task: Adds "Avg Practice Score" stat card (replaces hardcoded Grammar card)
- Task: Pronunciation card now shows real average (after TD-A08 fix)
- Estimate: 3 pts

---

## 6. Complexity Estimates

| Story Group | Story Points | Risk |
|---|---|---|
| P0: Prerequisites | 14 | Bajo — fixes conocidos |
| P1: Data Layer + CMS | 36 | Medio — Oracle primero, CMS con rol de admin |
| P2: Learning Guide | 26 | Medio — UI de contenido |
| P3: Practice Activities | 33 | Medio-Alto — calidad de generación IA |
| P4: Enhanced Tutor | 14 | Medio — prompt engineering |
| P5: Completion | 15 | Bajo-Medio |
| **Total** | **138** | |

Note: 1 story point ≈ 0.5–1 día de desarrollo. Total ≈ 14–17 semanas a 1 desarrollador.

---

## 7. Prioritized Implementation Backlog

Ordenado por valor entregado considerando que Oracle está disponible desde el inicio:

| Prioridad | Story | Fase | Pts | Dependencia |
|---|---|---|---|---|
| 1 | P0-01 Fix completeMission | P0 | 3 | Ninguna |
| 2 | P0-02 Real grammar score | P0 | 5 | Ninguna |
| 3 | P0-03 Real time tracking | P0 | 2 | Ninguna |
| 4 | P0-04 Fix speech_router | P0 | 1 | Ninguna |
| 5 | P0-05 Remove hardcoded conversation | P0 | 3 | Ninguna |
| 6 | P1-01 Oracle: columnas contenido MISSIONS | P1 | 5 | Acceso a Oracle |
| 7 | P1-02 Oracle: tablas nuevas | P1 | 4 | P1-01 |
| 8 | P1-03 Oracle: columnas fase USER_PROGRESS | P1 | 5 | P1-01 |
| 9 | P1-04 Sistema de roles (auth + rutas) | P1 | 4 | Ninguna |
| 10 | P1-05 missionContentService.js | P1 | 2 | P1-01 |
| 11 | P1-06 activityService.js | P1 | 3 | P1-02 |
| 12 | P1-07 MissionContentEditor (CMS) | P1 | 13 | P1-01, P1-04 |
| 13 | P2-07 MissionPage phase state machine | P2 | 5 | P1-03, P1-05 |
| 14 | P2-01 MissionPhaseNavigator | P2 | 3 | P2-07 |
| 15 | P2-02 LearningGuide component | P2 | 5 | P2-01 |
| 16 | P2-03 ObjectivesTab | P2 | 2 | P2-02 |
| 17 | P2-04 VocabularyTab | P2 | 3 | P2-02 |
| 18 | P2-05 GrammarTab | P2 | 3 | P2-02 |
| 19 | P2-06 ExamplesTab | P2 | 2 | P2-02 |
| 20 | P2-08 MissionSidebar phase awareness | P2 | 3 | P2-07 |
| 21 | P3-01 activity_service.py | P3 | 5 | P1-05 |
| 22 | P3-02 /activities/generate route | P3 | 3 | P3-01 |
| 23 | P3-03 /activities/evaluate route | P3 | 3 | P3-01 |
| 24 | P3-04 PracticeZone component | P3 | 5 | P3-02 |
| 25 | P3-05 ActivityCard component | P3 | 5 | P3-04 |
| 26 | P3-06 Fill-in-blank type | P3 | 2 | P3-05 |
| 27 | P3-07 Translation type | P3 | 2 | P3-03 |
| 28 | P3-08 Multiple-choice type | P3 | 2 | P3-05 |
| 29 | P3-09 ActivityFeedback component | P3 | 3 | P3-05 |
| 30 | P3-10 Activity results persistence | P3 | 3 | P1-02, P1-06 |
| 31 | P4-02 Conversation history for GPT | P4 | 3 | Ninguna |
| 32 | P4-01 Learning context in GPT prompt | P4 | 5 | P1-05, P2-02 |
| 33 | P4-03 Learning-aware TutorChat init | P4 | 3 | P4-01 |
| 34 | P4-04 Conversation progress rules | P4 | 3 | P2-07 |
| 35 | P5-02 Phase-based progress calculation | P5 | 5 | P4-04 |
| 36 | P5-03 Activity score in XP | P5 | 2 | P3-10 |
| 37 | P5-01 CompletionScreen | P5 | 5 | P5-02 |
| 38 | P5-04 Dashboard analytics update | P5 | 3 | P5-01 |

**MVP Cut line — primer entregable con valor real:**
Items 1–12 (P0 completo + Oracle schema + CMS) entregan la capacidad de crear contenido de misiones sin tocar código. Un coordinador pedagógico puede entrar al CMS y agregar vocabulario, gramática y objetivos antes de que P2 (LearningGuide) esté construido. Eso permite preparar el contenido en paralelo al desarrollo de la UI del estudiante.

---

## 8. Success Metrics

| Metric | Baseline | Target |
|---|---|---|
| Mission completion rate | ~30% (estimated, completeMission not called) | >60% |
| Avg grammar score | 85 (fake) | Real score from GPT corrections |
| Avg pronunciation score | ~20 (0 for text msgs) | >60 (with learning prep) |
| Avg practice activity score | N/A | >70% |
| Session time before chat | 0 min | 10-15 min (learning phases) |
| Student conversation quality | Baseline | Measurable via tutor corrections |

---

## 9. Dependencies Summary

| Dependency | Type | Blocker For | Mitigation |
|---|---|---|---|
| DBA: MISSIONS content columns | External | P1-04, P1b Oracle migration | Use content files (interim) |
| DBA: USER_ACTIVITY_RESULTS table | External | P3-10, P1-05 | Build UI first, persist later |
| DBA: USER_PROGRESS phase columns | External | Phase tracking in Oracle | Track in frontend state (interim) |
| Content creation (mission files) | Internal | P2 — all tabs need content | Pilot with 1 mission first |
| GPT activity quality | AI | P3 — all activity types | Define strict generation prompts |
