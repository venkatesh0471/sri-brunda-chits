// shows any JavaScript error on the page itself (so it can be read without opening the console)
window.addEventListener("error", function (e) {
  var b = document.getElementById("errbar");
  if (!b) {
    b = document.createElement("div"); b.id = "errbar";
    b.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b3261e;color:#fff;padding:10px 14px;font:13px/1.4 monospace;white-space:pre-wrap";
    document.body.appendChild(b);
  }
  b.textContent = "JavaScript error: " + e.message + "  [" + String(e.filename || "").split("/").pop() + ":" + e.lineno + "]";
});
(function () {
  var KEY = "sriBrundaCustomers";
  var $ = function (id) { return document.getElementById(id); };
  $("today").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // ---------- Django API + JWT login ----------
  var TOK = { a: "", r: "" };
  try { TOK.a = sessionStorage.getItem("sbc_a") || ""; TOK.r = sessionStorage.getItem("sbc_r") || ""; } catch (e) {}
  function setTok(a, r) {
    TOK.a = a || ""; TOK.r = r || "";
    try { sessionStorage.setItem("sbc_a", TOK.a); sessionStorage.setItem("sbc_r", TOK.r); } catch (e) {}
  }
  function raw(method, url, body, auth) {
    var h = {};
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (auth && TOK.a) h["Authorization"] = "Bearer " + TOK.a;
    return fetch(url, { method: method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; }); });
  }
  function refreshTok() {
    if (!TOK.r) return Promise.reject(new Error("no refresh token"));
    return raw("POST", "/api/token/refresh/", { refresh: TOK.r }, false).then(function (x) {
      if (!x.r.ok) throw new Error("refresh failed");
      setTok(x.j.access, x.j.refresh || TOK.r);
    });
  }
  function signedOut() { setTok("", ""); showLogin(); return new Error("Please sign in"); }
  // every call goes through here: adds the token, renews it once if it expired, shows login if that fails
  function api(method, url, body) {
    function go() { return raw(method, url, body, true); }
    return go().then(function (x) {
      if (x.r.status !== 401) return x;
      return refreshTok().then(go, function () { throw signedOut(); });
    }).then(function (x) {
      if (x.r.status === 401) throw signedOut();
      if (!x.r.ok) throw new Error(x.j.error || ("Server error " + x.r.status));
      return x.j;
    });
  }
  function showLogin() {
    if (!$("logdlg").open) { $("lgerr").textContent = ""; $("lgpass").value = ""; $("logdlg").showModal(); }
  }
  $("logdlg").addEventListener("cancel", function (e) { e.preventDefault(); });   // Esc must not skip the login
  function doLogin() {
    $("lgerr").textContent = "";
    raw("POST", "/api/token/", { username: $("lguser").value.trim(), password: $("lgpass").value }, false)
      .then(function (x) {
        if (!x.r.ok) throw new Error(x.r.status === 429 ? "Too many attempts. Wait a minute and try again." : "Wrong username or password");
        setTok(x.j.access, x.j.refresh);
        $("logdlg").close(); $("lgpass").value = ""; init();
      })
      .catch(function (e) { $("lgerr").textContent = e.message || "Could not reach the server"; });
  }
  $("lgbtn").onclick = doLogin;
  $("lgpass").onkeydown = function (e) { if (e.key === "Enter") doLogin(); };
  $("logout").onclick = function () { setTok("", ""); data = []; loans = []; render(); renderLoans(); showLogin(); };
  // receipt number shown on WhatsApp receipts and the chit book; the server stores the same text
  function rcpt(c, n) { var id = String(c.id); while (id.length < 4) id = "0" + id; return "SBC-" + id + "-" + ("0" + n).slice(-2); }
  var need = ["add", "bak", "bat", "bcx", "bdlg", "bk", "bpaper", "bpay", "bpr", "bs", "bt", "cal", "cx", "dlg", "dt", "endd", "exp", "f", "file", "g", "gadd", "gback", "gbtn", "gcards", "gcx", "gdlg", "gpr", "grp", "gscx", "gsdlg", "gss", "gst", "gtab", "gy", "join", "lift", "mon", "paid", "pbk", "pcx", "pdlg", "ps", "pt", "q", "res", "rows", "sA", "sC", "sD", "sV", "sv", "tot", "val"];
  var miss = need.filter(function (id) { return !document.getElementById(id); });
  if (miss.length) {
    document.body.insertAdjacentHTML("afterbegin", "<div style='background:#b3261e;color:#fff;padding:12px;font:14px sans-serif'>index.html is out of date (missing: " + miss.join(", ") + "). Please replace index.html, style.css and script.js with the latest versions.</div>");
    return;
  }
  var data = [];
  var editId = null;
  var DEFAULT_MONTHS = 20, MONTH_OPTIONS = [20, 24, 30];
  var DURATION = DEFAULT_MONTHS;
  // each Sri Brunda Group runs for 20, 24 or 30 months (chosen on the group sheet)
  var GS = {};   // loaded from the server
  function GM(b) { return (b && GS[b] && +GS[b].months) || DEFAULT_MONTHS; }
  function D(c) { return GM(c && c.batch); }
  var GROUPS = { "1 Lakh": 100000, "2 Lakhs": 200000, "3 Lakhs": 300000,
                 "4 Lakhs": 400000, "5 Lakhs": 500000, "10 Lakhs": 1000000, "15 Lakhs": 1500000,
                 "20 Lakhs": 2000000, "25 Lakhs": 2500000 };

  // ---------- storage ----------
  function init() {
    if (!TOK.a && !TOK.r) { showLogin(); return; }
    api("GET", "/api/app/bootstrap/").then(function (r) {
      data = r.customers || []; loans = r.loans || []; GS = r.groupSettings || {};
      migrate(); render(); renderLoans();
      offerImport();
    }).catch(function (e) { if (e.message !== "Please sign in") alert("Could not load data: " + e.message); });
  }
  // re-read everything from the server (used after a failed save so the screen never shows unsaved data)
  function reload() {
    return api("GET", "/api/app/bootstrap/").then(function (r) {
      data = r.customers || []; loans = r.loans || []; GS = r.groupSettings || {};
      migrate(); render(); renderLoans();
      if ($("pdlg").open && cur()) drawCal();
      if ($("gsdlg").open) drawSheet();
    });
  }
  function warnText(r) { return r && r.warnings && r.warnings.length ? "\n\nNotes:\n- " + r.warnings.slice(0, 8).join("\n- ") : ""; }
  // first run on the server: offer to move data that was saved in this browser by the old version
  function offerImport() {
    if (data.length || loans.length) return;
    var cu = [], hl = [], gs = {};
    try { cu = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}
    try { hl = JSON.parse(localStorage.getItem("sriBrundaHandLoans")) || []; } catch (e) {}
    try { gs = JSON.parse(localStorage.getItem("sriBrundaGroupSettings")) || {}; } catch (e) {}
    if (!cu.length && !hl.length) return;
    if (!confirm("Found " + cu.length + " customers and " + hl.length + " hand loans saved in this browser.\nUpload them to the server now?")) return;
    api("POST", "/api/app/restore/", { customers: cu, handloans: hl, groupSettings: gs })
      .then(function (r) { return reload().then(function () { alert("Imported " + r.customers + " customers and " + r.loans + " hand loans. The old browser copy is still there as a backup." + warnText(r)); }); })
      .catch(function (e) { alert("Import failed: " + e.message); });
  }
  // older records only had a "months paid" number; turn it into a payment calendar
  function migrate() {
    data.forEach(function (c) {
      if (!c.pay) {
        c.pay = {};
        for (var i = 1; i <= Math.min(+c.paid || 0, D(c)); i++) c.pay[i] = { d: "", a: +c.monthly || 0 };
      }
      c.paid = paidCount(c);
    });
  }
  function paidCount(c) { return Object.keys(c.pay || {}).filter(function (k) { return +k <= D(c); }).length; }
  // save one payment tick to the server; if it fails, reload the true state
  function syncPay(c, n, p) {
    var u = "/api/app/customers/" + c.id + "/payments/" + n + "/";
    var req = p ? api("PUT", u, p) : api("DELETE", u);
    req.catch(function (e) {
      if (e.message !== "Please sign in") alert("Could not save the payment: " + e.message);
      reload().catch(function () {});
    });
  }

  // ---------- helpers ----------
  var inr = function (n) { return "₹" + (Number(n) || 0).toLocaleString("en-IN"); };
  var esc = function (s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  };
  // installment for month n: from the lifted month onwards, add 1% of the total chit value
  function amtFor(c, n) {
    var m = +c.monthly || 0;
    return (+c.lifted && n >= +c.lifted) ? Math.round(m + (+c.value || 0) * 0.01) : m;
  }
  var due = function (c) {
    var t = 0;
    for (var n = 1; n <= D(c); n++) if (!(c.pay && c.pay[n])) t += amtFor(c, n);
    return t;
  };
  function iso(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function fmt(d) {
    return ("0" + d.getDate()).slice(-2) + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + d.getFullYear();
  }
  // join date + 20 months (handles short months, e.g. 31 Aug -> 30 Apr)
  function endDateOf(c) {
    if (!c.joined) return null;
    var p = c.joined.split("-");
    var first = new Date(+p[0], +p[1] - 1 + D(c), 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(+p[2], last));
  }
  var endStr = function (c) { var e = endDateOf(c); return e ? fmt(e) : "-"; };
  // chit closes automatically after 20 months, or once all 20 months are paid
  function effStatus(c) {
    var e = endDateOf(c);
    if ((e && new Date() >= e) || paidCount(c) >= D(c)) return "Completed";
    return c.status;
  }
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- render ----------
  function render() {
    var q = $("q").value.toLowerCase(), f = $("f").value, g = $("g").value;
    var list = data
      .filter(function (c) {
        return (!f || effStatus(c) === f) && (!g || c.batch === g) &&
               (!q || [c.name, c.phone, c.group, c.batch].join(" ").toLowerCase().indexOf(q) > -1);
      })
      .sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });

    $("sC").textContent = data.length;
    $("sA").textContent = data.filter(function (c) { return effStatus(c) === "Active"; }).length;
    $("sV").textContent = inr(data.reduce(function (a, c) { return a + (+c.value || 0); }, 0));
    $("sD").textContent = inr(data.reduce(function (a, c) { return a + due(c); }, 0));

    $("rows").innerHTML = list.length ? list.map(function (c, i) {
      var d = due(c), od = overdueMonths(c).length;
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(c.name) + "</b></td><td>" + esc(c.phone) + "</td><td>" +
        esc((c.batch || "-").replace("Sri Brunda ", "")) + "</td><td>" + inr(c.value) + "</td><td>" + inr(c.monthly) +
        "</td><td>" + paidCount(c) + "/" + D(c) + "</td><td>" + endStr(c) +
        "</td><td class='" + (d ? "due" : "") + "'>" + inr(d) +
        "</td><td><span class='pill " + esc(effStatus(c)) + "'>" + esc(effStatus(c)) + "</span></td>" +
        "<td><button class='sm gold' data-p='" + esc(c.id) + "'>Payments</button> <button class='sm ghost' data-b='" + esc(c.id) + "'>📖 Chit Book</button> <button class='sm " + (od ? "warn" : "ghost") + "' data-rr='" + esc(c.id) + "' title='Send payment reminder on WhatsApp'>🔔 Remind" + (od ? " (" + od + ")" : "") + "</button> <button class='sm ghost' data-e='" + esc(c.id) + "'>Edit</button> " +
        "<button class='sm ghost' data-d='" + esc(c.id) + "'>Delete</button></td></tr>";
    }).join("") : "<tr><td colspan='11' class='empty'>No customers yet. Click “Add customer”.</td></tr>";
  }

  // ---------- add / edit ----------
  var F = { name: "name", phone: "phone", idno: "idno", addr: "address", grp: "group", bat: "batch", lift: "lifted",
            join: "joined", val: "value", mon: "monthly", tot: "total", paid: "paid",
            st: "status", note: "notes" };

  function openForm(c) {
    c = c || { status: "Active", paid: 0, joined: iso(new Date()) };
    editId = c.id || null;
    $("dt").textContent = editId ? "Edit customer" : "Add customer";
    // keep older records with a custom group name selectable
    if (c.group && !GROUPS[c.group] && ![].some.call($("grp").options, function (o) { return o.value === c.group; })) {
      $("grp").add(new Option(c.group, c.group));
    }
    Object.keys(F).forEach(function (k) { $(k).value = c[F[k]] == null ? "" : c[F[k]]; });
    $("tot").value = D(c);
    $("paid").value = paidCount(c) + " / " + D(c);
    fillLift(c.lifted || "");
    showEnd();
    $("dlg").showModal();
  }

  // "Chit lifted month" choices: Month 1..N (with the calendar month once a join date is set)
  function fillLift(v) {
    var N = GM($("bat").value), jn = $("join").value, o = '<option value="">Not lifted yet</option>';
    for (var k = 1; k <= N; k++) {
      var d = jn ? dueDate({ joined: jn }, k) : null;
      o += '<option value="' + k + '">Month ' + k + (d ? " (" + MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2) + ")" : "") + "</option>";
    }
    var keep = v != null ? v : $("lift").value;
    $("lift").innerHTML = o;
    $("lift").value = keep ? String(keep) : "";
  }

  function showEnd() {
    var e = endDateOf({ joined: $("join").value, batch: $("bat").value });
    $("endd").value = e ? fmt(e) : "";
  }
  function autoMonthly() {
    var v = +$("val").value;
    if (v) $("mon").value = Math.round(v / GM($("bat").value));   // chit value / 20 months
  }

  function save() {
    var o = {};
    Object.keys(F).forEach(function (k) { o[F[k]] = $(k).value.trim(); });
    if (!o.name || !o.phone) { alert("Name and phone are required."); return; }
    if (!o.batch) { alert("Please select the Sri Brunda Group."); return; }
    ["value", "monthly", "total", "paid", "lifted"].forEach(function (k) { o[k] = Number(o[k]) || 0; });
    o.total = D(o);
    if (o.batch && data.filter(function (c) { return c.batch === o.batch && c.id !== editId; }).length >= D(o) &&
        !confirm(o.batch + " already has " + D(o) + " members. Add anyway?")) return;
    var ex = editId ? data.filter(function (c) { return c.id === editId; })[0] : null;
    o.pay = ex ? ex.pay : {};
    o.paid = paidCount(o);
    if (!o.joined) { alert("Please enter the join date."); return; }
    var eid = editId;
    (eid ? api("PUT", "/api/app/customers/" + eid + "/", o) : api("POST", "/api/app/customers/", o))
      .then(function (saved) {
        if (eid) data = data.map(function (c) { return c.id === eid ? saved : c; });
        else data.push(saved);
        $("dlg").close(); render();
      })
      .catch(function (e) { if (e.message !== "Please sign in") alert("Could not save: " + e.message); });
  }

  // ---------- payment calendar + WhatsApp receipt ----------
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var payId = null;
  var cur = function () { return data.filter(function (c) { return c.id === payId; })[0]; };
  var fmtIso = function (s) { var p = s.split("-"); return p[2] + "-" + p[1] + "-" + p[0]; };

  // due date of installment n = join date + (n-1) months
  function dueDate(c, n) {
    if (!c.joined) return null;
    var p = c.joined.split("-");
    var first = new Date(+p[0], +p[1] - 1 + (n - 1), 1);
    var last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(+p[2], last));
  }

  function openPay(id) { payId = id; drawCal(); $("pdlg").showModal(); }

  function drawCal() {
    var c = cur(), today = new Date(); today.setHours(0, 0, 0, 0);
    $("pt").textContent = c.name + " – " + (c.batch || c.group || "");
    $("ps").textContent = "Monthly " + inr(c.monthly) + " · Paid " + paidCount(c) + "/" + D(c) +
                          " · Balance " + inr(due(c)) + (c.lifted ? " · Lifted month " + c.lifted + " (+1%)" : "");
    var html = "";
    for (var n = 1; n <= D(c); n++) {
      var d = dueDate(c, n), p = c.pay[n], late = !p && d && d <= today;
      html += "<div class='m" + (p ? " paid" : "") + (late ? " late" : "") + "' data-n='" + n + "'>" +
        "<b>" + (p ? "✓ " : "") + "Month " + n + "</b>" +
        (d ? MON[d.getMonth()] + " " + d.getFullYear() + "<br>" : "") +
        (p ? "Paid " + (p.d ? fmtIso(p.d) : "") : "Due " + (d ? fmt(d) : "")) +
        "<br>" + inr(p ? p.a : amtFor(c, n)) + (+c.lifted && n === +c.lifted ? " (L)" : "") +
        (p ? "<button class='wa' data-w='" + n + "'>📲 Receipt</button>" : (late ? "<button class='wa rmd' data-rm='" + n + "'>🔔 Remind</button>" : "")) + "</div>";
    }
    $("cal").innerHTML = html;
  }

  function sendReceipt(n) {
    var c = cur(), p = c.pay[n];
    var ph = String(c.phone).replace(/\D/g, "").replace(/^0+/, "");
    if (ph.length === 10) ph = "91" + ph;          // India country code
    if (ph.length < 10) { alert("This customer's phone number looks invalid."); return; }
    var d = dueDate(c, n);
    var left = D(c) - paidCount(c);
    var text =
      "*Sri Brunda Chits*\n_Together Towards Prosperity_\n\n" +
      "*PAYMENT RECEIPT*\n" +
      "Receipt No: " + rcpt(c, n) + "\n" +
      "Customer: " + c.name + "\n" +
      "Chit group: " + (c.group || "-") + "\n" +
      "Installment: Month " + n + " of " + D(c) + "\n" +
      "Due date: " + (d ? fmt(d) : "-") + "\n" +
      "Paid on: " + (p.d ? fmtIso(p.d) : fmt(new Date())) + "\n" +
      "*Amount received: " + inr(p.a) + "*\n" +
      (+c.lifted && n >= +c.lifted ? "_Includes extra 1% of chit value after chit lifted (Month " + c.lifted + ")_\n" : "") + "\n" +
      "Balance: " + left + " month(s) (" + inr(due(c)) + ")\n\n" +
      "Thank you! 🙏";
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(text), "_blank");
  }

  // ---------- WhatsApp payment reminder ----------
  var byId = function (id) { return data.filter(function (x) { return x.id === id; })[0]; };
  // months whose due date has arrived and are not paid yet
  function overdueMonths(c) {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var out = [];
    if (!c.joined) return out;
    for (var n = 1; n <= D(c); n++) {
      var d = dueDate(c, n);
      if (!(c.pay && c.pay[n]) && d && d <= t) out.push(n);
    }
    return out;
  }
  function sendReminder(c, months) {
    if (!c) return;
    if (!months.length) { alert("No pending months for " + c.name + "."); return; }
    var ph = String(c.phone).replace(/\D/g, "").replace(/^0+/, "");
    if (ph.length === 10) ph = "91" + ph;
    if (ph.length < 10) { alert("This customer's phone number looks invalid."); return; }
    var total = 0;
    var lines = months.map(function (n) {
      var d = dueDate(c, n), a = amtFor(c, n); total += a;
      return "• Month " + n + (d ? " (" + MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2) + ") – due " + fmt(d) : "") + " – " + inr(a);
    });
    var text =
      "*Sri Brunda Chits*\n_Together Towards Prosperity_\n\n" +
      "*PAYMENT REMINDER*\n" +
      "Dear " + c.name + ",\n" +
      "This is a gentle reminder that your chit installment is pending:\n\n" +
      lines.join("\n") + "\n\n" +
      "*Total pending: " + inr(total) + "*\n" +
      "Group: " + (c.batch || "-") + (c.group ? " (" + c.group + ")" : "") + "\n\n" +
      "Kindly make the payment at the earliest. Please ignore this message if you have already paid.\n" +
      "Thank you 🙏";
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(text), "_blank");
  }

  $("cal").onclick = function (e) {
    var rmb = e.target.closest("[data-rm]");
    if (rmb) { sendReminder(cur(), [+rmb.dataset.rm]); return; }
    var w = e.target.closest("[data-w]");
    if (w) { sendReceipt(+w.dataset.w); return; }
    var m = e.target.closest("[data-n]");
    if (!m) return;
    var n = +m.dataset.n, c = cur(), justPaid = false;
    if (c.pay[n]) {
      if (!confirm("Remove the payment for month " + n + "?")) return;
      delete c.pay[n];
    } else {
      c.pay[n] = { d: iso(new Date()), a: amtFor(c, n) };
      justPaid = true;
    }
    c.paid = paidCount(c);
    syncPay(c, n, justPaid ? c.pay[n] : null); drawCal(); render();
    if (justPaid && confirm("Payment recorded. Send the receipt on WhatsApp now?")) sendReceipt(n);
  };
  $("pcx").onclick = function () { $("pdlg").close(); };

  // ---------- digital chit book ----------
  var bookId = null;
  // paper colour / ink colour for each group, like the printed books
  var BC = { "1 Lakh": ["#e3eff8", "#2b5fa8"], "2 Lakhs": ["#f4a3b0", "#4a2a7a"],
             "3 Lakhs": ["#fff1b8", "#7a5a00"], "4 Lakhs": ["#b9d7f2", "#1f5fa8"],
             "5 Lakhs": ["#bfe8d8", "#23409a"], "10 Lakhs": ["#e6d3f5", "#5a2a8a"],
             "15 Lakhs": ["#ffd9b3", "#8a4300"], "20 Lakhs": ["#dcdcdc", "#333333"],
             "25 Lakhs": ["#f3e2b0", "#6b4b00"] };
  var num = function (n) { return (Number(n) || 0).toLocaleString("en-IN"); };
  var shortIso = function (s) { var p = s.split("-"); return p[2] + "-" + p[1] + "-" + p[0].slice(2); };
  // lift amount: 95% of chit value in month 1, then +1% of chit value every month
  var lift = function (c, n) { var v = +c.value || 0; return Math.round(v * 0.95 + (n - 1) * v * 0.01); };

  function bookHalf(c, from, to) {
    var rows = "";
    for (var n = from; n <= to; n++) {
      var p = c.pay[n], d = dueDate(c, n);
      rows += "<tr class='" + (p ? "pd" : "") + "'><td>" + n + ".</td>" +
        "<td>" + (d ? MON[d.getMonth()] + " " + String(d.getFullYear()).slice(2) : "") + (n === +c.lifted ? "<small>Lifted</small>" : "") + "</td>" +
        "<td class='" + (p ? "" : "pre") + "'>" + (p ? num(p.a) : (n === 1 ? num(amtFor(c, 1)) : "")) + "</td>" +
        "<td>" + num(lift(c, n)) + "</td>" +
        "<td>" + (p ? (p.d ? shortIso(p.d) : "-") : "") + "</td>" +
        "<td>" + (p ? "<span class='sig'>✔</span><small>" + rcpt(c, n) + "</small>" : "") + "</td></tr>";
    }
    return "<div class='bk'><div class='bh'>Rs. " + num(c.value) + " ✱ " + D(c) + " Months ✱ " + D(c) + " Members</div>" +
      "<table><thead><tr><th>S.No</th><th>Month</th><th>Chit Amount</th><th>Lift Amount</th><th>Date</th><th>Sig.</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function drawBook() {
    var c = data.filter(function (x) { return x.id === bookId; })[0];
    var col = BC[c.group] || ["#eeeeee", "#223355"];
    $("bpaper").style.setProperty("--paper", col[0]);
    $("bpaper").style.setProperty("--bi", col[1]);
    $("bt").textContent = "Chit Book – " + c.name;
    $("bs").textContent = [c.phone, c.batch, c.group, "Joined " + (c.joined ? fmtIso(c.joined) : "-"), "Ends " + endStr(c), (c.lifted ? "Lifted month " + c.lifted : ""),
      "Paid " + paidCount(c) + "/" + D(c), "Balance " + inr(due(c))].filter(Boolean).join(" · ");
    $("bk").innerHTML = bookHalf(c, 1, Math.ceil(D(c) / 2)) + bookHalf(c, Math.ceil(D(c) / 2) + 1, D(c));
  }
  function openBook(id) { bookId = id; drawBook(); $("bdlg").showModal(); }
  $("pbk").onclick = function () { $("pdlg").close(); openBook(payId); };
  $("bpay").onclick = function () { $("bdlg").close(); openPay(bookId); };
  $("bcx").onclick = function () { $("bdlg").close(); };
  $("bpr").onclick = function () { window.print(); };

  // ---------- Sri Brunda Groups 1-26 ----------
  var GCOUNT = 26, curBatch = null;
  var gName = function (i) { return "Sri Brunda Group " + i; };
  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function members(b) {
    return data.filter(function (c) { return c.batch === b; })
               .sort(function (a, z) { return (a.name || "").localeCompare(z.name || ""); });
  }
  function groupAmount(list) {
    var m = list.filter(function (c) { return +c.value; })[0];
    return m ? +m.value : 0;
  }

  function openGroups() {
    var html = "";
    for (var i = 1; i <= GCOUNT; i++) {
      var b = gName(i), list = members(b), amt = groupAmount(list);
      html += "<button class='gcard' data-g='" + b + "'><b>Group " + i + "</b><span>" + list.length +
              "/" + GM(b) + " members</span><span>" + (amt ? "Rs. " + num(amt) : "No members yet") + "</span></button>";
    }
    $("gcards").innerHTML = html;
    $("gdlg").showModal();
  }

  function openSheet(b) {
    curBatch = b;
    $("gy").innerHTML = MONTH_OPTIONS.map(function (m) {
      return "<option value='" + m + "'" + (m === GM(b) ? " selected" : "") + ">" + m + " months</option>";
    }).join("");
    $("gdlg").close();
    drawSheet();
    $("gsdlg").showModal();
  }

  // choose 20 / 24 / 30 months for the whole group
  function changeMonths() {
    var m = +$("gy").value, old = GM(curBatch), list = members(curBatch);
    if (m === old) return;
    if (list.length && !confirm("Change " + curBatch + " to " + m + " months?\nEnd dates will move, and each member's monthly installment becomes chit value ÷ " + m + ".")) {
      $("gy").value = old; return;
    }
    api("PUT", "/api/app/groups/" + encodeURIComponent(curBatch) + "/", { months: m })
      .then(function () { return reload(); })
      .catch(function (e) { alert("Could not change months: " + e.message); $("gy").value = old; });
  }

  function drawSheet() {
    var list = members(curBatch), N = GM(curBatch), amt = groupAmount(list);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    $("gst").textContent = curBatch;
    $("gss").textContent = (amt ? "Chit value Rs. " + num(amt) + " · " : "") + N + " months · " +
                           list.length + "/" + N + " members";
    // calendar month shown under each number = counted from the earliest join date in the group
    var st = list.filter(function (c) { return c.joined; }).map(function (c) { return c.joined; }).sort()[0];
    var head = "<thead><tr><th>S.No</th><th>Name</th><th>Chit Amount</th><th>Remind</th>";
    for (var k = 1; k <= N; k++) {
      var dk = st ? dueDate({ joined: st }, k) : null;
      head += "<th>" + k + (dk ? "<small>" + MON[dk.getMonth()] + " " + String(dk.getFullYear()).slice(2) + "</small>" : "") + "</th>";
    }
    head += "</tr></thead>";
    var tot = [], body = "";
    list.forEach(function (c, idx) {
      body += "<tr><td>" + (idx + 1) + "</td><td class='nm'>" + esc(c.name) + "</td><td>" + num(c.monthly) + "</td>";
      var od = overdueMonths(c).length;
      body += "<td>" + (od ? "<button class='sm gold' data-r='" + esc(c.id) + "' title='Remind for all pending months'>🔔 " + od + "</button>" : "") + "</td>";
      for (var n = 1; n <= N; n++) {
        if (!c.joined) { body += "<td class='na'>·</td>"; continue; }
        var p = c.pay[n], d = dueDate(c, n), late = !p && d && d <= today;
        if (p) tot[n] = (tot[n] || 0) + (+p.a || 0);
        body += "<td class='gc" + (p ? " ok" : "") + (late ? " late" : "") + "' data-c='" + esc(c.id) +
                "' data-n='" + n + "' title='" + inr(p ? p.a : amtFor(c, n)) +
                (+c.lifted && n >= +c.lifted ? " (incl. 1% of chit value)" : "") + "'>" + (p ? "✔" : (late ? "<span class='bell' data-rm='" + n + "' data-c='" + esc(c.id) + "' title='Send reminder on WhatsApp'>🔔</span>" : "")) +
                (n === +c.lifted ? "<sup class='lm'>L</sup>" : "") + "</td>";
      }
      body += "</tr>";
    });
    if (!list.length) body = "<tr><td colspan='" + (N + 4) + "' class='empty'>No members in this group yet. Tap “+ Add customer”.</td></tr>";
    var foot = "";
    if (list.length) {
      foot = "<tfoot><tr><td></td><td style='text-align:left'>Collected</td><td></td><td></td>";
      for (var q = 1; q <= N; q++) foot += "<td>" + (tot[q] ? num(tot[q]) : "") + "</td>";
      foot += "</tr></tfoot>";
    }
    $("gtab").style.minWidth = (410 + N * 52) + "px";
    $("gtab").innerHTML = head + "<tbody>" + body + "</tbody>" + foot;
  }

  $("gtab").onclick = function (e) {
    var rm = e.target.closest("[data-rm]");
    if (rm) { sendReminder(byId(rm.dataset.c), [+rm.dataset.rm]); return; }
    var rr = e.target.closest("[data-r]");
    if (rr) { var cc = byId(rr.dataset.r); sendReminder(cc, overdueMonths(cc)); return; }
    var cell = e.target.closest("[data-n]"); if (!cell) return;
    var id = cell.dataset.c, n = +cell.dataset.n;
    var c = data.filter(function (x) { return x.id === id; })[0], justPaid = false;
    if (c.pay[n]) {
      if (!confirm("Remove the payment for " + c.name + " (month " + n + ")?")) return;
      delete c.pay[n];
    } else { c.pay[n] = { d: iso(new Date()), a: amtFor(c, n) }; justPaid = true; }
    c.paid = paidCount(c);
    syncPay(c, n, justPaid ? c.pay[n] : null); drawSheet(); render();
    if (justPaid && confirm("Payment recorded for " + c.name + ". Send the receipt on WhatsApp now?")) {
      payId = id; sendReceipt(n);
    }
  };
  // "+ Add customer" inside a group: opens the form with this group already chosen,
  // then returns to the group sheet when the form is saved or cancelled
  var backToSheet = null;
  $("gadd").onclick = function () {
    backToSheet = curBatch;
    $("gsdlg").close();
    openForm({ status: "Active", paid: 0, joined: iso(new Date()), batch: curBatch });
    $("bat").onchange();   // fills the group's chit amount if it already has members
  };
  $("dlg").addEventListener("close", function () {
    if (backToSheet) { var b = backToSheet; backToSheet = null; openSheet(b); }
  });
  $("gy").onchange = changeMonths;
  $("gbtn").onclick = openGroups;
  $("gcx").onclick = function () { $("gdlg").close(); };
  $("gscx").onclick = function () { $("gsdlg").close(); };
  $("gback").onclick = function () { $("gsdlg").close(); openGroups(); };
  $("gpr").onclick = function () { window.print(); };


  // ---------- hand loans ----------
  var loans = [], loanEditId = null;
  function isoDate(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var loanDate = function (s) { return s ? fmtIso(s) : "-"; };
  // days from today to the end date (negative = overdue); null if no end date
  function daysLeft(l) {
    if (!l.end) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((isoDate(l.end) - t) / 864e5);
  }
  // simple interest: rate % per month x months between start and end (extra days counted as days/30)
  function loanMonths(l) {
    if (!l.start || !l.end) return 0;
    var a = isoDate(l.start), b = isoDate(l.end);
    var m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    var x = new Date(a.getFullYear(), a.getMonth() + m, a.getDate());
    if (x > b) { m--; x = new Date(a.getFullYear(), a.getMonth() + m, a.getDate()); }
    return Math.max(0, m + Math.round((b - x) / 864e5) / 30);
  }
  var loanInterest = function (l) { return Math.round((+l.amount || 0) * (+l.rate || 0) / 100 * loanMonths(l)); };
  var loanTotal = function (l) { return (+l.amount || 0) + loanInterest(l); };
  var loanOverdue = function (l) { var d = daysLeft(l); return l.status !== "Closed" && d !== null && d < 0; };
  function remainderText(l) {
    if (l.status === "Closed") return "<span class='pill Completed'>Closed</span>";
    var d = daysLeft(l);
    if (d === null) return "-";
    if (d < 0) return "<span class='due'>Overdue " + (-d) + " day" + (d === -1 ? "" : "s") + "</span>";
    if (d === 0) return "<span class='due'>Due today</span>";
    return "<span class='ok-t'>" + d + " day" + (d === 1 ? "" : "s") + " left</span>";
  }

  function renderLoans() {
    var q = $("lq").value.toLowerCase();
    var list = loans.filter(function (l) { return !q || (l.name || "").toLowerCase().indexOf(q) > -1; })
                    .sort(function (a, b) { return (a.end || "9999").localeCompare(b.end || "9999"); });
    var run = loans.filter(function (l) { return l.status !== "Closed"; });
    $("lC").textContent = run.length;
    $("lA").textContent = inr(run.reduce(function (a, l) { return a + (+l.amount || 0); }, 0));
    $("lO").textContent = loans.filter(loanOverdue).length;
    $("lrows").innerHTML = list.length ? list.map(function (l, i) {
      var open = l.status !== "Closed";
      return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(l.name) + "</b></td><td>" + inr(l.amount) + "</td><td>" +
        (+l.rate || 0) + "% / month</td><td>" + loanDate(l.start) + "</td><td>" + loanDate(l.end) + "</td>" +
        "<td>" + inr(loanInterest(l)) + "</td><td><b>" + inr(loanTotal(l)) + "</b></td>" +
        "<td><span class='rem'>" + remainderText(l) +
        (open ? " <button class='sm " + (loanOverdue(l) ? "warn" : "ghost") + "' data-lr='" + esc(l.id) + "' title='Send reminder on WhatsApp'>🔔</button>" : "") +
        "</span></td>" +
        "<td><button class='sm ghost' data-le='" + esc(l.id) + "'>Edit</button> <button class='sm ghost' data-ld='" + esc(l.id) + "'>Delete</button></td></tr>";
    }).join("") : "<tr><td colspan='10' class='empty'>No hand loans yet. Click “Add hand loan”.</td></tr>";
  }

  var LF = { lname: "name", lphone: "phone", lamt: "amount", lrate: "rate", lstart: "start", lend: "end", lst: "status", lnote: "notes" };
  function openLoan(l) {
    l = l || { status: "Running", start: iso(new Date()) };
    loanEditId = l.id || null;
    $("ldt").textContent = loanEditId ? "Edit hand loan" : "Add hand loan";
    Object.keys(LF).forEach(function (k) { $(k).value = l[LF[k]] == null ? "" : l[LF[k]]; });
    $("ldlg").showModal();
  }
  function saveLoan() {
    var o = {};
    Object.keys(LF).forEach(function (k) { o[LF[k]] = $(k).value.trim(); });
    o.amount = Number(o.amount) || 0; o.rate = Number(o.rate) || 0;
    if (!o.name) { alert("Name is required."); return; }
    if (!o.amount) { alert("Please enter the loan amount."); return; }
    if (!o.start || !o.end) { alert("Please enter both start date and end date."); return; }
    if (o.end < o.start) { alert("End date cannot be before the start date."); return; }
    var lid = loanEditId;
    (lid ? api("PUT", "/api/app/loans/" + lid + "/", o) : api("POST", "/api/app/loans/", o))
      .then(function (saved) {
        if (lid) loans = loans.map(function (l) { return l.id === lid ? saved : l; });
        else loans.push(saved);
        $("ldlg").close(); renderLoans();
      })
      .catch(function (e) { if (e.message !== "Please sign in") alert("Could not save: " + e.message); });
  }
  function loanReminder(l) {
    if (!l) return;
    var ph = String(l.phone || "").replace(/\D/g, "").replace(/^0+/, "");
    if (ph.length === 10) ph = "91" + ph;
    if (ph.length < 10) { alert("Add a valid phone number for " + l.name + " (use Edit) to send a WhatsApp reminder."); return; }
    var d = daysLeft(l);
    var text =
      "*Sri Brunda Chits*\n_Together Towards Prosperity_\n\n" +
      "*PAYMENT REMINDER – HAND LOAN*\n" +
      "Dear " + l.name + ",\n" +
      (d !== null && d < 0 ? "Your hand loan was due on " + loanDate(l.end) + " and is now overdue.\n\n"
                           : "This is a gentle reminder that your hand loan is due on " + loanDate(l.end) + ".\n\n") +
      "Loan amount: " + inr(l.amount) + "\n" +
      "Rate of interest: " + (+l.rate || 0) + "% per month\n" +
      "Start date: " + loanDate(l.start) + "\n" +
      "End date: " + loanDate(l.end) + "\n" +
      "Interest: " + inr(loanInterest(l)) + "\n" +
      "*Total amount to pay: " + inr(loanTotal(l)) + "*\n\n" +
      "Kindly make the payment at the earliest. Please ignore this message if you have already paid.\nThank you 🙏";
    window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(text), "_blank");
  }
  var loanById = function (id) { return loans.filter(function (x) { return x.id === id; })[0]; };

  $("lrows").onclick = function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.le) openLoan(loanById(b.dataset.le));
    if (b.dataset.lr) loanReminder(loanById(b.dataset.lr));
    if (b.dataset.ld && confirm("Delete this hand loan permanently?")) {
      var xid = b.dataset.ld;
      api("DELETE", "/api/app/loans/" + xid + "/")
        .then(function () { loans = loans.filter(function (l) { return l.id !== xid; }); renderLoans(); })
        .catch(function (e) { alert("Could not delete: " + e.message); });
    }
  };
  $("ladd").onclick = function () { openLoan(); };
  $("lcx").onclick = function () { $("ldlg").close(); };
  $("lsv").onclick = saveLoan;
  $("lq").oninput = renderLoans;
  $("lexp").onclick = function () {
    var h = ["name", "phone", "amount", "rate", "start", "end", "interest", "total", "status", "notes"];
    var rows = loans.map(function (l0) {
      var l = Object.assign({}, l0, { interest: loanInterest(l0), total: loanTotal(l0) });
      return h.map(function (k) { return '"' + String(l[k] == null ? "" : l[k]).replace(/"/g, '""') + '"'; }).join(",");
    });
    download("sri-brunda-hand-loans.csv", [h.join(",")].concat(rows).join("\n"), "text/csv");
  };
  // Customers / Hand Loans tabs
  document.querySelector(".tabs").onclick = function (e) {
    var t = e.target.closest("[data-tab]"); if (!t) return;
    var loan = t.dataset.tab === "loan";
    $("custView").hidden = loan; $("loanView").hidden = !loan;
    [].forEach.call(document.querySelectorAll(".tab"), function (x) { x.classList.toggle("on", x === t); });
    if (loan) renderLoans();
  };

  // ---------- events ----------
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset.p) openPay(t.dataset.p);
    if (t.dataset.rr) { var rc = byId(t.dataset.rr); sendReminder(rc, overdueMonths(rc)); }
    if (t.dataset.b) openBook(t.dataset.b);
    var gc = t.closest("[data-g]"); if (gc) openSheet(gc.dataset.g);
    if (t.dataset.e) openForm(data.filter(function (c) { return c.id === t.dataset.e; })[0]);
    if (t.dataset.d && confirm("Delete this customer permanently?")) {
      var did = t.dataset.d;
      api("DELETE", "/api/app/customers/" + did + "/")
        .then(function () { data = data.filter(function (c) { return c.id !== did; }); render(); })
        .catch(function (e) { alert("Could not delete: " + e.message); });
    }
  });
  $("add").onclick = function () { openForm(); };
  $("cx").onclick = function () { $("dlg").close(); };
  $("sv").onclick = save;
  $("grp").onchange = function () {
    if (GROUPS[this.value]) { $("val").value = GROUPS[this.value]; autoMonthly(); }
  };
  // joining a group that already has members: use that group's chit amount
  $("bat").onchange = function () {
    var b = this.value; $("tot").value = GM(b); showEnd(); fillLift(); autoMonthly(); if (!b) return;
    var m = data.filter(function (x) { return x.batch === b && x.id !== editId && x.group; })[0];
    if (m) { $("grp").value = m.group; $("grp").onchange(); }
  };
  $("val").oninput = autoMonthly;
  $("join").onchange = function () { showEnd(); fillLift(); };
  $("g").onchange = render;
  $("q").oninput = render;
  $("f").onchange = render;

  $("exp").onclick = function () {
    var h = ["name","phone","address","batch","group","joined","value","monthly","total","paid","lifted","ends","status","notes"];
    var rows = data.map(function (c0) {
      var c = Object.assign({}, c0, { total: D(c0), ends: endStr(c0), status: effStatus(c0) });
      return h.map(function (k) {
        return '"' + String(c[k] == null ? "" : c[k]).replace(/"/g, '""') + '"';
      }).join(",");
    });
    download("sri-brunda-customers.csv", [h.join(",")].concat(rows).join("\n"), "text/csv");
  };

  $("bak").onclick = function () {
    download("sri-brunda-backup-" + new Date().toISOString().slice(0, 10) + ".json",
             JSON.stringify({ customers: data, handloans: loans, groupSettings: GS }, null, 2), "application/json");
  };
  $("res").onclick = function () { $("file").click(); };
  $("file").onchange = function () {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        var cu = Array.isArray(d) ? d : d && d.customers, hl = Array.isArray(d) ? null : d && d.handloans;
        if (!Array.isArray(cu)) throw 0;
        if (confirm("Replace ALL data on the server with " + cu.length + " customers" + (Array.isArray(hl) ? " and " + hl.length + " hand loans" : "") + " from the backup?")) {
          var gs = (!Array.isArray(d) && d && d.groupSettings) || {};
          api("POST", "/api/app/restore/", { customers: cu, handloans: Array.isArray(hl) ? hl : [], groupSettings: gs })
            .then(function (r) { return reload().then(function () { alert("Restored " + r.customers + " customers and " + r.loans + " hand loans." + warnText(r)); }); })
            .catch(function (e) { alert("Restore failed: " + e.message); });
        }
      } catch (e) { alert("That file is not a valid backup."); }
      $("file").value = "";
    };
    if (this.files[0]) r.readAsText(this.files[0]);
  };

  (function fillGroups() {
    var o = "";
    for (var i = 1; i <= GCOUNT; i++) o += "<option>" + gName(i) + "</option>";
    $("bat").innerHTML = '<option value="">Select group</option>' + o;
    $("g").innerHTML = '<option value="">All groups</option>' + o;
  })();
  render(); renderLoans();
  init();
})();