CREATE TABLE "WrongAnswer" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"userId" text NOT NULL,
	"conversationId" text,
	"agentLogId" text,
	"query" text NOT NULL,
	"wrongAnswer" text NOT NULL,
	"correctAnswer" text,
	"errorType" text DEFAULT 'other' NOT NULL,
	"toolsUsed" text,
	"model" text,
	"iterations" integer DEFAULT 0,
	"note" text,
	"resolved" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Document" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "WrongAnswer" ADD CONSTRAINT "WrongAnswer_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "WrongAnswer_userId_idx" ON "WrongAnswer" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "WrongAnswer_errorType_idx" ON "WrongAnswer" USING btree ("errorType");--> statement-breakpoint
CREATE INDEX "WrongAnswer_resolved_idx" ON "WrongAnswer" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "WrongAnswer_createdAt_idx" ON "WrongAnswer" USING btree ("createdAt");