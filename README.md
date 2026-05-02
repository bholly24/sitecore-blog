# Sitecore Blog

## Images

**Hard limit: 300KB per image file.** CI enforces this via `scripts/check-image-sizes.sh`. Run it locally before pushing:

```bash
./scripts/check-image-sizes.sh
```

Resize to max 1200px wide and compress before committing. On macOS:

```bash
sips -Z 1200 src/assets/my-image.jpg
```

Or with ImageMagick:

```bash
magick src/assets/my-image.jpg -resize 1600x -quality 80 src/assets/my-image.jpg
```

Astro's `<Image />` component handles further optimization (WebP, responsive sizes) at build time — the goal here is just keeping raw camera originals out of git.

