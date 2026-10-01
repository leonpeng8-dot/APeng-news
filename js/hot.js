/**
 * 热榜数据层
 * 优先走本站服务端 /api/hot（海外出口、带缓存），失败时前端直连公开热榜 API。
 */
const HotNews = (function () {
  var CACHE_MS = 5 * 60 * 1000;
  var cache = null;
  var cacheAt = 0;

  var BOARD_KEYS = ['weibo', 'zhihu', 'baidu', 'bilibili', 'kr36'];
  var BOARD_NAMES = {
    weibo: '微博热搜',
    zhihu: '知乎热榜',
    baidu: '百度热搜',
    bilibili: 'B站热搜',
    kr36: '36氪热榜'
  };

  /* 板块归类：热榜条目在简报缺板块时用来补位 */
  var SECTION_RULES = [
    { id: 'sports', name: '⚽ 体育/电竞', re: /体育|电竞|足球|篮球|网球|排球|乒乓|羽毛|F1|英超|西甲|中超|亚运|世界杯|奥运|NBA|CBA|LPL|KPL|S赛|英雄联盟|王者荣耀|第五人格|球|冠军|联赛|C罗|梅西|姆巴佩|国足|女排|马拉松|棋|锦标赛/i },
    { id: 'ent', name: '🎬 娱乐', re: /娱乐|明星|综艺|演唱会|音乐|电影|电视剧|票房|晚会|热搜剧|演员|导演|歌手|偶像|选秀|脱口秀|肖战|薛之谦|吴彦祖|Netflix|爱奇艺|优酷|腾讯视频|芒果|游戏|魔兽|任天堂|宝可梦|原神|steam/i },
    { id: 'world', name: '🌍 国际/政治/社会', re: /国际|政治|外交|社会|地震|空袭|战争|冲突|袭击|美国|欧盟|伊朗|以色列|巴勒斯坦|俄罗斯|乌克兰|日本|韩国|朝鲜|印度|巴基斯坦|事故|遇难|暴雨|台风|失联|警方|通报|法院|判决|政策|两会|国务院|白宫|联合国/i },
    { id: 'books', name: '📚 书籍/资源/知识', re: /读书|书籍|书单|新书|出版|阅读|作家|文学|小说|散文|知识|科普|博物馆|纪录|历史|考古|学术|研究|论文|课程|学习|考研|高考|教育/i },
    { id: 'market', name: '📈 市场数据', re: /股|债|汇率|人民币|美元|黄金|金价|油价|原油|期货|基金|楼市|房价|房价|金融|央行|降息|加息|加密|比特币|BTC|ETH|存储|芯片|半导体/i }
  ];

  function categorize(title) {
    var t = String(title || '');
    for (var i = 0; i < SECTION_RULES.length; i++) {
      if (SECTION_RULES[i].re.test(t)) return SECTION_RULES[i].id;
    }
    return 'hot';
  }

  function normalizeBoards(raw) {
    var boards = [];
    BOARD_KEYS.forEach(function (key) {
      var list = (raw && (raw.boards ? raw.boards[key] : raw[key])) || [];
      if (!Array.isArray(list) || !list.length) return;
      boards.push({
        key: key,
        name: (raw && raw[key + '_name']) || BOARD_NAMES[key] || key,
        list: list.map(function (item, i) {
          return {
            rank: Number(item.rank) || i + 1,
            title: String(item.title || '').trim(),
            hot: String(item.hot || '').trim(),
            url: item.url || item.link || '',
            source: key
          };
        }).filter(function (x) { return x.title; })
      });
    });
    return boards;
  }

  async function fetchJson(url) {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  async function loadFallback() {
    var data = await fetchJson('https://api.codelife.cc/api/top/list?lang=cn&id=KqndgxeLl9');
    var list = Array.isArray(data && data.data) ? data.data : [];
    return {
      boards: {
        weibo: list.map(function (item) {
          return {
            rank: Number(item.index) || 0,
            title: String(item.title || '').trim(),
            hot: String(item.hotValue || '').trim(),
            url: item.link || '',
            source: 'weibo'
          };
        }).filter(function (x) { return x.title; })
      }
    };
  }

  async function load() {
    if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
    var raw = null;
    try {
      raw = await fetchJson('/api/hot');
    } catch (e) {
      try {
        raw = await loadFallback();
      } catch (e2) {
        raw = null;
      }
    }

    var boards = normalizeBoards(raw);
    var items = [];
    boards.forEach(function (board) {
      board.list.forEach(function (item) {
        items.push({
          rank: item.rank,
          title: item.title,
          hot: item.hot,
          url: item.url,
          source: item.source,
          sourceName: board.name,
          section: categorize(item.title)
        });
      });
    });

    cache = {
      boards: boards,
      items: items,
      updatedAt: (raw && raw.updatedAt) || new Date().toISOString()
    };
    cacheAt = Date.now();
    return cache;
  }

  return {
    load: load,
    categorize: categorize,
    SECTION_RULES: SECTION_RULES,
    BOARD_NAMES: BOARD_NAMES
  };
})();

window.HotNews = HotNews;
