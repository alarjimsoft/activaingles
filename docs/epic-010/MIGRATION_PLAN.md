# EPIC-010: Migration Plan

**Goal:** Transition from single-phase to multi-phase mission flow without breaking existing students' progress or the current learning experience.

---

## 1. Migration Philosophy

### Non-Destructive First

Every change must leave existing student data intact and the existing flow functional. No student should lose their conversation history, XP, or mission state because of EPIC-010 deployment.

### Incremental Delivery

EPIC-010 is divided into phases that can each be deployed independently. The system is functional at each phase boundary — no "big bang" deployment.

### Backward Compatibility by Default

New DB columns are nullable with defaults. New API fields are optional. New components are additive. Existing missions without content simply skip the learning phases and go straight to TutorChat (same as today).

---

## 2. Current State Assessment

### What exists today:

| Entity | State | Migration Needed? |
|---|---|---|
| MISSIONS table | Has `grammar_title`, `grammar_example` as VARCHAR | Yes — new CLOB columns (additive) |
| USER_PROGRESS | Tracks progress by message count | Yes — new phase columns (additive) |
| CONVERSATIONS | One new per mission entry | No change |
| CONVERSATION_MESSAGES | All messages stored | No change |
| TutorChat.jsx | Single-phase, 785 lines | Minimal props changes only |
| MissionPage.jsx | Simple container | Extended with phase state machine |
| Progress formula | `messages × 10` | Changed — must handle old records |

### What must NOT break:

1. Students with `USER_PROGRESS` rows that pre-date EPIC-010
2. The existing TutorChat conversation flow
3. Missions currently in `COMPLETED` state in Oracle
4. The XP calculation for existing messages
5. PDF export of conversation history

---

## 3. Phase-by-Phase Rollout Plan

### Phase 0 Deployment: Bug Fixes

**What deploys:**
- `main.py`: speech_router duplicate removed
- `TutorChat.jsx`: `completeMission()` wired up
- `TutorChat.jsx`: grammar score derived from GPT corrections (heuristic)
- `TutorChat.jsx`: real time tracking with `Date.now()`
- `useAppStore.js`: initial hardcoded conversation removed

**Risk:** Low. These are bug fixes. Each is independently testable.

**Rollback:** Revert commits. No DB changes in Phase 0.

**Validation:**
- Enter a mission, send 10 messages → Oracle `IS_COMPLETED = 'Y'` and `STATUS = 'COMPLETED'`
- `grammar_score` in Oracle is no longer always 85
- `total_time_minutes` reflects real elapsed time
- No duplicate messages on first visit to missions 1, 2, 3

---

### Phase 1a Deployment: Content Infrastructure (No DB)

**What deploys:**
- `src/content/missions/` directory with content files
- `missionContentService.js` (reads from local files, ORDS fallback returns null gracefully)
- `progressService.js`: new `updatePhase()` and `getPhaseStatus()` functions (exist but call localStorage only — ORDS not yet available)

**What does NOT deploy yet:** LearningGuide UI (nothing visible changes for students)

**Risk:** Very low. No user-facing change.

**Rollback:** Remove content files. `missionContentService.js` returns null → no UI impact.

---

### Phase 1b Deployment: DB Changes (DBA Required)

**What DBA deploys to Oracle:**
1. New columns on `USER_PROGRESS`: `current_phase`, `learning_completed`, `practice_completed`, `practice_score`, `assessment_completed`, `phase_updated_at`
2. New table: `USER_ACTIVITY_RESULTS`
3. New ORDS endpoint: `POST /progress/phase`
4. New ORDS endpoint: `GET /progress/phase/:idInscripcion/:missionId`
5. New ORDS endpoint: `POST /activities/result`
6. New ORDS endpoint: `GET /activities/results/:idInscripcion/:missionId`

**Existing data migration for USER_PROGRESS:**
- New columns default to: `current_phase = 'learning'`, all flags `'N'`, `practice_score = 0`
- For records where `IS_COMPLETED = 'Y'`: set `current_phase = 'completed'`, `learning_completed = 'Y'`, `practice_completed = 'Y'`, `assessment_completed = 'Y'`
- This ensures re-entering a COMPLETED mission shows completion state

```sql
-- Post-column-addition migration
UPDATE USER_PROGRESS
SET current_phase = 'completed',
    learning_completed = 'Y',
    practice_completed = 'Y',
    assessment_completed = 'Y'
WHERE is_completed = 'Y';
COMMIT;
```

**Validation:** All existing missions load correctly. New columns have proper defaults.

---

### Phase 2 Deployment: Learning Guide UI

**What deploys:**
- `MissionPhaseNavigator.jsx`
- `LearningGuide.jsx` + all tab components
- `MissionPage.jsx` updated with phase state machine
- `MissionSidebar.jsx` updated with phase indicator
- `progressService.js` updated to call `POST /progress/phase` (Phase 1b must be live)

**Behavior change:** Students entering a mission with content now see LearningGuide first.

**Backward compatibility:**
- Missions without content (`missionContentService` returns null) → MissionPage skips to `conversation` phase directly (same as before)
- Students who are mid-progress (have messages but new columns show `learning_completed = 'N'`) → Re-entering shows LearningGuide, then they can proceed to chat. Their existing conversation history loads normally in TutorChat.
- Students with `current_phase = 'completed'` → CompletionScreen shown on entry (or dashboard redirect — TBD in implementation)

**Rollback:** Revert MissionPage, MissionSidebar, remove new components. Oracle phase data stays (no harm — columns are just unused).

**Validation:**
- Mission with content: student sees LearningGuide tabs → completes → proceeds to chat
- Mission without content: student goes directly to TutorChat (unchanged)
- Existing completed mission: student can re-enter and review
- Refreshing `/missions/:id` mid-learning-guide: resumes at correct phase

---

### Phase 3 Deployment: Practice Activities

**What deploys:**
- `backend/app/routes/activities.py`
- `backend/app/services/activity_service.py`
- `src/components/mission/PracticeZone.jsx` + children
- `src/services/activityService.js`
- `MissionPage.jsx` updated to show PracticeZone between LearningGuide and TutorChat

**Behavior change:** After LearningGuide, students see 4 practice activities before TutorChat.

**Rollback for FastAPI:** Remove `activities.py` registration from `main.py`. Frontend detects 404 on `/activities/generate` and shows "Skip to Chat" button.

**Fallback within deployment:** If GPT activity generation fails during production, `PracticeZone` shows a friendly error with "Continue to Chat" — students are never blocked.

**Validation:**
- Generate activities for mission 1 → verify 4 activities with correct types
- Submit correct answer → verify score 100, correct explanation
- Submit wrong answer → verify score < 60, explanation, correct answer shown
- Activity results saved to `USER_ACTIVITY_RESULTS` in Oracle
- `USER_PROGRESS.practice_score` updated after session

---

### Phase 4 Deployment: Enhanced Tutor Context

**What deploys:**
- `openai_service.py` extended with `learning_context` and `conversation_history`
- `chat.py` extended with new optional request fields
- `TutorChat.jsx` sends `learningContext` and `conversationHistory` to `chatService`
- `chatService.js` updated to include new fields

**Behavior change:** Tutor now receives context of what student studied. Conversations become more directed.

**Risk:** Medium — changes GPT behavior. Students may notice tutor is more focused on the mission vocabulary. This is the desired behavior but should be monitored.

**Rollback:** Remove new fields from `ChatRequest` model (optional fields — removing them sends `null` → openai_service falls back to original prompt).

**Validation:**
- Send chat message after completing learning guide → GPT response references mission vocabulary
- Send chat message without learning context → GPT response unchanged from current
- 10 messages in conversation → conversation history included in 11th call → GPT shows continuity

---

### Phase 5 Deployment: Completion & Analytics

**What deploys:**
- `CompletionScreen.jsx`
- Phase-based progress calculation in `MissionPage`
- Updated XP calculation in `progress_service.py`
- Dashboard updates (if Phase 1b columns are live)

**Risk:** Low — completion screen is additive. XP calculation change may affect XP earned per session (students may earn more or fewer points per message depending on their grammar score).

**Progress calculation migration:**
- Pre-EPIC-010 missions: their `progress_percent` was calculated by `messages × 10`. These values remain as-is in Oracle — they reflect the old formula.
- Post-EPIC-010 missions: progress reflects phase completion.
- The Dashboard "avg_progress" stat will mix old and new formulas temporarily. This is acceptable — it self-corrects as students engage with missions.

---

## 4. Content Creation Strategy

The biggest non-technical risk is content creation. Each mission needs:
- 3 learning objectives
- 5-8 vocabulary words with definitions and examples
- 1 grammar rule with explanation, dos, don'ts
- 3-5 example phrases with context

**Recommended approach:**

1. **Pilot with Mission 1** — team writes content manually, validates UX
2. **GPT-assisted drafting** — use GPT to draft content for missions 2-N, then expert review
3. **Content review process** — each mission content approved by at least one pedagogical reviewer before publishing
4. **Versioning** — `content_version` field allows updates without breaking cached content

**Estimated effort:** 1-2 hours per mission for expert content creation + 30 min review. For 8 missions: ~12-16 hours total.

---

## 5. Rollback Plan (per phase)

| Phase | Rollback Method | Data Loss Risk |
|---|---|---|
| P0 | Revert commits | None |
| P1a | Remove content files | None |
| P1b | Cannot undo new Oracle columns (nullable — no impact) | None |
| P2 | Revert MissionPage, remove LearningGuide components | None (Oracle phase data stays harmless) |
| P3 | Remove activities.py from main.py; remove PracticeZone | Activity results in Oracle stay (no issue) |
| P4 | Remove new ChatRequest fields; openai_service falls back to original prompt | None |
| P5 | Revert CompletionScreen; revert progress formula | None |

---

## 6. Feature Flag Strategy (Optional)

If a more controlled rollout is needed, a simple feature flag can gate the EPIC-010 flow:

**localStorage-based flag (simplest):**
```js
// In missionContentService.js
const LEARNING_PATH_ENABLED = localStorage.getItem('activa-learning-path') === 'true';
```

This lets the team enable the new flow per-device for testing without a full deployment toggle system.

**Oracle-based flag (more robust):**
Add `enable_learning_path CHAR(1) DEFAULT 'N'` to the `INSCRIPCIONES` table. This lets the DBA enable the feature per course or per student group without a code deploy. Not required for initial rollout but useful for phased institutional rollout.

---

## 7. Validation Checklist (Pre-Deploy Each Phase)

### Pre-P2 (LearningGuide):
- [ ] Mission 1 content file exists and loads correctly
- [ ] `missionContentService.getMissionContent(1)` returns valid object
- [ ] `missionContentService.getMissionContent(999)` returns null (no crash)
- [ ] Phase state machine transitions correctly: learning → practice → conversation → completed
- [ ] Oracle `POST /progress/phase` receives and saves data
- [ ] Re-entering mission resumes at correct phase
- [ ] Mission without content still goes directly to TutorChat

### Pre-P3 (Practice Activities):
- [ ] `POST /activities/generate` returns 4 activities in correct schema
- [ ] Fill-blank activity renders correctly (blank visible)
- [ ] Multiple-choice evaluation works client-side
- [ ] Translation evaluation via GPT returns reasonable score
- [ ] Failed generation shows fallback + "Continue to Chat" button
- [ ] Activity result saved to Oracle
- [ ] `USER_PROGRESS.practice_score` updated

### Pre-P4 (Enhanced Tutor):
- [ ] Chat with `learning_context` → GPT response mentions mission vocabulary
- [ ] Chat without `learning_context` → GPT response identical to pre-EPIC-010
- [ ] Conversation history (10 messages) included in call without errors
- [ ] Token count within acceptable range

### Pre-P5 (Completion):
- [ ] `completeMission()` called → Oracle `IS_COMPLETED = 'Y'`, `STATUS = 'COMPLETED'`
- [ ] CompletionScreen shows correct XP breakdown
- [ ] "Next Mission" navigates to next ACTIVE mission
- [ ] Phase-based progress (100% only after all phases done) works correctly
