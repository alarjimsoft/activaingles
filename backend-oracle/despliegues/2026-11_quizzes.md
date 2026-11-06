# Instalación en Oracle: quizzes (fase 1)

Crea las tablas, el paquete y los endpoints ORDS de los quizzes que se presentan después de los temas 3, 6 y 9.

**Dónde:** OCI → Autonomous Database → **Database Actions → SQL**, conectado como `LUALARCON`.
**Cómo:** abre cada archivo (ícono de carpeta → *Open*), y ejecútalo con **Run Script (F5)**, no con *Run Statement*.
Revisa la pestaña *Script Output* antes de seguir con el siguiente.

## Orden de ejecución

| # | Archivo | Qué hace | Resultado esperado |
|---|---|---|---|
| 1 | `tables/QUIZZES.sql` | Quizzes y su posición (después de qué tema) | `Table QUIZZES created.` |
| 2 | `tables/QUIZ_VERSIONS.sql` | Versiones del Word subidas por el académico | `Table ... created.` y `Table QUIZZES altered.` |
| 3 | `tables/QUIZ_MEDIA.sql` | Imágenes y audios de cada versión | `Table QUIZ_MEDIA created.` |
| 4 | `tables/QUIZ_ATTEMPTS.sql` | Intentos de los estudiantes | tabla y 2 índices creados |
| 5 | `tables/QUIZ_ANSWERS.sql` | Respuestas calificadas | `Table QUIZ_ANSWERS created.` |
| 6 | `packages/PKG_QUIZ.sql` | Especificación del paquete | `Package PKG_QUIZ compiled` |
| 7 | `PACKAGE_BODIES/PKG_QUIZ.sql` | Lógica del paquete | `Package Body PKG_QUIZ compiled` **sin errores** |
| 8 | `data/QUIZZES.sql` | Los 3 quizzes (temas 3, 6 y 9) | 3 filas en la consulta final |
| 9 | `tests/quiz_smoke_test.sql` | Prueba del paquete; borra lo que crea | `RESULTADO: todas las pruebas pasaron` |
| 10 | `ords/quiz.sql` | Módulo ORDS `quiz`, protegido con OAuth | `PL/SQL procedure successfully completed.` |
| 11 | `ords/quiz_oauth_client.sql` | Cliente OAuth para FastAPI (**una sola vez**) | muestra `ORDS_QUIZ_CLIENT_ID=` y `ORDS_QUIZ_CLIENT_SECRET=` |
| 12 | `ords/progress_stats.sql` | `progress/stats` suma el XP de los quizzes | `PL/SQL procedure successfully completed.` |

Notas:

- **Paso 7:** si sale `Package Body PKG_QUIZ compiled with errors`, ejecuta
  `SELECT LINE, POSITION, TEXT FROM USER_ERRORS WHERE NAME = 'PKG_QUIZ' ORDER BY SEQUENCE;`
  y comparte el resultado antes de seguir.
- **Paso 8:** la consulta final debe mostrar `LENGTH` = 20 en los tres títulos.
- **Paso 9:** crea por unos segundos un tema temporal sin misiones para probar los intentos con un estudiante real, y lo borra al final junto con todo lo demás de la prueba. Se puede ejecutar las veces que quieras.
- **Codificación:** los textos de los scripts no llevan acentos ni símbolos a propósito (el `·` de los títulos se escribe con `UNISTR('\00B7')`). Database Actions puede leer los archivos con otra codificación y convertir `ó` en `Ã³`.
- **Paso 11:** copia el client_id y el client_secret **directo** a Secret Manager (`ORDS_QUIZ_CLIENT_ID`, `ORDS_QUIZ_CLIENT_SECRET`) y a `backend/.env`. El secreto solo se muestra esta vez y **nunca** debe quedar en un archivo del repositorio.
  Si el script marca error con `ORDS_SECURITY`, crea el cliente desde **Database Actions → REST → Security → OAuth Clients**: nombre `activa_backend`, *grant type* `client_credentials`, rol `quiz_backend_role`.
- **No ejecutes `ords/progress.sql` completo**: borraría los demás endpoints de `progress` y sus orígenes permitidos. El paso 12 cambia solo `stats`.

## Verificación

Base de las URLs: `https://gb572ef1f8a56c6-caa23.adb.us-ashburn-1.oraclecloudapps.com/ords/api`

1. **El módulo está protegido.** En el navegador abre `.../quiz/admin/list`: debe responder **401 Unauthorized**.
2. **El token funciona.** En Postman:
   - `POST .../oauth/token`
   - Authorization: *Basic Auth*, usuario = client_id, contraseña = client_secret
   - Body: *x-www-form-urlencoded*, `grant_type` = `client_credentials`
   - Respuesta: `{ "access_token": "...", "token_type": "bearer", "expires_in": 3600 }`
3. **Con token responde.** `GET .../quiz/admin/list` con Authorization *Bearer Token* = el `access_token`: debe devolver los 3 quizzes con `afterTopicId` 3, 6 y 9.
4. **Las estadísticas siguen funcionando.** `GET .../progress/stats/<id_inscripcion>` (sin token, como siempre) devuelve los mismos campos de antes más `mission_xp` y `quiz_xp` (este último en 0). El Dashboard debe mostrar el mismo XP que antes.

## Endpoints del módulo `quiz`

Todos requieren el token. Errores: `{ "success": false, "code": "...", "error": "..." }`.

| Método | Ruta | Uso |
|---|---|---|
| GET | `quiz/admin/list` | Lista de quizzes para el Content Manager |
| GET | `quiz/admin/quiz/:quizId` | Quiz con historial de versiones |
| GET | `quiz/admin/version/:versionId` | Versión completa (definición con respuestas, reporte, archivos) |
| POST | `quiz/admin/version` | Crea una versión en borrador |
| POST | `quiz/admin/media` | Registra un archivo subido |
| POST | `quiz/admin/publish/:versionId` | Publica (409 si hay errores o archivos pendientes) |
| GET | `quiz/admin/stats/:quizId?versionId=` | Resultados por pregunta |
| GET | `quiz/student/available/:idInscripcion` | Quizzes del estudiante: LOCKED / ACTIVE / COMPLETED |
| POST | `quiz/student/start` | Crea o reanuda un intento (403 bloqueado, 409 sin intentos) |
| GET | `quiz/student/attempt/:attemptId` | Intento completo |
| POST | `quiz/student/finish` | Guarda el intento calificado (409 si ya se entregó o expiró) |

Reglas implementadas:

- **Desbloqueo:** el quiz se activa cuando el estudiante completó (`PROGRESS_PERCENT >= 100`) todas las misiones de su curso en los temas con `SORT_ORDER` menor o igual al del tema del quiz. **No bloquea** el avance a los temas siguientes.
- **Intentos:** el máximo y el tiempo vienen del Word (`MAX_ATTEMPTS`, `TIME_LIMIT_MINUTES`). Un intento en curso se reanuda en lugar de crear otro. Si se acaba el tiempo sin entregar, queda `EXPIRADO` y cuenta como usado. Hay 2 minutos de tolerancia para la entrega.
- **XP:** hasta 200 por quiz; cuenta el mejor intento (`MAX(XP_EARNED)`), que se suma en `progress/stats`.
- **Versiones:** publicar una versión archiva la anterior. Los intentos guardan la versión que se contestó.

## Revertir (solo si hace falta deshacer la instalación)

Primero restaura `progress/stats` con la versión anterior del handler (en el historial de git de `ords/progress.sql`), luego:

```sql
BEGIN ORDS.DELETE_MODULE(p_module_name => 'quiz'); COMMIT; END;
/
DROP PACKAGE PKG_QUIZ;
ALTER TABLE QUIZZES DROP CONSTRAINT FK_QUIZZES_PUBLISHED;
DROP TABLE QUIZ_ANSWERS;
DROP TABLE QUIZ_ATTEMPTS;
DROP TABLE QUIZ_MEDIA;
DROP TABLE QUIZ_VERSIONS;
DROP TABLE QUIZZES;
```
