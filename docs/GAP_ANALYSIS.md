# GAP_ANALYSIS.md
# Activa Inglés — Análisis de Brechas vs PROJECT_VISION.md

---

## Leyenda

| Estado | Significado |
|---|---|
| ✅ Completado | Implementado y funcionando correctamente |
| ⚠️ En progreso | Implementado parcialmente o con defectos funcionales |
| ❌ Pendiente | No implementado |

---

## FASE 1 — Consolidación del Core

### 1.1 Autenticación

| Funcionalidad | Estado | Notas |
|---|---|---|
| Login con matrícula + contraseña | ✅ Completado | Funcional contra Oracle ORDS |
| Sesión persistida | ✅ Completado | Zustand persist en localStorage |
| Rutas protegidas | ✅ Completado | ProtectedRoute implementado |
| Logout | ✅ Completado | Sidebar tiene botón funcional |
| Expiración de sesión | ❌ Pendiente | Sesión no expira nunca |
| Manejo de error de red en login | ⚠️ En progreso | Solo maneja `result.success = false`, no errores de red/timeout |

---

### 1.2 Dashboard Pedagógico

| Funcionalidad | Estado | Notas |
|---|---|---|
| Vista de misiones por topic | ✅ Completado | Agrupadas dinámicamente desde Oracle |
| Estadísticas globales (XP, nivel, completadas) | ✅ Completado | Desde `GET /progress/stats/:id` |
| Barra de progreso general | ✅ Completado | ProgressCard con datos reales |
| Score de pronunciación promedio | ✅ Completado | Campo `avg_pronunciation` de Oracle |
| Score de gramática promedio | ⚠️ En progreso | `avg_grammar` viene de Oracle, pero el valor almacenado siempre es 85 |
| Tiempo de estudio total | ⚠️ En progreso | `total_time` de Oracle, pero siempre es 5 min/mensaje (ficticio) |
| Racha de días (streak) | ❌ Pendiente | Hardcodeado a "7 Days" en StatCard |
| "+2 this week" | ❌ Pendiente | Hardcodeado en el subtítulo de StatCard |

---

### 1.3 Sistema de Misiones

| Funcionalidad | Estado | Notas |
|---|---|---|
| Carga de misiones desde Oracle | ✅ Completado | `getMissions` funcional |
| Estados LOCKED / ACTIVE / COMPLETED | ✅ Completado | MissionCard los refleja visualmente |
| Navegación a misión activa | ✅ Completado | Funcional |
| Misiones bloqueadas no accesibles | ✅ Completado | Botón deshabilitado |
| Misiones completadas re-visitables | ✅ Completado | COMPLETED permite entrar de nuevo |
| Mission Completion real | ⚠️ En progreso | Se detecta (progressPercent >= 100) pero `completeMission()` nunca se llama |
| Mission Unlocking automático | ⚠️ En progreso | Lógica en Oracle; sin notificación ni animación en el cliente |
| Recuperación de misión por URL param | ❌ Pendiente | Si el usuario recarga `/missions/:id`, ve "Mission not found" |

---

### 1.4 Tutor Conversacional (IA)

| Funcionalidad | Estado | Notas |
|---|---|---|
| Chat de texto funcional | ✅ Completado | GPT-4.1-mini responde en JSON |
| Corrección gramatical | ✅ Completado | CorrectionCard muestra original/corrected/explanation |
| TTS del tutor (voz) | ✅ Completado | Google TTS reproduce cada respuesta |
| Contexto de misión en el prompt | ✅ Completado | title, description y objectives en system prompt |
| Historial de conversación persistido | ✅ Completado | CONVERSATIONS + CONVERSATION_MESSAGES en Oracle |
| Historial cargado al reabrir misión | ✅ Completado | `getHistory` al montar TutorChat |
| Historial completo enviado a GPT | ❌ Pendiente | Solo se envía el mensaje actual. GPT no tiene contexto de mensajes anteriores |
| Adaptación de dificultad | ❌ Pendiente | El prompt es fijo, no adapta según el nivel del estudiante |

---

### 1.5 Evaluación de Pronunciación

| Funcionalidad | Estado | Notas |
|---|---|---|
| Grabación de audio (voz) | ✅ Completado | MediaRecorder con WebM |
| Transcripción STT (Google) | ✅ Completado | Funcional |
| Evaluación Azure (4 métricas) | ✅ Completado | PronScore, AccuracyScore, FluencyScore, CompletenessScore |
| Visualización de scores en UI | ✅ Completado | Barras de progreso con colores por métrica |
| Persistencia de score en Oracle | ✅ Completado | `pronunciationScore` real en `updateProgress` (solo voz) |
| Score de pronunciación en texto | ❌ Pendiente | Siempre 0 para mensajes escritos |
| Evaluación acumulativa/histórica | ❌ Pendiente | Solo el último score se guarda; no hay historial de evaluaciones |
| Analytics de pronunciación | ❌ Pendiente | No hay página ni vista dedicada al progreso de pronunciación |
| Tiempo de grabación variable | ❌ Pendiente | Hardcodeado a 4 segundos exactos |

---

### 1.6 Sistema de XP

| Funcionalidad | Estado | Notas |
|---|---|---|
| XP por participación (mensajes) | ✅ Completado | +5 XP por mensaje |
| XP por pronunciación | ✅ Completado | Tiered según score (≥70/80/90) — solo aplica en voz |
| XP por completar misión (+50) | ⚠️ En progreso | Se calcula en `calculate_xp()` cuando `completed=True`, pero el flujo no siempre lo activa correctamente |
| XP por gramática | ⚠️ En progreso | Siempre se otorga (+10) porque grammar_score es 85 siempre |
| Nivel calculado desde XP | ✅ Completado | Oracle calcula nivel; Dashboard lo muestra |
| Dynamic Leveling (animación de subida) | ❌ Pendiente | No hay notificación ni animación de level up |
| XP basado en desempeño real | ❌ Pendiente | Grammar score ficticio; pronunciation_score 0 en texto |

---

### 1.7 Gestión de Progreso

| Funcionalidad | Estado | Notas |
|---|---|---|
| Inicio de progreso al entrar a misión | ✅ Completado | `startProgress` funcional |
| Actualización de progreso por mensaje | ✅ Completado | `updateProgress` funcional |
| Carga de progreso al reanudar misión | ✅ Completado | `getMissionProgress` funcional |
| Barra de progreso en MissionSidebar | ✅ Completado | Se actualiza en tiempo real |
| Completar misión en Oracle | ❌ Pendiente | `completeMission()` existe pero nunca se llama |
| Progreso basado en logros reales | ❌ Pendiente | Basado en contador de mensajes, no en objetivos cumplidos |
| Objetivos específicos por misión en Sidebar | ❌ Pendiente | Texto genérico hardcodeado, no los objectives de Oracle |

---

### 1.8 Exportación PDF

| Funcionalidad | Estado | Notas |
|---|---|---|
| Exportar conversación como PDF | ✅ Completado | jsPDF funcional con datos de estudiante, misión y mensajes |
| Soporte de emojis en PDF | ⚠️ En progreso | Emojis son removidos (strip ASCII) — texto puede quedar truncado |
| Correcciones incluidas en PDF | ⚠️ En progreso | Código preparado pero el campo `msg.correction` nunca está presente en los mensajes del store |

---

## FASE 2 — Experiencia Premium

| Funcionalidad | Estado | Notas |
|---|---|---|
| Azure Speech completo (granularidad fonema) | ⚠️ En progreso | Azure SDK configurado con granularidad Phoneme, pero los datos fonéticos no se muestran en UI |
| Avatar Conversacional | ❌ Pendiente | No existe |
| Ejercicios Dinámicos IA | ❌ Pendiente | Solo chat libre; sin ejercicios estructurados |
| Speaking Challenges | ❌ Pendiente | No existe |

---

## FASE 3 — Inteligencia Educativa

| Funcionalidad | Estado | Notas |
|---|---|---|
| Adaptive Learning Engine | ❌ Pendiente | No existe |
| Recommendation Engine | ❌ Pendiente | No existe |
| Predicción de Riesgo Académico | ❌ Pendiente | No existe |
| Teacher Dashboard | ❌ Pendiente | No existe |

---

## FASE 4 — Escalabilidad

| Funcionalidad | Estado | Notas |
|---|---|---|
| OCI Deployment | ❌ Pendiente | Solo corre en localhost |
| Multiinstitución | ❌ Pendiente | No existe |
| Facturación | ❌ Pendiente | No existe |
| Administración centralizada | ❌ Pendiente | No existe |
| Integración WhatsApp | ❌ Pendiente | No existe |
| Módulo Tutor Humano | ❌ Pendiente | No existe |

---

## Páginas del Frontend

| Página | Ruta | Estado | Notas |
|---|---|---|---|
| LoginPage | `/` | ✅ Completado | |
| Dashboard | `/dashboard` | ✅ Completado | |
| MissionPage | `/missions/:id` | ✅ Completado | |
| Progress | `/progress` | ❌ Pendiente | Solo título |
| Library | `/library` | ❌ Pendiente | Solo título |
| Profile | `/profile` | ❌ Pendiente | Solo título |

---

## Reglas Oficiales de PROJECT_VISION.md — Cumplimiento

| # | Regla | Cumplida | Estado |
|---|---|---|---|
| 1 | Oracle ADB es la fuente oficial de verdad | Parcial | Sí para datos maestros; progreso con valores ficticios |
| 2 | USER_PROGRESS es el núcleo pedagógico | Parcial | Se usa, pero `completeMission` no se llama y métricas son ficticias |
| 3 | Toda interacción relevante debe persistirse | Parcial | Mensajes sí; scores de gramática y tiempo son ficticios |
| 4 | El progreso debe ser medible | ❌ No | Basado en contador de mensajes, no en logros reales |
| 5 | El XP debe basarse en desempeño real | ❌ No | Grammar hardcodeado; pronunciation_score 0 en texto |
| 6 | Aprendizaje orientado a objetivos | Parcial | Misiones tienen objetivos en Oracle; el tutor los usa en el prompt |
| 7 | Experiencia simple para el estudiante | ✅ Sí | UI limpia y fluida |
| 8 | La IA nunca sustituye al tutor humano | ❌ Incumplible aún | Módulo de tutor humano no existe |

---

## Resumen de Brechas por Categoría

| Categoría | Completado | En Progreso | Pendiente |
|---|---|---|---|
| Autenticación | 4 | 1 | 1 |
| Dashboard | 4 | 2 | 2 |
| Misiones | 5 | 2 | 1 |
| Tutor Chat | 5 | 0 | 2 |
| Pronunciación | 5 | 1 | 4 |
| Sistema XP | 3 | 2 | 2 |
| Progreso | 4 | 0 | 3 |
| PDF | 1 | 2 | 0 |
| Fase 2 | 0 | 1 | 3 |
| Fase 3 | 0 | 0 | 4 |
| Fase 4 | 0 | 0 | 6 |
| **Total** | **31** | **11** | **28** |

**Avance estimado:** ~44% del total de la visión. ~72% de la Fase 1.
