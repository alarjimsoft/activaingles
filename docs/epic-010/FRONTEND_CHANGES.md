# EPIC-010: Frontend Changes

**Stack:** React 19 + Vite + Zustand + Tailwind CSS v4 + Framer Motion + Lucide React
**No TypeScript:** JS only (per project convention)
**No CSS modules:** Tailwind v4 exclusively

---

## 1. New Pages

### 1.1 MissionContentEditor (CMS)

**Location:** `src/pages/MissionContentEditor.jsx`
**Route:** `/content` (protegida por `AdminRoute` — solo usuarios con `rol === 'admin'`)
**Purpose:** Interfaz de gestión de contenido para usuarios no técnicos (coordinadores pedagógicos, docentes). Permite crear y editar el contenido de aprendizaje de cada misión sin tocar código ni la base de datos directamente.

#### Flujo de usuario (admin)

```
/content
  → Selector de misión (dropdown)
      → Muestra: misiones del curso con indicador "Con contenido / Sin contenido"
  → Panel de edición con 4 secciones (tabs o acordeón):
      → Objetivos
      → Vocabulario
      → Gramática
      → Ejemplos
  → Vista previa en tiempo real (panel derecho)
  → Botón "Guardar" → PUT /missions/content/:missionId → toast de confirmación
```

#### Estructura del componente

```
MissionContentEditor
├── MissionSelector            — dropdown de misiones con estado de contenido
├── ContentEditorPanel         — panel izquierdo: formularios de edición
│   ├── ObjectivesEditor       — lista editable de objetivos
│   ├── VocabularyEditor       — tarjetas editables de vocabulario
│   ├── GrammarEditor          — formulario estructurado de gramática
│   └── ExamplesEditor         — filas editables de ejemplos
└── ContentPreviewPanel        — panel derecho: vista previa con los mismos
    └── LearningGuide          —   componentes que ve el estudiante (read-only)
```

#### MissionSelector

- Dropdown que lista todas las misiones del curso (cargadas de ORDS)
- Cada opción muestra: `[M1] Daily Conversations — ✓ Con contenido` o `[M3] At the Office — ○ Sin contenido`
- Al seleccionar una misión: carga contenido existente de Oracle (GET /missions/content/:missionId)
- Si no hay contenido: inicializa formularios vacíos listos para escribir

#### ObjectivesEditor

- Lista de ítems de texto: cada ítem tiene input de texto + botón eliminar (Trash2 icon)
- Botón "Agregar objetivo" al final de la lista
- Arrastrar para reordenar (drag-and-drop con HTML5 nativo o una biblioteca mínima)
- Validación: mínimo 1 objetivo, máximo 5

#### VocabularyEditor

- Tarjetas apiladas: cada una tiene campos `término`, `definición`, `ejemplo`, `parte del discurso` (select)
- Botón "Agregar palabra" agrega tarjeta nueva al final
- Botón eliminar por tarjeta
- Validación: mínimo 3 palabras, máximo 10

#### GrammarEditor

- Campos individuales con labels claras:
  - `Título` (ej. "Present Continuous") — input texto
  - `Regla` (ej. "Subject + am/is/are + verb-ing") — input texto
  - `Explicación` — textarea
  - `Ejemplos correctos (DO)` — lista editable igual que ObjectivesEditor
  - `Errores comunes (DON'T)` — lista editable
  - `Nota adicional` — textarea opcional
- Validación: título, regla y explicación son requeridos

#### ExamplesEditor

- Filas editables: cada fila tiene `frase`, `contexto` (opcional), `respuesta esperada`
- Botón "Agregar ejemplo"
- Mínimo 2 ejemplos, máximo 6

#### ContentPreviewPanel

- Panel derecho (desktop) o tab "Vista previa" (mobile)
- Renderiza `LearningGuide` en modo read-only con el contenido del formulario en tiempo real
- El estudiante verá exactamente esto
- Header: "Así lo verá el estudiante"
- Actualiza en tiempo real mientras el admin escribe (debounce 300ms)

#### Guardado

- Botón "Guardar contenido" (primary, disabled si no hay cambios)
- Al guardar: PUT /missions/content/:missionId → toast "Contenido guardado correctamente"
- Indicador de cambios sin guardar: badge "Sin guardar" visible si hay cambios locales
- Auto-save opcional (a definir en OQ-09)

#### Acceso y navegación

- Aparece en el Sidebar solo si `authStore.student.rol === 'admin'`
- Ícono: `LayoutTemplate` (Lucide)
- Label: "Contenido" en el menú lateral
- Si un estudiante navega directamente a `/content`: `AdminRoute` redirige a `/dashboard`

---

### 1.2 MissionPage

Sigue siendo la única ruta para el flujo del estudiante. Ver sección 3.

---

---

## 2. New Components

### 2.1 MissionPhaseNavigator

**Location:** `src/components/mission/MissionPhaseNavigator.jsx`
**Purpose:** Top-of-page stepper showing the 5 macro-phases. Acts as both progress indicator and navigation breadcrumb.

**Props:**
```js
{
  currentPhase: 'practice',          // 'learning' | 'practice' | 'conversation' | 'assessment' | 'completed'
  completedPhases: ['learning'],     // array of completed phase names
  onPhaseClick: (phase) => void      // only for completed phases (revisit)
}
```

**Visual design:**
```
[1 Learning ✓] → [2 Practice ●] → [3 Chat ○] → [4 Pronunciation ○] → [5 Complete ○]
```

- Completed phases: filled icon + checkmark, clickable to revisit
- Current phase: filled circle, highlighted (cyan)
- Locked phases: empty circle, muted color, not clickable
- Connects phases with animated progress line
- Animated with Framer Motion on phase transitions

**Behavior:**
- Does NOT gate navigation (soft gates — student can revisit completed phases)
- Locked phases show tooltip: "Complete [previous phase] first"
- Compact on mobile: shows phase name + step number only

---

### 2.2 LearningGuide

**Location:** `src/components/mission/LearningGuide.jsx`
**Purpose:** Tabbed content viewer for the static learning material (phases 1-4 of the mission structure). The student must visit all 4 tabs before the "Continue to Practice" button enables.

**Props:**
```js
{
  missionContent: {
    objectives: [],
    vocabulary: [],
    grammar: {},
    examples: []
  },
  onComplete: () => void,    // called when all tabs visited + continue clicked
  isCompleted: false         // true if student already completed this phase
}
```

**Tab structure:**
- Tab 1: Objectives (BookOpen icon)
- Tab 2: Vocabulary (BookMarked icon)
- Tab 3: Grammar Focus (Pencil icon)
- Tab 4: Examples (MessageSquare icon)

**Completion logic:**
- Internal state: `visitedTabs = Set()` — adds tab key on each visit
- "Continue" button activates when `visitedTabs.size === 4`
- If `isCompleted === true`: show all tabs normally, "Continue" immediately active, banner: "You've already completed this section. Review anytime."
- Tab visit state is persisted to parent, which saves to Oracle on complete

**Child components:**

---

### 2.3 ObjectivesTab

**Location:** `src/components/mission/learning/ObjectivesTab.jsx`
**Purpose:** Renders learning objectives as a visual checklist.

**Props:** `{ objectives: string[] }`

**Design:**
- Each objective: cyan checkmark icon (CheckCircle2 Lucide) + objective text
- Objectives animate in staggered (Framer Motion: `staggerChildren`)
- Below the list: motivational text ("Master these goals by the end of this mission")

---

### 2.4 VocabularyTab

**Location:** `src/components/mission/learning/VocabularyTab.jsx`
**Purpose:** Word cards with definition, example, and optional audio.

**Props:** `{ vocabulary: [{term, definition, example, part_of_speech}] }`

**Design:**
- Grid of word cards (2 columns on desktop, 1 on mobile)
- Each card: term (large, bold) + part of speech badge + definition + example sentence
- Audio button (Volume2 Lucide) calls `ttsService.speakText(term)` to pronounce the word
- Card hover: subtle lift animation (Framer Motion)

**Behavior:**
- Audio button tracks which words have been listened to (optional future metric)
- No completion gate per word — just visit the tab

---

### 2.5 GrammarTab

**Location:** `src/components/mission/learning/GrammarTab.jsx`
**Purpose:** Grammar rule card with rule, explanation, and do/don't examples.

**Props:** `{ grammar: { title, rule, explanation, dos[], donts[], note } }`

**Design:**
- Header: grammar title + rule formula (highlighted in code-like style)
- Explanation paragraph
- Two columns: ✅ DO examples (green) | ❌ DON'T examples (red/orange)
- Note block (if present): amber/yellow callout box
- Optional: audio for rule formula (TTS)

---

### 2.6 ExamplesTab

**Location:** `src/components/mission/learning/ExamplesTab.jsx`
**Purpose:** Contextual example cards to model real conversation.

**Props:** `{ examples: [{phrase, context, response}] }`

**Design:**
- Each example: context label (italic, muted) + phrase (bold, large) + response (tutor-style bubble)
- Audio button on phrase + response (TTS)
- Encouragement text: "Listen and practice these phrases before chatting with the tutor"

---

### 2.7 PracticeZone

**Location:** `src/components/mission/PracticeZone.jsx`
**Purpose:** Container managing the full practice activity session (phase 5).

**Props:**
```js
{
  missionContent: {},       // vocabulary + grammar for activity generation
  missionId: 5,
  levelCode: 'A2',
  onComplete: (score) => void,  // called with average score when done
  isCompleted: false,           // true = show summary only
  previousScore: null           // previous session score if isCompleted
}
```

**State:**
- `activities: []` — fetched from FastAPI on mount
- `currentActivityIndex: 0`
- `results: []` — array of `{activityId, score, isCorrect}`
- `phase: 'loading' | 'activity' | 'feedback' | 'summary'`

**Flow:**
```
mount → fetch activities from FastAPI
     → show activity 1
     → student submits → evaluate → show feedback
     → next activity
     → after last: show summary + score
     → onComplete(averageScore) called
```

**Error handling:**
- If FastAPI `/activities/generate` fails: show fallback message with "Skip to Chat" option
- Generation errors must NOT block the student from reaching TutorChat

---

### 2.8 ActivityCard

**Location:** `src/components/mission/ActivityCard.jsx`
**Purpose:** Renders a single practice activity. Type-polymorphic.

**Props:**
```js
{
  activity: {
    id, type, prompt, options?, correct_answer, hint, difficulty
  },
  onSubmit: (answer) => void,
  isEvaluating: false    // shows loading during GPT evaluation
}
```

**Activity type rendering:**

| Type | Input | Evaluation |
|---|---|---|
| `fill_blank` | Text input (the blank rendered as `[___]` in prompt) | FastAPI `/activities/evaluate` |
| `translation` | Textarea (multi-word answer) | FastAPI `/activities/evaluate` |
| `multiple_choice` | 4 radio-button-style cards | Client-side exact match |

**Shared UI:**
- Activity number badge + difficulty dot (green=easy, yellow=medium, red=hard)
- Prompt rendered prominently
- Hint toggleable (ChevronDown icon, hidden by default)
- Submit button disabled until answer is non-empty

---

### 2.9 ActivityFeedback

**Location:** `src/components/mission/ActivityFeedback.jsx`
**Purpose:** Result display after activity submission.

**Props:**
```js
{
  isCorrect: true,
  score: 100,
  correctAnswer: 'is studying',
  studentAnswer: 'studying',
  explanation: 'Close! You need the auxiliary verb "is".',
  onNext: () => void,        // "Next Activity" or "See Results"
  isLast: false
}
```

**Design:**
- Correct: green pulse animation + ✓ icon + score badge + positive message (randomized)
- Incorrect: gentle red shake + ✗ icon + shows `correctAnswer` highlighted + `explanation`
- "Next" button always visible — student is not re-prompted on wrong answer
- Score displayed: `+X pts` animated counter

---

### 2.10 CompletionScreen

**Location:** `src/components/mission/CompletionScreen.jsx`
**Purpose:** Mission completion celebration screen (Phase 8). Replaces the current `alert()`.

**Props:**
```js
{
  mission: {},
  scores: {
    grammarScore: 82,
    pronunciationScore: 74,
    practiceScore: 88,
    totalXp: 145,
    timeMinutes: 23
  },
  nextMission: null | {},    // next ACTIVE mission if any
  onReview: () => void,      // go back to conversation view
  onDashboard: () => void    // navigate to Dashboard
}
```

**Design:**
- Full-screen overlay with confetti animation (CSS-based, no library needed)
- XP breakdown card: shows each XP source (messages, grammar, pronunciation, practice, completion)
- Scores comparison if student has done this mission before
- "Next Mission →" button (primary, calls onDashboard then auto-opens next mission)
- "Review Conversation" (secondary)
- Accessible: focus trap, keyboard navigable

---

## 3. Modified Components

### 3.1 MissionPage.jsx

**Current responsibility:** Container that receives `mission` from `location.state`, holds `progress` state, renders `MissionSidebar` + `TutorChat`.

**New responsibilities:**
- Phase state machine: `currentPhase` state (`learning | practice | conversation | assessment | completed`)
- Loads `missionContent` from `missionContentService`
- Loads phase status from Oracle (or localStorage interim) on mount
- Passes `learningContext` prop to TutorChat
- Renders correct phase component based on `currentPhase`
- Handles phase transitions (with Oracle phase persistence)

**New state:**
```js
const [currentPhase, setCurrentPhase] = useState('learning');
const [completedPhases, setCompletedPhases] = useState([]);
const [missionContent, setMissionContent] = useState(null);
const [learningContext, setLearningContext] = useState(null);
const [practiceScore, setPracticeScore] = useState(0);
const [progress, setProgress] = useState(0);
```

**Phase transition handler:**
```js
const advancePhase = async (fromPhase, toPhase, metadata = {}) => {
  // 1. Mark fromPhase as completed in state
  // 2. Persist to Oracle via progressService.updatePhase()
  // 3. Update progress_percent
  // 4. Set currentPhase = toPhase
};
```

**Rendering logic:**
```jsx
{currentPhase === 'learning' && <LearningGuide ... />}
{currentPhase === 'practice' && <PracticeZone ... />}
{currentPhase === 'conversation' && <TutorChat ... />}
{currentPhase === 'assessment' && <TutorChat ... />}  // same component, assessment mode
{currentPhase === 'completed' && <CompletionScreen ... />}
```

**IMPORTANT:** TutorChat remains as-is in terms of its internal logic. MissionPage only adds the wrapping phase flow. The interface between MissionPage and TutorChat changes minimally (new `learningContext` prop + new `onComplete` behavior).

---

### 3.2 MissionSidebar.jsx

**Current:** Shows mission info + single progress bar.

**Modified to show:**
- Current phase label (e.g., "Practice Activities — Step 2 of 5")
- Phase-specific progress within the current phase
- Overall mission progress bar (unchanged, but value is now phase-weighted)
- Vocabulary reminder section (collapsible): shows 3-4 key words from VocabularyTab
- Mission objectives summary (collapsible)

**New prop:**
```js
{
  mission: {},
  progress: 45,
  currentPhase: 'practice',
  missionContent: null | {}  // if null: sidebar unchanged from current
}
```

---

### 3.3 TutorChat.jsx

**Current:** Orquesta chat, voice, scoring, persistence — 785 lines.

**Changes for EPIC-010 (minimal, no internal refactoring):**

1. **New prop:** `learningContext` — object passed from MissionPage
2. **New prop:** `onPhaseComplete` — callback when conversation phase is done
3. **Updated:** `sendMessage()` and `sendTranscriptMessage()` pass `learningContext` and `conversationHistory` to `chatService.sendChatMessage()`
4. **Updated:** Mission complete threshold changes: conversation phase completes at 5 messages in conversation (not 10 overall)
5. **Updated:** `progressPercent` comes from MissionPage now (phase-weighted), not calculated independently
6. **Removed:** `progress = messages * 10` formula (moved to MissionPage phase calculation)

**Prop signature changes:**
```js
// Current
<TutorChat mission={mission} setProgress={setProgress} />

// New
<TutorChat 
  mission={mission} 
  setProgress={setProgress}
  learningContext={learningContext}   // NEW
  onPhaseComplete={handlePhaseComplete}  // NEW
/>
```

**Note on TD-A04/TD-A05:** The full refactoring of TutorChat into separate hooks (`useAudioRecorder`, `useTutorChat`, `useMissionProgress`) is NOT part of EPIC-010. Those are separate tech-debt items for a future sprint. EPIC-010 makes the minimum changes needed.

---

### 3.4 MissionCard.jsx

**Changes:** Show a "Learning Path" badge on missions that have content available.

- If `missionContent` is available for this mission: show small pill badge "Learning Guide ✓"
- No behavioral change — click still navigates to MissionPage

---

## 4. New Services (Frontend)

### 4.1 missionContentService.js

**Location:** `src/services/missionContentService.js`
**Purpose:** Lee contenido de misión exclusivamente desde Oracle ORDS. También expone la función de escritura usada por el CMS.

**Functions:**
```js
// Lee contenido desde Oracle. Retorna null si la misión no tiene contenido aún.
async function getMissionContent(missionId)

// Guarda contenido en Oracle. Retorna { success, content_version }.
// Usado por MissionContentEditor.
async function saveMissionContent(missionId, contentData)

// True si la misión tiene contenido en Oracle.
async function hasContent(missionId)

// Invalida la entrada de caché para forzar re-fetch tras un PUT exitoso.
function invalidateCache(missionId)
```

**Implementation (solo Oracle, sin fallback a archivos):**
```
1. Revisar caché en memoria: Map<missionId, { content, version }>
2. GET /ords/api/missions/content/:missionId
   - 200: guardar en caché + retornar contenido parseado
   - 404: retornar null (la misión no tiene contenido aún — MissionPage omite LearningGuide)
   - Error de red: propagar, MissionPage maneja con try/catch
3. saveMissionContent: PUT /ords/api/missions/content/:missionId
   - 200: invalidar caché + retornar { success, content_version }
```

**HTTP client:** `axios` (consistente con otros servicios que llaman Oracle ORDS).

---

### 4.2 activityService.js

**Location:** `src/services/activityService.js`
**Purpose:** Calls FastAPI for activity generation and evaluation, and Oracle ORDS for result persistence.

**Functions:**
```js
// Calls FastAPI /activities/generate
async function generateActivities(missionContext)

// Calls FastAPI /activities/evaluate (for fill_blank and translation only)
async function evaluateActivity(activity, studentAnswer)

// Evaluates multiple_choice client-side (no API call)
function evaluateMultipleChoice(activity, studentAnswer)

// Saves result to Oracle ORDS /activities/result
async function saveActivityResult(result)

// Gets all results for a student-mission pair
async function getActivityResults(idInscripcion, missionId)
```

**HTTP client:** `fetch` (consistent with FastAPI calls) for FastAPI endpoints, `axios` for Oracle ORDS (consistent with `conversationService.js` and `progressService.js`).

---

## 5. No src/content/missions/ Directory

**Decisión ADR-01 (actualizada):** Oracle es la única fuente de contenido. No se crea directorio `src/content/missions/`. No hay archivos JS de contenido estático en el repositorio. Todo el contenido vive en las columnas CLOB de la tabla MISSIONS y se gestiona a través del CMS (`MissionContentEditor`).

---

## 6. State Management Changes

### 6.1 useAppStore.js

**Changes:**
- Remove `initialConversation` hardcoded messages (Phase 0, STORY-P0-05)
- No structural changes needed for EPIC-010 phases
- Phase state is managed in `MissionPage` component state (not global store) — phases are per-session, not cross-page

**Why not in store:** Phase state is local to a single mission session. Persisting it globally would complicate store versioning. It persists to Oracle (source of truth) and is loaded fresh on each mission entry.

### 6.2 authStore.js

**Cambio para ADR-01 / sistema de roles:**
- El endpoint `POST /auth/login` de Oracle debe retornar un campo `rol` (o `is_admin`) en la respuesta
- `authStore.js` persiste ese campo junto con `student` e `inscripcion`
- Acción `login(student, inscripcion)` extendida a `login(student, inscripcion, rol)`
- El `rol` queda disponible como `authStore.rol` en toda la app

```js
// authStore.js — estado extendido
{
  student: { nombre, matricula, nivel },
  inscripcion: { idInscripcion, idCurso },
  rol: 'student' | 'admin',   // NEW
  isAuthenticated: false
}
```

---

## 7. Routing Changes

### Nueva ruta: /content

```jsx
// AppRouter.jsx
<Route path="/content" element={
  <AdminRoute>
    <MissionContentEditor />
  </AdminRoute>
} />
```

### AdminRoute

**Location:** `src/routes/AdminRoute.jsx`

```jsx
// Redirige a /dashboard si el usuario no tiene rol admin
function AdminRoute({ children }) {
  const { isAuthenticated, rol } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/" />;
  if (rol !== 'admin') return <Navigate to="/dashboard" />;
  return children;
}
```

### Sidebar

El link a `/content` aparece en el menú de `Sidebar` solo si `rol === 'admin'`:

```jsx
{rol === 'admin' && (
  <NavLink to="/content">
    <LayoutTemplate size={18} />
    <span>Contenido</span>
  </NavLink>
)}
```

### Fases del estudiante (sin cambio de URL)

Las fases de la misión NO se representan en la URL. La ruta `/missions/:id` sigue siendo única para toda la experiencia del estudiante. Las fases son estado de sesión — se cargan de Oracle al entrar y se persisten en cada transición.

---

## 8. Modified Services (Existing)

### progressService.js

Add new function (alongside existing ones):
```js
// New: updates phase completion in Oracle
async function updatePhase(idInscripcion, missionId, phaseData)

// New: loads phase status from Oracle
async function getPhaseStatus(idInscripcion, missionId)
```

No modifications to existing functions (`startProgress`, `updateProgress`, `completeMission`, `getMissionProgress`).

### chatService.js

**Modified:** `sendChatMessage(data)` adds optional fields to the request body:
```js
async function sendChatMessage({ 
  id_inscripcion, mission_id, mission, message, progress_percent,
  learning_context,      // NEW optional
  conversation_history   // NEW optional
})
```

---

## 9. Component Dependency Map (After EPIC-010)

```
MissionPage
├── MissionPhaseNavigator [NEW]
├── MissionSidebar [MODIFIED]
│   └── uses missionContent for vocabulary reminder
├── LearningGuide [NEW]
│   ├── ObjectivesTab [NEW]
│   ├── VocabularyTab [NEW]   → ttsService
│   ├── GrammarTab [NEW]
│   └── ExamplesTab [NEW]    → ttsService
├── PracticeZone [NEW]
│   ├── ActivityCard [NEW]
│   └── ActivityFeedback [NEW]
├── TutorChat [MODIFIED]   → receives learningContext
│   ├── MessageBubble
│   └── CorrectionCard
└── CompletionScreen [NEW]
```

---

## 10. UX Design Principles for EPIC-010

1. **Soft gates, not hard walls.** Students are encouraged but not blocked from skipping phases. The UI communicates the recommended path without locking the student out.

2. **State recovery on re-entry.** If a student leaves mid-mission (browser close, navigation), Oracle phase state is loaded on re-entry and the student resumes exactly where they were.

3. **Vocabulary always accessible.** The MissionSidebar vocabulary reminder stays visible during TutorChat so students can reference words without leaving the chat phase.

4. **Activities never break the flow.** If activity generation fails (FastAPI down, GPT error), the student gets a graceful fallback message and can proceed directly to TutorChat. Activities are value-add, not a gate.

5. **Completion feels like a win.** The CompletionScreen shows the XP breakdown with animation — the student should feel accomplished. This replaces the current `alert()`.

6. **Phase indicator is always visible.** `MissionPhaseNavigator` is sticky at the top of MissionPage. Students always know where they are in the learning journey.
