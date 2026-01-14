import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://getrapid.dev',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: 'RAPID',
      description: 'AI-assisted development with dev containers. An open source project by A3T.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: true,
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/a3tai/rapid' }],
      editLink: {
        baseUrl: 'https://github.com/a3tai/rapid/edit/main/apps/docs/',
      },
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        Hero: './src/components/Hero.astro',
        Footer: './src/components/Footer.astro',
      },
      customCss: ['./src/styles/global.css', './src/styles/fonts.css', './src/styles/theme.css'],

      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#0a0a0a',
          },
        },
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://getrapid.dev/og-image.png',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'RAPID Overview', slug: 'concepts/rapid-overview' },
            { label: 'Agent Integration', slug: 'concepts/agent-integration' },
            { label: 'Container Lifecycle', slug: 'concepts/container-lifecycle' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'CLI Reference', slug: 'guides/cli-reference' },
            { label: 'Agent Configuration', slug: 'guides/agent-configuration' },
            { label: 'MCP Servers', slug: 'guides/mcp-servers' },
            { label: 'Secrets Management', slug: 'guides/secrets-management' },
            { label: 'Dev Container Templates', slug: 'guides/devcontainer-templates' },
            { label: 'Agent Files', slug: 'guides/agent-files' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'rapid.json Spec', slug: 'reference/rapid-json-spec' },
            { label: 'Supported Agents', slug: 'reference/supported-agents' },
          ],
        },
      ],
    }),
  ],
});
