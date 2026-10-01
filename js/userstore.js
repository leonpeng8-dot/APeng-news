/**
 * 本机私密标注存储
 * 收藏 / 重点 / 追踪只存在当前浏览器，不同访客互不影响。
 */
const UserStore = (function () {
  var ID_KEY = 'apeng_visitor_id';
  var ANNO_KEY = 'apeng_annotations_v1';
  var TRACK_KEY = 'apeng_tracks_v1';

  function visitorId() {
    var id = '';
    try { id = localStorage.getItem(ID_KEY) || ''; } catch (e) {}
    if (!id) {
      id = 'v_' + (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(16).slice(2)));
      try { localStorage.setItem(ID_KEY, id); } catch (e) {}
    }
    return id;
  }

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function write(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function fingerprint(annotation) {
    return [
      annotation.annotation_type || '',
      annotation.brief_id || '',
      normalizeText(annotation.selected_text)
    ].join('|').toLowerCase();
  }

  function listAnnotations(filter) {
    filter = filter || {};
    var list = read(ANNO_KEY);
    if (filter.type) {
      list = list.filter(function (a) { return a.annotation_type === filter.type; });
    }
    if (filter.briefId) {
      list = list.filter(function (a) { return String(a.brief_id) === String(filter.briefId); });
    }
    list.sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return list;
  }

  function findMatch(annotation) {
    var fp = fingerprint(annotation);
    return read(ANNO_KEY).find(function (a) { return fingerprint(a) === fp; }) || null;
  }

  function isActive(annotation) {
    return !!findMatch(annotation);
  }

  /** 同一条文字+类型只能存一次；再点一次则取消 */
  function toggleAnnotation(annotation) {
    var list = read(ANNO_KEY);
    var fp = fingerprint(annotation);
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (fingerprint(list[i]) === fp) { idx = i; break; }
    }
    if (idx >= 0) {
      var removed = list[idx];
      list.splice(idx, 1);
      write(ANNO_KEY, list);
      return { active: false, record: removed };
    }
    var record = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(16).slice(2),
      brief_id: annotation.brief_id || null,
      selected_text: normalizeText(annotation.selected_text),
      annotation_type: annotation.annotation_type,
      tags: annotation.tags || [],
      note: annotation.note || null,
      section: annotation.section || '',
      created_at: new Date().toISOString()
    };
    list.unshift(record);
    write(ANNO_KEY, list);
    return { active: true, record: record };
  }

  function deleteAnnotation(id) {
    write(ANNO_KEY, read(ANNO_KEY).filter(function (a) { return a.id !== id; }));
  }

  function stats() {
    var statsObj = { star: 0, important: 0, track: 0, total: 0 };
    read(ANNO_KEY).forEach(function (item) {
      if (statsObj[item.annotation_type] !== undefined) statsObj[item.annotation_type]++;
      statsObj.total++;
    });
    return statsObj;
  }

  function listTracks() {
    return read(TRACK_KEY);
  }

  function upsertTrack(name) {
    var list = read(TRACK_KEY);
    var found = list.find(function (t) { return t.name === name; });
    if (found) return found;
    var track = {
      id: 't_' + Date.now(),
      name: name,
      description: '',
      tags: [],
      created_at: new Date().toISOString()
    };
    list.unshift(track);
    write(TRACK_KEY, list);
    return track;
  }

  return {
    visitorId: visitorId,
    listAnnotations: listAnnotations,
    findMatch: findMatch,
    isActive: isActive,
    toggleAnnotation: toggleAnnotation,
    deleteAnnotation: deleteAnnotation,
    stats: stats,
    listTracks: listTracks,
    upsertTrack: upsertTrack,
    fingerprint: fingerprint,
    normalizeText: normalizeText
  };
})();

window.UserStore = UserStore;
