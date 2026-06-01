# ARCHITECTURE.md
# Activa Inglés — Arquitectura del Sistema

---

## 1. Arquitectura Actual (Estado Real)

La arquitectura actual es un sistema de dos capas con una tercera capa externa (Oracle ORDS) accesible directamente desde el frontend, lo que introduce un acoplamiento no previsto en la visión objetivo.

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (Cliente)                        │
│                                                                 │
│  React SPA (Vite)                                               │
│  ├── Zustand (authStore + useAppStore)                          │
│  ├── React Router DOM                                           │
│  └── Services Layer                                             │
│       ├── authService.js      ──────────────────────────────┐  │
│       ├── missionService.js   ──────────────────────────┐   │  │
│       ├── conversationService.js ───────────────────┐   │   │  │
│       ├── dashboardService.js ──────────────────┐   │   │   │  │
│       ├── progressService.js  ──────────────┐   │   │   │   │  │
│       ├── chatService.js      ──────────┐   │   │   │   │   │  │
│       ├── speechService.js    ──────┐   │   │   │   │   │   │  │
│       ├── ttsService.js       ──┐   │   │   │   │   │   │   │  │
│       └── pronunciationService.js──┘   │   │   │   │   │   │  │
└────────────────────────────────────────┼───┼───┼───┼───┼───┼──┘
                                         │   │   │   │   │   │
         ┌───────────────────────────────┘   │   │   │   │   │
         │  FastAPI (localhost:8000)          │   │   │   │   │
         │  ├── /chat/message                │   │   │   │   │
         │  ├── /speech/to-text             │   │   │   │   │
         │  ├── /speech/pronunciation-score  │   │   │   │   │
         │  └── /tts/speak                  │   │   │   │   │
         │       │                          │   │   │   │   │
         │       ├── OpenAI GPT-4.1-mini    │   │   │   │   │
         │       ├── Google Cloud STT       │   │   │   │   │
         │       ├── Google Cloud TTS       │   │   │   │   │
         │       ├── Azure Pronunciation    │   │   │   │   │
         │       └── Oracle ORDS (add-xp)   │   │   │   │   │
         └───────────────────────────────   │   │   │   │   │
                                            │   │   │   │   │
         Oracle ORDS ◄──────────────────────┘   │   │   │   │
         (gb572ef1f8a56c6-caa23.adb...)          │   │   │   │
         ├── /ords/api/auth/login ◄──────────────┘   │   │   │
         ├── /ords/api/missions/course/:c/:i ◄────────┘   │   │
         ├── /ords/api/chat/* ◄──────────────────────────┘   │
         ├── /ords/api/progress/* ◄──────────────────────────┘
         └── Oracle ADB (tablas)
```

---

## 2. Arquitectura Objetivo (según PROJECT_VISION.md)

```
React Frontend
      ↓
  API Gateway
      ↓
   FastAPI  ◄────── TODO el tráfico debería pasar por aquí
      ↓
Servicios IA (independientes por capacidad)
      ↓
Oracle ADB
```

**Diferencia crítica:** En la arquitectura actual, el frontend se comunica directamente con Oracle ORDS para 6 de los 9 servicios, bypaseando FastAPI completamente.

---

## 3. Flujo de Autenticación

```mermaid
sequenceDiagram
    participant U as Usuario
    participant FE as React (LoginPage)
    participant S as authStore (Zustand)
    participant O as Oracle ORDS

    U->>FE: Ingresa matrícula + contraseña
    FE->>O: POST /ords/api/auth/login
    Note over FE,O: body: x01=matricula&x02=password
    O-->>FE: { success, student, inscripcion }
    FE->>S: login(student, inscripcion)
    S->>S: persist en localStorage
    FE->>U: navigate(/dashboard)
```

---

## 4. Flujo de Mensaje de Chat (Texto)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant TC as TutorChat.jsx
    participant OS as Oracle ORDS (chat/message)
    participant FA as FastAPI (/chat/message)
    participant GPT as OpenAI GPT-4.1-mini
    participant OX as Oracle ORDS (add-xp)
    participant OP as Oracle ORDS (progress/update)
    participant TTS as FastAPI (/tts/speak)

    U->>TC: Escribe mensaje + Enter
    TC->>OS: POST /ords/api/chat/message (guarda msg estudiante)
    TC->>FA: POST /chat/message
    FA->>GPT: chat.completions.create(system_prompt, user_message)
    GPT-->>FA: { reply, correction }
    FA->>OX: POST /ords/api/progress/add-xp
    FA-->>TC: { reply, correction }
    TC->>OS: POST /ords/api/chat/message (guarda msg tutor)
    TC->>OP: POST /ords/api/progress/update
    TC->>TTS: POST /tts/speak (texto del tutor)
    TTS-->>TC: audio/mpeg blob
    TC->>U: Renderiza respuesta + reproduce audio
```

---

## 5. Flujo de Evaluación de Pronunciación (Voz)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant MR as MediaRecorder (Browser)
    participant TC as TutorChat.jsx
    participant STT as FastAPI (/speech/to-text)
    participant G as Google Cloud STT
    participant AZ as FastAPI (/speech/pronunciation-score)
    participant Azure as Azure Cognitive Services
    participant OS as Oracle ORDS

    U->>TC: Clic en botón micrófono
    TC->>MR: getUserMedia() + start()
    Note over MR: Graba 4 segundos (hardcoded)
    MR-->>TC: audioBlob (WebM)
    TC->>STT: POST /speech/to-text (audioBlob)
    STT->>G: client.recognize(WEBM_OPUS, en-US)
    G-->>STT: transcript text
    STT-->>TC: { transcript }
    TC->>AZ: POST /speech/pronunciation-score (audioBlob + transcript)
    AZ->>AZ: ffmpeg WEBM → WAV
    AZ->>Azure: SpeechRecognizer + PronunciationAssessmentConfig
    Azure-->>AZ: PronScore, AccuracyScore, FluencyScore, CompletenessScore
    AZ-->>TC: { pronunciation_score, accuracy_score, fluency_score, completeness_score }
    TC->>TC: setPronunciationResult() → muestra barras en UI
    TC->>OS: POST /ords/api/progress/update (pronunciationScore real)
    TC->>TC: sendTranscriptMessage(transcript, pronunciationData)
```

---

## 6. Flujo de Inicio de Misión

```mermaid
sequenceDiagram
    participant U as Usuario
    participant D as Dashboard.jsx
    participant MC as MissionCard.jsx
    participant MP as MissionPage.jsx
    participant TC as TutorChat.jsx
    participant O as Oracle ORDS

    U->>D: Clic en misión ACTIVE
    MC->>MP: navigate(/missions/:id, { state: { mission } })
    MP->>TC: monta TutorChat con mission
    TC->>O: POST /ords/api/chat/start → conversationId
    TC->>O: POST /ords/api/progress/start
    TC->>O: GET /ords/api/progress/mission/:id/:missionId → progress actual
    TC->>O: GET /ords/api/chat/history/:conversationId → historial
    TC->>U: Muestra historial + barra de progreso
```

---

## 7. Integraciones Externas

| Servicio | Tipo | Auth | Llamado desde | Riesgo |
|---|---|---|---|---|
| Oracle ORDS | REST API | URL pública | Frontend + Backend | Alto — acceso directo desde browser |
| OpenAI GPT-4.1-mini | REST API | API Key (.env) | Backend únicamente | Medio — sin rate limiting |
| Google Cloud Speech | gRPC/REST | JSON credentials | Backend únicamente | Bajo |
| Google Cloud TTS | gRPC/REST | JSON credentials | Backend únicamente | Bajo |
| Azure Pronunciation | SDK nativo | Key + Region (.env) | Backend únicamente | Medio — operación síncrona bloquea event loop |

---

## 8. Dependencias entre Módulos

```mermaid
graph TD
    LoginPage --> authService
    LoginPage --> authStore

    Dashboard --> missionService
    Dashboard --> dashboardService
    Dashboard --> authStore
    Dashboard --> MissionCard

    MissionPage --> TutorChat
    MissionPage --> MissionSidebar

    TutorChat --> chatService
    TutorChat --> speechService
    TutorChat --> ttsService
    TutorChat --> pronunciationService
    TutorChat --> conversationService
    TutorChat --> progressService
    TutorChat --> authStore
    TutorChat --> useAppStore
    TutorChat --> conversationPdf

    Sidebar --> authStore
    Sidebar --> dashboardService

    ProtectedRoute --> authStore

    chatService --> FastAPI_chat
    speechService --> FastAPI_speech
    ttsService --> FastAPI_tts
    pronunciationService --> FastAPI_speech

    FastAPI_chat --> openai_service
    FastAPI_chat --> progress_service
    FastAPI_speech --> google_speech
    FastAPI_speech --> azure_pronunciation
    FastAPI_tts --> google_tts

    openai_service --> OpenAI
    google_speech --> GoogleSTT
    google_tts --> GoogleTTS
    azure_pronunciation --> AzureSDK
    progress_service --> OracleORDS

    authService --> OracleORDS
    missionService --> OracleORDS
    conversationService --> OracleORDS
    dashboardService --> OracleORDS
    progressService --> OracleORDS
```

---

## 9. Riesgos Arquitectónicos

| ID | Riesgo | Severidad | Descripción |
|---|---|---|---|
| R-01 | Frontend acoplado a Oracle ORDS | Alta | 6 servicios del frontend llaman directamente a Oracle. Un cambio en el schema rompe el frontend sin pasar por FastAPI. |
| R-02 | Backend sin autenticación | Alta | FastAPI no valida ningún token. Endpoints abiertos al mundo. |
| R-03 | Azure Pronunciation síncrona | Alta | `recognize_once()` bloquea el event loop de FastAPI durante la evaluación. |
| R-04 | Un solo punto de fallo conversacional | Alta | TutorChat.jsx orquesta todo. Un error ahí afecta el 100% de la experiencia de aprendizaje. |
| R-05 | Speech_router duplicado | Media | Rutas `/speech/*` registradas dos veces en FastAPI. |
| R-06 | Stream de micrófono no cerrado | Media | Memory leak progresivo en sesiones largas. |
| R-07 | URLs hardcodeadas en 10 archivos | Media | Imposible cambiar de entorno sin editar manualmente. |
| R-08 | Double fetch a Oracle por cada mensaje | Media | 3+ llamadas a Oracle por mensaje enviado sin batching. |
