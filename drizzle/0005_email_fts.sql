CREATE VIRTUAL TABLE IF NOT EXISTS email_fts USING fts5(
  thread_id UNINDEXED,
  subject,
  snippet,
  from_name,
  from_email,
  to_emails,
  label_names,
  tokenize='unicode61'
);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_threads_fts_delete
AFTER DELETE ON threads
BEGIN
  DELETE FROM email_fts WHERE thread_id = OLD.id;
END;
