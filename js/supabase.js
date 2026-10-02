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

/** 本地日期（YYYY-MM-DD）
 *  v3.1 修复：原来用 toISOString() 取的是 UTC 日期。中国时区（UTC+8）在
 *  00:00-08:00 之间 UTC 还停在昨天，导致早上 7:30 那份简报被当成「昨天的」而不显示，
 *  要等到 08:00 之后才出现。这里改用本地时区。
 */
function localDateStr(d) {
  d = d || new Date();
  var p = function (n) { return String(n).length < 2 ? '0' + n : String(n); };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 获取今日简报 */
async function fetchTodayBriefs() {
  return fetchBriefsByDate(localDateStr());
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

/** 添加标注（本机隔离，不再写入公共表） */
async function insertAnnotation(annotation) {
  if (typeof UserStore === 'undefined') throw new Error('UserStore 未加载');
  return UserStore.toggleAnnotation(annotation).record;
}

/** 获取当前访客的标注 */
async function fetchAnnotations(filter) {
  if (typeof UserStore === 'undefined') return [];
  return UserStore.listAnnotations(filter || {});
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
  if (typeof UserStore !== 'undefined') {
    UserStore.deleteAnnotation(id);
    return;
  }
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

/** 获取当前访客的追踪线索 */
async function fetchTracks() {
  if (typeof UserStore !== 'undefined') {
    return UserStore.listTracks();
  }
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
  if (typeof UserStore !== 'undefined') {
    return UserStore.stats();
  }
  return { star: 0, important: 0, track: 0, total: 0 };
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
