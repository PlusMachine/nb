CREATE TABLE IF NOT EXISTS "system_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" varchar(80) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
