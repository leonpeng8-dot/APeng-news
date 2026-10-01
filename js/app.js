/**
 * 阿鹏资讯站 - 主应用逻辑
 * 负责加载简报、渲染、导航、搜索
 */

const App = (function() {

  // 应用状态
  const state = {
    view: 'today',        // today | archive | collections | tracks
    period: 'all',        // all | 早间 | 午间 | 晚间 | 夜间 | 专题
    searchKeyword: '',
    briefs: [],
    annotations: [],
    tracks: [],
    annoFilter: 'all',    // all | star | important | track
    annoSearchKey: ''
  };

  // DOM 引用
  let dom = {};

  // ============================================
  // 初始化
  // ============================================

  function init() {
    cacheDom();
    bindEvents();
    initSupabase();
    configMarked();
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
    // 侧边栏导航
    dom.navItems.forEach(function(item) {
      item.addEventListener('click', function() {
        const view = item.getAttribute('data-view');
        navigateTo(view);
        closeSidebar();
      });
    });

    // 移动端底部导航
    dom.mobileNavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        const view = btn.getAttribute('data-view');
        navigateTo(view);
      });
    });

    // 菜单按钮（移动端）
    if (dom.menuBtn) {
      dom.menuBtn.addEventListener('click', toggleSidebar);
    }
    if (dom.sidebarOverlay) {
      dom.sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // 搜索
    if (dom.searchInput) {
      let searchTimer = null;
      dom.searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        const kw = dom.searchInput.value.trim();
        searchTimer = setTimeout(function() {
          if (kw.length >= 2) {
            state.searchKeyword = kw;
            handleSearch(kw);
          } else if (kw.length === 0) {
            state.searchKeyword = '';
            navigateTo(state.view);
          }
        }, 400);
      });
      dom.searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const kw = dom.searchInput.value.trim();
          if (kw) {
            state.searchKeyword = kw;
            handleSearch(kw);
          }
        }
      });
    }

    // Logo 点击回到首页
    const logo = document.querySelector('.topbar .logo');
    if (logo) {
      logo.addEventListener('click', function() {
        navigateTo('today');
      });
    }
  }

  function initSupabase() {
    if (typeof DB !== 'undefined' && DB.initSupabase) {
      DB.initSupabase();
    }
  }

  function configMarked() {
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
      });
    }
  }

  // ============================================
  // 导航
  // ============================================

  function navigateTo(view) {
    state.view = view;
    updateActiveNav(view);
    switch(view) {
      case 'today':
        loadToday();
        break;
      case 'archive':
        loadArchive();
        break;
      case 'collections':
        loadCollections();
        break;
      case 'tracks':
        loadTracks();
        break;
    }
  }

  function updateActiveNav(view) {
    dom.navItems.forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-view') === view);
    });
    dom.mobileNavBtns.forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
  }

  // ============================================
  // 今日简报
  // ============================================

  async function loadToday() {
    dom.mainTitle.textContent = '今日简报';
    showPeriodTabs(true);
    renderLoading(dom.mainContent);

    try {
      const briefs = await DB.fetchTodayBriefs();
      state.briefs = briefs;
      renderTodayBriefs(briefs);
    } catch (err) {
      console.error('加载今日简报失败:', err);
      renderError('加载失败，请检查网络连接或数据库是否已配置', err);
    }
  }

  function renderTodayBriefs(briefs) {
    let filtered = briefs;
    if (state.period !== 'all') {
      filtered = briefs.filter(function(b) { return b.period === state.period; });
    }

    if (filtered.length === 0) {
      renderEmpty('📭', '今日暂无简报内容');
      return;
    }

    let html = '';
    filtered.forEach(function(brief) {
      html += renderBriefHTML(brief);
    });
    dom.mainContent.innerHTML = html;

    // 绑定新闻条目操作按钮
    bindItemActionsForBriefs(filtered);
  }

  // ============================================
  // 历史归档
  // ============================================

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
    if (briefs.length === 0) {
      renderEmpty('📂', '暂无归档简报');
      return;
    }

    // 按日期分组
    const groups = {};
    briefs.forEach(function(b) {
      if (!groups[b.date]) groups[b.date] = [];
      groups[b.date].push(b);
    });

    const sortedDates = Object.keys(groups).sort().reverse();
    let html = '';
    sortedDates.forEach(function(date) {
      html += '<div class="date-group">' + formatDate(date) + '</div>';
      groups[date].forEach(function(brief) {
        html += renderBriefHTML(brief);
      });
    });
    dom.mainContent.innerHTML = html;
    bindItemActionsForBriefs(briefs);
  }

  // ============================================
  // 我的收藏
  // ============================================

  async function loadCollections() {
    dom.mainTitle.textContent = '我的收藏';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);

    try {
      const annotations = await DB.fetchAnnotations();
      state.annotations = annotations;
      renderCollections(annotations);
    } catch (err) {
      console.error('加载收藏失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderCollections(annotations) {
    if (annotations.length === 0) {
      renderEmpty('⭐', '暂无收藏标注\n\n在简报中选中文字即可收藏');
      return;
    }

    let filtered = annotations;
    if (state.annoFilter !== 'all') {
      filtered = filtered.filter(function(a) { return a.annotation_type === state.annoFilter; });
    }
    if (state.annoSearchKey) {
      const kw = state.annoSearchKey.toLowerCase();
      filtered = filtered.filter(function(a) {
        return (a.selected_text && a.selected_text.toLowerCase().indexOf(kw) >= 0) ||
               (a.note && a.note.toLowerCase().indexOf(kw) >= 0);
      });
    }

    // 筛选条
    const counts = { all: annotations.length, star: 0, important: 0, track: 0 };
    annotations.forEach(function(a) { if (counts[a.annotation_type] !== undefined) counts[a.annotation_type]++; });

    let html = '<div class="filter-bar">';
    html += '<span class="filter-label">筛选:</span>';
    const filters = [
      { key: 'all', label: '全部', icon: '📋' },
      { key: 'star', label: '⭐ 收藏', icon: '' },
      { key: 'important', label: '🔥 重要', icon: '' },
      { key: 'track', label: '🔍 追踪', icon: '' }
    ];
    filters.forEach(function(f) {
      const active = state.annoFilter === f.key ? ' active' : '';
      html += '<span class="filter-chip' + active + '" data-filter="' + f.key + '">' + f.label + ' (' + counts[f.key] + ')</span>';
    });
    html += '</div>';

    // 搜索框
    html += '<div style="margin-bottom:16px"><input type="text" id="annoSearch" placeholder="搜索标注内容..." value="' + escapeHtml(state.annoSearchKey) + '" style="width:100%;height:36px;padding:0 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);outline:none;font-size:14px;font-family:var(--font)" /></div>';

    if (filtered.length === 0) {
      html += '<div class="empty-state"><div class="icon">🔍</div><p>没有匹配的标注</p></div>';
    } else {
      filtered.forEach(function(a) {
        const typeLabel = a.annotation_type === 'star' ? '⭐ 收藏' : a.annotation_type === 'important' ? '🔥 重要' : '🔍 追踪';
        let briefInfo = '';
        if (a.briefs) {
          briefInfo = ' · ' + a.briefs.title;
        }
        html += '<div class="annotation-card">';
        html += '  <div class="anno-text ' + a.annotation_type + '">' + escapeHtml(a.selected_text) + '</div>';
        if (a.note) {
          html += '  <div class="anno-note">📝 ' + escapeHtml(a.note) + '</div>';
        }
        html += '  <div class="anno-meta">';
        html += '    <span class="anno-badge ' + a.annotation_type + '">' + typeLabel + '</span>';
        html += '    <span>' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
        html += '    <span>' + briefInfo + '</span>';
        html += '    <button onclick="App.deleteAnno(\'' + a.id + '\')" style="margin-left:auto;background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px">🗑️ 删除</button>';
        html += '  </div>';
        html += '</div>';
      });
    }

    dom.mainContent.innerHTML = html;

    // 绑定筛选
    dom.mainContent.querySelectorAll('.filter-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        state.annoFilter = chip.getAttribute('data-filter');
        renderCollections(state.annotations);
      });
    });

    // 绑定搜索
    const annoSearch = document.getElementById('annoSearch');
    if (annoSearch) {
      annoSearch.addEventListener('input', function() {
        state.annoSearchKey = annoSearch.value.trim();
        renderCollections(state.annotations);
      });
    }
  }

  async function deleteAnno(id) {
    if (!confirm('确定删除这条标注？')) return;
    try {
      await DB.deleteAnnotation(id);
      toast('✅ 已删除');
      loadCollections();
    } catch (err) {
      toast('❌ 删除失败');
    }
  }

  // ============================================
  // 追踪线索
  // ============================================

  async function loadTracks() {
    dom.mainTitle.textContent = '追踪线索';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);

    try {
      const tracks = await DB.fetchTracks();
      state.tracks = tracks;
      // 获取标注数据
      const annotations = await DB.fetchAnnotations({ type: 'track' });
      renderTracks(tracks, annotations);
    } catch (err) {
      console.error('加载追踪线索失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderTracks(tracks, trackAnnotations) {
    let html = '';

    if (tracks.length === 0 && trackAnnotations.length === 0) {
      renderEmpty('🔍', '暂无追踪线索\n\n选中文字后选择「追踪」即可建立线索');
      return;
    }

    // 显示已有线索
    tracks.forEach(function(track) {
      html += '<div class="track-card">';
      html += '  <div class="track-header">';
      html += '    <span class="track-name">' + escapeHtml(track.name) + '</span>';
      html += '  </div>';
      if (track.description) {
        html += '  <div class="track-desc">' + escapeHtml(track.description) + '</div>';
      }
      if (track.tags && track.tags.length > 0) {
        html += '  <div class="track-tags">';
        track.tags.forEach(function(tag) {
          html += '<span class="tag">#' + escapeHtml(tag) + '</span>';
        });
        html += '  </div>';
      }
      html += '</div>';
    });

    // 按标签自动串联
    const tagGroups = {};
    trackAnnotations.forEach(function(a) {
      if (a.tags && a.tags.length > 0) {
        a.tags.forEach(function(tag) {
          if (!tagGroups[tag]) tagGroups[tag] = [];
          tagGroups[tag].push(a);
        });
      }
    });

    if (Object.keys(tagGroups).length > 0) {
      html += '<div class="date-group">按标签串联</div>';
      Object.keys(tagGroups).forEach(function(tag) {
        html += '<div class="track-card">';
        html += '  <div class="track-header"><span class="track-name">#' + escapeHtml(tag) + '</span></div>';
        html += '  <div class="track-timeline">';
        tagGroups[tag].forEach(function(a) {
          html += '<div class="timeline-item">' + escapeHtml(a.selected_text.substring(0, 100));
          if (a.selected_text.length > 100) html += '...';
          html += '<br><span style="font-size:12px;color:var(--text-muted)">' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
          html += '</div>';
        });
        html += '  </div>';
        html += '</div>';
      });
    }

    // 无标签的追踪标注
    const noTagTracks = trackAnnotations.filter(function(a) { return !a.tags || a.tags.length === 0; });
    if (noTagTracks.length > 0) {
      html += '<div class="date-group">其他追踪</div>';
      html += '<div class="track-card">';
      html += '  <div class="track-timeline">';
      noTagTracks.forEach(function(a) {
        html += '<div class="timeline-item">' + escapeHtml(a.selected_text.substring(0, 120));
        if (a.selected_text.length > 120) html += '...';
        html += '<br><span style="font-size:12px;color:var(--text-muted)">' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
        html += '</div>';
      });
      html += '  </div>';
      html += '</div>';
    }

    if (!html) {
      renderEmpty('🔍', '暂无追踪线索');
      return;
    }

    dom.mainContent.innerHTML = html;
  }

  // ============================================
  // 搜索
  // ============================================

  async function handleSearch(keyword) {
    dom.mainTitle.textContent = '搜索: ' + keyword;
    showPeriodTabs(false);
    renderLoading(dom.mainContent);

    try {
      const results = await DB.searchBriefs(keyword);
      state.briefs = results;
      if (results.length === 0) {
        renderEmpty('🔍', '未找到包含「' + keyword + '」的简报');
      } else {
        let html = '<div style="color:var(--text-secondary);font-size:14px;margin-bottom:16px">找到 ' + results.length + ' 条结果</div>';
        results.forEach(function(brief) {
          html += renderBriefHTML(brief);
        });
        dom.mainContent.innerHTML = html;
        bindItemActionsForBriefs(results);
      }
    } catch (err) {
      console.error('搜索失败:', err);
      renderError('搜索失败', err);
    }
  }

  // ============================================
  // 渲染
  // ============================================

  function renderBriefHTML(brief) {
    let html = '<div class="brief-card" data-brief-id="' + brief.id + '">';

    // 简报标题
    html += '<div class="brief-title">' + escapeHtml(brief.title) + '</div>';
    html += '<div class="brief-meta">';
    html += '<span>📅 ' + formatDate(brief.date) + '</span>';
    html += '<span>🕐 ' + brief.period + '</span>';
    if (brief.tags && brief.tags.length > 0) {
      html += '<span>🏷️ ' + brief.tags.map(function(t) { return '#' + escapeHtml(t); }).join(' ') + '</span>';
    }
    html += '</div>';

    // 解析并渲染条目
    const items = brief.items || parseMarkdownItems(brief.content);

    if (items && items.length > 0) {
      items.forEach(function(item, idx) {
        if (!item.title && !item.content) return;
        html += '<div class="news-item" data-item-idx="' + idx + '">';
        html += '  <div class="item-actions">';
        html += '    <button data-action="star" title="收藏">⭐</button>';
        html += '    <button data-action="important" title="重要">🔥</button>';
        html += '    <button data-action="search" title="搜索">🔍</button>';
        html += '  </div>';
        if (item.title) {
          html += '<div class="item-title">' + escapeHtml(item.title) + '</div>';
        }
        if (item.content) {
          html += '<div class="item-content">' + renderMarkdown(item.content) + '</div>';
        }
        if (item.source) {
          html += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted)">来源: ' + escapeHtml(item.source) + '</div>';
        }
        if (item.time) {
          html += '<div style="display:inline;font-size:12px;color:var(--text-muted)"> · ' + escapeHtml(item.time) + '</div>';
        }
        if (item.tags && item.tags.length > 0) {
          html += '<div class="item-tags">';
          item.tags.forEach(function(tag) {
            html += '<span class="item-tag">#' + escapeHtml(tag) + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      });
    } else {
      // 无条目，直接渲染全文
      html += '<div class="brief-content">' + renderMarkdown(brief.content) + '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindItemActionsForBriefs(briefs) {
    briefs.forEach(function(brief) {
      const briefEl = document.querySelector('[data-brief-id="' + brief.id + '"]');
      if (!briefEl) return;
      const items = brief.items || parseMarkdownItems(brief.content);
      const itemEls = briefEl.querySelectorAll('.news-item');
      itemEls.forEach(function(el, idx) {
        const item = items[idx];
        const title = item ? item.title : '';
        if (typeof Annotation !== 'undefined' && Annotation.bindItemActions) {
          Annotation.bindItemActions(el, title, brief.id);
        }
      });
    });
  }

  // ============================================
  // 工具函数
  // ============================================

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined') {
      try {
        return marked.parse(text);
      } catch(e) {
        return escapeHtml(text).replace(/\n/g, '<br>');
      }
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function parseMarkdownItems(content) {
    if (!content) return [];
    // 按 ## 标题分割
    const parts = content.split(/^## /m);
    if (parts.length <= 1) {
      // 尝试按 ### 分割
      const h3parts = content.split(/^### /m);
      if (h3parts.length > 1) {
        return h3parts.slice(1).map(function(part) {
          const lines = part.trim().split('\n');
          return { title: lines[0].trim(), content: lines.slice(1).join('\n').trim() };
        });
      }
      // 无标题分割，整篇作为一个条目
      return [{ title: '', content: content.trim() }];
    }
    return parts.slice(1).map(function(part) {
      const trimmed = part.trim();
      const lines = trimmed.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();
      return { title: title, content: body };
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(d);
    dateOnly.setHours(0, 0, 0, 0);
    const diff = Math.round((today - dateOnly) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showPeriodTabs(show) {
    if (dom.periodTabs) {
      dom.periodTabs.style.display = show ? 'flex' : 'none';
    }
  }

  function renderLoading(container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div><div>加载中...</div></div>';
  }

  function renderEmpty(icon, msg) {
    const lines = msg.split('\n');
    dom.mainContent.innerHTML = '<div class="empty-state"><div class="icon">' + icon + '</div>' +
      lines.map(function(l) { return '<p>' + escapeHtml(l) + '</p>'; }).join('') +
      '</div>';
  }

  function renderError(msg, err) {
    console.error(msg, err);
    dom.mainContent.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div>' +
      '<p>' + escapeHtml(msg) + '</p>' +
      '<p style="font-size:12px;margin-top:8px">' + escapeHtml(err.message || String(err)) + '</p></div>';
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
    setTimeout(function() { el.classList.remove('visible'); }, 2500);
  }

  function toggleSidebar() {
    if (dom.sidebar) dom.sidebar.classList.toggle('open');
    if (dom.sidebarOverlay) dom.sidebarOverlay.classList.toggle('visible');
  }

  function closeSidebar() {
    if (dom.sidebar) dom.sidebar.classList.remove('open');
    if (dom.sidebarOverlay) dom.sidebarOverlay.classList.remove('visible');
  }

  async function loadSidebarCounts() {
    try {
      const stats = await DB.fetchAnnotationStats();
      const collectionsItem = document.querySelector('.nav-item[data-view="collections"] .count');
      if (collectionsItem) collectionsItem.textContent = stats.total || '';
    } catch(e) {
      // 数据库可能未配置，静默
    }
  }

  // 设置今日日期显示
  function setTodayDate() {
    if (dom.dateToday) {
      const d = new Date();
      dom.dateToday.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
  }

  // Period tab 切换
  function setPeriod(period) {
    state.period = period;
    if (dom.periodTabs) {
      dom.periodTabs.querySelectorAll('.period-tab').forEach(function(tab) {
        tab.classList.toggle('active', tab.getAttribute('data-period') === period);
      });
    }
    if (state.briefs.length > 0) {
      renderTodayBriefs(state.briefs);
    }
  }

  return {
    init: init,
    navigateTo: navigateTo,
    setPeriod: setPeriod,
    toast: toast,
    deleteAnno: deleteAnno,
    parseMarkdownItems: parseMarkdownItems,
    renderMarkdown: renderMarkdown,
    formatDate: formatDate
  };
})();

// Period tab 全局事件
document.addEventListener('click', function(e) {
  if (e.target.classList && e.target.classList.contains('period-tab')) {
    App.setPeriod(e.target.getAttribute('data-period'));
  }
});

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', function() {
  App.init();
  // 设置今日日期
  const d = new Date();
  const dateEl = document.getElementById('dateToday');
  if (dateEl) dateEl.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';

  // 初始化标注模块
  if (typeof Annotation !== 'undefined') {
    Annotation.init();
  }
});
