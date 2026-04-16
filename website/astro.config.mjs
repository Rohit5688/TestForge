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
						{ label: '🛠️ Installation & MCP Setup', link: 'repo/user/installation' },
						{ label: '⏱️ 5-Minute Quickstart', link: 'repo/user/quickstart' },
						{ label: '⚙️ Setup & Configuration', link: 'repo/user/setup_and_configuration' },
						{ label: '🔧 Troubleshooting', link: 'repo/user/troubleshooting' },
					],
				},
				{
					label: '📖 User Guides',
					items: [
						{ label: 'Mastering TestForge', link: 'repo/user/userguide' },
						{ label: '📋 Prompt Cheatbook', link: 'repo/user/promptcheatbook' },
						{ label: '🔄 Core Workflows', link: 'repo/user/workflows' },
						{ label: '🚀 Worked Examples', link: 'repo/user/workedexamples' },
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
						{ label: 'Class: ContextManager', link: 'api/agentbrain' },
						{ label: 'Class: PageController', link: 'api/pagecontroller' },
						{ label: 'Class: SandboxEngine', link: 'api/sandboxengine' },
					],
				},
				{
					label: '📐 Architecture',
					collapsed: true,
					items: [
						{ label: 'System Architecture', link: 'repo/technical/architecture' },
						{ label: 'Agent Protocol', link: 'repo/technical/agentprotocol' },
						{ label: 'MCP Config Reference', link: 'repo/technical/mcp_config_reference' },
						{ label: 'Security & Compliance', link: 'repo/technical/securityandcompliance' },
						{ label: 'Accessibility', link: 'repo/technical/accessibility' },
					],
				},
				{
					label: '📈 Infrastructure',
					collapsed: true,
					items: [
						{ label: 'Continuous Integration', link: 'repo/maintenance/continuousintegration' },
						{ label: 'Project Evolution', link: 'repo/maintenance/projectevolution' },
						{ label: 'Containerization', link: 'repo/maintenance/dockersetup' },
						{ label: 'Migration Guide', link: 'repo/maintenance/migrationguide' },
					],
				},
				{
					label: '🤝 Community & Help',
					collapsed: true,
					items: [
						{ label: 'Community Support', link: 'repo/user/community' },
						{ label: 'Frequently Asked Questions', link: 'repo/user/faq' },
						{ label: 'What\'s New', link: 'repo/user/whatsnew' },
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

