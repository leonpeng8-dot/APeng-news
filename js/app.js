/**
 * 阿鹏资讯站 - 主应用逻辑 v3.0
 *
 * v3 变化（按阿鹏的反馈重做）：
 * 1. 板块化渲染：先「🔥 热榜速览」→「⚡ 深度信息差」，其余按固定板块分区呈现
 * 2. 每条消息是一个独立条目，右下角带 收藏/重点/追踪/存Obsidian 按钮（带文字）
 * 3. 条目按重要度排序、跨板块去重
 * 4. 该有图表的地方给图表（数值型表格 / 热榜热度），不该有就不给
 * 5. 重点内容自动上色加粗（数字、涨跌、⚠️💡、「」）
 * 6. 收藏/重点/追踪存在本机（UserStore），访客之间互不影响
 */

const App = (function () {

  const state = {
    view: 'today',
    period: 'all',
    searchKeyword: '',
    briefs: [],
    annotations: [],
    tracks: [],
    annoFilter: 'all',
    annoSearchKey: '',
    hot: null,
    expandedBriefs: new Set()
  };

  /* ============================================
     板块注册表（数组顺序 = 页面呈现顺序，也决定归类优先级：先匹配到的赢）
     v3.1：同步 v6.0 简报的板块名。注意规则顺序 ——
       · 「心理与行为研究 — 内容创作的底层逻辑」含「内容创作」，必须排在 creator 之前，
         否则会被抢进创作者经济板块；
       · 「社会情绪与叙事」含「情绪/叙事」，若不单独成块会掉进「心理/认知」；
       · 「政策与监管信号」不能被 world 的 /政治/ 抢走（注意「政策」≠「政治」）。
     ============================================ */
  const SECTIONS = [
    { id: 'apeng_hot', name: '🔥 阿鹏热榜', icon: '🔥', priority: 10, re: /阿鹏热榜|热榜|热搜|在聊什么/ },
    { id: 'signal', name: '⚡ 深度信号', icon: '⚡', priority: 9, re: /深度信号|深度|信息差/ },
    { id: 'mood', name: '🧠 社会情绪', icon: '🧠', priority: 8, re: /社会情绪|情绪与叙事|焦虑|社会叙事/ },
    { id: 'mind', name: '🧠 心理与行为', icon: '🧠', priority: 6, re: /心理与行为|行为研究|心理学|注意力窗口|上瘾机制/ },
    { id: 'creator', name: '🎥 创作者经济', icon: '🎥', priority: 7, re: /创作者经济|平台动态|创作者|自媒体/ },
    { id: 'fx', name: '💱 汇率与跨境资金', icon: '💱', priority: 7, re: /汇率|跨境资金|离岸|在岸/ },
    { id: 'market', name: '📈 市场数据', icon: '📈', priority: 7, re: /市场|A股|美股|港股|收盘|盘中|加密|币圈|大宗|商品|黄金|白银|原油|大豆|玉米|利率|债|基金/ },
    { id: 'tools', name: '🔧 工具与效率', icon: '🔧', priority: 6, re: /工具与效率|工具更新|效率更新/ },
    { id: 'ai_tools', name: '🚀 AI工具/产品', icon: '🚀', priority: 6, re: /AI工具|AI产品|AI 工具/ },
    { id: 'ai', name: '🚀 AI大事件', icon: '🚀', priority: 7, re: /AI大事件|大事件|人工智能|大模型|AI发现|该知道|模型/ },
    { id: 'tech', name: '🚀 科技', icon: '🚀', priority: 6, re: /科技|技术|开发者|芯片|半导体|开源/ },
    { id: 'startup', name: '🚀 初创/融资', icon: '🚀', priority: 6, re: /初创|融资/ },
    { id: 'estate', name: '🏠 房地产', icon: '🏠', priority: 6, re: /房地产|地产|房产|楼市|房价/ },
    { id: 'sports', name: '⚽ 体育/电竞', icon: '⚽', priority: 6, re: /体育|电竞|赛事/ },
    { id: 'ent', name: '🎬 娱乐', icon: '🎬', priority: 5, re: /娱乐|影视|综艺|明星|游戏|演唱会|电影|票房|音乐/ },
    { id: 'world', name: '🌍 国际/政治/社会', icon: '🌍', priority: 5, re: /国际|政治|社会|地缘|外交|冲突/ },
    { id: 'policy', name: '📋 政策与监管', icon: '📋', priority: 6, re: /政策|监管|合规|法规|条例/ },
    { id: 'books', name: '📚 书籍/知识', icon: '📚', priority: 4, re: /书籍|知识|书单|阅读|新书/ },
    { id: 'brief', name: '📌 今日速览', icon: '📌', priority: 8, re: /一句话|速览|总结|视角|导读|综述|概览/ },
    { id: 'action', name: '💎 行动建议', icon: '💎', priority: 3, re: /行动|建议|预告|明日|待办|要做/ },
    { id: 'gap', name: '⚠️ 数据缺口', icon: '⚠️', priority: 2, re: /数据缺口|缺口|说明|备注/ },
    { id: 'other', name: '🧩 其他', icon: '🧩', priority: 1, re: null }
  ];

  /* 平台热榜聚合：外部聚合站，只放一条外链，不展开内容（与「阿鹏热榜」是两个东西） */
  const PLATFORM_HOT = {
    title: '各大平台热榜聚合站：',
    url: 'https://www.redian.me/',
    label: 'redian.me'
  };

  const PERIOD_WEIGHT = { '早间': 1.5, '午间': 2, '晚间': 2.5, '夜间': 3, '专题': 1 };

  let dom = {};
  let sectionMap = {};

  /* ============================================
     初始化
     ============================================ */
  function init() {
    const ua = navigator.userAgent || '';
    const root = document.documentElement;
    root.classList.toggle('is-wechat', /MicroMessenger/i.test(ua));
    root.classList.toggle('is-quark', /Quark/i.test(ua));
    root.classList.toggle('is-uc', /UCBrowser|MQQBrowser/i.test(ua));
    root.classList.toggle('is-mobile', /Mobile|Android|iPhone|iPad|iPod/i.test(ua));

    SECTIONS.forEach(function (s) { sectionMap[s.id] = s; });

    cacheDom();
    bindEvents();
    initSupabase();
    configMarked();
    setTodayDate();
    loadToday();
    loadSidebarCounts();
  }

  function cacheDom() {
    dom.mainContent = document.getElementById('mainContent');
    dom.mainTitle = document.getElementById('mainTitle');
    dom.periodTabs = document.getElementById('periodTabs');
    dom.searchInput = document.getElementById('searchInput');
    dom.sidebar = document.getElementById('sidebar');
    dom.sidebarOverlay = document.getElementById('sidebarOverlay');
    dom.dateToday = document.getElementById('dateToday');
    dom.navItems = document.querySelectorAll('.nav-item[data-view]');
    dom.mobileNavBtns = document.querySelectorAll('.mobile-nav .nav-btn');
    dom.menuBtn = document.getElementById('menuBtn');
  }

  function bindEvents() {
    dom.navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        navigateTo(item.getAttribute('data-view'));
        closeSidebar();
      });
    });
    dom.mobileNavBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigateTo(btn.getAttribute('data-view'));
      });
    });
    if (dom.menuBtn) dom.menuBtn.addEventListener('click', toggleSidebar);
    if (dom.sidebarOverlay) dom.sidebarOverlay.addEventListener('click', closeSidebar);

    if (dom.searchInput) {
      let timer = null;
      dom.searchInput.addEventListener('input', function () {
        clearTimeout(timer);
        const kw = dom.searchInput.value.trim();
        timer = setTimeout(function () {
          if (kw.length >= 2) {
            state.searchKeyword = kw;
            handleSearch(kw);
          } else if (kw.length === 0 && state.view !== 'search') {
            state.searchKeyword = '';
          }
        }, 400);
      });
      dom.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          const kw = dom.searchInput.value.trim();
          if (kw) { state.searchKeyword = kw; handleSearch(kw); }
        }
      });
    }

    const logo = document.querySelector('.topbar .logo');
    if (logo) logo.addEventListener('click', function () { navigateTo('today'); });

    /* 归档里折叠卡片展开 */
    dom.mainContent.addEventListener('click', function (e) {
      const toggle = e.target.closest('.brief-toggle');
      if (toggle) {
        const card = toggle.closest('.brief-card');
        if (!card) return;
        card.classList.toggle('expanded');
        const briefId = card.getAttribute('data-brief-id');
        if (card.classList.contains('expanded')) {
          state.expandedBriefs.add(briefId);
          const brief = state.briefs.find(function (b) { return String(b.id) === briefId; });
          if (brief) {
            renderBriefDetail(card.querySelector('.brief-detail'), brief);
            Annotation.bindAllIn(card);
          }
        } else {
          state.expandedBriefs.delete(briefId);
        }
        return;
      }
      /* 板块折叠 */
      const head = e.target.closest('.section-head');
      if (head) {
        const sec = head.closest('.section');
        if (sec) sec.classList.toggle('collapsed');
      }
    });

    /* 热榜来源切换 */
    dom.mainContent.addEventListener('click', function (e) {
      const tab = e.target.closest('.hot-tab');
      if (!tab) return;
      const boardKey = tab.getAttribute('data-board');
      const wrap = tab.closest('.section');
      wrap.querySelectorAll('.hot-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      wrap.querySelectorAll('.hot-list').forEach(function (l) {
        l.style.display = l.getAttribute('data-board') === boardKey ? 'block' : 'none';
      });
    });

    /* 热榜「展开全部」 */
    dom.mainContent.addEventListener('click', function (e) {
      const btn = e.target.closest('.hot-more');
      if (!btn) return;
      const list = btn.closest('.hot-list');
      list.classList.toggle('open');
      btn.textContent = list.classList.contains('open') ? '收起' : '展开全部';
    });
  }

  function initSupabase() {
    if (typeof DB !== 'undefined' && DB.initSupabase) DB.initSupabase();
  }

  function configMarked() {
    if (typeof marked !== 'undefined' && marked.setOptions) {
      marked.setOptions({ breaks: true, gfm: true });
    }
  }

  /* ============================================
     导航
     ============================================ */
  function navigateTo(view) {
    state.view = view;
    updateActiveNav(view);
    switch (view) {
      case 'today': loadToday(); break;
      case 'archive': loadArchive(); break;
      case 'collections': loadCollections(); break;
      case 'tracks': loadTracks(); break;
    }
  }

  function updateActiveNav(view) {
    dom.navItems.forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-view') === view);
    });
    dom.mobileNavBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
  }

  /* ============================================
     今日简报
     ============================================ */
  async function loadToday() {
    dom.mainTitle.textContent = '今日简报';
    showPeriodTabs(true);
    renderLoading(dom.mainContent);
    try {
      const briefs = await DB.fetchTodayBriefs();
      state.briefs = briefs;
      renderToday();
    } catch (err) {
      console.error('加载今日简报失败:', err);
      renderError('加载失败，请检查网络连接或数据库配置', err);
    }
  }

  function renderToday() {
    const briefs = filterByPeriod(state.briefs);
    const groups = buildSectionGroups(briefs);
    let html = '';

    html += renderPlatformHot();
    html += renderAllSections(groups);

    if (!html.trim()) {
      html = '<div class="empty-state"><div class="icon">📭</div><p>今日暂无简报内容</p>' +
        '<p style="font-size:13px;color:#9CA3AF">稍后再来，或翻翻历史归档</p></div>';
    }
    dom.mainContent.innerHTML = html;
    Annotation.bindAllIn(dom.mainContent);
    syncItemActionState();
  }

  function filterByPeriod(briefs) {
    if (state.period === 'all') return briefs;
    return briefs.filter(function (b) { return b.period === state.period; });
  }

  /* ============================================
     解析：简报 Markdown → 板块 → 条目
     ============================================ */
  function splitSections(content) {
    const text = String(content || '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const out = [];
    let cur = { heading: '', level: 0, lines: [] };
    let seenHeading = false;

    lines.forEach(function (line) {
      const m = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
      if (m) {
        const level = m[1].length;
        if (cur.heading || cur.lines.join('').trim() || seenHeading) {
          out.push(cur);
        }
        cur = { heading: m[2].trim(), level: level, lines: [] };
        seenHeading = true;
        return;
      }
      cur.lines.push(line);
    });
    out.push(cur);
    return out.filter(function (s) {
      return (s.heading && s.heading.trim()) || s.lines.join('').replace(/[-*\s]/g, '').trim();
    });
  }

  function classify(heading) {
    const h = String(heading || '').replace(/^[#\s]+/, '');
    if (!h) return sectionMap.brief ? 'brief' : 'other';
    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      if (s.re && s.re.test(h)) return s.id;
    }
    return 'other';
  }

  /* 把一段 markdown 拆成「条目」：每条一个独立卡片 + 右下角操作按钮 */
  function parseItems(body) {
    const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
    const items = [];
    let sub = '';
    let pendingArr = null;
    let lastLead = '';
    let storyBuf = null;   // 一条完整消息（信号/来源/判断）攒在这里

    function flushStory() {
      if (!storyBuf) return;
      const s = buildStory(storyBuf.lines, sub, lastLead);
      storyBuf = null;
      if (s) pushItem(s);
    }
    function flushPending() {
      flushStory();
      if (pendingArr && pendingArr.length) {
        const block = pendingArr.join('\n').trim();
        if (block) pushItem({ text: block, lead: lastLead, sub: sub });
      }
      pendingArr = null;
    }

    function pushItem(item) {
      var txt = String(item.text || '');
      if (/^\s*页脚[：:]/.test(txt)) return;
      if (/^\s*数据[：:]\s*\d+\s*源|抓取\s*\d{1,2}:\d{2}|^\s*\d+\s*源\s*\d+\s*条/.test(txt)) return;
      if (!item.text && !item.title) return;
      item.text = (item.text || '').trim();
      if (!item.text && !item.title) return;
      if (/^(-{3,}|={3,})$/.test(item.text)) return;
      item.lead = (item.lead || '').replace(/^\s*[-*]\s*/, '').trim();
      items.push(item);
    }

    /* 一条消息的开头：**信号1** … / 今日一句话：… / **动态** … */
    function isStoryStart(l) {
      if (/^\*\*[^*]{1,14}\*\*/.test(l)) return true;
      if (/^(今日一句话|信号|动态|事件|工具|书名|知识|观点|预告)[：:]/.test(l)) return true;
      return false;
    }
    /* 消息的后续行：来源 / 判断（紧跟在开头行后） */
    function isStoryField(l) {
      return /^\s*(来源|出处|判断|点评|解读|分析)[：:]/.test(l);
    }

    lines.forEach(function (raw) {
      const line = raw.replace(/\s+$/, '');
      const h3 = /^###\s+(.+?)\s*$/.exec(line);
      if (h3) {
        flushPending();
        sub = h3[1].trim();
        return;
      }
      /* > 引用块也当作一条消息攒起来 */
      if (/^\s*>/.test(line)) {
        flushPending();
        if (!storyBuf) storyBuf = { lines: [] };
        storyBuf.lines.push(line.replace(/^\s*>\s?/, ''));
        return;
      }
      if (!line.trim()) {
        flushPending();
        return;
      }
      /* markdown 表格：连续 | 行 */
      if (/^\s*\|.*\|\s*$/.test(line)) {
        flushStory();
        if (!pendingArr) pendingArr = [];
        pendingArr.push(line.trim());
        return;
      }

      const t = line.trim();
      /* 已开消息后的 来源/判断 行：并入本条（必须先于 flushPending） */
      if (storyBuf && isStoryField(t)) {
        storyBuf.lines.push(t);
        return;
      }
      /* 新消息开头：先收掉上一条/表格，再开新缓冲 */
      if (isStoryStart(t)) {
        flushPending();
        storyBuf = { lines: [t] };
        return;
      }
      flushPending();

      /* 顶级列表项（- / 1. / •） */
      const li = /^\s*(?:[-*+]|\d+[.、)]|•)\s+(.*)$/.exec(line);
      if (li && !/^\s{2,}/.test(line)) {
        pushItem(splitInlineJudgment({ text: li[1], lead: lastLead, sub: sub }));
        return;
      }
      /* 嵌套列表行：并进上一条 */
      if (/^\s{2,}(?:[-*+]|\d+[.、)])\s+/.test(line) && items.length) {
        items[items.length - 1].text += '\n' + line.trim();
        return;
      }
      /* 普通段落：以「：」结尾且后面跟列表时，作为引导语 */
      if (/[：:]$/.test(t) && t.length <= 40) {
        lastLead = t;
        return;
      }
      pushItem(splitInlineJudgment({ text: t, lead: '', sub: sub }));
    });
    flushPending();
    return items;
  }

  /* 一条消息（信号/来源/判断…）拆成结构化字段 */
  function buildStory(rawLines, sub, lastLead) {
    const f = { title: '', source: '', judgment: '', body: [] };
    rawLines.forEach(function (l) {
      l = String(l).trim();
      if (!l) return;
      /* **标签** 内容（可无冒号） */
      const bm = /^\*\*([^*]{1,14})\*\*\s*[：:]?\s*(.*)$/.exec(l);
      if (bm) {
        const label = bm[1].trim(), rest = (bm[2] || '').trim();
        if (/来源|出处/.test(label)) { if (rest) f.source = rest; }
        else if (/判断|点评|解读|分析/.test(label)) { if (rest) f.judgment = rest; }
        else if (/信号|动态|事件|工具|书名|知识|一句话|观点|预告/.test(label)) {
          f.title = f.title ? (f.title + ' ' + rest) : rest;
        } else { f.body.push(rest || l); }
        return;
      }
      /* 标签：内容 */
      const pm = /^([^*：:]{1,14})[：:]\s*(.*)$/.exec(l);
      if (pm) {
        const label = pm[1].trim(), val = (pm[2] || '').trim();
        if (/来源|出处/.test(label)) { if (val) f.source = val; }
        else if (/判断|点评|解读|分析/.test(label)) { if (val) f.judgment = val; }
        else if (/信号|动态|事件|工具|书名|知识|一句话|观点|预告/.test(label)) {
          f.title = f.title ? (f.title + ' ' + val) : val;
        } else { f.body.push(l); }
        return;
      }
      f.body.push(l);
    });
    const body = f.body.join('\n').trim();
    const text = [f.title, body, f.judgment, f.source ? ('来源：' + f.source) : ''].filter(Boolean).join('\n').trim();
    if (!text && !f.source) return null;
    return {
      text: text, title: f.title, body: body,
      source: f.source, judgment: f.judgment,
      lead: lastLead, sub: sub, grouped: true
    };
  }

  /* 列表/段落里内联的「判断：」拆出来，保持一条卡 */
  function splitInlineJudgment(item) {
    const m = /^([\s\S]*?)\s*判断[：:]([\s\S]*)$/.exec(item.text);
    if (m && m[1].trim() && m[2].trim()) {
      item.body = m[1].trim();
      item.judgment = m[2].trim();
      item.grouped = true;
      item.title = item.title || '';
    }
    return item;
  }

  function itemFingerprint(text) {
    return String(text || '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '')
      .replace(/[\s\|*_`>#\-—–·、。，,.:：；;！!？?（）()【】\[\]"'“”‘’「」]/g, '')
      .toLowerCase()
      .slice(0, 36);
  }

  function daysAgo(dateStr) {
    if (!dateStr) return 3;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return 3;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today - d) / 86400000));
  }

  function scoreItem(text, ctx) {
    let s = 0;
    const t = String(text || '');
    s += (ctx.sectionPriority || 1) * 0.6;
    s += ctx.periodWeight || 1;
    s += Math.max(0, 5 - daysAgo(ctx.date) * 1.6);
    if (/历史新高|创纪录|首个|首次|突破|暴涨|暴跌|暴雷|重磅|宣布|发布|监管|收购|并购|裁员|加息|降息|禁令|封杀|新高|新低|破产|上市|融资|制裁|断供|涨价|降价|警告|预警/.test(t)) s += 2;
    if (/\d+\s*(?:亿|万|%|倍)/.test(t)) s += 1;
    if (/\d{4,}/.test(t)) s += 0.5;
    if (/⚠️|🚨|❗/.test(t)) s += 1.5;
    if (/💡/.test(t)) s += 1;
    if (ctx.sectionId === 'signal' || ctx.sectionId === 'apeng_hot') s += 2.5;
    s += Math.max(0, 1.5 - (ctx.indexInSection || 0) * 0.12);
    return s;
  }

  /* 简报集合 → 板块分组 */
  function buildSectionGroups(briefs) {
    const groups = {};
    SECTIONS.forEach(function (s) { groups[s.id] = { id: s.id, def: s, items: [], headings: [] }; });
    const seen = {};

    briefs.forEach(function (brief) {
      const sections = splitSections(brief.content);
      sections.forEach(function (sec) {
        const body = sec.lines.join('\n');
        /* H1 标题本身不算条目 */
        if (sec.level === 1) return;
        if (!sec.heading && !body.replace(/[-*\s]/g, '').trim()) return;

        const sid = classify(sec.heading);
        const group = groups[sid] || groups.other;
        if (sec.heading) group.headings.push(sec.heading);

        if (!body.trim()) return;
        const items = parseItems(body);
        items.forEach(function (item, idx) {
          const fp = itemFingerprint(item.text);
          if (!fp) return;
          if (seen[fp] !== undefined) {
            const prevId = seen[fp];
            if (priorityOf(prevId) >= priorityOf(sid)) return;   // 已有更高优先级板块收录
            /* 新板块优先级更高：移除旧的 */
            groups[prevId].items = groups[prevId].items.filter(function (x) { return x.fp !== fp; });
          }
          seen[fp] = sid;
          group.items.push({
            fp: fp,
            text: item.text,
            lead: item.lead || '',
            sub: item.sub || '',
            title: item.title || '',
            body: item.body || '',
            judgment: item.judgment || '',
            source: item.source || '',
            grouped: !!item.grouped,
            sectionId: sid,
            sectionName: (sectionMap[sid] || sectionMap.other).name,
            briefId: brief.id,
            briefTitle: brief.title,
            date: brief.date,
            period: brief.period || '专题',
            score: scoreItem(item.text, {
              sectionPriority: (sectionMap[sid] || sectionMap.other).priority,
              sectionId: sid,
              periodWeight: PERIOD_WEIGHT[brief.period] || 1,
              date: brief.date,
              indexInSection: idx
            })
          });
        });
      });
    });

    Object.keys(groups).forEach(function (k) {
      const g = groups[k];
      g.items.sort(function (a, b) { return b.score - a.score; });
      g.headings = dedupeStrings(g.headings);
    });
    return groups;
  }

  function priorityOf(sid) {
    return (sectionMap[sid] || sectionMap.other).priority;
  }

  function dedupeStrings(arr) {
    const out = [];
    const seen = {};
    arr.forEach(function (s) {
      const k = s.replace(/\s+/g, '');
      if (!seen[k]) { seen[k] = 1; out.push(s); }
    });
    return out;
  }

  /* ============================================
     渲染：平台热榜聚合（只放外链，不展开内容）
     这是「外部聚合站」，跟简报自带的「🔥 阿鹏热榜」是两个东西：
       · 平台热榜聚合 = redian.me（外部站，有延迟）→ 只给一个链接
       · 阿鹏热榜     = 简报正文第一个板块 → 正常渲染条目
     以前这里会拉 5 个平台各 30 条热榜渲染进页面（150 个节点），
     又占篇幅又费流量，现在只留一个链接。
     ============================================ */
  function renderPlatformHot() {
    return '<div class="platform-hot">' +
      '<div class="platform-hot-head">' +
        '<span class="platform-hot-title">' + escapeHtml(PLATFORM_HOT.title) + '</span>' +
      '</div>' +
      '<a class="platform-hot-link" href="' + escapeAttr(PLATFORM_HOT.url) + '" target="_blank" rel="noopener">' +
        escapeHtml(PLATFORM_HOT.label) +
      '</a>' +
      '</div>';
  }

  /* ============================================
     渲染：深度信息差
     ============================================ */
  /* ============================================
     渲染：全部板块（按 SECTIONS 顺序 = 阿鹏热榜 → 深度信号 → 其余）
     ============================================ */
  function renderAllSections(groups) {
    let html = '';
    SECTIONS.forEach(function (def) {
      const g = groups[def.id];
      if (!g || !g.items.length) return;

      /* 行动建议/数据缺口/社会情绪不编号（本来就不是"第 N 条新闻"） */
      const withRank = (def.id !== 'action' && def.id !== 'gap' && def.id !== 'mood');

      let inner = '';
      const sources = [];
      /* 行动建议：按身份分组（📱 自媒体 / 💻 独立开发者 / 💰 投资者 / 🎯 项目推进） */
      if (def.id === 'action' && g.items.some(function (x) { return x.sub; })) {
        const groups = {};
        const order = [];
        g.items.forEach(function (item) {
          const k = item.sub || '其他';
          if (!groups[k]) { groups[k] = []; order.push(k); }
          groups[k].push(item);
          if (item.source) sources.push(item.source);
        });
        order.forEach(function (k) {
          inner += '<div class="action-group"><div class="action-group-head">' + escapeHtml(k) + '</div>';
          groups[k].forEach(function (item) { inner += renderItem(item, { rank: 0 }); });
          inner += '</div>';
        });
      } else {
        g.items.forEach(function (item, i) {
          inner += renderItem(item, { rank: withRank ? i + 1 : 0 });
          if (item.source) sources.push(item.source);
        });
      }
      inner += renderSourcesFooter(sources);

      const note = def.id === 'signal' ? '热榜之外、别人没说的那部分，按重要度排序' : '';
      html += renderSectionShell(def.id, def.name.replace(/^\S+\s*/, ''), inner, g.items.length, note);
    });
    return html;
  }

  function renderSourcesFooter(sources) {
    const dedup = [];
    (sources || []).forEach(function (x) { if (x && dedup.indexOf(x) < 0) dedup.push(x); });
    if (!dedup.length) return '';
    return '<div class="section-sources">📎 来源：' + dedup.map(escapeHtml).join(' · ') + '</div>';
  }

  function renderSectionShell(id, name, inner, count, note) {
    const def = sectionMap[id] || sectionMap.other;
    return '<section class="section" data-section="' + id + '">' +
      '<div class="section-head">' +
        '<h2><span class="section-icon">' + def.icon + '</span>' + escapeHtml(name) + '</h2>' +
        (count ? '<span class="section-count">' + count + ' 条</span>' : '') +
        '<span class="section-caret">▾</span>' +
      '</div>' +
      (note ? '<div class="section-note">' + escapeHtml(note) + '</div>' : '') +
      '<div class="section-body">' + inner + '</div>' +
      '</section>';
  }

  /* ============================================
     渲染：单条消息
     ============================================ */
  function renderItem(item, opts) {
    opts = opts || {};
    const raw = item.text || '';

    let title = '', content = '';
    if (item.grouped && (item.title || item.body || item.judgment)) {
      title = item.title || '';
      content = item.body || '';
    } else {
      const split = splitTitle(raw);
      title = split.title;
      content = split.content;
    }

    const key = item.fp || itemFingerprint(raw);
    const attrs =
      ' class="news-item' + (opts.compact ? ' compact' : '') + '"' +
      ' data-item-key="' + escapeAttr(key) + '"' +
      ' data-item-text="' + escapeAttr(raw.replace(/\n+/g, ' ').slice(0, 500)) + '"' +
      ' data-brief-id="' + escapeAttr(item.briefId == null ? '' : String(item.briefId)) + '"' +
      ' data-section-name="' + escapeAttr(item.sectionName || (sectionMap[item.sectionId] || sectionMap.other).name) + '"' +
      ' data-item-date="' + escapeAttr(item.date || '') + '"';

    let html = '<article' + attrs + '>';
    const meta = [];
    if (item.sub) meta.push('<span class="item-sub">' + escapeHtml(item.sub) + '</span>');
    if (item.lead) meta.push('<span class="item-lead">' + escapeHtml(item.lead) + '</span>');
    if (opts.rank) meta.push('<span class="item-rank">#' + opts.rank + '</span>');
    if (item.period) meta.push('<span class="item-src">' + escapeHtml(item.period + (item.date ? ' · ' + item.date.slice(5) : '')) + '</span>');

    html += '<div class="item-body">';
    if (meta.length) html += '<div class="item-meta">' + meta.join('') + '</div>';
    if (title) html += '<div class="item-title">' + renderInline(title) + '</div>';
    if (content) html += '<div class="item-content">' + renderMarkdown(content) + '</div>';
    if (item.judgment) html += '<div class="item-judgment"><span class="j-tag">判断</span><div class="j-text">' + renderMarkdown(item.judgment) + '</div></div>';
    html += '</div>';

    /* 空卡片（只有 meta 标签、没有正文）直接不输出 */
    if (!title && !content && !item.judgment) return '';

    if (showActions(item)) html += renderItemActions();
    html += '</article>';
    return html;
  }

  function showActions(item) {
    if (item.sectionId === 'gap') return false;
    const t = String(item.text || item.title || '').replace(/[\s>]/g, '');
    if (/页脚|数据：搜索|生成\s*\d{1,2}:\d{2}/.test(t)) return false;
    if (t.length < 10) return false;
    return true;
  }

  function renderItemActions() {
    return '<div class="item-actions">' +
      '<button type="button" data-action="star" title="收藏">⭐<span>收藏</span></button>' +
      '<button type="button" data-action="important" title="重点">🔥<span>重点</span></button>' +
      '<button type="button" data-action="track" title="追踪">🔍<span>追踪</span></button>' +
      '<button type="button" data-action="obsidian" title="存到 Obsidian">📋<span>Obsidian</span></button>' +
      '</div>';
  }

  /* 把一条消息拆成「标题 + 正文」：优先 → / ：分隔 */
  function splitTitle(text) {
    const t = String(text || '').trim();
    const m = /^(.{4,60}?)\s*(?:→|->|——|：|:)\s*(.+)$/s.exec(t);
    if (m && m[2] && m[2].length >= 8) {
      return { title: m[1].replace(/[。，,]$/, ''), content: m[2].trim() };
    }
    return { title: '', content: t };
  }

  /* ============================================
     Markdown + 高亮 + 表格 + 图表
     ============================================ */
  function renderMarkdown(text) {
    const src = String(text == null ? '' : text);
    let html;
    if (typeof marked !== 'undefined' && marked.parse) {
      try { html = marked.parse(src); }
      catch (e) { html = escapeHtml(src).replace(/\n/g, '<br>'); }
    } else {
      html = escapeHtml(src).replace(/\n/g, '<br>');
    }
    html = sanitizeHtml(html);
    html = upgradeTables(html);
    html = applyCharts(html);
    return decorateHtml(html);
  }

  function renderInline(text) {
    let html;
    if (typeof marked !== 'undefined' && marked.parseInline) {
      try { html = marked.parseInline(String(text)); }
      catch (e) { html = escapeHtml(text); }
    } else {
      html = escapeHtml(text);
    }
    return decorateHtml(sanitizeHtml(html));
  }

  function sanitizeHtml(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }

  /* 表格：加 data-label（手机端转堆叠卡片）+ 横向滚动包裹 */
  function upgradeTables(html) {
    if (html.indexOf('<table') === -1) return html;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    wrap.querySelectorAll('table').forEach(function (table) {
      const headers = [];
      table.querySelectorAll('thead th').forEach(function (th) { headers.push(th.textContent.trim()); });
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        let i = 0;
        tr.querySelectorAll('td').forEach(function (td) {
          if (headers[i]) td.setAttribute('data-label', headers[i]);
          i++;
        });
      });
      table.classList.add('md-table');
    });
    return wrap.innerHTML;
  }

  /* 数值型表格 → 自动补一张条形图 */
  function applyCharts(html) {
    if (html.indexOf('<table') === -1) return html;
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const tables = Array.prototype.slice.call(wrap.querySelectorAll('table'));
    tables.forEach(function (table) {
      /* 涨跌单元格：加箭头和颜色 */
      Array.prototype.slice.call(table.querySelectorAll('td')).forEach(function (td) {
        var t = td.textContent.trim();
        if (/^(涨|↑|\+\d)/.test(t) || /涨$/.test(t)) {
          td.classList.add('cell-up');
          if (/^涨/.test(t)) td.innerHTML = '↑ ' + escapeHtml(t);
        } else if (/^(跌|↓|-\d|−\d)/.test(t) || /跌/.test(t)) {
          td.classList.add('cell-down');
          if (/^跌/.test(t)) td.innerHTML = '↓ ' + escapeHtml(t);
        }
      });
      const chart = buildChartFromTable(table);
      if (chart) {
        table.parentNode.insertBefore(chart, table);
        table.style.display = 'none';
      }
    });
    return wrap.innerHTML;
  }

  const ORDINAL = { '极高': 5, '很高': 4.7, '高': 4, '较高': 3.6, '偏高': 3.4, '中高': 3.2, '中': 3, '一般': 2.6, '偏低': 2.2, '较低': 2, '低': 1.4, '很低': 1, '极低': 0.6 };

  function buildChartFromTable(table) {
    const rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    if (rows.length < 2 || rows.length > 12) return null;
    const headerCells = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    if (!headerCells.length) return null;

    const grid = rows.map(function (tr) {
      return Array.prototype.slice.call(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
    }).filter(function (r) { return r.length; });
    if (grid.length < 2) return null;

    const colCount = Math.min.apply(null, grid.map(function (r) { return r.length; }));
    let best = null;

    for (let c = 1; c < colCount && c < 4; c++) {
      const head = (headerCells[c] || '').textContent ? headerCells[c].textContent.trim() : (headerCells[c] || '').trim();
      const values = [];
      let numeric = 0;
      let ordinal = 0;
      grid.forEach(function (r) {
        const cell = r[c] || '';
        const n = parseNumericCell(cell);
        if (n !== null) { numeric++; values.push({ label: r[0], value: n.value, raw: cell, unit: n.unit }); return; }
        const o = ORDINAL[cell.replace(/\s/g, '')];
        if (o !== undefined && /温度|热度|程度|重要|强弱|评分|关注/.test(head)) {
          ordinal++;
          values.push({ label: r[0], value: o, raw: cell, unit: '级' });
        }
      });

      const hit = numeric >= Math.max(2, Math.ceil(grid.length * 0.6)) || ordinal >= Math.max(2, Math.ceil(grid.length * 0.6));
      if (hit && (!best || values.length > best.values.length)) {
        best = { head: head || '数值', values: values, ordinal: ordinal > numeric };
      }
    }
    if (!best || best.values.length < 2) return null;

    /* 全是百分比列、合计接近 100%：用环形图更直观 */
    var units = {};
    best.values.forEach(function (v) { units[v.unit] = (units[v.unit] || 0) + 1; });
    var allPct = best.values.every(function (v) { return v.unit === '%' || v.unit === '％'; });
    if (allPct) {
      var sum = best.values.reduce(function (a, v) { return a + Math.abs(v.value); }, 0);
      if (sum >= 70 && sum <= 130) return buildDonutChart(best);
    }

    /* 量级悬殊（最大/最小 > 40 倍）时条形图会被压扁成线，宁可不画 */
    var positives = best.values.map(function (v) { return Math.abs(v.value); }).filter(function (x) { return x > 0; });
    if (positives.length >= 2) {
      var pMax = Math.max.apply(null, positives), pMin = Math.min.apply(null, positives);
      if (pMax / pMin > 40) return null;
    }

    const absMax = Math.max.apply(null, best.values.map(function (v) { return Math.abs(v.value); })) || 1;
    let html = '<div class="chart"><div class="chart-head">' + escapeHtml(best.head) + '<span class="chart-hint">' + (best.ordinal ? '程度对比' : '数值对比') + '</span></div>';
    best.values.forEach(function (v) {
      const pct = Math.max(4, Math.round(Math.abs(v.value) / absMax * 100));
      const cls = best.ordinal ? 'ord' : (v.value < 0 ? 'down' : 'up');
      html += '<div class="chart-row">' +
        '<span class="chart-label" title="' + escapeAttr(v.label) + '">' + escapeHtml(clip(v.label, 14)) + '</span>' +
        '<span class="chart-track"><i class="' + cls + '" style="width:' + pct + '%"></i></span>' +
        '<span class="chart-value ' + cls + '">' + escapeHtml(clip(v.raw, 12)) + '</span>' +
        '</div>';
    });
    html += '</div>';

    const div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
  }

  function buildDonutChart(best) {
    var values = best.values.filter(function (v) { return v.value > 0; });
    if (values.length < 2) return null;
    var total = values.reduce(function (a, v) { return a + v.value; }, 0) || 1;
    var palette = ['#7C90B8','#C99A9A','#A8BFA8','#D4B896','#9FB6CD','#C4A7C0','#A8C5C5','#C9B08A'];
    var acc = 0, stops = [];
    values.forEach(function (v, i) {
      var from = acc / total * 100;
      acc += v.value;
      var to = acc / total * 100;
      stops.push(palette[i % palette.length] + ' ' + from.toFixed(1) + '% ' + to.toFixed(1) + '%');
    });
    var conic = 'conic-gradient(' + stops.join(',') + ')';
    var html = '<div class="chart chart-donut-wrap"><div class="chart-head">' + escapeHtml(best.head) + '<span class="chart-hint">占比</span></div>' +
      '<div class="donut-row"><div class="donut" style="background:' + conic + '"><div class="donut-hole"><span>' + values.length + '项</span></div></div>' +
      '<div class="donut-legend">';
    values.forEach(function (v, i) {
      html += '<div class="lg-row"><i style="background:' + palette[i % palette.length] + '"></i><span class="lg-name">' + escapeHtml(clip(v.label, 12)) + '</span><b>' + escapeHtml(v.raw) + '</b></div>';
    });
    html += '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
  }

  function parseNumericCell(raw) {
    const s = String(raw || '').replace(/[,\s￥$]/g, '');
    if (!s) return null;
    const m = /^([+\-−]?)(\d+(?:\.\d+)?)\s*(%|％|倍|万|亿|美元|元|点|bp|BP)?/.exec(s);
    if (!m) return null;
    let v = parseFloat(m[2]);
    if (isNaN(v)) return null;
    if (m[1] === '-' || m[1] === '−') v = -v;
    return { value: v, unit: m[3] || '' };
  }

  /* 重点内容上色（只处理文本节点，不碰标签和属性） */
  function decorateHtml(html) {
    if (html.indexOf('<') === -1) return decorateText(html);
    return String(html).replace(/(<[^>]*>)|([^<]+)/g, function (m, tag, text) {
      if (tag) return tag;
      return decorateText(text);
    });
  }

  function decorateText(text) {
    let t = text;
    t = t.replace(/([+\-−]?\d[\d,\.]*(?:\s*)(?:%|％|倍|亿美元|万美元|亿元|万元|万|亿|美元|点数|点))/g,
      '<span class="hl-num">$1</span>');
    t = t.replace(/(暴涨|大涨|上涨|走高|新高|创纪录|突破|利好|回暖|反弹|飙升)/g, '<span class="hl-up">$1</span>');
    t = t.replace(/(暴跌|大跌|下跌|走低|新低|跳水|利空|警惕|风险|承压|抛售|崩盘)/g, '<span class="hl-down">$1</span>');
    t = t.replace(/「([^」\n]{1,40})」/g, '<span class="hl-quote">「$1」</span>');
    return t;
  }

  /* ============================================
     归档 / 收藏 / 追踪 / 搜索
     ============================================ */
  async function loadArchive() {
    dom.mainTitle.textContent = '历史归档';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);
    try {
      const result = await DB.fetchAllBriefs(1, 100);
      state.briefs = result.data;
      renderArchive(result.data);
    } catch (err) {
      console.error('加载归档失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderArchive(briefs) {
    if (!briefs.length) { renderEmpty('📂', '暂无归档简报'); return; }
    const groups = {};
    briefs.forEach(function (b) {
      if (!groups[b.date]) groups[b.date] = [];
      groups[b.date].push(b);
    });
    let html = '';
    Object.keys(groups).sort().reverse().forEach(function (date) {
      html += '<div class="date-group">' + formatDate(date) + '</div>';
      groups[date].forEach(function (brief) {
        const preview = briefPreview(brief);
        html += '<div class="brief-card" data-brief-id="' + brief.id + '">' +
          '<div class="brief-toggle">' +
            '<div class="brief-head">' +
              '<span class="period-badge ' + (brief.period || '专题') + '">' + (brief.period || '专题') + '</span>' +
              '<span class="brief-title">' + escapeHtml(brief.title) + '</span>' +
            '</div>' +
            '<div class="brief-summary">' + escapeHtml(preview) + '</div>' +
          '</div>' +
          '<div class="brief-detail"></div>' +
          '</div>';
      });
    });
    dom.mainContent.innerHTML = html;
  }

  function renderBriefDetail(container, brief) {
    if (!container || container.getAttribute('data-rendered') === '1') return;
    const groups = buildSectionGroups([brief]);
    let html = '';
    SECTIONS.forEach(function (def) {
      if (def.id === 'apeng_hot') return;
      const g = groups[def.id];
      if (!g || !g.items.length) return;
      let inner = '';
      g.items.forEach(function (item) { inner += renderItem(item, { compact: true }); });
      html += renderSectionShell(def.id, def.name.replace(/^\S+\s*/, ''), inner, g.items.length);
    });
    container.innerHTML = html || '<div class="empty-state"><p>无结构化内容</p></div>';
    container.setAttribute('data-rendered', '1');
  }

  async function loadCollections() {
    dom.mainTitle.textContent = '我的收藏';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);
    try {
      state.annotations = await DB.fetchAnnotations();
      renderCollections(state.annotations);
    } catch (err) {
      console.error('加载收藏失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderCollections(annotations) {
    if (!annotations.length) {
      renderEmpty('⭐', '还没有收藏/重点/追踪', '在简报里点每条消息右下角的按钮就行');
      return;
    }
    let filtered = annotations;
    if (state.annoFilter !== 'all') filtered = filtered.filter(function (a) { return a.annotation_type === state.annoFilter; });
    if (state.annoSearchKey) {
      const kw = state.annoSearchKey.toLowerCase();
      filtered = filtered.filter(function (a) {
        return (a.selected_text && a.selected_text.toLowerCase().indexOf(kw) >= 0) ||
          (a.note && a.note.toLowerCase().indexOf(kw) >= 0);
      });
    }
    const counts = { all: annotations.length, star: 0, important: 0, track: 0 };
    annotations.forEach(function (a) { if (counts[a.annotation_type] !== undefined) counts[a.annotation_type]++; });

    let html = '<div class="filter-bar"><span class="filter-label">筛选</span>';
    [{ key: 'all', label: '全部' }, { key: 'star', label: '⭐ 收藏' }, { key: 'important', label: '🔥 重点' }, { key: 'track', label: '🔍 追踪' }]
      .forEach(function (f) {
        html += '<span class="filter-chip' + (state.annoFilter === f.key ? ' active' : '') + '" data-filter="' + f.key + '">' + f.label + ' (' + counts[f.key] + ')</span>';
      });
    html += '</div>';
    html += '<div class="anno-search-wrap"><input type="text" id="annoSearch" placeholder="搜索标注内容..." value="' + escapeAttr(state.annoSearchKey) + '"></div>';

    if (!filtered.length) {
      html += '<div class="empty-state"><div class="icon">🔍</div><p>没有匹配的标注</p></div>';
    } else {
      filtered.forEach(function (a) {
        const typeLabel = a.annotation_type === 'star' ? '⭐ 收藏' : a.annotation_type === 'important' ? '🔥 重点' : '🔍 追踪';
        html += '<div class="annotation-card">' +
          '<div class="anno-text ' + a.annotation_type + '">' + escapeHtml(a.selected_text) + '</div>' +
          (a.note ? '<div class="anno-note">📝 ' + escapeHtml(a.note) + '</div>' : '') +
          '<div class="anno-meta">' +
            '<span class="anno-badge ' + a.annotation_type + '">' + typeLabel + '</span>' +
            (a.section ? '<span>' + escapeHtml(a.section) + '</span>' : '') +
            '<span>' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>' +
            '<button class="anno-obsidian" data-text="' + escapeAttr(a.selected_text) + '" data-section="' + escapeAttr(a.section || '简报') + '" data-date="' + escapeAttr(a.created_at ? a.created_at.split('T')[0] : '') + '">📋 Obsidian</button>' +
            '<button class="anno-delete" data-id="' + a.id + '">🗑️ 删除</button>' +
          '</div>' +
          '</div>';
      });
    }
    dom.mainContent.innerHTML = html;

    dom.mainContent.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.annoFilter = chip.getAttribute('data-filter');
        renderCollections(state.annotations);
      });
    });
    const search = document.getElementById('annoSearch');
    if (search) {
      search.addEventListener('input', function () {
        state.annoSearchKey = search.value.trim();
        renderCollections(state.annotations);
      });
    }
    dom.mainContent.querySelectorAll('.anno-delete').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteAnno(btn.getAttribute('data-id')); });
    });
    dom.mainContent.querySelectorAll('.anno-obsidian').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Annotation.copyToObsidian(btn.getAttribute('data-text'), btn.getAttribute('data-section'), btn.getAttribute('data-date'), btn);
      });
    });
  }

  async function deleteAnno(id) {
    if (!confirm('确定删除这条标注？')) return;
    try {
      await DB.deleteAnnotation(id);
      toast('已删除');
      loadCollections();
      refreshSidebarCounts();
    } catch (err) {
      toast('删除失败');
    }
  }

  async function loadTracks() {
    dom.mainTitle.textContent = '追踪线索';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);
    try {
      const tracks = await DB.fetchTracks();
      const annotations = await DB.fetchAnnotations({ type: 'track' });
      renderTracks(tracks, annotations);
    } catch (err) {
      console.error('加载追踪线索失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderTracks(tracks, trackAnnotations) {
    if (!tracks.length && !trackAnnotations.length) {
      renderEmpty('🔍', '还没有追踪线索', '点任意一条消息右下角的「追踪」建立线索');
      return;
    }
    let html = '';
    if (tracks.length) {
      html += '<div class="date-group">追踪中的线索</div>';
      tracks.forEach(function (t) {
        html += '<div class="track-card"><div class="track-header"><span class="track-name">🔍 ' + escapeHtml(t.name) + '</span></div>';
        if (t.description) html += '<div class="track-desc">' + escapeHtml(t.description) + '</div>';
        html += '</div>';
      });
    }
    const groups = {};
    trackAnnotations.forEach(function (a) {
      const key = a.section || '未分类';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    Object.keys(groups).forEach(function (key) {
      html += '<div class="date-group">' + escapeHtml(key) + '</div>';
      html += '<div class="track-card"><div class="track-timeline">';
      groups[key].forEach(function (a) {
        html += '<div class="timeline-item">' + escapeHtml(clip(a.selected_text, 140)) +
          '<br><span class="timeline-date">' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span></div>';
      });
      html += '</div></div>';
    });
    dom.mainContent.innerHTML = html;
  }

  async function handleSearch(keyword) {
    dom.mainTitle.textContent = '搜索：' + keyword;
    showPeriodTabs(false);
    renderLoading(dom.mainContent);
    try {
      const results = await DB.searchBriefs(keyword);
      state.briefs = results;
      if (!results.length) {
        renderEmpty('🔍', '没找到包含「' + keyword + '」的简报');
        return;
      }
      const groups = buildSectionGroups(results);
      let html = '<div class="search-count">找到 ' + results.length + ' 篇简报</div>';
      html += renderAllSections(groups);
      dom.mainContent.innerHTML = html;
      Annotation.bindAllIn(dom.mainContent);
      syncItemActionState();
    } catch (err) {
      console.error('搜索失败:', err);
      renderError('搜索失败', err);
    }
  }

  /* ============================================
     同步条目按钮状态（收藏/重点/追踪 是否已点过）
     ============================================ */
  function syncItemActionState() {
    if (typeof UserStore === 'undefined') return;
    document.querySelectorAll('.item-actions').forEach(function (row) {
      const item = row.closest('.news-item');
      if (!item) return;
      const briefId = item.getAttribute('data-brief-id') || '';
      const text = item.getAttribute('data-item-text') || '';
      row.querySelectorAll('button[data-action]').forEach(function (btn) {
        const action = btn.getAttribute('data-action');
        if (action === 'obsidian') return;
        const on = UserStore.isActive({ brief_id: briefId, selected_text: text, annotation_type: action });
        btn.classList.toggle('is-on', !!on);
      });
    });
  }

  function refreshSidebarCounts() {
    try {
      const stats = (typeof UserStore !== 'undefined') ? UserStore.stats() : null;
      const el = document.querySelector('.nav-item[data-view="collections"] .count');
      if (el && stats) el.textContent = stats.total || '';
    } catch (e) {}
  }

  async function loadSidebarCounts() {
    try {
      const stats = await DB.fetchAnnotationStats();
      const el = document.querySelector('.nav-item[data-view="collections"] .count');
      if (el) el.textContent = stats.total || '';
    } catch (e) {}
  }

  /* ============================================
     工具
     ============================================ */
  function briefPreview(brief) {
    const sections = splitSections(brief.content);
    const titles = [];
    sections.forEach(function (s) {
      if (!s.heading) return;
      if (s.level === 1) return;
      titles.push(s.heading);
    });
    if (titles.length) return titles.slice(0, 6).join(' · ');
    return String(brief.content || '').replace(/[#*>`\-]/g, '').slice(0, 120);
  }

  function clip(text, n) {
    const s = String(text == null ? '' : text);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return dateStr;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const only = new Date(d); only.setHours(0, 0, 0, 0);
    const diff = Math.round((today - only) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function formatClock(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = function (n) { return String(n).length < 2 ? '0' + n : String(n); };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return escapeHtml(text).replace(/"/g, '&quot;');
  }

  function showPeriodTabs(show) {
    if (dom.periodTabs) dom.periodTabs.style.display = show ? 'flex' : 'none';
    if (dom.periodTabs && show) {
      dom.periodTabs.querySelectorAll('.period-tab').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-period') === state.period);
      });
    }
  }

  function renderLoading(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div><div>加载中...</div></div>';
  }

  function renderEmpty(icon, msg, sub) {
    let html = '<div class="empty-state"><div class="icon">' + icon + '</div><p>' + escapeHtml(msg) + '</p>';
    if (sub) html += '<p class="empty-sub">' + escapeHtml(sub) + '</p>';
    html += '</div>';
    dom.mainContent.innerHTML = html;
  }

  function renderError(msg, err) {
    console.error(msg, err);
    dom.mainContent.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>' + escapeHtml(msg) + '</p>' +
      '<p class="empty-sub">' + escapeHtml((err && err.message) || String(err || '')) + '</p></div>';
  }

  function toast(msg) {
    let el = document.getElementById('appToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('visible'); }, 2400);
  }

  function toggleSidebar() {
    if (dom.sidebar) dom.sidebar.classList.toggle('open');
    if (dom.sidebarOverlay) dom.sidebarOverlay.classList.toggle('visible');
  }

  function closeSidebar() {
    if (dom.sidebar) dom.sidebar.classList.remove('open');
    if (dom.sidebarOverlay) dom.sidebarOverlay.classList.remove('visible');
  }

  function setTodayDate() {
    if (!dom.dateToday) return;
    const d = new Date();
    const m = d.getMonth() + 1, day = d.getDate();
    dom.dateToday.textContent = d.getFullYear() + '年' + m + '月' + day + '日';
    const pad = function (n) { return String(n).length < 2 ? '0' + n : String(n); };
    dom.dateToday.setAttribute('data-iso', d.getFullYear() + '-' + pad(m) + '-' + pad(day));
  }

  function setPeriod(period) {
    state.period = period;
    if (dom.periodTabs) {
      dom.periodTabs.querySelectorAll('.period-tab').forEach(function (tab) {
        tab.classList.toggle('active', tab.getAttribute('data-period') === period);
      });
    }
    if (state.briefs.length) renderToday();
  }

  return {
    init: init,
    navigateTo: navigateTo,
    setPeriod: setPeriod,
    toast: toast,
    deleteAnno: deleteAnno,
    renderMarkdown: renderMarkdown,
    formatDate: formatDate,
    syncItemActionState: syncItemActionState,
    refreshSidebarCounts: refreshSidebarCounts,
    classify: classify,
    SECTIONS: SECTIONS
  };
})();

document.addEventListener('click', function (e) {
  if (e.target.classList && e.target.classList.contains('period-tab')) {
    App.setPeriod(e.target.getAttribute('data-period'));
  }
});

document.addEventListener('DOMContentLoaded', function () {
  App.init();
  if (typeof Annotation !== 'undefined') Annotation.init();
});
