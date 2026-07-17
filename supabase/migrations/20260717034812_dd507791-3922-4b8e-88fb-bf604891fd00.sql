
-- Enum types for constrained columns
CREATE TYPE public.job_status AS ENUM ('pending', 'planning', 'researching', 'processing', 'generating', 'complete', 'failed');
CREATE TYPE public.analysis_depth AS ENUM ('quick', 'executive', 'comprehensive');
CREATE TYPE public.section_status AS ENUM ('pending', 'running', 'complete', 'failed');
CREATE TYPE public.report_type AS ENUM ('full_dossier', 'executive_brief', 'vulnerability_dossier');
CREATE TYPE public.buying_role AS ENUM ('primary_buyer', 'champion', 'influencer', 'blocker', 'end_user', 'executive_sponsor');
CREATE TYPE public.outreach_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.log_status AS ENUM ('started', 'working', 'done', 'error');

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- research_jobs
CREATE TABLE public.research_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_url TEXT,
  industry TEXT,
  status public.job_status NOT NULL DEFAULT 'pending',
  analysis_depth public.analysis_depth NOT NULL DEFAULT 'comprehensive',
  progress_percentage INTEGER NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  current_phase TEXT NOT NULL DEFAULT '',
  current_agent TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  total_sections INTEGER NOT NULL DEFAULT 14,
  completed_sections INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_jobs TO authenticated;
GRANT ALL ON public.research_jobs TO service_role;
ALTER TABLE public.research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own research jobs" ON public.research_jobs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_research_jobs_updated BEFORE UPDATE ON public.research_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_research_jobs_user_created ON public.research_jobs(user_id, created_at DESC);

-- section_results
CREATE TABLE public.section_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL CHECK (section_number BETWEEN 1 AND 14),
  section_name TEXT NOT NULL,
  status public.section_status NOT NULL DEFAULT 'pending',
  raw_research JSONB,
  analyzed_content TEXT,
  key_findings JSONB,
  confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  data_sources JSONB,
  search_queries_used JSONB,
  pages_scraped INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  processing_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, section_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_results TO authenticated;
GRANT ALL ON public.section_results TO service_role;
ALTER TABLE public.section_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own section results" ON public.section_results FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_section_results_updated BEFORE UPDATE ON public.section_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_section_results_job ON public.section_results(job_id, section_number);

-- reports
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type public.report_type NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  markdown_content TEXT,
  html_content TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reports" ON public.reports FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_reports_job ON public.reports(job_id);

-- contacts
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  full_name TEXT,
  job_title TEXT,
  department TEXT,
  seniority_level TEXT,
  email TEXT,
  email_confidence INTEGER,
  linkedin_url TEXT,
  twitter_handle TEXT,
  buying_role public.buying_role,
  outreach_priority public.outreach_priority,
  suggested_hook TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contacts" ON public.contacts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_contacts_job ON public.contacts(job_id);

-- agent_logs
CREATE TABLE public.agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.research_jobs(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  status public.log_status NOT NULL DEFAULT 'started',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_logs TO authenticated;
GRANT ALL ON public.agent_logs TO service_role;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own job logs" ON public.agent_logs FOR SELECT
  USING (job_id IN (SELECT id FROM public.research_jobs WHERE user_id = auth.uid()));
CREATE POLICY "Users insert own job logs" ON public.agent_logs FOR INSERT
  WITH CHECK (job_id IN (SELECT id FROM public.research_jobs WHERE user_id = auth.uid()));
CREATE INDEX idx_agent_logs_job_created ON public.agent_logs(job_id, created_at ASC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.research_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.section_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;
