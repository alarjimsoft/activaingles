--------------------------------------------------------
--  Datos iniciales de QUIZZES: un quiz después de los temas 3, 6 y 9.
--  Se pueden volver a ejecutar: no duplica los que ya existen.
--  Los quizzes quedan sin versión publicada; el académico sube el Word desde el Content Manager.
--------------------------------------------------------

INSERT INTO QUIZZES (AFTER_TOPIC_ID, TITLE)
SELECT 3, 'Quiz 1 · Temas 1 a 3' FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM QUIZZES WHERE AFTER_TOPIC_ID = 3);

INSERT INTO QUIZZES (AFTER_TOPIC_ID, TITLE)
SELECT 6, 'Quiz 2 · Temas 4 a 6' FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM QUIZZES WHERE AFTER_TOPIC_ID = 6);

INSERT INTO QUIZZES (AFTER_TOPIC_ID, TITLE)
SELECT 9, 'Quiz 3 · Temas 7 a 9' FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM QUIZZES WHERE AFTER_TOPIC_ID = 9);

COMMIT;

SELECT Q.QUIZ_ID, Q.TITLE, Q.AFTER_TOPIC_ID, T.TITLE AS TOPIC_TITLE
  FROM QUIZZES Q JOIN TOPICS T ON T.TOPIC_ID = Q.AFTER_TOPIC_ID
 ORDER BY T.SORT_ORDER;
