(function () {
  'use strict';

  /*
    CARA KERJA SINGKAT
    - Setiap tagihan HANYA milik satu bulan (field "month", contoh "2026-10").
    - Menambah tagihan = menambah ke bulan yang sedang dilihat.
    - Mau tagihan yang sama di bulan berikutnya? Pakai tombol "Salin dari bulan lalu".
    - Status lunas disimpan di tagihan itu sendiri (field "paid").
  */

  const CFG = window.APP_CONFIG || {};
  const $ = (sel) => document.querySelector(sel);

  // ---------- Fungsi bantu ----------
  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = (y, m) => y + '-' + pad(m + 1);
  const parseKey = (key) => {
    const p = key.split('-').map(Number);
    return { y: p[0], m: p[1] - 1 };
  };
  const shiftKey = (key, delta) => {
    const p = parseKey(key);
    const d = new Date(p.y, p.m + delta, 1);
    return monthKey(d.getFullYear(), d.getMonth());
  };
  const monthName = (key) => {
    const p = parseKey(key);
    return new Date(p.y, p.m, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  };
  const norm = (s) => String(s || '').trim().toLowerCase();
  const fmtRp = (n) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const newId = () =>
    window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'b' + Date.now() + Math.random().toString(16).slice(2);

  function lsGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* diabaikan */ }
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Penyimpanan: lokal (browser) ----------
  function localStore() {
    const KEY = 'tagihan_bills_v2';
    const listeners = [];
    const read = () => {
      try { return JSON.parse(lsGet(KEY, '[]')) || []; } catch (e) { return []; }
    };
    const write = (list) => {
      lsSet(KEY, JSON.stringify(list));
      listeners.forEach((fn) => fn(list));
    };
    return {
      mode: 'lokal',
      subscribe(cb) { listeners.push(cb); cb(read()); },
      save(bill) {
        const list = read();
        const i = list.findIndex((b) => b.id === bill.id);
        if (i >= 0) list[i] = Object.assign({}, list[i], bill); else list.push(bill);
        write(list);
      },
      addMany(items) { write(read().concat(items)); },
      remove(id) { write(read().filter((b) => b.id !== id)); },
      setPaid(id, payload) {
        const list = read();
        const bill = list.find((b) => b.id === id);
        if (!bill) return;
        bill.paid = payload || null;
        write(list);
      }
    };
  }

  // ---------- Penyimpanan: online (Firebase Firestore) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }

  async function firebaseStore() {
    const base = 'https://www.gstatic.com/firebasejs/10.12.2/';
    await loadScript(base + 'firebase-app-compat.js');
    await loadScript(base + 'firebase-firestore-compat.js');
    firebase.initializeApp(CFG.firebase);
    const db = firebase.firestore();
    const col = db.collection('bills');
    const strip = (bill) => {
      const data = Object.assign({}, bill);
      delete data.id;
      return data;
    };
    return {
      mode: 'online',
      subscribe(cb) {
        col.onSnapshot(
          (snap) => cb(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))),
          () => toast('Tidak bisa terhubung ke database. Cek koneksi atau pengaturan Firebase.')
        );
      },
      save(bill) {
        return col.doc(bill.id).set(strip(bill), { merge: true }).catch(() => toast('Gagal menyimpan.'));
      },
      addMany(items) {
        const batch = db.batch();
        items.forEach((b) => batch.set(col.doc(b.id), strip(b)));
        return batch.commit().catch(() => toast('Gagal menyalin tagihan.'));
      },
      remove(id) { return col.doc(id).delete().catch(() => toast('Gagal menghapus.')); },
      setPaid(id, payload) {
        return col.doc(id).update({ paid: payload || null }).catch(() => toast('Gagal memperbarui status.'));
      }
    };
  }

  // ---------- State ----------
  let store;
  let bills = [];
  const now = new Date();
  let viewKey = monthKey(now.getFullYear(), now.getMonth());
  let editingId = null;
  let payingId = null;
  let copyCandidates = [];

  const billsOfMonth = (key) => bills.filter((b) => b.month === key);

  // ---------- Logika status ----------
  function statusOf(bill) {
    const p = parseKey(bill.month);
    const lastDay = new Date(p.y, p.m + 1, 0).getDate();
    const due = new Date(p.y, p.m, Math.min(Number(bill.dueDay) || 1, lastDay));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((due - today) / 86400000);

    if (bill.paid) return { cls: 'paid', rank: 3, label: 'Lunas oleh ' + (bill.paid.by || '-'), due: due };
    if (diff < 0) return { cls: 'late', rank: 0, label: 'Terlambat ' + -diff + ' hari', due: due };
    if (diff === 0) return { cls: 'soon', rank: 1, label: 'Jatuh tempo hari ini', due: due };
    if (diff <= 7) return { cls: 'soon', rank: 1, label: diff + ' hari lagi', due: due };
    return { cls: 'upcoming', rank: 2, label: diff + ' hari lagi', due: due };
  }

  // ---------- Tampilan ----------
  function render() {
    $('#monthLabel').textContent = monthName(viewKey);

    const monthBills = billsOfMonth(viewKey);
    const rows = monthBills
      .map((b) => ({ bill: b, st: statusOf(b) }))
      .sort((a, b) => a.st.rank - b.st.rank || a.st.due - b.st.due);

    let total = 0, paidSum = 0, lateCount = 0;
    rows.forEach(({ bill, st }) => {
      const amt = Number(bill.amount) || 0;
      total += amt;
      if (st.cls === 'paid') paidSum += amt;
      if (st.cls === 'late') lateCount++;
    });

    $('#sumTotal').textContent = fmtRp(total);
    $('#sumPaid').textContent = fmtRp(paidSum);
    $('#sumRemain').textContent = fmtRp(total - paidSum);
    $('#sumLate').textContent = lateCount ? '⚠ ' + lateCount + ' tagihan terlambat' : '';

    $('#empty').classList.toggle('hidden', monthBills.length > 0);

    $('#list').innerHTML = rows.map(({ bill, st }) => {
      const dueText = st.due.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
      const paidInfo = bill.paid && bill.paid.at
        ? ' · ' + new Date(bill.paid.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
        : '';
      const payBtn = st.cls === 'paid'
        ? '<button class="btn small ghost" data-act="unpay" data-id="' + esc(bill.id) + '">Batal lunas</button>'
        : '<button class="btn small primary" data-act="pay" data-id="' + esc(bill.id) + '">Bayar</button>';
      return (
        '<article class="bill ' + st.cls + '">' +
          '<div class="bill-info">' +
            '<div class="bill-name">' + esc(bill.name) + '</div>' +
            '<div class="bill-amount">' + fmtRp(bill.amount) + '</div>' +
            '<div class="bill-due">Jatuh tempo ' + esc(dueText) + '</div>' +
            '<span class="chip ' + st.cls + '">' + esc(st.label) + esc(paidInfo) + '</span>' +
            (bill.note ? '<div class="bill-note">' + esc(bill.note) + '</div>' : '') +
          '</div>' +
          '<div class="bill-actions">' +
            payBtn +
            '<button class="btn small outline" data-act="edit" data-id="' + esc(bill.id) + '">Edit</button>' +
          '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ---------- Form tagihan ----------
  function openBillDialog(id) {
    editingId = id || null;
    const bill = id ? bills.find((b) => b.id === id) : null;
    $('#billDialogTitle').textContent = bill ? 'Edit Tagihan' : 'Tambah Tagihan';
    $('#billMonthHint').textContent = 'Untuk bulan ' + monthName(bill ? bill.month : viewKey) +
      '. Bulan lain tidak ikut berubah.';
    $('#fName').value = bill ? bill.name : '';
    $('#fAmount').value = bill ? bill.amount : '';
    $('#fDay').value = bill ? bill.dueDay : '';
    $('#fNote').value = bill ? bill.note || '' : '';
    $('#deleteBtn').classList.toggle('hidden', !bill);
    $('#billDialog').showModal();
  }

  $('#addBtn').addEventListener('click', () => openBillDialog());
  $('#cancelBill').addEventListener('click', () => $('#billDialog').close());

  $('#billForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#fName').value.trim();
    const amount = Number($('#fAmount').value);
    const dueDay = parseInt($('#fDay').value, 10);
    if (!name || !(amount >= 0) || !(dueDay >= 1 && dueDay <= 31)) {
      toast('Cek lagi isian: tanggal harus 1 sampai 31.');
      return;
    }
    const existing = editingId ? bills.find((b) => b.id === editingId) : null;
    store.save({
      id: editingId || newId(),
      name: name,
      amount: amount,
      dueDay: dueDay,
      note: $('#fNote').value.trim(),
      month: existing ? existing.month : viewKey,
      paid: existing && existing.paid ? existing.paid : null
    });
    $('#billDialog').close();
    toast(editingId ? 'Tagihan diperbarui' : 'Tagihan ditambahkan');
  });

  $('#deleteBtn').addEventListener('click', () => {
    const bill = bills.find((b) => b.id === editingId);
    if (!bill) return;
    if (confirm('Hapus tagihan "' + bill.name + '" di bulan ' + monthName(bill.month) + '?')) {
      store.remove(bill.id);
      $('#billDialog').close();
      toast('Tagihan dihapus');
    }
  });

  // ---------- Bayar / batal bayar / edit ----------
  $('#list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.act === 'edit') {
      openBillDialog(id);
    } else if (btn.dataset.act === 'pay') {
      payingId = id;
      $('#payerName').value = lsGet('tagihan_payer', '');
      $('#nameDialog').showModal();
    } else if (btn.dataset.act === 'unpay') {
      store.setPaid(id, null);
      toast('Status lunas dibatalkan');
    }
  });

  $('#cancelName').addEventListener('click', () => $('#nameDialog').close());

  $('#nameForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const by = $('#payerName').value.trim();
    if (!by || !payingId) return;
    lsSet('tagihan_payer', by);
    store.setPaid(payingId, { by: by, at: Date.now() });
    $('#nameDialog').close();
    payingId = null;
    toast('Ditandai lunas');
  });

  // ---------- Salin dari bulan lalu (manual) ----------
  function openCopyDialog() {
    const prevKey = shiftKey(viewKey, -1);
    const source = billsOfMonth(prevKey);
    if (!source.length) {
      toast('Bulan ' + monthName(prevKey) + ' tidak punya tagihan untuk disalin.');
      return;
    }
    const existingNames = new Set(billsOfMonth(viewKey).map((b) => norm(b.name)));
    copyCandidates = source.map((b) => ({ bill: b, dup: existingNames.has(norm(b.name)) }));

    $('#copyHint').textContent =
      'Dari ' + monthName(prevKey) + ' ke ' + monthName(viewKey) +
      '. Yang disalin: nama, nominal, tanggal, dan catatan. Statusnya mulai dari belum lunas.';

    $('#copyList').innerHTML = copyCandidates.map((c, i) =>
      '<label class="copy-item' + (c.dup ? ' dup' : '') + '">' +
        '<input type="checkbox" data-i="' + i + '"' + (c.dup ? ' disabled' : ' checked') + '>' +
        '<span class="copy-name">' + esc(c.bill.name) + '</span>' +
        '<span class="copy-amt">' + fmtRp(c.bill.amount) + '</span>' +
        (c.dup ? '<em>sudah ada</em>' : '') +
      '</label>'
    ).join('');

    $('#copyDialog').showModal();
  }

  $('#copyBtn').addEventListener('click', openCopyDialog);
  $('#cancelCopy').addEventListener('click', () => $('#copyDialog').close());

  $('#confirmCopy').addEventListener('click', () => {
    const boxes = Array.from($('#copyList').querySelectorAll('input[data-i]'));
    const items = boxes
      .filter((box) => box.checked && !box.disabled)
      .map((box) => copyCandidates[Number(box.dataset.i)].bill)
      .map((b) => ({
        id: newId(),
        name: b.name,
        amount: b.amount,
        dueDay: b.dueDay,
        note: b.note || '',
        month: viewKey,
        paid: null
      }));

    if (!items.length) {
      toast('Belum ada yang dipilih.');
      return;
    }
    store.addMany(items);
    $('#copyDialog').close();
    toast(items.length + ' tagihan disalin ke ' + monthName(viewKey));
  });

  // ---------- Navigasi bulan ----------
  $('#prevMonth').addEventListener('click', () => { viewKey = shiftKey(viewKey, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { viewKey = shiftKey(viewKey, 1); render(); });

  // ---------- PIN ----------
  function setupLock() {
    const pin = String(CFG.PIN || '');
    if (!pin) return;
    let unlocked = false;
    try { unlocked = sessionStorage.getItem('tagihan_unlocked') === '1'; } catch (e) { /* diabaikan */ }
    if (unlocked) return;

    const lock = $('#lock');
    lock.classList.remove('hidden');
    $('#lockForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#pinInput').value === pin) {
        try { sessionStorage.setItem('tagihan_unlocked', '1'); } catch (err) { /* diabaikan */ }
        lock.classList.add('hidden');
      } else {
        $('#pinInput').value = '';
        toast('PIN salah');
      }
    });
  }

  // ---------- Mulai ----------
  async function init() {
    setupLock();

    const wantOnline = CFG.FIREBASE_ENABLED && CFG.firebase && CFG.firebase.projectId;
    if (wantOnline) {
      try {
        store = await firebaseStore();
      } catch (err) {
        store = localStore();
        toast('Firebase gagal dimuat, memakai penyimpanan lokal.');
      }
    } else {
      store = localStore();
    }

    const badge = $('#modeBadge');
    badge.textContent = store.mode === 'online' ? '● Tersinkron online' : 'Data di perangkat ini';
    badge.classList.toggle('online', store.mode === 'online');

    store.subscribe((list) => {
      // Abaikan data lama yang belum punya field "month"
      bills = Array.isArray(list) ? list.filter((b) => b && b.month) : [];
      render();
    });
    render();
  }

  init();
})();
