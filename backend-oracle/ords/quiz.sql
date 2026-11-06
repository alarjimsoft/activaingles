-- Módulo ORDS "quiz": endpoints de quizzes para FastAPI.
-- Base: https://<host>/ords/api/quiz/
--
-- PROTEGIDO: devuelve las respuestas correctas, así que solo lo puede llamar FastAPI con un
-- token OAuth (client credentials). Sin token responde 401. El cliente OAuth se crea una sola
-- vez con ords/quiz_oauth_client.sql (o desde Database Actions → REST → Security).
--
-- Se puede volver a ejecutar completo: DEFINE_MODULE reemplaza el módulo y al final se
-- vuelve a asociar el privilegio.
--
-- Errores: { "success": false, "code": "QUIZ_LOCKED", "error": "..." } con status HTTP
-- 400, 403, 404 o 409 según PKG_QUIZ.ERROR_STATUS.

DECLARE
    l_roles    OWA.VC_ARR;
    l_patterns OWA.VC_ARR;
    l_modules  OWA.VC_ARR;

    -- Envuelve la llamada al paquete con el manejo de errores común
    FUNCTION handler(p_call IN VARCHAR2) RETURN CLOB IS
    BEGIN
        RETURN
'BEGIN
    ' || p_call || '
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        :status_code := PKG_QUIZ.ERROR_STATUS(SQLCODE);
        PKG_QUIZ.WRITE_ERROR(SQLCODE, SQLERRM);
END;';
    END handler;

    PROCEDURE endpoint(p_pattern IN VARCHAR2, p_method IN VARCHAR2, p_call IN VARCHAR2, p_comments IN VARCHAR2) IS
    BEGIN
        ORDS.DEFINE_TEMPLATE(
            p_module_name => 'quiz',
            p_pattern     => p_pattern,
            p_priority    => 0,
            p_etag_type   => 'NONE',
            p_etag_query  => NULL,
            p_comments    => p_comments);
        ORDS.DEFINE_HANDLER(
            p_module_name    => 'quiz',
            p_pattern        => p_pattern,
            p_method         => p_method,
            p_source_type    => 'plsql/block',
            p_items_per_page => 0,
            p_mimes_allowed  => '',
            p_comments       => p_comments,
            p_source         => handler(p_call));
    END endpoint;
BEGIN
    ORDS.DEFINE_MODULE(
        p_module_name    => 'quiz',
        p_base_path      => '/quiz/',
        p_items_per_page => 0,
        p_status         => 'PUBLISHED',
        p_comments       => 'Quizzes creados desde Word. Solo FastAPI (OAuth client credentials).');

    /* ── Académicos ── */
    endpoint('admin/list', 'GET',
        'PKG_QUIZ.ADMIN_LIST;',
        'Quizzes con su tema y estado de versiones (lista del Content Manager)');

    endpoint('admin/quiz/:quizId', 'GET',
        'PKG_QUIZ.GET_QUIZ(p_quiz_id => :quizId);',
        'Quiz con el historial de versiones');

    endpoint('admin/version/:versionId', 'GET',
        'PKG_QUIZ.GET_VERSION(p_version_id => :versionId);',
        'Version completa: definicion con respuestas, reporte y archivos');

    endpoint('admin/version', 'POST',
        'PKG_QUIZ.CREATE_VERSION(p_body => :body_text);',
        'Crea una version en borrador a partir del Word ya leido por FastAPI');

    endpoint('admin/media', 'POST',
        'PKG_QUIZ.SAVE_MEDIA(p_body => :body_text);',
        'Registra un archivo subido al bucket');

    endpoint('admin/publish/:versionId', 'POST',
        'PKG_QUIZ.PUBLISH_VERSION(p_version_id => :versionId);',
        'Publica una version (sin errores y sin archivos pendientes)');

    endpoint('admin/stats/:quizId', 'GET',
        'PKG_QUIZ.GET_STATS(p_quiz_id => :quizId, p_version_id => :versionId);',
        'Resultados por quiz y por pregunta; ?versionId= opcional (por defecto la publicada)');

    /* ── Estudiantes ── */
    endpoint('student/available/:idInscripcion', 'GET',
        'PKG_QUIZ.GET_AVAILABLE(p_id_inscripcion => :idInscripcion);',
        'Quizzes publicados del curso con estado LOCKED / ACTIVE / COMPLETED');

    endpoint('student/start', 'POST',
        'PKG_QUIZ.START_ATTEMPT(p_quiz_id => :quiz_id, p_id_inscripcion => :id_inscripcion);',
        'Crea o reanuda un intento. Cuerpo: { "quiz_id": 1, "id_inscripcion": 25 }');

    endpoint('student/attempt/:attemptId', 'GET',
        'PKG_QUIZ.GET_ATTEMPT(p_attempt_id => :attemptId);',
        'Intento con definicion, archivos y respuestas (para calificar y para recargar)');

    endpoint('student/finish', 'POST',
        'PKG_QUIZ.FINISH_ATTEMPT(p_body => :body_text);',
        'Guarda el intento calificado por FastAPI');

    /* ── Protección OAuth ── */
    BEGIN
        ORDS.CREATE_ROLE(p_role_name => 'quiz_backend_role');
    EXCEPTION
        WHEN OTHERS THEN
            NULL;  -- el rol ya existe (el script se volvió a ejecutar)
    END;

    l_roles(1)   := 'quiz_backend_role';
    l_modules(1) := 'quiz';

    ORDS.DEFINE_PRIVILEGE(
        p_privilege_name => 'quiz_backend_priv',
        p_roles          => l_roles,
        p_patterns       => l_patterns,
        p_modules        => l_modules,
        p_label          => 'Quiz backend',
        p_description    => 'Acceso exclusivo de FastAPI al modulo quiz',
        p_comments       => NULL);

    COMMIT;
END;
/
