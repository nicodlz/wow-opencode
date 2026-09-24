#!/usr/bin/env node
'use strict';
// Keeps bridge.js running: restarts it 3 s after any exit. Ctrl+C stops both.
// This is also the `wow-opencode` command (package.json "bin"): arguments and the
// current folder pass straight through to bridge.js, so `cd proj && wow-opencode`
// makes proj the default folder for chats.
const { spawn } = require('child_process');
const path = require('path');

let child = null;
let stopping = false;

function start() {
  child = spawn(process.execPath, [path.join(__dirname, 'bridge.js'), ...process.argv.slice(2)], { stdio: 'inherit' });
  child.on('exit', (code) => {
    child = null;
    if (stopping) return;
    if (code === 2 || code === 0) process.exit(code); // config problem or --help/--once: don't loop
    console.log(`\nbridge exited (${code}); restarting in 3 s`);
    setTimeout(start, 3000);
  });
}

function stop() {
  stopping = true;
  if (!child) return process.exit(0);
  if (process.platform === 'win32') {
    // Windows termination does not run the bridge's SIGTERM handler. Stop the
    // capture PowerShell process as well, rather than leaving it orphaned.
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    killer.on('close', () => process.exit(0));
    killer.on('error', () => { child?.kill(); process.exit(0); });
  } else {
    child.once('exit', () => process.exit(0));
    child.kill();
  }
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start();
