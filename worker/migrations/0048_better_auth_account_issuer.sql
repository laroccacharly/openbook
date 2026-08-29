-- Better Auth 1.7 scopes account identity by (issuer, accountId).
-- Credential accounts use issuer local:credential and the linked user id.

PRAGMA defer_foreign_keys = on;

CREATE TABLE "account_new" (
  "id" text not null primary key,
  "issuer" text not null,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
);

INSERT INTO "account_new" (
  "id",
  "issuer",
  "accountId",
  "providerId",
  "userId",
  "accessToken",
  "refreshToken",
  "idToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "scope",
  "password",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  CASE
    WHEN "providerId" = 'credential' THEN 'local:credential'
    ELSE 'local:oauth:' || "providerId"
  END,
  CASE
    WHEN "providerId" = 'credential' THEN "userId"
    ELSE "accountId"
  END,
  "providerId",
  "userId",
  "accessToken",
  "refreshToken",
  "idToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "scope",
  "password",
  "createdAt",
  "updatedAt"
FROM "account";

DROP TABLE "account";
ALTER TABLE "account_new" RENAME TO "account";

CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" ("issuer", "accountId");

PRAGMA defer_foreign_keys = off;
