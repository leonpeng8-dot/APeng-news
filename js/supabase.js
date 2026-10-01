/**
 * 阿鹏资讯站 - Supabase 数据库操作层 v2.0
 * 封装所有数据库 CRUD 操作
 * 逻辑不变，适配新前端
 */

const SUPABASE_URL = 'https://vxlylfiyvorfcgxbympt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cQdNwcX_i9NInAVCzUmWgQ_GJUMptIH';

let sb = null;

function initSupabase() {
  if (sb) return sb;
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } else {
    console.error('Supabase SDK 未加载');
  }
  return sb;
}

function getClient() {
  if (!sb) initSupabase();
  if (!sb) throw new Error('Supabase 客户端未初始化');
  return sb;
}

// ============================================
// 简报操作
// ============================================

/** 获取今日简报 */
async function fetchTodayBriefs() {
  var today = new Date().toISOString().split('T')[0];
  return fetchBriefsByDate(today);
}

/** 按日期获取简报 */
async function fetchBriefsByDate(date) {
  var client = getClient();
  var result = await client
    .from('briefs')
    .select('*')
    .eq('date', date)
    .eq('is_public', true)
    .order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

/** 获取最近 N 天的简报 */
async function fetchRecentBriefs(days) {
  days = days || 7;
  var client = getClient();
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  var startDateStr = startDate.toISOString().split('T')[0];
  var result = await client
    .from('briefs')
    .select('*')
    .gte('date', startDateStr)
    .eq('is_public', true)
    .order('date', { ascending: false })
    .order('created_at', { ascending: true });
  if (result.error) throw result.error;
  return result.data || [];
}

/** 获取所有简报（分页） */
async function fetchAllBriefs(page, perPage) {
  page = page || 1;
  perPage = perPage || 50;
  var client = getClient();
  var from = (page - 1) * perPage;
  var to = from + perPage - 1;
  var result = await client
    .from('briefs')
    .select('*', { count: 'exact' })
    .eq('is_public', true)
    .order('date', { ascending: false })
    .order('created_at', { ascending: true })
    .range(from, to);
  if (result.error) throw result.error;
  return { data: result.data || [], total: result.count || 0 };
}

/** 按关键词搜索简报 */
async function searchBriefs(keyword) {
  var client = getClient();
  var result = await client
    .from('briefs')
    .select('*')
    .or('title.ilike.%' + keyword + '%,content.ilike.%' + keyword + '%')
    .eq('is_public', true)
    .order('date', { ascending: false })
    .limit(50);
  if (result.error) throw result.error;
  return result.data || [];
}

/** 获取单个简报 */
async function fetchBrief(id) {
  var client = getClient();
  var result = await client
    .from('briefs')
    .select('*')
    .eq('id', id)
    .single();
  if (result.error) throw result.error;
  return result.data;
}

/** 写入简报 */
async function insertBrief(brief) {
  var client = getClient();
  var result = await client
    .from('briefs')
    .insert([{
      date: brief.date,
      period: brief.period,
      title: brief.title,
      content: brief.content,
      items: brief.items || null,
      tags: brief.tags || [],
      is_public: brief.is_public !== false
    }])
    .select();
  if (result.error) throw result.error;
  return result.data[0];
}

// ============================================
// 标注操作
// ============================================

/** 添加标注 */
async function insertAnnotation(annotation) {
  var client = getClient();
  var result = await client
    .from('annotations')
    .insert([{
      brief_id: annotation.brief_id || null,
      selected_text: annotation.selected_text,
      annotation_type: annotation.annotation_type,
      tags: annotation.tags || [],
      note: annotation.note || null
    }])
    .select();
  if (result.error) throw result.error;
  return result.data[0];
}

/** 获取所有标注 */
async function fetchAnnotations(filter) {
  filter = filter || {};
  var client = getClient();
  var query = client.from('annotations').select('*, briefs(*)').order('created_at', { ascending: false });
  if (filter.type) query = query.eq('annotation_type', filter.type);
  if (filter.tag) query = query.contains('tags', [filter.tag]);
  if (filter.briefId) query = query.eq('brief_id', filter.briefId);
  var result = await query;
  if (result.error) throw result.error;
  return result.data || [];
}

/** 搜索标注 */
async function searchAnnotations(keyword) {
  var client = getClient();
  var result = await client
    .from('annotations')
    .select('*, briefs(*)')
    .or('selected_text.ilike.%' + keyword + '%,note.ilike.%' + keyword + '%')
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

/** 删除标注 */
async function deleteAnnotation(id) {
  var client = getClient();
  var result = await client.from('annotations').delete().eq('id', id);
  if (result.error) throw result.error;
}

/** 更新标注 */
async function updateAnnotation(id, updates) {
  var client = getClient();
  var result = await client
    .from('annotations')
    .update(updates)
    .eq('id', id)
    .select();
  if (result.error) throw result.error;
  return result.data[0];
}

// ============================================
// 追踪线索操作
// ============================================

/** 获取所有追踪线索 */
async function fetchTracks() {
  var client = getClient();
  var result = await client
    .from('tracks')
    .select('*')
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

/** 创建追踪线索 */
async function insertTrack(track) {
  var client = getClient();
  var result = await client
    .from('tracks')
    .insert([{
      name: track.name,
      description: track.description || null,
      tags: track.tags || []
    }])
    .select();
  if (result.error) throw result.error;
  return result.data[0];
}

/** 获取追踪条目 */
async function fetchTrackItems(trackId) {
  var client = getClient();
  var result = await client
    .from('track_items')
    .select('*, annotations(*), briefs(*)')
    .eq('track_id', trackId)
    .order('created_at', { ascending: false });
  if (result.error) throw result.error;
  return result.data || [];
}

/** 添加追踪条目 */
async function insertTrackItem(item) {
  var client = getClient();
  var result = await client
    .from('track_items')
    .insert([{
      track_id: item.track_id,
      annotation_id: item.annotation_id || null,
      brief_id: item.brief_id || null
    }])
    .select();
  if (result.error) throw result.error;
  return result.data[0];
}

// ============================================
// 统计
// ============================================

/** 获取标注数量统计 */
async function fetchAnnotationStats() {
  var client = getClient();
  var result = await client
    .from('annotations')
    .select('annotation_type');
  if (result.error) throw result.error;
  var stats = { star: 0, important: 0, track: 0, total: 0 };
  (result.data || []).forEach(function(item) {
    if (stats[item.annotation_type] !== undefined) stats[item.annotation_type]++;
    stats.total++;
  });
  return stats;
}

// 导出到全局
window.DB = {
  initSupabase: initSupabase,
  fetchTodayBriefs: fetchTodayBriefs,
  fetchBriefsByDate: fetchBriefsByDate,
  fetchRecentBriefs: fetchRecentBriefs,
  fetchAllBriefs: fetchAllBriefs,
  searchBriefs: searchBriefs,
  fetchBrief: fetchBrief,
  insertBrief: insertBrief,
  insertAnnotation: insertAnnotation,
  fetchAnnotations: fetchAnnotations,
  searchAnnotations: searchAnnotations,
  deleteAnnotation: deleteAnnotation,
  updateAnnotation: updateAnnotation,
  fetchTracks: fetchTracks,
  insertTrack: insertTrack,
  fetchTrackItems: fetchTrackItems,
  insertTrackItem: insertTrackItem,
  fetchAnnotationStats: fetchAnnotationStats
};
