-- Redefine SOLO el endpoint GET /progress/stats/:id_inscripcion para sumar el XP de los quizzes.
--
-- Úsalo en lugar de volver a ejecutar progress.sql completo: ese archivo empieza con
-- DEFINE_MODULE, que borraría los demás endpoints del módulo y dejaría como único origen
-- permitido http://localhost:5173 (producción también usa alarjimsoft.web.app).
--
-- XP total = XP de misiones (USER_PROGRESS) + mejor intento de cada quiz (QUIZ_ATTEMPTS).
-- Devuelve las mismas columnas que antes (total_xp, level, xp_next_level...) más
-- mission_xp y quiz_xp, así el frontend actual sigue funcionando sin cambios.
-- Requiere que ya exista la tabla QUIZ_ATTEMPTS.

BEGIN
  ORDS.DEFINE_TEMPLATE(
      p_module_name    => 'progress',
      p_pattern        => 'stats/:id_inscripcion',
      p_priority       => 0,
      p_etag_type      => 'HASH',
      p_etag_query     => NULL,
      p_comments       => NULL);
  ORDS.DEFINE_HANDLER(
      p_module_name    => 'progress',
      p_pattern        => 'stats/:id_inscripcion',
      p_method         => 'GET',
      p_source_type    => 'json/query;type=single',
      p_items_per_page =>  0,
      p_mimes_allowed  => '',
      p_comments       => 'XP total = misiones + mejor intento de cada quiz',
      p_source         =>
'SELECT
    M.TOTAL_MISSIONS,
    M.COMPLETED_MISSIONS,
    M.MISSION_XP + Q.QUIZ_XP                         AS TOTAL_XP,
    M.MISSION_XP,
    Q.QUIZ_XP,
    M.TOTAL_TIME,
    M.AVG_PROGRESS,
    M.AVG_PRONUNCIATION,
    M.AVG_GRAMMAR,
    FLOOR((M.MISSION_XP + Q.QUIZ_XP) / 200) + 1         AS "LEVEL",
    (FLOOR((M.MISSION_XP + Q.QUIZ_XP) / 200) + 1) * 200 AS XP_NEXT_LEVEL
FROM (
    SELECT COUNT(*)                                             AS TOTAL_MISSIONS,
           SUM(CASE WHEN IS_COMPLETED = ''Y'' THEN 1 ELSE 0 END) AS COMPLETED_MISSIONS,
           NVL(SUM(TOTAL_XP_EARNED), 0)                         AS MISSION_XP,
           NVL(SUM(TOTAL_TIME_MINUTES), 0)                      AS TOTAL_TIME,
           ROUND(AVG(PROGRESS_PERCENT), 0)                      AS AVG_PROGRESS,
           ROUND(AVG(PRONUNCIATION_SCORE), 1)                   AS AVG_PRONUNCIATION,
           ROUND(AVG(GRAMMAR_SCORE), 1)                         AS AVG_GRAMMAR
      FROM USER_PROGRESS
     WHERE ID_INSCRIPCION = :id_inscripcion
) M
CROSS JOIN (
    -- Cuenta el mejor intento de cada quiz
    SELECT NVL(SUM(BEST_XP), 0) AS QUIZ_XP
      FROM (SELECT MAX(XP_EARNED) AS BEST_XP
              FROM QUIZ_ATTEMPTS
             WHERE ID_INSCRIPCION = :id_inscripcion
               AND STATUS = ''ENTREGADO''
             GROUP BY QUIZ_ID)
) Q'
      );

  COMMIT;
END;
/
