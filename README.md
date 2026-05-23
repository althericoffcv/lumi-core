# Lumi Base API
**by Altheric Official**

Minimal open REST API. No login, no admin, no portfolio — just pure API.

## Features
- Pinterest Image Search (`/search/pinterest?q=`)

## Stack
- Node.js + Express
- Axios (scraping)
- Rate Limiting (60 req/min)

## Run Locally
```bash
npm install
npm start
```

## Deploy
- **Railway**: push to GitHub, connect repo
- **Render**: use `render.yaml`
- **Vercel**: `npm run vercel-build`, set `main: index.js`

## Endpoints

| Method | Path | Params | Description |
|--------|------|--------|-------------|
| GET | `/search/pinterest` | `q` (required) | Search Pinterest images |

## License
MIT
