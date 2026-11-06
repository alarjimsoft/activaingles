--------------------------------------------------------
--  Datos iniciales de QUIZZES: un quiz despues de los temas 3, 6 y 9.
--  Se puede volver a ejecutar: crea los que falten y corrige el titulo de los que existen.
--  Los quizzes quedan sin version publicada; el academico sube el Word desde el Content Manager.
--
--  Los textos usan solo caracteres ASCII; el punto medio se escribe con UNISTR('\00B7').
--  Asi el resultado es el mismo aunque Database Actions lea el archivo con otra codificacion.
--------------------------------------------------------

MERGE INTO QUIZZES Q
USING (
    SELECT 3 AS AFTER_TOPIC_ID, 'Quiz 1 ' || UNISTR('\00B7') || ' Temas 1 a 3' AS TITLE FROM DUAL UNION ALL
    SELECT 6,                   'Quiz 2 ' || UNISTR('\00B7') || ' Temas 4 a 6'          FROM DUAL UNION ALL
    SELECT 9,                   'Quiz 3 ' || UNISTR('\00B7') || ' Temas 7 a 9'          FROM DUAL
) S
ON (Q.AFTER_TOPIC_ID = S.AFTER_TOPIC_ID)
WHEN MATCHED THEN UPDATE SET Q.TITLE = S.TITLE, Q.UPDATED_AT = SYSTIMESTAMP
WHEN NOT MATCHED THEN INSERT (AFTER_TOPIC_ID, TITLE) VALUES (S.AFTER_TOPIC_ID, S.TITLE);

COMMIT;

-- LENGTH debe ser 20 en los tres (si sale 21, el titulo quedo con caracteres mal leidos)
SELECT Q.QUIZ_ID, Q.TITLE, LENGTH(Q.TITLE) AS LENGTH, Q.AFTER_TOPIC_ID, T.TITLE AS TOPIC_TITLE
  FROM QUIZZES Q JOIN TOPICS T ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
 ORDER BY T.SORT_ORDER;
