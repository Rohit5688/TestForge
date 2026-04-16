import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const site = 'https://rohit5688.github.io';
const base = '/TestForge';

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	integrations: [
		starlight({
			favicon: '/favicon.png',
			title: 'TestForge',
			customCss: ['./src/styles/custom.css'],
			logo: {
				src: './src/assets/logo.png',
			},
			social: {
				github: 'https://github.com/Rohit5688/playwright-bdd-mcp',
			},
            lastUpdated: true,
			sidebar: [
				{
					label: '🚀 Getting Started',
					items: [
						{ label: '⏱️ 5-Minute Quickstart', link: 'repo/user/quickstart' },
						{ label: '🛠️ Setup & Configuration', link: 'repo/user/setup_and_configuration' },
					],
				},
				{
					label: '📖 User Guides',
					items: [
						{ label: 'Mastering TestForge', link: 'repo/user/userguide' },
						{ label: '📋 Prompt Cheatbook', link: 'repo/user/promptcheatbook' },
						{ label: '🔄 Core Workflows', link: 'repo/user/workflows' },
					],
				},
				{
					label: '🛠️ Platform Core',
					collapsed: true,
					items: [
						{ label: 'Test Generation', link: 'repo/technical/testgeneration' },
						{ label: 'Execution & Healing', link: 'repo/technical/executionandhealing' },
						{ label: 'Token Optimization', link: 'repo/technical/tokenoptimizer' },
					],
				},
				{
					label: '📚 API Reference',
					collapsed: true,
					items: [
						{ label: 'Master Tool Reference', link: 'api/tools' },
						{ label: 'Class: PageController', link: 'api/pagecontroller' },
						{ label: 'Class: AgentBrain', link: 'api/agentbrain' },
						{ label: 'Class: SandboxEngine', link: 'api/sandboxengine' },
					],
				},
				{
					label: '📐 Architecture',
					collapsed: true,
					items: [
						{ label: 'High-Level Overview', link: 'repo/technical/architecture' },
						{ label: 'Technical Protocol', link: 'repo/technical/agentprotocol' },
						{ label: 'MCP Config Reference', link: 'repo/technical/mcp_config_reference' },
						{ label: 'Security & Compliance', link: 'repo/technical/securityandcompliance' },
					],
				},
				{
					label: '📈 Infrastructure',
					collapsed: true,
					items: [
						{ label: 'Continuous Integration', link: 'repo/maintenance/continuousintegration' },
						{ label: 'Project Evolution', link: 'repo/maintenance/projectevolution' },
						{ label: 'Containerization', link: 'repo/maintenance/dockersetup' },
					],
				},
			],
		}),

		{
			name: 'sitemap-killer',
			hooks: {
				'astro:config:setup': ({ config }) => {
					// Surgically remove sitemap if starlight injected it
					const sitemapIdx = config.integrations.findIndex(i => i.name === '@astrojs/sitemap');
					if (sitemapIdx !== -1) {
						config.integrations.splice(sitemapIdx, 1);
					}
				}
			}
		}
	],
});

