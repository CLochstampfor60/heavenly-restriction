// The one way this repo starts a browser: e2e tests, screenshots and icons all go through here.
//
// Rules it enforces
// - Headless only, always. There is no option to show a window.
// - Every browser it starts carries a marker on its command line, --hr-test-browser=<node pid>-<id>,
//   so its processes can be found later even if Playwright lost track of them.
// - closeBrowser() closes it, kills anything with its marker that is still alive, and throws if a
//   process survives. Teardown therefore fails loudly instead of leaving a browser behind.
// - If node exits any other way (an exception, Ctrl+C, the console closing), an exit hook kills
//   this run's browsers. A run killed outright (Task Manager, a shell timeout) runs no hook, so
//   the next launch first sweeps browsers whose owning node process is gone.
//
// Also a command, to find (and with --kill, end) browsers left by earlier runs:
//   node scripts/browser.mjs          list leftover test browsers; exit code 1 if any
//   node scripts/browser.mjs --kill   end them, then check again
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MARKER = '--hr-test-browser';
const windows = process.platform === 'win32';
const runId = `${process.pid}-${randomBytes(4).toString('hex')}`;
const mine = `${MARKER}=${runId}`;
let hooked = false;
let open = 0; // browsers launched and not yet closed by closeBrowser()

// Browser processes carrying the marker: [{ pid, owner, run }]. `owner` is the node pid that
// launched it (from the marker). Only browser executables are listed, never the shell that
// searched, whose own command line contains the marker text.
export function markedProcesses() {
  let lines;
  if (windows) {
    const query =
      "Get-CimInstance Win32_Process -Filter \"(Name='msedge.exe' OR Name='chrome.exe' OR " +
      "Name='chrome-headless-shell.exe') AND CommandLine LIKE '%hr-test-browser=%'\" | " +
      "ForEach-Object { '{0} {1}' -f $_.ProcessId, $_.CommandLine }";
    lines = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', query], {
      encoding: 'utf8',
      windowsHide: true,
    }).split(/\r?\n/);
  } else {
    lines = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /(chrom|msedge)/i.test(l));
  }
  const found = [];
  for (const line of lines) {
    const m = line.trim().match(/^(\d+)\s.*--hr-test-browser=((\d+)-[0-9a-f]+)/);
    if (m) found.push({ pid: Number(m[1]), run: m[2], owner: Number(m[3]) });
  }
  return found;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function kill(pids) {
  for (const pid of pids) {
    try {
      if (windows) {
        execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } else {
        process.kill(pid, 'SIGKILL');
      }
    } catch {
      // already gone (a tree kill of its parent ended it)
    }
  }
}

// Synchronous, so it also works from process.on('exit').
function killRun(run) {
  try {
    kill(markedProcesses().filter((p) => p.run === run).map((p) => p.pid));
  } catch {
    // best effort while exiting
  }
}

// Ends marked browsers whose node process no longer exists (left by a run that was killed).
export function sweepOrphans() {
  const orphans = markedProcesses().filter((p) => !alive(p.owner));
  kill(orphans.map((p) => p.pid));
  return orphans.length;
}

function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on('exit', () => open && killRun(runId));
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.once(signal, () => {
      killRun(runId);
      process.exit(130);
    });
  }
}

// An installed Edge or Chrome, headless, through playwright-core (no browser download).
export async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  sweepOrphans();
  hookExit();
  const errors = [];
  for (const channel of ['msedge', 'chrome']) {
    try {
      const browser = await chromium.launch({ channel, headless: true, args: [mine] });
      open += 1;
      return browser;
    } catch (error) {
      errors.push(`${channel}: ${error.message.split('\n')[0]}`);
    }
  }
  throw new Error(`Needs Microsoft Edge or Google Chrome installed.\n${errors.join('\n')}`);
}

// Closes the browser (10 s at most), ends any of this run's processes still alive, and throws if
// one survives that.
export async function closeBrowser(browser) {
  if (browser) {
    open = Math.max(0, open - 1);
    await Promise.race([browser.close().catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);
  }
  let left = markedProcesses().filter((p) => p.run === runId);
  if (left.length) {
    kill(left.map((p) => p.pid));
    await new Promise((r) => setTimeout(r, 500));
    left = markedProcesses().filter((p) => p.run === runId);
  }
  if (left.length) {
    throw new Error(`Browser processes still running after close: ${left.map((p) => p.pid).join(', ')}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let left = markedProcesses();
  if (left.length && process.argv.includes('--kill')) {
    kill(left.map((p) => p.pid));
    await new Promise((r) => setTimeout(r, 500));
    left = markedProcesses();
  }
  if (left.length) {
    console.log(`Leftover test browser processes: ${left.map((p) => p.pid).join(', ')}`);
    console.log('End them with: npm --prefix frontend run browsers:clean');
    process.exitCode = 1;
  } else {
    console.log('No leftover test browsers.');
  }
}
