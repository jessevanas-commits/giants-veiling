(function () {
  "use strict";

  const C = window.CONFIG;
  if (!C) {
    document.getElementById("status").textContent = "Config ontbreekt";
    return;
  }

  const PROFILE_KEY = "wga-veiling-profile";
  const ADMIN_EMAIL = (C.adminEmail || "jesse.vanas@windrose.ai").toLowerCase();

  const params = new URLSearchParams(location.search);
  const isAdmin = params.get("admin") === C.adminToken;
  if (isAdmin) document.body.classList.add("is-admin");

  const els = {
    grid: document.getElementById("grid"),
    clock: document.getElementById("clock"),
    status: document.getElementById("status"),
    warn: document.getElementById("backend-warn"),
    admin: document.getElementById("admin-table"),
    account: document.getElementById("account"),
    adminAuth: document.getElementById("admin-auth"),
  };

  const itemById = Object.fromEntries(C.items.map((it) => [it.id, it]));

  function emptyState() {
    const items = {};
    for (const it of C.items) {
      items[it.id] = { amount: 0, publicName: null, bidderId: null, bids: [] };
    }
    return { rev: 0, items };
  }

  let state = emptyState();
  let backendOk = false;
  let profile = loadProfile();
  let editingProfile = !profile;
  let adminUser = null;
  let contacts = {};
  let contactsLoaded = false;

  function euro(n) {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function toPublicName(full) {
    const parts = String(full || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return parts[0] + " " + parts[1].charAt(0).toUpperCase() + ".";
  }

  function displayNameOf(bidOrHigh) {
    if (!bidOrHigh) return "";
    return bidOrHigh.publicName || bidOrHigh.name || "";
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
    if (bids.length) {
      return {
        amount: bids[0].amount,
        publicName: displayNameOf(bids[0]),
        bidderId: bids[0].bidderId || null,
        at: bids[0].at || "",
        bid: bids[0],
      };
    }
    if (entry.amount > 0) {
      return {
        amount: entry.amount,
        publicName: displayNameOf(entry),
        bidderId: entry.bidderId || null,
        at: "",
        bid: null,
      };
    }
    return { amount: 0, publicName: null, bidderId: null, at: "", bid: null };
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
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function setStatus(text, live) {
    els.status.textContent = text;
    els.status.classList.toggle("live", !!live);
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (p && p.id && p.name && p.email && p.phone && p.consent) return p;
    } catch (e) {}
    return null;
  }

  function storeProfile(p) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    profile = p;
  }

  function clearProfile() {
    localStorage.removeItem(PROFILE_KEY);
    profile = null;
    editingProfile = true;
  }

  function validEmail(s) {
    return /^\S+@\S+\.\S+$/.test(s);
  }

  function validPhone(s) {
    const digits = String(s).replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 20;
  }

  /* -------------------- backends -------------------- */

  function publicBidRecord(b) {
    return {
      id: b.id,
      bidderId: b.bidderId || null,
      publicName: displayNameOf(b),
      amount: Number(b.amount) || 0,
      at: b.at || "",
    };
  }

  function normalize(data) {
    const base = emptyState();
    if (!data || typeof data !== "object") return base;
    base.rev = Number(data.rev) || 0;
    const src = data.items || data;
    for (const it of C.items) {
      const e = src[it.id] || {};
      const bids = bidsOf(e).map(publicBidRecord);
      const top = bids[0];
      base.items[it.id] = {
        amount: Number(e.amount) || (top ? top.amount : 0),
        publicName: displayNameOf(e) || (top ? top.publicName : null),
        bidderId: e.bidderId || (top ? top.bidderId : null),
        bids,
      };
    }
    return base;
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
      async saveContact() {},
      async loadContacts() {
        return {};
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
        state = normalize(data.record || data);
        return state;
      },
      async saveContact() {
        // Contactgegevens horen niet in een publieke JSON-store.
      },
      async loadContacts() {
        return {};
      },
      async placeBid(itemId, bid) {
        const step = Number(C.minIncrement) || 1;
        const start = itemById[itemId].startBid;
        const safe = publicBidRecord(bid);
        let lastErr = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          await this.load();
          const high = currentHigh(itemId).amount;
          const min = high > 0 ? high + step : start;
          if (safe.amount < min) {
            throw new Error("Er is al een hoger of gelijk bod. Minimum is nu " + euro(min) + ".");
          }
          const next = JSON.parse(JSON.stringify(state));
          const entry = next.items[itemId];
          const list = bidsOf(entry);
          list.unshift(safe);
          entry.bids = list;
          entry.amount = safe.amount;
          entry.publicName = safe.publicName;
          entry.bidderId = safe.bidderId;
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
          if (stored.some((b) => b.id === safe.id)) return state;
          lastErr = new Error("Iemand bood tegelijk. Opnieuw proberen…");
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
          entry.publicName = displayNameOf(list[0]);
          entry.bidderId = list[0].bidderId || null;
        } else {
          entry.amount = 0;
          entry.publicName = null;
          entry.bidderId = null;
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
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        this.db = firebase.database();
        firebase.auth().onAuthStateChanged(function (user) {
          adminUser = user;
          contactsLoaded = false;
          contacts = {};
          render();
          if (isAdmin && user && (user.email || "").toLowerCase() === ADMIN_EMAIL) {
            backend.loadContacts().then(function () {
              render();
            });
          }
        });
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
      async saveContact(p) {
        if (!this.db) throw new Error("Database niet klaar.");
        await this.db.ref("contacts/" + p.id).set({
          name: p.name,
          email: p.email,
          phone: p.phone,
          consent: true,
          updatedAt: new Date().toISOString(),
        });
      },
      async loadContacts() {
        if (!this.db) return {};
        const snap = await this.db.ref("contacts").get();
        contacts = snap.val() || {};
        contactsLoaded = true;
        return contacts;
      },
      async placeBid(itemId, bid) {
        const start = itemById[itemId].startBid;
        const step = Number(C.minIncrement) || 1;
        const safe = publicBidRecord(bid);
        const itemRef = this.db.ref("auction/items/" + itemId);
        const result = await itemRef.transaction((current) => {
          const entry = current || { amount: 0, publicName: null, bidderId: null, bids: {} };
          const list = bidsOf(entry);
          const high = list.length ? list[0].amount : Number(entry.amount) || 0;
          const min = high > 0 ? high + step : start;
          if (safe.amount < min) return;
          const bidsObj = entry.bids && !Array.isArray(entry.bids) ? { ...entry.bids } : {};
          if (Array.isArray(entry.bids)) {
            for (const b of entry.bids) if (b && b.id) bidsObj[b.id] = publicBidRecord(b);
          }
          bidsObj[safe.id] = safe;
          return {
            amount: safe.amount,
            publicName: safe.publicName,
            bidderId: safe.bidderId,
            bids: bidsObj,
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
          const bidsObj = {};
          for (const b of list) bidsObj[b.id] = publicBidRecord(b);
          if (list.length) {
            return {
              amount: list[0].amount,
              publicName: displayNameOf(list[0]),
              bidderId: list[0].bidderId || null,
              bids: bidsObj,
            };
          }
          return { amount: 0, publicName: null, bidderId: null, bids: {} };
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
        .map(function (b) {
          return (
            "<li><span>" +
            escapeHtml(displayNameOf(b) || "Bieder") +
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
    if (high.publicName) {
      return (
        "<div class='who'>Hoogste bieder<b>" + escapeHtml(high.publicName) + "</b></div>"
      );
    }
    return "<div class='who'>Nog geen bieder</div>";
  }

  function formHtml(it) {
    const min = minBid(it.id);
    if (isClosed()) return "<p class='hint'>De veiling is gesloten.</p>";
    if (!profile) {
      return "<p class='hint'>Registreer eerst je gegevens hierboven. Daarna bied je alleen nog met een bedrag.</p>";
    }
    return (
      "<form class='form' data-item='" +
      it.id +
      "'>" +
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
      "<p class='hint'>Bied in hele euro's. Elk bedrag van " +
      euro(min) +
      " of hoger is geldig. Je biedt als " +
      escapeHtml(toPublicName(profile.name)) +
      ". Je betaalt niets nu.</p>" +
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
      items.map(renderLot).join("") +
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

  function renderAccount() {
    if (!els.account) return;
    if (profile && !editingProfile) {
      els.account.innerHTML =
        '<div class="account-bar"><p>Je biedt als <b>' +
        escapeHtml(toPublicName(profile.name)) +
        "</b>. Andere bezoekers zien alleen die verkorte naam, niet je e-mail of telefoon.</p>" +
        '<div><button type="button" class="linkbtn" id="edit-profile">Gegevens wijzigen</button> · ' +
        '<button type="button" class="linkbtn" id="logout-profile">Uitloggen</button></div></div>';
      return;
    }
    const p = profile || { name: "", email: "", phone: "" };
    els.account.innerHTML =
      "<h2>Eerst even registreren</h2>" +
      "<p class='hint'>Naam, e-mail en telefoon zijn verplicht, zodat we je na afloop kunnen bereiken. We onthouden dit op dit toestel: daarna vul je alleen nog je bod in.</p>" +
      '<form id="profile-form">' +
      '<div class="row"><div><label for="p-name">Naam</label>' +
      '<input id="p-name" name="name" required maxlength="80" autocomplete="name" value="' +
      escapeHtml(p.name || "") +
      '"></div></div>' +
      '<div class="row two"><div><label for="p-email">E-mailadres</label>' +
      '<input id="p-email" name="email" type="email" required maxlength="120" autocomplete="email" value="' +
      escapeHtml(p.email || "") +
      '"></div><div><label for="p-phone">Telefoonnummer</label>' +
      '<input id="p-phone" name="phone" type="tel" required maxlength="30" autocomplete="tel" value="' +
      escapeHtml(p.phone || "") +
      '"></div></div>' +
      '<label class="consent"><input type="checkbox" name="consent" required' +
      (p.consent ? " checked" : "") +
      "> Ik ga ermee akkoord dat het Show Team mij contacteert over de veiling; mijn gegevens worden alleen hiervoor gebruikt.</label>" +
      '<button class="save" type="submit">Gegevens opslaan</button>' +
      '<p class="msg" id="profile-msg" aria-live="polite"></p></form>';
  }

  function canSeeContacts() {
    return !!(adminUser && (adminUser.email || "").toLowerCase() === ADMIN_EMAIL);
  }

  function renderAdminAuth() {
    if (!isAdmin || !els.adminAuth) return;
    if (canSeeContacts()) {
      els.adminAuth.innerHTML =
        "<p>Aangemeld als <b>" +
        escapeHtml(adminUser.email) +
        "</b>. Contactgegevens zijn zichtbaar.</p>" +
        '<button type="button" id="admin-logout">Uitloggen</button>';
      return;
    }
    if (adminUser) {
      els.adminAuth.innerHTML =
        "<p>Je bent aangemeld als " +
        escapeHtml(adminUser.email) +
        ", maar dit account mag geen contactgegevens lezen. Gebruik <b>" +
        escapeHtml(ADMIN_EMAIL) +
        "</b>.</p>" +
        '<button type="button" id="admin-google">Opnieuw inloggen met Google</button>';
      return;
    }
    els.adminAuth.innerHTML =
      "<p>Biedingen zie je hieronder. E-mail en telefoon worden pas getoond na aanmelden met Google als <b>" +
      escapeHtml(ADMIN_EMAIL) +
      "</b>.</p>" +
      '<button type="button" id="admin-google">Log in met Google</button>';
  }

  function renderAdmin() {
    if (!isAdmin) return;
    renderAdminAuth();
    const see = canSeeContacts();
    const rows = C.items
      .map((it) => {
        const high = currentHigh(it.id);
        const list = bidsOf(state.items[it.id] || {});
        const hist = list
          .map((b) => {
            const c = (b.bidderId && contacts[b.bidderId]) || null;
            const extra = see && c
              ? " — " + escapeHtml(c.name) + ", " + escapeHtml(c.email) + ", " + escapeHtml(c.phone)
              : "";
            return (
              "<div>" +
              euro(b.amount) +
              " — " +
              escapeHtml(displayNameOf(b) || "Bieder") +
              extra +
              " <button class='del' data-item='" +
              it.id +
              "' data-bid='" +
              escapeHtml(b.id) +
              "'>Verwijder</button></div>"
            );
          })
          .join("") || "—";
        const c = high.bidderId && contacts[high.bidderId];
        const full = see && c ? escapeHtml(c.name) : "—";
        const em = see && c ? escapeHtml(c.email) : see ? "—" : "verborgen";
        const ph = see && c ? escapeHtml(c.phone) : see ? "—" : "verborgen";
        return (
          "<tr><td><strong>" +
          escapeHtml(it.title) +
          "</strong></td><td>" +
          (high.amount ? euro(high.amount) : "geen bod") +
          "</td><td>" +
          (high.publicName ? escapeHtml(high.publicName) : "—") +
          "</td><td>" +
          full +
          "</td><td>" +
          em +
          "</td><td>" +
          ph +
          "</td><td>" +
          hist +
          "</td></tr>"
        );
      })
      .join("");
    const csvBtn = see
      ? '<button type="button" class="csv" id="export-csv">Exporteer CSV</button>'
      : "";
    els.admin.innerHTML =
      csvBtn +
      "<table><thead><tr><th>Item</th><th>Hoogste bod</th><th>Publieke naam</th><th>Volledige naam</th><th>E-mail</th><th>Telefoon</th><th>Alle biedingen</th></tr></thead><tbody>" +
      rows +
      "</tbody></table>";
  }

  function exportCsv() {
    const lines = [
      ["Lot", "Bedrag", "Publieke naam", "Volledige naam", "E-mail", "Telefoon", "Tijdstip"].join(";"),
    ];
    for (const it of C.items) {
      const list = bidsOf(state.items[it.id] || {});
      if (!list.length) {
        lines.push([it.title, "", "", "", "", "", ""].join(";"));
        continue;
      }
      for (const b of list) {
        const c = (b.bidderId && contacts[b.bidderId]) || {};
        lines.push(
          [
            it.title,
            String(b.amount),
            displayNameOf(b) || "",
            c.name || "",
            c.email || "",
            c.phone || "",
            b.at || "",
          ]
            .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
            .join(";")
        );
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "veiling-biedingen.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function render() {
    const wasFocus = document.activeElement;
    const focusId = wasFocus && wasFocus.id;
    const focusVal = wasFocus && "value" in wasFocus ? wasFocus.value : null;
    const focusChecked = wasFocus && wasFocus.type === "checkbox" ? wasFocus.checked : null;
    renderAccount();
    els.grid.innerHTML = renderGrid();
    renderAdmin();
    if (focusId) {
      const again = document.getElementById(focusId);
      if (again) {
        again.focus();
        if (focusChecked !== null) again.checked = focusChecked;
        else if (focusVal !== null && again.type !== "number") again.value = focusVal;
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

  async function onProfileSubmit(e) {
    const form = e.target.closest("#profile-form");
    if (!form) return;
    e.preventDefault();
    const msg = document.getElementById("profile-msg");
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const consent = form.consent.checked;
    if (msg) {
      msg.className = "msg";
      msg.textContent = "";
    }
    if (name.length < 2) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Vul je naam in (minstens 2 tekens).";
      }
      return;
    }
    if (!validEmail(email)) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Vul een geldig e-mailadres in.";
      }
      return;
    }
    if (!validPhone(phone)) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Vul een geldig telefoonnummer in.";
      }
      return;
    }
    if (!consent) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Om te bieden moet je akkoord gaan met de verwerking van je gegevens.";
      }
      return;
    }
    const p = {
      id: (profile && profile.id) || newId(),
      name,
      email,
      phone,
      consent: true,
    };
    try {
      await backend.saveContact(p);
      storeProfile(p);
      editingProfile = false;
      render();
    } catch (err) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = err.message || "Kon je gegevens niet opslaan.";
      }
    }
  }

  async function onSubmit(e) {
    const form = e.target.closest("form[data-item]");
    if (!form) return;
    e.preventDefault();
    const msg = form.querySelector(".msg");
    const btn = form.querySelector("button.bid");
    const itemId = form.getAttribute("data-item");
    if (msg) {
      msg.className = "msg";
      msg.textContent = "";
    }
    if (isClosed()) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "De veiling is gesloten.";
      }
      return;
    }
    if (!profile) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Registreer eerst je gegevens.";
      }
      return;
    }
    const amount = parseAmount(form.amount.value);
    if (!Number.isInteger(amount)) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Bied een bedrag in hele euro's.";
      }
      return;
    }
    const min = minBid(itemId);
    if (amount < min) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = "Het minimumbod is nu " + euro(min) + ".";
      }
      return;
    }
    const bid = {
      id: newId(),
      bidderId: profile.id,
      publicName: toPublicName(profile.name),
      amount,
      at: new Date().toISOString(),
    };
    if (btn) btn.disabled = true;
    try {
      await backend.saveContact(profile);
      await backend.placeBid(itemId, bid);
      await backend.load();
      render();
      const again = document.querySelector("#item-" + itemId + " .msg");
      if (again) {
        again.className = "msg ok";
        again.textContent =
          "Je bod is geplaatst. Als jij de hoogste bieder blijft, word je na afloop per e-mail gecontacteerd.";
      }
    } catch (err) {
      if (msg) {
        msg.className = "msg err";
        msg.textContent = err.message || "Kon het bod niet plaatsen.";
      }
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
    const csv = e.target.closest("#export-csv");
    if (csv) {
      exportCsv();
      return;
    }
    const gbtn = e.target.closest("#admin-google");
    if (gbtn) {
      try {
        if (typeof firebase === "undefined" || !firebase.auth) {
          alert("Firebase is nog niet gekoppeld. Eerst de database instellen (zie SETUP.md).");
          return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account", login_hint: ADMIN_EMAIL });
        await firebase.auth().signInWithPopup(provider);
      } catch (err) {
        alert(err.message || "Inloggen mislukt.");
      }
      return;
    }
    const lbtn = e.target.closest("#admin-logout");
    if (lbtn) {
      try {
        await firebase.auth().signOut();
      } catch (_) {}
      return;
    }
    const btn = e.target.closest("button.del");
    if (!btn || !isAdmin) return;
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
    if (backend.kind === "firebase") return;
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
    setInterval(function () {
      const closedNow = tickClock();
      if (closedNow) render();
    }, 1000);
    if (backend.kind === "json") setInterval(refresh, C.refreshMs || 3500);
  }

  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "profile-form") onProfileSubmit(e);
    else onSubmit(e);
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest("#edit-profile")) {
      editingProfile = true;
      render();
      return;
    }
    if (e.target.closest("#logout-profile")) {
      clearProfile();
      render();
      return;
    }
    onAdminClick(e);
  });
  init();
})();
