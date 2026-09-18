/* Relay only. Job runner lives in the side panel (MV3 workers sleep). Cookies never stored. */
var AFFILIATE_URL = 'https://seller-id.tokopedia.com/';
var HOST_RE = /(^|\.)seller-id\.tokopedia\.com$|(^|\.)tiktokshop\.com$|(^|\.)tiktokglobalshop\.com$/i;
var frames = {};

try {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} catch (err) { /* older Chrome */ }

function injectTab(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    files: ['content/inject-hook.js'],
    world: 'MAIN'
  }).catch(function () {});
  chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    files: ['content/adapter.js', 'content/affiliate-center.js']
  }).catch(function () {});
}

function injectMatchingTabs() {
  chrome.tabs.query({}, function (tabs) {
    (tabs || []).forEach(function (tab) {
      if (tab.id && tab.url && hostOk(tab.url)) injectTab(tab.id);
    });
  });
}

chrome.runtime.onInstalled.addListener(injectMatchingTabs);

function hostOk(url) {
  try { return HOST_RE.test(new URL(url).hostname); } catch (e) { return false; }
}

function isAffiliateUrl(url) {
  return /affiliate|collaboration|creator|target.?collab/i.test(String(url || ''));
}

function frameKey(tabId, frameId) {
  return tabId + ':' + frameId;
}

function rememberFrame(sender, payload) {
  if (!sender || !sender.tab) return;
  var tabId = sender.tab.id;
  var frameId = sender.frameId == null ? 0 : sender.frameId;
  frames[frameKey(tabId, frameId)] = {
    tabId: tabId,
    frameId: frameId,
    href: payload && payload.href || sender.tab.url || '',
    affiliate: !!(payload && payload.affiliate),
    shopSession: !!(payload && payload.shopSession),
    shopName: payload && payload.shopName || '',
    recon: payload && payload.recon || {},
    at: Date.now()
  };
}

function pruneFrames() {
  var cut = Date.now() - 20000;
  Object.keys(frames).forEach(function (k) {
    if (frames[k].at < cut) delete frames[k];
  });
}

function bestFrame() {
  pruneFrames();
  var list = Object.keys(frames).map(function (k) { return frames[k]; });
  list.sort(function (a, b) {
    var as = (a.affiliate ? 4 : 0) + (a.shopSession ? 1 : 0) + (a.recon && (a.recon.collab || a.recon.im || a.recon.search) ? 2 : 0) + (isAffiliateUrl(a.href) ? 1 : 0);
    var bs = (b.affiliate ? 4 : 0) + (b.shopSession ? 1 : 0) + (b.recon && (b.recon.collab || b.recon.im || b.recon.search) ? 2 : 0) + (isAffiliateUrl(b.href) ? 1 : 0);
    return bs - as;
  });
  return list[0] || null;
}

function pingPayload() {
  var f = bestFrame();
  if (!f || (!f.affiliate && !f.shopSession)) {
    return { ok: false, code: 'no_tab', reason: 'Buka Seller Center / Affiliate Center di tab Chrome ini.', recon: (f && f.recon) || {} };
  }
  return {
    ok: !!(f.affiliate || f.shopSession),
    connected: !!f.affiliate,
    shopSession: !!f.shopSession,
    shopName: f.shopName || '',
    href: f.href,
    affiliate: !!f.affiliate,
    recon: f.recon || {}
  };
}

async function findOrOpenAffiliateTab() {
  var f = bestFrame();
  if (f) {
    try { await chrome.tabs.update(f.tabId, { active: true }); } catch (e) { /* ignore */ }
    return { ok: true, tabId: f.tabId, href: f.href };
  }
  var stored = await chrome.storage.local.get('laris-last-affiliate-url');
  var url = stored['laris-last-affiliate-url'] || AFFILIATE_URL;
  var tab = await chrome.tabs.create({ url: url, active: true });
  return { ok: true, opened: true, tabId: tab.id, href: url };
}

function sendToBestFrame(message) {
  return new Promise(function (resolve) {
    var f = bestFrame();
    if (!f || (!f.affiliate && !f.shopSession)) {
      resolve({ ok: false, code: 'no_tab', reason: 'Buka Seller Center / Affiliate Center di tab Chrome ini.' });
      return;
    }
    chrome.tabs.sendMessage(f.tabId, message, { frameId: f.frameId }, function (res) {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          code: 'no_listener',
          reason: 'Tab Seller Center belum siap. Refresh Affiliate Center, lalu coba lagi.'
        });
        return;
      }
      resolve(res || { ok: false, code: 'empty', reason: 'Affiliate Center tidak menjawab.' });
    });
  });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'laris-hello') {
    rememberFrame(sender, msg);
    if (msg.href && isAffiliateUrl(msg.href)) {
      chrome.storage.local.set({ 'laris-last-affiliate-url': msg.href });
    }
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === 'laris-ping') {
    sendResponse(pingPayload());
    return;
  }

  if (msg.type === 'laris-open-affiliate') {
    findOrOpenAffiliateTab().then(sendResponse);
    return true;
  }

  if (msg.type === 'laris-recon-get') {
    chrome.storage.local.get('laris-affiliate-recon', function (res) {
      sendResponse(res['laris-affiliate-recon'] || {});
    });
    return true;
  }

  if (msg.type === 'laris-probe') {
    sendToBestFrame({
      type: 'laris-probe',
      row: msg.row,
      ctx: msg.ctx
    }).then(sendResponse);
    return true;
  }

  if (msg.type === 'laris-send') {
    var ctx = msg.ctx || {};
    if (!ctx.allowLiveSend || ctx.dryRun) {
      sendResponse({
        ok: false,
        live: false,
        code: 'locked',
        reason: 'Kirim live ditolak di background. Tidak ada undangan yang dikirim.'
      });
      return;
    }
    sendToBestFrame({
      type: 'laris-send',
      row: msg.row,
      ctx: ctx
    }).then(sendResponse);
    return true;
  }
});
