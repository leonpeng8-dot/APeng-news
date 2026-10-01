/**
 * 阿鹏资讯站 - 主应用逻辑 v2.0
 * 负责加载简报、渲染、导航、搜索
 * 设计风格: today.ai 浅色温暖
 */

const App = (function() {

  const state = {
    view: 'today',
    period: 'all',
    searchKeyword: '',
    briefs: [],
    annotations: [],
    tracks: [],
    annoFilter: 'all',
    annoSearchKey: '',
    expandedBriefs: new Set()
  };

  let dom = {};

  function init() {
    cacheDom();
    bindEvents();
    initSupabase();
    configMarked();
    loadToday();
    loadSidebarCounts();
    setTodayDate();
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
    dom.navItems.forEach(function(item) {
      item.addEventListener('click', function() {
        navigateTo(item.getAttribute('data-view'));
        closeSidebar();
      });
    });

    dom.mobileNavBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        navigateTo(btn.getAttribute('data-view'));
      });
    });

    if (dom.menuBtn) {
      dom.menuBtn.addEventListener('click', toggleSidebar);
    }
    if (dom.sidebarOverlay) {
      dom.sidebarOverlay.addEventListener('click', closeSidebar);
    }

    if (dom.searchInput) {
      let searchTimer = null;
      dom.searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        var kw = dom.searchInput.value.trim();
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
          var kw = dom.searchInput.value.trim();
          if (kw) {
            state.searchKeyword = kw;
            handleSearch(kw);
          }
        }
      });
    }

    var logo = document.querySelector('.topbar .logo');
    if (logo) {
      logo.addEventListener('click', function() {
        navigateTo('today');
      });
    }

    // 简报卡片点击展开/折叠（事件委托）
    dom.mainContent.addEventListener('click', function(e) {
      var card = e.target.closest('.brief-card');
      if (!card) return;
      // 忽略点击新闻条目操作按钮
      if (e.target.closest('.item-actions')) return;
      // 忽略点击链接
      if (e.target.tagName === 'A') return;

      var briefId = card.getAttribute('data-brief-id');
      if (state.expandedBriefs.has(briefId)) {
        state.expandedBriefs.delete(briefId);
        card.classList.remove('expanded');
      } else {
        state.expandedBriefs.add(briefId);
        card.classList.add('expanded');
        // 展开后绑定新闻条目操作
        var brief = state.briefs.find(function(b) { return String(b.id) === briefId; });
        if (brief) bindItemActionsForBrief(brief);
      }
    });
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
    state.expandedBriefs.clear();
    updateActiveNav(view);
    switch(view) {
      case 'today': loadToday(); break;
      case 'archive': loadArchive(); break;
      case 'collections': loadCollections(); break;
      case 'tracks': loadTracks(); break;
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
      var briefs = await DB.fetchTodayBriefs();
      state.briefs = briefs;
      renderTodayBriefs(briefs);
    } catch (err) {
      console.error('加载今日简报失败:', err);
      renderError('加载失败，请检查网络连接或数据库配置', err);
    }
  }

  function renderTodayBriefs(briefs) {
    var filtered = briefs;
    if (state.period !== 'all') {
      filtered = briefs.filter(function(b) { return b.period === state.period; });
    }

    if (filtered.length === 0) {
      renderEmpty('📭', '今日暂无简报内容', '请稍后再来，或查看历史归档');
      return;
    }

    var html = '';
    filtered.forEach(function(brief) {
      html += renderBriefCard(brief);
    });
    dom.mainContent.innerHTML = html;
  }

  // ============================================
  // 历史归档
  // ============================================

  async function loadArchive() {
    dom.mainTitle.textContent = '历史归档';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);

    try {
      var result = await DB.fetchAllBriefs(1, 100);
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

    var groups = {};
    briefs.forEach(function(b) {
      if (!groups[b.date]) groups[b.date] = [];
      groups[b.date].push(b);
    });

    var sortedDates = Object.keys(groups).sort().reverse();
    var html = '';
    sortedDates.forEach(function(date) {
      html += '<div class="date-group">' + formatDate(date) + '</div>';
      groups[date].forEach(function(brief) {
        html += renderBriefCard(brief);
      });
    });
    dom.mainContent.innerHTML = html;
  }

  // ============================================
  // 我的收藏
  // ============================================

  async function loadCollections() {
    dom.mainTitle.textContent = '我的收藏';
    showPeriodTabs(false);
    renderLoading(dom.mainContent);

    try {
      var annotations = await DB.fetchAnnotations();
      state.annotations = annotations;
      renderCollections(annotations);
    } catch (err) {
      console.error('加载收藏失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderCollections(annotations) {
    if (annotations.length === 0) {
      renderEmpty('⭐', '暂无收藏标注', '在简报中选中文字即可收藏');
      return;
    }

    var filtered = annotations;
    if (state.annoFilter !== 'all') {
      filtered = filtered.filter(function(a) { return a.annotation_type === state.annoFilter; });
    }
    if (state.annoSearchKey) {
      var kw = state.annoSearchKey.toLowerCase();
      filtered = filtered.filter(function(a) {
        return (a.selected_text && a.selected_text.toLowerCase().indexOf(kw) >= 0) ||
               (a.note && a.note.toLowerCase().indexOf(kw) >= 0);
      });
    }

    var counts = { all: annotations.length, star: 0, important: 0, track: 0 };
    annotations.forEach(function(a) { if (counts[a.annotation_type] !== undefined) counts[a.annotation_type]++; });

    var html = '<div class="filter-bar">';
    html += '<span class="filter-label">筛选:</span>';
    var filters = [
      { key: 'all', label: '全部' },
      { key: 'star', label: '⭐ 收藏' },
      { key: 'important', label: '🔥 重要' },
      { key: 'track', label: '🔍 追踪' }
    ];
    filters.forEach(function(f) {
      var active = state.annoFilter === f.key ? ' active' : '';
      html += '<span class="filter-chip' + active + '" data-filter="' + f.key + '">' + f.label + ' (' + counts[f.key] + ')</span>';
    });
    html += '</div>';

    html += '<div style="margin-bottom:16px"><input type="text" id="annoSearch" placeholder="搜索标注内容..." value="' + escapeHtml(state.annoSearchKey) + '" style="width:100%;height:36px;padding:0 12px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;color:#1A1A2E;outline:none;font-size:14px;font-family:inherit" /></div>';

    if (filtered.length === 0) {
      html += '<div class="empty-state"><div class="icon">🔍</div><p>没有匹配的标注</p></div>';
    } else {
      filtered.forEach(function(a) {
        var typeLabel = a.annotation_type === 'star' ? '⭐ 收藏' : a.annotation_type === 'important' ? '🔥 重要' : '🔍 追踪';
        var briefInfo = a.briefs ? ' · ' + escapeHtml(a.briefs.title) : '';
        html += '<div class="annotation-card">';
        html += '  <div class="anno-text ' + a.annotation_type + '">' + escapeHtml(a.selected_text) + '</div>';
        if (a.note) {
          html += '  <div class="anno-note">📝 ' + escapeHtml(a.note) + '</div>';
        }
        html += '  <div class="anno-meta">';
        html += '    <span class="anno-badge ' + a.annotation_type + '">' + typeLabel + '</span>';
        html += '    <span>' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
        html += '    <span>' + briefInfo + '</span>';
        html += '    <button class="anno-delete" onclick="App.deleteAnno(\'' + a.id + '\')">🗑️ 删除</button>';
        html += '  </div>';
        html += '</div>';
      });
    }

    dom.mainContent.innerHTML = html;

    dom.mainContent.querySelectorAll('.filter-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        state.annoFilter = chip.getAttribute('data-filter');
        renderCollections(state.annotations);
      });
    });

    var annoSearch = document.getElementById('annoSearch');
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
      var tracks = await DB.fetchTracks();
      state.tracks = tracks;
      var annotations = await DB.fetchAnnotations({ type: 'track' });
      renderTracks(tracks, annotations);
    } catch (err) {
      console.error('加载追踪线索失败:', err);
      renderError('加载失败', err);
    }
  }

  function renderTracks(tracks, trackAnnotations) {
    var html = '';

    if (tracks.length === 0 && trackAnnotations.length === 0) {
      renderEmpty('🔍', '暂无追踪线索', '选中文字后选择「追踪」即可建立线索');
      return;
    }

    tracks.forEach(function(track) {
      html += '<div class="track-card">';
      html += '  <div class="track-header"><span class="track-name">' + escapeHtml(track.name) + '</span></div>';
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

    var tagGroups = {};
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
          html += '<br><span style="font-size:12px;color:#9CA3AF">' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
          html += '</div>';
        });
        html += '  </div>';
        html += '</div>';
      });
    }

    var noTagTracks = trackAnnotations.filter(function(a) { return !a.tags || a.tags.length === 0; });
    if (noTagTracks.length > 0) {
      html += '<div class="date-group">其他追踪</div>';
      html += '<div class="track-card">';
      html += '  <div class="track-timeline">';
      noTagTracks.forEach(function(a) {
        html += '<div class="timeline-item">' + escapeHtml(a.selected_text.substring(0, 120));
        if (a.selected_text.length > 120) html += '...';
        html += '<br><span style="font-size:12px;color:#9CA3AF">' + formatDate(a.created_at ? a.created_at.split('T')[0] : '') + '</span>';
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
      var results = await DB.searchBriefs(keyword);
      state.briefs = results;
      if (results.length === 0) {
        renderEmpty('🔍', '未找到包含「' + keyword + '」的简报');
      } else {
        var html = '<div style="color:#6B7280;font-size:14px;margin-bottom:16px">找到 ' + results.length + ' 条结果</div>';
        results.forEach(function(brief) {
          html += renderBriefCard(brief);
        });
        dom.mainContent.innerHTML = html;
      }
    } catch (err) {
      console.error('搜索失败:', err);
      renderError('搜索失败', err);
    }
  }

  // ============================================
  // 渲染简报卡片
  // ============================================

  function renderBriefCard(brief) {
    var period = brief.period || '专题';
    var items = brief.items || parseMarkdownItems(brief.content);

    // 生成摘要（取前3条条目的标题，或内容前150字）
    var summary = '';
    if (items && items.length > 0) {
      var titleParts = items.filter(function(it) { return it.title; }).slice(0, 3).map(function(it) { return it.title; });
      if (titleParts.length > 0) {
        summary = titleParts.join(' · ');
      } else {
        summary = brief.content.substring(0, 150).replace(/[#*>`]/g, '').trim();
      }
    } else {
      summary = brief.content.substring(0, 150).replace(/[#*>`]/g, '').trim();
    }

    var html = '<div class="brief-card" data-brief-id="' + brief.id + '">';
    html += '<div class="brief-bar ' + period + '"></div>';
    html += '<div class="brief-body">';

    // 头部：时段标签 + 日期
    html += '<div class="brief-header">';
    html += '<span class="period-badge ' + period + '">' + period + '</span>';
    html += '<span class="brief-date">' + formatDate(brief.date) + '</span>';
    html += '</div>';

    // 标题
    html += '<div class="brief-title">' + escapeHtml(brief.title) + '</div>';

    // 摘要（折叠状态显示）
    html += '<div class="brief-summary">' + escapeHtml(summary) + '</div>';

    // 展开后的完整内容
    if (items && items.length > 0) {
      items.forEach(function(item, idx) {
        if (!item.title && !item.content) return;
        html += '<div class="news-item" data-item-idx="' + idx + '" style="display:none">';
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
          html += '<div style="margin-top:8px;font-size:12px;color:#9CA3AF">来源: ' + escapeHtml(item.source) + '</div>';
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
      html += '<div class="news-item" style="display:none"><div class="item-content">' + renderMarkdown(brief.content) + '</div></div>';
    }

    // 底部标签和时间
    html += '<div class="brief-footer">';
    if (brief.tags && brief.tags.length > 0) {
      brief.tags.forEach(function(tag) {
        html += '<span class="brief-tag">#' + escapeHtml(tag) + '</span>';
      });
    }
    var timeStr = brief.created_at ? brief.created_at.split('T')[1].substring(0, 5) : '';
    html += '<span class="brief-time">' + timeStr + '</span>';
    html += '</div>';

    // 展开提示
    html += '<div class="expand-hint">点击展开全文 ▼</div>';

    html += '</div>';
    html += '</div>';
    return html;
  }

  // 展开时显示新闻条目，绑定操作按钮
  function bindItemActionsForBrief(brief) {
    var briefEl = document.querySelector('[data-brief-id="' + brief.id + '"]');
    if (!briefEl) return;
    var itemEls = briefEl.querySelectorAll('.news-item');
    itemEls.forEach(function(el) {
      el.style.display = 'block';
    });

    var items = brief.items || parseMarkdownItems(brief.content);
    itemEls.forEach(function(el, idx) {
      var item = items[idx];
      var title = item ? item.title : '';
      if (typeof Annotation !== 'undefined' && Annotation.bindItemActions) {
        Annotation.bindItemActions(el, title, brief.id);
      }
    });

    // 隐藏展开提示
    var hint = briefEl.querySelector('.expand-hint');
    if (hint) hint.textContent = '点击收起 ▲';
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
    var parts = content.split(/^## /m);
    if (parts.length <= 1) {
      var h3parts = content.split(/^### /m);
      if (h3parts.length > 1) {
        return h3parts.slice(1).map(function(part) {
          var lines = part.trim().split('\n');
          return { title: lines[0].trim(), content: lines.slice(1).join('\n').trim() };
        });
      }
      return [{ title: '', content: content.trim() }];
    }
    return parts.slice(1).map(function(part) {
      var trimmed = part.trim();
      var lines = trimmed.split('\n');
      return { title: lines[0].trim(), content: lines.slice(1).join('\n').trim() };
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var dateOnly = new Date(d);
    dateOnly.setHours(0, 0, 0, 0);
    var diff = Math.round((today - dateOnly) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
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

  function renderEmpty(icon, msg, sub) {
    var html = '<div class="empty-state"><div class="icon">' + icon + '</div><p>' + escapeHtml(msg) + '</p>';
    if (sub) html += '<p style="font-size:13px;color:#D1D5DB">' + escapeHtml(sub) + '</p>';
    html += '</div>';
    dom.mainContent.innerHTML = html;
  }

  function renderError(msg, err) {
    console.error(msg, err);
    dom.mainContent.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div>' +
      '<p>' + escapeHtml(msg) + '</p>' +
      '<p style="font-size:12px;margin-top:8px;color:#D1D5DB">' + escapeHtml(err.message || String(err)) + '</p></div>';
  }

  function toast(msg) {
    var el = document.getElementById('appToast');
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
      var stats = await DB.fetchAnnotationStats();
      var collectionsItem = document.querySelector('.nav-item[data-view="collections"] .count');
      if (collectionsItem) collectionsItem.textContent = stats.total || '';
    } catch(e) {}
  }

  function setTodayDate() {
    if (dom.dateToday) {
      var d = new Date();
      dom.dateToday.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
  }

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

// Period tab 切换
document.addEventListener('click', function(e) {
  if (e.target.classList && e.target.classList.contains('period-tab')) {
    App.setPeriod(e.target.getAttribute('data-period'));
  }
});

document.addEventListener('DOMContentLoaded', function() {
  App.init();
  if (typeof Annotation !== 'undefined') {
    Annotation.init();
  }
});
