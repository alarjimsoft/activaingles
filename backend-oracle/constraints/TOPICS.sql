--------------------------------------------------------
--  Ref Constraints for Table TOPICS
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."TOPICS" ADD CONSTRAINT "FK_CURSO" FOREIGN KEY ("COURSE_ID")
	  REFERENCES "LUALARCON"."CURSOS" ("ID_CURSO") ENABLE;
