PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mirror_cards (
  id TEXT PRIMARY KEY,
  sourceKey TEXT NOT NULL UNIQUE,
  quoteText TEXT NOT NULL,
  category TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  firstSeenAt INTEGER NOT NULL,
  lastSeenAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mirror_cards_active_position ON mirror_cards(active, position);
CREATE INDEX IF NOT EXISTS mirror_cards_category_position ON mirror_cards(category, position);

CREATE TABLE IF NOT EXISTS mirror_flips (
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  cardId TEXT NOT NULL,
  firstFlippedAt INTEGER NOT NULL,
  rewardUnits INTEGER NOT NULL DEFAULT 0,
  batterySettled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(ownerType, ownerId, cardId)
);
CREATE INDEX IF NOT EXISTS mirror_flips_owner_time ON mirror_flips(ownerType, ownerId, firstFlippedAt DESC);

CREATE TABLE IF NOT EXISTS mirror_favorites (
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  cardId TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  firstFavoritedAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  rewardUnits INTEGER NOT NULL DEFAULT 0,
  batterySettled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(ownerType, ownerId, cardId)
);
CREATE INDEX IF NOT EXISTS mirror_favorites_owner_active ON mirror_favorites(ownerType, ownerId, active, updatedAt DESC);

CREATE TABLE IF NOT EXISTS mirror_daily_usage (
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  day TEXT NOT NULL,
  drawCount INTEGER NOT NULL DEFAULT 0,
  aiCount INTEGER NOT NULL DEFAULT 0,
  favoriteRewardUnits INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(ownerType, ownerId, day)
);

-- Only one in-flight reading per signed-in member per Taiwan calendar day.
-- Expired locks recover safely after Worker interruption.
CREATE TABLE IF NOT EXISTS mirror_ai_attempt_locks (
  ownerId TEXT NOT NULL,
  day TEXT NOT NULL,
  attemptId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY(ownerId, day)
);
CREATE INDEX IF NOT EXISTS mirror_ai_attempt_locks_expiry ON mirror_ai_attempt_locks(expiresAt);

CREATE TABLE IF NOT EXISTS mirror_ai_readings (
  id TEXT PRIMARY KEY,
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  cardId TEXT NOT NULL,
  quoteText TEXT NOT NULL,
  direction TEXT NOT NULL,
  resultText TEXT NOT NULL,
  model TEXT NOT NULL,
  costUnits INTEGER NOT NULL DEFAULT 0,
  batterySettled INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mirror_ai_readings_owner_time ON mirror_ai_readings(ownerType, ownerId, createdAt DESC);
CREATE INDEX IF NOT EXISTS mirror_ai_readings_card_time ON mirror_ai_readings(cardId, createdAt DESC);

CREATE TABLE IF NOT EXISTS mirror_ai_ratings (
  readingId TEXT NOT NULL,
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  vote INTEGER NOT NULL CHECK(vote IN (-1,1)),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(readingId, ownerType, ownerId)
);
CREATE INDEX IF NOT EXISTS mirror_ai_ratings_vote ON mirror_ai_ratings(vote, updatedAt DESC);

CREATE TABLE IF NOT EXISTS mirror_ai_reading_members (
  readingId TEXT PRIMARY KEY,
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  memberName TEXT NOT NULL,
  memberRank TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mirror_share_events (
  operationId TEXT PRIMARY KEY,
  ownerType TEXT NOT NULL CHECK(ownerType IN ('user','device')),
  ownerId TEXT NOT NULL,
  cardId TEXT,
  costUnits INTEGER NOT NULL DEFAULT 0,
  batterySettled INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mirror_share_events_owner_time ON mirror_share_events(ownerType, ownerId, createdAt DESC);

CREATE TABLE IF NOT EXISTS mirror_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS mirror_admin_audit (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS mirror_admin_audit_time ON mirror_admin_audit(createdAt DESC);

CREATE TABLE IF NOT EXISTS mirror_sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
