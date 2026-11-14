// 파서·직렬화·트리 편집의 회귀 테스트. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RX } from '../src/lib/rx.js';
import { BUILTIN_PRESETS } from '../src/lib/presets.js';

const round = (s, d = 'js') => RX.serialize(RX.parse(s, d));

test('기본 프리셋은 파싱 후 직렬화하면 원문과 같다', () => {
  for (const p of BUILTIN_PRESETS) assert.equal(round(p.pattern), p.pattern, p.name);
});

test('깨진 입력도 글자를 잃지 않는다', () => {
  for (const s of ['(', ')', 'a(b', '[abc', 'a{2', '*a', '(?', 'a|', '\\', '(?P<n>x)(?P=n)', 'x{2,}?', 'a++']) {
    assert.equal(round(s, 'py'), s, s);
  }
});

test('직렬화가 노드의 위치를 채운다', () => {
  const t = RX.parse('(\\d{4})-x', 'js');
  RX.serialize(t);
  const g = t.children[0];
  assert.deepEqual([g.start, g.cStart, g.cEnd, g.qStart, g.end], [0, 1, 6, 7, 7]);
  assert.deepEqual([g.children[0].start, g.children[0].qStart, g.children[0].end], [1, 3, 6]);
});

test('그룹 번호와 이름', () => {
  const t = RX.parse('(a)(?:b)(?<y>c)', 'js');
  const info = RX.numberGroups(t);
  assert.equal(info.count, 2);
  assert.equal(info.names[2], 'y');
});

test('블록 이동: 자기 안으로는 옮길 수 없다', () => {
  const t = RX.parse('a(b)c', 'js');
  assert.equal(RX.moveTo(t, [1], [1], 0), null);
  const t2 = RX.parse('\\d(b)\\w', 'js');
  RX.moveTo(t2, [0], [1], 1);
  assert.equal(RX.serialize(t2), '(b\\d)\\w');
});

test('범위 묶기·삭제·복제', () => {
  const t = RX.parse('\\d\\w\\s', 'js');
  RX.wrapRange(t, [0], 2, '(?:');
  assert.equal(RX.serialize(t), '(?:\\d\\w)\\s');
  RX.duplicateRange(t, [0], 1);
  assert.equal(RX.serialize(t), '(?:\\d\\w)(?:\\d\\w)\\s');
  RX.removeRange(t, [1], 2);
  assert.equal(RX.serialize(t), '(?:\\d\\w)');
});

test('수량자 해석과 조립', () => {
  for (const q of ['?', '*', '+', '{3}', '{2,4}', '{2,}', '*?', '{2,}?']) assert.equal(RX.buildQ(RX.parseQ(q)), q, q);
});

test('Python → JS 근사 변환', () => {
  const r = RX.pyToJs('(?P<n>\\d+)(?P=n)\\Z', 'gi');
  assert.equal(r.pattern, '(?<n>\\d+)\\k<n>(?![\\s\\S])');
});
