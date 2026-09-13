/* 朝向自然 · 写文章 —— 「发布上线」按钮
 *
 * 原本要上线一篇文章得做两步：先手动关掉「草稿」开关，再点「保存」。
 * 这里在编辑页的工具栏里多加一个绿色的「发布上线」按钮，一次做完这两步：
 * 关掉草稿开关 → 点保存 → 保存成功后在页面顶部提示一句。
 *
 * 原来的「保存」按钮和 Ctrl/Cmd+S 行为都不变，还是「按当前草稿开关的状态保存」，
 * 所以想存草稿照旧点「保存」即可。
 *
 * 只用两个 Sveltia CMS 自己渲染出来的稳定属性，不依赖任何私有 API：
 *   - 草稿字段容器：[data-key-path="draft"]（Sveltia 给每个字段都加了 data-key-path）
 *   - 保存按钮：带 aria-keyshortcuts="Accel+S"（Sveltia 给保存按钮绑的快捷键）
 * 点开关和点保存都是真实的 click，走 CMS 自己的逻辑，内部状态不会脱节。
 */

'use strict';

const SAVE_BUTTON = 'button[aria-keyshortcuts="Accel+S"]';
const DRAFT_SWITCH = '[data-key-path="draft"] button[role="switch"]';
// 保存成功后 Sveltia 会弹一个绿色提示条，用它判断是否真的保存成功了。
const SUCCESS_TOAST = '.sui.toast:not([aria-hidden="true"]) .sui.alert.success';

const LABEL = '发布上线';
const LABEL_BUSY = '发布中…';

let publishing = false;
// 点发布的那一刻如果上一条成功提示还没消失，得先等它消失，否则会把旧提示当成这次的结果。
let staleToast = false;
let watchdog = 0;
let poller = 0;

function draftSwitches() {
  return [...document.querySelectorAll(DRAFT_SWITCH)];
}

function isDisabled(element) {
  return element.disabled || element.getAttribute('aria-disabled') === 'true';
}

// Svelte 随时可能重建工具栏，所以按钮要能被 MutationObserver 补回来。
function mount() {
  if (!draftSwitches().length) return;

  for (const save of document.querySelectorAll(SAVE_BUTTON)) {
    const toolbar = save.closest('[role="toolbar"]');
    const container = toolbar?.querySelector(':scope > .inner') ?? toolbar ?? save.parentElement;
    if (!container || container.querySelector('[data-publish-button]')) continue;

    // 保存按钮可能被包在一层壳里（例如带下拉箭头的按钮组），插到整个壳的前面。
    let anchor = save;
    while (anchor.parentElement && anchor.parentElement !== container) {
      anchor = anchor.parentElement;
    }
    container.insertBefore(createPublishButton(), anchor);
  }
}

function createPublishButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sui button';
  button.dataset.publishButton = 'true';
  button.title = '关掉草稿开关并保存，文章就会出现在网站上';
  button.textContent = LABEL;
  button.addEventListener('click', publish);
  return button;
}

// 按钮可能被重建，所以状态统一由 publishing 这个变量说话。
function refresh() {
  for (const button of document.querySelectorAll('[data-publish-button]')) {
    button.textContent = publishing ? LABEL_BUSY : LABEL;
    button.disabled = publishing;
  }
}

async function publish() {
  if (publishing) return;

  for (const toggle of draftSwitches()) {
    if (toggle.getAttribute('aria-checked') === 'true') toggle.click();
  }

  const save = await waitForEnabledSave();
  if (!save) {
    showToast('这篇已经在网站上了，没有新的改动需要发布。', 'info');
    return;
  }

  staleToast = !!document.querySelector(SUCCESS_TOAST);
  publishing = true;
  refresh();
  // 成功提示是靠切换属性显示的，所以只在发布期间轮询，不给编辑器加常驻的属性监听。
  poller = globalThis.setInterval(checkResult, 250);
  // 保存失败时 Sveltia 会自己弹错误提示；这里只负责不要一直卡在「发布中…」。
  watchdog = globalThis.setTimeout(stopPublishing, 120_000);
  save.click();
}

// 关掉草稿开关后，CMS 需要一点时间才会把「保存」按钮从灰色变成可点。
async function waitForEnabledSave() {
  for (let waited = 0; waited <= 600; waited += 50) {
    const save = document.querySelector(SAVE_BUTTON);
    if (save && !isDisabled(save)) return save;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  return null;
}

function stopPublishing() {
  globalThis.clearTimeout(watchdog);
  globalThis.clearInterval(poller);
  publishing = false;
  refresh();
}

function checkResult() {
  if (!publishing) return;

  const visible = !!document.querySelector(SUCCESS_TOAST);
  if (staleToast) {
    if (!visible) staleToast = false;
    return;
  }
  if (!visible) return;

  stopPublishing();
  showToast('已发布。大约 1 分钟后刷新网站就能看到这篇。', 'success');
}

function showToast(message, tone) {
  document.querySelector('[data-publish-toast]')?.remove();

  const toast = document.createElement('div');
  toast.dataset.publishToast = 'true';
  toast.dataset.tone = tone;
  toast.setAttribute('role', 'alert');
  toast.textContent = message;
  toast.title = '点一下关掉';
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);

  globalThis.setTimeout(() => toast.remove(), 8000);
}

function injectStyles() {
  if (document.querySelector('[data-publish-style]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-publish-style', 'true');
  style.textContent = `
    .sui.button[data-publish-button] {
      border-color: #1a7f46;
      background-color: #1a7f46;
      color: #fff;
      font-weight: 600;
    }
    .sui.button[data-publish-button]:hover:not([disabled]) {
      border-color: #15683a;
      background-color: #15683a;
    }
    .sui.button[data-publish-button][disabled] { opacity: .55; }
    [data-publish-toast] {
      /* 顶部居中，但要让开工具栏，别盖住「保存」「发布上线」。
         Sveltia 自己的「已保存」提示条在底部，两条不会打架。 */
      position: fixed;
      top: calc(var(--sui-primary-toolbar-size, 48px) + 16px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 100000;
      max-width: min(90vw, 420px);
      padding: 10px 16px;
      border-radius: 6px;
      background-color: #1a7f46;
      color: #fff;
      font-size: 14px;
      line-height: 1.5;
      box-shadow: 0 6px 20px rgb(0 0 0 / 25%);
      cursor: pointer;
    }
    [data-publish-toast][data-tone="info"] { background-color: #3a3f46; }
  `;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined') {
  injectStyles();
  const observer = new MutationObserver(() => mount());
  observer.observe(document.body, { childList: true, subtree: true });
  mount();
}
