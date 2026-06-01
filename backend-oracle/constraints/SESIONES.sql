--------------------------------------------------------
--  Ref Constraints for Table SESIONES
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."SESIONES" ADD CONSTRAINT "FK_SESION_ESTUDIANTE" FOREIGN KEY ("MATRICULA")
	  REFERENCES "LUALARCON"."ESTUDIANTES" ("MATRICULA") ENABLE;
