/**
 * 站点全局配置。改这里就够了，不用动其他文件。
 */
export const SITE = {
  title: '朝然',
  /** 副题，显示在首页站名下方 */
  subtitle: '朝向自然',
  /** 一句话，首页开场与站点描述（搜索引擎、RSS、分享卡片都用它） */
  description: '人生，本就是一场无限的自我探索游戏。',
  author: '朝然',
  /** 线上地址，末尾不要加斜杠。GitHub Pages 的地址是 https://<用户名>.github.io */
  url: 'https://bluex888.github.io',
  lang: 'zh-CN',
  /** 首页「最近」列表显示几篇 */
  recentCount: 10,
} as const;

/** 四个栏目。key 同时是 URL 路径和 content/ 下的文件夹名。 */
export const SECTIONS = {
  diary: { name: '日记', description: '某一天的自己' },
  weekly: { name: '周记', description: '每周反思' },
  learning: { name: '学习', description: '学习记录' },
  reading: { name: '读书', description: '读书笔记与感悟' },
} as const;

export type SectionKey = keyof typeof SECTIONS;
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

/**
 * giscus 评论（基于 GitHub Discussions）。
 * 四个值都在 https://giscus.app 页面上按提示生成后填进来；repo 留空则不显示评论区。
 */
export const GISCUS = {
  repo: 'BlueX888/BlueX888.github.io',
  repoId: 'R_kgDOUR0wEQ',
  category: 'Announcements',
  categoryId: 'DIC_kwDOUR0wEc4DFHGm',
  mapping: 'pathname',
  lang: 'zh-CN',
};

/**
 * 访问统计。两种任选其一，都留空则不加载任何统计脚本。
 * - Umami：填 script 地址和 websiteId
 * - Cloudflare Web Analytics：填 token
 */
export const ANALYTICS = {
  umami: { src: '', websiteId: '' },
  cloudflareToken: '',
};
