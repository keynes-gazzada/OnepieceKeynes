BEGIN;
ALTER TABLE keynes.dreams ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0 CHECK (points IN (0,2,4));
ALTER TABLE keynes.dreams ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT '';
ALTER TABLE keynes.dreams ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS dreams_user_date_subject ON keynes.dreams(user_id,date,subject);
COMMIT;
