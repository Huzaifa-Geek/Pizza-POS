const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const isDev = !app.isPackaged;
const projectRoot = path.join(__dirname, '..');
const serverPath = path.join(projectRoot, 'server.js');
let backendProcess = null;

async function waitForServer(url, retries = 40, delayMs = 500) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // Keep retrying until the backend is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Backend server did not start in time.');
}

async function startBackend() {
  const nodeCommand = process.env.NODE_BINARY || 'node';

  backendProcess = spawn(nodeCommand, [serverPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      POS_DATA_DIR: path.join(app.getPath('userData'), 'data'),
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  backendProcess.on('error', (error) => {
    dialog.showErrorBox(
      'Backend Start Failed',
      `Could not start the POS backend with "${nodeCommand}".\n\n${error.message}`,
    );
  });

  await waitForServer('http://localhost:3001/api/health');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    return;
  }

  win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('Startup Failed', error.message);
    app.quit();
    return;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});
