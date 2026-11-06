-- Prueba de PKG_QUIZ dentro de Oracle (no necesita ORDS ni FastAPI).
--
-- Crea por unos segundos:
--   - un tema temporal SIN misiones (SORT_ORDER -1): cualquier estudiante del curso lo tiene
--     "completo", asi se pueden probar los intentos aunque nadie haya terminado un tema real;
--     no aparece en el Dashboard porque las misiones se listan a partir de MISSIONS;
--   - un quiz de prueba, que primero se pone despues del tema 1 (prueba de bloqueo) y luego
--     despues del tema temporal (prueba de intentos con un estudiante real).
-- Al final BORRA todo lo que creo. No toca los quizzes 3, 6 y 9 ni el progreso de nadie.
--
-- Ejecutar en Database Actions -> SQL con "Run Script" (F5). Cada linea dice OK o FALLA.
-- Los mensajes no llevan acentos a proposito (evita problemas de codificacion al cargar el archivo).

SET SERVEROUTPUT ON SIZE UNLIMITED;

DECLARE
    v_quiz_id    NUMBER;
    v_topic_id   NUMBER;
    v_version_id NUMBER;
    v_attempt_id NUMBER;
    v_inscr      NUMBER;
    v_course     VARCHAR2(20);
    v_locked     NUMBER;
    v_out        CLOB;
    v_failures   NUMBER := 0;

    FUNCTION run(p_call IN VARCHAR2) RETURN CLOB IS
        v_clob CLOB;
    BEGIN
        APEX_JSON.INITIALIZE_CLOB_OUTPUT;
        EXECUTE IMMEDIATE 'BEGIN ' || p_call || ' END;';
        v_clob := APEX_JSON.GET_CLOB_OUTPUT;
        APEX_JSON.FREE_OUTPUT;
        RETURN v_clob;
    EXCEPTION
        WHEN OTHERS THEN
            APEX_JSON.FREE_OUTPUT;
            RAISE;
    END run;

    FUNCTION jnum(p_json IN CLOB, p_path IN VARCHAR2) RETURN NUMBER IS
        v NUMBER;
    BEGIN
        EXECUTE IMMEDIATE 'SELECT JSON_VALUE(:j, ''' || p_path || ''' RETURNING NUMBER) FROM DUAL'
            INTO v USING p_json;
        RETURN v;
    END jnum;

    FUNCTION jtxt(p_json IN CLOB, p_path IN VARCHAR2) RETURN VARCHAR2 IS
        v VARCHAR2(4000);
    BEGIN
        EXECUTE IMMEDIATE 'SELECT JSON_VALUE(:j, ''' || p_path || ''') FROM DUAL'
            INTO v USING p_json;
        RETURN v;
    END jtxt;

    PROCEDURE check_that(p_ok IN BOOLEAN, p_label IN VARCHAR2) IS
    BEGIN
        IF p_ok THEN
            DBMS_OUTPUT.PUT_LINE('OK     ' || p_label);
        ELSE
            v_failures := v_failures + 1;
            DBMS_OUTPUT.PUT_LINE('FALLA  ' || p_label);
        END IF;
    END check_that;

    -- Ejecuta una llamada que debe fallar con un codigo concreto
    PROCEDURE expect_error(p_call IN VARCHAR2, p_code IN NUMBER, p_label IN VARCHAR2) IS
        v_dummy CLOB;
    BEGIN
        v_dummy := run(p_call);
        check_that(FALSE, p_label || ' (no dio error)');
    EXCEPTION
        WHEN OTHERS THEN
            ROLLBACK;
            check_that(SQLCODE = p_code, p_label || ' -> ' || SUBSTR(SQLERRM, 1, 120));
    END expect_error;
BEGIN
    /* 0. Estudiante real para la prueba de intentos y tema temporal en su curso */
    SELECT MIN(I.ID_INSCRIPCION) INTO v_inscr
      FROM INSCRIPCIONES I
     WHERE EXISTS (SELECT 1 FROM TOPICS T WHERE T.COURSE_ID = I.ID_CURSO);

    IF v_inscr IS NULL THEN
        RAISE_APPLICATION_ERROR(-20999, 'No hay inscripciones en un curso con temas');
    END IF;

    SELECT ID_CURSO INTO v_course FROM INSCRIPCIONES WHERE ID_INSCRIPCION = v_inscr;

    INSERT INTO TOPICS (COURSE_ID, TITLE, SORT_ORDER) VALUES (v_course, 'PRUEBA AUTOMATICA', -1)
    RETURNING TOPIC_ID INTO v_topic_id;

    /* 1. Quiz de prueba despues del tema 1 */
    INSERT INTO QUIZZES (AFTER_TOPIC_ID, TITLE) VALUES (1, 'PRUEBA AUTOMATICA')
    RETURNING QUIZ_ID INTO v_quiz_id;
    COMMIT;

    /* 2. Version en borrador con un audio pendiente, 1 intento y 2 preguntas */
    v_out := run('PKG_QUIZ.CREATE_VERSION(''{
        "quizId": ' || v_quiz_id || ', "title": "Quiz de prueba", "passingScore": 70,
        "maxAttempts": 1, "timeLimitMinutes": 20, "totalPoints": 3, "questionCount": 2,
        "docxObjectKey": "quizzes/test/docx/abc.docx",
        "definition": { "sections": [ { "name": "Listening", "questions": [
            { "key": "S1-P1", "type": "multiple_choice", "answer": "a", "points": 2 },
            { "key": "S1-P2", "type": "true_false", "answer": "Falso", "points": 1 } ] } ] },
        "validation": { "errorCount": 0, "warningCount": 0, "items": [] },
        "media": [ { "fileName": "dialogo.mp3", "mediaType": "AUDIO", "isUploaded": "N" } ]
    }'');');
    v_version_id := jnum(v_out, '$.versionId');
    check_that(v_version_id IS NOT NULL AND jnum(v_out, '$.versionNumber') = 1,
               'CREATE_VERSION crea la version 1');

    /* 3. No se publica con archivos pendientes */
    expect_error('PKG_QUIZ.PUBLISH_VERSION(' || v_version_id || ');', -20024,
                 'PUBLISH_VERSION rechaza archivos pendientes');

    /* 4. Se registra el audio y se publica */
    v_out := run('PKG_QUIZ.SAVE_MEDIA(''{ "versionId": ' || v_version_id || ',
        "fileName": "dialogo.mp3", "mediaType": "AUDIO",
        "objectKey": "quizzes/test/media/abc.mp3", "contentType": "audio/mpeg",
        "sizeBytes": 1000, "sha256": "abc" }'');');
    check_that(jnum(v_out, '$.pending.count') = 0, 'SAVE_MEDIA marca el audio como subido');

    v_out := run('PKG_QUIZ.PUBLISH_VERSION(' || v_version_id || ');');
    check_that(jtxt(v_out, '$.success') = 'true', 'PUBLISH_VERSION publica la version');

    expect_error('PKG_QUIZ.SAVE_MEDIA(''{ "versionId": ' || v_version_id || ', "fileName": "x.mp3", "mediaType": "AUDIO" }'');',
                 -20025, 'SAVE_MEDIA no modifica una version publicada');

    /* 5. Consultas del academico */
    v_out := run('PKG_QUIZ.ADMIN_LIST;');
    check_that(DBMS_LOB.INSTR(v_out, 'PRUEBA AUTOMATICA') > 0, 'ADMIN_LIST incluye el quiz');

    v_out := run('PKG_QUIZ.GET_QUIZ(' || v_quiz_id || ');');
    check_that(jtxt(v_out, '$.versions[0].status') = 'PUBLICADA', 'GET_QUIZ muestra la version publicada');

    v_out := run('PKG_QUIZ.GET_VERSION(' || v_version_id || ');');
    check_that(DBMS_LOB.INSTR(v_out, 'S1-P2') > 0, 'GET_VERSION devuelve la definicion');

    expect_error('PKG_QUIZ.GET_QUIZ(-1);', -20010, 'GET_QUIZ de un quiz inexistente');

    /* 6. Bloqueo: estudiante sin el tema 1 completo */
    SELECT MIN(I.ID_INSCRIPCION) INTO v_locked
      FROM INSCRIPCIONES I
      JOIN TOPICS T ON T.TOPIC_ID = 1 AND T.COURSE_ID = I.ID_CURSO
     WHERE PKG_QUIZ.IS_UNLOCKED(v_quiz_id, I.ID_INSCRIPCION) = 'N';

    IF v_locked IS NOT NULL THEN
        v_out := run('PKG_QUIZ.GET_AVAILABLE(' || v_locked || ');');
        check_that(jtxt(v_out, '$[*]?(@.quizId == ' || v_quiz_id || ').status') = 'LOCKED',
                   'GET_AVAILABLE marca LOCKED al estudiante ' || v_locked);
        expect_error('PKG_QUIZ.START_ATTEMPT(' || v_quiz_id || ', ' || v_locked || ');', -20020,
                     'START_ATTEMPT rechaza a un estudiante bloqueado');
    ELSE
        DBMS_OUTPUT.PUT_LINE('--     (todos tienen el tema 1 completo; se omite la prueba de bloqueo)');
    END IF;

    /* 7. Intentos: el quiz pasa al tema temporal, que esta desbloqueado para todos */
    UPDATE QUIZZES SET AFTER_TOPIC_ID = v_topic_id WHERE QUIZ_ID = v_quiz_id;
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('--     estudiante de prueba: inscripcion ' || v_inscr);

    check_that(PKG_QUIZ.IS_UNLOCKED(v_quiz_id, v_inscr) = 'Y', 'IS_UNLOCKED desbloquea sin misiones pendientes');

    v_out := run('PKG_QUIZ.GET_AVAILABLE(' || v_inscr || ');');
    check_that(jtxt(v_out, '$[*]?(@.quizId == ' || v_quiz_id || ').status') = 'ACTIVE',
               'GET_AVAILABLE marca ACTIVE');

    v_out := run('PKG_QUIZ.START_ATTEMPT(' || v_quiz_id || ', ' || v_inscr || ');');
    v_attempt_id := jnum(v_out, '$.attemptId');
    check_that(v_attempt_id IS NOT NULL AND jtxt(v_out, '$.resumed') = 'N'
               AND jtxt(v_out, '$.expiresAt') IS NOT NULL, 'START_ATTEMPT crea el intento con tiempo limite');

    v_out := run('PKG_QUIZ.START_ATTEMPT(' || v_quiz_id || ', ' || v_inscr || ');');
    check_that(jnum(v_out, '$.attemptId') = v_attempt_id AND jtxt(v_out, '$.resumed') = 'Y',
               'START_ATTEMPT reanuda el intento en curso');

    v_out := run('PKG_QUIZ.GET_ATTEMPT(' || v_attempt_id || ');');
    check_that(jtxt(v_out, '$.status') = 'EN_CURSO' AND DBMS_LOB.INSTR(v_out, 'dialogo.mp3') > 0,
               'GET_ATTEMPT devuelve el intento con sus archivos');

    v_out := run('PKG_QUIZ.FINISH_ATTEMPT(''{ "attemptId": ' || v_attempt_id || ',
        "scorePoints": 2, "maxPoints": 3, "scorePercent": 66.67, "passed": "N", "xpEarned": 133,
        "answers": [
          { "questionKey": "S1-P1", "questionType": "multiple_choice", "studentAnswer": "a",
            "isCorrect": "Y", "pointsEarned": 2, "pointsPossible": 2 },
          { "questionKey": "S1-P2", "questionType": "true_false", "studentAnswer": "Verdadero",
            "isCorrect": "N", "pointsEarned": 0, "pointsPossible": 1 } ] }'');');
    check_that(jtxt(v_out, '$.status') = 'ENTREGADO' AND jnum(v_out, '$.xpEarned') = 133
               AND jtxt(v_out, '$.answers[1].isCorrect') = 'N', 'FINISH_ATTEMPT guarda calificacion y respuestas');

    expect_error('PKG_QUIZ.FINISH_ATTEMPT(''{ "attemptId": ' || v_attempt_id || ', "answers": [] }'');',
                 -20023, 'FINISH_ATTEMPT no acepta entregar dos veces');

    expect_error('PKG_QUIZ.START_ATTEMPT(' || v_quiz_id || ', ' || v_inscr || ');', -20022,
                 'START_ATTEMPT respeta el maximo de intentos');

    v_out := run('PKG_QUIZ.GET_AVAILABLE(' || v_inscr || ');');
    check_that(jnum(v_out, '$[*]?(@.quizId == ' || v_quiz_id || ').attemptsLeft') = 0
               AND jnum(v_out, '$[*]?(@.quizId == ' || v_quiz_id || ').bestXp') = 133,
               'GET_AVAILABLE muestra intentos agotados y mejor XP');

    v_out := run('PKG_QUIZ.GET_STATS(' || v_quiz_id || ');');
    check_that(jnum(v_out, '$.attempts') = 1 AND jnum(v_out, '$.questions[0].successRate') = 100,
               'GET_STATS calcula resultados por pregunta');

    /* 8. Errores en formato ORDS */
    check_that(PKG_QUIZ.ERROR_STATUS(-20020) = 403 AND PKG_QUIZ.ERROR_STATUS(-20010) = 404
               AND PKG_QUIZ.ERROR_STATUS(-20022) = 409 AND PKG_QUIZ.ERROR_STATUS(-20030) = 400,
               'ERROR_STATUS traduce los codigos a HTTP');

    DBMS_OUTPUT.PUT_LINE('--');
    DBMS_OUTPUT.PUT_LINE(CASE WHEN v_failures = 0 THEN 'RESULTADO: todas las pruebas pasaron'
                              ELSE 'RESULTADO: ' || v_failures || ' prueba(s) fallaron' END);
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        DBMS_OUTPUT.PUT_LINE('ERROR INESPERADO: ' || SQLERRM);
        DBMS_OUTPUT.PUT_LINE(DBMS_UTILITY.FORMAT_ERROR_BACKTRACE);
END;
/

-- Limpieza: borra todo lo creado por la prueba (se ejecuta aunque la prueba haya fallado)
BEGIN
    FOR q IN (SELECT QUIZ_ID FROM QUIZZES WHERE TITLE = 'PRUEBA AUTOMATICA') LOOP
        UPDATE QUIZZES SET PUBLISHED_VERSION_ID = NULL WHERE QUIZ_ID = q.QUIZ_ID;
        DELETE FROM QUIZ_ATTEMPTS WHERE QUIZ_ID = q.QUIZ_ID;   -- borra sus respuestas (cascade)
        DELETE FROM QUIZ_VERSIONS WHERE QUIZ_ID = q.QUIZ_ID;   -- borra sus archivos (cascade)
        DELETE FROM QUIZZES WHERE QUIZ_ID = q.QUIZ_ID;
    END LOOP;
    DELETE FROM TOPICS
     WHERE TITLE = 'PRUEBA AUTOMATICA'
       AND SORT_ORDER = -1
       AND NOT EXISTS (SELECT 1 FROM MISSIONS M WHERE M.TOPIC_ID = TOPICS.TOPIC_ID);
    COMMIT;
    DBMS_OUTPUT.PUT_LINE('Limpieza: datos de prueba borrados');
END;
/
