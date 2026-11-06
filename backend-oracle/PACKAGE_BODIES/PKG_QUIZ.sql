--------------------------------------------------------
--  DDL for Package Body PKG_QUIZ
--
--  Errores: cada uno se lanza con RAISE_APPLICATION_ERROR y un código legible al inicio
--  del mensaje (QUIZ_LOCKED, NO_ATTEMPTS_LEFT...). El handler ORDS los convierte en
--  { "success": false, "code": "...", "error": "..." } con el status HTTP de ERROR_STATUS.
--------------------------------------------------------

CREATE OR REPLACE EDITIONABLE PACKAGE BODY PKG_QUIZ AS

    -- Tolerancia para entregar después de EXPIRES_AT (latencia de red, reloj del navegador)
    C_GRACE CONSTANT INTERVAL DAY TO SECOND := INTERVAL '2' MINUTE;

    E_QUIZ_NOT_FOUND        CONSTANT NUMBER := -20010;
    E_VERSION_NOT_FOUND     CONSTANT NUMBER := -20011;
    E_ATTEMPT_NOT_FOUND     CONSTANT NUMBER := -20012;
    E_INSCRIPCION_NOT_FOUND CONSTANT NUMBER := -20013;
    E_QUIZ_LOCKED           CONSTANT NUMBER := -20020;
    E_QUIZ_NOT_PUBLISHED    CONSTANT NUMBER := -20021;
    E_NO_ATTEMPTS_LEFT      CONSTANT NUMBER := -20022;
    E_ATTEMPT_CLOSED        CONSTANT NUMBER := -20023;
    E_MEDIA_PENDING         CONSTANT NUMBER := -20024;
    E_VERSION_NOT_EDITABLE  CONSTANT NUMBER := -20025;
    E_VALIDATION_ERRORS     CONSTANT NUMBER := -20026;
    E_INVALID_BODY          CONSTANT NUMBER := -20030;

    /* ───────────── Utilidades ───────────── */

    FUNCTION iso(p_ts IN TIMESTAMP WITH TIME ZONE) RETURN VARCHAR2 IS
    BEGIN
        IF p_ts IS NULL THEN
            RETURN NULL;
        END IF;
        RETURN TO_CHAR(SYS_EXTRACT_UTC(p_ts), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    END iso;

    PROCEDURE w(p_name IN VARCHAR2, p_value IN VARCHAR2) IS
    BEGIN
        APEX_JSON.WRITE(p_name, p_value, TRUE);
    END w;

    PROCEDURE wn(p_name IN VARCHAR2, p_value IN NUMBER) IS
    BEGIN
        APEX_JSON.WRITE(p_name, p_value, TRUE);
    END wn;

    PROCEDURE wc(p_name IN VARCHAR2, p_value IN CLOB) IS
    BEGIN
        APEX_JSON.WRITE(p_name, p_value, TRUE);
    END wc;

    PROCEDURE fail(p_code IN NUMBER, p_message IN VARCHAR2) IS
    BEGIN
        RAISE_APPLICATION_ERROR(p_code, p_message);
    END fail;

    FUNCTION body_number(p_body IN CLOB, p_path IN VARCHAR2) RETURN NUMBER IS
        v_value NUMBER;
    BEGIN
        -- JSON_VALUE no acepta la ruta como variable; se arma la consulta con la ruta fija
        EXECUTE IMMEDIATE
            'SELECT JSON_VALUE(:b, ''' || p_path || ''' RETURNING NUMBER NULL ON ERROR) FROM DUAL'
            INTO v_value USING p_body;
        RETURN v_value;
    END body_number;

    FUNCTION body_text(p_body IN CLOB, p_path IN VARCHAR2) RETURN VARCHAR2 IS
        v_value VARCHAR2(4000);
    BEGIN
        EXECUTE IMMEDIATE
            'SELECT JSON_VALUE(:b, ''' || p_path || ''' RETURNING VARCHAR2(4000) NULL ON ERROR) FROM DUAL'
            INTO v_value USING p_body;
        RETURN v_value;
    END body_text;

    FUNCTION body_json(p_body IN CLOB, p_path IN VARCHAR2) RETURN CLOB IS
        v_value CLOB;
    BEGIN
        EXECUTE IMMEDIATE
            'SELECT JSON_QUERY(:b, ''' || p_path || ''' RETURNING CLOB NULL ON ERROR) FROM DUAL'
            INTO v_value USING p_body;
        RETURN v_value;
    END body_json;

    PROCEDURE write_media(p_version_id IN NUMBER) IS
    BEGIN
        APEX_JSON.OPEN_ARRAY('media');
        FOR m IN (
            SELECT FILE_NAME, MEDIA_TYPE, OBJECT_KEY, URL, CONTENT_TYPE, SIZE_BYTES, SHA256, IS_UPLOADED
              FROM QUIZ_MEDIA
             WHERE VERSION_ID = p_version_id
             ORDER BY MEDIA_ID
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            w('fileName', m.FILE_NAME);
            w('mediaType', m.MEDIA_TYPE);
            w('objectKey', m.OBJECT_KEY);
            w('url', m.URL);
            w('contentType', m.CONTENT_TYPE);
            wn('sizeBytes', m.SIZE_BYTES);
            w('sha256', m.SHA256);
            w('isUploaded', m.IS_UPLOADED);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
    END write_media;

    -- Intento completo: datos, definición del quiz (con respuestas: FastAPI las quita
    -- antes de enviarlas al estudiante), archivos y, si ya se entregó, las respuestas.
    PROCEDURE write_attempt(p_attempt_id IN NUMBER, p_resumed IN VARCHAR2) IS
        v_best_score NUMBER;
        v_best_xp    NUMBER;
    BEGIN
        FOR a IN (
            SELECT A.*, V.TITLE, V.PASSING_SCORE, V.MAX_ATTEMPTS, V.TIME_LIMIT_MINUTES,
                   V.TOTAL_POINTS, V.QUESTION_COUNT, V.DEFINITION_JSON
              FROM QUIZ_ATTEMPTS A
              JOIN QUIZ_VERSIONS V ON V.VERSION_ID = A.VERSION_ID
             WHERE A.ATTEMPT_ID = p_attempt_id
        ) LOOP
            SELECT MAX(SCORE_PERCENT), MAX(XP_EARNED)
              INTO v_best_score, v_best_xp
              FROM QUIZ_ATTEMPTS
             WHERE QUIZ_ID = a.QUIZ_ID
               AND ID_INSCRIPCION = a.ID_INSCRIPCION
               AND STATUS = 'ENTREGADO';

            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', TRUE);
            wn('attemptId', a.ATTEMPT_ID);
            wn('quizId', a.QUIZ_ID);
            wn('versionId', a.VERSION_ID);
            wn('idInscripcion', a.ID_INSCRIPCION);
            wn('attemptNumber', a.ATTEMPT_NUMBER);
            w('status', a.STATUS);
            w('resumed', p_resumed);
            wn('shuffleSeed', a.SHUFFLE_SEED);
            w('startedAt', iso(a.STARTED_AT));
            w('expiresAt', iso(a.EXPIRES_AT));
            w('submittedAt', iso(a.SUBMITTED_AT));
            w('serverNow', iso(SYSTIMESTAMP));
            wn('scorePoints', a.SCORE_POINTS);
            wn('maxPoints', a.MAX_POINTS);
            wn('scorePercent', a.SCORE_PERCENT);
            w('passed', a.PASSED);
            wn('xpEarned', a.XP_EARNED);
            wn('bestScorePercent', v_best_score);
            wn('bestXp', v_best_xp);
            w('title', a.TITLE);
            wn('passingScore', a.PASSING_SCORE);
            wn('maxAttempts', a.MAX_ATTEMPTS);
            wn('timeLimitMinutes', a.TIME_LIMIT_MINUTES);
            wn('totalPoints', a.TOTAL_POINTS);
            wn('questionCount', a.QUESTION_COUNT);
            wc('definitionJson', a.DEFINITION_JSON);
            write_media(a.VERSION_ID);

            APEX_JSON.OPEN_ARRAY('answers');
            FOR r IN (
                SELECT QUESTION_KEY, QUESTION_TYPE, STUDENT_ANSWER, IS_CORRECT,
                       POINTS_EARNED, POINTS_POSSIBLE, AI_FEEDBACK
                  FROM QUIZ_ANSWERS
                 WHERE ATTEMPT_ID = a.ATTEMPT_ID
                 ORDER BY ANSWER_ID
            ) LOOP
                APEX_JSON.OPEN_OBJECT;
                w('questionKey', r.QUESTION_KEY);
                w('questionType', r.QUESTION_TYPE);
                wc('studentAnswer', r.STUDENT_ANSWER);
                w('isCorrect', r.IS_CORRECT);
                wn('pointsEarned', r.POINTS_EARNED);
                wn('pointsPossible', r.POINTS_POSSIBLE);
                wc('aiFeedback', r.AI_FEEDBACK);
                APEX_JSON.CLOSE_OBJECT;
            END LOOP;
            APEX_JSON.CLOSE_ARRAY;

            APEX_JSON.CLOSE_OBJECT;
            RETURN;
        END LOOP;

        fail(E_ATTEMPT_NOT_FOUND, 'ATTEMPT_NOT_FOUND: no existe el intento ' || p_attempt_id);
    END write_attempt;

    /* ───────────── Desbloqueo ───────────── */

    FUNCTION IS_UNLOCKED(p_quiz_id IN NUMBER, p_id_inscripcion IN NUMBER) RETURN VARCHAR2 IS
        v_pending NUMBER;
    BEGIN
        -- Misiones del curso del estudiante, en temas hasta el del quiz, aún sin completar.
        -- Completada = PROGRESS_PERCENT >= 100, el mismo criterio de PKG_MISSIONS.
        SELECT COUNT(*)
          INTO v_pending
          FROM QUIZZES Q
          JOIN TOPICS QT        ON QT.TOPIC_ID = Q.AFTER_TOPIC_ID
          JOIN INSCRIPCIONES I  ON I.ID_INSCRIPCION = p_id_inscripcion
          JOIN MISSIONS M       ON M.ID_CURSO = I.ID_CURSO
          JOIN TOPICS T         ON T.TOPIC_ID = M.TOPIC_ID
          LEFT JOIN USER_PROGRESS UP
                 ON UP.MISSION_ID = M.MISSION_ID
                AND UP.ID_INSCRIPCION = p_id_inscripcion
         WHERE Q.QUIZ_ID = p_quiz_id
           AND T.SORT_ORDER <= QT.SORT_ORDER
           AND NVL(UP.PROGRESS_PERCENT, 0) < 100;

        RETURN CASE WHEN v_pending = 0 THEN 'Y' ELSE 'N' END;
    END IS_UNLOCKED;

    /* ───────────── Académicos ───────────── */

    PROCEDURE ADMIN_LIST IS
    BEGIN
        APEX_JSON.OPEN_ARRAY;
        FOR r IN (
            SELECT Q.QUIZ_ID, Q.TITLE, Q.AFTER_TOPIC_ID, Q.IS_ACTIVE, Q.PUBLISHED_VERSION_ID,
                   T.TITLE AS TOPIC_TITLE, T.SORT_ORDER AS TOPIC_SORT_ORDER, T.COURSE_ID,
                   PV.VERSION_NUMBER AS PUBLISHED_VERSION_NUMBER,
                   LV.VERSION_ID AS LATEST_VERSION_ID, LV.VERSION_NUMBER AS LATEST_VERSION_NUMBER,
                   LV.STATUS AS LATEST_VERSION_STATUS,
                   (SELECT COUNT(*) FROM QUIZ_ATTEMPTS A
                     WHERE A.QUIZ_ID = Q.QUIZ_ID AND A.STATUS = 'ENTREGADO') AS SUBMITTED_ATTEMPTS
              FROM QUIZZES Q
              JOIN TOPICS T ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
              LEFT JOIN QUIZ_VERSIONS PV ON PV.VERSION_ID = Q.PUBLISHED_VERSION_ID
              LEFT JOIN QUIZ_VERSIONS LV
                     ON LV.QUIZ_ID = Q.QUIZ_ID
                    AND LV.VERSION_NUMBER = (SELECT MAX(X.VERSION_NUMBER) FROM QUIZ_VERSIONS X
                                              WHERE X.QUIZ_ID = Q.QUIZ_ID)
             ORDER BY T.SORT_ORDER
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            wn('quizId', r.QUIZ_ID);
            w('title', r.TITLE);
            wn('afterTopicId', r.AFTER_TOPIC_ID);
            w('afterTopicTitle', r.TOPIC_TITLE);
            wn('afterTopicSortOrder', r.TOPIC_SORT_ORDER);
            w('courseId', r.COURSE_ID);
            w('isActive', r.IS_ACTIVE);
            wn('publishedVersionId', r.PUBLISHED_VERSION_ID);
            wn('publishedVersionNumber', r.PUBLISHED_VERSION_NUMBER);
            wn('latestVersionId', r.LATEST_VERSION_ID);
            wn('latestVersionNumber', r.LATEST_VERSION_NUMBER);
            w('latestVersionStatus', r.LATEST_VERSION_STATUS);
            wn('submittedAttempts', r.SUBMITTED_ATTEMPTS);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
    END ADMIN_LIST;

    PROCEDURE GET_QUIZ(p_quiz_id IN NUMBER) IS
    BEGIN
        FOR q IN (
            SELECT Q.QUIZ_ID, Q.TITLE, Q.AFTER_TOPIC_ID, Q.IS_ACTIVE, Q.PUBLISHED_VERSION_ID,
                   T.TITLE AS TOPIC_TITLE, T.SORT_ORDER AS TOPIC_SORT_ORDER, T.COURSE_ID
              FROM QUIZZES Q
              JOIN TOPICS T ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
             WHERE Q.QUIZ_ID = p_quiz_id
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', TRUE);
            wn('quizId', q.QUIZ_ID);
            w('title', q.TITLE);
            wn('afterTopicId', q.AFTER_TOPIC_ID);
            w('afterTopicTitle', q.TOPIC_TITLE);
            wn('afterTopicSortOrder', q.TOPIC_SORT_ORDER);
            w('courseId', q.COURSE_ID);
            w('isActive', q.IS_ACTIVE);
            wn('publishedVersionId', q.PUBLISHED_VERSION_ID);

            APEX_JSON.OPEN_ARRAY('versions');
            FOR v IN (
                SELECT V.VERSION_ID, V.VERSION_NUMBER, V.STATUS, V.TITLE, V.TOTAL_POINTS,
                       V.QUESTION_COUNT, V.DOCX_OBJECT_KEY, V.UPLOADED_BY, V.CREATED_AT, V.PUBLISHED_AT,
                       TRIM(AC.NOMBRE || ' ' || AC.APELLIDOPATERNO) AS UPLOADED_BY_NAME,
                       (SELECT COUNT(*) FROM QUIZ_MEDIA M
                         WHERE M.VERSION_ID = V.VERSION_ID
                           AND M.IS_UPLOADED = 'N'
                           AND M.MEDIA_TYPE <> 'LINK') AS PENDING_MEDIA,
                       (SELECT COUNT(*) FROM QUIZ_ATTEMPTS A
                         WHERE A.VERSION_ID = V.VERSION_ID AND A.STATUS = 'ENTREGADO') AS SUBMITTED_ATTEMPTS
                  FROM QUIZ_VERSIONS V
                  LEFT JOIN ACADEMICOS AC ON AC.ID_ACADEMICO = V.UPLOADED_BY
                 WHERE V.QUIZ_ID = q.QUIZ_ID
                 ORDER BY V.VERSION_NUMBER DESC
            ) LOOP
                APEX_JSON.OPEN_OBJECT;
                wn('versionId', v.VERSION_ID);
                wn('versionNumber', v.VERSION_NUMBER);
                w('status', v.STATUS);
                w('title', v.TITLE);
                wn('totalPoints', v.TOTAL_POINTS);
                wn('questionCount', v.QUESTION_COUNT);
                w('docxObjectKey', v.DOCX_OBJECT_KEY);
                w('uploadedBy', v.UPLOADED_BY);
                w('uploadedByName', v.UPLOADED_BY_NAME);
                w('createdAt', iso(v.CREATED_AT));
                w('publishedAt', iso(v.PUBLISHED_AT));
                wn('pendingMedia', v.PENDING_MEDIA);
                wn('submittedAttempts', v.SUBMITTED_ATTEMPTS);
                APEX_JSON.CLOSE_OBJECT;
            END LOOP;
            APEX_JSON.CLOSE_ARRAY;

            APEX_JSON.CLOSE_OBJECT;
            RETURN;
        END LOOP;

        fail(E_QUIZ_NOT_FOUND, 'QUIZ_NOT_FOUND: no existe el quiz ' || p_quiz_id);
    END GET_QUIZ;

    PROCEDURE GET_VERSION(p_version_id IN NUMBER) IS
    BEGIN
        FOR v IN (SELECT * FROM QUIZ_VERSIONS WHERE VERSION_ID = p_version_id) LOOP
            APEX_JSON.OPEN_OBJECT;
            APEX_JSON.WRITE('success', TRUE);
            wn('versionId', v.VERSION_ID);
            wn('quizId', v.QUIZ_ID);
            wn('versionNumber', v.VERSION_NUMBER);
            w('status', v.STATUS);
            w('title', v.TITLE);
            wn('passingScore', v.PASSING_SCORE);
            wn('maxAttempts', v.MAX_ATTEMPTS);
            wn('timeLimitMinutes', v.TIME_LIMIT_MINUTES);
            wn('totalPoints', v.TOTAL_POINTS);
            wn('questionCount', v.QUESTION_COUNT);
            w('docxObjectKey', v.DOCX_OBJECT_KEY);
            w('uploadedBy', v.UPLOADED_BY);
            w('createdAt', iso(v.CREATED_AT));
            w('publishedAt', iso(v.PUBLISHED_AT));
            wc('definitionJson', v.DEFINITION_JSON);
            wc('validationJson', v.VALIDATION_JSON);
            write_media(v.VERSION_ID);
            APEX_JSON.CLOSE_OBJECT;
            RETURN;
        END LOOP;

        fail(E_VERSION_NOT_FOUND, 'VERSION_NOT_FOUND: no existe la versión ' || p_version_id);
    END GET_VERSION;

    /*
      Cuerpo esperado (lo arma FastAPI después de leer y validar el Word):
      {
        "quizId": 1, "uploadedBy": "A001", "title": "Quiz 1 · Greetings",
        "passingScore": 70, "maxAttempts": 2, "timeLimitMinutes": 20,
        "totalPoints": 14, "questionCount": 8,
        "docxObjectKey": "quizzes/1/docx/<sha256>.docx",
        "definition": { ...quiz completo con respuestas... },
        "validation": { "errorCount": 0, "warningCount": 1, "items": [...] },
        "media": [ { "fileName": "dialogo.mp3", "mediaType": "AUDIO", "objectKey": null,
                     "url": null, "contentType": "audio/mpeg", "sizeBytes": null,
                     "sha256": null, "isUploaded": "N" } ]
      }
    */
    PROCEDURE CREATE_VERSION(p_body IN CLOB) IS
        -- Las funciones privadas no se pueden usar dentro de SQL: se leen antes en variables
        v_quiz_id      NUMBER          := body_number(p_body, '$.quizId');
        v_definition   CLOB            := body_json(p_body, '$.definition');
        v_validation   CLOB            := body_json(p_body, '$.validation');
        v_title        VARCHAR2(300)   := SUBSTR(body_text(p_body, '$.title'), 1, 300);
        v_passing      NUMBER          := body_number(p_body, '$.passingScore');
        v_max_attempts NUMBER          := body_number(p_body, '$.maxAttempts');
        v_time_limit   NUMBER          := body_number(p_body, '$.timeLimitMinutes');
        v_total_points NUMBER          := body_number(p_body, '$.totalPoints');
        v_questions    NUMBER          := body_number(p_body, '$.questionCount');
        v_docx_key     VARCHAR2(500)   := body_text(p_body, '$.docxObjectKey');
        v_uploaded_by  VARCHAR2(20)    := body_text(p_body, '$.uploadedBy');
        v_lock         NUMBER;
        v_number       NUMBER;
        v_version_id   NUMBER;
    BEGIN
        IF v_quiz_id IS NULL OR v_definition IS NULL THEN
            fail(E_INVALID_BODY, 'INVALID_BODY: faltan quizId o definition');
        END IF;

        BEGIN
            -- Bloquea el quiz para que dos cargas simultáneas no tomen el mismo número
            SELECT QUIZ_ID INTO v_lock FROM QUIZZES WHERE QUIZ_ID = v_quiz_id FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_QUIZ_NOT_FOUND, 'QUIZ_NOT_FOUND: no existe el quiz ' || v_quiz_id);
        END;

        SELECT NVL(MAX(VERSION_NUMBER), 0) + 1 INTO v_number
          FROM QUIZ_VERSIONS WHERE QUIZ_ID = v_quiz_id;

        INSERT INTO QUIZ_VERSIONS (
            QUIZ_ID, VERSION_NUMBER, STATUS, TITLE, PASSING_SCORE, MAX_ATTEMPTS,
            TIME_LIMIT_MINUTES, TOTAL_POINTS, QUESTION_COUNT, DEFINITION_JSON,
            VALIDATION_JSON, DOCX_OBJECT_KEY, UPLOADED_BY
        ) VALUES (
            v_quiz_id, v_number, 'BORRADOR', v_title, v_passing, v_max_attempts,
            v_time_limit, v_total_points, v_questions, v_definition, v_validation,
            v_docx_key, v_uploaded_by
        ) RETURNING VERSION_ID INTO v_version_id;

        INSERT INTO QUIZ_MEDIA (
            VERSION_ID, FILE_NAME, MEDIA_TYPE, OBJECT_KEY, URL, CONTENT_TYPE,
            SIZE_BYTES, SHA256, IS_UPLOADED, UPLOADED_AT
        )
        SELECT v_version_id, J.FILE_NAME, J.MEDIA_TYPE, J.OBJECT_KEY, J.URL, J.CONTENT_TYPE,
               J.SIZE_BYTES, J.SHA256, NVL(J.IS_UPLOADED, 'N'),
               CASE WHEN J.IS_UPLOADED = 'Y' THEN SYSTIMESTAMP END
          FROM JSON_TABLE(p_body, '$.media[*]' COLUMNS (
                   FILE_NAME    VARCHAR2(255)  PATH '$.fileName',
                   MEDIA_TYPE   VARCHAR2(10)   PATH '$.mediaType',
                   OBJECT_KEY   VARCHAR2(500)  PATH '$.objectKey',
                   URL          VARCHAR2(1000) PATH '$.url',
                   CONTENT_TYPE VARCHAR2(100)  PATH '$.contentType',
                   SIZE_BYTES   NUMBER         PATH '$.sizeBytes',
                   SHA256       VARCHAR2(64)   PATH '$.sha256',
                   IS_UPLOADED  VARCHAR2(1)    PATH '$.isUploaded'
               )) J;

        UPDATE QUIZZES SET UPDATED_AT = SYSTIMESTAMP WHERE QUIZ_ID = v_quiz_id;
        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        wn('versionId', v_version_id);
        wn('versionNumber', v_number);
        APEX_JSON.CLOSE_OBJECT;
    END CREATE_VERSION;

    /*
      Registra un archivo subido (o lo actualiza) en una versión en borrador:
      { "versionId": 5, "fileName": "dialogo.mp3", "mediaType": "AUDIO",
        "objectKey": "quizzes/1/media/<sha256>.mp3", "contentType": "audio/mpeg",
        "sizeBytes": 123456, "sha256": "...", "url": null }
    */
    PROCEDURE SAVE_MEDIA(p_body IN CLOB) IS
        v_version_id   NUMBER         := body_number(p_body, '$.versionId');
        v_file_name    VARCHAR2(255)  := body_text(p_body, '$.fileName');
        v_media_type   VARCHAR2(10)   := body_text(p_body, '$.mediaType');
        v_object_key   VARCHAR2(500)  := body_text(p_body, '$.objectKey');
        v_url          VARCHAR2(1000) := body_text(p_body, '$.url');
        v_content_type VARCHAR2(100)  := body_text(p_body, '$.contentType');
        v_size_bytes   NUMBER         := body_number(p_body, '$.sizeBytes');
        v_sha256       VARCHAR2(64)   := body_text(p_body, '$.sha256');
        v_status       VARCHAR2(20);
    BEGIN
        IF v_version_id IS NULL OR v_file_name IS NULL THEN
            fail(E_INVALID_BODY, 'INVALID_BODY: faltan versionId o fileName');
        END IF;

        BEGIN
            SELECT STATUS INTO v_status FROM QUIZ_VERSIONS WHERE VERSION_ID = v_version_id FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_VERSION_NOT_FOUND, 'VERSION_NOT_FOUND: no existe la versión ' || v_version_id);
        END;

        IF v_status <> 'BORRADOR' THEN
            fail(E_VERSION_NOT_EDITABLE, 'VERSION_NOT_EDITABLE: la versión ya fue publicada; sube el Word de nuevo');
        END IF;

        MERGE INTO QUIZ_MEDIA M
        USING (
            SELECT v_version_id   AS VERSION_ID,
                   v_file_name    AS FILE_NAME,
                   v_media_type   AS MEDIA_TYPE,
                   v_object_key   AS OBJECT_KEY,
                   v_url          AS URL,
                   v_content_type AS CONTENT_TYPE,
                   v_size_bytes   AS SIZE_BYTES,
                   v_sha256       AS SHA256
              FROM DUAL
        ) S
        ON (M.VERSION_ID = S.VERSION_ID AND M.FILE_NAME = S.FILE_NAME)
        WHEN MATCHED THEN UPDATE SET
            M.MEDIA_TYPE   = NVL(S.MEDIA_TYPE, M.MEDIA_TYPE),
            M.OBJECT_KEY   = S.OBJECT_KEY,
            M.URL          = S.URL,
            M.CONTENT_TYPE = S.CONTENT_TYPE,
            M.SIZE_BYTES   = S.SIZE_BYTES,
            M.SHA256       = S.SHA256,
            M.IS_UPLOADED  = 'Y',
            M.UPLOADED_AT  = SYSTIMESTAMP
        WHEN NOT MATCHED THEN INSERT (
            VERSION_ID, FILE_NAME, MEDIA_TYPE, OBJECT_KEY, URL, CONTENT_TYPE,
            SIZE_BYTES, SHA256, IS_UPLOADED, UPLOADED_AT
        ) VALUES (
            S.VERSION_ID, S.FILE_NAME, S.MEDIA_TYPE, S.OBJECT_KEY, S.URL, S.CONTENT_TYPE,
            S.SIZE_BYTES, S.SHA256, 'Y', SYSTIMESTAMP
        );

        COMMIT;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        wn('versionId', v_version_id);
        APEX_JSON.OPEN_OBJECT('pending');
        FOR p IN (
            SELECT COUNT(*) AS N FROM QUIZ_MEDIA
             WHERE VERSION_ID = v_version_id AND IS_UPLOADED = 'N' AND MEDIA_TYPE <> 'LINK'
        ) LOOP
            wn('count', p.N);
        END LOOP;
        APEX_JSON.CLOSE_OBJECT;
        APEX_JSON.CLOSE_OBJECT;
    END SAVE_MEDIA;

    -- Publica una versión en borrador (o vuelve a publicar una archivada, para revertir)
    PROCEDURE PUBLISH_VERSION(p_version_id IN NUMBER) IS
        v_quiz_id    NUMBER;
        v_status     VARCHAR2(20);
        v_validation CLOB;
        v_errors     NUMBER;
        v_pending    NUMBER;
        v_number     NUMBER;
    BEGIN
        BEGIN
            SELECT QUIZ_ID, STATUS, VALIDATION_JSON, VERSION_NUMBER
              INTO v_quiz_id, v_status, v_validation, v_number
              FROM QUIZ_VERSIONS
             WHERE VERSION_ID = p_version_id
               FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_VERSION_NOT_FOUND, 'VERSION_NOT_FOUND: no existe la versión ' || p_version_id);
        END;

        IF v_status <> 'PUBLICADA' THEN
            v_errors := NVL(body_number(v_validation, '$.errorCount'), 0);
            IF v_errors > 0 THEN
                fail(E_VALIDATION_ERRORS, 'VALIDATION_ERRORS: la versión tiene ' || v_errors || ' errores');
            END IF;

            SELECT COUNT(*) INTO v_pending FROM QUIZ_MEDIA
             WHERE VERSION_ID = p_version_id AND IS_UPLOADED = 'N' AND MEDIA_TYPE <> 'LINK';
            IF v_pending > 0 THEN
                fail(E_MEDIA_PENDING, 'MEDIA_PENDING: faltan ' || v_pending || ' archivos por subir');
            END IF;

            UPDATE QUIZ_VERSIONS SET STATUS = 'ARCHIVADA'
             WHERE QUIZ_ID = v_quiz_id AND STATUS = 'PUBLICADA';

            UPDATE QUIZ_VERSIONS SET STATUS = 'PUBLICADA', PUBLISHED_AT = SYSTIMESTAMP
             WHERE VERSION_ID = p_version_id;

            UPDATE QUIZZES SET PUBLISHED_VERSION_ID = p_version_id, UPDATED_AT = SYSTIMESTAMP
             WHERE QUIZ_ID = v_quiz_id;

            COMMIT;
        END IF;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        wn('quizId', v_quiz_id);
        wn('versionId', p_version_id);
        wn('versionNumber', v_number);
        APEX_JSON.CLOSE_OBJECT;
    END PUBLISH_VERSION;

    PROCEDURE GET_STATS(p_quiz_id IN NUMBER, p_version_id IN NUMBER DEFAULT NULL) IS
        v_version_id NUMBER := p_version_id;
    BEGIN
        IF v_version_id IS NULL THEN
            BEGIN
                SELECT PUBLISHED_VERSION_ID INTO v_version_id FROM QUIZZES WHERE QUIZ_ID = p_quiz_id;
            EXCEPTION
                WHEN NO_DATA_FOUND THEN
                    fail(E_QUIZ_NOT_FOUND, 'QUIZ_NOT_FOUND: no existe el quiz ' || p_quiz_id);
            END;
        END IF;

        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', TRUE);
        wn('quizId', p_quiz_id);
        wn('versionId', v_version_id);

        FOR s IN (
            SELECT COUNT(*)                                  AS ATTEMPTS,
                   COUNT(DISTINCT ID_INSCRIPCION)            AS STUDENTS,
                   ROUND(AVG(SCORE_PERCENT), 1)              AS AVG_SCORE,
                   MAX(SCORE_PERCENT)                        AS MAX_SCORE,
                   MIN(SCORE_PERCENT)                        AS MIN_SCORE,
                   ROUND(100 * AVG(CASE WHEN PASSED = 'Y' THEN 1 ELSE 0 END), 1) AS PASS_RATE
              FROM QUIZ_ATTEMPTS
             WHERE QUIZ_ID = p_quiz_id
               AND VERSION_ID = v_version_id
               AND STATUS = 'ENTREGADO'
        ) LOOP
            wn('attempts', s.ATTEMPTS);
            wn('students', s.STUDENTS);
            wn('avgScore', s.AVG_SCORE);
            wn('maxScore', s.MAX_SCORE);
            wn('minScore', s.MIN_SCORE);
            wn('passRate', s.PASS_RATE);
        END LOOP;

        APEX_JSON.OPEN_ARRAY('questions');
        FOR q IN (
            SELECT N.QUESTION_KEY, N.QUESTION_TYPE,
                   COUNT(*)                                                   AS ANSWERS,
                   SUM(CASE WHEN N.IS_CORRECT = 'Y' THEN 1 ELSE 0 END)        AS CORRECT,
                   SUM(CASE WHEN N.IS_CORRECT = 'P' THEN 1 ELSE 0 END)        AS PARTIAL,
                   ROUND(100 * AVG(N.POINTS_EARNED / NULLIF(N.POINTS_POSSIBLE, 0)), 1) AS SUCCESS_RATE
              FROM QUIZ_ANSWERS N
              JOIN QUIZ_ATTEMPTS A ON A.ATTEMPT_ID = N.ATTEMPT_ID
             WHERE A.QUIZ_ID = p_quiz_id
               AND A.VERSION_ID = v_version_id
               AND A.STATUS = 'ENTREGADO'
             GROUP BY N.QUESTION_KEY, N.QUESTION_TYPE
             ORDER BY N.QUESTION_KEY
        ) LOOP
            APEX_JSON.OPEN_OBJECT;
            w('questionKey', q.QUESTION_KEY);
            w('questionType', q.QUESTION_TYPE);
            wn('answers', q.ANSWERS);
            wn('correct', q.CORRECT);
            wn('partial', q.PARTIAL);
            wn('successRate', q.SUCCESS_RATE);
            APEX_JSON.CLOSE_OBJECT;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;

        APEX_JSON.CLOSE_OBJECT;
    END GET_STATS;

    /* ───────────── Estudiantes ───────────── */

    PROCEDURE GET_AVAILABLE(p_id_inscripcion IN NUMBER) IS
        v_curso    INSCRIPCIONES.ID_CURSO%TYPE;
        v_unlocked VARCHAR2(1);
        v_status   VARCHAR2(20);
    BEGIN
        BEGIN
            SELECT ID_CURSO INTO v_curso FROM INSCRIPCIONES WHERE ID_INSCRIPCION = p_id_inscripcion;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_INSCRIPCION_NOT_FOUND, 'INSCRIPCION_NOT_FOUND: no existe la inscripción ' || p_id_inscripcion);
        END;

        APEX_JSON.OPEN_ARRAY;
        FOR r IN (
            SELECT Q.QUIZ_ID, Q.TITLE, Q.AFTER_TOPIC_ID, Q.PUBLISHED_VERSION_ID,
                   T.TITLE AS TOPIC_TITLE, T.SORT_ORDER AS TOPIC_SORT_ORDER,
                   V.TITLE AS VERSION_TITLE, V.PASSING_SCORE, V.MAX_ATTEMPTS,
                   V.TIME_LIMIT_MINUTES, V.TOTAL_POINTS, V.QUESTION_COUNT
              FROM QUIZZES Q
              JOIN TOPICS T        ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
              JOIN QUIZ_VERSIONS V ON V.VERSION_ID = Q.PUBLISHED_VERSION_ID
             WHERE Q.IS_ACTIVE = 'Y'
               AND T.COURSE_ID = v_curso
             ORDER BY T.SORT_ORDER
        ) LOOP
            v_unlocked := IS_UNLOCKED(r.QUIZ_ID, p_id_inscripcion);

            FOR a IN (
                SELECT COUNT(*) AS USED,
                       MAX(CASE WHEN STATUS = 'ENTREGADO' THEN SCORE_PERCENT END) AS BEST_SCORE,
                       MAX(CASE WHEN STATUS = 'ENTREGADO' THEN XP_EARNED END)     AS BEST_XP,
                       MAX(CASE WHEN STATUS = 'ENTREGADO' AND PASSED = 'Y' THEN 'Y' END) AS PASSED,
                       MAX(CASE WHEN STATUS = 'EN_CURSO'
                                 AND (EXPIRES_AT IS NULL OR EXPIRES_AT + C_GRACE >= SYSTIMESTAMP)
                                THEN ATTEMPT_ID END) AS IN_PROGRESS_ID
                  FROM QUIZ_ATTEMPTS
                 WHERE QUIZ_ID = r.QUIZ_ID
                   AND ID_INSCRIPCION = p_id_inscripcion
            ) LOOP
                v_status := CASE
                                WHEN a.PASSED = 'Y' THEN 'COMPLETED'
                                WHEN v_unlocked = 'Y' THEN 'ACTIVE'
                                ELSE 'LOCKED'
                            END;

                APEX_JSON.OPEN_OBJECT;
                wn('quizId', r.QUIZ_ID);
                w('title', r.TITLE);
                w('versionTitle', r.VERSION_TITLE);
                wn('afterTopicId', r.AFTER_TOPIC_ID);
                w('afterTopicTitle', r.TOPIC_TITLE);
                wn('afterTopicSortOrder', r.TOPIC_SORT_ORDER);
                w('status', v_status);
                w('unlocked', v_unlocked);
                wn('passingScore', r.PASSING_SCORE);
                wn('timeLimitMinutes', r.TIME_LIMIT_MINUTES);
                wn('totalPoints', r.TOTAL_POINTS);
                wn('questionCount', r.QUESTION_COUNT);
                wn('maxAttempts', r.MAX_ATTEMPTS);
                wn('attemptsUsed', a.USED);
                wn('attemptsLeft', CASE WHEN r.MAX_ATTEMPTS IS NULL THEN NULL
                                        ELSE GREATEST(r.MAX_ATTEMPTS - a.USED, 0) END);
                wn('bestScorePercent', a.BEST_SCORE);
                wn('bestXp', a.BEST_XP);
                w('passed', NVL(a.PASSED, 'N'));
                wn('inProgressAttemptId', a.IN_PROGRESS_ID);
                APEX_JSON.CLOSE_OBJECT;
            END LOOP;
        END LOOP;
        APEX_JSON.CLOSE_ARRAY;
    END GET_AVAILABLE;

    -- Crea un intento o reanuda el que está en curso (recarga de página, otro dispositivo)
    PROCEDURE START_ATTEMPT(p_quiz_id IN NUMBER, p_id_inscripcion IN NUMBER) IS
        v_curso        INSCRIPCIONES.ID_CURSO%TYPE;
        v_quiz_course  TOPICS.COURSE_ID%TYPE;
        v_version_id   NUMBER;
        v_max_attempts NUMBER;
        v_time_limit   NUMBER;
        v_attempt_id   NUMBER;
        v_used         NUMBER;
        v_next_number  NUMBER;
    BEGIN
        BEGIN
            -- Bloquea la inscripción: evita dos intentos simultáneos del mismo estudiante
            SELECT ID_CURSO INTO v_curso FROM INSCRIPCIONES
             WHERE ID_INSCRIPCION = p_id_inscripcion FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_INSCRIPCION_NOT_FOUND, 'INSCRIPCION_NOT_FOUND: no existe la inscripción ' || p_id_inscripcion);
        END;

        BEGIN
            SELECT Q.PUBLISHED_VERSION_ID, T.COURSE_ID, V.MAX_ATTEMPTS, V.TIME_LIMIT_MINUTES
              INTO v_version_id, v_quiz_course, v_max_attempts, v_time_limit
              FROM QUIZZES Q
              JOIN TOPICS T        ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
              JOIN QUIZ_VERSIONS V ON V.VERSION_ID = Q.PUBLISHED_VERSION_ID
             WHERE Q.QUIZ_ID = p_quiz_id
               AND Q.IS_ACTIVE = 'Y';
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_QUIZ_NOT_PUBLISHED, 'QUIZ_NOT_PUBLISHED: el quiz ' || p_quiz_id || ' no está publicado');
        END;

        IF v_quiz_course <> v_curso THEN
            fail(E_QUIZ_NOT_FOUND, 'QUIZ_NOT_FOUND: el quiz no pertenece al curso del estudiante');
        END IF;

        IF IS_UNLOCKED(p_quiz_id, p_id_inscripcion) = 'N' THEN
            fail(E_QUIZ_LOCKED, 'QUIZ_LOCKED: faltan misiones por completar antes del quiz');
        END IF;

        -- Intentos con tiempo vencido que nunca se entregaron
        UPDATE QUIZ_ATTEMPTS SET STATUS = 'EXPIRADO'
         WHERE QUIZ_ID = p_quiz_id
           AND ID_INSCRIPCION = p_id_inscripcion
           AND STATUS = 'EN_CURSO'
           AND EXPIRES_AT IS NOT NULL
           AND EXPIRES_AT + C_GRACE < SYSTIMESTAMP;

        SELECT MAX(ATTEMPT_ID) INTO v_attempt_id
          FROM QUIZ_ATTEMPTS
         WHERE QUIZ_ID = p_quiz_id
           AND ID_INSCRIPCION = p_id_inscripcion
           AND STATUS = 'EN_CURSO';

        IF v_attempt_id IS NOT NULL THEN
            COMMIT;
            write_attempt(v_attempt_id, 'Y');
            RETURN;
        END IF;

        SELECT COUNT(*), NVL(MAX(ATTEMPT_NUMBER), 0) + 1
          INTO v_used, v_next_number
          FROM QUIZ_ATTEMPTS
         WHERE QUIZ_ID = p_quiz_id
           AND ID_INSCRIPCION = p_id_inscripcion;

        IF v_max_attempts IS NOT NULL AND v_used >= v_max_attempts THEN
            COMMIT;  -- conserva los intentos que se marcaron EXPIRADO
            fail(E_NO_ATTEMPTS_LEFT, 'NO_ATTEMPTS_LEFT: ya usaste los ' || v_max_attempts || ' intentos');
        END IF;

        INSERT INTO QUIZ_ATTEMPTS (
            QUIZ_ID, VERSION_ID, ID_INSCRIPCION, ATTEMPT_NUMBER, STATUS, SHUFFLE_SEED, EXPIRES_AT
        ) VALUES (
            p_quiz_id, v_version_id, p_id_inscripcion, v_next_number, 'EN_CURSO',
            TRUNC(DBMS_RANDOM.VALUE(1, 2147483647)),
            CASE WHEN v_time_limit IS NOT NULL
                 THEN SYSTIMESTAMP + NUMTODSINTERVAL(v_time_limit, 'MINUTE') END
        ) RETURNING ATTEMPT_ID INTO v_attempt_id;

        COMMIT;
        write_attempt(v_attempt_id, 'N');
    END START_ATTEMPT;

    PROCEDURE GET_ATTEMPT(p_attempt_id IN NUMBER) IS
    BEGIN
        write_attempt(p_attempt_id, 'N');
    END GET_ATTEMPT;

    /*
      Guarda un intento ya calificado por FastAPI:
      { "attemptId": 10, "scorePoints": 12, "maxPoints": 14, "scorePercent": 85.71,
        "passed": "Y", "xpEarned": 171,
        "answers": [ { "questionKey": "S1-P1", "questionType": "multiple_choice",
                       "studentAnswer": "a", "isCorrect": "Y", "pointsEarned": 2,
                       "pointsPossible": 2, "aiFeedback": null } ] }
      studentAnswer siempre es texto; para relacionar FastAPI envía el JSON como texto.
    */
    PROCEDURE FINISH_ATTEMPT(p_body IN CLOB) IS
        v_attempt_id NUMBER       := body_number(p_body, '$.attemptId');
        v_points     NUMBER       := body_number(p_body, '$.scorePoints');
        v_max_points NUMBER       := body_number(p_body, '$.maxPoints');
        v_percent    NUMBER       := LEAST(GREATEST(NVL(body_number(p_body, '$.scorePercent'), 0), 0), 100);
        v_passed     VARCHAR2(1)  := CASE WHEN body_text(p_body, '$.passed') = 'Y' THEN 'Y' ELSE 'N' END;
        v_xp         NUMBER       := LEAST(GREATEST(ROUND(NVL(body_number(p_body, '$.xpEarned'), 0)), 0), 200);
        v_status     VARCHAR2(20);
        v_expires    TIMESTAMP WITH TIME ZONE;
    BEGIN
        IF v_attempt_id IS NULL THEN
            fail(E_INVALID_BODY, 'INVALID_BODY: falta attemptId');
        END IF;

        BEGIN
            SELECT STATUS, EXPIRES_AT INTO v_status, v_expires
              FROM QUIZ_ATTEMPTS WHERE ATTEMPT_ID = v_attempt_id FOR UPDATE;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                fail(E_ATTEMPT_NOT_FOUND, 'ATTEMPT_NOT_FOUND: no existe el intento ' || v_attempt_id);
        END;

        IF v_status = 'EN_CURSO' AND v_expires IS NOT NULL AND SYSTIMESTAMP > v_expires + C_GRACE THEN
            UPDATE QUIZ_ATTEMPTS SET STATUS = 'EXPIRADO' WHERE ATTEMPT_ID = v_attempt_id;
            COMMIT;
            v_status := 'EXPIRADO';
        END IF;

        IF v_status <> 'EN_CURSO' THEN
            fail(E_ATTEMPT_CLOSED, 'ATTEMPT_CLOSED: el intento ya está ' || v_status);
        END IF;

        INSERT INTO QUIZ_ANSWERS (
            ATTEMPT_ID, QUESTION_KEY, QUESTION_TYPE, STUDENT_ANSWER, IS_CORRECT,
            POINTS_EARNED, POINTS_POSSIBLE, AI_FEEDBACK
        )
        SELECT v_attempt_id, J.QUESTION_KEY, J.QUESTION_TYPE, J.STUDENT_ANSWER,
               NVL(J.IS_CORRECT, 'N'), NVL(J.POINTS_EARNED, 0), J.POINTS_POSSIBLE, J.AI_FEEDBACK
          FROM JSON_TABLE(p_body, '$.answers[*]' COLUMNS (
                   QUESTION_KEY    VARCHAR2(20) PATH '$.questionKey',
                   QUESTION_TYPE   VARCHAR2(20) PATH '$.questionType',
                   STUDENT_ANSWER  CLOB         PATH '$.studentAnswer',
                   IS_CORRECT      VARCHAR2(1)  PATH '$.isCorrect',
                   POINTS_EARNED   NUMBER       PATH '$.pointsEarned',
                   POINTS_POSSIBLE NUMBER       PATH '$.pointsPossible',
                   AI_FEEDBACK     CLOB         PATH '$.aiFeedback'
               )) J;

        UPDATE QUIZ_ATTEMPTS
           SET STATUS        = 'ENTREGADO',
               SUBMITTED_AT  = SYSTIMESTAMP,
               SCORE_POINTS  = v_points,
               MAX_POINTS    = v_max_points,
               SCORE_PERCENT = v_percent,
               PASSED        = v_passed,
               XP_EARNED     = v_xp
         WHERE ATTEMPT_ID = v_attempt_id;

        COMMIT;
        write_attempt(v_attempt_id, 'N');
    END FINISH_ATTEMPT;

    /* ───────────── Errores ───────────── */

    FUNCTION ERROR_STATUS(p_sqlcode IN NUMBER) RETURN NUMBER IS
    BEGIN
        RETURN CASE
                   WHEN p_sqlcode BETWEEN -20013 AND -20010 THEN 404
                   WHEN p_sqlcode = E_QUIZ_LOCKED THEN 403
                   WHEN p_sqlcode BETWEEN -20026 AND -20021 THEN 409
                   WHEN p_sqlcode = E_INVALID_BODY THEN 400
                   WHEN p_sqlcode = -1 THEN 409          -- registro duplicado
                   WHEN p_sqlcode IN (-2290, -2291, -1400, -40441) THEN 400  -- check, FK, NOT NULL, JSON
                   ELSE 500
               END;
    END ERROR_STATUS;

    PROCEDURE WRITE_ERROR(p_sqlcode IN NUMBER, p_sqlerrm IN VARCHAR2) IS
    BEGIN
        APEX_JSON.OPEN_OBJECT;
        APEX_JSON.WRITE('success', FALSE);
        APEX_JSON.WRITE('code', NVL(REGEXP_SUBSTR(p_sqlerrm, 'ORA-20[0-9]{3}: ([A-Z_]+)', 1, 1, NULL, 1), 'DB_ERROR'));
        APEX_JSON.WRITE('error', p_sqlerrm);
        APEX_JSON.CLOSE_OBJECT;
    END WRITE_ERROR;

END PKG_QUIZ;
/
