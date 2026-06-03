# IMPLEMENTATION_PLAN_MVP09.md
# MVP-09 — Streak real desde Oracle en el Dashboard

> **Estado:** ✅ COMPLETADO — 2026-06-02
> **Fecha:** 2026-06-02
> **Iniciativa:** MVP-09 del PRODUCT_BACKLOG.md
> **Estimación:** 30 minutos de implementación + pruebas
> **Riesgo de implementación:** Bajo — cambio de una línea en un componente aislado

---

## 1. Cómo funciona actualmente el flujo de streak

*(Nota: el template pregunta por "grammar score". Para MVP-09, el flujo relevante es el de la racha de días.)*

### El dato existe y ya viaja al frontend — simplemente no se usa

```
ESTUDIANTES.STREAK_DAYS (NUMBER DEFAULT 0)
    │
    └─ PKG_AUTH.LOGIN_ESTUDIANTE
            │
            SELECT E.STREAK_DAYS ...
            APEX_JSON.WRITE('streakDays', R.STREAK_DAYS)
            │
            └─ POST /ords/api/auth/login
                    │
                    └─ respuesta JSON:
                        {
                          "success": true,
                          "student": {
                            "matricula": "...",
                            "nombre": "...",
                            "streakDays": 5,    ← ya está aquí
                            "xp": 120,
                            ...
                          }
                        }
    │
    └─ LoginPage.jsx
            │
            const result = await loginStudent(matricula, password);
            login(result.student, result.inscripcion);
            │
            └─ authStore.js
                    │
                    set({ student: result.student, ... })
                    ← student.streakDays = 5 persiste en localStorage
    │
    └─ Dashboard.jsx
            │
            const student = useAuthStore((state) => state.student);
            ← student.streakDays disponible aquí
            │
            └─ <StatCard title="Current Streak" value="7 Days" ... />
                                                        ↑
                                              HARDCODEADO — nunca usa student.streakDays
```

### El punto exacto del problema

**`src/pages/Dashboard.jsx` línea 165:**
```jsx
<StatCard title="Current Streak" value="7 Days" subtitle="Keep going" />
```

`student.streakDays` ya está disponible en el componente (línea 18: `const student = useAuthStore(...)`). El valor real de Oracle se ignora completamente y se muestra "7 Days" a todos los estudiantes siempre.

### Verificación de la cadena de datos

| Eslabón | Estado |
|---|---|
| `ESTUDIANTES.STREAK_DAYS` (Oracle) | ✅ Campo existe — `NUMBER DEFAULT 0` |
| `PKG_AUTH.LOGIN_ESTUDIANTE` | ✅ Incluye `E.STREAK_DAYS` en SELECT y `APEX_JSON.WRITE('streakDays', ...)` |
| `POST /auth/login` (ORDS) | ✅ Retorna `student.streakDays` en la respuesta |
| `authService.js` | ✅ `return response.json()` — pasa el objeto completo sin mapeo |
| `LoginPage.jsx` | ✅ `login(result.student, result.inscripcion)` — guarda todo en el store |
| `authStore.js` | ✅ `set({ student, ... })` — preserva `streakDays` tal como viene |
| `Dashboard.jsx` | ❌ Usa `"7 Days"` en lugar de `student.streakDays` |

---

## 2. Análisis de impacto arquitectónico completo

### Archivos React afectados

| Archivo | Línea | Cambio |
|---|---|---|
| `src/pages/Dashboard.jsx` | 165 | `value="7 Days"` → `value={\`${student.streakDays ?? 0} Days\`}` |

### Servicios Python afectados

**Ninguno.**

### Packages Oracle afectados

**Ninguno.** `PKG_AUTH.LOGIN_ESTUDIANTE` ya devuelve `streakDays`. No se requiere ningún cambio.

### Procedimientos afectados

**Ninguno.**

### Endpoints ORDS afectados

**Ninguno.** `POST /auth/login` ya incluye `streakDays` en la respuesta.

### Tablas Oracle afectadas

| Tabla | Campo | Cambio |
|---|---|---|
| `ESTUDIANTES` | `STREAK_DAYS NUMBER DEFAULT 0` | Solo lectura — MVP-09 consume el dato, no lo modifica |

### Reglas de negocio afectadas

| Regla | Estado actual | Estado después del fix |
|---|---|---|
| PROJECT_VISION Regla #5: XP y gamificación basados en desempeño real | Violada — el streak es ficticio | Corregida — muestra el valor real de Oracle |
| PROJECT_VISION Regla #4: El progreso debe ser medible | Parcialmente violada — el streak no refleja realidad | Corregida para esta métrica |

---

## 3. Cambio único a realizar

### `Dashboard.jsx` línea 165

```jsx
// ANTES:
<StatCard title="Current Streak" value="7 Days" subtitle="Keep going" />

// DESPUÉS:
<StatCard
  title="Current Streak"
  value={`${student.streakDays ?? 0} Days`}
  subtitle="Keep going"
/>
```

**Por qué `?? 0` y no `|| 0`:**
- `??` (nullish coalescing) solo aplica el fallback si `streakDays` es `null` o `undefined`
- `||` aplicaría el fallback también si `streakDays` es `0` — lo que sería correcto en comportamiento pero menos semántico
- Ambos funcionan igual para este caso; `??` es más preciso

**Por qué no necesita optional chaining (`student?.streakDays`):**
`Dashboard.jsx` ya tiene un guard en línea 76-78:
```jsx
if (!student) {
  return <div className="text-white p-10">No authenticated student</div>;
}
```
Si el componente llega a renderizar el `StatCard`, `student` ya está garantizado. `student.streakDays ?? 0` es seguro.

---

## 4. Riesgos de implementación

### Riesgo 1 — `STREAK_DAYS` es 0 para todos los estudiantes (Conocido, aceptado)

**Descripción:** El campo `STREAK_DAYS` existe en Oracle con `DEFAULT 0`. La lógica que actualiza este valor (detectar acceso diario, comparar con `ULTIMO_ACCESO`, incrementar/resetear el streak) no está implementada en `PKG_AUTH`. Está documentada como **MED-06** en el backlog.

**Efecto en MVP-09:** El Dashboard mostrará "0 Days" en lugar de "7 Days". Esto es **correcto** — el valor real es 0 porque la lógica de actualización aún no existe. Es más honesto que mostrar "7 Days" ficticio.

**Mitigación:** Ninguna requerida para MVP-09. MED-06 implementará la lógica de actualización del streak como mejora separada.

### Riesgo 2 — `streakDays` ausente en sesiones antiguas del store (Muy Bajo)

**Descripción:** Usuarios que iniciaron sesión antes de que `PKG_AUTH` devolviera `streakDays` tendrían `student.streakDays = undefined` en su `localStorage`.

**Evaluación:** El campo `'streakDays'` está en `PKG_AUTH` desde el inicio (está documentado en el PACKAGE_BODY actual). No hay versiones previas que no lo incluyeran. El fallback `?? 0` maneja el caso hipotético.

### Riesgo 3 — El valor no actualiza en sesión activa (Informativo)

**Descripción:** `streakDays` se lee una vez durante el login y se persiste en `authStore`. Si el streak cambia (por MED-06 en el futuro), el usuario vería el valor actualizado recién en el próximo login, no en tiempo real.

**Evaluación:** Comportamiento correcto para un dato de sesión. El streak no cambia durante una sesión de trabajo — cambia al hacer login al día siguiente.

---

## 5. Estrategia de despliegue

### Prerequisitos

**Ninguno.** MVP-09 no depende de ningún MVP previo ni de cambios en Oracle.

### Orden de cambios

Un solo archivo, una sola línea. No requiere coordinación con backend ni Oracle.

### Efecto inmediato

Al hacer login, `student.streakDays` ya contiene el valor de Oracle. El cambio en Dashboard es instantáneamente visible sin ninguna llamada adicional a la red.

---

## 6. Estrategia de pruebas

### Prueba 1 — El valor mostrado proviene de Oracle (manual, ~5 min)

1. Iniciar sesión.
2. Navegar al Dashboard.
3. **Esperado:** "Current Streak" muestra el valor real de `ESTUDIANTES.STREAK_DAYS` (probablemente "0 Days").
4. **Antes del fix:** siempre mostraba "7 Days".

### Prueba 2 — Verificar el valor en Oracle (manual, ~3 min)

```sql
SELECT MATRICULA, STREAK_DAYS
FROM ESTUDIANTES
WHERE MATRICULA = '<tu_matricula>';
```

El valor en el Dashboard debe coincidir exactamente con `STREAK_DAYS` en Oracle.

### Prueba 3 — Verificar el valor en authStore (manual, ~2 min)

DevTools → Application → Local Storage → `activa-ingles-auth` → buscar `streakDays` en el JSON.

El valor en `localStorage` debe coincidir con Oracle y con lo que muestra el Dashboard.

---

## 7. Resumen de artefactos afectados

### Solo se modifica 1 línea en 1 archivo

| Archivo | Línea | Cambio |
|---|---|---|
| `src/pages/Dashboard.jsx` | 165 | `"7 Days"` → `\`${student.streakDays ?? 0} Days\`` |

### No se modifica nada de esto

| Artefacto | Razón |
|---|---|
| `authStore.js` | Ya persiste `student.streakDays` desde el login |
| `authService.js` | Ya retorna el objeto completo sin filtrado |
| `LoginPage.jsx` | Ya llama a `login(result.student, ...)` con el dato incluido |
| `PKG_AUTH` | Ya devuelve `streakDays` en la respuesta JSON |
| Oracle DDL | `ESTUDIANTES.STREAK_DAYS` ya existe |
| Oracle ORDS `auth.sql` | `POST /auth/login` ya funciona correctamente |

---

## 8. Nota sobre MED-06 (fuera de scope)

MVP-09 expone el valor real de `STREAK_DAYS`. Para que ese valor sea significativo (mayor que 0), se necesita implementar **MED-06**: lógica en `PKG_AUTH.LOGIN_ESTUDIANTE` que compare `SYSDATE` con `ESTUDIANTES.ULTIMO_ACCESO` y actualice `STREAK_DAYS` acorde.

MED-06 es un cambio en Oracle que no afecta al frontend — cuando se implemente, el Dashboard mostrará automáticamente el streak correcto sin ningún cambio adicional en React.

---

---

## 9. Resultados de pruebas — 2026-06-02

| # | Acción | Resultado esperado | Estado |
|---|---|---|---|
| 1 | Iniciar sesión → Dashboard | "Current Streak" muestra valor real de Oracle | ✅ |
| 2 | `SELECT STREAK_DAYS FROM ESTUDIANTES WHERE MATRICULA = '...'` | Coincide con el Dashboard | ✅ |
| 3 | DevTools → `activa-ingles-auth` → campo `streakDays` | Coincide con Oracle y con la UI | ✅ |

Corrección adicional aplicada: eliminado `console.log(missions)` pre-existente en `loadMissions` que referenciaba estado desactualizado y generaba warning de `useEffect` exhaustive-deps.

---

*Implementado y verificado el 2026-06-02.*
