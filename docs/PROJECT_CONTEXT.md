# PROJECT_CONTEXT.md
# Activa Inglés — Contexto Completo del Proyecto

---

## 1. Objetivo del Proyecto

Activa Inglés es una plataforma educativa web impulsada por inteligencia artificial diseñada para estudiantes universitarios de Latinoamérica. Su propósito es desarrollar habilidades reales de comunicación en inglés a través de un modelo de aprendizaje gamificado que combina:

- Conversación práctica con un tutor IA contextualizado por misión.
- Evaluación automática de pronunciación por voz.
- Sistema de XP y niveles para gamificar el progreso.
- Seguimiento pedagógico continuo persistido en Oracle ADB.

La experiencia está diseñada para sentirse como un videojuego educativo, no como un curso tradicional.

---

## 2. Funcionalidades Actualmente Implementadas

### 2.1 Autenticación
- Login con matrícula y contraseña contra Oracle ORDS (`/ords/api/auth/login`).
- Estado de sesión persistido en `localStorage` vía Zustand persist.
- Rutas protegidas con `ProtectedRoute` que redirigen a `/` si no hay sesión.
- Logout funcional desde la Sidebar.

### 2.2 Dashboard
- Carga dinámica de misiones desde Oracle, agrupadas por topic.
- Estadísticas del estudiante desde Oracle: XP total, nivel, misiones completadas, tiempo de estudio, score de pronunciación promedio, score de gramática promedio.
- Barra de progreso general de misiones.
- Visualización de nivel actual y XP hacia el siguiente nivel.

### 2.3 Sistema de Misiones
- Misiones cargadas desde Oracle con estructura: title, description, level, duration, grammar, topic, sortOrder.
- Estados: `ACTIVE`, `LOCKED`, `COMPLETED` — leídos desde Oracle y reflejados visualmente.
- Navegación a `MissionPage` pasando el objeto `mission` vía `location.state`.
- Agrupación visual por topic en el Dashboard.

### 2.4 Tutor Conversacional (Chat)
- Chat de texto funcional: input → GPT-4.1-mini → respuesta con corrección gramatical opcional.
- Formato de respuesta JSON estructurado: `{ reply, correction: { original, corrected, explanation } }`.
- `CorrectionCard` que muestra la corrección gramatical cuando existe.
- TTS automático: cada respuesta del tutor se reproduce por audio (Google TTS).
- Historial de conversación cargado desde Oracle al abrir la misión.
- Mensajes persistidos en Oracle (`CONVERSATIONS` + `CONVERSATION_MESSAGES`) en tiempo real.

### 2.5 Evaluación de Pronunciación
- Grabación de audio vía `MediaRecorder` (WebM).
- Transcripción con Google Cloud Speech-to-Text.
- Evaluación con Azure Pronunciation Assessment (4 métricas: Pronunciation, Accuracy, Fluency, Completeness).
- Visualización de scores con barras de progreso en el chat.
- Score de pronunciación enviado a Oracle vía `updateProgress`.

### 2.6 Sistema de XP
- Cálculo de XP por mensaje en el backend:
  - +5 XP por mensaje enviado.
  - +10 XP si grammar score ≥ 80.
  - +5/+10/+20 XP según pronunciation score (≥70/≥80/≥90).
  - +50 XP si la misión se completa.
- XP acumulado en Oracle vía `POST /ords/api/progress/add-xp`.
- Dashboard muestra XP total y nivel calculados por Oracle.

### 2.7 Gestión de Progreso
- `startProgress`: crea o reanuda registro en `USER_PROGRESS` al entrar a una misión.
- `updateProgress`: actualiza métricas tras cada mensaje (XP, progreso %, tiempo, gramática, pronunciación).
- `getMissionProgress`: carga el progreso actual al entrar a una misión.
- Progreso visual en `MissionSidebar` con barra animada.

### 2.8 Exportación PDF
- Exporta la conversación completa de una misión como PDF con jsPDF.
- Incluye: nombre del estudiante, matrícula, topic, misión, fecha y todos los mensajes con colores por sender.

---

## 3. Casos de Uso Principales

| ID | Caso de Uso | Estado |
|----|-------------|--------|
| CU-01 | Estudiante inicia sesión con matrícula | Implementado |
| CU-02 | Estudiante ve sus misiones organizadas por topic | Implementado |
| CU-03 | Estudiante entra a una misión activa | Implementado |
| CU-04 | Estudiante practica inglés escribiendo mensajes | Implementado |
| CU-05 | Tutor IA corrige errores gramaticales | Implementado |
| CU-06 | Tutor IA responde por voz (TTS) | Implementado |
| CU-07 | Estudiante practica pronunciación por micrófono | Implementado |
| CU-08 | Sistema evalúa pronunciación con Azure | Implementado |
| CU-09 | Estudiante acumula XP por participación | Implementado (parcial) |
| CU-10 | Misión se marca como completada | Parcialmente implementado |
| CU-11 | Estudiante ve su progreso general | Dashboard sí; página Progress vacía |
| CU-12 | Estudiante exporta conversación en PDF | Implementado |
| CU-13 | Estudiante ve su perfil | No implementado |
| CU-14 | Estudiante accede a biblioteca de recursos | No implementado |
| CU-15 | Misión bloqueada se desbloquea al completar otra | Lógica en Oracle; sin UI proactiva |

---

## 4. Flujo Principal del Usuario

```
1. Usuario abre la app → LoginPage (/)
2. Ingresa matrícula + contraseña
3. POST /ords/api/auth/login → Oracle devuelve { student, inscripcion }
4. authStore guarda estado → navega a /dashboard
5. Dashboard carga:
   - GET /ords/api/missions/course/:idCurso/:idInscripcion → lista de misiones
   - GET /ords/api/progress/stats/:idInscripcion → estadísticas globales
6. Usuario hace clic en misión ACTIVE → /missions/:id
7. MissionPage monta TutorChat:
   - POST /ords/api/chat/start → crea conversación en Oracle
   - POST /ords/api/progress/start → inicia registro de progreso
   - GET /ords/api/progress/mission/:id/:missionId → carga progreso anterior
   - GET /ords/api/chat/history/:conversationId → carga historial
8. Usuario escribe mensaje:
   - POST /ords/api/chat/message (Oracle) → guarda mensaje del estudiante
   - POST http://localhost:8000/chat/message (FastAPI) → GPT responde
     - FastAPI llama a Oracle: POST /ords/api/progress/add-xp
   - POST /ords/api/chat/message (Oracle) → guarda respuesta del tutor
   - POST http://localhost:8000/tts/speak → audio de respuesta
   - POST /ords/api/progress/update → actualiza métricas
9. Usuario usa micrófono:
   - MediaRecorder graba audio (WebM)
   - POST http://localhost:8000/speech/to-text → transcripción Google STT
   - POST http://localhost:8000/speech/pronunciation-score → evaluación Azure
   - Mismo flujo de chat con pronunciationScore real
10. Usuario hace clic en "Export PDF" → descarga conversación
```

---

## 5. Componentes Críticos

| Componente | Criticidad | Razón |
|---|---|---|
| `TutorChat.jsx` | Crítico | Núcleo de la experiencia de aprendizaje |
| `openai_service.py` | Crítico | Define la calidad pedagógica del tutor |
| `azure_pronunciation.py` | Crítico | Diferenciador tecnológico del producto |
| `progress_service.py` | Crítico | XP Engine — integridad pedagógica |
| `authStore.js` | Crítico | Sin sesión correcta, nada funciona |
| `progressService.js` | Alto | Interface con USER_PROGRESS (núcleo pedagógico) |
| `conversationService.js` | Alto | Persistencia del historial en Oracle |
| `missionService.js` | Alto | Carga el contenido educativo desde Oracle |
| `MissionCard.jsx` | Medio | Punto de entrada a cada misión |
| `Dashboard.jsx` | Medio | Vista principal del estudiante |

---

## 6. Tecnologías Utilizadas

### Frontend
| Tecnología | Versión | Rol |
|---|---|---|
| React | 19.2.5 | Framework UI |
| Vite | 8.0.10 | Build tool y dev server |
| React Router DOM | 7.15.0 | Routing SPA |
| Tailwind CSS | 4.3.0 | Estilos utilitarios |
| Zustand | 5.0.13 | Estado global (auth + conversaciones) |
| Framer Motion | 12.38.0 | Animaciones |
| Axios | 1.16.0 | HTTP client (3 servicios) |
| Fetch API | nativa | HTTP client (6 servicios) |
| jsPDF | 4.2.1 | Exportación de conversaciones |
| Lucide React | 1.14.0 | Iconografía |
| MediaRecorder API | nativa | Grabación de audio |

### Backend
| Tecnología | Versión | Rol |
|---|---|---|
| Python | 3.13 | Lenguaje principal |
| FastAPI | latest | Framework API REST |
| Uvicorn | latest | ASGI server |
| OpenAI SDK | latest | Comunicación con GPT-4.1-mini |
| google-cloud-speech | latest | Speech-to-Text |
| google-cloud-texttospeech | latest | Text-to-Speech |
| azure-cognitiveservices-speech | latest | Pronunciation Assessment |
| ffmpeg | sistema | Conversión WEBM→WAV |
| python-dotenv | latest | Variables de entorno |
| requests | latest | HTTP client para llamadas a Oracle |
| pydantic | latest | Validación de modelos (vía FastAPI) |

### Servicios Externos
| Servicio | Proveedor | Uso |
|---|---|---|
| GPT-4.1-mini | OpenAI | Tutor conversacional |
| Speech-to-Text | Google Cloud | Transcripción de audio |
| Text-to-Speech | Google Cloud | Voz del tutor (en-US-Neural2-J) |
| Pronunciation Assessment | Azure Cognitive Services | Evaluación de pronunciación |
| Oracle Autonomous Database | Oracle Cloud | Base de datos principal |
| Oracle ORDS | Oracle Cloud | API REST sobre Oracle ADB |
