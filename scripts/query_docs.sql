SELECT "fileName", status, "metadata"->>'stepName' as step FROM "Document" WHERE "createdAt" > '2026-06-20' ORDER BY "createdAt" DESC LIMIT 10;
