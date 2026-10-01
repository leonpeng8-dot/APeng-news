/**
 * 阿鹏资讯站 - 划词标注模块 v2.0
 * 选中文字后弹出浮动菜单，支持收藏/重要/搜索
 * 桌面端 mouseup + 移动端 touchend 双兼容
 * 设计风格: today.ai 浅色温暖
 */

const Annotation = (function() {

  let menu = null;
  let currentSelection = '';
  let currentBriefId = null;
  let noteMode = false;

  // 搜索引擎入口（百度/Google/B站）
  const SEARCH_ENGINES = [
    { name: '百度', url: 'https://www.baidu.com/s?wd=', icon: '🔍' },
    { name: 'Google', url: 'https://www.google.com/search?q=', icon: '🌐' },
    { name: 'B站', url: 'https://search.bilibili.com/all?keyword=', icon: '📺' }
  ];

  function init() {
    createMenu();
    bindEvents();
  }

  function createMenu() {
    menu = document.createElement('div');
    menu.className = 'selection-menu';
    menu.innerHTML =
      '<button class="menu-item" data-action="star">' +
      '  <span class="icon">⭐</span><span>收藏</span>' +
      '</button>' +
      '<button class="menu-item" data-action="important">' +
      '  <span class="icon">🔥</span><span>重要</span>' +
      '</button>' +
      '<div class="menu-divider"></div>' +
      '<button class="menu-item" data-action="search">' +
      '  <span class="icon">🔎</span><span>深度搜索</span>' +
      '</button>' +
      '<div class="search-submenu" id="searchSubmenu">' +
      SEARCH_ENGINES.map(function(e) {
        return '<a class="menu-item search-link" data-url="' + e.url + '" data-engine="' + e.name + '">' +
          '<span class="icon">' + e.icon + '</span><span>' + e.name + '</span></a>';
      }).join('') +
      '</div>';
    document.body.appendChild(menu);
    bindMenuEvents();
  }

  function bindEvents() {
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    document.addEventListener('mousedown', function(e) {
      if (menu && menu.classList.contains('visible')) {
        if (!menu.contains(e.target)) {
          hideMenu();
        }
      }
    });
    window.addEventListener('scroll', hideMenu, { passive: true });
    window.addEventListener('resize', hideMenu);
  }

  function handleSelection(e) {
    if (menu && menu.contains(e.target)) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    setTimeout(function() {
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        hideMenu();
        return;
      }
      var text = sel.toString().trim();
      if (!text || text.length < 2) {
        hideMenu();
        return;
      }

      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideMenu();
        return;
      }

      currentSelection = text;
      var briefEl = range.startContainer.parentElement.closest('[data-brief-id]');
      currentBriefId = briefEl ? briefEl.getAttribute('data-brief-id') : null;

      showMenu(rect);
    }, 10);
  }

  function showMenu(rect) {
    var submenu = document.getElementById('searchSubmenu');
    if (submenu) submenu.classList.remove('visible');
    noteMode = false;

    var menuWidth = 180;
    var menuHeight = 160;
    var left = rect.left + (rect.width / 2) - (menuWidth / 2);
    var top = rect.top - menuHeight - 8;

    if (top < 60) {
      top = rect.bottom + 8;
    }
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.add('visible');
  }

  function hideMenu() {
    if (menu) menu.classList.remove('visible');
    var submenu = document.getElementById('searchSubmenu');
    if (submenu) submenu.classList.remove('visible');
    noteMode = false;
    try { window.getSelection().removeAllRanges(); } catch(e) {}
  }

  function bindMenuEvents() {
    var items = menu.querySelectorAll('.menu-item[data-action]');
    items.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        handleAction(btn.getAttribute('data-action'));
      });
    });

    var searchLinks = menu.querySelectorAll('.search-link');
    searchLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var baseUrl = link.getAttribute('data-url');
        var engine = link.getAttribute('data-engine');
        var searchUrl = baseUrl + encodeURIComponent(currentSelection);
        openSearchUrl(searchUrl, engine);
      });
    });
  }

  function handleAction(action) {
    switch(action) {
      case 'star':
        saveAnnotation('star', null);
        hideMenu();
        break;
      case 'important':
        saveAnnotation('important', null);
        hideMenu();
        break;
      case 'search':
        var submenu = document.getElementById('searchSubmenu');
        if (submenu) submenu.classList.toggle('visible');
        break;
    }
  }

  async function saveAnnotation(type, note) {
    if (!currentSelection) return;
    try {
      await DB.insertAnnotation({
        brief_id: currentBriefId,
        selected_text: currentSelection,
        annotation_type: type,
        tags: [],
        note: note || null
      });
      showToast(type === 'star' ? '⭐ 已收藏' : type === 'important' ? '🔥 已标记重要' : '✅ 已保存');
    } catch (err) {
      console.error('保存标注失败:', err);
      showToast('❌ 保存失败，请检查网络');
    }
  }

  function openSearchUrl(url, engineName) {
    var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
      copyToClipboard(url);
      showToast('📋 ' + engineName + '搜索链接已复制，请在浏览器中打开');
    } else {
      var win = window.open(url, '_blank');
      if (!win) {
        copyToClipboard(url);
        showToast('📋 弹窗被拦截，链接已复制到剪贴板');
      } else {
        showToast('🔍 已打开' + engineName + '搜索');
      }
    }
    hideMenu();
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(textarea);
  }

  function showToast(msg) {
    if (window.App && typeof window.App.toast === 'function') {
      window.App.toast(msg);
    } else {
      var toast = document.getElementById('annoToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'annoToast';
        toast.className = 'toast';
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      toast.classList.add('visible');
      setTimeout(function() { toast.classList.remove('visible'); }, 2500);
    }
  }

  function bindItemActions(card, itemTitle, briefId) {
    var buttons = card.querySelectorAll('.item-actions button');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var action = btn.getAttribute('data-action');
        currentBriefId = briefId;

        switch(action) {
          case 'star':
            currentSelection = itemTitle;
            saveAnnotation('star', null);
            btn.classList.toggle('active-star');
            break;
          case 'important':
            currentSelection = itemTitle;
            saveAnnotation('important', null);
            btn.classList.toggle('active-fire');
            break;
          case 'search':
            currentSelection = itemTitle;
            showItemSearchMenu(btn, itemTitle);
            break;
        }
      });
    });
  }

  function showItemSearchMenu(btn, searchText) {
    var old = document.getElementById('itemSearchMenu');
    if (old) old.remove();

    var popup = document.createElement('div');
    popup.id = 'itemSearchMenu';
    popup.className = 'selection-menu visible';
    popup.style.minWidth = '140px';
    popup.innerHTML = SEARCH_ENGINES.map(function(e) {
      return '<a class="menu-item search-link" data-url="' + e.url + '" data-engine="' + e.name + '">' +
             '<span class="icon">' + e.icon + '</span><span>' + e.name + '</span></a>';
    }).join('');

    document.body.appendChild(popup);

    var rect = btn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = (rect.right - 140) + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';

    popup.querySelectorAll('.search-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var baseUrl = link.getAttribute('data-url');
        var engine = link.getAttribute('data-engine');
        var searchUrl = baseUrl + encodeURIComponent(searchText);
        openSearchUrl(searchUrl, engine);
        popup.remove();
      });
    });

    setTimeout(function() {
      document.addEventListener('mousedown', function closeItemSearch(ev) {
        if (!popup.contains(ev.target)) {
          popup.remove();
          document.removeEventListener('mousedown', closeItemSearch);
        }
      });
    }, 100);
  }

  return {
    init: init,
    bindItemActions: bindItemActions,
    showToast: showToast,
    openSearchUrl: openSearchUrl,
    copyToClipboard: copyToClipboard
  };
})();

window.Annotation = Annotation;
