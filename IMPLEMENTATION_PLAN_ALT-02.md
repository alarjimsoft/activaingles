# IMPLEMENTATION_PLAN_ALT-02.md
# Plan de Implementación: Página /profile

> **Iniciativa:** ALT-02 — Implementación de la página /profile
> **Fecha de análisis:** 2026-06-03
> **Estado actual del sistema:** MVP-01 a MVP-11 completados · ALT-01 completado
> **Prerequisitos:** Ninguno técnico bloqueante. Todos los datos necesarios para la v1 están disponibles.
> **Estimación del backlog:** Pequeña (2-3 días)

---

## 1. Contexto y Estado Actual

La página `/profile` existe en el router (`AppRouter.jsx`) y está protegida por `ProtectedRoute`, pero su componente (`src/pages/Profile.jsx`) solo renderiza:

```jsx
<MainLayout>
  <h1 className="text-white text-5xl font-bold">Profile</h1>
</MainLayout>
```

A diferencia de ALT-01, **la mayor parte de los datos del perfil ya está disponible en memoria** desde el momento del login. No se necesitan nuevas llamadas de red para la primera versión.

---

## 2. Mapa de Datos — Fuentes verificadas con DDL real

### 2.1 Datos en `authStore.student` (cero llamadas de red)

Confirmados contra `PKG_AUTH.LOGIN_ESTUDIANTE` (el package body real):

| Campo JS | Columna Oracle | Tipo | Notas |
|---|---|---|---|
| `student.nombre` | `ESTUDIANTES.NOMBRE` | VARCHAR2(40) | Solo primer nombre, NO nombre completo |
| `student.apellidoPaterno` | `ESTUDIANTES.APELLIDOPATERNO` | VARCHAR2(20) | Apellido paterno |
| `student.apellidoMaterno` | `ESTUDIANTES.APELLIDOMATERNO` | VARCHAR2(20) | Apellido materno |
| `student.matricula` | `ESTUDIANTES.MATRICULA` | VARCHAR2(40) | Número de matrícula |
| `student.nivel` | `ESTUDIANTES.NIVEL_INGLES` | VARCHAR2(10) | Nivel CEFR: A1, A2, B1... |
| `student.xp` | `ESTUDIANTES.XP` | NUMBER | XP denormalizado en ESTUDIANTES ⚠️ |
| `student.streakDays` | `ESTUDIANTES.STREAK_DAYS` | NUMBER | Racha de días |

**Nombre completo no existe como campo único.** Debe construirse en el frontend:
```javascript
const fullName = `${student.nombre} ${student.apellidoPaterno} ${student.apellidoMaterno}`;
```

### 2.2 Datos en `authStore.inscripcion` (cero llamadas de red)

| Campo JS | Columna Oracle | Notas |
|---|---|---|
| `inscripcion.idInscripcion` | `INSCRIPCIONES.ID_INSCRIPCION` | ID pedagógico principal |
| `inscripcion.idCurso` | `INSCRIPCIONES.ID_CURSO` | ID del curso activo |
| `inscripcion.idPeriodo` | `INSCRIPCIONES.ID_PERIODO` | ID del período académico |

### 2.3 Datos de `getDashboardStats` (1 llamada — ya la hace el Sidebar)

Endpoint: `GET /progress/stats/:id_inscripcion`

| Campo respuesta | Origen Oracle | Fórmula |
|---|---|---|
| `stats.total_xp` | `SUM(USER_PROGRESS.TOTAL_XP_EARNED)` | XP real para nivel |
| `stats.level` | Calculado | `FLOOR(total_xp / 200) + 1` |
| `stats.xp_next_level` | Calculado | `(level) * 200` |
| `stats.completed_missions` | `SUM(IS_COMPLETED = 'Y')` | |
| `stats.total_missions` | `COUNT(*)` | Misiones con progreso iniciado |
| `stats.total_time` | `SUM(TOTAL_TIME_MINUTES)` | Minutos acumulados |
| `stats.avg_pronunciation` | `AVG(PRONUNCIATION_SCORE)` | Score promedio voz |
| `stats.avg_grammar` | `AVG(GRAMMAR_SCORE)` | Score promedio gramática |

### 2.4 Campos de ESTUDIANTES NO disponibles sin nueva llamada

| Columna DDL | Disponible | Motivo de ausencia |
|---|---|---|
| `CARRERA` | ❌ | No devuelto por `PKG_AUTH.LOGIN_ESTUDIANTE` |
| `FOTO` (BLOB) | ❌ | No devuelto por login (binario grande) |
| `ULTIMO_ACCESO` | ❌ | No devuelto por login |
| `CREATED_AT` | ❌ | No devuelto por login |
| `ESTADO` | ❌ | Implícitamente 'ACTIVO' (validado en login) |
| `ROL` | ❌ | No devuelto por login |

### 2.5 Campos de INSCRIPCIONES NO disponibles sin nueva llamada

| Columna DDL | Disponible | Notas |
|---|---|---|
| `CALIFICACION_FINAL` | ❌ | Calificación final del curso |
| `APROBADO` | ❌ | Char 'S'/'N' |
| `FECHA_INSCRIPCION` | ❌ | Fecha de inicio del curso |

---

## 3. Análisis de Impacto Arquitectónico

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio |
|---|---|
| `src/pages/Profile.jsx` | **Reescritura completa** — de `<h1>` a página funcional |

No se necesita ningún componente nuevo. Los componentes existentes (`StatCard`, la barra de XP del Dashboard) sirven de referencia de diseño, pero el perfil tiene su propia estructura visual y no reutilizará esos componentes directamente — los valores y diseño son diferentes.

### 3.2 Servicios Python afectados

**Ninguno.** La página `/profile` es de solo lectura. No requiere FastAPI.

### 3.3 Packages Oracle afectados

**Ninguno en la implementación v1.** La página lee datos ya disponibles.

**Condicionalmente (si se decide mostrar `CARRERA` en v2):**
- Modificar `PKG_AUTH.LOGIN_ESTUDIANTE` para incluir `CARRERA` en el SELECT y en el JSON de respuesta
- Actualizar el handler ORDS `POST /auth/login`
- Actualizar `authStore.js` para almacenar el campo nuevo

### 3.4 Procedimientos afectados

**Ninguno.**

### 3.5 Endpoints ORDS afectados

| Endpoint | Tipo de uso | Cambio |
|---|---|---|
| `GET /progress/stats/:id_inscripcion` | Reutilización | Sin cambio — ya en `dashboardService.js` |
| `POST /auth/login` | Sin cambio en v1 | Candidato a modificación en v2 para incluir `CARRERA` |

### 3.6 Tablas Oracle afectadas

| Tabla | Acceso | Campos leídos |
|---|---|---|
| `ESTUDIANTES` | Solo lectura (indirecto via authStore) | `NOMBRE`, `APELLIDOPATERNO`, `APELLIDOMATERNO`, `MATRICULA`, `NIVEL_INGLES`, `XP`, `STREAK_DAYS` |
| `USER_PROGRESS` | Solo lectura (indirecto via /stats) | Agregados: `AVG_GRAMMAR`, `AVG_PRONUNCIATION`, `TOTAL_XP_EARNED`, `TOTAL_TIME_MINUTES` |

### 3.7 Reglas de negocio afectadas

| Regla | Impacto |
|---|---|
| BR-SYS-01 — Oracle es la fuente de verdad | ✅ Cumplida — todos los datos vienen de Oracle (via authStore desde login, o via stats endpoint) |
| BR-AUTH-02 — Sesión persistente | ✅ El perfil se llena desde el store persistido — funciona sin conexión |
| BR-AUTH-03 — Inscripción como contexto pedagógico | ✅ `idInscripcion` se usa para llamar a `getDashboardStats` |
| BR-XP-05 — XP calculado por Oracle | ✅ Se muestra `stats.total_xp` de Oracle, no `student.xp` (ver Sección 4.2) |
| BR-PROG-04 — El progreso debe ser medible | ✅ La página de perfil materializa esta regla con datos reales |

---

## 4. Flujo de Grammar Score — Estado Actual

### 4.1 Cómo funciona (después de MVP-01)

```
MENSAJE ENVIADO (texto o voz)
    │
    ├─ TutorChat.jsx → POST localhost:8000/chat/message
    │       │
    │       └─ chat.py → openai_service.py → GPT
    │               │
    │               └─ GPT devuelve { reply, correction: {...} | null }
    │
    │   chat.py calcula:
    │       grammar_score = 90   si correction is None   (buena gramática)
    │       grammar_score = 55   si correction != None    (error detectado)
    │
    ├─ TutorChat.jsx → POST /ords/api/progress/update
    │       payload: { grammar_score: 90 | 55 }
    │       Oracle: UPDATE USER_PROGRESS SET GRAMMAR_SCORE = :grammar_score
    │
    └─ GET /progress/stats/:id → AVG(GRAMMAR_SCORE) = avg_grammar
           ↑
           Este valor llega a la página de perfil
```

### 4.2 El problema de los dos XP

```
ESTUDIANTES.XP                      USER_PROGRESS.TOTAL_XP_EARNED
     │                                         │
     │ ← ADD_XP_TO_PROGRESS                    │ ← updateProgress()
     │   (procedure llamado                    │   (TutorChat cada mensaje)
     │    desde FastAPI)                        │
     │                                         │
     ↓                                         ↓
student.xp (authStore)              SUM → stats.total_xp (getDashboardStats)
     │                                         │
     │ NO se usa para nivel                    │ SÍ se usa para nivel
     └─────── ⚠️ Discrepancia posible ─────────┘

REGLA: Para mostrar el nivel real → usar stats.total_xp + stats.level
       No usar student.xp para la barra de progreso de nivel
```

### 4.3 Impacto en el perfil

La página de perfil **no modifica** el flujo de grammar score. Solo lo consume como dato de lectura (`stats.avg_grammar`). No hay cambio de comportamiento en este flujo.

---

## 5. Cambios a Realizar — Especificación Técnica

### 5.1 Único archivo modificado: `src/pages/Profile.jsx`

**Reescritura completa.** Sin nuevos servicios, sin nuevos componentes, sin cambios a Oracle.

**Lógica de carga:**

```javascript
useEffect(() => {
  async function load() {
    setLoading(true);
    try {
      const data = await getDashboardStats(inscripcion.idInscripcion);
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  if (inscripcion) load();
}, [inscripcion]);
```

Una sola llamada de red. El Sidebar ya la hace en paralelo — el resultado llegará cacheado por el browser desde el mismo dominio.

**Construcción del nombre completo:**
```javascript
const fullName = [student.nombre, student.apellidoPaterno, student.apellidoMaterno]
  .filter(Boolean)
  .join(" ");
```

**Secciones de la página:**

```
/profile
│
├── Header
│   ├── Avatar placeholder circular (iniciales del nombre)
│   ├── Nombre completo: nombre + apellidoPaterno + apellidoMaterno
│   ├── Matrícula
│   └── Nivel CEFR badge (A1, A2, B1...)
│
├── Level & XP card (reutiliza el diseño del badge del Dashboard)
│   ├── "Level N" + barra XP hacia siguiente nivel
│   └── stats.total_xp / stats.xp_next_level
│
├── Stats grid (4 cards):
│   ├── Streak: student.streakDays days
│   ├── Study Time: stats.total_time min
│   ├── Missions: stats.completed_missions / stats.total_missions
│   └── Avg Progress: stats.avg_progress %
│
└── Performance scores:
    ├── Grammar — barra semáforo — stats.avg_grammar (misma lógica que /progress)
    └── Pronunciation — barra semáforo — stats.avg_pronunciation
```

---

## 6. Riesgos de Implementación

### RIESGO-01 — `CARRERA` no está en authStore (MEDIO)

**Descripción:** El backlog propone mostrar la carrera del estudiante. `CARRERA` existe en `ESTUDIANTES` pero `PKG_AUTH.LOGIN_ESTUDIANTE` no la incluye en el JSON de respuesta. No está en `authStore.student`.

**Opciones:**
- **v1 (recomendada):** No mostrar carrera. Mostrar solo los datos disponibles. El perfil es igualmente completo y útil sin ella.
- **v2 (futura):** Añadir `CARRERA` al SELECT y al JSON de `PKG_AUTH.LOGIN_ESTUDIANTE`, actualizar el handler ORDS, actualizar `authStore.js`. Esta es una modificación de Oracle que requiere coordinación con el DBA.

**Decisión para este plan:** Implementar v1 sin carrera. Documentar la extensión como paso futuro en el plan.

---

### RIESGO-02 — `FOTO` BLOB requiere infraestructura especial (BAJO)

**Descripción:** `ESTUDIANTES.FOTO` es un campo BLOB. Retornarlo via ORDS requiere un handler especial con `source_type: 'media'` o serialización en base64. No existe dicho endpoint.

**Mitigación confirmada por backlog:** Usar avatar placeholder con las iniciales del estudiante. CSS puro, sin dependencias adicionales.

---

### RIESGO-03 — Triple llamada a `getDashboardStats` cuando se visita /profile (BAJO)

**Descripción:** Sidebar ya llama a `getDashboardStats`. Si Profile también la llama, hay una segunda llamada simultánea (solo hay una aquí, no dos como en /dashboard que tiene Sidebar + Dashboard).

**Contexto:** En `/profile`, el Sidebar llama `getDashboardStats` + `Profile.jsx` la llama → 2 llamadas simultáneas. En `/dashboard` son también 2. Igual que antes de ALT-02, no peor.

**Mitigación:** Aceptar hasta que se implemente ALT-09 (store centralizado de stats).

---

### RIESGO-04 — `student.xp` vs `stats.total_xp` — dos valores de XP (BAJO)

**Descripción:** Hay dos fuentes de XP para el mismo estudiante. Si se usa `student.xp` (de authStore, actualizado al login), puede diferir de `stats.total_xp` (calculado en tiempo real desde USER_PROGRESS).

**Mitigación:** Usar siempre `stats.total_xp` y `stats.level` para la barra de nivel. Nunca `student.xp` para cálculos de nivel. El `student.xp` puede usarse como referencia secundaria si se desea, pero no es la fuente canónica del nivel.

---

### RIESGO-05 — Datos históricos de grammar con valor 85 (INFORMATIVO)

**Descripción:** El `avg_grammar` mostrado en el perfil puede incluir registros históricos con `grammar_score = 85` (antes de MVP-01). Esto arrastra el promedio hacia 85 para estudiantes con sesiones antiguas.

**Mitigación:** No hay acción a tomar. El perfil muestra el dato real de Oracle tal como está. Con el tiempo y nuevas interacciones, el promedio se corregirá.

---

## 7. Estrategia de Despliegue

### 7.1 Orden de cambios

```
Solo 1 archivo a modificar:
  src/pages/Profile.jsx — reescritura completa

Sin cambios a:
  - progressService.js          (sin uso nuevo)
  - dashboardService.js         (reutilización sin cambio)
  - authStore.js                (sin cambio)
  - AppRouter.jsx               (ruta ya existe)
  - Oracle DDL                  (sin cambio)
  - FastAPI backend             (sin cambio)
```

### 7.2 Criterio de "listo para mostrar"

1. La página carga sin errores de consola para cualquier sesión activa.
2. Muestra nombre completo construido de los tres campos.
3. El nivel y XP coinciden con los del Dashboard (misma fuente: `getDashboardStats`).
4. El avatar placeholder muestra las iniciales correctas.
5. Estado de carga mientras `getDashboardStats` responde.
6. Mensaje de error amigable si Oracle no responde.

---

## 8. Estrategia de Pruebas

| Escenario | Verificación |
|---|---|
| Datos del estudiante en authStore | Nombre completo bien formado, matrícula y nivel visibles |
| Level y XP | Coinciden con los del Dashboard (misma fuente) |
| Streak = 0 (sin lógica de actualización) | Muestra "0 days" sin errores |
| avg_grammar con histórico 85 | Muestra el valor real de Oracle sin crash |
| avg_pronunciation = 0 (sin voz) | Muestra 0% con barra roja, sin crash |
| Sin sesión iniciada | Redirige a `/` por ProtectedRoute (comportamiento existente) |
| Error de red en getDashboardStats | Muestra mensaje de error, no pantalla blanca |
| Avatar placeholder | Muestra las iniciales del nombre correctamente |

---

## 9. Diseño Propuesto de la Página

```
┌─────────────────────────────────────────────────────────────────────┐
│  Student Profile                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  ┌──────┐                                                            │
│  │  JG  │  Juan García Martínez            ← nombre + apellidos      │
│  │      │  Matrícula: 20230045             ← matrícula               │
│  └──────┘  [ A1 ] English Level            ← nivel badge             │
│            Level 3 · 570 XP                ← stats.level/total_xp   │
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Level 3                                                            │
│  ████████████████░░░░  570 / 600 XP → Level 4                      │
└────────────────────────────────────────────────────────────────────┘

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Streak      │ │  Study Time  │ │  Missions    │ │  Avg Progress│
│  0 days      │ │  58 min      │ │  3 / 5       │ │  60%         │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Performance                                                      │
│  Grammar     ████████░░  82%  (verde ≥ 80)                       │
│  Pronunciation ███████░░░  70%  (amarillo 60-79)                 │
└──────────────────────────────────────────────────────────────────┘
```

**Avatar placeholder:** círculo con iniciales, gradiente de fondo.
```javascript
const initials = `${student.nombre?.[0] || ''}${student.apellidoPaterno?.[0] || ''}`.toUpperCase();
```

---

## 10. Tabla Resumen de Impacto

### Archivos React afectados

| Archivo | Cambio |
|---|---|
| `src/pages/Profile.jsx` | Reescritura completa (único cambio) |

### Servicios Python afectados

| Archivo | Cambio |
|---|---|
| *(ninguno)* | — |

### Packages Oracle afectados

| Package | Cambio |
|---|---|
| *(ninguno en v1)* | — |
| `PKG_AUTH.LOGIN_ESTUDIANTE` | Candidato a modificación en v2 (agregar `CARRERA`) |

### Endpoints ORDS afectados

| Endpoint | Cambio |
|---|---|
| `GET /progress/stats/:id_inscripcion` | Reutilización sin cambio |

### Tablas Oracle afectadas

| Tabla | Cambio |
|---|---|
| `ESTUDIANTES` | Solo lectura (indirecto via authStore) |
| `USER_PROGRESS` | Solo lectura (indirecto via /stats) |

---

## 11. Estimación

| Tarea | Tiempo estimado |
|---|---|
| Reescritura completa de `Profile.jsx` | 2-3 horas |
| Testing visual con datos reales | 1 hora |
| **Total** | **~3-4 horas** |

Estimación del backlog: "Pequeña (2-3 días)" — el margen extra cubre ajustes de diseño y pruebas con estudiantes de prueba.

---

## 12. Prerequisitos

- [x] `authStore.student` contiene `nombre`, `apellidoPaterno`, `apellidoMaterno`, `matricula`, `nivel`, `streakDays`
- [x] `getDashboardStats` disponible en `dashboardService.js`
- [x] Ruta `/profile` en `AppRouter.jsx`
- [x] `ProtectedRoute` en `/profile`
- [x] Link en `Sidebar` hacia `/profile`
- [x] ALT-01 completado (diseño de referencia para barras de score)

---

## 13. Extensión Futura — v2 del Perfil (no implementar ahora)

Para mostrar `CARRERA` en una versión futura, el orden de cambios sería:

1. **Oracle DBA:** `ALTER TABLE ESTUDIANTES` — ya existe el campo, no requiere DDL
2. **PKG_AUTH:** Agregar `E.CARRERA` al SELECT del loop y `APEX_JSON.WRITE('carrera', R.CARRERA)` al JSON
3. **ORDS:** Re-ejecutar el handler `POST /auth/login` (el PL/SQL ya estaba en auth.sql)
4. **authStore.js:** El campo `carrera` llegará automáticamente en el próximo login — no requiere cambio explícito si se accede como `student.carrera`
5. **Profile.jsx:** Mostrar `student.carrera` en el header de perfil

**Estimación v2:** 1 hora técnica + coordinación DBA para el redeploy del package.
