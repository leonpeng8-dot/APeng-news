/**
 * 热榜聚合代理（服务端）
 * 主源：api.codelife.cc 实时热榜（微博/知乎/百度/B站/36氪）
 * 备源：weibo.com 官方热搜接口
 * 出口在 Vercel（海外 IP），避免浏览器跨域与国内直连不稳的问题。
 */
const BOARDS = [
  { key: 'weibo', name: '微博热搜', id: 'KqndgxeLl9' },
  { key: 'zhihu', name: '知乎热榜', id: 'mproPpoq6O' },
  { key: 'baidu', name: '百度热搜', id: 'Jb0vmloB1G' },
  { key: 'bilibili', name: 'B站热搜', id: '74KvxwokxM' },
  { key: 'kr36', name: '36氪热榜', id: 'Q1Vd5Ko85R' }
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fromCodelife(json) {
  const list = json && json.data;
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      rank: Number(item.index) || 0,
      title: String(item.title || '').trim(),
      hot: String(item.hotValue || '').trim(),
      url: item.link || ''
    }))
    .filter((x) => x.title)
    .slice(0, 30);
}

async function fetchBoard(board) {
  const json = await getJson(`https://api.codelife.cc/api/top/list?lang=cn&id=${board.id}`);
  let list = fromCodelife(json);
  if (!list.length && board.key === 'weibo') {
    const official = await getJson('https://weibo.com/ajax/side/hotSearch');
    const rows = (official && official.data && official.data.realtime) || [];
    list = rows
      .map((item, i) => ({
        rank: i + 1,
        title: String(item.word || item.note || '').trim(),
        hot: String(item.num || item.raw_hot || '').trim(),
        url: item.word_scheme ? 'https://s.weibo.com/weibo?q=' + encodeURIComponent(item.word_scheme) : ''
      }))
      .filter((x) => x.title)
      .slice(0, 30);
  }
  list.forEach((item) => { item.source = board.key; });
  return { key: board.key, name: board.name, list };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const results = await Promise.all(BOARDS.map(fetchBoard));
  const boards = {};
  const payload = { updatedAt: new Date().toISOString() };
  results.forEach((b) => {
    boards[b.key] = b.list;
    payload[b.key] = b.list;
    payload[b.key + '_name'] = b.name;
  });
  payload.boards = boards;
  res.status(200).json(payload);
};
