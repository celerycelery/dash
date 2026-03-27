# Dash & Burn

An interactive browser game about the slippery slope of dashboard manipulation. You play as a data analyst at **Synergex**, a startup where well-meaning colleagues keep asking you to make the metrics look "just a little better" before the board meeting, the investor pitch, or the OKR review.

Each round, you receive a message from a coworker requesting a change to a key business metric — revenue, MAU, churn, burn rate, conversion, or NPS. You control the dashboard: pick metric definitions, adjust date ranges, choose chart types, and toggle segments. Every tweak is tracked. The deeper you go, the harder it gets to walk back.

The game spans 20 rounds across 4 quarters, culminating in an audit that scores how much you manipulated — or held the line.

## Tech Stack

- **React 19** with Vite 8
- **Recharts** for interactive charts
- **Tailwind CSS 4** for styling

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Production Build

```bash
npm run build
npm run preview
```

## Docker

### Docker Compose

```bash
docker compose up --build
```

### Manual Docker Build & Run

```bash
git clone https://github.com/celerycelery/dash.git
cd dash
docker build -t dash-and-burn .
docker run -d -p 3000:80 --name DashAndBurn dash-and-burn
```

### Unraid

Unraid cannot build images from a Git URL directly. You have two options:

**Option A — SSH / terminal:**

SSH into your Unraid server and run the manual build commands above.

**Option B — Use a pre-built image:**

If the image is published to a registry (e.g. Docker Hub or GHCR), use that image name in the Unraid Docker UI instead of the GitHub URL.

Once running, access the game at `http://<your-server-ip>:3000`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |
