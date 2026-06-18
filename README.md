# Pizza POS

Pizza POS is an Electron desktop point-of-sale app for pizza shops and small restaurants. It includes a React frontend, an Express API, SQLite storage, menu/deal management, order entry, kitchen order tickets, shift cash tracking, expenses, receipts, and daily reports.

## Tech Stack

- Electron for the desktop shell and installer packaging
- React, Vite, and Tailwind CSS for the frontend
- Express for the local backend API
- SQLite through `better-sqlite3` for local data storage
- Electron Builder for Windows installer builds

## Project Structure

```text
Pizza-POS/
  electron/            Electron main process and desktop assets
  frontend/            React/Vite frontend app
  server.js            Express API and SQLite schema
  data/                Local development database files, ignored by Git
  package.json         Root scripts and Electron Builder config
```

## Requirements

- Node.js 20 or newer
- npm
- Windows, macOS, or Linux for development
- Windows if you want to build the included NSIS installer target as-is

## Install

```bash
npm install
npm --prefix frontend install
```

Optional: copy `.env.example` to `.env` if you want to override backend settings during development.

## Development

Run the browser-based development app:

```bash
npm run dev
```

This starts:

- backend API at `http://localhost:3001`
- Vite frontend at `http://localhost:5173`

Run the Electron desktop app in development:

```bash
npm run dev:desktop
```

The Electron app starts the backend automatically, waits for the frontend, and opens the desktop window.

## Production Build

Build the frontend:

```bash
npm run build
```

Open the packaged-style desktop app locally:

```bash
npm run desktop
```

Create a Windows installer with Electron Builder:

```bash
npm run build:desktop
```

The generated installer is written to `dist/`.

## Data Storage

In development, SQLite files are created in `data/`.

In a packaged Electron app, live SQLite files are stored in Electron's user data directory, not inside the installed application folder. This keeps customer data writable after installation and prevents build output from containing your local test database.

## Customize Before Launch

Change the visible app and shop names before you build your software.

### 1. App package name and installer name

Edit `package.json`:

```json
{
  "name": "pizza-pos",
  "build": {
    "appId": "com.example.pizzapos",
    "productName": "Pizza POS"
  }
}
```

- `name`: npm package name, use lowercase letters and dashes
- `build.appId`: unique reverse-domain app ID, for example `com.yourcompany.yourapp`
- `build.productName`: name shown by the installer and desktop app

After changing `package.json`, refresh the lockfile:

```bash
npm install --package-lock-only
```

### 2. Frontend brand text

Edit `frontend/src/App.jsx`:

```js
const APP_BRAND = {
  productName: 'Pizza POS',
  shopName: 'Your Pizza Shop',
  tagline: 'Fast ordering, kitchen tickets, shifts, and daily reports.',
}
```

Change these values to your restaurant or software brand.

### 3. Browser window title

Edit `frontend/index.html`:

```html
<title>Pizza POS</title>
```

### 4. Receipt/shop name and currency

For development, copy `.env.example` to `.env` and change:

```env
POS_SHOP_NAME="Your Pizza Shop"
POS_CURRENCY=PKR
POS_DB_FILE=pizza-pos.sqlite
```

For packaged Electron builds, you can also set these environment variables before launching the app if you need deployment-specific overrides.

### 5. App icon

Place production icons in `electron/assets/` and update the Electron Builder config in `package.json`.

Common Windows setup:

```json
{
  "build": {
    "directories": {
      "buildResources": "electron/assets"
    },
    "win": {
      "target": "nsis",
      "icon": "electron/assets/icon.ico"
    }
  }
}
```

### 6. Default menu items

Edit the seed products in `server.js` inside `seedData()`. These are only inserted when the database is empty.

To reset development data, stop the app and delete the ignored SQLite files in `data/`.
