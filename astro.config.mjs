// @ts-check

import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import rehypeMermaid from "rehype-mermaid";

// https://astro.build/config
export default defineConfig({
	site: "https://sitecore.brendanholly.com",
	integrations: [mdx(), sitemap()],
	markdown: {
		syntaxHighlight: {
			type: "shiki",
			excludeLangs: ["mermaid", "math"],
		},
		rehypePlugins: [
			[rehypeMermaid, { strategy: "img-svg", dark: true, theme: "dark" }],
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
