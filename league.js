// Coach tools on the League tab:
//  - change the league page link for a squad (saved in Firebase, where the
//    league robot reads it),
//  - ask the league robot (a GitHub Action, see update-league.yml) to fetch
//    the latest fixtures, results and table right now.
// The robot runs on GitHub's servers because browsers aren't allowed to read
// other websites' pages directly.
import { h } from './dom.js';

export const LEAGUE_URL = /^https:\/\/[a-z0-9.-]*sportlomo\.com\/league\/\d+\/?(\?[\w=&%.-]*)?$/i;
const API = 'https://api.github.com';
const WF = 'update-league.yml';
let ctx, token = null, tokenLoaded = false, busy = false, status = '', statusLink = null, statusBad = false;

export function initLeague(c) { ctx = c; }

// Work out the GitHub repository from the site address (owner.github.io/repo/).
export function ghRepo() {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return null;
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: seg && !seg.includes('.') ? seg : m[1] + '.github.io' };
}
const wfPage = (r) => 'https://github.com/' + r.owner + '/' + r.repo + '/actions/workflows/' + WF;

function say(text, opts = {}) { status = text; statusBad = !!opts.bad; statusLink = opts.link || null; ctx.redraw(); }
async function gh(path, opts = {}) {
  return fetch(API + path, { ...opts, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token, ...(opts.headers || {}) } });
}
async function loadToken() {
  if (tokenLoaded) return token;
  try { token = await ctx.store.getGithubToken(); } catch { token = null; }
  tokenLoaded = true; return token;
}
export function resetLeagueAdmin() { token = null; tokenLoaded = false; status = ''; statusLink = null; }

/* ---------- the panel ---------- */
export function leaguePanel(tk) {
  if (!tokenLoaded) loadToken().then(() => ctx.redraw());
  const T = ctx.fx().teams[tk] || {}, link = ctx.linkFor(tk), r = ghRepo();
  const pendingLink = ctx.savedLink(tk) && ctx.savedLink(tk) !== T.leagueUrl;
  const updated = ctx.fx().updatedAt ? new Date(ctx.fx().updatedAt).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const urlIn = h('input', { id: 'lg-url', type: 'url', value: link, maxlength: '200', autocomplete: 'off', inputmode: 'url', 'aria-describedby': 'lg-url-help' });
  const tokIn = h('input', { id: 'gh-tok', type: 'password', maxlength: '255', autocomplete: 'off', placeholder: 'github_pat_…' });

  return h('div', { class: 'card admin-league' },
    h('h3', { text: 'League settings: ' + ctx.squad(tk) }),
    h('div', { class: 'form' }, h('div', { class: 'w' },
      h('label', { for: 'lg-url', text: 'League page link (Leinster Rugby)' }), urlIn,
      h('p', { class: 'sub', id: 'lg-url-help', text: 'Open the squad\'s league on the Leinster Rugby website and copy the address from the browser bar. It looks like https://leinsterrugby.sportlomo.com/league/220427/' }))),
    h('div', { class: 'foot' }, h('button', { text: 'Save link', onclick: () => saveLink(tk, urlIn.value.trim()) })),
    pendingLink ? h('p', { class: 'sub warn-text', text: 'New link saved. The results below are still from the old league until the next update.' }) : null,
    h('p', { class: 'sub mt', text: updated ? 'Results last changed by the league robot: ' + updated + '.' : 'The league robot has not updated these results yet.' }),
    h('button', { class: 'pri2 mt', disabled: busy || !r, text: busy ? 'Working…' : 'Get latest results now', onclick: runRobot }),
    !r ? h('p', { class: 'sub', text: 'This button only works on the published site (github.io).' }) : null,
    status ? h('p', { class: 'sub mt' + (statusBad ? ' warn-text' : ''), role: 'status' }, status,
      statusLink ? [' ', h('a', { href: statusLink, target: '_blank', rel: 'noopener noreferrer', text: 'See details on GitHub' })] : null) : null,
    h('details', { class: 'mt gh', open: !token && tokenLoaded && status.startsWith('Opened GitHub') ? true : null },
      h('summary', { text: token ? 'One-tap updates: on' : 'One-tap updates: off (optional)' }),
      token
        ? [h('p', { class: 'sub', text: 'The button above starts the league robot straight away. The GitHub key is stored in Firebase and only coaches can read it.' }),
           h('div', { class: 'foot' }, h('button', { text: 'Turn off and forget the key', onclick: forgetToken }))]
        : [h('p', { class: 'sub', text: 'Without this, the button opens GitHub so you can start the robot there (you must be signed in to GitHub). To start it straight from here, paste a GitHub key. SETUP.md, Step 12 shows how to make one.' }),
           h('div', { class: 'form mt' }, h('div', { class: 'w' }, h('label', { for: 'gh-tok', text: 'GitHub key' }), tokIn)),
           h('div', { class: 'foot' }, h('button', { text: 'Check and save key', onclick: () => saveToken(tokIn.value.trim()) }))]));
}

/* ---------- actions ---------- */
async function saveLink(tk, url) {
  if (!LEAGUE_URL.test(url)) { say('That doesn\'t look like a Leinster Rugby league link. It should start https://leinsterrugby.sportlomo.com/league/ followed by a number.', { bad: true }); return; }
  try { await ctx.store.saveLeague(tk, url); }
  catch { say('Could not save the link. Check your connection and that you are signed in as a coach.', { bad: true }); return; }
  say('Link saved for ' + ctx.squad(tk) + '. Tap "Get latest results now" to load this league.');
}

async function saveToken(t) {
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/.test(t)) { say('That doesn\'t look like a GitHub key. It should start with github_pat_.', { bad: true }); return; }
  const r = ghRepo(); if (!r) { say('Keys can only be checked on the published site.', { bad: true }); return; }
  say('Checking the key with GitHub…');
  const old = token; token = t;
  try {
    const res = await gh('/repos/' + r.owner + '/' + r.repo + '/actions/workflows/' + WF);
    if (res.status === 404) throw new Error('GitHub could not find the league robot. Check Step 11 of SETUP.md is done, and that the key is for the ' + r.repo + ' repository.');
    if (!res.ok) throw new Error('GitHub did not accept this key (' + res.status + '). Make a new one following SETUP.md, Step 12.');
    await ctx.store.setGithubToken(t);
    say('Key saved. "Get latest results now" will now start the robot straight away.');
  } catch (e) { token = old; say(e.message || 'Could not check the key.', { bad: true }); }
}
async function forgetToken() {
  try { await ctx.store.setGithubToken(null); } catch {}
  token = null; say('One-tap updates turned off. The key has been removed from Firebase. You can also delete it on GitHub.');
}

async function runRobot() {
  const r = ghRepo(); if (!r || busy) return;
  await loadToken();
  const before = ctx.fx().updatedAt || '';
  if (!token) {
    window.open(wfPage(r), '_blank', 'noopener');
    say('Opened GitHub in a new tab. Click "Run workflow", then the green "Run workflow" button. New results will appear here by themselves within a few minutes.');
    watchFixtures(before, 8 * 60000);
    return;
  }
  busy = true; say('Asking the league robot to read the league pages…');
  const started = Date.now();
  try {
    const repo = await gh('/repos/' + r.owner + '/' + r.repo);
    if (repo.status === 401) throw new Error('GitHub no longer accepts the saved key (it may have expired). Make a new one (SETUP.md, Step 12) and save it below.');
    const branch = repo.ok ? (await repo.json()).default_branch || 'main' : 'main';
    const go = await gh('/repos/' + r.owner + '/' + r.repo + '/actions/workflows/' + WF + '/dispatches', { method: 'POST', body: JSON.stringify({ ref: branch }) });
    if (go.status === 404) throw new Error('GitHub could not find the league robot. Check Step 11 of SETUP.md is done.');
    if (go.status === 401 || go.status === 403) throw new Error('The saved GitHub key isn\'t allowed to start the robot. Make a new key with "Actions: Read and write" (SETUP.md, Step 12).');
    if (!go.ok) throw new Error('GitHub refused the request (' + go.status + '). Try again in a minute.');
    say('The robot is reading the league pages. This usually takes under a minute…');
    const run = await waitForRun(r, started);
    if (!run) { say('The robot is taking longer than usual. New results will appear here when it finishes.'); watchFixtures(before, 6 * 60000); return; }
    if (run.conclusion !== 'success') {
      say('The robot could not read one or both league pages, so nothing was changed for those squads. Check the league links are right.', { bad: true, link: run.html_url });
      watchFixtures(before, 4 * 60000);
      return;
    }
    say('Done. Loading the new results…');
    const changed = await watchFixtures(before, 3 * 60000, true);
    say(changed ? 'New results loaded.' : 'The league page has nothing new since the last update.');
  } catch (e) { say(e.message || 'Something went wrong talking to GitHub.', { bad: true }); }
  finally { busy = false; ctx.redraw(); }
}
async function waitForRun(r, started) {
  for (let i = 0; i < 48; i++) {
    await new Promise((res) => setTimeout(res, 5000));
    const q = await gh('/repos/' + r.owner + '/' + r.repo + '/actions/workflows/' + WF + '/runs?event=workflow_dispatch&per_page=5');
    if (!q.ok) continue;
    const run = ((await q.json()).workflow_runs || []).find((x) => Date.parse(x.created_at) >= started - 60000);
    if (run && run.status === 'completed') return run;
  }
  return null;
}
// After the robot saves, GitHub republishes the site, which takes a minute or two.
async function watchFixtures(before, maxMs, quietCheck) {
  const until = Date.now() + maxMs;
  if (quietCheck) {
    // If the robot saved nothing, there is no point waiting for the site to change.
    const r = ghRepo();
    try {
      const q = await gh('/repos/' + r.owner + '/' + r.repo + '/commits?path=fixtures.json&per_page=1');
      const c = q.ok ? (await q.json())[0] : null;
      if (!c || Date.parse(c.commit.committer.date) < Date.now() - 5 * 60000) return false;
    } catch {}
  }
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, 15000));
    const now = await ctx.reloadFixtures();
    if (now && now !== before) return true;
  }
  return false;
}
