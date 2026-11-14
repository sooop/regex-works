<script lang="ts">
  // 선택한 블록 하나의 세부 설정 시트(kind 'node'). 패턴이 바뀌면 노드를 다시 읽어 시트가 따라 바뀐다.
  import { S, V, RX, QUANTIFIABLE, validPath, setNode, moveSel, duplicateSel, unwrapSel, deleteSel, editTree, closeSheet } from '../lib/app.svelte';

  const CLS_QUICK = [['a-z', '영소문자'], ['A-Z', '영대문자'], ['0-9', '숫자'], ['가-힣', '한글'], ['ㄱ-ㅎ', '자음'], ['\\s', '공백'], ['_', '_'], ['\\-', '-'], ['.', '.'], ['@', '@']];
  const SIMPLE_ESC = ['\\d', '\\D', '\\w', '\\W', '\\s', '\\S'];
  const ESC_KINDS = [['\\d', '숫자'], ['\\D', '숫자 아님'], ['\\w', '단어문자'], ['\\W', '단어문자 아님'], ['\\s', '공백'], ['\\S', '공백 아님']];
  const GROUP_KINDS = [['cap', '캡처'], ['nc', '묶기만'], ['named', '이름 붙임'], ['la', '뒤에 있음'], ['nla', '뒤에 없음'], ['lb', '앞에 있음'], ['nlb', '앞에 없음']];
  const noAuto = { autocapitalize: 'off', autocorrect: 'off', spellcheck: false } as any;

  const node: any = $derived(S.selPath && validPath(S.selPath) ? RX.getNode(V.tree, S.selPath) : null);
  const isPy = $derived(S.engine === 'py');

  // 노드 종류별 파생 값
  const simpleEsc = $derived(!!node && node.t === 'esc' && SIMPLE_ESC.includes(node.raw));
  const showRaw = $derived(!!node && ['esc', 'ref', 'raw', 'dot', 'anc'].includes(node.t) && !simpleEsc);
  const anchors = $derived(['^', '$', '\\b', '\\B'].concat(isPy ? ['\\A', '\\Z'] : []));
  const cls = $derived(node && node.t === 'cls' ? RX.splitClass(node.raw) : null);
  const gkind = $derived(node && node.t === 'grp' ? RX.groupKind(node.open) : '');
  const gkinds = $derived(GROUP_KINDS.concat(isPy ? [['atomic', '원자']] : []));
  const q: any = $derived(node && QUANTIFIABLE.includes(node.t) ? RX.parseQ(node.q) : null);
  const isRange = $derived(!!q && q.mode === 'range');
  const exact = $derived(isRange && q.min === q.max);
  const unlimited = $derived(!!q && q.max === Infinity);
  const modes = $derived(q ? [
    ['none', '없음', q.mode === 'none'], ['opt', '? (0~1)', q.mode === 'opt'], ['star', '* (0+)', q.mode === 'star'],
    ['plus', '+ (1+)', q.mode === 'plus'], ['exact', '{n} 정확히', exact], ['range', '{n,m} 범위', isRange && !exact],
  ] as [string, string, boolean][] : []);
  const pathIdx = $derived(S.selPath ? S.selPath[S.selPath.length - 1] : 0);
  const siblings = $derived(node && S.selPath ? RX.listAt(V.tree, S.selPath).length : 0);
  const title = $derived(node ? RX.describe(node).split(' — ')[0] : '');
  const code = $derived(node ? (node.t === 'grp' ? node.open + '…' + (node.closed ? ')' : '') : node.raw) + node.q : '');

  function setRaw(v: string) { setNode((n) => { n.raw = v; }); }
  function setQ(obj: any) { setNode((n) => { n.q = RX.buildQ(obj); }); }
  function keep() { return { lazy: q.lazy, poss: q.poss }; }
  function pickMode(m: string) {
    const o = q;
    if (m === 'none') return setQ({ mode: 'none' });
    if (m === 'exact') return setQ({ mode: 'range', min: isRange ? o.min : 3, max: isRange ? o.min : 3, ...keep() });
    if (m === 'range') return setQ({ mode: 'range', min: isRange ? o.min : 2, max: isRange ? (o.max === o.min ? o.min + 1 : o.max) : 4, ...keep() });
    setQ({ mode: m, ...keep() });
  }
  function rebuildClass(nb: string, ng: boolean) { setNode((n) => { n.raw = '[' + (ng ? '^' : '') + nb + ']'; }); }
  function setGroupName(v: string) {
    const name = v.replace(/\W/g, '') || 'name';
    setNode((n) => { n.open = RX.groupOpenFor('named', name, S.engine); });
  }
  function onStep(fn: (v: number) => void, min: number, e: Event) {
    const inp = e.currentTarget as HTMLInputElement;
    fn(Math.max(min, parseInt(inp.value, 10) || min));
  }
</script>

{#snippet stepper(value: number, min: number, fn: (v: number) => void, aria: string)}
  <div class="step">
    <button type="button" aria-label={aria + ' 줄이기'} onclick={() => fn(Math.max(min, value - 1))}>−</button>
    <input type="number" inputmode="numeric" {value} {min} aria-label={aria} onchange={(e) => onStep(fn, min, e)} />
    <button type="button" aria-label={aria + ' 늘리기'} onclick={() => fn(value + 1)}>+</button>
  </div>
{/snippet}

{#snippet opt(label: string, pressed: boolean, fn: () => void, tip?: string)}
  <button class="opt" type="button" aria-pressed={pressed} title={tip} onclick={fn}>{label}</button>
{/snippet}

{#if !node}
  <div>
    <h3>선택한 블록이 없습니다</h3>
    <button class="btn" type="button" onclick={closeSheet}>닫기</button>
  </div>
{:else}
  <div>
    <h3>{title}</h3>
    <div class="sub mono">{code}</div>

    {#if node.t === 'lit'}
      <div class="sec">
        <h4>글자</h4>
        <input class="in" type="text" value={node.raw} aria-label="글자" {...noAuto}
          onchange={(e) => { const v = e.currentTarget.value; if (v === '') deleteSel(); else setRaw(RX.escapeLiteral(v)); }} />
        <div class="small muted" style="margin-top:4px">특수문자도 입력한 그대로 찾습니다.</div>
      </div>
    {/if}

    {#if simpleEsc}
      <div class="sec">
        <h4>종류</h4>
        <div class="btnrow">
          {#each ESC_KINDS as [c, l] (c)}
            {@render opt(c + ' ' + l, node.raw === c, () => setRaw(c))}
          {/each}
        </div>
      </div>
    {/if}

    {#if node.t === 'anc'}
      <div class="sec">
        <h4>위치</h4>
        <div class="btnrow">
          {#each anchors as c (c)}
            {@render opt(c, node.raw === c, () => setRaw(c))}
          {/each}
        </div>
      </div>
    {/if}

    {#if cls}
      <div class="sec">
        <h4>문자 집합</h4>
        <div class="btnrow" style="margin-bottom:8px">
          {@render opt('이 문자들을 제외', cls.neg, () => rebuildClass(cls.body, !cls.neg))}
        </div>
        <div class="btnrow" style="margin-bottom:8px">
          {#each CLS_QUICK as [k, l] (k)}
            {@const on = cls.body.includes(k)}
            {@render opt(l, on, () => rebuildClass(on ? cls.body.replace(k, '') : cls.body + k, cls.neg), k)}
          {/each}
        </div>
        <label class="l" for="nsCls">대괄호 안 내용 직접 수정</label>
        <input class="in" id="nsCls" type="text" value={cls.body} aria-label="집합 내용" {...noAuto}
          onchange={(e) => rebuildClass(e.currentTarget.value, cls.neg)} />
      </div>
    {/if}

    {#if node.t === 'grp'}
      <div class="sec">
        <h4>그룹 종류</h4>
        <div class="btnrow">
          {#each gkinds as [k, l] (k)}
            {@render opt(l, gkind === k, () => setNode((n) => { n.open = RX.groupOpenFor(k, RX.groupName(n.open) || 'name', S.engine); }))}
          {/each}
        </div>
        {#if gkind === 'named'}
          <label class="l" for="nsGname" style="margin-top:8px">이름</label>
          <input class="in" id="nsGname" type="text" value={RX.groupName(node.open) || 'name'} aria-label="그룹 이름" style="max-width:240px" {...noAuto}
            onchange={(e) => setGroupName(e.currentTarget.value)} />
        {/if}
        <div class="small muted" style="margin-top:6px">{RX.GROUP_LABEL[gkind]}</div>
      </div>
    {/if}

    {#if showRaw}
      <div class="sec">
        <h4>원문 직접 수정</h4>
        <input class="in" type="text" value={node.raw} aria-label="원문" {...noAuto}
          onchange={(e) => { const v = e.currentTarget.value; if (v) setRaw(v); }} />
      </div>
    {/if}

    {#if q}
      <div class="sec">
        <h4>수량 (몇 번 반복할지)</h4>
        <div class="btnrow">
          {#each modes as [m, l, on] (m)}
            {@render opt(l, on, () => pickMode(m))}
          {/each}
        </div>
        {#if exact}
          <div class="row" style="margin-top:10px">
            <span class="small muted">횟수</span>
            {@render stepper(q.min, 0, (v) => setQ({ mode: 'range', min: v, max: v, ...keep() }), '횟수')}
          </div>
        {:else if isRange}
          <div class="row" style="margin-top:10px">
            <span class="small muted">최소</span>
            {@render stepper(q.min, 0, (v) => setQ({ mode: 'range', min: v, max: q.max === Infinity ? Infinity : Math.max(v, q.max), ...keep() }), '최소')}
            <span class="small muted">최대</span>
            {#if unlimited}
              <span class="mono">무제한</span>
            {:else}
              {@render stepper(q.max, 0, (v) => setQ({ mode: 'range', min: Math.min(q.min, v), max: v, ...keep() }), '최대')}
            {/if}
            {@render opt('무제한', unlimited, () => setQ({ mode: 'range', min: q.min, max: unlimited ? q.min + 1 : Infinity, ...keep() }))}
          </div>
        {/if}
        {#if q.mode !== 'none'}
          <div class="btnrow" style="margin-top:10px">
            {@render opt('게으르게 (가능한 적게)', q.lazy, () => setQ({ ...q, lazy: !q.lazy, poss: false }))}
            {#if isPy}
              {@render opt('소유형 (되돌리지 않음)', q.poss, () => setQ({ ...q, poss: !q.poss, lazy: false }))}
            {/if}
          </div>
          <div class="small muted" style="margin-top:6px">현재: {RX.describeQ(node.q)}</div>
        {/if}
      </div>
    {/if}

    <div class="sec">
      <h4>위치와 편집</h4>
      <div class="btnrow">
        <button class="btn" type="button" disabled={pathIdx === 0} onclick={() => moveSel(-1)}>◀ 앞으로</button>
        <button class="btn" type="button" disabled={pathIdx >= siblings - 1} onclick={() => moveSel(1)}>뒤로 ▶</button>
        <button class="btn" type="button" onclick={duplicateSel}>복제</button>
        {#if node.t !== 'alt'}
          <button class="btn" type="button" onclick={() => editTree((t, p) => RX.wrapNode(t, p, '('))}>그룹으로 감싸기</button>
        {/if}
        {#if node.t === 'grp'}
          <button class="btn" type="button" onclick={unwrapSel}>그룹 풀기</button>
        {/if}
        <button class="btn danger" type="button" onclick={deleteSel}>삭제</button>
      </div>
    </div>

    <div class="btnrow" style="margin-top:14px">
      <button class="btn primary" type="button" onclick={closeSheet}>완료</button>
    </div>
  </div>
{/if}
