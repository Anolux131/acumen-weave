
ALTER TABLE public.agent_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS log_kind text NOT NULL DEFAULT 'status';
CREATE INDEX IF NOT EXISTS agent_logs_job_kind_idx ON public.agent_logs (job_id, log_kind, created_at);
