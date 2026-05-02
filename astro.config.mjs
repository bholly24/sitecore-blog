// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import { rehypeGithubAlerts } from "rehype-github-alerts";
import rehypeMermaid from "rehype-mermaid";

// https://astro.build/config
export default defineConfig({
	site: "https://sitecore.brendanholly.com",
	output: "static",
	trailingSlash: "never",

	redirects: {
		"/blog": "/",
	},

	integrations: [mdx(), sitemap()],

	markdown: {
		syntaxHighlight: {
			type: "shiki",
			excludeLangs: ["mermaid", "math"],
		},
		rehypePlugins: [
			rehypeGithubAlerts,
			[
				rehypeMermaid,
				{
					strategy: "inline-svg",
					mermaidConfig: {
						theme: "base",
						themeVariables: {
							background: "#0f1117",
							mainBkg: "#1c2030",
							primaryColor: "#1c2030",
							primaryBorderColor: "#7c8cff",
							primaryTextColor: "#d2daeb",
							lineColor: "#828caa",
							edgeLabelBackground: "#0f1117",
							clusterBkg: "#1c2030",
							titleColor: "#d2daeb",
							fontFamily: "Atkinson, sans-serif",
						},
					},
				},
			],
		],
	},

	fonts: [
		{
			provider: fontProviders.local(),
			name: "Atkinson",
			cssVariable: "--font-atkinson",
			fallbacks: ["sans-serif"],
			options: {
				variants: [
					{
						src: ["./src/assets/fonts/atkinson-regular.woff"],
						weight: 400,
						style: "normal",
						display: "swap",
					},
					{
						src: ["./src/assets/fonts/atkinson-bold.woff"],
						weight: 700,
						style: "normal",
						display: "swap",
					},
				],
			},
		},
	],

});
