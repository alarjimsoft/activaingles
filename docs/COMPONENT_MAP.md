# COMPONENT_MAP.md
# Activa Inglés — Mapa de Componentes

---

## FRONTEND — Páginas

### LoginPage
- **Ubicación:** [src/pages/LoginPage.jsx](../src/pages/LoginPage.jsx)
- **Responsabilidad:** Formulario de autenticación con matrícula y contraseña.
- **Props:** Ninguna (página raíz).
- **Estado local:** `matricula`, `password`, `loading`, `error`.
- **Dependencias:** `authService.loginStudent`, `authStore.login`, `useNavigate`.
- **Flujo:** POST a Oracle ORDS → guarda en authStore → navega a `/dashboard`.

---

### Dashboard
- **Ubicación:** [src/pages/Dashboard.jsx](../src/pages/Dashboard.jsx)
- **Responsabilidad:** Vista principal del estudiante. Muestra estadísticas globales y lista de misiones agrupadas por topic.
- **Props:** Ninguna.
- **Estado local:** `missions[]`, `stats`.
- **Dependencias:** `missionService.getMissions`, `dashboardService.getDashboardStats`, `authStore`, `MissionCard`, `StatCard`, `ProgressCard`, `MainLayout`.
- **Nota:** Llama `getDashboardStats` en el mismo render donde `Sidebar` también lo llama — doble petición.

---

### MissionPage
- **Ubicación:** [src/pages/MissionPage.jsx](../src/pages/MissionPage.jsx)
- **Responsabilidad:** Página contenedora de una misión. Recibe el objeto `mission` de `location.state`.
- **Props:** Ninguna (usa `useLocation`).
- **Estado local:** `progress` (número 0-100).
- **Dependencias:** `MissionSidebar`, `TutorChat`, `MainLayout`, `useLocation`.
- **Nota:** Si `mission` no está en `location.state`, muestra "Mission not found" — no hay recuperación por URL params aunque la ruta es `/missions/:id`.

---

### Progress
- **Ubicación:** [src/pages/Progress.jsx](../src/pages/Progress.jsx)
- **Responsabilidad:** PENDIENTE. Solo renderiza un título.
- **Props:** Ninguna.
- **Dependencias:** `MainLayout`.

---

### Library
- **Ubicación:** [src/pages/Library.jsx](../src/pages/Library.jsx)
- **Responsabilidad:** PENDIENTE. Solo renderiza un título.
- **Props:** Ninguna.
- **Dependencias:** `MainLayout`.

---

### Profile
- **Ubicación:** [src/pages/Profile.jsx](../src/pages/Profile.jsx)
- **Responsabilidad:** PENDIENTE. Solo renderiza un título.
- **Props:** Ninguna.
- **Dependencias:** `MainLayout`.

---

## FRONTEND — Componentes de Misión

### TutorChat
- **Ubicación:** [src/components/mission/TutorChat.jsx](../src/components/mission/TutorChat.jsx)
- **Responsabilidad:** Componente central de toda la experiencia. Orquesta: chat con IA, grabación de voz, STT, pronunciación, TTS, persistencia de conversación, tracking de progreso y exportación PDF.
- **Props:**
  - `mission` (object) — Datos completos de la misión activa.
  - `setProgress` (function) — Callback para actualizar el progreso en MissionPage.
- **Estado local:** `input`, `isTyping`, `isListening`, `correction`, `conversationId`, `pronunciationResult`, `missionCompleted`.
- **Refs:** `messagesEndRef` (auto-scroll), `mediaRecorderRef`, `audioChunksRef`.
- **Dependencias:**
  - Stores: `useAppStore` (mensajes), `authStore` (inscripcion, student).
  - Servicios: `chatService`, `speechService`, `ttsService`, `pronunciationService`, `conversationService`, `progressService`.
  - Utils: `conversationPdf`.
  - Componentes: `MessageBubble`, `CorrectionCard`.
- **Tamaño:** 785 líneas — candidato prioritario a refactorización.
- **Funciones principales:**
  - `startListening()` — Inicia grabación, ejecuta STT + pronunciación + chat.
  - `sendMessage()` — Envía mensaje de texto, actualiza progreso.
  - `sendTranscriptMessage(transcript, pronunciationData)` — Variante de `sendMessage` para voz.
  - `playTutorVoice(text)` — Llama TTS y reproduce audio.

---

### MissionSidebar
- **Ubicación:** [src/components/mission/MissionSidebar.jsx](../src/components/mission/MissionSidebar.jsx)
- **Responsabilidad:** Panel lateral con información de la misión y barra de progreso.
- **Props:**
  - `mission` (object) — Datos de la misión.
  - `progress` (number, default 0) — Porcentaje de progreso actual.
- **Nota:** Los objetivos mostrados son texto genérico hardcodeado, no los objetivos reales de la misión desde Oracle.
- **Dependencias:** Ninguna externa.

---

### MessageBubble
- **Ubicación:** [src/components/mission/MessageBubble.jsx](../src/components/mission/MessageBubble.jsx)
- **Responsabilidad:** Renderiza un mensaje individual del chat (estudiante o tutor).
- **Props:**
  - `sender` (string) — `"user"` o `"tutor"`.
  - `text` (string) — Texto del mensaje.
- **Estilo:** Alineación y color cambian según `sender`. Animado con Framer Motion.

---

### CorrectionCard
- **Ubicación:** [src/components/mission/CorrectionCard.jsx](../src/components/mission/CorrectionCard.jsx)
- **Responsabilidad:** Muestra la corrección gramatical devuelta por el tutor IA.
- **Props:**
  - `correction` (object | null) — `{ original, corrected, explanation }`. Si es `null`, no renderiza.
- **Dependencias:** Framer Motion.

---

## FRONTEND — Componentes de Dashboard

### MissionCard
- **Ubicación:** [src/components/dashboard/MissionCard.jsx](../src/components/dashboard/MissionCard.jsx)
- **Responsabilidad:** Tarjeta visual de una misión con estado, info y botón de acción.
- **Props:**
  - `mission` (object) — `{ id, title, description, level, duration, status, ...resto }`.
- **Comportamiento por estado:**
  - `ACTIVE` → botón "Start Mission" (cyan), navega a `/missions/:id`.
  - `LOCKED` → botón "Locked" (gris), deshabilitado.
  - `COMPLETED` → botón "Completed" (emerald), permite re-entrar.
- **Dependencias:** `useNavigate`, Framer Motion, Lucide icons.

---

## FRONTEND — Componentes de UI

### StatCard
- **Ubicación:** [src/components/ui/StatCard.jsx](../src/components/ui/StatCard.jsx)
- **Responsabilidad:** Tarjeta de estadística simple (título, valor grande, subtítulo).
- **Props:** `title`, `value`, `subtitle`.
- **Uso:** Dashboard (5 instancias: Completed Missions, Study Time, Streak, Pronunciation, Grammar).

---

### ProgressCard
- **Ubicación:** [src/components/ui/ProgressCard.jsx](../src/components/ui/ProgressCard.jsx)
- **Responsabilidad:** Tarjeta de progreso general con indicador circular y barra lineal.
- **Props:** `progress` (%), `completed` (número), `total` (número).

---

### Loader
- **Ubicación:** [src/components/ui/Loader.jsx](../src/components/ui/Loader.jsx)
- **Responsabilidad:** Indicador de carga (no se usa actualmente en ninguna página).

---

## FRONTEND — Layout

### MainLayout
- **Ubicación:** [src/layouts/MainLayout.jsx](../src/layouts/MainLayout.jsx)
- **Responsabilidad:** Layout contenedor. Sidebar izquierda fija + área de contenido principal.
- **Props:** `children`.
- **Dependencias:** `Sidebar`.

---

### Sidebar
- **Ubicación:** [src/components/layout/Sidebar.jsx](../src/components/layout/Sidebar.jsx)
- **Responsabilidad:** Navegación lateral persistente. Muestra logo, menú, nivel del estudiante y logout.
- **Estado local:** `stats` (cargado de Oracle al montar).
- **Dependencias:** `authStore`, `dashboardService.getDashboardStats`, `useNavigate`, Framer Motion, NavLink.
- **Nota:** Duplica la llamada a `getDashboardStats` que también hace `Dashboard.jsx`.

---

## FRONTEND — Router y Rutas

### AppRouter
- **Ubicación:** [src/router/AppRouter.jsx](../src/router/AppRouter.jsx)
- **Responsabilidad:** Define todas las rutas de la SPA.
- **Rutas:**
  - `/` → `LoginPage`
  - `/dashboard` → `Dashboard` (protegida)
  - `/library` → `Library` (protegida)
  - `/progress` → `Progress` (protegida)
  - `/profile` → `Profile` (protegida)
  - `/missions/:id` → `MissionPage` (protegida)
- **Dependencias:** `AnimatePresence` (Framer Motion), `ProtectedRoute`.

---

### ProtectedRoute
- **Ubicación:** [src/routes/ProtectedRoute.jsx](../src/routes/ProtectedRoute.jsx)
- **Responsabilidad:** Guarda de rutas. Redirige a `/` si `isAuthenticated` es false.
- **Props:** `children`.
- **Dependencias:** `authStore`.

---

## FRONTEND — Stores (Estado Global)

### authStore
- **Ubicación:** [src/store/authStore.js](../src/store/authStore.js)
- **Responsabilidad:** Estado de autenticación persistido en localStorage.
- **Estado:** `student`, `inscripcion`, `isAuthenticated`.
- **Acciones:** `login(student, inscripcion)`, `logout()`.
- **Persistencia:** Zustand `persist` → `localStorage["activa-ingles-auth"]`.

---

### useAppStore
- **Ubicación:** [src/store/useAppStore.js](../src/store/useAppStore.js)
- **Responsabilidad:** Estado de conversaciones y misiones en memoria.
- **Estado:** `currentUser` (hardcoded), `missions[]`, `currentMission`, `conversations` (dict missionId → messages[]).
- **Acciones:** `setMissions`, `setCurrentMission`, `getConversation(missionId)`, `addMessage(missionId, message)`.
- **Persistencia:** Zustand `persist` → `localStorage["activa-ingles-store"]`.
- **Nota:** Contiene `initialConversation` hardcodeada para misiones 1, 2 y 3.

---

## BACKEND — Routes

### chat.py
- **Ubicación:** [backend/app/routes/chat.py](../backend/app/routes/chat.py)
- **Prefijo:** `/chat`
- **Endpoints:**
  - `POST /chat/message` — Recibe `{ id_inscripcion, mission_id, mission, message, progress_percent }`, llama a GPT, calcula XP, actualiza Oracle.
- **Modelo:** `ChatRequest` (Pydantic).
- **Dependencias:** `openai_service.get_tutor_response`, `progress_service.calculate_xp`, `progress_service.add_xp_to_progress`.

---

### speech.py
- **Ubicación:** [backend/app/routes/speech.py](../backend/app/routes/speech.py)
- **Prefijo:** `/speech`
- **Endpoints:**
  - `POST /speech/to-text` — Recibe audio UploadFile, devuelve `{ transcript }`.
  - `POST /speech/pronunciation-score` — Recibe `reference_text` + audio UploadFile, devuelve scores.
- **Nota:** Registrado DOS VECES en `main.py` (líneas 25 y 28).
- **Dependencias:** `google_speech.transcribe_audio`, `azure_pronunciation.evaluate_pronunciation`.

---

### tts.py
- **Ubicación:** [backend/app/routes/tts.py](../backend/app/routes/tts.py)
- **Prefijo:** `/tts`
- **Endpoints:**
  - `POST /tts/speak` — Recibe `{ text }`, devuelve `audio/mpeg`.
- **Modelo:** `TTSRequest` (Pydantic).
- **Dependencias:** `google_tts.generate_speech`.

---

## BACKEND — Services

### openai_service.py
- **Ubicación:** [backend/app/services/openai_service.py](../backend/app/services/openai_service.py)
- **Función:** `get_tutor_response(mission, user_message)`.
- **Responsabilidad:** Construye el system prompt con contexto de misión, llama a GPT-4.1-mini con `response_format: json_object`, devuelve `{ reply, correction }`.
- **Modelo:** `gpt-4.1-mini`, temperatura 0.7.

---

### azure_pronunciation.py
- **Ubicación:** [backend/app/services/azure_pronunciation.py](../backend/app/services/azure_pronunciation.py)
- **Función:** `evaluate_pronunciation(audio_bytes, reference_text)`.
- **Responsabilidad:** Convierte WEBM a WAV con ffmpeg, evalúa pronunciación con Azure SDK.
- **Retorna:** `{ success, recognized_text, pronunciation_score, accuracy_score, fluency_score, completeness_score }`.
- **Dependencia del sistema:** `ffmpeg` (no declarado en requirements.txt).

---

### google_speech.py
- **Ubicación:** [backend/app/services/google_speech.py](../backend/app/services/google_speech.py)
- **Función:** `transcribe_audio(audio_bytes)`.
- **Config:** WEBM_OPUS, 48000 Hz, en-US, puntuación automática.

---

### google_tts.py
- **Ubicación:** [backend/app/services/google_tts.py](../backend/app/services/google_tts.py)
- **Función:** `generate_speech(text)`.
- **Config:** Voz `en-US-Neural2-J`, MP3.

---

### progress_service.py
- **Ubicación:** [backend/app/services/progress_service.py](../backend/app/services/progress_service.py)
- **Funciones:**
  - `calculate_xp(grammar_score, pronunciation_score, message_count, completed)` — Calcula XP localmente.
  - `add_xp_to_progress(id_inscripcion, mission_id, xp_earned)` — POST a Oracle ORDS.
- **Nota:** `grammar_score` siempre recibe 85 desde `chat.py`.

---

## FRONTEND — Services

### authService.js
- **Ubicación:** [src/services/authService.js](../src/services/authService.js)
- **Función:** `loginStudent(matricula, password)` → Oracle ORDS `/auth/login`.
- **HTTP Client:** `fetch`.

### chatService.js
- **Ubicación:** [src/services/chatService.js](../src/services/chatService.js)
- **Función:** `sendChatMessage(data)` → FastAPI `localhost:8000/chat/message`.
- **HTTP Client:** `fetch`.

### conversationService.js
- **Ubicación:** [src/services/conversationService.js](../src/services/conversationService.js)
- **Funciones:** `startConversation`, `saveMessage`, `getHistory` → Oracle ORDS `/ords/api/chat/`.
- **HTTP Client:** `axios`.

### dashboardService.js
- **Ubicación:** [src/services/dashboardService.js](../src/services/dashboardService.js)
- **Función:** `getDashboardStats(idInscripcion)` → Oracle ORDS `/ords/api/progress/stats/:id`.
- **HTTP Client:** `axios`.

### missionService.js
- **Ubicación:** [src/services/missionService.js](../src/services/missionService.js)
- **Función:** `getMissions(idCurso, idInscripcion)` → Oracle ORDS `/ords/api/missions/course/:c/:i`.
- **HTTP Client:** `fetch`. Mapea respuesta a schema interno.

### progressService.js
- **Ubicación:** [src/services/progressService.js](../src/services/progressService.js)
- **Funciones:** `startProgress`, `updateProgress`, `completeMission`, `getMissionProgress` → Oracle ORDS `/ords/api/progress/`.
- **HTTP Client:** `axios` (start/update/complete), `fetch` (getMissionProgress).
- **Nota:** `completeMission` existe pero nunca se llama desde el flujo de chat.

### pronunciationService.js
- **Ubicación:** [src/services/pronunciationService.js](../src/services/pronunciationService.js)
- **Función:** `evaluatePronunciation(audioBlob, referenceText)` → FastAPI `localhost:8000/speech/pronunciation-score`.
- **HTTP Client:** `fetch`.

### speechService.js
- **Ubicación:** [src/services/speechService.js](../src/services/speechService.js)
- **Función:** `speechToText(audioBlob)` → FastAPI `localhost:8000/speech/to-text`.
- **HTTP Client:** `fetch`.

### ttsService.js
- **Ubicación:** [src/services/ttsService.js](../src/services/ttsService.js)
- **Función:** `speakText(text)` → FastAPI `localhost:8000/tts/speak`. Devuelve blob.
- **HTTP Client:** `fetch`.

---

## FRONTEND — Utils

### conversationPdf.js
- **Ubicación:** [src/utils/conversationPdf.js](../src/utils/conversationPdf.js)
- **Función:** `exportConversationPdf(mission, messages, student)`.
- **Responsabilidad:** Genera PDF con jsPDF. Incluye header (ActivaInglés, topic, misión, estudiante, fecha), mensajes con color por sender, paginación automática.
- **Limitación:** Strip de emojis y caracteres no ASCII (`/[^\x00-\x7F]/g`).
