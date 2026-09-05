# Deployment

## Requirements

Node.js 20 or newer. Nothing else. No database, no build step, no runtime dependencies.

## Local / single machine

```bash
git clone <your-repo> /srv/citebeam
cd /srv/citebeam
cp .env.example .env     # add API keys if you have them
node bin/citebeam.js serve --port 4317
```

Data is written to `data/` (run history) and `audits/` (rendered reports). Back up by copying
those two directories.

## Docker

```bash
docker build -t citebeam .
docker run -d --name citebeam -p 4317:4317 \
  -v "$PWD/data:/app/data" -v "$PWD/audits:/app/audits" \
  --env-file .env citebeam
```

## systemd

```ini
# /etc/systemd/system/citebeam.service
[Unit]
Description=CiteBeam
After=network.target

[Service]
Type=simple
User=citebeam
WorkingDirectory=/srv/citebeam
EnvironmentFile=/srv/citebeam/.env
ExecStart=/usr/bin/node bin/citebeam.js serve --port 4317
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now citebeam
```

## Security

The server **binds to `127.0.0.1` by default and has no authentication.** That is deliberate:
adding half an auth system is worse than none. To expose it, terminate TLS and authenticate at
a reverse proxy:

```nginx
server {
  listen 443 ssl;
  server_name citebeam.example.com;

  location / {
    auth_basic "CiteBeam";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:4317;
    proxy_set_header Host $host;
  }
}
```

Pass `--host 0.0.0.0` only when something else is doing the authenticating.

## Scheduled monitoring

Monthly re-runs per client:

```cron
0 9 1 * * cd /srv/citebeam && /usr/bin/node bin/citebeam.js audit --brand clients/acme.json --format html,md --quiet
```

Every profile in a directory:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/citebeam
for f in clients/*.json; do
  node bin/citebeam.js audit --brand "$f" --format html,md --quiet || echo "failed: $f" >&2
done
```

Each run records history, so the next report includes a delta against the previous one.

## CI gating

Fail a build when a site regresses below a threshold:

```yaml
- name: AI visibility gate
  run: |
    node bin/citebeam.js audit --domain example.com \
      --category "what we sell" --no-visibility --fail 70
```

Exits `2` when the composite score is below the threshold.

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY` / `GEMINI_API_KEY` | Live engines |
| `CITEBEAM_OPENAI_MODEL` etc. | Override the model per provider |
| `PORT` / `CITEBEAM_PORT` | Dashboard port |
| `CITEBEAM_DATA_DIR` / `CITEBEAM_OUT_DIR` | Storage locations |
| `CITEBEAM_MAX_PAGES` / `CITEBEAM_PROMPT_COUNT` | Defaults for audits |
| `CITEBEAM_CRAWL_CONCURRENCY` / `CITEBEAM_ENGINE_CONCURRENCY` | Parallelism |
| `CITEBEAM_ACCESS_LOG` | Set to enable HTTP access logging |

## Cost per audit

API spend only, at 24 prompts:

| Engines | Approx. cost per audit |
|---|---|
| Crawl only | $0.00 |
| One engine | $0.01–0.05 |
| All four | $0.05–0.20 |

Which is the entire commercial argument: audits you sell for hundreds cost you cents.
