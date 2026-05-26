CREATE TABLE "Conversation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"userId" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Document" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"userId" text NOT NULL,
	"fileName" text NOT NULL,
	"fileKey" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) DEFAULT now() NOT NULL,
	"contentHash" text,
	"version" integer DEFAULT 1 NOT NULL,
	"validUntil" timestamp (3),
	"documentType" text DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Embedding" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"documentId" text NOT NULL,
	"chunkIndex" integer NOT NULL,
	"chunkText" text NOT NULL,
	"embedding" vector(1024),
	"tokenCount" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversationId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_documentId_Document_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_Conversation_id_fk" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "Conversation_userId_idx" ON "Conversation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Embedding_documentId_idx" ON "Embedding" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "Embedding_embedding_idx" ON "Embedding" USING ivfflat ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "Message_conversationId_idx" ON "Message" USING btree ("conversationId");