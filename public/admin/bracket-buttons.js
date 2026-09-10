/* 朝向自然 · 写文章 —— 括弧与波浪下划线按钮
 *
 * Sveltia CMS 的富文本编辑器（RTE）没有“自定义工具栏按钮”的接口：
 * field_defaults.richtext.buttons 只接受预定义按钮名。
 * 所以这里用零外部依赖的脚本直接往编辑器的工具栏注入按钮。
 *
 * 原理：RTE 会监听 contenteditable 里的 beforeinput / input 事件。用
 * document.execCommand('insertText', …) 一次性替换选中内容，会走 RTE 自己的输入管道，
 * 内部状态和保存时的 Markdown 序列化都保持同步。
 * 脚本只碰 DOM 和系统输入命令，不依赖任何私有 API。
 */

'use strict';

const WAVE = '\u0330';
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

export function addWavyUnderline(text) {
  const clean = text.replaceAll(WAVE, '');
  const parts =
    typeof Intl.Segmenter === 'function'
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean)].map(
          ({ segment }) => segment,
        )
      : Array.from(clean);
  return parts.map((part) => (/\s/u.test(part) ? part : part + WAVE)).join('');
}

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

// Svelte 可能重建工具栏；MutationObserver 会自动补回按钮。
function mount() {
  for (const wrapper of getWrappers()) {
    const toolbar = wrapper.querySelector('[role="toolbar"]');
    if (!toolbar || toolbar.querySelector('[data-bracket-group]')) continue;

    const group = document.createElement('div');
    group.setAttribute('data-bracket-group', 'true');

    const menu = document.createElement('div');
    menu.setAttribute('data-bracket-menu', 'true');

    const trigger = createButton('『』 ▾', '选择括号');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');

    const popover = document.createElement('div');
    popover.hidden = true;
    popover.setAttribute('data-bracket-popover', 'true');
    popover.setAttribute('role', 'menu');

    trigger.addEventListener('click', () => {
      const open = popover.hidden;
      closeMenus();
      popover.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
    });

    for (const pair of PAIRS) {
      const button = createButton(
        pair.open + pair.close,
        `用 ${pair.open}${pair.close} 包裹选中的文字`,
      );
      button.setAttribute('role', 'menuitem');
      button.addEventListener('click', () => {
        wrapIn(wrapper, pair.open, pair.close);
        closeMenus();
      });
      popover.appendChild(button);
    }

    menu.append(trigger, popover);
    group.append(menu, createWaveButton(wrapper));
    toolbar.appendChild(group);
  }
}

function createButton(label, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sui button';
  button.title = title;
  button.setAttribute('aria-label', title);
  button.textContent = label;
  button.addEventListener('mousedown', (event) => event.preventDefault());
  return button;
}

function createWaveButton(wrapper) {
  const button = createButton('', '给选中的文字加波浪下划线');
  const icon = document.createElement('span');
  icon.textContent = 'U';
  icon.setAttribute('data-wave-icon', 'true');
  button.appendChild(icon);
  button.addEventListener('click', () => transformSelection(wrapper, addWavyUnderline, 0));
  return button;
}

function closeMenus() {
  for (const popover of document.querySelectorAll('[data-bracket-popover]')) {
    popover.hidden = true;
    popover.previousElementSibling?.setAttribute('aria-expanded', 'false');
  }
}

// 根据当前是富文本还是 Markdown/纯文本，选对应的插入方式。
function transformSelection(wrapper, transform, caretBack) {
  const rich = wrapper.querySelector('[contenteditable="true"], .ProseMirror');
  const textarea = wrapper.querySelector('textarea');
  if (rich && isVisible(rich)) {
    replaceRichSelection(rich, transform, caretBack);
  } else if (textarea && isVisible(textarea)) {
    replaceTextareaSelection(textarea, transform, caretBack);
  } else if (rich) {
    replaceRichSelection(rich, transform, caretBack);
  } else if (textarea) {
    replaceTextareaSelection(textarea, transform, caretBack);
  }
}

function wrapIn(wrapper, open, close) {
  transformSelection(wrapper, (text) => open + text + close, close.length);
}

function isVisible(el) {
  return !!(el.getClientRects().length || el.offsetWidth || el.offsetHeight);
}

// 富文本：用 execCommand 走 RTE 的输入管道。
function replaceRichSelection(editor, transform, caretBack) {
  editor.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  ) {
    return;
  }

  document.execCommand('insertText', false, transform(range.toString()));
  if (caretBack) {
    const end = getCaretPos(editor);
    if (end != null) setCaret(editor, end - caretBack);
  }
}

// Markdown / 纯文本（textarea）。
function replaceTextareaSelection(textarea, transform, caretBack) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const replacement = transform(value.slice(start, end));
  textarea.value = value.slice(0, start) + replacement + value.slice(end);
  const caret = start + replacement.length - caretBack;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

function getCaretPos(editor) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;
  const before = range.cloneRange();
  before.selectNodeContents(editor);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
}

function setCaret(editor, position) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let node;
  while ((node = walker.nextNode())) {
    const end = offset + node.textContent.length;
    if (end >= position) {
      const range = document.createRange();
      range.setStart(node, position - offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    offset = end;
  }
}

function injectStyles() {
  if (document.querySelector('[data-editor-tools-style]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-editor-tools-style', 'true');
  style.textContent = `
    [data-bracket-group] { display: contents; }
    [data-bracket-menu] { position: relative; display: inline-flex; }
    [data-bracket-popover] {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 100;
      display: grid;
      grid-template-columns: repeat(5, max-content);
      gap: 2px;
      padding: 4px;
      border: 1px solid var(--sui-textbox-border-color, #aaa);
      background: var(--sui-background-color, Canvas);
      box-shadow: 0 4px 12px rgb(0 0 0 / 18%);
    }
    [data-bracket-popover][hidden] { display: none; }
    [data-wave-icon] {
      font-weight: 600;
      text-decoration-line: underline;
      text-decoration-style: wavy;
      text-underline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  injectStyles();
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-bracket-menu]')) {
      closeMenus();
    }
  });
  const observer = new MutationObserver(() => mount());
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
}
