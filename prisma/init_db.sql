-- Bootstrap do banco do CRM LabAzul (equivalente ao `prisma db push` + seed dos estagios).
-- Pode ser rodado via n8n/Metabase antes mesmo do container subir.
-- Colunas em camelCase entre aspas para casar com o schema Prisma (sem drift no db push).
-- Idempotente: pode rodar mais de uma vez.
--
-- IMPORTANTE: a tabela public.leads_captura JA EXISTE (criada em 05/08/2026 pelo
-- workflow "LabAzul - Setup Leads Captura"). Este script NAO a recria nem a altera.

CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.users (
  "id"           text PRIMARY KEY,
  "name"         text NOT NULL,
  "email"        text NOT NULL UNIQUE,
  "passwordHash" text NOT NULL,
  "role"         text NOT NULL DEFAULT 'admin',
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.contacts (
  "id"          text PRIMARY KEY,
  "name"        text,
  "email"       text NOT NULL UNIQUE,
  "phone"       text,
  "source"      text,
  "src"         text,
  "sck"         text,
  "campaign"    text,
  "evento"      text,
  "isCliente"   boolean NOT NULL DEFAULT false,
  "ltv"         numeric(12,2) NOT NULL DEFAULT 0,
  "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_isCliente_idx ON crm.contacts ("isCliente");
CREATE INDEX IF NOT EXISTS contacts_source_idx    ON crm.contacts ("source");
CREATE INDEX IF NOT EXISTS contacts_evento_idx    ON crm.contacts ("evento");

CREATE TABLE IF NOT EXISTS crm.stages (
  "id"       text PRIMARY KEY,
  "name"     text NOT NULL,
  "position" integer NOT NULL UNIQUE,
  "color"    text,
  "isWon"    boolean NOT NULL DEFAULT false,
  "isLost"   boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS crm.deals (
  "id"        text PRIMARY KEY,
  "contactId" text NOT NULL REFERENCES crm.contacts("id") ON DELETE CASCADE,
  "stageId"   text NOT NULL REFERENCES crm.stages("id"),
  "value"     numeric(12,2) NOT NULL DEFAULT 0,
  "status"    text NOT NULL DEFAULT 'open',
  "movedAt"   timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deals_stageId_idx   ON crm.deals ("stageId");
CREATE INDEX IF NOT EXISTS deals_contactId_idx ON crm.deals ("contactId");

CREATE TABLE IF NOT EXISTS crm.activities (
  "id"        text PRIMARY KEY,
  "contactId" text NOT NULL REFERENCES crm.contacts("id") ON DELETE CASCADE,
  "type"      text NOT NULL,
  "text"      text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_contactId_idx ON crm.activities ("contactId");
CREATE INDEX IF NOT EXISTS activities_type_idx      ON crm.activities ("type");

-- Trava anti-LTV-dobrado: uma compra por contato+texto.
-- Pix e boleto parcelado disparam o mesmo evento varias vezes; sem esta trava
-- o LTV dobra. Foi o erro que custou caro no CRM do Abel.
CREATE UNIQUE INDEX IF NOT EXISTS activities_compra_uniq
  ON crm.activities ("contactId", "text") WHERE "type" = 'compra';

-- ---------------------------------------------------------------------------
-- Estagios do pipeline da LabAzul (SPEC §5)
-- Uma unica automacao: o lead entra em "Nao comprou" apos 2h sem venda.
-- O resto e a equipe arrastando o card.
-- ---------------------------------------------------------------------------
INSERT INTO crm.stages ("id","name","position","color","isWon","isLost") VALUES
  (gen_random_uuid()::text, 'Não comprou', 1, '#2052E9', false, false),
  (gen_random_uuid()::text, 'Em contato',  2, '#30E2FF', false, false),
  (gen_random_uuid()::text, 'Respondeu',   3, '#12307D', false, false),
  (gen_random_uuid()::text, 'Comprou',     4, '#16A34A', true,  false),
  (gen_random_uuid()::text, 'Perdido',     5, '#DC2626', false, true)
ON CONFLICT ("position") DO NOTHING;
