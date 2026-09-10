/* 朝向自然 · 写文章 —— 括弧包裹按钮
 *
 * Sveltia CMS 的富文本编辑器（RTE）没有“自定义工具栏按钮”的接口：
 * field_defaults.richtext.buttons 只接受预定义按钮名。
 * 所以这里用零外部依赖的脚本直接往编辑器的工具栏注入一组括弧按钮。
 *
 * 原理：RTE 会监听 contenteditable 里的 beforeinput / input 事件。用
 * document.execCommand('insertText', …) 把「开括弧 + 选中文字 + 闭括弧」一次性替换
 * 选中内容，会走 RTE 自己的输入管道，内部状态和保存时的 Markdown 序列化都保持同步。
 * 脚本只碰 DOM 和系统输入命令，不依赖任何私有 API。
 *
 * 只修改本文件，并在 public/admin/index.html 里 <script> 引入。
 */

(() => {
  'use strict';

  // 常用全角括弧对，按使用频率排。想增删直接改这个数组即可。
  const PAIRS = [
    { open: '『', close: '』' },
    { open: '《', close: '》' },
    { open: '【', close: '】' },
    { open: '「', close: '」' },
    { open: '〈', close: '〉' },
    { open: '〖', close: '〗' },
    { open: '〔', close: '〕' },
    { open: '［', close: '］' },
    { open: '｛', close: '｝' },
    { open: '（', close: '）' },
  ];

  // 找出页面上所有“带工具栏的富文本编辑器容器”。
  function getWrappers() {
    const out = new Set();
    for (const el of document.querySelectorAll('.wrapper')) {
      const toolbar = el.querySelector('[role="toolbar"]');
      const hasEditor =
        el.querySelector('[contenteditable="true"]') ||
        el.querySelector('.ProseMirror') ||
        el.querySelector('textarea');
      if (toolbar && hasEditor) out.add(el);
    }
    return [...out];
  }

  // 往每个容器的工具栏里加一组括弧按钮。Svelte 可能重建工具栏导致按钮丢失，
  // 所以每次进来先检查是否已存在；不存在才加。MutationObserver 会让它自动补回。
  function mount() {
    for (const wrapper of getWrappers()) {
      const toolbar = wrapper.querySelector('[role="toolbar"]');
      if (!toolbar || toolbar.querySelector('[data-bracket-group]')) continue;

      const group = document.createElement('div');
      group.setAttribute('data-bracket-group', 'true');
      for (const pair of PAIRS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sui button';
        btn.title = `用 ${pair.open}${pair.close} 包裹选中的文字`;
        btn.textContent = pair.open + pair.close;
        // 按下时阻止焦点离开编辑器，保住当前选区。
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', () =>
          wrapIn(wrapper, pair.open, pair.close),
        );
        group.appendChild(btn);
      }
      toolbar.appendChild(group);
    }
  }

  // 根据当前是富文本还是 Markdown/纯文本，选对应的插入方式。
  function wrapIn(wrapper, open, close) {
    const rich = wrapper.querySelector('[contenteditable="true"], .ProseMirror');
    const ta = wrapper.querySelector('textarea');
    if (rich && isVisible(rich)) {
      wrapRich(rich, open, close);
    } else if (ta && isVisible(ta)) {
      wrapTextarea(ta, open, close);
    } else if (rich) {
      wrapRich(rich, open, close);
    } else if (ta) {
      wrapTextarea(ta, open, close);
    }
  }

  function isVisible(el) {
    return !!(el.getClientRects().length || el.offsetWidth || el.offsetHeight);
  }

  // —— 富文本：用 execCommand 走 RTE 的输入管道 ——
  function wrapRich(editor, open, close) {
    editor.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (
      !editor.contains(range.startContainer) ||
      !editor.contains(range.endContainer)
    ) {
      return;
    }

    const text = range.toString();
    const wrapped = open + text + close;

    // 把选中文字一次性替换成「开括弧 + 文字 + 闭括弧」。
    document.execCommand('insertText', false, wrapped);

    // 光标此刻落在闭括弧后面。统一把它挪到开括弧与内容之间（空选区）
    // 或开括弧之后、闭括弧之前（有选区），这样紧接着输入内容即可。
    const end = getCaretPos(editor);
    if (end != null) setSelection(editor, end - close.length, end - close.length);
  }

  // —— Markdown / 纯文本（textarea）——
  function wrapTextarea(ta, open, close) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const v = ta.value;
    const picked = v.slice(s, e);
    ta.value = v.slice(0, s) + open + picked + close + v.slice(e);
    const caret = s + open.length + picked.length;
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  // —— 字符偏移辅助 ——
  // 编辑器内某个 DOM 节点/偏移 → 字符偏移（按所有文本节点累加）。
  function nodeOffset(editor, node, offset) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let cur;
    while ((cur = walker.nextNode())) {
      if (cur === node) return acc + offset;
      acc += cur.textContent.length;
    }
    return null;
  }

  // 当前折叠光标在编辑器文本中的字符偏移；非折叠或取不到则返回 null。
  function getCaretPos(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return null;
    return nodeOffset(editor, r.startContainer, r.startOffset);
  }

  // 字符偏移 → 具体的 {node, offset}（定位到某个文本节点内）。
  function findPos(editor, pos) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let cur;
    while ((cur = walker.nextNode())) {
      const len = cur.textContent.length;
      if (acc + len >= pos) {
        return { node: cur, offset: pos - acc };
      }
      acc += len;
    }
    return null;
  }

  // 把选择/光标设为 [start, end] 字符偏移。
  function setSelection(editor, start, end) {
    const a = findPos(editor, start);
    const b = findPos(editor, end);
    if (!a || !b) return;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // 页面一有 DOM 变化就尝试挂按钮（Svelte 重建后能自动补回）。
  const observer = new MutationObserver(() => mount());
  observer.observe(document.body, { childList: true, subtree: true });

  mount();
})();
