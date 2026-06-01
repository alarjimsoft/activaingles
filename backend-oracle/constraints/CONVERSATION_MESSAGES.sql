--------------------------------------------------------
--  Ref Constraints for Table CONVERSATION_MESSAGES
--------------------------------------------------------

  ALTER TABLE "LUALARCON"."CONVERSATION_MESSAGES" ADD CONSTRAINT "FK_CONV_MESSAGES" FOREIGN KEY ("CONVERSATION_ID")
	  REFERENCES "LUALARCON"."CONVERSATIONS" ("CONVERSATION_ID") ENABLE;
