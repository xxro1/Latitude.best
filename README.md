# Latitude.best — Render deployment

1. Upload the project files to a GitHub repository.
2. In Render, choose **New → Web Service** and connect the repository.
3. Use build command `npm install` and start command `npm start` (or let Render read `render.yaml`).
4. Add these environment variables in Render before deploying:
   - `DISCORD_INVITE` — your full Discord invite URL, e.g. `https://discord.gg/yourinvite`.
   - `ADMIN_PASSWORD` — a strong, private password for `/\#admin`.
   - `SESSION_SECRET` — a long random secret used to protect admin login sessions.
5. Deploy.

## Admin panel

Open `https://your-site.onrender.com/#admin`, enter the `ADMIN_PASSWORD`, then choose **Online**, **Updating**, or **Offline** and optionally enter a message (up to 160 characters). Press **Save status**. The public website updates as visitors refresh/poll the status.

The admin panel only changes the website status. The password is checked on the server; it is not stored in the website HTML. Do not share `ADMIN_PASSWORD` or `SESSION_SECRET`.

**Important:** status changes are held in the running server's memory. They remain active while the Render instance is running, but reset to the `SITE_STATUS` / `STATUS_MESSAGE` environment-variable defaults after a restart or redeploy. For permanent persistence across restarts, connect a database or persistent storage.

## Environment variables

- `DISCORD_INVITE`: Discord invite URL; used for the buttons and server-side member counts.
- `ADMIN_PASSWORD`: required admin login password.
- `SESSION_SECRET`: required in production; use a long random value.
- `SITE_STATUS`: starting status: `online`, `updating`, or `offline` (default `online`).
- `STATUS_MESSAGE`: optional starting status message (up to 160 characters).
- `PORT`: supplied automatically by Render.

## API

- `GET /api/config` — Discord invite URL for the buttons.
- `GET /api/status` — current website status.
- `GET /api/discord` — Discord counts, fetched server-side and cached for 60 seconds.
- `POST /api/admin/login` — admin login.
- `GET /api/admin/session` — checks whether the browser is logged in.
- `PUT /api/admin/status` — changes status (admin session required).
- `POST /api/admin/logout` — ends the admin session.
- `GET /health` — Render health check.
