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

| Capa              | Tecnología                 | Versión             |
| ----------------- | -------------------------- | ------------------- |
| Frontend          | React + Vite               | 19.2.5 / 8.0.10     |
| Estilos           | Tailwind CSS v4            | 4.3.0               |
| Estado global     | Zustand (con persist)      | 5.0.13              |
| Routing           | React Router DOM           | 7.15.0              |
| Animaciones       | Framer Motion              | 12.38.0             |
| HTTP              | fetch (nativo) + axios     | mixto               |
| PDF               | jsPDF                      | 4.2.1               |
| Backend           | FastAPI + Python 3.13      | —                   |
| IA conversacional | OpenAI GPT-4.1-mini        | —                   |
| Speech-to-Text    | Google Cloud Speech        | en-US, WEBM_OPUS    |
| Text-to-Speech    | Google Cloud TTS           | en-US-Neural2-J     |
| Pronunciación     | Azure Cognitive Services   | Phoneme granularity |
| Base de datos     | Oracle Autonomous Database | —                   |
| API de datos      | Oracle ORDS                | REST sobre ADB      |

### Flujo de datos real (no el ideal)

```
Browser (React SPA)
  ├── → FastAPI /api  (chat, STT, TTS, pronunciación, actividades, quizzes, login de académicos)
  │       ├── → OpenAI GPT-4.1-mini
  │       ├── → Google Cloud STT
  │       ├── → Google Cloud TTS
  │       ├── → Azure Pronunciation SDK
  │       ├── → Oracle ORDS módulo "quiz" (OAuth client credentials, solo FastAPI)
  │       └── → Google Cloud Storage (bucket de los quizzes, URLs firmadas)
  ├── → Google Cloud Storage directo (el académico sube audios con URL firmada)
  └── → Oracle ORDS directamente (auth de estudiantes, misiones, conversaciones, progreso)
```

**Problema arquitectónico activo:** el frontend sigue llamando a Oracle ORDS directamente para misiones, conversaciones y progreso, bypaseando FastAPI. Los quizzes ya van solo por FastAPI (el módulo ORDS `quiz` devuelve respuestas correctas y está protegido con OAuth). La visión objetivo es que TODO el tráfico pase por FastAPI.

### URLs de servicios

```
Producción:   https://alarjimsoft.web.app   (Firebase Hosting; /api/** se reenvía a Cloud Run)
Backend:      Cloud Run activa-backend (us-east1, proyecto GCP alarjimsoft)
Oracle ORDS:  https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api/
Bucket:       gs://alarjimsoft-activa-quiz   (privado; Word, imágenes y audios de los quizzes)
Desarrollo:   FastAPI http://127.0.0.1:8000/api · Vite http://localhost:5173
```

Las URLs del frontend vienen de `.env.development` y `.env.production` (`import.meta.env.VITE_*`, ver §12).

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
│   ├── TECHNICAL_DEBT.md
│   └── quiz/                  ← plantilla y guía de Word aprobadas para los académicos
├── backend-oracle/            ← DDL y endpoints ORDS exportados (ver §4 y §17)
│   ├── tables/ constraints/ packages/ PACKAGE_BODIES/ ords/ data/ tests/
│   └── despliegues/           ← guías de instalación en Oracle (orden y verificación)
├── public/quiz/               ← copia de la plantilla y la guía, descargables desde la app
├── src/                       ← Frontend React
│   ├── main.jsx               ← punto de entrada
│   ├── router/AppRouter.jsx   ← definición de rutas
│   ├── pages/                 ← páginas de la SPA (QuizPage = quiz del estudiante)
│   ├── components/
│   │   ├── dashboard/         ← MissionCard, QuizCard
│   │   ├── mission/           ← TutorChat (crítico), MissionSidebar, MessageBubble, CorrectionCard
│   │   ├── quiz/              ← QuizPanel (académico), QuizPlayer, QuizResults, QuizStats…
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
│   │   │   ├── tts.py         ← POST /tts/speak
│   │   │   ├── activities.py  ← práctica generada por IA
│   │   │   ├── auth.py        ← POST /auth/academico (token de académicos)
│   │   │   └── quizzes.py     ← todas las rutas de quizzes (§17)
│   │   └── services/
│   │       ├── openai_service.py
│   │       ├── azure_pronunciation.py
│   │       ├── google_speech.py
│   │       ├── google_tts.py
│   │       ├── grammar_rules.py
│   │       ├── quiz_parser.py, quiz_validator.py   ← leen y validan el Word
│   │       ├── quiz_grading.py, quiz_ai.py         ← calificación (abiertas con IA)
│   │       ├── quiz_storage.py, oracle_quiz.py     ← bucket y módulo ORDS "quiz"
│   │       └── auth_service.py                     ← JWT de académicos
│   ├── tests/                 ← pytest (python -m pytest desde backend/)
│   ├── credentials/
│   │   └── google-speech.json ← credencial Google Cloud (NO commitear)
│   ├── .env                   ← API keys reales (NO commitear, en .gitignore)
│   ├── requirements.txt
│   └── requirements-dev.txt   ← pytest, httpx
├── index.html
├── package.json
└── vite.config.js
```

---

## 4. Base de Datos (Oracle ADB via ORDS)

Oracle ADB es la **única fuente oficial de verdad**. Nunca diseñar lógica que contradiga o bypasee Oracle.

### Tablas principales

| Tabla                   | Rol                                                                              |
| ----------------------- | -------------------------------------------------------------------------------- |
| `ESTUDIANTES`           | Datos del estudiante (nombre, matrícula, nivel)                                  |
| `INSCRIPCIONES`         | Relación estudiante-curso. `id_inscripcion` es el ID pedagógico principal        |
| `TOPICS`                | Temas que agrupan misiones                                                       |
| `MISSIONS`              | Actividades pedagógicas con estado por inscripción                               |
| `USER_PROGRESS`         | **Núcleo pedagógico.** Progreso, XP, tiempo, gramática, pronunciación por misión |
| `CONVERSATIONS`         | Sesiones de conversación dentro de una misión                                    |
| `CONVERSATION_MESSAGES` | Mensajes individuales (sender: 'student' / 'tutor')                              |
| `QUIZZES`               | Un quiz por posición: se presenta después del tema `AFTER_TOPIC_ID` (3, 6 y 9)   |
| `QUIZ_VERSIONS`         | Cada Word subido; `DEFINITION_JSON` con respuestas (solo lo lee FastAPI)         |
| `QUIZ_MEDIA`            | Imágenes y audios de cada versión (ruta en el bucket, no el archivo)             |
| `QUIZ_ATTEMPTS`         | Intentos de los estudiantes (calificación, XP, versión contestada)               |
| `QUIZ_ANSWERS`          | Respuesta calificada de cada pregunta de un intento                              |

El DDL y los endpoints exportados están en `backend-oracle/`. Las copias pueden estar
desactualizadas respecto a producción: antes de redefinir un endpoint existente, compara con lo
que devuelve producción (`curl`) y con los campos que lee el frontend (ver §16).

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
GET  /progress/stats/:idInscripcion           ← estadísticas del Dashboard (incluye XP de quizzes)
GET  /progress/mission/:idInscripcion/:id     ← progreso de una misión

/quiz/admin/* y /quiz/student/*               ← módulo de quizzes, PROTEGIDO con OAuth:
                                                 solo FastAPI (sin token responde 401)
```

`/progress/stats` devuelve: `total_missions, completed_missions, total_xp, mission_xp, quiz_xp,
total_time, avg_progress, avg_pronunciation, avg_grammar, avg_practice_score, current_streak,
level, xp_next_level`. Dashboard, Progress, Profile y Sidebar usan estos campos: no quites
ninguno al cambiar el endpoint (se hace con `backend-oracle/ords/progress_stats.sql`, nunca
volviendo a ejecutar `progress.sql` completo).

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

### Reglas de XP (implementadas en `src/utils/missionXp.js`)

Cada misión vale máximo **200 XP** (el nivel sube cada 200 XP):

```
Aprendizaje completado ........ 10
Desempeño ..................... 150, repartidos entre las fases con puntaje que tenga
                                la misión (práctica, pronunciación/deletreo, conversación):
                                puntaje/100 × su parte (3 fases → 50 cada una)
Misión completada ............. 40
```

- `awardMissionXp()` (`progressService.js`) recalcula el XP desde los puntajes guardados en
  Oracle al terminar cada fase y en `CompletionScreen`; se guarda como total, no como suma.
- `POST /progress/update` usa `GREATEST`: el XP nunca baja si el estudiante repite una fase.
- Ya no hay XP por mensaje del chat (`/chat/message` no llama a `/progress/add-xp`).

**Quizzes:** cada quiz vale hasta **200 XP**, proporcional al porcentaje obtenido
(`quiz_grading.py`), y cuenta el **mejor intento**. Se guarda en `QUIZ_ATTEMPTS.XP_EARNED` (no
en `USER_PROGRESS`) y `/progress/stats` lo suma al XP total y al nivel.

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
Persiste `{ student, inscripcion, academico, academicoToken, academicoTokenExpires, userType, rol, isAuthenticated }`
en `localStorage["activa-ingles-auth"]` (versión 1 del `persist`: las sesiones de académico guardadas
sin token se cierran una vez).
`inscripcion.idInscripcion` es el ID pedagógico que se usa en TODAS las llamadas a Oracle.
`inscripcion.idCurso` es el ID del curso para cargar misiones.
`academicoToken` es el JWT de FastAPI (12 h) que exigen las rutas de académicos de quizzes.

---

## 7. Deuda Técnica Conocida (priorizada)

### Alta — actuar antes de producción

| ID     | Problema                                           | Ubicación                              |
| ------ | -------------------------------------------------- | -------------------------------------- |
| TD-A01 | Backend FastAPI sin autenticación                  | `backend/app/main.py`                  |
| TD-A02 | Oracle ORDS expuesto desde el browser              | 6 archivos en `src/services/`          |
| TD-A03 | API keys en `.env` texto plano                     | `backend/.env`                         |
| TD-A04 | TutorChat.jsx de 785 líneas                        | `src/components/mission/TutorChat.jsx` |
| TD-A05 | `sendMessage` y `sendTranscriptMessage` duplicados | `TutorChat.jsx:282,389`                |
| TD-A06 | `speech_router` registrado 2 veces en FastAPI      | `backend/app/main.py:25,28`            |
| TD-A07 | `grammarScore` hardcodeado a 85                    | `TutorChat.jsx:367,475` y `chat.py:53` |
| TD-A08 | `pronunciationScore: 0` en mensajes de texto       | `TutorChat.jsx:477`                    |
| TD-A09 | Stream de micrófono nunca se cierra                | `TutorChat.jsx:startListening()`       |
| TD-A10 | `URL.createObjectURL` sin `revokeObjectURL`        | `TutorChat.jsx:269`                    |
| TD-A11 | `getDashboardStats` llamado 2 veces por render     | `Dashboard.jsx` + `Sidebar.jsx`        |

### Media — actuar en próximas iteraciones

| ID     | Problema                                            |
| ------ | --------------------------------------------------- |
| TD-M01 | `completeMission()` nunca se llama                  |
| TD-M02 | Mezcla de `fetch` y `axios` sin criterio            |
| TD-M03 | URLs hardcodeadas en 10 archivos                    |
| TD-M04 | `useAppStore` con mensajes iniciales hardcodeados   |
| TD-M05 | `totalTimeMinutes: 5` hardcodeado                   |
| TD-M06 | `recognize_once()` Azure bloquea event loop FastAPI |
| TD-M07 | `ffmpeg` no declarado en requirements.txt           |
| TD-M08 | Sin rate limiting en el backend                     |
| TD-M09 | `alert()` nativo como UI de feedback                |
| TD-M10 | Prompt injection en `/chat/message`                 |
| TD-M11 | Historial de conversación sin paginación            |
| TD-M12 | Sesión sin expiración                               |
| TD-M13 | GPT no recibe historial de conversación             |

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

| Ruta            | Componente             | Estado                                              |
| --------------- | ---------------------- | --------------------------------------------------- |
| `/`             | `LoginPage`            | ✅ Completa                                         |
| `/dashboard`    | `Dashboard`            | ✅ Completa                                         |
| `/missions/:id` | `MissionPage`          | ✅ Completa                                         |
| `/quizzes/:id`  | `QuizPage`             | ✅ Quiz del estudiante (`?intento=N` para recargar) |
| `/content`      | `MissionContentEditor` | ✅ Académicos; `?quiz=N` abre el panel del quiz     |
| `/progress`     | `Progress`             | ✅ Completa (incluye sección Quizzes)               |
| `/library`      | `Library`              | ❌ Solo `<h1>` — implementar                        |
| `/profile`      | `Profile`              | ✅ Completa                                         |

---

## 12. Variables de Entorno

### Backend (`backend/.env`) — NO commitear

```
OPENAI_API_KEY=sk-proj-...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus
QUIZ_BUCKET=alarjimsoft-activa-quiz
ORDS_BASE_URL=https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api
ORDS_QUIZ_CLIENT_ID=...        ← cliente OAuth "activa_backend" del módulo ORDS quiz
ORDS_QUIZ_CLIENT_SECRET=...
QUIZ_JWT_SECRET=...            ← firma el token de académicos
```

En Cloud Run las mismas variables: `QUIZ_BUCKET` y `ORDS_BASE_URL` como variables de entorno; las
llaves como secretos de Secret Manager (`OPENAI_API_KEY`, `AZURE_SPEECH_KEY`, `ORDS_QUIZ_CLIENT_ID`,
`ORDS_QUIZ_CLIENT_SECRET`, `QUIZ_JWT_SECRET`), cada uno con permiso de lectura para
`activa-backend-sa`. Si el secreto OAuth se filtra: `backend-oracle/ords/quiz_oauth_secret.sql`
genera uno nuevo.

Local: `gcloud auth application-default login --impersonate-service-account activa-backend-sa@alarjimsoft.iam.gserviceaccount.com`
para que el backend use el bucket (ver `quiz_storage.py`: no usa `google-speech.json`, que es de otro proyecto).

### Frontend — `.env.development` y `.env.production` (`import.meta.env.VITE_*`)

```
VITE_API_URL=http://127.0.0.1:8000/api      (producción: /api)
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
python -m pytest                          # pruebas del backend (quizzes)

# Despliegue (siempre desde main, después del merge)
gcloud run deploy activa-backend --source backend --region us-east1 --project alarjimsoft
npm run build
firebase deploy --only hosting
```

Si un cambio toca backend y frontend, despliega primero el backend: hay un solo backend para
producción y la versión anterior del frontend debe seguir funcionando con él.

**Requisito del sistema (no en requirements.txt):** `ffmpeg` instalado para el servicio de pronunciación.

---

## 14. Restricciones Importantes

1. **No modificar el schema de Oracle sin coordinar** — el DDL vive en Oracle ADB; `backend-oracle/` guarda los scripts. Los cambios se ejecutan a mano en Database Actions → SQL con **Run Script (F5)**. Database Actions puede leer los archivos con otra codificación (`ó` → `Ã³`): deja los textos de los scripts en ASCII y usa `UNISTR('\00B7')` para símbolos.

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
5. ¿El cambio es en el backend? → solo las rutas de académicos de quizzes exigen token (`require_academico`); todo lo demás, incluidas las rutas de estudiantes, es público hasta que se implemente autenticación para estudiantes.

**El componente que más cambiará es `TutorChat.jsx`.** Siempre leerlo completo antes de modificarlo — sus dos funciones de envío son casi idénticas y un cambio en una debe replicarse en la otra.

**El archivo más delicado del backend es `openai_service.py`.** El system prompt ahí define el comportamiento pedagógico completo del tutor. Cualquier cambio debe validarse con conversaciones de prueba reales.

**Antes de redefinir un endpoint ORDS que ya existe**, compara con lo que devuelve producción y con
los campos que lee el frontend (`grep -rhoE "stats\??\.[a-z_]+" src`). La copia de `backend-oracle/`
puede estar desactualizada: así se perdieron `current_streak` y `avg_practice_score` en noviembre de 2026.

---

## 17. Quizzes (después de los temas 3, 6 y 9)

El académico escribe el quiz en Word con la plantilla de `docs/quiz/`, lo sube en el Content
Manager junto con los audios y la app lo convierte en el quiz del estudiante. Nadie programa nada
para crear o cambiar un quiz.

### Flujo

```
Académico (/content?quiz=N)                       Estudiante (/dashboard → /quizzes/:id)
1. Descarga plantilla, guía o Word actual          1. Tarjeta después de las misiones del tema
2. Sube el Word → quiz_validator: reporte            (LOCKED hasta completar las misiones de los
   · con errores: no crea versión                     temas ≤ al del quiz; no bloquea el avance)
   · sin errores: Word e imágenes al bucket,       2. start: crea o reanuda el intento; la vista
     versión BORRADOR en Oracle                       nunca incluye respuestas (student_view)
3. Sube audios: URL firmada → PUT directo al       3. submit: FastAPI califica (abiertas con IA),
   bucket → media-complete                            Oracle guarda intento y respuestas
4. Vista previa (contesta y califica sin guardar)  4. Resultados; las respuestas correctas solo se
5. Publicar (sin errores ni audios pendientes)        muestran si aprobó o ya no tiene intentos
6. Resultados: acierto por pregunta (QuizStats)
```

### Piezas

| Capa      | Archivos                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plantilla | `docs/quiz/Plantilla_Quiz_ActivaIngles.docx`, `Guia_Crear_Quiz.docx` (copias en `public/quiz/`). Formato de "tarjetas" (tablas): DATOS DEL QUIZ, SECCIÓN, PREGUNTA · tipo. El texto fuera de las tarjetas se ignora |
| Oracle    | `backend-oracle/tables/QUIZ*.sql`, `PKG_QUIZ`, `ords/quiz.sql`, `data/QUIZZES.sql`; prueba: `tests/quiz_smoke_test.sql`; guía: `despliegues/2026-11_quizzes.md`                                                     |
| Backend   | `routes/quizzes.py` (rutas documentadas al inicio del archivo), `routes/auth.py`, `services/quiz_*.py`, `oracle_quiz.py`, `auth_service.py`                                                                         |
| Frontend  | `components/quiz/*`, `components/dashboard/QuizCard.jsx`, `pages/QuizPage.jsx`, `services/quizService.js`, `utils/quizFormat.js`                                                                                    |

### Reglas

- **La posición es un dato**: `QUIZZES.AFTER_TOPIC_ID`. Para agregar un quiz basta con insertar un registro.
- **Tipos de pregunta**: opción múltiple, verdadero o falso, completar (un solo `___`), relacionar, respuesta abierta. Agregar un tipo requiere cambiar el validador, la calificación, `QuizPlayer` y `QuizResults`, y actualizar la plantilla y la guía.
- **Versiones**: cada Word crea una versión; publicar archiva la anterior; los intentos guardan la versión que se contestó.
- **Intentos y tiempo** vienen del Word. Un intento en curso se reanuda; si vence sin entregar queda `EXPIRADO` (2 min de tolerancia). El temporizador usa la hora del servidor.
- **Respuestas abiertas**: `gpt-4.1-mini` califica solo con los criterios del académico; una respuesta en español vale 0 (lo aplica el código, no solo el prompt).
- **Archivos**: el nombre en el bucket es el hash del contenido, así una versión nueva reutiliza los audios ya subidos.

### Trampas conocidas

- **CORS del bucket**: solo permite el encabezado `Content-Type`. Si la URL firmada de subida incluye otro (por ejemplo `Cache-Control`), el navegador cancela la subida. Las pruebas en Python no aplican CORS: prueba las subidas en un navegador.
- **Credenciales locales del bucket**: `main.py` fija `GOOGLE_APPLICATION_CREDENTIALS` a `google-speech.json`; `quiz_storage.py` carga las credenciales de gcloud por su cuenta.
- **ORDS_SECURITY**: en el ORDS de producción `REGISTER_CLIENT` sin `p_client_secret` no genera secreto y `ROTATE_CLIENT_SECRET` recibe `p_name`. Verifica firmas con `ALL_ARGUMENTS` antes de llamarlas.
- **Pruebas en producción**: dejan versiones en borrador del quiz y archivos en el bucket. Borra los archivos listándolos primero y por nombre, y las versiones con `DELETE FROM QUIZ_VERSIONS WHERE QUIZ_ID = n AND STATUS = 'BORRADOR'`.

---

## Future Architecture

### Mission Learning Path

Las misiones evolucionarán progresivamente desde un modelo de conversación libre hacia unidades completas de aprendizaje.

La conversación con el Tutor IA debe considerarse la fase de práctica, no la fase principal de enseñanza.

### Estructura objetivo de una misión

1. Learning Objectives
2. Vocabulary Guide
3. Grammar Focus
4. Examples
5. Practice Activities
6. Tutor Conversation
7. Pronunciation Assessment
8. Mission Completion

### Modelo de implementación preferido

#### Static Content

Contenido definido por expertos pedagógicos:

- Learning Objectives
- Vocabulary
- Grammar Focus
- Examples

#### Dynamic Content

Contenido generado por IA:

- Practice Activities
- Mini Quizzes
- Conversation Prompts
- Adaptive Reinforcement

### Principios

- El estudiante debe llegar preparado a la conversación.
- El tutor no debe introducir conceptos nuevos sin contexto.
- La conversación debe reforzar los objetivos de aprendizaje.
- La IA complementa el contenido pedagógico, no lo reemplaza.
- Cada misión debe tener resultados medibles mediante progreso, gramática y pronunciación.

### Estado

EPIC-010 Mission Learning Path

Estado actual:
Planned

Branch principal de desarrollo:

epic/mission-learning-path
