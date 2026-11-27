-- Opening hours per day of the week + holiday dates.
-- weekly_hours: JSON array of 7 days (0 = Sunday … 6 = Saturday), each {"closed":false,"open":"07:00","close":"20:00"}.
--   Empty '' = not set yet → the Worker uses the old open_time / close_time for every day.
-- holidays: JSON array of "YYYY-MM-DD" dates when the shop is closed.
ALTER TABLE settings ADD COLUMN weekly_hours TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN holidays TEXT NOT NULL DEFAULT '[]';
