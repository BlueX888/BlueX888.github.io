/**
 * 把 $...$ 与 $$...$$ 用 KaTeX 渲染成 HTML。
 * - 块级公式在 Markdown 树阶段替换（否则会被代码高亮插件当成纯文本处理）
 * - 行内公式在 HTML 树阶段替换（Markdown 阶段插入的 HTML 会被当成块级内容，拆开段落）
 */
import katex from 'katex';

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', output: 'html' });
}
function textOf(node: any): string {
  return (node.children ?? []).map((c: any) => (c.type === 'text' ? c.value : textOf(c))).join('');
}
function hasClass(node: any, cls: string): boolean {
  const c = node.properties?.className;
  return Array.isArray(c) ? c.includes(cls) : typeof c === 'string' && c.split(/\s+/).includes(cls);
}

export const katexBlock = {
  name: 'katex-block',
  math(node: any, ctx: any) {
    ctx.replaceNode(node, { type: 'html', value: renderMath(node.value, true) });
  },
};

export const katexInline = {
  name: 'katex-inline',
  element: {
    filter: ['code'],
    visit(node: any, ctx: any) {
      if (hasClass(node, 'math-inline')) {
        ctx.replaceNode(node, { type: 'raw', value: renderMath(textOf(node), false) });
      }
    },
  },
};
