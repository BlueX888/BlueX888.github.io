export const dashedUnderline = {
  name: 'dashed-underline',
  text(node: any, ctx: any) {
    const matches = [...node.value.matchAll(/\+\+([^+\n]+?)\+\+/g)];
    if (!matches.length) return;

    const replacement = [];
    let offset = 0;
    for (const match of matches) {
      if (match.index > offset) {
        replacement.push({ type: 'text', value: node.value.slice(offset, match.index) });
      }
      replacement.push(
        { type: 'html', value: '<span class="dashed-underline">' },
        { type: 'text', value: match[1] },
        { type: 'html', value: '</span>' },
      );
      offset = match.index + match[0].length;
    }
    if (offset < node.value.length) {
      replacement.push({ type: 'text', value: node.value.slice(offset) });
    }
    ctx.replaceNode(node, replacement);
  },
};
