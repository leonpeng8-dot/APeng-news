/**
 * POST   /api/ingest          写入 / 覆盖一份简报（cron 自动推送 + admin 页手动写入都走这里）
 * DELETE /api/ingest?id=<uuid> 删除一条简报（仅 admin）
 *
 * 为什么要有这个接口：
 *   原来 admin 页用前端公开的 publishable key 直连 Supabase 写库，等于「任何拿到这个 key
 *   的人都能往库里写」。改成走服务端：密钥只在服务器环境变量里，前端拿不到。
 *
 * 鉴权（二选一，都只在服务端比对）：
 *   x-ingest-token: <INGEST_TOKEN>   → cron 推送用
 *   x-admin-pass:   <ADMIN_PASS>     → admin 页用
 *
 * 依赖的环境变量（Vercel → Settings → Environment Variables）：
 *   SUPABASE_SERVICE_KEY  （Supabase → Settings → API → service_role secret，必填）
 *   INGEST_TOKEN          （自己起一个随机串，必填）
 *   ADMIN_PASS            （admin 页密码，默认 apeng2026）
 *   SUPABASE_URL          （可选，默认用项目地址）
 *
 * 写入是幂等的：同一天同一时段先删后插，cron 补发不会在网站上留下两份。
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vxlylfiyvorfcgxbympt.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASS = process.env.ADMIN_PASS || 'apeng2026';
const PERIODS = ['早间', '午间', '晚间', '夜间', '专题'];

function auth(req) {
  const ingest = req.headers['x-ingest-token'];
  const admin = req.headers['x-admin-pass'];
  if (process.env.INGEST_TOKEN && ingest && ingest === process.env.INGEST_TOKEN) return 'ingest';
  if (admin && admin === ADMIN_PASS) return 'admin';
  return null;
}

function sb(path, options) {
  return fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(options && options.headers)
    }
  });
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-ingest-token, x-admin-pass');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!SERVICE_KEY) {
    return res.status(500).json({
      ok: false,
      error: '缺少 SUPABASE_SERVICE_KEY 环境变量',
      hint: '在 Vercel 项目 → Settings → Environment Variables 添加后重新部署'
    });
  }

  const who = auth(req);
  if (!who) {
    return res.status(401).json({ ok: false, error: '鉴权失败：缺少或错误的 x-ingest-token / x-admin-pass' });
  }

  /* ---------- 删除（admin） ---------- */
  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || '';
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'id 不合法' });
    }
    if (who !== 'admin') return res.status(403).json({ ok: false, error: '只有 admin 能删除' });
    const r = await sb('/rest/v1/briefs?id=eq.' + id, { method: 'DELETE' });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: 'Supabase 删除失败 ' + r.status, detail: (await r.text()).slice(0, 300) });
    }
    return res.status(200).json({ ok: true, deleted: id });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: '只支持 POST / DELETE' });
  }

  /* ---------- 写入 / 覆盖 ---------- */
  const body = readBody(req);
  if (!body) return res.status(400).json({ ok: false, error: '请求体不是合法 JSON' });

  const date = String(body.date || '').trim();
  const period = String(body.period || '').trim();
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'date 必须是 YYYY-MM-DD' });
  if (PERIODS.indexOf(period) === -1) return res.status(400).json({ ok: false, error: 'period 必须是 ' + PERIODS.join('/') });
  if (!title) return res.status(400).json({ ok: false, error: 'title 不能为空' });
  if (content.length < 50) return res.status(400).json({ ok: false, error: 'content 太短（<50 字），疑似空稿，已拒绝写入' });

  const tags = Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t) => String(t).slice(0, 40)) : [];

  // 先删同一天同一时段的旧版 → 幂等覆盖（不依赖唯一约束，无需先改表结构）
  const del = await sb('/rest/v1/briefs?date=eq.' + date + '&period=eq.' + encodeURIComponent(period), { method: 'DELETE' });
  if (!del.ok) {
    return res.status(502).json({ ok: false, error: '清理旧版失败 ' + del.status, detail: (await del.text()).slice(0, 300) });
  }

  const ins = await sb('/rest/v1/briefs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ date, period, title, content, tags, is_public: body.is_public !== false }])
  });
  const text = await ins.text();
  if (!ins.ok) {
    return res.status(502).json({ ok: false, error: 'Supabase 写入失败 ' + ins.status, detail: text.slice(0, 400) });
  }

  let row = null;
  try { row = JSON.parse(text)[0]; } catch (e) {}

  return res.status(200).json({
    ok: true,
    by: who,
    id: row && row.id,
    date, period, title,
    chars: content.length,
    url: 'https://kailiao.cc/?period=' + encodeURIComponent(period)
  });
};
