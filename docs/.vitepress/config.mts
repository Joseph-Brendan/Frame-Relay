import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Frame-Relay',
  description: 'Turn your Figma components into a design kit your AI coding agent follows.',
  base: '/Frame-Relay/',
  srcExclude: ['dev/**'],
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Get started', link: '/getting-started' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'CLI', link: '/cli' },
      { text: 'MCP server', link: '/mcp' },
      { text: 'Live mode', link: '/live-mode' },
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Concepts', link: '/concepts' },
          { text: 'All docs', link: '/README' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'CLI commands', link: '/cli' },
          { text: 'Figma plugin', link: '/plugin' },
          { text: 'Live mode', link: '/live-mode' },
          { text: 'MCP server', link: '/mcp' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Kit format', link: '/kit-format' },
          { text: 'Converter', link: '/converter' },
          { text: 'Figma naming contract', link: '/naming-contract' },
          { text: 'JSON schemas', link: '/schemas' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Joseph-Brendan/Frame-Relay' }],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright (c) 2026 Joseph Brendan',
    },
  },
});
