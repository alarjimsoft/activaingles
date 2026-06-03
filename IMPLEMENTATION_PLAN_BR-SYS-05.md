# IMPLEMENTATION_PLAN_BR-SYS-05
# Misiones pasadas como state de navegación — recuperación por URL param

**Regla:** BR-SYS-05 (BUSINESS_RULES.md)  
**Bug asociado:** BUG-04 (CLAUDE.md Sección 8)  
**Fecha de análisis:** 2026-06-03  
**Estado:** Pendiente de aprobación  
**Autor del análisis:** Claude Code (claude-sonnet-4-6)

---

## 1. Resumen ejecutivo

Cuando un usuario navega desde el Dashboard a una misión, `MissionCard` pasa el objeto `mission` completo a través de `location.state`. Si el usuario recarga la página en `/missions/:id`, el estado de navegación se pierde y `MissionPage` muestra "Mission not found".

La solución es un **fallback de recuperación**: si `location.state?.mission` no está disponible, `MissionPage` usa el `id` de la URL (`useParams`) para obtener la lista de misiones desde Oracle y filtrar la correcta. Los datos necesarios para hacer esa llamada (`idCurso`, `idInscripcion`) están disponibles en `authStore`, que persiste en `localStorage`.

El fix es **exclusivamente en `MissionPage.jsx`**. No afecta ninguna capa fuera del frontend.

---

## 2. Diagnóstico del estado actual

### 2.1 Flujo actual — navegación normal (funciona)

```
Dashboard.jsx
  └── MissionCard.jsx
        └── navigate(`/missions/${mission.id}`, { state: { mission } })
              └── MissionPage.jsx
                    └── const mission = location.state?.mission   ← ✅ objeto completo disponible
                          └── <TutorChat mission={mission} />
```

### 2.2 Flujo actual — recarga de página (falla)

```
Usuario recarga /missions/3
  └── MissionPage.jsx
        └── const mission = location.state?.mission   ← ❌ undefined (estado de navegación perdido)
              └── if (!mission) → "Mission not found"
```

### 2.3 Estado del código en MissionPage.jsx

```jsx
import { useParams, useLocation } from "react-router-dom";  // ← useParams importado ✅
import { useState } from "react";

export default function MissionPage() {
  //useParams();   ← ⚠️ COMENTADO — intento previo nunca completado

  const location = useLocation();
  const mission = location.state?.mission;   ← única fuente, sin fallback
  const [progress, setProgress] = useState(0);

  if (!mission) {
    return <MainLayout><div>Mission not found</div></MainLayout>;
  }
  ...
}
```

`useParams` ya está importado pero comentado. La intención de implementar la recuperación existía, nunca se completó.

### 2.4 Disponibilidad de datos en recarga

| Dato necesario | Fuente | Disponible en recarga |
|---|---|---|
| `id` de la misión | URL param (`/missions/:id`) | ✅ Siempre disponible |
| `idCurso` | `authStore.inscripcion.idCurso` | ✅ Persiste en `localStorage` |
| `idInscripcion` | `authStore.inscripcion.idInscripcion` | ✅ Persiste en `localStorage` |
| Lista de misiones | `GET /missions/course/:idCurso/:idInscripcion` | ✅ Fetcheable en cualquier momento |

No existe un endpoint `GET /missions/:missionId` individual en Oracle ORDS. El único camino es llamar `getMissions(idCurso, idInscripcion)` y filtrar por `id`.

---

## 3. Análisis de impacto por capa

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/pages/MissionPage.jsx` | **MODIFICAR** | Añadir recuperación por URL param con fallback a Oracle |

Ningún otro archivo React se modifica. `missionService.js` ya devuelve todos los campos que necesita `TutorChat` — no requiere cambios.

### 3.2 Servicios Python afectados

**Ninguno.** La recuperación llama a Oracle ORDS directamente desde el frontend, igual que hace el Dashboard.

### 3.3 Packages Oracle afectados

**Ninguno.**

### 3.4 Procedimientos Oracle afectados

**Ninguno.** Se reutiliza el endpoint existente `GET /missions/course/:idCurso/:idInscripcion`.

### 3.5 Endpoints ORDS afectados

| Endpoint | Cambio |
|---|---|
| `GET /missions/course/:idCurso/:idInscripcion` | Se empieza a llamar también desde `MissionPage` en el caso de recarga. Antes solo lo llamaba `Dashboard`. |

### 3.6 Tablas Oracle afectadas

**Ninguna.** Solo lectura.

### 3.7 Reglas de negocio afectadas

| Regla | Relación |
|---|---|
| **BR-SYS-05** | Esta es la regla que se resuelve directamente. |
| **BR-MISSION-01** | Los estados `LOCKED/ACTIVE/COMPLETED` se cargan frescos desde Oracle al recargar, garantizando que `MissionPage` refleja el estado real y no un snapshot desactualizado. |
| **BR-AUTH-04** | `ProtectedRoute` sigue controlando el acceso. Si el usuario no está autenticado, es redirigido a `/` antes de que `MissionPage` intente la recuperación. |

---

## 4. Cómo funciona actualmente el flujo de grammar score

Sin cambios respecto a análisis anteriores. El grammar score es calculado en `backend/app/routes/chat.py`:

```python
correction = response.get("correction")
grammar_score = 55 if (
    correction and isinstance(correction, dict) and correction.get("original")
) else 90
```

- `90` → sin errores gramaticales (correction es null)
- `55` → error detectado (correction tiene contenido)

Este valor retorna al frontend y se persiste en `USER_PROGRESS.grammar_score` via `updateProgress`. No está relacionado con BR-SYS-05.

---

## 5. Qué cambios deben realizarse

### 5.1 Único archivo a modificar: `MissionPage.jsx`

**Imports a agregar:**
```jsx
import { useEffect, useState } from "react";  // añadir useEffect
import useAuthStore from "../store/authStore";
import { getMissions } from "../services/missionService";
import Loader from "../components/ui/Loader";
```

`useParams` y `useLocation` ya están importados. Solo se necesita descomentar `useParams()` y añadir los imports de arriba.

**Nueva lógica de la página:**

```jsx
export default function MissionPage() {
  const { id } = useParams();
  const location = useLocation();
  const inscripcion = useAuthStore((state) => state.inscripcion);

  // Ruta rápida: misión disponible en el estado de navegación
  const [mission, setMission] = useState(location.state?.mission ?? null);
  const [loading, setLoading] = useState(!location.state?.mission);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Si la misión ya está disponible (navegación normal), no hacer nada
    if (mission) return;
    if (!inscripcion) return;

    async function loadMission() {
      try {
        const missions = await getMissions(
          inscripcion.idCurso,
          inscripcion.idInscripcion,
        );
        const found = missions.find((m) => String(m.id) === String(id));
        if (found) setMission(found);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadMission();
  }, [id, inscripcion, mission]);

  if (loading) {
    return (
      <MainLayout>
        <Loader />
      </MainLayout>
    );
  }

  if (!mission) {
    return (
      <MainLayout>
        <div className="text-white p-10">Mission not found</div>
      </MainLayout>
    );
  }

  // JSX existente sin cambios
  return (...);
}
```

**Lógica de los dos estados:**

| Situación | `location.state?.mission` | `loading` inicial | Comportamiento |
|---|---|---|---|
| Navegación normal desde Dashboard | Objeto completo | `false` | Render inmediato — ruta rápida, sin fetch |
| Recarga de página en `/missions/:id` | `undefined` | `true` | Muestra `<Loader />`, fetch Oracle, render al completar |
| URL inválida (misión no existe) | `undefined` | `true` → `false` | Muestra `<Loader />`, fetch Oracle, `found = undefined`, "Mission not found" |

**Comparación de IDs:**
`String(m.id) === String(id)` — el `id` de la URL es string, el `m.id` viene de Oracle como number. La conversión a string en ambos lados evita el error silencioso `3 === "3"` → `false`.

---

## 6. Riesgos de implementación

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R-BR05-01 | `getMissions` falla (red, Oracle caído) → loading queda atascado | Baja | Medio | El `finally` siempre ejecuta `setLoading(false)`. El catch loguea el error. El usuario verá "Mission not found" con posibilidad de volver al Dashboard. |
| R-BR05-02 | El `id` de la URL no corresponde a ninguna misión del curso del usuario | Baja | Bajo | `find` retorna `undefined` → `setMission` nunca se llama → "Mission not found" correcto. |
| R-BR05-03 | `inscripcion` es null en el momento del efecto | Muy baja | Bajo | Guard `if (!inscripcion) return` previene la llamada. `ProtectedRoute` garantiza que el usuario está autenticado al montar `MissionPage`. |
| R-BR05-04 | `getMissions` trae misiones con status actualizado diferente al que tenía `location.state?.mission` | Muy baja | Bajo | En realidad esto es un comportamiento **mejorado** — la recarga trae el estado más reciente de Oracle. No es un riesgo, es una ventaja. |
| R-BR05-05 | El `useEffect` se dispara innecesariamente en renders subsecuentes | Baja | Bajo | El guard `if (mission) return` previene cualquier fetch si `mission` ya está poblada. |
| R-BR05-06 | Llamada extra a Oracle desde `MissionPage` + `Dashboard` al navegar hacia atrás | Muy baja | Nulo | Solo ocurre en recarga — en navegación normal `mission` ya está disponible y el efecto no se ejecuta. |

---

## 7. Estrategia de despliegue

Cambio en un solo archivo frontend. No requiere coordinación con backend ni Oracle.

**Orden de implementación:**

1. Añadir imports a `MissionPage.jsx`.
2. Reemplazar el bloque de inicialización de estado (`mission` como constante → `useState` con fallback).
3. Añadir `useEffect` de recuperación.
4. Añadir render condicional `loading` con `<Loader />`.
5. El render de "Mission not found" y el JSX principal permanecen sin cambios.

---

## 8. Estrategia de pruebas

### 8.1 Prueba principal — recarga de página

1. Ir al Dashboard y hacer clic en una misión ACTIVE.
2. Verificar que `MissionPage` carga normalmente (ruta rápida).
3. **Recargar la página** (F5 o Ctrl+R) estando en `/missions/:id`.
4. **Resultado esperado:**
   - Aparece brevemente el spinner `<Loader />` (puede ser muy rápido).
   - La página carga con el contenido correcto de la misión.
   - `TutorChat` se inicializa normalmente (crea conversación, carga historial).

### 8.2 Prueba de URL directa

1. Copiar la URL `/missions/3` (o el id real de una misión).
2. Pegar en una nueva pestaña del navegador (sin navegar desde el Dashboard).
3. **Resultado esperado:** misma experiencia que la prueba 8.1.

### 8.3 Prueba de URL inválida

1. Navegar manualmente a `/missions/99999` (id que no existe).
2. **Resultado esperado:** spinner breve → "Mission not found".

### 8.4 Prueba de ruta rápida (no regresión)

1. Navegar desde el Dashboard a una misión.
2. Abrir DevTools → Network → verificar que **no** se hace una llamada extra a `/missions/course/...` durante la carga (porque `location.state?.mission` está disponible y el efecto se saltea).

### 8.5 Prueba de regresión del flujo completo

- Verificar que el chat de texto funciona después de una recarga.
- Verificar que el toast de misión completada sigue funcionando.
- Verificar que `completeMission()` se llama al alcanzar 100% tras recarga.

---

## 9. Resumen de cambios

```
MODIFICADOS (1 archivo):
  src/pages/MissionPage.jsx
    ├── useParams() descomentado y conectado
    ├── useEffect + useState importados desde react
    ├── useAuthStore importado para obtener inscripcion
    ├── getMissions importado desde missionService
    ├── Loader importado desde components/ui
    ├── mission pasa de const (location.state) a useState con fallback
    ├── loading state para controlar el render condicional
    └── useEffect que fetcha misiones si location.state está vacío

SIN CAMBIOS:
  src/services/missionService.js      — getMissions ya devuelve todos los campos
  src/components/mission/TutorChat.jsx — sin cambios
  src/components/dashboard/MissionCard.jsx — sin cambios
  Backend Python (todos los archivos)
  Oracle ORDS (endpoints sin cambios)
  Oracle ADB (sin cambios de schema)
```

---

*Listo para implementación. Esperando aprobación.*
