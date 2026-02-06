# Deploying to Cloudflare Pages

This site is a static bundle (HTML/CSS) and deploys cleanly to Cloudflare Pages.

## Option 1: Cloudflare Workers Static Assets (Recommended)
This follows Cloudflare’s Workers static assets deployment flow.

From the repo root:
```bash
npx wrangler deploy
```

This uses `wrangler.toml` and `worker.js` to serve static assets.

## Branch Note
This branch contains only the static website assets for PrintMux.

## Option 2: Git‑based Pages Deploy
1. Push the repo to GitHub.
2. In Cloudflare Pages, create a new project from the GitHub repo.
3. Set the **Root directory** to `.` (repo root).
4. Build command: `echo "no build"`
5. Output directory: `.` (default).
6. Deploy.

## If You See a Wrangler Error
If your deploy logs show:
`Missing entry-point to Worker script or to assets directory`,
it means Pages is running a **Workers deploy** command.
Fix it by:
- Setting **Build command** to `echo "no build"`, and
- Setting the **Root directory** to `website`.

Cloudflare Pages will then deploy the static files directly without Wrangler.

## Custom Domain
1. In Cloudflare Pages → Custom Domains, add `printmux.com`.
2. Follow the DNS instructions to update the required CNAME/AAAA records.
3. Ensure SSL is enabled (Cloudflare will provision automatically).

## Local Preview
You can open `index.html` directly or use a static server:
```bash
python -m http.server --directory . 8080
```
