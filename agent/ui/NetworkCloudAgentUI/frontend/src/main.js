import './style.css';
import './app.css';

import { GetStatus, StartLink, LinkStatus, Unlink } from '../wailsjs/go/main/App';

document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>NetworkCloud Agent</h1>
    <div class="status" id="status">Loading status...</div>
    <div class="details" id="details"></div>
    <div class="actions">
      <button class="btn" id="refresh">Refresh</button>
      <button class="btn" id="link">Link Device</button>
      <button class="btn" id="unlink">Unlink</button>
    </div>
    <div class="link-box" id="linkBox"></div>
  </div>
`;

const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const linkBoxEl = document.getElementById('linkBox');

document.getElementById('refresh').onclick = refreshStatus;
document.getElementById('link').onclick = startLink;
document.getElementById('unlink').onclick = unlinkDevice;

let linkPoller = null;

refreshStatus();

function setStatusText(text) {
  statusEl.textContent = text;
}

function setDetails(details) {
  detailsEl.innerHTML = details;
}

async function refreshStatus() {
  try {
    const status = await GetStatus();
    setStatusText(`State: ${status.state}`);
    setDetails(`
      <div>Linked: ${status.linked}</div>
      <div>Agent UUID: ${status.agentUuid || '-'}</div>
      <div>Server URL: ${status.serverUrl}</div>
      <div>Updated: ${status.updatedAt}</div>
    `);
  } catch (err) {
    setStatusText(`Status error: ${err}`);
  }
}

async function startLink() {
  linkBoxEl.textContent = 'Starting link...';
  try {
    const resp = await StartLink();
    linkBoxEl.innerHTML = `
      <div>Visit: ${resp.verificationUrl}</div>
      <div>Enter code: ${resp.userCode}</div>
      <div>Expires: ${resp.expiresAt}</div>
    `;
    startLinkPolling();
  } catch (err) {
    linkBoxEl.textContent = `Link error: ${err}`;
  }
}

function startLinkPolling() {
  if (linkPoller) {
    clearInterval(linkPoller);
  }
  linkPoller = setInterval(async () => {
    try {
      const status = await LinkStatus();
      if (status.state === 'authorized') {
        clearInterval(linkPoller);
        linkPoller = null;
        linkBoxEl.textContent = 'Device linked.';
        refreshStatus();
      }
      if (status.error) {
        clearInterval(linkPoller);
        linkPoller = null;
        linkBoxEl.textContent = `Link error: ${status.error}`;
      }
    } catch (err) {
      clearInterval(linkPoller);
      linkPoller = null;
      linkBoxEl.textContent = `Link status error: ${err}`;
    }
  }, 3000);
}

async function unlinkDevice() {
  try {
    await Unlink();
    linkBoxEl.textContent = 'Device unlinked.';
    refreshStatus();
  } catch (err) {
    linkBoxEl.textContent = `Unlink error: ${err}`;
  }
}
