/**
 * 阿鹏资讯站 - 管理页逻辑 v2.0
 * 表单提交、Markdown解析、标签管理、最近记录
 * 设计风格: today.ai 浅色温暖
 */

const Admin = (function() {

  // Supabase 配置
  const SUPABASE_URL = 'https://vxlylfiyvorfcgxbympt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_cQdNwcX_i9NInAVCzUmWgQ_GJUMptIH';
  let sb = null;
  let tags = [];

  /* 门禁密码：由 admin/index.html 的门禁存入 sessionStorage，用于向 /api/ingest 证明身份 */
  function adminPass() {
    try { return sessionStorage.getItem('apeng_admin_pass') || ''; } catch (e) { return ''; }
  }

  function init() {
    initClient();
    setupDefaults();
    bindEvents();
    loadRecent();
  }

  function initClient() {
    if (sb) return sb;
    if (typeof window.supabase !== 'undefined') {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return sb;
  }

  function setupDefaults() {
    // 设置默认日期为今天
    var today = new Date().toISOString().split('T')[0];
    document.getElementById('briefDate').value = today;

    // 根据当前时间设置默认时段
    var hour = new Date().getHours();
    var defaultPeriod = '早间';
    if (hour >= 11 && hour < 13) defaultPeriod = '午间';
    else if (hour >= 17 && hour < 22) defaultPeriod = '晚间';
    else if (hour >= 22 || hour < 7) defaultPeriod = '夜间';
    document.getElementById('briefPeriod').value = defaultPeriod;

    // 自动填充标题
    updateAutoTitle();
  }

  function updateAutoTitle() {
    var date = document.getElementById('briefDate').value;
    var period = document.getElementById('briefPeriod').value;
    if (date) {
      var d = date.split('-');
      document.getElementById('briefTitle').value = d[0] + '年' + d[1] + '月' + d[2] + '日 ' + period + '简报';
    }
  }

  function bindEvents() {
    // 时段变化时更新标题
    document.getElementById('briefPeriod').addEventListener('change', updateAutoTitle);
    document.getElementById('briefDate').addEventListener('change', updateAutoTitle);

    // 预览按钮
    document.getElementById('previewBtn').addEventListener('click', previewItems);

    // 提交按钮
    document.getElementById('submitBtn').addEventListener('click', submitBrief);

    // 标签输入
    var tagInput = document.getElementById('tagInput');
    tagInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = tagInput.value.trim();
        if (val && tags.indexOf(val) === -1) {
          tags.push(val);
          renderTags();
        }
        tagInput.value = '';
      }
      if (e.key === 'Backspace' && !tagInput.value && tags.length > 0) {
        tags.pop();
        renderTags();
      }
    });

    // textarea 自适应高度
    var textarea = document.getElementById('briefContent');
    textarea.addEventListener('input', autoResize);
    autoResize.call(textarea);
  }

  function autoResize() {
    this.style.height = 'auto';
    this.style.height = Math.max(300, this.scrollHeight) + 'px';
  }

  function renderTags() {
    var wrap = document.getElementById('tagInputWrap');
    var input = document.getElementById('tagInput');
    // 清除现有芯片
    var chips = wrap.querySelectorAll('.tag-chip');
    chips.forEach(function(c) { c.remove(); });

    // 重新渲染
    tags.forEach(function(tag) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = escapeHtml(tag) + '<button class="tag-remove" data-tag="' + escapeHtml(tag) + '">✕</button>';
      wrap.insertBefore(chip, input);
    });

    // 绑定删除
    wrap.querySelectorAll('.tag-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tag = btn.getAttribute('data-tag');
        tags = tags.filter(function(t) { return t !== tag; });
        renderTags();
      });
    });
  }

  // === Markdown 解析：先按 ## 切板块，再把板块正文切成条目 ===
  function splitSections(content) {
    var lines = String(content || '').replace(/[\r\n]/g, '\n').split('\n');
    var out = [];
    var cur = { heading: '', level: 0, lines: [] };
    var seen = false;
    lines.forEach(function (line) {
      var m = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
      if (m) {
        if (cur.heading || cur.lines.join('').trim() || seen) out.push(cur);
        cur = { heading: m[2].trim(), level: m[1].length, lines: [] };
        seen = true;
        return;
      }
      cur.lines.push(line);
    });
    out.push(cur);
    return out.filter(function (s) {
      return (s.heading && s.heading.trim()) || s.lines.join('').replace(/[-*\s]/g, '').trim();
    });
  }

  function parseItems(body) {
    var lines = String(body || '').replace(/[\r\n]/g, '\n').split('\n');
    var items = [];
    var sub = '';
    var pendingTable = null;
    var lastLead = '';

    function flushTable() {
      if (pendingTable && pendingTable.length) {
        var block = pendingTable.join('\n').trim();
        if (block) items.push({ text: block, lead: lastLead, sub: sub });
      }
      pendingTable = null;
    }

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var h3 = /^###\s+(.+?)\s*$/.exec(line);
      if (h3) { flushTable(); sub = h3[1].trim(); return; }
      if (!line.trim()) { flushTable(); return; }
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (!pendingTable) pendingTable = [];
        pendingTable.push(line.trim());
        return;
      }
      flushTable();
      var li = /^\s*(?:[-*+]|\d+[.、)]|•)\s+(.*)$/.exec(line);
      if (li && !/^\s{2,}/.test(line)) { items.push({ text: li[1].trim(), lead: lastLead, sub: sub }); return; }
      if (/^\s{2,}(?:[-*+]|\d+[.、)])\s+/.test(line) && items.length) {
        items[items.length - 1].text += '\n' + line.trim();
        return;
      }
      var para = line.trim();
      if (/[：:]$/.test(para) && para.length <= 40) { lastLead = para; return; }
      if (/^-{3,}$/.test(para)) return;
      items.push({ text: para, lead: '', sub: sub });
    });
    flushTable();
    return items;
  }

  function parseMarkdownSections(content) {
    var sections = [];
    splitSections(content).forEach(function (sec) {
      if (sec.level === 1) return;                // H1 是标题，不算板块
      var items = parseItems(sec.lines.join('\n'));
      if (!sec.heading && !items.length) return;
      sections.push({ heading: sec.heading || '（无标题板块）', items: items });
    });
    return sections;
  }

  function totalItems(sections) {
    return sections.reduce(function (n, s) { return n + s.items.length; }, 0);
  }

  // === 预览解析 ===
  function previewItems() {
    var content = document.getElementById('briefContent').value;
    if (!content.trim()) {
      showToast('请先粘贴简报内容', 'error');
      return;
    }
    var sections = parseMarkdownSections(content);
    var count = totalItems(sections);
    var preview = document.getElementById('preview');
    var list = document.getElementById('previewList');
    document.getElementById('itemCount').textContent = count;

    list.innerHTML = sections.map(function (sec) {
      return '<div class="preview-section">' +
        '<div class="ps-head">' + escapeHtml(sec.heading) + '<span class="ps-count">' + sec.items.length + ' 条</span></div>' +
        sec.items.map(function (item) {
          var text = String(item.text || '').replace(/\n/g, ' ');
          return '<div class="preview-item">' + escapeHtml(text.substring(0, 160)) + (text.length > 160 ? '...' : '') + '</div>';
        }).join('') +
        '</div>';
    }).join('');
    preview.classList.add('visible');
    showToast('共 ' + sections.length + ' 个板块 / ' + count + ' 条');
  }

  // === 提交写入（v3.2：改走服务端 /api/ingest，不再用前端公开 key 直连数据库）===
  async function submitBrief() {
    var date = document.getElementById('briefDate').value;
    var period = document.getElementById('briefPeriod').value;
    var title = document.getElementById('briefTitle').value.trim();
    var content = document.getElementById('briefContent').value.trim();

    if (!date) { showToast('请选择日期', 'error'); return; }
    if (!title) { showToast('请输入标题', 'error'); return; }
    if (!content) { showToast('请粘贴简报内容', 'error'); return; }

    var items = parseMarkdownSections(content);

    var btn = document.getElementById('submitBtn');
    var origText = btn.textContent;
    btn.textContent = '写入中...';
    btn.disabled = true;

    try {
      var res = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pass': adminPass()
        },
        body: JSON.stringify({
          date: date,
          period: period,
          title: title,
          content: content,
          items: items,
          tags: tags,
          is_public: true
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.ok) throw new Error(data.error || ('HTTP ' + res.status));

      showToast('✅ 写入成功！共 ' + items.length + ' 个板块', 'success');
      // 清空内容
      document.getElementById('briefContent').value = '';
      tags = [];
      renderTags();
      document.getElementById('preview').classList.remove('visible');
      // 重新加载最近列表
      loadRecent();
    } catch (err) {
      console.error('写入失败:', err);
      showToast('❌ 写入失败: ' + (err.message || err), 'error');
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  // === 加载最近写入 ===
  async function loadRecent() {
    try {
      var result = await sb.from('briefs')
        .select('id,date,period,title')
        .order('created_at', { ascending: false })
        .limit(5);
      if (result.error) throw result.error;
      var data = result.data;

      var list = document.getElementById('recentList');
      if (!data || data.length === 0) {
        list.innerHTML = '<div style="color:#9CA3AF;font-size:13px">暂无简报，写入第一条试试</div>';
        return;
      }
      list.innerHTML = data.map(function(b) {
        return '<div class="recent-item">' +
          '<span class="ri-date">' + b.date + '</span>' +
          '<span class="ri-period ' + b.period + '">' + b.period + '</span>' +
          '<span class="ri-title">' + escapeHtml(b.title) + '</span>' +
          '<button class="ri-delete" data-id="' + b.id + '" title="删除">🗑️</button>' +
          '</div>';
      }).join('');

      // 绑定删除按钮
      list.querySelectorAll('.ri-delete').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          if (!confirm('确定删除这条简报？')) return;
          var id = btn.getAttribute('data-id');
          try {
            var delRes = await fetch('/api/ingest?id=' + encodeURIComponent(id), {
              method: 'DELETE',
              headers: { 'x-admin-pass': adminPass() }
            });
            var delData = await delRes.json().catch(function () { return {}; });
            if (!delRes.ok || !delData.ok) throw new Error(delData.error || ('HTTP ' + delRes.status));
            showToast('✅ 已删除', 'success');
            loadRecent();
          } catch (err) {
            showToast('❌ 删除失败: ' + (err.message || ''), 'error');
          }
        });
      });
    } catch (err) {
      document.getElementById('recentList').innerHTML =
        '<div style="color:#EF4444;font-size:13px">加载失败: ' + escapeHtml(err.message || '') + '</div>';
    }
  }

  // === 工具函数 ===
  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showToast(msg, type) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.classList.add('visible');
    setTimeout(function() {
      toast.classList.remove('visible');
    }, 3000);
  }

  return {
    init: init
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  Admin.init();
});
