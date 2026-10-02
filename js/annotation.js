/**
 * 划词标注 v3
 *
 * 设计要点（按阿鹏反馈）：
 * - 菜单一律出现在选中文字「下方」，不跟浏览器自带的复制/搜索条抢正上方
 * - 同一条文字 + 同一类型只能存一次，再点一次＝取消
 * - 每条消息右下角有 ⭐收藏 / 🔥重点 / 🔍追踪 / 📋Obsidian 四个按钮（带文字）
 * - 收藏·重点·追踪 存在本机（UserStore），不同访客互不影响
 * - 📋Obsidian：电脑端直接跳转 Obsidian；手机端复制格式化文本到剪贴板
 */
const Annotation = (function () {
  var menu = null;
  var currentSelection = '';
  var currentBriefId = '';
  var currentSection = '简报';
  var currentDate = '';
  var hideTimer = null;

  var OBS_FILE = '每日摘录';

  function init() {
    createMenu();
    bindEvents();
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile|MicroMessenger|Quark|UCBrowser|MQQBrowser/i.test(navigator.userAgent)
      || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }

  function createMenu() {
    menu = document.createElement('div');
    menu.className = 'selection-menu';
    menu.setAttribute('role', 'toolbar');
    menu.innerHTML =
      '<button type="button" class="menu-item" data-action="star">⭐<span>收藏</span></button>' +
      '<button type="button" class="menu-item" data-action="important">🔥<span>重点</span></button>' +
      '<button type="button" class="menu-item" data-action="track">🔍<span>追踪</span></button>' +
      '<button type="button" class="menu-item obsidian" data-action="obsidian">📋<span>Obsidian</span></button>';
    document.body.appendChild(menu);
    bindMenuEvents();
  }

  function bindEvents() {
    document.addEventListener('selectionchange', function () {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(syncFromSelection, isMobile() ? 140 : 40);
    });
    document.addEventListener('mouseup', function (e) {
      if (menu && menu.contains(e.target)) return;
      setTimeout(syncFromSelection, 30);
    });
    document.addEventListener('touchend', function (e) {
      if (menu && menu.contains(e.target)) return;
      setTimeout(syncFromSelection, 90);
    }, { passive: true });
    document.addEventListener('mousedown', function (e) {
      if (menu && !menu.contains(e.target)) hideMenu(false);
    });
    window.addEventListener('scroll', function () { hideMenu(false); }, { passive: true });
    window.addEventListener('resize', function () { hideMenu(false); });
  }

  function nodeEl(node) {
    if (!node) return null;
    return node.nodeType === 3 ? node.parentElement : node;
  }

  /* 从最近的板块标题往上找板块名 */
  function findSectionName(node) {
    var el = nodeEl(node);
    if (!el) return '简报';
    var sec = el.closest ? el.closest('.section[data-section]') : null;
    if (sec) {
      var h = sec.querySelector('.section-head h2');
      if (h) {
        var def = (window.App && App.SECTIONS || []).filter(function (s) { return s.id === sec.getAttribute('data-section'); })[0];
        return def ? def.name.replace(/^\S+\s*/, '') : h.textContent.replace(/^\S+\s*/, '').trim();
      }
    }
    var heading = el.closest ? el.closest('.item-sub') : null;
    if (heading) return heading.textContent.trim();
    var item = el.closest ? el.closest('.news-item') : null;
    if (item && item.getAttribute('data-section-name')) return item.getAttribute('data-section-name');
    return '简报';
  }

  function isoDateFromPage() {
    var el = document.getElementById('dateToday');
    if (el && el.getAttribute('data-iso')) return el.getAttribute('data-iso');
    var card = document.querySelector('[data-item-date]');
    if (card && card.getAttribute('data-item-date')) return card.getAttribute('data-item-date');
    var d = new Date();
    var p = function (n) { return String(n).length < 2 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function syncFromSelection() {
    if (!menu) return;
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { hideMenu(false); return; }
    var text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) { hideMenu(false); return; }
    var range;
    try { range = sel.getRangeAt(0); } catch (e) { hideMenu(false); return; }
    var rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hideMenu(false); return; }

    currentSelection = text;
    var el = nodeEl(range.startContainer);
    var briefEl = el && el.closest ? el.closest('[data-brief-id]') : null;
    currentBriefId = briefEl ? (briefEl.getAttribute('data-brief-id') || '') : '';
    var itemEl = el && el.closest ? el.closest('[data-item-text]') : null;
    currentDate = (itemEl && itemEl.getAttribute('data-item-date')) || isoDateFromPage();
    currentSection = findSectionName(range.startContainer);

    refreshToggleState();
    showMenu(rect);
  }

  function refreshToggleState() {
    if (!menu) return;
    ['star', 'important', 'track'].forEach(function (type) {
      var btn = menu.querySelector('[data-action="' + type + '"]');
      if (!btn) return;
      var on = window.UserStore && UserStore.isActive({
        brief_id: currentBriefId,
        selected_text: currentSelection,
        annotation_type: type
      });
      btn.classList.toggle('is-on', !!on);
    });
  }

  function showMenu(rect) {
    var width = Math.min(isMobile() ? 300 : 320, window.innerWidth - 16);
    var height = 48;
    var left = rect.left + rect.width / 2 - width / 2;
    var top = rect.bottom + 8;
    var maxLeft = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    if (left > maxLeft) left = maxLeft;
    /* 不往选区上方挤（那是浏览器自带工具条的地盘），贴着屏幕底部即可 */
    var maxTop = window.innerHeight - height - 8;
    if (top > maxTop) top = maxTop;
    menu.style.width = width + 'px';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.add('visible');
  }

  function hideMenu(clearSelection) {
    if (menu) menu.classList.remove('visible');
    resetObsidianBtn(menu && menu.querySelector('[data-action="obsidian"]'));
    if (clearSelection) {
      try { window.getSelection().removeAllRanges(); } catch (e) {}
    }
  }

  function resetObsidianBtn(btn) {
    if (!btn) return;
    btn.classList.remove('copied');
    btn.innerHTML = '📋<span>Obsidian</span>';
  }

  function bindMenuEvents() {
    menu.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation(); });
    menu.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
    menu.querySelectorAll('.menu-item').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        handleAction(btn.getAttribute('data-action'), btn);
      });
    });
  }

  function handleAction(action, btn) {
    if (action === 'obsidian') {
      saveToObsidian(btn, currentSelection, currentSection, currentDate);
      return;
    }
    toggleSave(action);
    flashMenuButton(btn, action);
  }

  function toggleSave(type, override) {
    if (!window.UserStore) return null;
    var text = (override && override.text) || currentSelection;
    if (!text) return null;
    var briefId = (override && override.briefId !== undefined) ? override.briefId : currentBriefId;
    var section = (override && override.section) || currentSection;
    var result = UserStore.toggleAnnotation({
      brief_id: briefId,
      selected_text: text,
      annotation_type: type,
      section: section
    });
    if (type === 'track' && result.active) UserStore.upsertTrack(section);
    if (window.App && App.syncItemActionState) App.syncItemActionState();
    if (window.App && App.refreshSidebarCounts) App.refreshSidebarCounts();
    var labels = { star: '收藏', important: '重点', track: '追踪' };
    toast(result.active ? '已' + labels[type] : '已取消' + labels[type]);
    return result;
  }

  function flashMenuButton(btn, type) {
    refreshToggleState();
    if (!btn) return;
    btn.classList.add('flash');
    setTimeout(function () { btn.classList.remove('flash'); }, 500);
  }

  /* ============ 条目右下角按钮 ============ */
  function bindAllIn(root) {
    if (!root) return;
    root.querySelectorAll('.item-actions').forEach(function (row) {
      var item = row.closest('[data-item-text]');
      if (!item) return;
      var text = item.getAttribute('data-item-text') || '';
      var briefId = item.getAttribute('data-brief-id') || '';
      var section = item.getAttribute('data-section-name') || '简报';
      var date = item.getAttribute('data-item-date') || isoDateFromPage();

      row.querySelectorAll('button[data-action]').forEach(function (btn) {
        if (btn.getAttribute('data-bound') === '1') return;
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          if (action === 'obsidian') {
            saveToObsidian(btn, text, section, date);
            return;
          }
          toggleSave(action, { text: text, briefId: briefId, section: section });
        });
      });
    });
  }

  /* 兼容旧调用 */
  function bindItemActions(card) { bindAllIn(card); }

  /* ============ Obsidian ============ */
  function buildPayload(text, section, date) {
    var d = date || isoDateFromPage();
    var sec = (section || '简报').replace(/[\s#\[\]]+/g, '') || '深度信息差';
    var ymd = d.replace(/-/g, '/');
    var raw = String(text || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

    var source = '', topic = '', bodyLines = [];
    raw.forEach(function (l) {
      var m = /^(?:来源|出处)[：:]\s*(.+)$/.exec(l);
      if (m) { source = m[1].trim(); return; }
      var jm = /^(?:判断|点评|解读|分析)[：:]\s*(.+)$/.exec(l);
      if (jm) { bodyLines.push('判断：' + jm[1].trim()); return; }
      var bm = /^\*\*[^*]{1,14}\*\*\s*[：:]?\s*(.*)$/.exec(l);
      if (bm) {
        var rest = (bm[1] || '').trim();
        if (rest) { if (!topic) topic = rest; bodyLines.push(rest); }
        return;
      }
      if (!topic && l.length > 4) topic = l.replace(/[。，,\s]+$/, '');
      bodyLines.push(l);
    });

    var fm = [
      '---',
      'tags:',
      '  - 碎片处理/' + sec,
      'created: ' + ymd,
      'updated: ' + ymd,
      'status: active',
      'source: ' + source,
      'type: raw-fragment',
      'confidence: ',
      'purpose: ',
      'topic: ' + topic,
      '---',
      ''
    ];
    var body = '# ' + topic + '\n\n' + (bodyLines.join('\n') || '') + '\n';
    return fm.join('\n') + body + '\n---\n来源：阿鹏资讯站 · ' + (section || '简报') + ' · ' + d;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  function flashCopied(btn) {
    if (!btn) return;
    btn.classList.add('copied');
    btn.innerHTML = '✅<span>已复制</span>';
    clearTimeout(btn._t);
    btn._t = setTimeout(function () { resetObsidianBtn(btn); }, 1500);
  }

  async function saveToObsidian(btn, text, section, date) {
    if (!text) return;
    var payload = buildPayload(text, section, date);
    var copied = await copyText(payload);
    if (isMobile()) {
      flashCopied(btn);
      toast(copied ? '已复制，去 Obsidian 粘贴' : '复制失败，请长按选中文字手动复制');
      return;
    }
    /* 电脑端：直接唤起 Obsidian 新建笔记 */
    var uri = 'obsidian://new?file=' + encodeURIComponent(OBS_FILE) +
      '&content=' + encodeURIComponent(payload);
    try {
      window.location.href = uri;
    } catch (e) {}
    flashCopied(btn);
    toast(copied ? '已复制并打开 Obsidian' : '已尝试打开 Obsidian');
  }

  function copyToObsidian(text, section, date, btn) {
    return saveToObsidian(btn, text, section, date);
  }

  function toast(msg) {
    if (window.App && typeof App.toast === 'function') { App.toast(msg); return; }
    var el = document.getElementById('annoToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'annoToast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('visible'); }, 2400);
  }

  return {
    init: init,
    bindAllIn: bindAllIn,
    bindItemActions: bindItemActions,
    toggleSave: toggleSave,
    copyToObsidian: copyToObsidian,
    buildPayload: buildPayload,
    isoDateFromPage: isoDateFromPage,
    isMobile: isMobile,
    toast: toast
  };
})();

window.Annotation = Annotation;
