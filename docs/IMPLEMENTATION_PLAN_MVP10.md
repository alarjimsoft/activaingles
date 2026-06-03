# IMPLEMENTATION_PLAN_MVP10.md
# MVP-10 — Manejo de error de período académico vencido en el login

> **Estado:** COMPLETADO — 2026-06-03. TC-01 a TC-07 ejecutados y verificados.
> **Fecha de análisis:** 2026-06-03
> **Complejidad real (revisada):** Baja-Media (mayor que la estimación inicial del backlog)
> **Estimación revisada:** 2-3 horas (incluye cambio Oracle + frontend + pruebas)
> **Dependencias bloqueantes:** Ninguna. No depende de ningún MVP anterior.

---

## 1. Resumen Ejecutivo

MVP-10 corrige la experiencia de login para estudiantes que no pueden ingresar al sistema. El problema raíz es que `PKG_AUTH.LOGIN_ESTUDIANTE` devuelve el **mismo mensaje genérico en inglés** para cuatro causas de fallo distintas, impidiendo que el estudiante entienda qué ocurrió y qué debe hacer.

La corrección requiere cambios en **dos capas**:
- **Oracle (primario):** separar los caminos de error en `PKG_AUTH.LOGIN_ESTUDIANTE` y devolver mensajes en español específicos por caso
- **Frontend (secundario):** localizar el mensaje de error de red del `catch` y agregar fallback seguro

---

## 2. Diagnóstico del Estado Actual

### 2.1 Flujo de login actual (detallado)

```
Usuario ingresa matrícula + password
  ↓
LoginPage.jsx → handleLogin()
  ↓
authService.js → loginStudent(matricula, password)
  ↓
POST /ords/api/auth/login  (HTTP 200 siempre — ORDS no retorna 4xx por errores de negocio)
  body: x01=matricula&x02=password
  ↓
ORDS handler → PKG_AUTH.LOGIN_ESTUDIANTE(p_matricula, p_password)
  ↓
Oracle evalúa UN ÚNICO COUNT con JOIN de ESTUDIANTES + INSCRIPCIONES + PERIODOS
  con 5 condiciones simultáneas:
  1. E.MATRICULA = p_matricula
  2. E.PASSWORD = p_password
  3. E.ESTADO = 'ACTIVO'
  4. I.ESTADO = 'ACTIVA'
  5. SYSDATE BETWEEN P.FECHA_INICIO AND P.FECHA_FIN
  ↓
  Si V_COUNT = 0 (CUALQUIER condición falla):
    → { success: false, message: "Invalid credentials or inactive enrollment." }
  Si V_COUNT > 0:
    → { success: true, student: {...}, inscripcion: {...} }
  ↓
authService.js recibe JSON (HTTP 200 en ambos casos)
  ↓
LoginPage.jsx (línea 30-34):
  if (!result.success) {
    setError(result.message);   ← muestra "Invalid credentials or inactive enrollment."
    return;
  }
  ↓
  catch (err) {
    setError("Login error");    ← solo se activa en errores de red/HTTP
  }
```

### 2.2 El problema real

Oracle funde en un único `V_COUNT = 0` cuatro causas de fallo completamente distintas:

| Causa | Condición que falla | Mensaje que ve el estudiante | Acción correcta |
|---|---|---|---|
| Contraseña incorrecta | `E.PASSWORD = p_password` | "Invalid credentials or inactive enrollment." | Revisar contraseña |
| Matrícula inexistente | `E.MATRICULA = p_matricula` | "Invalid credentials or inactive enrollment." | Contactar TI institucional |
| Estudiante inactivo | `E.ESTADO = 'ACTIVO'` | "Invalid credentials or inactive enrollment." | Contactar coordinación |
| **Período vencido** | `SYSDATE NOT BETWEEN P.FECHA_INICIO AND P.FECHA_FIN` | "Invalid credentials or inactive enrollment." | **Esperar nuevo período o contactar coordinación** |
| Inscripción inactiva | `I.ESTADO = 'ACTIVA'` | "Invalid credentials or inactive enrollment." | Contactar coordinación |

El estudiante con **período vencido** ve el mismo mensaje que alguien con contraseña incorrecta. No puede saber que el problema es el período académico y no sus credenciales. Resultado: frustración, tickets de soporte falsos ("la app no funciona").

### 2.3 Estado del frontend (hallazgo importante)

`LoginPage.jsx` **ya propagaba `result.message`** antes de este análisis (línea 31: `setError(result.message)`). La corrección mínima del backlog (`result.message || "Credenciales inválidas."`) añade únicamente un fallback defensivo para el caso en que Oracle retorne `success: false` sin campo `message`.

Esto confirma que **el problema principal reside en Oracle**, no en el frontend. La solución de "una línea" descrita en el backlog es necesaria pero insuficiente si no se distinguen los casos en Oracle.

---

## 3. Análisis de Impacto Arquitectónico

### 3.1 Archivos React afectados

| Archivo | Tipo de cambio | Descripción |
|---|---|---|
| `src/pages/LoginPage.jsx` | Modificación menor | Agregar fallback `\|\| "Credenciales inválidas."`, localizar mensaje del `catch` a español |
| `src/services/authService.js` | Sin cambio necesario | Ya maneja correctamente HTTP 200 con `success: false` |

### 3.2 Servicios Python afectados

**Ninguno.** El flujo de login es directo `Frontend → Oracle ORDS`. FastAPI no participa en la autenticación.

### 3.3 Packages Oracle afectados

| Package | Elemento | Tipo de cambio |
|---|---|---|
| `PKG_AUTH` (Spec) | `PROCEDURE LOGIN_ESTUDIANTE` | Sin cambio en firma — compatible con ORDS actual |
| `PKG_AUTH` (Body) | `LOGIN_ESTUDIANTE` — cuerpo completo | Refactor de validación secuencial + mensajes en español |

### 3.4 Procedimientos afectados

| Procedimiento | Cambio requerido |
|---|---|
| `PKG_AUTH.LOGIN_ESTUDIANTE` | Reemplazar validación única (`V_COUNT = 0`) por validación secuencial en 3 pasos que identifica la causa raíz del fallo |

### 3.5 Endpoints ORDS afectados

| Endpoint | Cambio requerido |
|---|---|
| `POST /auth/login` | **Sin cambio en el módulo ORDS.** El handler llama dinámicamente a `PKG_AUTH.LOGIN_ESTUDIANTE`; modificar el package body es suficiente — no requiere redeploy del módulo ORDS |

### 3.6 Tablas Oracle afectadas

Todas las tablas son de **solo lectura** en este flujo:

| Tabla | Operación | Impacto |
|---|---|---|
| `ESTUDIANTES` | SELECT | Sin cambio. Se agrega un SELECT adicional intermedio para validar credenciales antes de verificar período |
| `INSCRIPCIONES` | SELECT | Sin cambio |
| `PERIODOS` | SELECT | Sin cambio |

### 3.7 Reglas de negocio afectadas

| ID | Regla | Impacto |
|---|---|---|
| BR-AUTH-01 | El estudiante se autentica con matrícula + contraseña | La lógica de autenticación se mantiene. Solo se descompone el diagnóstico de error. |
| BR-AUTH-02 | Sesión persistente | Sin impacto — solo afecta el flujo de login fallido |
| BR-AUTH-03 | Inscripción como contexto pedagógico | Sin impacto |
| BR-AUTH-04 | Protección de rutas | Sin impacto |

---

## 4. Cómo Funciona Actualmente el Flujo de Error en el Login

> **Nota:** El análisis técnico del backlog describe la pregunta como "flujo de grammar score", pero ésta es una copia del template anterior. Para MVP-10 la pregunta relevante es el flujo de error en el login. Se documenta a continuación.

### Camino feliz (login exitoso)
```
Oracle: V_COUNT ≥ 1 → response { success: true, student: {...}, inscripcion: {...} }
Frontend: login(student, inscripcion) → navigate('/dashboard')
```

### Camino de error actual (todos los casos de fallo)
```
Oracle: V_COUNT = 0 → response { success: false, message: "Invalid credentials or inactive enrollment." }
Frontend: setError("Invalid credentials or inactive enrollment.")
UI: Mensaje en rojo, en inglés, sin distinción de causa
```

### Camino de error de red (fetch falla)
```
authService.js: throws Error("Login failed")
Frontend catch: setError("Login error")
UI: Mensaje genérico "Login error"
```

**El estudiante con período vencido ve exactamente lo mismo que un estudiante con contraseña incorrecta.** No hay ningún mecanismo en el sistema actual para distinguirlos.

---

## 5. Qué Cambios Deben Realizarse

### Cambio 1 — Oracle: Validación secuencial en PKG_AUTH.LOGIN_ESTUDIANTE

**Estrategia:** reemplazar el único `SELECT COUNT(*)` con JOIN completo por tres validaciones secuenciales que identifican la causa raíz del fallo.

**Lógica propuesta:**

```sql
PROCEDURE LOGIN_ESTUDIANTE(
    p_matricula IN VARCHAR2,
    p_password  IN VARCHAR2
) IS
    V_COUNT        NUMBER;
    V_PERIODO_EXP  NUMBER;

BEGIN

    -- Paso 1: ¿Existen credenciales válidas?
    SELECT COUNT(*)
    INTO V_COUNT
    FROM ESTUDIANTES E
    WHERE E.MATRICULA = p_matricula
    AND E.PASSWORD    = p_password
    AND E.ESTADO      = 'ACTIVO';

    IF V_COUNT = 0 THEN
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('message', 'Credenciales incorrectas. Verifica tu matrícula y contraseña.');
        APEX_JSON.WRITE('errorCode', 'INVALID_CREDENTIALS');
        APEX_JSON.CLOSE_OBJECT;
        RETURN;
    END IF;

    -- Paso 2: ¿Existe inscripción activa en período vigente?
    SELECT COUNT(*)
    INTO V_COUNT
    FROM INSCRIPCIONES I
    JOIN PERIODOS P ON P.ID_PERIODO = I.ID_PERIODO
    WHERE I.MATRICULA = p_matricula
    AND I.ESTADO      = 'ACTIVA'
    AND SYSDATE BETWEEN P.FECHA_INICIO AND P.FECHA_FIN;

    IF V_COUNT = 0 THEN
        -- Paso 3: ¿El período venció recientemente?
        SELECT COUNT(*)
        INTO V_PERIODO_EXP
        FROM INSCRIPCIONES I
        JOIN PERIODOS P ON P.ID_PERIODO = I.ID_PERIODO
        WHERE I.MATRICULA = p_matricula
        AND SYSDATE > P.FECHA_FIN;

        IF V_PERIODO_EXP > 0 THEN
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', FALSE);
            APEX_JSON.WRITE('message', 'Tu período académico ha vencido. Contacta a tu coordinador para inscribirte al próximo período.');
            APEX_JSON.WRITE('errorCode', 'PERIOD_EXPIRED');
            APEX_JSON.CLOSE_OBJECT;
        ELSE
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', FALSE);
            APEX_JSON.WRITE('message', 'Tu inscripción no está activa. Contacta a tu institución para más información.');
            APEX_JSON.WRITE('errorCode', 'INACTIVE_ENROLLMENT');
            APEX_JSON.CLOSE_OBJECT;
        END IF;
        RETURN;
    END IF;

    -- Paso 4: Login exitoso — mismo FOR LOOP que el código actual
    FOR R IN (
        SELECT E.MATRICULA, E.NOMBRE, E.APELLIDOPATERNO, E.APELLIDOMATERNO,
               E.NIVEL_INGLES, E.XP, E.STREAK_DAYS,
               I.ID_INSCRIPCION, I.ID_CURSO, I.ID_PERIODO
        FROM ESTUDIANTES E
        JOIN INSCRIPCIONES I ON I.MATRICULA = E.MATRICULA
        JOIN PERIODOS P      ON P.ID_PERIODO = I.ID_PERIODO
        WHERE E.MATRICULA = p_matricula
        AND I.ESTADO = 'ACTIVA'
        AND SYSDATE BETWEEN P.FECHA_INICIO AND P.FECHA_FIN
    )
    LOOP
        -- Mismo bloque de respuesta exitosa que existe hoy
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        -- ... resto del bloque sin cambio
        APEX_JSON.CLOSE_OBJECT;
    END LOOP;

END LOGIN_ESTUDIANTE;
```

**Resultado de la nueva lógica:**

| Caso | `errorCode` | Mensaje en pantalla |
|---|---|---|
| Contraseña incorrecta o matrícula inexistente | `INVALID_CREDENTIALS` | "Credenciales incorrectas. Verifica tu matrícula y contraseña." |
| Período académico vencido | `PERIOD_EXPIRED` | "Tu período académico ha vencido. Contacta a tu coordinador para inscribirte al próximo período." |
| Inscripción inactiva (no hay período vencido) | `INACTIVE_ENROLLMENT` | "Tu inscripción no está activa. Contacta a tu institución para más información." |
| Login exitoso | — | Navega a `/dashboard` |

### Cambio 2 — Frontend: LoginPage.jsx (mínimo)

**Cambio 1:** Agregar fallback en el manejo de `!result.success`:
```javascript
// Antes:
setError(result.message);

// Después:
setError(result.message || "No se pudo completar el inicio de sesión. Intenta de nuevo.");
```

**Cambio 2:** Localizar el mensaje del `catch` block:
```javascript
// Antes:
setError("Login error");

// Después:
setError("Error de conexión. Verifica tu internet e intenta de nuevo.");
```

**Sin cambio en `authService.js`:** el servicio ya maneja correctamente HTTP 200 con `success: false`. No se necesita modificar.

### Cambio 3 — Documentación Oracle local

Actualizar `backend-oracle/PACKAGE_BODIES/PKG_AUTH.sql` para reflejar el nuevo cuerpo del procedimiento en el repositorio. Este archivo es documentación local — no despliega automáticamente a Oracle.

---

## 6. Riesgos de Implementación

| ID | Riesgo | Probabilidad | Severidad | Mitigación |
|---|---|---|---|---|
| R-01 | Oracle retorna HTTP 4xx en lugar de 200 si hay error de compilación del paquete | Baja | Alta | Verificar compilación del paquete en SQL Developer antes de dar por finalizado el cambio |
| R-02 | El nuevo query de Paso 2 (separado del Paso 1) genera rows extra en el FOR LOOP final | Baja | Media | El FOR LOOP ya usa las 5 condiciones: si el Paso 2 pasó, el FOR LOOP encontrará el registro correctamente |
| R-03 | `V_PERIODO_EXP` detecta período vencido de otra inscripción del mismo estudiante | Media | Baja | Aceptable para MVP — en caso extremo el mensaje de "período vencido" es más útil que "credenciales incorrectas" |
| R-04 | El campo `errorCode` añadido no rompe el frontend actual | Ninguna | Ninguna | El frontend solo usa `result.success` y `result.message` — campos nuevos son ignorados |
| R-05 | Cambio de Package Body sin actualizar Package Spec | Ninguna | Alta | La firma del procedimiento no cambia — el spec queda igual |
| R-06 | Comportamiento diferente entre Oracle ADB y el archivo SQL local | Media | Baja | El archivo local es documentación. La fuente de verdad es Oracle ADB. |

---

## 7. Estrategia de Despliegue

El orden es crítico: **primero Oracle, luego frontend**.

```
Paso 1 — Validar SQL antes de ejecutar en producción
  └─ Copiar el nuevo cuerpo del procedimiento
  └─ Ejecutar en Oracle SQL Developer conectado a ADB
  └─ Verificar que no haya errores de compilación (Ctrl+F10 o ejecutar con "Run Script")
  └─ Comprobar que el paquete compile: SELECT status FROM user_objects WHERE object_name='PKG_AUTH'

Paso 2 — Probar en Oracle
  └─ Simular login con credenciales incorrectas
  └─ Simular login con período vencido (modificar temporalmente PERIODOS.FECHA_FIN)
  └─ Simular login exitoso (credenciales válidas + período vigente)

Paso 3 — Actualizar archivo local
  └─ Actualizar backend-oracle/PACKAGE_BODIES/PKG_AUTH.sql

Paso 4 — Modificar frontend
  └─ Editar src/pages/LoginPage.jsx (2 líneas)

Paso 5 — Verificar end-to-end en el browser
  └─ Con credenciales correctas → Dashboard
  └─ Con contraseña incorrecta → "Credenciales incorrectas..."
  └─ Con cuenta de período vencido → "Tu período académico ha vencido..."

Paso 6 — Commit
  └─ Commit único que incluya el SQL actualizado + el JSX modificado
```

**No se requiere:**
- Redeploy del módulo ORDS `auth` — el handler llama al package dinámicamente
- Cambios en FastAPI
- Cambios en Zustand / authStore
- Reinicio del backend Python

---

## 8. Estrategia de Pruebas

### 8.1 Casos de prueba manuales

| # | Caso | Datos de entrada | Resultado esperado |
|---|---|---|---|
| TC-01 | Login exitoso | Matrícula y contraseña válidos, período vigente | Navega a `/dashboard` |
| TC-02 | Contraseña incorrecta | Matrícula válida, contraseña errónea | "Credenciales incorrectas. Verifica tu matrícula y contraseña." |
| TC-03 | Matrícula inexistente | Matrícula que no existe | "Credenciales incorrectas. Verifica tu matrícula y contraseña." |
| TC-04 | **Período vencido** | Credenciales válidas, `FECHA_FIN < SYSDATE` | "Tu período académico ha vencido. Contacta a tu coordinador..." |
| TC-05 | Inscripción inactiva | Credenciales válidas, `I.ESTADO != 'ACTIVA'`, período sin vencer | "Tu inscripción no está activa. Contacta a tu institución..." |
| TC-06 | Error de red | Desconectar internet antes del login | "Error de conexión. Verifica tu internet e intenta de nuevo." |
| TC-07 | Reintento tras error | Error → corregir credenciales → submit | Login exitoso (state de error se limpia con `setError("")`) |

### 8.2 Cómo simular TC-04 (período vencido) en Oracle

Para probar sin afectar datos reales, ejecutar en SQL Developer:

```sql
-- Guardar fecha original
SELECT ID_PERIODO, FECHA_FIN FROM PERIODOS WHERE ROWNUM = 1;

-- Simular período vencido (solo para prueba)
UPDATE PERIODOS SET FECHA_FIN = SYSDATE - 1 WHERE ID_PERIODO = :id_periodo_prueba;
COMMIT;

-- → Probar login en la app (debe mostrar "período vencido")

-- Restaurar fecha original
UPDATE PERIODOS SET FECHA_FIN = :fecha_original WHERE ID_PERIODO = :id_periodo_prueba;
COMMIT;
```

> **Advertencia:** No modificar el período de una inscripción activa con estudiantes reales usando la app. Usar una cuenta de prueba.

### 8.3 Verificación de no-regresión

- TC-01 es el caso más importante: el login exitoso no debe verse afectado.
- El FOR LOOP de la respuesta exitosa no cambia — solo se agregan validaciones previas que retornan temprano si hay error.

---

## 9. Resumen de Archivos por Tocar

| Archivo | Tipo | Cambio |
|---|---|---|
| `backend-oracle/PACKAGE_BODIES/PKG_AUTH.sql` | SQL Oracle | Refactor de `LOGIN_ESTUDIANTE`: validación secuencial + mensajes en español |
| `src/pages/LoginPage.jsx` | React JSX | 2 líneas: fallback en `setError` + mensaje catch en español |
| `src/services/authService.js` | JS | Sin cambio |
| `backend-oracle/packages/PKG_AUTH.sql` (spec) | SQL Oracle | Sin cambio (firma del procedimiento no cambia) |
| `backend-oracle/ords/auth.sql` | SQL ORDS | Sin cambio (handler llama al package dinámicamente) |

**Archivos NO afectados:**
- Toda la capa FastAPI (`backend/`)
- `authStore.js` (la respuesta exitosa no cambia estructura)
- `Dashboard.jsx`, `TutorChat.jsx`, `useAppStore.js`
- Tablas Oracle (solo cambios en la lógica del package, sin DDL)
- Endpoints ORDS (sin redeploy)

---

## 10. Notas Adicionales para la Implementación

### Sobre la variable V_PERIODO_EXP (Paso 3 de la lógica Oracle)

El query del Paso 3 detecta si existe alguna inscripción cuyo período ya venció (sin importar si la inscripción está activa o no). Esto cubre el caso principal: estudiante que cursó en período anterior y no se ha reinscrito al nuevo período. Si hay ambigüedad (período que nunca inició + inscripción inactiva), el mensaje de "inscripción no activa" aplica.

### Sobre el campo `errorCode`

Se propone agregar `errorCode` a la respuesta de Oracle (`INVALID_CREDENTIALS`, `PERIOD_EXPIRED`, `INACTIVE_ENROLLMENT`). Este campo es ignorado por el frontend actual (que solo usa `result.message`). Tiene valor para:
- Futuras versiones del frontend que quieran mostrar íconos o estilos distintos por tipo de error
- Logging y analytics de intentos de login fallidos
- Soporte técnico que necesite depurar sin ver contraseñas

### Sobre la estimación del backlog

El backlog estimó "30 minutos" y "Baja" complejidad asumiendo que el cambio era solo en el frontend (agregar el `||` fallback). El análisis técnico revela que la mejora de experiencia real requiere también el cambio en Oracle para distinguir los casos. Con el cambio Oracle incluido, la estimación revisada es 2-3 horas. Sigue siendo pequeña.

---

*Documento generado para aprobación — no se ha modificado ningún código.*
