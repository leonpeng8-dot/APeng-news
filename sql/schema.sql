-- ============================================
-- 阿鹏资讯站 数据库 Schema
-- 项目: APeng-news
-- Supabase: https://vxlylfiyvorfcgxbympt.supabase.co
-- ============================================

-- 简报/文章表
create table if not exists public.briefs (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  period text not null check (period in ('早间','午间','晚间','夜间','专题')),
  title text not null,
  content text not null,
  items jsonb,
  tags text[],
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 标注表（私密）
create table if not exists public.annotations (
  id uuid default gen_random_uuid() primary key,
  brief_id uuid references public.briefs(id) on delete cascade,
  selected_text text not null,
  annotation_type text not null check (annotation_type in ('star','important','track')),
  tags text[],
  note text,
  created_at timestamptz default now()
);

-- 追踪线索表
create table if not exists public.tracks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  tags text[],
  created_at timestamptz default now()
);

-- 追踪条目关联表
create table if not exists public.track_items (
  id uuid default gen_random_uuid() primary key,
  track_id uuid references public.tracks(id) on delete cascade,
  annotation_id uuid references public.annotations(id) on delete cascade,
  brief_id uuid references public.briefs(id) on delete cascade,
  created_at timestamptz default now()
);

-- ============================================
-- 索引
-- ============================================
create index if not exists idx_briefs_date on public.briefs(date desc);
create index if not exists idx_briefs_period on public.briefs(period);
create index if not exists idx_briefs_tags on public.briefs using gin(tags);
create index if not exists idx_annotations_brief on public.annotations(brief_id);
create index if not exists idx_annotations_type on public.annotations(annotation_type);
create index if not exists idx_annotations_tags on public.annotations using gin(tags);
create index if not exists idx_track_items_track on public.track_items(track_id);

-- ============================================
-- RLS 策略
-- 开发阶段：所有表公开可读写，生产环境请收紧
-- ============================================

-- briefs 表
alter table public.briefs enable row level security;
create policy "briefs_read_all" on public.briefs for select using (true);
create policy "briefs_write_all" on public.briefs for insert with check (true);
create policy "briefs_update_all" on public.briefs for update using (true) with check (true);
create policy "briefs_delete_all" on public.briefs for delete using (true);

-- annotations 表
alter table public.annotations enable row level security;
create policy "annotations_read_all" on public.annotations for select using (true);
create policy "annotations_write_all" on public.annotations for insert with check (true);
create policy "annotations_update_all" on public.annotations for update using (true) with check (true);
create policy "annotations_delete_all" on public.annotations for delete using (true);

-- tracks 表
alter table public.tracks enable row level security;
create policy "tracks_read_all" on public.tracks for select using (true);
create policy "tracks_write_all" on public.tracks for insert with check (true);
create policy "tracks_update_all" on public.tracks for update using (true) with check (true);
create policy "tracks_delete_all" on public.tracks for delete using (true);

-- track_items 表
alter table public.track_items enable row level security;
create policy "track_items_read_all" on public.track_items for select using (true);
create policy "track_items_write_all" on public.track_items for insert with check (true);
create policy "track_items_delete_all" on public.track_items for delete using (true);
