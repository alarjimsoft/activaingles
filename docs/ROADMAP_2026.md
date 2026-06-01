# ROADMAP_2026.md
# Activa Inglés — Roadmap Estratégico 2026

> **Roles:** Product Owner Senior · Arquitecto Principal · CTO
> **Horizonte:** 6 meses (Junio – Noviembre 2026)
> **Contexto:** Un desarrollador principal · Tiempo limitado · Sin deuda técnica nueva
> **Generado:** 2026-06-01

---

## ESTADO ACTUAL

### Nivel de madurez del producto

**Alpha funcional con integridad de datos comprometida.**

El sistema corre de extremo a extremo: un estudiante puede autenticarse, abrir una misión, conversar con el tutor IA, evaluar su pronunciación por voz, acumular XP y ver estadísticas en el Dashboard. La infraestructura técnica más costosa y diferenciadora ya está conectada y operativa: GPT-4.1-mini, Google STT, Google TTS y Azure Pronunciation Assessment funcionan juntos.

El problema central no es funcionalidad faltante sino **datos corruptos en el núcleo pedagógico**: `USER_PROGRESS.GRAMMAR_SCORE` es siempre 85, `PRONUNCIATION_SCORE` es 0 en mensajes de texto, `TOTAL_TIME_MINUTES` es siempre 5 por mensaje, y el tutor IA no tiene memoria de conversación. Un producto que promete aprendizaje personalizado no puede funcionar correctamente sobre datos ficticios.

### Porcentaje estimado de avance

| Dimensión | Avance |
|---|---|
| Fase 1 del roadmap oficial | 72% |
| Visión total del producto | 44% |
| Integridad de datos pedagógicos | 30% |
| Páginas del frontend implementadas | 50% (3 de 6) |
| Seguridad production-ready | 15% |
| **Avance global ponderado** | **~44%** |

### Principales fortalezas

1. **Pipeline de voz completo y funcional.** El flujo WebM → Google STT → Azure Assessment → 4 scores en UI es sofisticado tecnológicamente y funciona end-to-end. Es el diferenciador más difícil de replicar del producto.

2. **Arquitectura de datos sólida en Oracle.** Las tablas `USER_PROGRESS`, `CONVERSATIONS`, `CONVERSATION_MESSAGES`, `SPEAKING_ANALYSIS` y `MISSIONS` están correctamente diseñadas con foreign keys, constraints y lógica de negocio en paquetes PL/SQL. El schema es la base correcta para el producto.

3. **Stack moderno y coherente.** React 19 + Vite + FastAPI + Oracle ORDS es una combinación escalable y mantenible. Las decisiones tecnológicas son correctas.

4. **Lógica de desbloqueo de misiones ya implementada en Oracle.** `PKG_MISSIONS.GET_MISSIONS_BY_COURSE` implementa el algoritmo secuencial (COMPLETED → ACTIVE → LOCKED) correctamente. Es una lógica de negocio crítica que ya funciona.

5. **UI/UX de calidad.** El diseño dark con Tailwind v4 + Framer Motion tiene coherencia visual. La experiencia de misión y chat se siente como un producto real.

### Principales riesgos

1. **Datos pedagógicos corruptos en producción.** Cada interacción actual escribe datos falsos en `USER_PROGRESS`. Cuanto más tiempo pase sin corrección, más historial inválido se acumula.

2. **Backend de IA sin autenticación.** FastAPI expone endpoints de OpenAI, Azure y Google sin ningún control. En producción, un abuso puede generar costos ilimitados.

3. **API keys de producción en el repositorio.** `PKG_SERVICIOS_IA.sql` contiene las mismas claves activas que `.env`. Si el repositorio fue compartido, las claves están comprometidas.

4. **TutorChat.jsx como single point of failure.** 785 líneas con 7 responsabilidades. Un bug ahí detiene el 100% de la experiencia de aprendizaje.

---

---

## FASE 1 — PRÓXIMOS 30 DÍAS
### "Fundación de Integridad"

**Objetivo de la fase:** Convertir el sistema de un prototipo con datos de placeholder a una plataforma con métricas pedagógicas reales y un tutor IA con coherencia conversacional. Al finalizar esta fase, el producto puede mostrarse a una institución universitaria con confianza.

**Principio rector:** No construir nada nuevo sobre datos corruptos. Primero sanear la fuente de verdad (Oracle), luego expandir.

---

### F1-01 — Sprint de Integridad de Datos (Semana 1)

**Objetivo:** Hacer que `USER_PROGRESS` contenga datos pedagógicos reales en cada campo.

**Iniciativas incluidas:**
- Eliminar `speech_router` duplicado en FastAPI (15 min)
- Cerrar stream de micrófono + liberar blob URLs (30 min)
- Medir tiempo de estudio real con `Date.now()` (30 min)
- Mostrar streak real desde `authStore.student.streakDays` (30 min)
- Mensaje de error específico cuando el período académico está vencido (30 min)
- **Grammar score real:** si GPT devuelve `correction != null` → score 55; si `null` → score 90 (4 horas)
- **Pronunciation score en texto:** no enviar el campo cuando no hay evaluación de voz (2 horas)

**Justificación:**
`USER_PROGRESS` es la Regla #2 de PROJECT_VISION.md — el núcleo pedagógico. Todo el Dashboard, el Teacher Dashboard futuro, la página de progreso y la analítica educativa leen de ahí. Construir cualquiera de esas capas sobre datos falsos las invalida. Estas correcciones son las de menor complejidad y el mayor impacto estructural del proyecto.

**Beneficio esperado:**
El Dashboard muestra métricas reales de gramática y pronunciación por primera vez. El XP refleja desempeño genuino. Los datos históricos futuros serán válidos.

**Riesgos:**
- El grammar score binario (90/55) genera varianza alta en el promedio del Dashboard para estudiantes con pocas interacciones. Aceptable para la primera iteración.
- Los datos históricos ya en Oracle seguirán siendo inválidos. El Dashboard mostrará promedios mixtos (falsos pasados + reales futuros) hasta que el historial sea suficiente.

**Dependencias:** Ninguna. Son cambios independientes.

---

### F1-02 — Tutor con Memoria de Conversación (Semana 2)

**Objetivo:** Pasar los últimos 8 mensajes de la conversación activa a GPT en cada petición.

**Justificación:**
Este es el cambio de mayor impacto pedagógico del roadmap completo. Un tutor que no recuerda lo que el estudiante dijo hace 2 mensajes no puede hacer seguimiento, no puede corregir patrones recurrentes, no puede preguntar "¿lograste practicar lo que vimos antes?". Sin memoria, el producto no puede diferenciarse de un chatbot genérico gratuito. La Regla #6 de PROJECT_VISION.md exige aprendizaje orientado a objetivos — eso requiere contexto conversacional.

**Cambios:**
1. `ChatRequest` en FastAPI agrega `history: list[dict] = []`
2. `openai_service.py` construye el array `messages` con el historial + mensaje actual
3. `chatService.js` incluye los últimos 8 mensajes del store en el payload
4. Límite: últimos 8 mensajes para controlar costo de tokens

**Beneficio esperado:**
La calidad del tutor mejora dramáticamente. Las conversaciones tienen coherencia y continuidad. El estudiante siente que está hablando con un tutor real, no con un chatbot que olvida todo en cada mensaje.

**Riesgos:**
- Aumenta el costo de tokens de OpenAI en ~30-40% por petición. Con 8 mensajes de historial, el costo sigue siendo bajo pero debe monitorearse.
- Requiere que `useAppStore` tenga el historial limpio. Depende de limpiar `initialConversation` primero.

**Dependencias:** F1-01 (para que el store esté limpio antes de enviar historial a GPT).

---

### F1-03 — Persistencia de Correcciones Gramaticales en Oracle (Semana 2)

**Objetivo:** Guardar `CONVERSATION_MESSAGES.CORRECTION` con el JSON de corrección del tutor.

**Justificación:**
La corrección gramatical es el dato pedagógico más valioso que produce el sistema. GPT lo genera, la UI lo muestra en `CorrectionCard`, pero desaparece cuando el usuario cierra la misión. Oracle tiene la columna `CORRECTION CLOB` creada específicamente para esto — está vacía. Persistir este dato habilita el análisis de errores frecuentes, el historial de correcciones por estudiante y eventualmente el Teacher Dashboard.

**Cambios:**
1. `conversationService.js`: incluir `correction` en el payload de `saveMessage` del tutor
2. Endpoint ORDS `POST /chat/message`: agregar `:correction` al INSERT
3. `TutorChat.jsx`: pasar `JSON.stringify(result.correction)` al guardar el mensaje del tutor

**Beneficio esperado:**
El historial de conversación en Oracle es pedagógicamente completo. Al reanudar una misión, el estudiante puede ver sus correcciones anteriores. Los datos están disponibles para analítica futura.

**Riesgos:** Requiere acceso a Oracle ADB para redeploy del módulo ORDS. Los mensajes históricos existentes tendrán `CORRECTION = NULL` — sin impacto en el frontend que ya maneja null.

**Dependencias:** Acceso a Oracle ADB. F1-01 (store limpio).

---

### F1-04 — Revocación de API Keys y Limpieza de Seguridad Crítica (Semana 2)

**Objetivo:** Rotar todas las API keys expuestas en `PKG_SERVICIOS_IA.sql` y limpiar el repositorio.

**Justificación:**
`PKG_SERVICIOS_IA.sql` contiene claves de producción activas de OpenAI, Azure y Google en texto plano dentro del repositorio git. Si este repositorio ha sido compartido, enviado por correo o subido a cualquier servicio externo, las claves están comprometidas. Esta es la única iniciativa de seguridad que tiene un deadline implícito: cada día sin rotación es un día de exposición.

**Acciones:**
1. Verificar si el repositorio fue expuesto externamente (GitHub, GitLab, correo, etc.)
2. Generar nuevas claves en los tres proveedores
3. Actualizar `backend/.env` con las nuevas claves
4. Actualizar las constantes en Oracle ADB (`PKG_SERVICIOS_IA`)
5. Revocar las claves viejas
6. Reemplazar las claves en `PKG_SERVICIOS_IA.sql` por comentarios indicando que se gestionan externamente

**Beneficio esperado:**
Eliminación del mayor riesgo de seguridad económica del proyecto. Las claves estarán gestionadas en un único lugar controlado.

**Riesgos:** La rotación debe ser coordinada — generar primero las nuevas, actualizar todos los puntos, luego revocar las viejas. El orden incorrecto rompe el sistema.

**Dependencias:** Ninguna.

---

### Entregable de Fase 1

Al finalizar los 30 días:
- `USER_PROGRESS` contiene datos pedagógicos reales por primera vez
- El tutor IA tiene memoria de los últimos 8 mensajes de conversación
- Las correcciones gramaticales se persisten en Oracle
- Las API keys están rotadas y gestionadas correctamente
- El sistema puede mostrarse a una institución universitaria con datos reales

**El producto pasa de Alpha a Beta funcional.**

---

---

## FASE 2 — PRÓXIMOS 90 DÍAS
### "Consolidación del Core y Experiencia Completa"

**Objetivo de la fase:** Completar al 100% la Fase 1 del roadmap oficial de PROJECT_VISION.md. Al finalizar esta fase, el producto tiene las 6 páginas implementadas, el sistema de seguridad básico activo y la base técnica preparada para escalar.

**Principio rector:** Completar antes de expandir. Un producto con 6 páginas reales vale más que uno con 3 páginas perfectas y 3 vacías.

---

### F2-01 — Páginas /progress y /profile (Semanas 3-5)

**Objetivo:** Implementar las dos páginas de mayor valor pedagógico que están completamente vacías.

**Página /progress:**
- Progreso por misión (barra individual + scores de grammar y pronunciation)
- XP total y nivel con fórmula real (`LEVEL = FLOOR(XP/200) + 1`)
- Tiempo de estudio acumulado
- Misiones completadas vs pendientes por topic
- Datos desde: `GET /progress/stats/:id`, `GET /progress/student/:id` (endpoint existente sin uso)

**Página /profile:**
- Datos del estudiante desde `authStore`: nombre, matrícula, carrera, nivel de inglés
- XP total y nivel
- Streak real de días
- Estadísticas acumuladas (misiones completadas, tiempo total, scores promedio)
- Avatar placeholder (foto BLOB difiere para una iteración posterior)

**Justificación:**
La página de progreso es el motor de motivación del sistema. Sin ella, la gamificación (XP, niveles, scores) no tiene un espacio donde el estudiante pueda ver su evolución. La página de perfil es el requisito mínimo de cualquier aplicación educativa — su ausencia comunica incompletitud. Juntas representan el 33% de las páginas del sistema y cero líneas de código implementado.

**Beneficio esperado:**
El estudiante tiene visibilidad de su evolución real. Las instituciones pueden ver evidencia del progreso de sus alumnos. El producto luce completo.

**Riesgos:** Deben implementarse después de F1-01 para mostrar datos reales, no el historial corrupto anterior.

**Dependencias:** F1-01 completada (datos válidos en Oracle).

---

### F2-02 — Sistema de Notificaciones In-App y UX Crítica (Semana 4)

**Objetivo:** Eliminar todos los `alert()` nativos y reemplazarlos con un sistema de notificaciones integrado al diseño del producto.

**Incluye:**
- Componente `Toast.jsx` con Framer Motion (success, error, info, warning)
- Reemplazar 3 instancias de `alert()` en `TutorChat.jsx`
- Manejo visual de errores de red en el chat (spinner infinito → mensaje claro)
- Notificación de Level Up cuando el XP cruza un múltiplo de 200

**Justificación:**
`alert()` es el equivalente de poner cinta adhesiva en un producto de diseño cuidado. Bloquea el hilo del browser, usa estilos del sistema operativo y corta la inmersión visual. El Level Up es el momento emocional más importante de la gamificación — celebrarlo con un popup del SO lo invalida.

**Beneficio esperado:**
Experiencia de usuario coherente. Los momentos de feedback (completar misión, subir de nivel, error de voz) se integran al lenguaje visual del producto.

**Dependencias:** Ninguna.

---

### F2-03 — Seguridad Básica del Backend FastAPI (Semana 5-6)

**Objetivo:** Agregar autenticación mínima al backend FastAPI para proteger los endpoints de IA.

**Implementación en dos pasos:**

**Paso 1 — API Key estático (Semana 5, 3-4 horas):**
Un header `X-API-Key` validado por middleware en FastAPI. El frontend lo incluye en cada llamada a los endpoints de IA. Cierra el acceso no autorizado inmediato.

**Paso 2 — Rate Limiting (Semana 6, 3 horas):**
`slowapi` con límites configurables: máximo 20 mensajes de chat por minuto por IP, máximo 5 evaluaciones de pronunciación por minuto por IP.

**Justificación:**
En el estado actual, cualquier script puede consumir tokens de OpenAI y Azure indefinidamente. En producción con una URL pública, esto es un riesgo financiero directo. El API key estático es la barrera mínima aceptable antes de cualquier piloto institucional.

**Beneficio esperado:**
El sistema puede deployarse con una URL pública sin riesgo de abuso económico inmediato.

**Riesgos:** El API key estático es visible en el bundle de JavaScript del frontend (si alguien inspecciona el código). Es una capa de protección, no una solución definitiva. La solución completa (token de Oracle propagado) está en Fase 3.

**Dependencias:** ALT-03 (variables de entorno para no hardcodear el API key).

---

### F2-04 — Variables de Entorno y Deployabilidad (Semana 3)

**Objetivo:** Centralizar todas las URLs en archivos `.env` usando `import.meta.env.VITE_*`.

**Justificación:**
El proyecto no puede pasar de desarrollo local a cualquier otro entorno sin editar 10 archivos manualmente. Esto bloquea demos remotos, pilotos institucionales y cualquier forma de CI/CD. Es el cambio más pequeño que habilita más capacidades operacionales.

**Beneficio esperado:**
El proyecto es deployable en cualquier entorno con solo cambiar las variables de entorno. Habilita staging, producción y CI/CD.

**Dependencias:** Prerequisito para F2-03.

---

### F2-05 — Página /library (Semana 7-8)

**Objetivo:** Implementar el repositorio de recursos gramaticales del curso.

**Contenido:**
- Lista de topics con sus gramáticas principales (`GRAMMAR_TITLE`, `GRAMMAR_EXAMPLE`)
- Fichas de gramática descargables o consultables
- Vocabulario clave por misión

Los datos existen en Oracle — es una vista de lectura sin lógica compleja.

**Justificación:**
La tercera página vacía del producto. Completa el conjunto de navegación del sistema. Los recursos gramaticales son un valor añadido directo para el estudiante — puede repasar gramática sin necesidad de abrir una conversación.

**Beneficio esperado:**
Las 6 páginas del sistema tienen contenido real. El producto está completo en su Fase 1.

**Dependencias:** F2-04 (variables de entorno).

---

### F2-06 — Refactorización de TutorChat.jsx en Custom Hooks (Semana 8-9)

**Objetivo:** Extraer las 7 responsabilidades de `TutorChat.jsx` en hooks independientes y unificar `sendMessage`/`sendTranscriptMessage`.

**Hooks a extraer:**
- `useAudioRecorder()` — grabación, MediaRecorder, stream lifecycle
- `useTutorChat(mission, conversationId)` — mensajes, GPT, TTS, persistencia Oracle
- `useMissionProgress(mission)` — progreso, XP, completado, carga inicial

**Unificación:**
`sendMessage` y `sendTranscriptMessage` se convierten en una única `handleSendMessage(text, pronunciationData = null)`.

**Justificación:**
785 líneas con 7 responsabilidades es el mayor riesgo de mantenibilidad del proyecto. Cada feature nueva que toca el flujo de misión debe modificar este archivo. La refactorización no agrega funcionalidad — elimina riesgo. El timing correcto es después de que F1-01 y F1-02 estén implementados, para refactorizar código ya correcto.

**Beneficio esperado:**
Cada hook puede modificarse y probarse independientemente. El componente `TutorChat` se reduce a composición + JSX. El riesgo de regresión de futuras features se reduce significativamente.

**Riesgos:** La refactorización más riesgosa del proyecto — toda la experiencia de aprendizaje pasa por este componente. Hacerla de forma incremental (un hook por semana) con pruebas exhaustivas del flujo completo después de cada extracción.

**Dependencias:** F1-01, F1-02, F1-03 completadas. El código debe estar correcto antes de refactorizarse.

---

### F2-07 — Lógica de Actualización del Streak Diario en Oracle (Semana 6)

**Objetivo:** Actualizar `ESTUDIANTES.STREAK_DAYS` y `ULTIMO_ACCESO` al hacer login exitoso.

**Lógica en `PKG_AUTH.LOGIN_ESTUDIANTE`:**
```sql
IF TRUNC(ULTIMO_ACCESO) = TRUNC(SYSDATE) - 1 THEN
    STREAK_DAYS := STREAK_DAYS + 1;
ELSIF TRUNC(ULTIMO_ACCESO) < TRUNC(SYSDATE) - 1 THEN
    STREAK_DAYS := 1; -- resetear racha
-- Si fue hoy: no cambiar
END IF;
ULTIMO_ACCESO := SYSTIMESTAMP;
```

**Justificación:**
La racha de días es una de las métricas de gamificación más potentes para incentivar práctica diaria. El campo existe en Oracle y ya se devuelve en el login — solo falta la lógica que lo actualice. Con F1-01 mostrando el valor real desde el store, actualizar la lógica en Oracle completa el ciclo.

**Dependencias:** F1-01 (mostrar streak del store primero) · Acceso a Oracle para modificar `PKG_AUTH`.

---

### Entregable de Fase 2

Al finalizar los 90 días:
- Las 6 páginas del sistema tienen contenido real
- El backend tiene autenticación básica y rate limiting
- El proyecto es deployable en cualquier entorno
- `TutorChat.jsx` está refactorizado en hooks mantenibles
- La gamificación (streak, level up) funciona con datos reales
- **La Fase 1 del roadmap oficial está 100% completada**

**El producto pasa de Beta a Release Candidate para piloto institucional.**

---

---

## FASE 3 — PRÓXIMOS 6 MESES
### "Expansión Pedagógica e Inteligencia Educativa"

**Objetivo de la fase:** Implementar las funcionalidades diferenciadores del producto que lo posicionan como plataforma educativa premium y habilitan el negocio B2B con instituciones universitarias.

**Principio rector:** Con el core sólido y los datos reales, cada nueva feature tiene impacto real medible.

---

### F3-01 — Speaking Challenges (Mes 3)

**Objetivo:** Agregar un segundo modo de práctica donde el estudiante pronuncia una frase específica y Azure evalúa contra esa frase de referencia.

**Diferencia con el flujo actual:**
- Flujo actual: el estudiante dice cualquier cosa → Azure compara contra la transcripción de lo que dijo
- Speaking Challenge: se muestra una frase objetivo → el estudiante la pronuncia → Azure compara contra la frase exacta

Esto da un score de pronunciación significativo de una expresión pedagógica definida por el currículo.

**Requiere:**
- Nueva estructura en Oracle: tabla `MISSION_CHALLENGES` o columna `REFERENCE_PHRASES` en MISSIONS
- Nuevo modo de grabación en `TutorChat.jsx` (o nuevo componente `SpeakingChallenge.jsx`)
- Cambio en `pronunciationService.js`: `referenceText` externo en lugar de la transcripción

**Justificación:**
Es la diferencia entre un test de pronunciación real y un test de "pronuncié lo que dije". Los Speaking Challenges son el elemento pedagógico que justifica el precio premium ante las instituciones — evaluación de pronunciación de expresiones específicas del currículo, no de cualquier frase aleatoria.

**Beneficio esperado:**
Scores de pronunciación pedagógicamente válidos. Contenido estructurado que puede alinearse al CEFR. Diferenciador visible en demostraciones institucionales.

**Riesgos:** Requiere diseño de banco de frases de referencia por misión — decisión pedagógica que el equipo debe tomar. La complejidad técnica es media, la complejidad de contenido es alta.

**Dependencias:** F2-06 (TutorChat refactorizado, más fácil agregar un nuevo modo).

---

### F3-02 — Analítica de Pronunciación Detallada (Mes 3-4)

**Objetivo:** Mostrar retroalimentación fonémica: qué palabras específicas tuvo más dificultad el estudiante, usando los datos de Azure SDK que ya se generan pero no se procesan.

**Azure SDK está configurado con `PronunciationAssessmentGranularity.Phoneme`** — el resultado incluye datos a nivel de palabra y fonema pero actualmente solo se devuelven los 4 scores globales.

**Requiere:**
- `azure_pronunciation.py`: incluir `NBest[0].Words` en la respuesta
- `SPEAKING_ANALYSIS` (tabla Oracle existente): persistir análisis por palabra
- Nuevo componente `WordFeedback.jsx`: palabras coloreadas por score de pronunciación

**Justificación:**
La tabla `SPEAKING_ANALYSIS` existe en Oracle con campos `PRONUNCIATION_SCORE`, `FLUENCY_SCORE`, `VOCABULARY_SCORE`, `ORIGINAL_TEXT`, `CORRECTED_TEXT` — diseñada exactamente para esto y nunca utilizada. El SDK ya genera los datos. Solo falta el pipeline de persistencia y visualización. Esta feature convierte la evaluación de pronunciación de "te doy un número" a "te muestro exactamente qué palabras pronunciaste mal".

**Beneficio esperado:**
Retroalimentación pronunciación accionable. El estudiante sabe exactamente qué palabras trabajar. Es el diferenciador tecnológico más sofisticado del producto.

**Dependencias:** F1-03 (pipeline de persistencia en Oracle establecido), F3-01 (Speaking Challenges como contexto de uso principal).

---

### F3-03 — Teacher Dashboard Básico (Mes 4-5)

**Objetivo:** Vista mínima para académicos que permita supervisar el progreso de sus estudiantes.

**MVP del Teacher Dashboard:**
- Login diferenciado por ROL = 'ACADEMICO' (tabla `ACADEMICOS` ya existe)
- Lista de estudiantes inscritos en su curso con `ID_ACADEMICO`
- Progreso por estudiante: misiones completadas, XP total, score promedio de pronunciación y gramática
- Identificación de estudiantes con bajo rendimiento (criterio configurable: ej. < 50% de progreso promedio)

**No incluir en el MVP:** edición de contenido, reportes exportables, comunicación con estudiantes.

**Justificación:**
El Teacher Dashboard es el argumento de venta B2B más directo del producto. Las instituciones universitarias no compran software para los estudiantes — lo compran para que los académicos tengan visibilidad del aprendizaje. Sin esta vista, el negocio institucional es difícil de cerrar. La tabla `ACADEMICOS` existe, `INSCRIPCIONES.ID_ACADEMICO` ya relaciona el académico con el grupo — la infraestructura de datos está lista.

**Beneficio esperado:**
El producto es vendible a nivel institucional. Los académicos pueden tomar decisiones pedagógicas basadas en datos. Abre la posibilidad de contratos institucionales.

**Riesgos:** Requiere autenticación diferenciada por rol — la complejidad más alta de esta fase. `AUTENTICACION_CAA` existe en Oracle pero gestiona cuentas APEX, no el API REST actual.

**Dependencias:** F2-03 (autenticación en FastAPI), F2-01 (página de progreso como referencia de qué datos mostrar), F1-01 (datos válidos en Oracle para que el dashboard tenga significado).

---

### F3-04 — Adaptive Learning Engine Básico (Mes 5-6)

**Objetivo:** Ajustar el system prompt del tutor basado en el desempeño histórico del estudiante.

**Versión mínima:**
- Antes de cada conversación, consultar `USER_PROGRESS.GRAMMAR_SCORE` y `PRONUNCIATION_SCORE` del estudiante
- Si `GRAMMAR_SCORE < 60` promedio: el system prompt indica al tutor que simplifique el lenguaje y corrija con más paciencia
- Si `GRAMMAR_SCORE > 80` promedio: el system prompt indica al tutor que introduzca estructuras más complejas

**Justificación:**
La Fase 3 del roadmap oficial incluye Adaptive Learning. Con datos reales de gramática y pronunciación (resultado de F1-01 y F1-02), el sistema tiene la materia prima para adaptar la dificultad. Esta es la diferencia entre un tutor genérico y un tutor personalizado — la promesa central del producto.

**Beneficio esperado:**
El tutor se adapta al nivel real del estudiante. Los principiantes no se frustran con lenguaje complejo. Los avanzados no se aburren con ejercicios demasiado simples.

**Dependencias:** F1-01, F1-02 (datos reales en Oracle como input del adaptador), F1-06 (historial en GPT), al menos 5-10 interacciones por estudiante para tener promedio significativo.

---

### F3-05 — Mover Oracle ORDS detrás de FastAPI (Mes 5-6)

**Objetivo:** Eliminar el acceso directo del frontend a Oracle ORDS. Todo el tráfico de datos pasa por FastAPI.

**Arquitectura objetivo:**
```
React → FastAPI → Oracle ORDS → Oracle ADB
```

**Actualmente:**
```
React → Oracle ORDS directamente (6 servicios)
React → FastAPI (4 servicios)
```

**Requiere:**
- ~10 nuevos endpoints en FastAPI que proxeen las llamadas actuales a Oracle ORDS
- Migrar los 6 servicios del frontend de Oracle ORDS a FastAPI
- FastAPI valida la sesión del usuario antes de cada llamada a Oracle

**Justificación:**
Es el mayor riesgo arquitectónico activo. Oracle ORDS con `p_auto_rest_auth => FALSE` es completamente público. Cualquier usuario puede manipular `id_inscripcion` o `mission_id` en DevTools para escribir datos de otro estudiante. En una plataforma educativa institucional, esto es un riesgo de integridad de datos inaceptable.

**Beneficio esperado:**
Arquitectura segura y correcta. FastAPI como único punto de control de autenticación y autorización. Posibilidad de agregar lógica de negocio en el servidor sin modificar Oracle.

**Riesgos:** Migración arquitectónica mayor. Requiere tiempo sin features nuevas en paralelo. El riesgo de regresión es el más alto de este roadmap — cada servicio migrado debe probarse.

**Dependencias:** F2-03 (autenticación en FastAPI establecida), F2-04 (variables de entorno).

---

### Entregable de Fase 3

Al finalizar los 6 meses:
- Speaking Challenges con evaluación de pronunciación de frases del currículo
- Retroalimentación fonémica visual por palabra
- Teacher Dashboard básico operativo
- Tutor adaptativo que ajusta dificultad según el historial del estudiante
- Oracle ORDS protegido detrás de FastAPI
- **El producto está en condiciones de producción real con múltiples instituciones**

---

---

## ORDEN DE IMPLEMENTACIÓN RECOMENDADO

### Qué construir primero

**1. Sprint de Integridad de Datos (F1-01)** — Semana 1
Razón: Todo lo demás se construye sobre `USER_PROGRESS`. Con datos corruptos, cada feature nueva hereda la corrupción.

**2. Tutor con memoria (F1-02)** — Semana 2
Razón: El impacto pedagógico inmediato más alto del roadmap completo. No requiere infraestructura nueva, solo cambiar el contrato de la API.

**3. Persistir correcciones + Revocar API keys (F1-03, F1-04)** — Semana 2
Razón: F1-03 completa el pipeline pedagógico. F1-04 tiene deadline implícito de seguridad.

### Qué construir después

**4. Variables de entorno (F2-04)** — Semana 3
Razón: Prerequisito para deployar cualquiera de las siguientes iniciativas fuera de localhost.

**5. Páginas /progress y /profile (F2-01)** — Semanas 3-5
Razón: Completan el producto visualmente. Los datos ya son válidos gracias a F1-01.

**6. Sistema de notificaciones y UX (F2-02)** — Semana 4
Razón: Baja complejidad, alto impacto en la percepción de calidad del producto.

**7. Autenticación FastAPI + Rate Limiting (F2-03)** — Semanas 5-6
Razón: Prerequisito para cualquier piloto institucional con URL pública.

**8. Streak en Oracle + Página /library (F2-07, F2-05)** — Semanas 6-8
Razón: Completan la Fase 1 del roadmap oficial.

**9. Refactorización TutorChat (F2-06)** — Semanas 8-9
Razón: El timing correcto es cuando el código ya está correcto. No antes.

### Qué debe esperar

**10. Speaking Challenges (F3-01)** — Mes 3
Esperar porque requiere decisiones de contenido pedagógico y nuevo schema en Oracle. No se puede apresurar.

**11. Teacher Dashboard (F3-03)** — Mes 4-5
Esperar porque requiere autenticación por rol robusta (no el API key estático de F2-03) y datos válidos acumulados en Oracle.

**12. Mover ORDS detrás de FastAPI (F3-05)** — Mes 5-6
Esperar porque es el cambio arquitectónico de mayor riesgo. Hacer con el equipo estabilizado y sin otras features en desarrollo paralelo.

### Qué puede descartarse temporalmente

**WhatsApp Integration** — Indefinidamente
No hay producto web completo aún. WhatsApp añade un canal que el sistema base no puede sostener correctamente.

**TypeScript Migration** — Indefinidamente
No aporta funcionalidad y consume tiempo de un desarrollador solo. Evaluar cuando el equipo crezca.

**Avatar Conversacional** — Semestre 2
Impacto visual, no pedagógico. No priorizar mientras haya funcionalidades de aprendizaje pendientes.

**Multi-institución y Facturación** — Fase 4
Requiere que el producto esté en producción real con al menos una institución primero.

---

---

## RIESGOS ESTRATÉGICOS

### Alta Prioridad

| ID | Riesgo | Tipo | Descripción |
|---|---|---|---|
| RS-01 | Datos corruptos acumulados | Técnico / Producto | Cada día sin F1-01 agrega más historial falso en Oracle. Los promedios del Dashboard empeorarán progresivamente hasta que se corrijan los datos históricos. |
| RS-02 | API keys comprometidas | Seguridad | `PKG_SERVICIOS_IA.sql` tiene las claves activas en el repositorio. Si fue expuesto, el costo puede ser ilimitado. |
| RS-03 | Backend sin autenticación en producción | Seguridad / Financiero | Un script puede vaciar la cuota de OpenAI/Azure en horas. Cada petición a `/chat/message` cuesta dinero real. |
| RS-04 | TutorChat.jsx como single point of failure | Técnico | 785 líneas. Un bug introduce regresión en el 100% del flujo de aprendizaje. La refactorización es la única mitigación. |

### Media Prioridad

| ID | Riesgo | Tipo | Descripción |
|---|---|---|---|
| RS-05 | Oracle ORDS directamente expuesto | Seguridad / Arquitectura | Cualquier usuario autenticado puede manipular `id_inscripcion` y acceder o modificar datos de otro estudiante. |
| RS-06 | `recognize_once()` Azure bloquea el event loop | Escalabilidad | Una evaluación de pronunciación bloquea FastAPI para todos los usuarios durante ~3 segundos. Con 5 usuarios simultáneos, el sistema se degrada. |
| RS-07 | Historial de conversación sin paginación | Escalabilidad | `GET /chat/history` retorna todos los mensajes. Misiones de 30+ mensajes generan payloads grandes y tiempos de carga crecientes. |
| RS-08 | Dependencia de desarrollador único | Producto | Todo el conocimiento del sistema está centralizado. Sin documentación técnica activa, la salida del desarrollador sería crítica. |

### Baja Prioridad

| ID | Riesgo | Tipo | Descripción |
|---|---|---|---|
| RS-09 | Sin TypeScript | Mantenibilidad | Los errores de contrato entre componentes se detectan en runtime, no en compilación. |
| RS-10 | Mezcla de fetch y axios | Mantenibilidad | Configuración inconsistente de HTTP entre servicios. Timeout, auth headers y error handling se definen en múltiples lugares. |
| RS-11 | Período académico como control de acceso | Producto | Si el período vence durante un piloto, todos los estudiantes pierden acceso sin aviso. La app no comunica esto claramente. |

---

---

## ARQUITECTURA FUTURA

### Visión arquitectónica a 6 meses

```
┌─────────────────────────────────────────────┐
│           BROWSER (React SPA)                │
│                                             │
│  Estado: Zustand (auth, conversations)       │
│  HTTP: axios centralizado con interceptors   │
│  Hooks: useAudioRecorder, useTutorChat,      │
│         useMissionProgress                   │
└─────────────┬───────────────────────────────┘
              │ HTTPS + X-API-Key header
              ▼
┌─────────────────────────────────────────────┐
│         FASTAPI (único punto de acceso)      │
│                                             │
│  Middleware: auth + rate limiting            │
│  Routes: chat, speech, tts, progress,        │
│          missions, conversations, auth       │
│  Services: openai, azure, google, oracle     │
└──────┬────────────────────────────────┬──────┘
       │ APIs externas                  │ Oracle ORDS
       ▼                                ▼
┌──────────────┐              ┌──────────────────┐
│  OpenAI GPT  │              │  Oracle ORDS     │
│  Google STT  │              │  (no accesible   │
│  Google TTS  │              │   desde browser) │
│  Azure Pron. │              └────────┬─────────┘
└──────────────┘                       │
                               ┌───────▼────────┐
                               │  Oracle ADB     │
                               │  USER_PROGRESS  │
                               │  CONVERSATIONS  │
                               │  MISSIONS       │
                               │  SPEAKING_ANLYS │
                               └────────────────┘
```

### Evolución por componente

**React Frontend**
- Fase 1: Correcciones de datos y store limpio
- Fase 2: 6 páginas completas, Zustand centralizado, hooks extraídos, axios unificado, variables de entorno
- Fase 3: Componentes de Speaking Challenges, visualización fonémica, Teacher Dashboard (si aplica rol)

**Backend Python (FastAPI)**
- Fase 1: Eliminar router duplicado, actualizar contrato de `/chat/message` con `history` y `grammar_score` calculado
- Fase 2: Middleware de autenticación (API key), rate limiting (slowapi), endpoint de progreso para `history`
- Fase 3: ~10 endpoints proxy para Oracle ORDS, autenticación por rol (ESTUDIANTE/ACADEMICO), `recognize_once()` convertido a async con `run_in_executor`

**Oracle Database y ORDS**
- Fase 1: Modificar `POST /chat/message` para incluir `CORRECTION`, rotar API keys en `PKG_SERVICIOS_IA`
- Fase 2: Actualizar `PKG_AUTH` con lógica de streak, agregar campo `OBJECTIVES` a MISSIONS si se requiere
- Fase 3: `SPEAKING_ANALYSIS` poblada desde el pipeline de pronunciación, nuevos endpoints ORDS para Teacher Dashboard, restricción de acceso en ORDS a solo FastAPI

**Integración de IA — Tutor Conversacional**
- Fase 1: Historial de 8 mensajes en cada petición a GPT
- Fase 2: Sin cambios al modelo
- Fase 3: Adaptive Learning — el system prompt incluye el perfil de desempeño del estudiante (grammar/pronunciation histórico) para ajustar la dificultad

**Integración de IA — Pronunciación**
- Fase 1: Sin cambios
- Fase 2: Sin cambios
- Fase 3: `azure_pronunciation.py` devuelve datos por palabra (`NBest[0].Words`), `SPEAKING_ANALYSIS` poblada, `recognize_once()` convertido a async

**WhatsApp Integration**
- Fases 1-3: Descartada temporalmente. El producto web debe estar completo y en producción real antes de añadir un canal adicional.

**Tutor Humano**
- Fases 1-2: Solo la tabla `ACADEMICOS` como base para el Teacher Dashboard
- Fase 3: Teacher Dashboard básico que permite al académico ver el progreso de sus estudiantes y potencialmente enviar mensajes de seguimiento

**Analítica Educativa**
- Fase 1: Datos reales en `USER_PROGRESS` como foundation
- Fase 2: Páginas `/progress` y `/profile` como primera capa de analítica personal
- Fase 3: Teacher Dashboard como capa de analítica grupal. `SPEAKING_ANALYSIS` con datos fonéticos. Base para predicción de riesgo académico en Fase 4.

---

---

## RECOMENDACIÓN FINAL DEL CTO

### Si solo pudiera elegir una iniciativa para desarrollar inmediatamente, sería:

## **F1-01 combinado con F1-02 — Integridad de datos + Tutor con memoria, como un único sprint de una semana**

No son dos iniciativas separadas. Son las dos caras de la misma deuda crítica: el sistema genera datos sin valor (F1-01) y el tutor responde sin contexto (F1-02). Solucionarlos juntos en una semana es lo que convierte el producto de "prototipo que funciona" a "producto que enseña".

---

### Justificación desde cada perspectiva

**Impacto educativo:**
`USER_PROGRESS` con `grammar_score = 85` siempre es el equivalente a un examen donde todos sacan la misma nota independientemente de su desempeño. La plataforma promete aprendizaje personalizado pero persiste datos que demuestran que no está midiendo nada real. El tutor sin memoria es un chatbot que el estudiante tiene que contextualizar en cada mensaje. Estas dos correcciones convierten el sistema en uno que efectivamente aprende del estudiante y responde a su historial. El impacto educativo es inmediato y total.

**Impacto comercial:**
El argumento de venta ante una institución universitaria es: "Nuestro sistema mide el progreso real del estudiante en gramática y pronunciación, y el tutor adapta cada conversación a lo que el estudiante ya practicó". Con `grammar_score = 85` hardcodeado y GPT sin memoria, ese argumento es falso. Con F1-01 y F1-02 implementados, el argumento es verdadero y demostrable en una reunión de 10 minutos. El impacto comercial es la diferencia entre un pitch que se demuestra y uno que se promete.

**Riesgo técnico:**
Ambas iniciativas son de complejidad baja-media. F1-01 son cambios de lógica en archivos existentes sin modificar contratos de API. F1-02 agrega un campo al modelo Pydantic de FastAPI y modifica cómo se construye el array de mensajes — sin cambiar la infraestructura subyacente. El riesgo de regresión es mínimo porque ambos cambios son aditivos.

**Tiempo de implementación:**
F1-01: 8-10 horas distribuidas en correcciones independientes.
F1-02: 4-5 horas en un cambio coordinado de 4 archivos.
**Total: menos de 2 días de trabajo.**

**Retorno de inversión:**
Con menos de 2 días de trabajo, el sistema pasa de tener datos pedagógicos inválidos a tener métricas reales. El tutor pasa de ser un chatbot sin memoria a un tutor que puede hacer seguimiento. Esto desbloquea el valor de todas las demás iniciativas del roadmap — la página `/progress`, el Teacher Dashboard, el Adaptive Learning — porque tendrán datos sobre los cuales operar. Ninguna otra iniciativa del backlog tiene un ROI comparable en términos de impacto por hora invertida.

### La secuencia no es negociable

Implementar cualquier cosa antes de F1-01 significa seguir acumulando datos corruptos en Oracle. Implementar la página `/progress` antes de F1-01 significa mostrar al estudiante que su gramática es siempre perfecta (85%). Implementar el Teacher Dashboard antes de F1-01 significa dar al académico un dashboard de datos inventados.

**Sanear la fuente de verdad primero. Construir sobre datos reales después. No hay otra secuencia que tenga sentido.**
