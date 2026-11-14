const RX = (() => {
  const QRE = /^\{(?:\d+(?:,\d*)?|,\d+)\}/;
  const META = /[\\^$.|?*+()[\]{}]/;

  function mk(t, raw, extra) { return Object.assign({ t, raw, q: '' }, extra || {}); }

  function parseClass(s, i, py) {
    let j = i + 1;
    if (s[j] === '^') j++;
    if (py && s[j] === ']') j++;
    while (j < s.length && s[j] !== ']') j += s[j] === '\\' ? 2 : 1;
    if (j >= s.length) return null;
    return j + 1;
  }

  function parseEscape(s, i) {
    const c = s[i + 1];
    if (c === undefined) return { n: mk('raw', '\\'), i: i + 1 };
    let m;
    const rest = s.slice(i + 1);
    if ((m = /^x[0-9a-fA-F]{2}/.exec(rest)) || (m = /^u\{[0-9a-fA-F]+\}/.exec(rest)) ||
        (m = /^u[0-9a-fA-F]{4}/.exec(rest)) || (m = /^[pP]\{[^}]*\}/.exec(rest)) ||
        (m = /^c[A-Za-z]/.exec(rest))) {
      return { n: mk('esc', '\\' + m[0]), i: i + 1 + m[0].length };
    }
    if ((m = /^k<[^>]+>/.exec(rest))) return { n: mk('ref', '\\' + m[0]), i: i + 1 + m[0].length };
    if (/[1-9]/.test(c)) {
      m = /^\d+/.exec(rest);
      return { n: mk('ref', '\\' + m[0]), i: i + 1 + m[0].length };
    }
    if ('bBAZ'.includes(c)) return { n: mk('anc', '\\' + c), i: i + 2 };
    return { n: mk('esc', '\\' + c), i: i + 2 };
  }

  function groupOpen(s, i) {
    const r = s.slice(i);
    let m;
    if ((m = /^\(\?P=(\w+)\)/.exec(r))) return { whole: mk('ref', m[0]), len: m[0].length };
    if ((m = /^\(\?#[^)]*\)/.exec(r))) return { whole: mk('raw', m[0], { cmt: true }), len: m[0].length };
    if ((m = /^\(\?[aiLmsux]+(?:-[imsx]+)?\)/.exec(r))) return { whole: mk('raw', m[0], { flagsOnly: true }), len: m[0].length };
    if ((m = /^\(\?(?:P<\w+>|<\w+>|<=|<!|:|=|!|>|[aiLmsux]*(?:-[imsx]+)?:)/.exec(r))) return { open: m[0], len: m[0].length };
    if (r.startsWith('(?')) return { whole: mk('raw', '(?'), len: 2 };
    return { open: '(', len: 1 };
  }

  function mergeLits(arr) {
    const out = [];
    for (const n of arr) {
      const last = out[out.length - 1];
      if (n.t === 'lit' && !n.q && last && last.t === 'lit' && !last.q) last.raw += n.raw;
      else out.push(n);
    }
    return out;
  }

  function parseSeq(s, i, depth, py) {
    const ch = [];
    while (i < s.length) {
      const c = s[i];
      if (c === ')' && depth > 0) break;
      if (c === ')') { ch.push(mk('raw', ')')); i++; continue; }
      if (c === '\\') { const r = parseEscape(s, i); ch.push(r.n); i = r.i; continue; }
      if (c === '[') {
        const e = parseClass(s, i, py);
        if (e === null) { ch.push(mk('raw', s.slice(i))); i = s.length; }
        else { ch.push(mk('cls', s.slice(i, e))); i = e; }
        continue;
      }
      if (c === '(') {
        const g = groupOpen(s, i);
        if (g.whole) { ch.push(g.whole); i += g.len; continue; }
        const r = parseSeq(s, i + g.len, depth + 1, py);
        const closed = s[r.i] === ')';
        ch.push({ t: 'grp', open: g.open, children: r.ch, closed, q: '' });
        i = closed ? r.i + 1 : r.i;
        continue;
      }
      if (c === '|') { ch.push(mk('alt', '|')); i++; continue; }
      if (c === '.') { ch.push(mk('dot', '.')); i++; continue; }
      if (c === '^' || c === '$') { ch.push(mk('anc', c)); i++; continue; }
      if (c === '*' || c === '+' || c === '?' || (c === '{' && QRE.test(s.slice(i)))) {
        let q = c;
        if (c === '{') q = QRE.exec(s.slice(i))[0];
        let j = i + q.length;
        if (s[j] === '?' || (s[j] === '+' && py)) { q += s[j]; j++; }
        const prev = ch[ch.length - 1];
        if (prev && !prev.q && ['lit', 'esc', 'cls', 'dot', 'grp', 'ref'].includes(prev.t)) prev.q = q;
        else ch.push(mk('raw', q));
        i = j;
        continue;
      }
      const cp = String.fromCodePoint(s.codePointAt(i));
      ch.push(mk('lit', cp));
      i += cp.length;
    }
    return { ch: mergeLits(ch), i };
  }

  function parse(src, dialect) {
    const r = parseSeq(src, 0, 0, dialect === 'py');
    return { t: 'root', children: r.ch };
  }

  function serialize(root) {
    let out = '';
    function walk(n) {
      n.start = out.length;
      if (n.t === 'grp') {
        out += n.open;
        n.cStart = out.length;
        n.children.forEach(walk);
        n.cEnd = out.length;
        if (n.closed) out += ')';
      } else out += n.raw;
      n.qStart = out.length;
      out += n.q;
      n.end = out.length;
    }
    root.children.forEach(walk);
    return out;
  }

  /* ---------- 경로 기반 편집 ---------- */
  function listAt(root, path) { // path 의 부모 children 배열
    let list = root.children;
    for (let k = 0; k < path.length - 1; k++) list = list[path[k]].children;
    return list;
  }
  function getNode(root, path) { return listAt(root, path)[path[path.length - 1]]; }
  function findPath(root, pred) {
    let found = null;
    (function rec(list, base) {
      list.forEach((n, i) => {
        if (found) return;
        const p = base.concat(i);
        if (pred(n)) { found = p; return; }
        if (n.t === 'grp') rec(n.children, p);
      });
    })(root.children, []);
    return found;
  }
  function samePath(a, b) { return !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]); }
  function isInside(path, anc) { return path.length > anc.length && anc.every((v, i) => path[i] === v); }

  function removeAt(root, path) { listAt(root, path).splice(path[path.length - 1], 1); }
  function insertAfter(root, path, node) {
    const l = listAt(root, path); const i = path[path.length - 1] + 1; l.splice(i, 0, node);
    return path.slice(0, -1).concat(i);
  }
  function insertEnd(root, node) { root.children.push(node); return [root.children.length - 1]; }
  function clone(n) { return JSON.parse(JSON.stringify(n)); }
  function duplicate(root, path) { return insertAfter(root, path, clone(getNode(root, path))); }
  function moveBy(root, path, d) {
    const l = listAt(root, path); const i = path[path.length - 1]; const j = i + d;
    if (j < 0 || j >= l.length) return path;
    [l[i], l[j]] = [l[j], l[i]];
    return path.slice(0, -1).concat(j);
  }
  // from 노드를 (parentPath, index) 위치로 이동. 자기 자손 안으로는 이동 불가.
  function moveTo(root, from, toParent, toIndex) {
    if (isInside(toParent, from) || samePath(toParent, from)) return null;
    const node = getNode(root, from);
    const fromList = listAt(root, from);
    const fi = from[from.length - 1];
    const parentChildren = (pp) => pp.length === 0 ? root.children : getNode(root, pp).children;
    const dest = parentChildren(toParent);
    const sameList = dest === fromList;
    fromList.splice(fi, 1);
    let idx = toIndex;
    if (sameList && fi < toIndex) idx--;
    dest.splice(idx, 0, node);
    // 이동 후 경로: 부모 경로는 제거로 인한 인덱스 변동을 반영해야 하므로 다시 찾는다.
    return findPath(root, (x) => x === node);
  }
  function wrapNode(root, path, open) {
    const l = listAt(root, path); const i = path[path.length - 1];
    const g = { t: 'grp', open, children: [l[i]], closed: true, q: '' };
    l[i] = g; return path;
  }
  function unwrap(root, path) {
    const l = listAt(root, path); const i = path[path.length - 1]; const g = l[i];
    if (g.t !== 'grp') return path;
    l.splice(i, 1, ...g.children); return path;
  }
  /* ---------- 연속 범위 편집 (같은 목록 안의 count 개) ---------- */
  function wrapRange(root, path, count, open) {
    const l = listAt(root, path); const i = path[path.length - 1];
    const items = l.splice(i, count);
    l.splice(i, 0, { t: 'grp', open, children: items, closed: true, q: '' });
    return path;
  }
  function removeRange(root, path, count) { listAt(root, path).splice(path[path.length - 1], count); }
  function duplicateRange(root, path, count) {
    const l = listAt(root, path); const i = path[path.length - 1];
    const copy = l.slice(i, i + count).map(clone);
    l.splice(i + count, 0, ...copy);
    return path.slice(0, -1).concat(i + count);
  }
  function moveRangeBy(root, path, count, d) {
    const l = listAt(root, path); const i = path[path.length - 1];
    if (d < 0 && i > 0) { const x = l.splice(i - 1, 1)[0]; l.splice(i - 1 + count, 0, x); return path.slice(0, -1).concat(i - 1); }
    if (d > 0 && i + count < l.length) { const x = l.splice(i + count, 1)[0]; l.splice(i, 0, x); return path.slice(0, -1).concat(i + 1); }
    return path;
  }
  function numberGroups(root) {
    let n = 0; const names = {};
    (function rec(list) {
      list.forEach((x) => {
        if (x.t === 'grp') {
          const kind = groupKind(x.open);
          x.gnum = 0;
          if (kind === 'cap' || kind === 'named') { x.gnum = ++n; if (kind === 'named') names[n] = groupName(x.open); }
          rec(x.children);
        }
      });
    })(root.children);
    return { count: n, names };
  }

  /* ---------- 그룹 종류 ---------- */
  function groupKind(open) {
    if (open === '(') return 'cap';
    if (open === '(?:') return 'nc';
    if (open === '(?=') return 'la';
    if (open === '(?!') return 'nla';
    if (open === '(?<=') return 'lb';
    if (open === '(?<!') return 'nlb';
    if (open === '(?>') return 'atomic';
    if (/^\(\?P?<\w+>$/.test(open)) return 'named';
    return 'other';
  }
  function groupName(open) { const m = /<(\w+)>/.exec(open); return m ? m[1] : ''; }
  const GROUP_LABEL = {
    cap: '캡처 그룹', nc: '묶기만 (캡처 안 함)', named: '이름 붙인 캡처 그룹',
    la: '뒤에 ~가 있어야 함 (lookahead)', nla: '뒤에 ~가 없어야 함', lb: '앞에 ~가 있어야 함 (lookbehind)',
    nlb: '앞에 ~가 없어야 함', atomic: '원자 그룹', other: '옵션 그룹'
  };
  function groupOpenFor(kind, name, dialect) {
    switch (kind) {
      case 'cap': return '(';
      case 'nc': return '(?:';
      case 'la': return '(?=';
      case 'nla': return '(?!';
      case 'lb': return '(?<=';
      case 'nlb': return '(?<!';
      case 'atomic': return '(?>';
      case 'named': return (dialect === 'py' ? '(?P<' : '(?<') + (name || 'name') + '>';
    }
    return '(';
  }

  /* ---------- 한정자 ---------- */
  function parseQ(q) {
    if (!q) return { mode: 'none', min: 1, max: 1, lazy: false, poss: false };
    let lazy = false, poss = false, b = q;
    if (b.length > 1 && b.endsWith('?')) { lazy = true; b = b.slice(0, -1); }
    else if (b.length > 1 && b.endsWith('+') && b !== '+') { poss = true; b = b.slice(0, -1); }
    if (b === '?') return { mode: 'opt', min: 0, max: 1, lazy, poss };
    if (b === '*') return { mode: 'star', min: 0, max: Infinity, lazy, poss };
    if (b === '+') return { mode: 'plus', min: 1, max: Infinity, lazy, poss };
    const m = /^\{(\d*)(,?)(\d*)\}$/.exec(b);
    if (m) {
      const min = m[1] === '' ? 0 : +m[1];
      const max = m[2] === '' ? min : (m[3] === '' ? Infinity : +m[3]);
      return { mode: 'range', min, max, lazy, poss };
    }
    return { mode: 'none', min: 1, max: 1, lazy: false, poss: false };
  }
  function buildQ(o) {
    let b = '';
    if (o.mode === 'none') return '';
    if (o.mode === 'opt') b = '?';
    else if (o.mode === 'star') b = '*';
    else if (o.mode === 'plus') b = '+';
    else {
      const min = Math.max(0, o.min | 0);
      if (o.max === Infinity || o.max === null) b = '{' + min + ',}';
      else if (o.max === min) b = '{' + min + '}';
      else b = '{' + min + ',' + Math.max(min, o.max | 0) + '}';
    }
    if (o.lazy) b += '?'; else if (o.poss) b += '+';
    return b;
  }
  function describeQ(q) {
    const o = parseQ(q);
    if (o.mode === 'none') return '';
    let s;
    if (o.mode === 'opt') s = '없거나 1번';
    else if (o.mode === 'star') s = '0번 이상';
    else if (o.mode === 'plus') s = '1번 이상';
    else if (o.max === o.min) s = o.min + '번';
    else if (o.max === Infinity) s = o.min + '번 이상';
    else s = o.min + '~' + o.max + '번';
    if (o.lazy) s += ', 가능한 적게';
    if (o.poss) s += ', 되돌리지 않음';
    return s;
  }

  /* ---------- 문자 집합 ---------- */
  const CLS_NAMES = [
    ['a-z', '영문 소문자'], ['A-Z', '영문 대문자'], ['0-9', '숫자'], ['가-힣', '한글'],
    ['ㄱ-ㅎ', '자음'], ['ㅏ-ㅣ', '모음'], ['\\s', '공백'], ['\\w', '영문·숫자·_'], ['\\d', '숫자'],
    ['_', '밑줄'], ['-', '하이픈'], ['.', '마침표'], ['@', '@']
  ];
  function splitClass(raw) {
    const neg = raw[1] === '^';
    return { neg, body: raw.slice(neg ? 2 : 1, -1) };
  }
  function describeClass(raw) {
    const { neg, body } = splitClass(raw);
    let rest = body; const parts = [];
    for (const [k, v] of CLS_NAMES) {
      if (k.length > 1 && rest.includes(k)) { parts.push(v); rest = rest.split(k).join(''); }
    }
    for (const [k, v] of CLS_NAMES) {
      if (k.length === 1 && rest.includes(k) && k !== '\\') { parts.push(v === k ? "'" + k + "'" : v); rest = rest.split(k).join(''); }
    }
    rest = rest.replace(/\\(.)/g, '$1');
    if (rest) parts.push("'" + rest + "'");
    return (parts.join(' · ') || '(비어 있음)') + (neg ? ' 이(가) 아닌 문자' : ' 중 한 글자');
  }

  /* ---------- 설명 ---------- */
  const ESC_DESC = {
    '\\d': '숫자', '\\D': '숫자가 아닌 문자', '\\w': '영문·숫자·밑줄', '\\W': '영문·숫자·밑줄이 아닌 문자',
    '\\s': '공백 문자(스페이스·탭·줄바꿈)', '\\S': '공백이 아닌 문자', '\\n': '줄바꿈', '\\t': '탭', '\\r': '캐리지 리턴'
  };
  const ANC_DESC = {
    '^': '줄(문자열)의 시작', '$': '줄(문자열)의 끝', '\\b': '단어 경계', '\\B': '단어 경계가 아닌 곳',
    '\\A': '문자열의 시작', '\\Z': '문자열의 끝'
  };
  function describe(n) {
    let base;
    switch (n.t) {
      case 'lit': base = '글자 "' + n.raw + '"'; break;
      case 'esc': base = ESC_DESC[n.raw] || (/^\\[xuUpPc]/.test(n.raw) ? '특수 문자 ' + n.raw : '문자 "' + n.raw.slice(1) + '" 그대로'); break;
      case 'cls': base = describeClass(n.raw); break;
      case 'dot': base = '아무 문자 한 글자(줄바꿈 제외)'; break;
      case 'anc': base = ANC_DESC[n.raw] || n.raw; break;
      case 'alt': base = '또는'; break;
      case 'ref': base = '앞에서 캡처한 ' + (/^\\\d/.test(n.raw) ? n.raw.slice(1) + '번' : '이름 붙은') + ' 그룹과 같은 문자열'; break;
      case 'grp': {
        const k = groupKind(n.open);
        base = (n.gnum ? n.gnum + '번 ' : '') + GROUP_LABEL[k] + (k === 'named' ? ' "' + groupName(n.open) + '"' : '');
        break;
      }
      default: base = n.cmt ? '주석' : n.flagsOnly ? '인라인 플래그' : '해석하지 못한 조각 "' + n.raw + '"';
    }
    const q = describeQ(n.q);
    return q ? base + ' — ' + q : base;
  }
  function shortLabel(n) {
    switch (n.t) {
      case 'lit': return '글자';
      case 'esc': return { '\\d': '숫자', '\\w': '단어문자', '\\s': '공백', '\\D': '비숫자', '\\W': '비단어', '\\S': '비공백' }[n.raw] || '문자';
      case 'cls': return '문자집합';
      case 'dot': return '아무 문자';
      case 'anc': return '위치';
      case 'alt': return '또는';
      case 'ref': return '역참조';
      case 'grp': { const k = groupKind(n.open); return k === 'cap' || k === 'named' ? '그룹 ' + (n.gnum || '') : k === 'nc' ? '묶음' : '룩어라운드'; }
      default: return '기타';
    }
  }
  function explainLines(root) {
    const lines = [];
    (function rec(list, d) {
      list.forEach((n) => {
        lines.push({ d, code: n.t === 'grp' ? n.open + (n.closed ? '…)' : '…') + n.q : n.raw + n.q, text: describe(n) });
        if (n.t === 'grp') rec(n.children, d + 1);
      });
    })(root.children, 0);
    return lines;
  }

  function escapeLiteral(text) { return text.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&'); }

  /* ---------- Python → JS 근사 변환 (Pyodide 를 못 쓸 때) ---------- */
  function pyToJs(pattern, flags) {
    const notes = [];
    const root = parse(pattern, 'py');
    let f = flags;
    const extra = new Set();
    (function rec(list) {
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        if (n.t === 'raw' && n.cmt) list.splice(i, 1);
        else if (n.t === 'raw' && n.flagsOnly) {
          const m = /^\(\?([a-zA-Z]*)/.exec(n.raw);
          for (const c of m[1]) extra.add(c);
          list.splice(i, 1);
        } else if (n.t === 'ref' && n.raw.startsWith('(?P=')) n.raw = '\\k<' + n.raw.slice(4, -1) + '>';
        else if (n.t === 'anc' && n.raw === '\\A') { n.t = 'raw'; n.raw = '(?<![\\s\\S])'; }
        else if (n.t === 'anc' && n.raw === '\\Z') { n.t = 'raw'; n.raw = '(?![\\s\\S])'; }
        else if (n.t === 'grp') {
          n.open = n.open.replace('(?P<', '(?<');
          if (n.open === '(?>') { n.open = '(?:'; notes.push('원자 그룹은 일반 그룹으로 대체'); }
          rec(n.children);
        }
        if (n.q && /[+]$/.test(n.q) && n.q.length > 1) { n.q = n.q.slice(0, -1); notes.push('소유 수량자는 일반 수량자로 대체'); }
      }
    })(root.children);
    extra.forEach((c) => { if (!f.includes(c)) f += c; });
    let out = serialize(root);
    if (f.includes('x')) {
      out = out.replace(/\\ /g, '\u0000').replace(/\s+/g, '').replace(/#.*$/gm, '').replace(/\u0000/g, ' ');
      notes.push('x 플래그는 공백·주석 제거로 근사');
    }
    return { pattern: out, flags: f.replace(/[^imsg]/g, ''), notes };
  }

  function replToPy(r) {
    return r.replace(/\$(\$|&|\d{1,2}|<(\w+)>)/g, (m, a, name) => a === '$' ? '$' : a === '&' ? '\\g<0>' : name ? '\\g<' + name + '>' : '\\g<' + a + '>')
      .replace(/(^|[^\\])\\(?![\dg\\nrt])/g, '$1\\\\');
  }

  return {
    parse, serialize, getNode, listAt, findPath, samePath, isInside, removeAt, insertAfter, insertEnd, duplicate, moveBy, moveTo,
    wrapNode, unwrap, wrapRange, removeRange, duplicateRange, moveRangeBy, numberGroups, groupKind, groupName, groupOpenFor, GROUP_LABEL, parseQ, buildQ, describeQ,
    splitClass, describeClass, describe, shortLabel, explainLines, escapeLiteral, mk, clone, pyToJs, replToPy, META
  };
})();

export { RX };
