--------------------------------------------------------
--  Ref Constraints for Table MISSIONS
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."MISSIONS" ADD CONSTRAINT "FK_MISSION_CURSO" FOREIGN KEY ("ID_CURSO")
	  REFERENCES "LUALARCON"."CURSOS" ("ID_CURSO") ENABLE;
  ALTER TABLE "LUALARCON"."MISSIONS" ADD CONSTRAINT "FK_MISSION_TOPIC" FOREIGN KEY ("TOPIC_ID")
	  REFERENCES "LUALARCON"."TOPICS" ("TOPIC_ID") ENABLE;
