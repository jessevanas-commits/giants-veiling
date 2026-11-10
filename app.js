(function () {
  "use strict";

  const C = window.CONFIG;
  if (!C) {
    document.getElementById("status").textContent = "Config ontbreekt";
    return;
  }

  const params = new URLSearchParams(location.search);
  const isAdmin = params.get("admin") === C.adminToken;
  if (isAdmin) document.body.classList.add("is-admin");

  const els = {
    grid: document.getElementById("grid"),
    clock: document.getElementById("clock"),
    status: document.getElementById("status"),
    warn: document.getElementById("backend-warn"),
    admin: document.getElementById("admin-table"),
  };

  const itemById = Object.fromEntries(C.items.map((it) => [it.id, it]));

  function emptyState() {
    const items = {};
    for (const it of C.items) {
      items[it.id] = { amount: 0, name: null, seat: null, bids: [] };
    }
    return { rev: 0, items };
  }

  let state = emptyState();
  let backendOk = false;

  function euro(n) {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function bidsOf(entry) {
    const raw = entry && entry.bids;
    let list = [];
    if (Array.isArray(raw)) list = raw.slice();
    else if (raw && typeof raw === "object") list = Object.values(raw);
    return list
      .filter((b) => b && typeof b.amount === "number")
      .sort((a, b) => b.amount - a.amount || String(b.at).localeCompare(String(a.at)));
  }

  function currentHigh(id) {
    const entry = state.items[id] || {};
    const bids = bidsOf(entry);
    if (bids.length) return { amount: bids[0].amount, name: bids[0].name, seat: bids[0].seat || "" };
    if (entry.amount > 0) return { amount: entry.amount, name: entry.name, seat: entry.seat || "" };
    return { amount: 0, name: null, seat: "" };
  }

  function minBid(id) {
    const high = currentHigh(id).amount;
    const start = itemById[id].startBid;
    const step = Number(C.minIncrement) || 1;
    return high > 0 ? high + step : start;
  }

  function isClosed() {
    return Date.now() >= new Date(C.closeAt).getTime();
  }

  function newId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function setStatus(text, live) {
    els.status.textContent = text;
    els.status.classList.toggle("live", !!live);
  }

  /* -------------------- backends -------------------- */

  function normalize(data) {
    const base = emptyState();
    if (!data || typeof data !== "object") return base;
    base.rev = Number(data.rev) || 0;
    const src = data.items || data;
    for (const it of C.items) {
      const e = src[it.id] || {};
      base.items[it.id] = {
        amount: Number(e.amount) || 0,
        name: e.name || null,
        seat: e.seat || null,
        bids: bidsOf(e),
      };
    }
    return base;
  }

  function applyItemUpdate(id, entry) {
    state.items[id] = {
      amount: Number(entry.amount) || 0,
      name: entry.name || null,
      seat: entry.seat || null,
      bids: bidsOf(entry),
    };
  }

  const backend = createBackend();

  function createBackend() {
    const type = (C.backend && C.backend.type) || "none";
    if (type === "firebase") return firebaseBackend();
    if (type === "json") return jsonBackend();
    return noneBackend();
  }

  function noneBackend() {
    return {
      kind: "none",
      async init() {
        els.warn.classList.add("show");
        setStatus("niet live");
        return false;
      },
      async load() {
        return state;
      },
      async placeBid() {
        throw new Error("De live database is nog niet gekoppeld. Even geduld.");
      },
      async removeBid() {
        throw new Error("De live database is nog niet gekoppeld.");
      },
    };
  }

  function jsonBackend() {
    const url = C.backend.jsonUrl;
    return {
      kind: "json",
      async init() {
        if (!url) {
          els.warn.classList.add("show");
          setStatus("geen database-URL");
          return false;
        }
        await this.load();
        backendOk = true;
        setStatus("live", true);
        return true;
      },
      async load() {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("Kon biedingen niet laden (" + r.status + ")");
        const data = await r.json();
        // jsonbin wraps as { record }
        state = normalize(data.record || data);
        return state;
      },
      async placeBid(itemId, bid) {
        const step = Number(C.minIncrement) || 1;
        const start = itemById[itemId].startBid;
        let lastErr = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          await this.load();
          const high = currentHigh(itemId).amount;
          const min = high > 0 ? high + step : start;
          if (bid.amount < min) {
            throw new Error("Er is al een hoger of gelijk bod. Minimum is nu " + euro(min) + ".");
          }
          const next = JSON.parse(JSON.stringify(state));
          const entry = next.items[itemId];
          const list = bidsOf(entry);
          list.unshift(bid);
          entry.bids = list;
          entry.amount = bid.amount;
          entry.name = bid.name;
          entry.seat = bid.seat || null;
          next.rev = (Number(next.rev) || 0) + 1;
          const r = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(next),
          });
          if (!r.ok) {
            lastErr = new Error("Opslaan mislukt (" + r.status + ")");
            continue;
          }
          await this.load();
          const stored = bidsOf(state.items[itemId]);
          if (stored.some((b) => b.id === bid.id)) return state;
          const nowHigh = currentHigh(itemId).amount;
          if (nowHigh >= bid.amount && !stored.some((b) => b.id === bid.id)) {
            // overwritten; retry if our amount is still valid
            lastErr = new Error("Iemand bood tegelijk. Opnieuw proberen…");
            continue;
          }
          return state;
        }
        throw lastErr || new Error("Kon het bod niet plaatsen, probeer opnieuw.");
      },
      async removeBid(itemId, bidId) {
        await this.load();
        const next = JSON.parse(JSON.stringify(state));
        const entry = next.items[itemId];
        const list = bidsOf(entry).filter((b) => b.id !== bidId);
        entry.bids = list;
        if (list.length) {
          entry.amount = list[0].amount;
          entry.name = list[0].name;
          entry.seat = list[0].seat || null;
        } else {
          entry.amount = 0;
          entry.name = null;
          entry.seat = null;
        }
        next.rev = (Number(next.rev) || 0) + 1;
        const r = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!r.ok) throw new Error("Verwijderen mislukt (" + r.status + ")");
        await this.load();
        return state;
      },
    };
  }

  function firebaseBackend() {
    const cfg = C.backend.firebase || {};
    return {
      kind: "firebase",
      db: null,
      async init() {
        if (!cfg.databaseURL || !cfg.apiKey) {
          els.warn.classList.add("show");
          setStatus("Firebase niet ingevuld");
          return false;
        }
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-database-compat.js");
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        this.db = firebase.database();
        const ref = this.db.ref("auction/items");
        ref.on(
          "value",
          (snap) => {
            const val = snap.val() || {};
            state = normalize({ items: val, rev: Date.now() });
            backendOk = true;
            setStatus("live", true);
            render();
          },
          (err) => {
            setStatus("fout: " + err.message);
          }
        );
        return true;
      },
      async load() {
        if (!this.db) return state;
        const snap = await this.db.ref("auction/items").get();
        state = normalize({ items: snap.val() || {} });
        return state;
      },
      async placeBid(itemId, bid) {
        const start = itemById[itemId].startBid;
        const step = Number(C.minIncrement) || 1;
        const itemRef = this.db.ref("auction/items/" + itemId);
        const result = await itemRef.transaction((current) => {
          const entry = current || { amount: 0, name: null, seat: null, bids: {} };
          const list = bidsOf(entry);
          const high = list.length ? list[0].amount : Number(entry.amount) || 0;
          const min = high > 0 ? high + step : start;
          if (bid.amount < min) return; // abort
          const bids = entry.bids && !Array.isArray(entry.bids) ? { ...entry.bids } : {};
          if (Array.isArray(entry.bids)) {
            for (const b of entry.bids) if (b && b.id) bids[b.id] = b;
          }
          bids[bid.id] = bid;
          return {
            amount: bid.amount,
            name: bid.name,
            seat: bid.seat || null,
            bids,
          };
        });
        if (!result.committed) {
          throw new Error("Er is al een hoger of gelijk bod. Vernieuw en bied hoger.");
        }
        return state;
      },
      async removeBid(itemId, bidId) {
        const itemRef = this.db.ref("auction/items/" + itemId);
        const result = await itemRef.transaction((current) => {
          if (!current) return current;
          const list = bidsOf(current).filter((b) => b.id !== bidId);
          const bids = {};
          for (const b of list) bids[b.id] = b;
          if (list.length) {
            return { amount: list[0].amount, name: list[0].name, seat: list[0].seat || null, bids };
          }
          return { amount: 0, name: null, seat: null, bids: {} };
        });
        if (!result.committed) throw new Error("Verwijderen mislukt.");
        return state;
      },
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Kon script niet laden: " + src));
      document.head.appendChild(s);
    });
  }

  /* -------------------- UI -------------------- */

  function tickClock() {
    const end = new Date(C.closeAt).getTime();
    const now = Date.now();
    let ms = end - now;
    const closed = ms <= 0;
    els.clock.classList.toggle("closed", closed);
    if (closed) {
      els.clock.innerHTML =
        '<div class="box"><div class="n">Einde</div><div class="l">veiling gesloten</div></div>';
      return closed;
    }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const part = (n, l) =>
      '<div class="box"><div class="n">' +
      String(n).padStart(2, "0") +
      '</div><div class="l">' +
      l +
      "</div></div>";
    els.clock.innerHTML = part(d, "dagen") + part(h, "uur") + part(m, "min") + part(sec, "sec");
    return false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function histHtml(it) {
    const hist = bidsOf(state.items[it.id] || {}).slice(0, 6);
    if (!hist.length) {
      return "<p class='hint'>Nog geen biedingen. Startbod is " + euro(it.startBid) + ".</p>";
    }
    return (
      "<ul class='hist'>" +
      hist
        .map((b) => {
          const extra = b.seat ? " · " + escapeHtml(b.seat) : "";
          return (
            "<li><span>" +
            escapeHtml(b.name) +
            extra +
            "</span><span>" +
            euro(b.amount) +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function whoHtml(it) {
    const high = currentHigh(it.id);
    if (high.name) {
      return (
        "<div class='who'>Hoogste bieder<b>" +
        escapeHtml(high.name) +
        "</b>" +
        (high.seat ? escapeHtml(high.seat) : "") +
        "</div>"
      );
    }
    return "<div class='who'>Nog geen bieder</div>";
  }

  function formHtml(it) {
    const min = minBid(it.id);
    if (isClosed()) return "<p class='hint'>De veiling is gesloten.</p>";
    return (
      "<form class='form' data-item='" +
      it.id +
      "'>" +
      "<div><label for='n-" +
      it.id +
      "'>Jouw naam</label>" +
      "<input id='n-" +
      it.id +
      "' name='name' required maxlength='40' autocomplete='name' placeholder='Naam voor de omroeper'></div>" +
      "<div><label for='a-" +
      it.id +
      "'>Jouw bod (hele euro's)</label>" +
      "<input id='a-" +
      it.id +
      "' name='amount' type='number' inputmode='numeric' step='1' min='" +
      min +
      "' value='" +
      min +
      "' required></div>" +
      "<div><label for='s-" +
      it.id +
      "'>Zitplaats / vak <span style='font-weight:400'>(optioneel)</span></label>" +
      "<input id='s-" +
      it.id +
      "' name='seat' maxlength='40' placeholder='bv. vak 12, rij 4'></div>" +
      "<p class='hint'>Bied in hele euro's. Elk bedrag van " +
      euro(min) +
      " of hoger is geldig. Je betaalt niets nu.</p>" +
      "<button class='bid' type='submit'>Plaats bod</button>" +
      "<p class='msg' aria-live='polite'></p>" +
      "</form>"
    );
  }

  function bidboxHtml(it) {
    const high = currentHigh(it.id);
    return (
      '<div class="bidbox"><div><div class="lbl">' +
      (high.amount ? "Huidig hoogste bod" : "Startbod") +
      '</div><div class="amt">' +
      euro(high.amount || it.startBid) +
      "</div></div>" +
      whoHtml(it) +
      "</div>"
    );
  }

  function lotInner(it) {
    return bidboxHtml(it) + histHtml(it) + formHtml(it);
  }

  function renderLot(it) {
    return (
      '<div class="lot" id="item-' +
      it.id +
      '"><h3>' +
      escapeHtml(it.title) +
      "</h3>" +
      lotInner(it) +
      "</div>"
    );
  }

  function renderItem(it) {
    return (
      '<article class="card" id="item-' +
      it.id +
      '">' +
      '<div class="photo"><img src="' +
      it.image +
      '" alt="' +
      escapeHtml(it.title) +
      '"></div>' +
      '<div class="body">' +
      "<h2>" +
      escapeHtml(it.title) +
      "</h2>" +
      '<p class="blurb">' +
      escapeHtml(it.blurb) +
      "</p>" +
      lotInner(it) +
      "</div></article>"
    );
  }

  function renderGroup(items) {
    const first = items[0];
    const lots = items.map(renderLot).join("");
    return (
      '<article class="card group" id="group-' +
      escapeHtml(first.group) +
      '">' +
      '<div class="photo"><img src="' +
      first.image +
      '" alt="Gedragen jersey"></div>' +
      '<div class="body">' +
      "<h2>Gedragen jersey</h2>" +
      '<p class="blurb">3 identieke gedragen wedstrijdshirts. Je biedt op één lot.</p>' +
      lots +
      "</div></article>"
    );
  }

  function renderGrid() {
    const used = {};
    const parts = [];
    for (const it of C.items) {
      if (used[it.id]) continue;
      if (it.group) {
        const members = C.items.filter((x) => x.group === it.group);
        members.forEach((m) => (used[m.id] = true));
        parts.push(renderGroup(members));
      } else {
        used[it.id] = true;
        parts.push(renderItem(it));
      }
    }
    return parts.join("");
  }

  function renderAdmin() {
    if (!isAdmin) return;
    const rows = C.items
      .map((it) => {
        const high = currentHigh(it.id);
        const list = bidsOf(state.items[it.id] || {});
        const hist = list
          .map((b) => {
            const extra = b.seat ? " (" + escapeHtml(b.seat) + ")" : "";
            return (
              "<div>" +
              euro(b.amount) +
              " — " +
              escapeHtml(b.name) +
              extra +
              " <button class='del' data-item='" +
              it.id +
              "' data-bid='" +
              escapeHtml(b.id) +
              "'>Verwijder</button></div>"
            );
          })
          .join("") || "—";
        return (
          "<tr><td><strong>" +
          escapeHtml(it.title) +
          "</strong></td><td>" +
          (high.amount ? euro(high.amount) : "geen bod") +
          "</td><td>" +
          (high.name ? escapeHtml(high.name) : "—") +
          "</td><td>" +
          (high.seat ? escapeHtml(high.seat) : "—") +
          "</td><td>" +
          hist +
          "</td></tr>"
        );
      })
      .join("");
    els.admin.innerHTML =
      "<table><thead><tr><th>Item</th><th>Hoogste bod</th><th>Naam</th><th>Zitplaats</th><th>Alle biedingen</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  function render() {
    const wasFocus = document.activeElement;
    const focusId = wasFocus && wasFocus.id;
    const focusVal = wasFocus && "value" in wasFocus ? wasFocus.value : null;
    els.grid.innerHTML = renderGrid();
    renderAdmin();
    if (focusId) {
      const again = document.getElementById(focusId);
      if (again) {
        again.focus();
        if (focusVal !== null && again.type !== "number") again.value = focusVal;
      }
    }
  }

  function parseAmount(raw) {
    const cleaned = String(raw).trim().replace(",", ".");
    if (!cleaned) return NaN;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return NaN;
    return n;
  }

  async function onSubmit(e) {
    const form = e.target.closest("form[data-item]");
    if (!form) return;
    e.preventDefault();
    const msg = form.querySelector(".msg");
    const btn = form.querySelector("button.bid");
    const itemId = form.getAttribute("data-item");
    const name = form.name.value.trim();
    const seat = form.seat.value.trim();
    const amount = parseAmount(form.amount.value);
    msg.className = "msg";
    msg.textContent = "";

    if (isClosed()) {
      msg.classList.add("err");
      msg.textContent = "De veiling is gesloten.";
      return;
    }
    if (name.length < 2) {
      msg.classList.add("err");
      msg.textContent = "Vul je naam in (minstens 2 tekens).";
      return;
    }
    if (!Number.isInteger(amount)) {
      msg.classList.add("err");
      msg.textContent = "Bied een bedrag in hele euro's.";
      return;
    }
    const min = minBid(itemId);
    if (amount < min) {
      msg.classList.add("err");
      msg.textContent = "Het minimumbod is nu " + euro(min) + ".";
      return;
    }

    const bid = {
      id: newId(),
      name,
      amount,
      seat: seat || "",
      at: new Date().toISOString(),
    };
    btn.disabled = true;
    try {
      await backend.placeBid(itemId, bid);
      await backend.load();
      render();
      const again = document.querySelector("#item-" + itemId + " .msg");
      if (again) {
        again.className = "msg ok";
        again.textContent =
          "Je bod is geplaatst. Als jij de hoogste bieder blijft, wordt je naam tijdens de wedstrijd omgeroepen.";
      }
    } catch (err) {
      msg.classList.add("err");
      msg.textContent = err.message || "Kon het bod niet plaatsen.";
      try {
        await backend.load();
        render();
      } catch (_) {}
    } finally {
      const b = document.querySelector("#item-" + itemId + " button.bid");
      if (b) b.disabled = isClosed();
    }
  }

  async function onAdminClick(e) {
    const btn = e.target.closest("button.del");
    if (!btn) return;
    if (!isAdmin) return;
    const itemId = btn.getAttribute("data-item");
    const bidId = btn.getAttribute("data-bid");
    if (!confirm("Dit bod verwijderen?")) return;
    try {
      await backend.removeBid(itemId, bidId);
      await backend.load();
      render();
    } catch (err) {
      alert(err.message || "Verwijderen mislukt.");
    }
  }

  async function refresh() {
    if (backend.kind === "firebase") return; // live listener
    if (backend.kind === "none") return;
    try {
      await backend.load();
      render();
      setStatus("live", true);
    } catch (err) {
      setStatus("geen verbinding");
    }
  }

  async function init() {
    tickClock();
    render();
    try {
      const ok = await backend.init();
      backendOk = !!ok;
      render();
    } catch (err) {
      els.warn.classList.add("show");
      els.warn.textContent = "Kon de biedingen niet laden. Probeer de pagina te vernieuwen.";
      setStatus("fout");
    }
    setInterval(() => {
      const closedNow = tickClock();
      if (closedNow) render();
    }, 1000);
    if (backend.kind === "json") setInterval(refresh, C.refreshMs || 3500);
  }

  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onAdminClick);
  init();
})();
