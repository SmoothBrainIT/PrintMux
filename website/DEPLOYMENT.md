# Deploying to Cloudflare Pages

This site is a static bundle (HTML/CSS) and deploys cleanly to Cloudflare Pages.

## Option 1: Git‑based Deploy (Recommended)
1. Push the repo to GitHub.
2. In Cloudflare Pages, create a new project from the GitHub repo.
3. Set the **Root directory** to `website`.
4. Build command: leave blank.
5. Output directory: `.` (default).
6. Deploy.

## Custom Domain
1. In Cloudflare Pages → Custom Domains, add `printmux.com`.
2. Follow the DNS instructions to update the required CNAME/AAAA records.
3. Ensure SSL is enabled (Cloudflare will provision automatically).

## Local Preview
You can open `website/index.html` directly or use a static server:
```bash
python -m http.server --directory website 8080
```
