/**
 * 阿鹏资讯站 - 划词标注模块
 * 选中文字后弹出浮动菜单，支持收藏/重要/搜索/备注
 * 桌面端 mouseup + 移动端 touchend 双兼容
 */

const Annotation = (function() {

  let menu = null;
  let currentSelection = '';
  let currentBriefId = null;
  let noteMode = false;

  // 搜索引擎入口
  const SEARCH_ENGINES = [
    { name: '百度', url: 'https://www.baidu.com/s?wd=', icon: '🔍' },
    { name: 'Google', url: 'https://www.google.com/search?q=', icon: '🌐' },
    { name: 'B站', url: 'https://search.bilibili.com/all?keyword=', icon: '📺' },
    { name: '微信', url: 'https://weixin.sogou.com/weixin?type=2&query=', icon: '💬' }
  ];

  /** 初始化 */
  function init() {
    createMenu();
    bindEvents();
  }

  /** 创建浮动菜单 DOM */
  function createMenu() {
    menu = document.createElement('div');
    menu.className = 'selection-menu';
    menu.innerHTML = `
      <button class="menu-item" data-action="star">
        <span class="icon">⭐</span><span>收藏</span>
      </button>
      <button class="menu-item" data-action="important">
        <span class="icon">🔥</span><span>重要</span>
      </button>
      <div class="menu-divider"></div>
      <button class="menu-item" data-action="search">
        <span class="icon">🔎</span><span>深度搜索</span>
      </button>
      <div class="search-submenu" id="searchSubmenu">
        ${SEARCH_ENGINES.map(e => `
          <a class="menu-item search-link" data-url="${e.url}" data-engine="${e.name}">
            <span class="icon">${e.icon}</span><span>${e.name}</span>
          </a>
        `).join('')}
      </div>
      <div class="menu-divider"></div>
      <button class="menu-item" data-action="note">
        <span class="icon">✏️</span><span>加备注</span>
      </button>
      <input type="text" class="note-input" id="noteInput" placeholder="输入备注后回车保存..." style="display:none" />
    `;
    document.body.appendChild(menu);
    bindMenuEvents();
  }

  /** 绑定选词事件 */
  function bindEvents() {
    // 桌面端
    document.addEventListener('mouseup', handleSelection);
    // 移动端
    document.addEventListener('touchend', handleSelection);
    // 点击空白关闭菜单
    document.addEventListener('mousedown', function(e) {
      if (menu && menu.classList.contains('visible')) {
        if (!menu.contains(e.target)) {
          hideMenu();
        }
      }
    });
    // 滚动时隐藏菜单
    window.addEventListener('scroll', hideMenu, { passive: true });
    // 窗口大小变化时隐藏
    window.addEventListener('resize', hideMenu);
  }

  /** 处理选中文字 */
  function handleSelection(e) {
    // 略过菜单内的事件
    if (menu && menu.contains(e.target)) return;
    // 略过输入框和按钮
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // 延迟获取选区（兼容鼠标释放时序）
    setTimeout(function() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        hideMenu();
        return;
      }
      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        hideMenu();
        return;
      }

      // 获取选区所在的范围
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideMenu();
        return;
      }

      currentSelection = text;
      // 尝试找到所属的简报 ID
      const briefEl = range.startContainer.parentElement.closest('[data-brief-id]');
      currentBriefId = briefEl ? briefEl.getAttribute('data-brief-id') : null;

      showMenu(rect);
    }, 10);
  }

  /** 显示浮动菜单 */
  function showMenu(rect) {
    // 隐藏搜索子菜单和备注输入
    document.getElementById('searchSubmenu').classList.remove('visible');
    document.getElementById('noteInput').style.display = 'none';
    noteMode = false;

    // 计算位置
    const menuWidth = 200;
    const menuHeight = 220;
    let left = rect.left + (rect.width / 2) - (menuWidth / 2);
    let top = rect.top - menuHeight - 8;

    // 边界检测
    if (top < 60) {
      // 空间不够，放到选区下方
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

  /** 隐藏菜单 */
  function hideMenu() {
    if (menu) menu.classList.remove('visible');
    if (document.getElementById('searchSubmenu')) {
      document.getElementById('searchSubmenu').classList.remove('visible');
    }
    if (document.getElementById('noteInput')) {
      document.getElementById('noteInput').style.display = 'none';
    }
    noteMode = false;
    // 清除选区
    try { window.getSelection().removeAllRanges(); } catch(e) {}
  }

  /** 绑定菜单按钮事件 */
  function bindMenuEvents() {
    const items = menu.querySelectorAll('.menu-item[data-action]');
    items.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const action = btn.getAttribute('data-action');
        handleAction(action);
      });
    });

    // 搜索引擎链接
    const searchLinks = menu.querySelectorAll('.search-link');
    searchLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const baseUrl = link.getAttribute('data-url');
        const engine = link.getAttribute('data-engine');
        const searchUrl = baseUrl + encodeURIComponent(currentSelection);
        openSearchUrl(searchUrl, engine);
      });
    });

    // 备注输入
    const noteInput = document.getElementById('noteInput');
    noteInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const note = noteInput.value.trim();
        if (note) {
          saveAnnotation('star', note);
          hideMenu();
        }
      } else if (e.key === 'Escape') {
        hideMenu();
      }
    });
    noteInput.addEventListener('blur', function() {
      if (noteMode) {
        const note = noteInput.value.trim();
        if (note) {
          saveAnnotation('star', note);
        }
        hideMenu();
      }
    });
  }

  /** 处理菜单动作 */
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
        // 显示搜索子菜单
        const submenu = document.getElementById('searchSubmenu');
        submenu.classList.toggle('visible');
        break;
      case 'note':
        noteMode = true;
        document.getElementById('noteInput').style.display = 'block';
        document.getElementById('noteInput').focus();
        break;
    }
  }

  /** 保存标注到数据库 */
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

  /** 打开搜索 URL（微信兼容） */
  function openSearchUrl(url, engineName) {
    // 检测微信内置浏览器
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

    if (isWeChat) {
      // 微信内：复制链接到剪贴板
      copyToClipboard(url);
      showToast('📋 ' + engineName + '搜索链接已复制，请在浏览器中打开');
    } else {
      // 非微信：尝试新窗口打开
      const win = window.open(url, '_blank');
      if (!win) {
        // 弹窗被拦截，复制链接
        copyToClipboard(url);
        showToast('📋 弹窗被拦截，链接已复制到剪贴板');
      } else {
        showToast('🔍 已打开' + engineName + '搜索');
      }
    }
    hideMenu();
  }

  /** 复制到剪贴板 */
  function copyToClipboard(text) {
    // 优先用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function() {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(textarea);
  }

  /** 显示 Toast */
  function showToast(msg) {
    if (window.App && typeof window.App.toast === 'function') {
      window.App.toast(msg);
    } else {
      // 独立 toast
      let toast = document.getElementById('annoToast');
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

  /** 为新闻条目卡片绑定按钮事件 */
  function bindItemActions(card, itemTitle, briefId) {
    const buttons = card.querySelectorAll('.item-actions button');
    buttons.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
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
            // 直接显示搜索子菜单在按钮附近
            showItemSearchMenu(btn, itemTitle);
            break;
        }
      });
    });
  }

  /** 新闻条目搜索菜单（按钮旁弹出） */
  function showItemSearchMenu(btn, searchText) {
    // 移除旧的
    const old = document.getElementById('itemSearchMenu');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.id = 'itemSearchMenu';
    popup.className = 'selection-menu visible';
    popup.style.minWidth = '160px';
    popup.innerHTML = SEARCH_ENGINES.map(function(e) {
      return '<a class="menu-item search-link" data-url="' + e.url + '" data-engine="' + e.name + '">' +
             '<span class="icon">' + e.icon + '</span><span>' + e.name + '</span></a>';
    }).join('');

    document.body.appendChild(popup);

    // 定位
    const rect = btn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = (rect.right - 160) + 'px';
    popup.style.top = (rect.bottom + 4) + 'px';

    // 绑定搜索链接
    popup.querySelectorAll('.search-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const baseUrl = link.getAttribute('data-url');
        const engine = link.getAttribute('data-engine');
        const searchUrl = baseUrl + encodeURIComponent(searchText);
        openSearchUrl(searchUrl, engine);
        popup.remove();
      });
    });

    // 点击外部关闭
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
