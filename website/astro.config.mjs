import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const site = 'https://rohit5688.github.io';
const base = '/TestForge';

export default defineConfig({
	site,
	base,
	integrations: [
		starlight({
			favicon: '/favicon.png',
			title: 'TestForge',
			customCss: ['./src/styles/custom.css'],
			logo: {
				src: './src/assets/logo.png',
			},
			social: {
				// github: 'https://github.com/Rohit5688/appium-cucumber-pom-mcp',
			},
			editLink: {
				baseUrl: undefined,
			},
			sidebar: [
				{
					label: '🚀 Getting Started',
					items: [
						{ label: 'Onboarding', link: 'repo/user/onboarding' },
						{ label: 'User Guide', link: 'repo/user/userguide' },
						{ label: 'Workflows', link: 'repo/user/workflows' },
						{ label: 'Prompt Cheatbook', link: 'repo/user/testforge_prompt_cheatbook' },
					],
				},
				{
					label: '🛠️ Core Guides',
					items: [
						{ label: 'Test Generation', link: 'repo/technical/testgeneration' },
						{ label: 'Execution & Healing', link: 'repo/technical/executionandhealing' },
						{ label: 'Migration Guide', link: 'repo/technical/migrationguide' },
					],
				},
				{
					label: '📐 Reference',
					items: [
						{ label: 'Config Reference', link: 'repo/technical/mcp_config_reference' },
						{ label: 'Security & Compliance', link: 'repo/technical/securityandcompliance' },
						{ label: 'Accessibility Testing', link: 'repo/technical/accessibility' },
						{ label: 'Token Optimizer', link: 'repo/technical/tokenoptimizer' },
					],
				},
				{
					label: '📈 Operations',
					items: [
						{ label: 'Continuous Integration', link: 'repo/maintenance/continuousintegration' },
						{ label: 'Project Evolution', link: 'repo/maintenance/projectevolution' },
						{ label: 'Docker Setup', link: 'repo/maintenance/dockersetup' },
						{ label: 'Team Collaboration', link: 'repo/user/teamcollaboration' },
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

