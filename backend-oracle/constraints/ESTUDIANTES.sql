--------------------------------------------------------
--  Ref Constraints for Table ESTUDIANTES
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."ESTUDIANTES" ADD CONSTRAINT "ESTUDIANTES_FK1" FOREIGN KEY ("CARRERA")
	  REFERENCES "LUALARCON"."CARRERAS" ("ID_CARRERA") ENABLE NOVALIDATE;
