--------------------------------------------------------
--  Ref Constraints for Table SPEAKING_ANALYSIS
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."SPEAKING_ANALYSIS" ADD CONSTRAINT "FK_ANALYSIS_MESSAGE" FOREIGN KEY ("MESSAGE_ID")
	  REFERENCES "LUALARCON"."MESSAGES" ("MESSAGE_ID") ENABLE;
