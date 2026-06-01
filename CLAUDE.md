# CLAUDE.md — Activa Inglés

Guía de contexto definitiva para sesiones de trabajo con Claude Code.
Lee este archivo antes de tocar cualquier código.

---

## 1. Resumen del Negocio

**Activa Inglés** es una plataforma educativa web para estudiantes universitarios de Latinoamérica que aprenden inglés mediante misiones gamificadas con tutor IA, evaluación de pronunciación y seguimiento de progreso.

**Propósito:** Reemplazar el aprendizaje pasivo por conversación práctica asistida por IA.
**Mercado:** Instituciones universitarias (B2B), no usuarios individuales.
**Experiencia objetivo:** Videojuego educativo, no curso tradicional.
**Fuente de verdad del negocio:** `PROJECT_VISION.md` en la raíz del proyecto.
**Documentación técnica:** directorio `docs/` (PROJECT_CONTEXT, ARCHITECTURE, COMPONENT_MAP, DATABASE_MAP, BUSINESS_RULES, GAP_ANALYSIS, TECHNICAL_DEBT).

---

## 2. Arquitectura del Sistema

### Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React + Vite | 19.2.5 / 8.0.10 |
| Estilos | Tailwind CSS v4 | 4.3.0 |
| Estado global | Zustand (con persist) | 5.0.13 |
| Routing | React Router DOM | 7.15.0 |
| Animaciones | Framer Motion | 12.38.0 |
| HTTP | fetch (nativo) + axios | mixto |
| PDF | jsPDF | 4.2.1 |
| Backend | FastAPI + Python 3.13 | — |
| IA conversacional | OpenAI GPT-4.1-mini | — |
| Speech-to-Text | Google Cloud Speech | en-US, WEBM_OPUS |
| Text-to-Speech | Google Cloud TTS | en-US-Neural2-J |
| Pronunciación | Azure Cognitive Services | Phoneme granularity |
| Base de datos | Oracle Autonomous Database | — |
| API de datos | Oracle ORDS | REST sobre ADB |

### Flujo de datos real (no el ideal)

```
Browser (React SPA)
  ├── → FastAPI localhost:8000  (chat, STT, TTS, pronunciación)
  │       ├── → OpenAI GPT-4.1-mini
  │       ├── → Google Cloud STT
  │       ├── → Google Cloud TTS
  │       ├── → Azure Pronunciation SDK
  │       └── → Oracle ORDS (solo add-xp)
  └── → Oracle ORDS directamente (auth, misiones, conversaciones, progreso)
```

**Problema arquitectónico activo:** el frontend llama a Oracle ORDS directamente para 6 de 9 servicios, bypaseando FastAPI. La visión objetivo es que TODO el tráfico pase por FastAPI.

### URLs de servicios

```
Oracle ORDS:  https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/
FastAPI:      http://127.0.0.1:8000   (solo desarrollo — sin configuración de entorno)
Frontend:     http://localhost:5173   (Vite dev server)
```

Las URLs están hardcodeadas en cada archivo de servicio. No hay archivo `.env` en el frontend.

---

## 3. Estructura de Directorios

```
activaIngles/
├── CLAUDE.md                  ← este archivo
├── PROJECT_VISION.md          ← visión oficial del producto (leer primero)
├── docs/                      ← documentación técnica completa
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── COMPONENT_MAP.md
│   ├── DATABASE_MAP.md
│   ├── BUSINESS_RULES.md
│   ├── GAP_ANALYSIS.md
│   └── TECHNICAL_DEBT.md
├── src/                       ← Frontend React
│   ├── main.jsx               ← punto de entrada
│   ├── router/AppRouter.jsx   ← definición de rutas
│   ├── pages/                 ← páginas de la SPA
│   ├── components/
│   │   ├── dashboard/         ← MissionCard
│   │   ├── mission/           ← TutorChat (crítico), MissionSidebar, MessageBubble, CorrectionCard
│   │   ├── layout/            ← Sidebar
│   │   └── ui/                ← StatCard, ProgressCard, Loader
│   ├── store/
│   │   ├── authStore.js       ← sesión del usuario (Zustand persist)
│   │   └── useAppStore.js     ← conversaciones en memoria (Zustand persist)
│   ├── services/              ← capa de acceso a APIs
│   ├── layouts/MainLayout.jsx
│   ├── routes/ProtectedRoute.jsx
│   ├── data/missions.js       ← datos estáticos LEGACY (ya no se usan en Dashboard)
│   └── utils/conversationPdf.js
├── backend/
│   ├── app/
│   │   ├── main.py            ← FastAPI app + CORS + routers
│   │   ├── routes/
│   │   │   ├── chat.py        ← POST /chat/message
│   │   │   ├── speech.py      ← POST /speech/to-text, /speech/pronunciation-score
│   │   │   └── tts.py         ← POST /tts/speak
│   │   └── services/
│   │       ├── openai_service.py
│   │       ├── azure_pronunciation.py
│   │       ├── google_speech.py
│   │       ├── google_tts.py
│   │       └── progress_service.py
│   ├── credentials/
│   │   └── google-speech.json ← credencial Google Cloud (NO commitear)
│   ├── .env                   ← API keys reales (NO commitear, en .gitignore)
│   └── requirements.txt
├── index.html
├── package.json
└── vite.config.js
```

---

## 4. Base de Datos (Oracle ADB via ORDS)

Oracle ADB es la **única fuente oficial de verdad**. Nunca diseñar lógica que contradiga o bypasee Oracle.

### Tablas principales

| Tabla | Rol |
|---|---|
| `ESTUDIANTES` | Datos del estudiante (nombre, matrícula, nivel) |
| `INSCRIPCIONES` | Relación estudiante-curso. `id_inscripcion` es el ID pedagógico principal |
| `TOPICS` | Temas que agrupan misiones |
| `MISSIONS` | Actividades pedagógicas con estado por inscripción |
| `USER_PROGRESS` | **Núcleo pedagógico.** Progreso, XP, tiempo, gramática, pronunciación por misión |
| `CONVERSATIONS` | Sesiones de conversación dentro de una misión |
| `CONVERSATION_MESSAGES` | Mensajes individuales (sender: 'student' / 'tutor') |

### Endpoints ORDS activos

```
POST /auth/login                              ← autenticación
GET  /missions/course/:idCurso/:idInscripcion ← lista de misiones con estado
POST /chat/start                              ← crea conversación
POST /chat/message                            ← guarda mensaje
GET  /chat/history/:conversationId            ← historial
POST /progress/start                          ← inicia progreso de misión
POST /progress/update                         ← actualiza métricas
POST /progress/complete                       ← ⚠️ EXISTE PERO NUNCA SE LLAMA
POST /progress/add-xp                         ← agrega XP (llamado desde FastAPI)
GET  /progress/stats/:idInscripcion           ← estadísticas del Dashboard
GET  /progress/mission/:idInscripcion/:id     ← progreso de una misión
```

---

## 5. Reglas de Negocio Críticas

Estas reglas vienen de `PROJECT_VISION.md` y son irrompibles:

1. **Oracle ADB es la fuente de verdad.** Ningún dato académico vive solo en el cliente.
2. **USER_PROGRESS es el núcleo pedagógico.** Todo progreso, XP, gramática y pronunciación converge ahí.
3. **Toda interacción relevante debe persistirse.** Mensajes, scores, tiempos — todo va a Oracle.
4. **El progreso debe ser medible.** Sin métricas ficticias ni hardcodeadas.
5. **El XP debe basarse en desempeño real.** No por actividad solamente — calidad cuenta.
6. **Aprendizaje orientado a objetivos.** Cada misión tiene objetivos específicos que deben guiar al tutor.
7. **Experiencia simple para el estudiante.** La complejidad es interna, no visible.
8. **La IA no sustituye al tutor humano.** Es el primer nivel de atención, no el único.

### Reglas de XP (implementadas en `progress_service.py`)

```python
xp += message_count * 5          # +5 por mensaje
if grammar_score >= 80: xp += 10 # +10 por buena gramática
if pronunciation_score >= 70: xp += 5   # +5
if pronunciation_score >= 80: xp += 10  # +10 adicionales
if pronunciation_score >= 90: xp += 20  # +20 adicionales
if completed: xp += 50           # +50 al completar misión
```

### Reglas de estado de misiones

- `LOCKED` → no accesible, botón deshabilitado.
- `ACTIVE` → disponible para practicar.
- `COMPLETED` → finalizada, re-entrable para repasar.
- El desbloqueo lo controla Oracle, no el frontend.

---

## 6. Componentes Críticos

### `TutorChat.jsx` — El componente más importante del sistema

**Ubicación:** `src/components/mission/TutorChat.jsx` (785 líneas)
**Responsabilidad:** Orquesta TODO el flujo de aprendizaje:
- Chat de texto con GPT
- Grabación de audio + STT + pronunciación Azure
- TTS de respuestas del tutor
- Persistencia de conversación en Oracle
- Tracking de progreso y XP
- Exportación PDF

**Al modificar este archivo:** verificar ambas funciones de envío:
- `sendMessage()` — flujo de texto
- `sendTranscriptMessage()` — flujo de voz

Ambas tienen lógica duplicada — un cambio en una debe replicarse en la otra hasta que se refactorice.

**Props que recibe:**
```jsx
<TutorChat mission={missionObject} setProgress={setProgressFn} />
```

### `openai_service.py` — Motor pedagógico

**Ubicación:** `backend/app/services/openai_service.py`
El system prompt define el comportamiento completo del tutor. El modelo es `gpt-4.1-mini` con `response_format: json_object`. La respuesta siempre tiene la forma:
```json
{ "reply": "...", "correction": { "original": "...", "corrected": "...", "explanation": "..." } | null }
```

### `authStore.js` — Estado de sesión

**Ubicación:** `src/store/authStore.js`
Persiste `{ student, inscripcion, isAuthenticated }` en `localStorage["activa-ingles-auth"]`.
`inscripcion.idInscripcion` es el ID pedagógico que se usa en TODAS las llamadas a Oracle.
`inscripcion.idCurso` es el ID del curso para cargar misiones.

---

## 7. Deuda Técnica Conocida (priorizada)

### Alta — actuar antes de producción

| ID | Problema | Ubicación |
|---|---|---|
| TD-A01 | Backend FastAPI sin autenticación | `backend/app/main.py` |
| TD-A02 | Oracle ORDS expuesto desde el browser | 6 archivos en `src/services/` |
| TD-A03 | API keys en `.env` texto plano | `backend/.env` |
| TD-A04 | TutorChat.jsx de 785 líneas | `src/components/mission/TutorChat.jsx` |
| TD-A05 | `sendMessage` y `sendTranscriptMessage` duplicados | `TutorChat.jsx:282,389` |
| TD-A06 | `speech_router` registrado 2 veces en FastAPI | `backend/app/main.py:25,28` |
| TD-A07 | `grammarScore` hardcodeado a 85 | `TutorChat.jsx:367,475` y `chat.py:53` |
| TD-A08 | `pronunciationScore: 0` en mensajes de texto | `TutorChat.jsx:477` |
| TD-A09 | Stream de micrófono nunca se cierra | `TutorChat.jsx:startListening()` |
| TD-A10 | `URL.createObjectURL` sin `revokeObjectURL` | `TutorChat.jsx:269` |
| TD-A11 | `getDashboardStats` llamado 2 veces por render | `Dashboard.jsx` + `Sidebar.jsx` |

### Media — actuar en próximas iteraciones

| ID | Problema |
|---|---|
| TD-M01 | `completeMission()` nunca se llama |
| TD-M02 | Mezcla de `fetch` y `axios` sin criterio |
| TD-M03 | URLs hardcodeadas en 10 archivos |
| TD-M04 | `useAppStore` con mensajes iniciales hardcodeados |
| TD-M05 | `totalTimeMinutes: 5` hardcodeado |
| TD-M06 | `recognize_once()` Azure bloquea event loop FastAPI |
| TD-M07 | `ffmpeg` no declarado en requirements.txt |
| TD-M08 | Sin rate limiting en el backend |
| TD-M09 | `alert()` nativo como UI de feedback |
| TD-M10 | Prompt injection en `/chat/message` |
| TD-M11 | Historial de conversación sin paginación |
| TD-M12 | Sesión sin expiración |
| TD-M13 | GPT no recibe historial de conversación |

Ver detalle completo en `docs/TECHNICAL_DEBT.md`.

---

## 8. Bugs Conocidos Activos

```
BUG-01: completeMission() en progressService.js nunca se llama
        → misiones pueden no marcarse COMPLETED en Oracle

BUG-02: speech_router registrado dos veces en backend/app/main.py
        → rutas /speech/* duplicadas en FastAPI

BUG-03: initialConversation hardcodeada en useAppStore
        → mensajes duplicados al cargar historial de Oracle en misiones 1, 2, 3

BUG-04: MissionPage no recupera misión por URL param
        → recargar /missions/:id muestra "Mission not found"

BUG-05: grammarScore siempre 85 → USER_PROGRESS.grammar_score inválido

BUG-06: pronunciationScore siempre 0 en mensajes de texto → avg_pronunciation inválido
```

---

## 9. Convenciones de Código

### Frontend (React)

- **Componentes:** PascalCase, archivos `.jsx`.
- **Servicios:** camelCase, archivos `.js`, un servicio por archivo.
- **Stores:** Zustand con `create()` + `persist()` donde se requiere persistencia.
- **Estilos:** Tailwind CSS v4 exclusivamente. Sin CSS modules ni styled-components.
- **Sin comentarios innecesarios** — el código ya existente usa comentarios de bloque para separar secciones. Mantener ese estilo solo donde agrega claridad real.
- **No agregar TypeScript** sin instrucción explícita del usuario — el proyecto usa JS puro.
- **Animaciones** con Framer Motion (`motion.div`, `AnimatePresence`). No CSS transitions complejas.
- **Iconos** con Lucide React únicamente.
- **HTTP:** consultar qué cliente usa el archivo antes de agregar una nueva llamada. Preferir `axios` para Oracle ORDS, `fetch` para FastAPI — hasta que se centralice.

### Backend (Python / FastAPI)

- **Rutas** en `backend/app/routes/` — un archivo por dominio (`chat.py`, `speech.py`, `tts.py`).
- **Servicios** en `backend/app/services/` — un archivo por servicio externo.
- **Modelos Pydantic** en el mismo archivo de la ruta que los usa.
- **Variables de entorno** via `python-dotenv` + `os.getenv()`.
- **Credenciales Google** via `GOOGLE_APPLICATION_CREDENTIALS` seteado en `main.py`.
- **Sin manejo de excepciones genérico** — los errores de servicios externos deben propagarse con mensajes claros.

### Commits

El proyecto usa commits descriptivos en español:
```
guarda pronunciation score en oracle
funcion de evaluación de pronunciación con barras de score agregada
Sistema de puntos XP y niveles funcionando
```
Mantener este estilo — español, descriptivo, sin prefijos tipo `feat:` / `fix:`.

---

## 10. Flujo Principal del Usuario

```
1. /  → LoginPage
   POST /ords/api/auth/login (matrícula + password)
   → guarda en authStore → navega a /dashboard

2. /dashboard → Dashboard
   GET /ords/api/missions/course/:idCurso/:idInscripcion
   GET /ords/api/progress/stats/:idInscripcion (×2 — Dashboard + Sidebar)
   → muestra misiones agrupadas por topic + estadísticas

3. Clic en misión ACTIVE → /missions/:id (MissionPage)
   POST /ords/api/chat/start → conversationId
   POST /ords/api/progress/start
   GET  /ords/api/progress/mission/:id/:missionId
   GET  /ords/api/chat/history/:conversationId

4. Mensaje de texto:
   POST /ords/api/chat/message (guarda mensaje estudiante)
   POST localhost:8000/chat/message → GPT → { reply, correction }
     └→ FastAPI internamente: POST /ords/api/progress/add-xp
   POST /ords/api/chat/message (guarda respuesta tutor)
   POST localhost:8000/tts/speak → audio blob → reproduce
   POST /ords/api/progress/update

5. Mensaje de voz:
   MediaRecorder → audioBlob (WebM, 4 seg fijos)
   POST localhost:8000/speech/to-text → transcript
   POST localhost:8000/speech/pronunciation-score → scores Azure
   → mismo flujo que texto con pronunciationScore real

6. Export PDF → jsPDF local, descarga inmediata
```

---

## 11. Páginas y su Estado

| Ruta | Componente | Estado |
|---|---|---|
| `/` | `LoginPage` | ✅ Completa |
| `/dashboard` | `Dashboard` | ✅ Completa |
| `/missions/:id` | `MissionPage` | ✅ Completa |
| `/progress` | `Progress` | ❌ Solo `<h1>` — implementar |
| `/library` | `Library` | ❌ Solo `<h1>` — implementar |
| `/profile` | `Profile` | ❌ Solo `<h1>` — implementar |

---

## 12. Variables de Entorno

### Backend (`backend/.env`) — NO commitear

```
OPENAI_API_KEY=sk-proj-...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
```

### Frontend — no existe `.env`, URLs hardcodeadas

Cuando se cree, usar `import.meta.env.VITE_*`:
```
VITE_API_URL=http://127.0.0.1:8000
VITE_ORACLE_URL=https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api
```

---

## 13. Comandos de Desarrollo

```bash
# Frontend
npm run dev        # Vite dev server en localhost:5173

# Backend
cd backend
python -m uvicorn app.main:app --reload   # FastAPI en localhost:8000
# o
uvicorn app.main:app --reload
```

**Requisito del sistema (no en requirements.txt):** `ffmpeg` instalado para el servicio de pronunciación.

---

## 14. Restricciones Importantes

1. **No modificar el schema de Oracle** — el DDL está en Oracle ADB, no en el repositorio. Cualquier cambio de tabla debe coordinar con el equipo que administra la base de datos.

2. **No cambiar el modelo de OpenAI** sin evaluar impacto en costos — actualmente `gpt-4.1-mini`. Cambiar a `gpt-4o` multiplica el costo significativamente.

3. **No eliminar `data/missions.js`** hasta confirmar que ninguna otra parte del sistema lo usa. Actualmente no se usa en el flujo principal (misiones vienen de Oracle), pero puede usarse en pruebas.

4. **No commitear `backend/.env` ni `backend/credentials/`** — ambos están en `.gitignore`. Si se agregan secrets accidentalmente, hacer revocación de la key antes de cualquier otra acción.

5. **El objeto `mission` se pasa vía `location.state`** al navegar a `/missions/:id`. Cualquier nuevo campo que necesite `TutorChat` debe incluirse en el objeto `mission` que arma `missionService.js`.

6. **`useAppStore` persiste en localStorage.** Si se cambia la estructura del store, agregar versión o migración — los datos viejos del usuario pueden causar errores de hidratación.

---

## 15. Roadmap Técnico

### Iteración 1 — Integridad de datos (pendiente)
- Llamar `completeMission()` al completar una misión.
- Calcular `grammarScore` real desde la respuesta de GPT.
- Medir `totalTimeMinutes` con `Date.now()`.
- Resolver `speech_router` duplicado en `main.py`.

### Iteración 2 — Calidad del tutor (pendiente)
- Pasar historial de conversación a GPT (últimos N mensajes).
- Eliminar `initialConversation` hardcodeada del store.
- Recuperar misión por `useParams` en MissionPage.
- Reemplazar `alert()` con sistema de notificaciones.

### Iteración 3 — Páginas pendientes (pendiente)
- `/progress` — historial de XP y evolución de scores.
- `/profile` — datos del estudiante.
- `/library` — recursos por topic.
- Racha de días real desde Oracle.

### Iteración 4 — Seguridad y deployment (pendiente)
- Autenticación en FastAPI.
- Variables de entorno en el frontend.
- Mover todas las llamadas ORDS detrás de FastAPI.
- Configurar CORS para producción.

### Iteración 5 — Refactorización (pendiente)
- Extraer `useAudioRecorder`, `useTutorChat`, `useMissionProgress` de TutorChat.jsx.
- Centralizar cliente HTTP.
- Cerrar stream de micrófono + revocar blob URLs.

### Iteración 6 — Fase 2 del producto (pendiente)
- Speaking Challenges con texto de referencia predefinido.
- Visualización fonémica de Azure.
- Ejercicios dinámicos generados por IA.

---

## 16. Contexto para Futuras Sesiones

**Antes de implementar cualquier cosa, verificar:**

1. ¿El cambio afecta `USER_PROGRESS`? → asegurarse de que los datos que se guardan son reales, no hardcodeados.
2. ¿El cambio toca `TutorChat.jsx`? → revisar si aplica a `sendMessage` Y a `sendTranscriptMessage` (están duplicadas).
3. ¿El cambio agrega una nueva llamada a Oracle? → considerar si debe ir directo desde el frontend o pasar por FastAPI.
4. ¿El cambio modifica el store de Zustand? → recordar que persiste en localStorage — migración puede ser necesaria.
5. ¿El cambio es en el backend? → FastAPI no tiene autenticación — cualquier nuevo endpoint es público hasta que se implemente.

**El componente que más cambiará es `TutorChat.jsx`.** Siempre leerlo completo antes de modificarlo — sus dos funciones de envío son casi idénticas y un cambio en una debe replicarse en la otra.

**El archivo más delicado del backend es `openai_service.py`.** El system prompt ahí define el comportamiento pedagógico completo del tutor. Cualquier cambio debe validarse con conversaciones de prueba reales.
