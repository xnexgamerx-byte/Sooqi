/*
 * لوحة الإشراف. جافاسكربت عادي بلا إطار وبلا خطوة بناء.
 *
 * قاعدة واحدة لا تُكسر في هذا الملف: كل نص يأتي من القاعدة يُوضع بـ
 * textContent لا بـ innerHTML. هذه الصفحة تعرض عناوين إعلانات وملاحظات
 * بلاغات كتبها غرباء، وأخطرهم من يعرف أن مشرفاً سيقرؤها.
 */

/* --------------------------------------------------------------- أدوات */

const $ = (id) => document.getElementById(id);

/** يبني عنصراً. النصوص كلها عبر textContent، فلا مجال لحقن وسوم. */
function el(tag, props, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined) {
      node.setAttribute(key, value);
    }
  }
  for (const child of children || []) {
    if (child) node.appendChild(child);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * أرقام هندية بفاصل آلاف عربي.
 *
 * مكتوبة يدوياً لا بـ Intl: هي أربعة أسطر، والاعتماد على إعدادات المتصفح
 * يعني أرقاماً لاتينية عند بعض المستخدمين وهندية عند آخرين في نفس الشاشة.
 */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function arNumber(value) {
  const grouped = String(Math.trunc(Math.abs(value))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    "٬",
  );
  return grouped.replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** أرقام بلا فاصل: للهواتف وأرقام الحسابات، فالفاصل فيها خطأ. */
function arPlain(value) {
  return String(value).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

function priceLabel(iqd) {
  if (iqd === null || iqd === undefined) return "بلا سعر";
  return `${arNumber(iqd)} د.ع`;
}

function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "توّه";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${arNumber(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${arNumber(hours)} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${arNumber(days)} يوم`;
  return `قبل ${arNumber(Math.floor(days / 30))} شهر`;
}

let toastTimer = null;

function toast(message, bad) {
  const node = $("toast");
  node.textContent = message;
  node.className = bad ? "toast toast-bad" : "toast";
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 2600);
}

/* ---------------------------------------------------------- الاتصالات */

/**
 * الرمز في sessionStorage لا localStorage.
 *
 * لوحة تحظر حسابات وتقرأ أرقام هواتف لا تبقى مفتوحة على جهاز مشترك بعد
 * إغلاق اللسان. إعادة الدخول كل جلسة كلفة زهيدة مقابل ذلك.
 */
const TOKEN_KEY = "souqna.admin.token";

let token = sessionStorage.getItem(TOKEN_KEY) || "";

class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call(path, options) {
  const settings = options || {};
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (settings.body !== undefined) headers["content-type"] = "application/json";

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method: settings.method || "GET",
      headers,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body),
    });
  } catch {
    throw new ApiError("ما وصلنا للخادم. تحقّق من الاتصال.", "network", 0);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // جلسة منتهية أو مسحوبة: نرجع للدخول بدل إظهار خطأ غامض
    if (response.status === 401) signOut();
    const error = payload && payload.error;
    throw new ApiError(
      (error && error.message) || "صار خطأ غير متوقع",
      (error && error.code) || "unknown",
      response.status,
    );
  }

  return payload;
}

/* -------------------------------------------------------------- الدخول */

let pendingPhone = "";

function gateError(message) {
  const node = $("gate-error");
  if (!message) {
    node.hidden = true;
    return;
  }
  node.textContent = message;
  node.hidden = false;
}

function showGate() {
  $("panel").hidden = true;
  $("gate").hidden = false;
  $("step-code").hidden = true;
  $("step-phone").hidden = false;
  gateError("");
}

function signOut() {
  // نُبطل الجلسة على الخادم أيضاً؛ مسح الرمز محلياً وحده يتركها حيّة
  if (token) void call("/auth/logout", { method: "POST" }).catch(() => {});
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  showGate();
}

async function requestCode() {
  const phone = $("phone").value.trim();
  if (!phone) return gateError("اكتب رقم هاتفك");

  gateError("");
  $("send-code").disabled = true;

  try {
    await call("/auth/otp/request", { method: "POST", body: { phone } });
    pendingPhone = phone;
    $("step-phone").hidden = true;
    $("step-code").hidden = false;
    $("code").focus();
  } catch (error) {
    gateError(error.message);
  } finally {
    $("send-code").disabled = false;
  }
}

async function verifyCode() {
  const code = $("code").value.trim();
  if (!code) return gateError("اكتب الرمز");

  gateError("");
  $("verify-code").disabled = true;

  try {
    const data = await call("/auth/otp/verify", {
      method: "POST",
      body: { phone: pendingPhone, code, deviceName: "لوحة الإشراف" },
    });

    token = data.token;

    /**
     * لا نحفظ الرمز قبل التأكّد من الصلاحية.
     *
     * أي حساب يستطيع تجاوز رمز التحقق، والصلاحية وحدها تفصل. نسأل الخادم
     * سؤالاً يتطلّب دور مشرف: إن رفض، لا جلسة محفوظة أصلاً.
     */
    await call("/admin/overview");

    sessionStorage.setItem(TOKEN_KEY, token);
    await start();
  } catch (error) {
    if (error.code === "not_moderator") {
      token = "";
      gateError("هذا الحساب ليس مشرفاً.");
    } else {
      gateError(error.message);
    }
    $("code").value = "";
  } finally {
    $("verify-code").disabled = false;
  }
}

/* ------------------------------------------------------------- النافذة */

let modalConfirm = null;

function openModal(options) {
  $("modal-title").textContent = options.title;
  $("modal-sub").textContent = options.subtitle || "";
  $("modal-reason").value = options.value || "";

  const presets = $("modal-presets");
  clear(presets);
  for (const preset of options.presets || []) {
    presets.appendChild(
      el("button", {
        class: "preset",
        type: "button",
        text: preset,
        onclick: () => {
          $("modal-reason").value = preset;
          $("modal-reason").focus();
        },
      }),
    );
  }

  $("modal-confirm").textContent = options.confirmText || "تأكيد";
  modalConfirm = options.onConfirm;
  $("modal").hidden = false;
  $("modal-reason").focus();
}

function closeModal() {
  $("modal").hidden = true;
  modalConfirm = null;
}

async function submitModal() {
  const reason = $("modal-reason").value.trim();
  if (reason.length < 3) {
    return toast("اكتب سبباً واضحاً يفهمه صاحب الإعلان", true);
  }

  const handler = modalConfirm;
  closeModal();
  if (handler) await handler(reason);
}

function openLightbox(src) {
  $("lightbox-img").src = src;
  $("lightbox").hidden = false;
}

/* --------------------------------------------------------------- حالة */

const state = {
  tab: "queue",
  queue: [],
  index: 0,
  reports: [],
  users: [],
};

async function refreshStats() {
  const data = await call("/admin/overview");
  const box = $("stats");
  clear(box);

  const cards = [
    { label: "بانتظار المراجعة", value: data.pendingListings, tone: "stat-hot" },
    { label: "بلاغات مفتوحة", value: data.openReports, tone: "stat-bad" },
    { label: "إعلانات منشورة", value: data.publishedListings, tone: "" },
    { label: "حسابات محظورة", value: data.bannedUsers, tone: "" },
  ];

  for (const card of cards) {
    box.appendChild(
      el("div", { class: `stat ${card.tone}` }, [
        el("div", { class: "stat-value", text: arNumber(card.value) }),
        el("div", { class: "stat-label", text: card.label }),
      ]),
    );
  }

  $("tab-queue-count").textContent = data.pendingListings
    ? arNumber(data.pendingListings)
    : "";
  $("tab-reports-count").textContent = data.openReports
    ? arNumber(data.openReports)
    : "";
}

/* ------------------------------------------------------- طابور المراجعة */

const REJECT_PRESETS = [
  "الصور غير واضحة أو لا تخصّ الإعلان",
  "السعر غير حقيقي",
  "الإعلان في القسم الخطأ",
  "الوصف ناقص، اكتب تفاصيل السلعة",
  "لا تكتب رقم تواصل داخل الوصف",
  "سلعة ممنوع بيعها",
  "إعلان مكرر",
];

async function loadQueue() {
  const data = await call("/admin/listings/pending?limit=60");
  state.queue = data.listings;
  state.index = 0;
  renderQueue();
}

function renderQueue() {
  const view = $("view-queue");
  clear(view);

  if (state.queue.length === 0) {
    view.appendChild(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-big", text: "✓" }),
        el("div", { text: "الطابور فاضي. ما بقى إعلان ينتظر." }),
      ]),
    );
    return;
  }

  if (state.index >= state.queue.length) state.index = state.queue.length - 1;
  const listing = state.queue[state.index];

  view.appendChild(
    el("div", { class: "queue-head" }, [
      el("span", {
        text: `${arNumber(state.index + 1)} من ${arNumber(state.queue.length)}`,
      }),
      el("span", { class: "keys" }, [
        el("span", { class: "kbd", text: "A" }),
        el("span", { text: " وافق " }),
        el("span", { class: "kbd", text: "R" }),
        el("span", { text: " ارفض " }),
        el("span", { class: "kbd", text: "→ ←" }),
        el("span", { text: " تنقّل" }),
      ]),
    ]),
  );

  const card = el("div", { class: "card" });

  if (listing.images.length > 0) {
    const strip = el("div", { class: "shots" });
    for (const src of listing.images) {
      strip.appendChild(
        el("img", {
          class: "shot",
          src,
          alt: "صورة الإعلان",
          loading: "lazy",
          onclick: () => openLightbox(src),
        }),
      );
    }
    card.appendChild(strip);
  } else {
    card.appendChild(
      el("div", {
        class: "no-shots",
        text: "بلا صور. إعلان بلا صورة نادراً ما يكون جدّياً.",
      }),
    );
  }

  card.appendChild(el("h2", { class: "title", text: listing.title }));
  card.appendChild(
    el("div", { class: "price", text: priceLabel(listing.priceIqd) }),
  );

  if (listing.description) {
    card.appendChild(el("div", { class: "desc", text: listing.description }));
  }

  const meta = el("div", { class: "meta" }, [
    el("span", { class: "chip", text: listing.categoryNameAr }),
    el("span", { class: "chip", text: listing.cityNameAr }),
    el("span", {
      class: "chip",
      text: listing.condition === "new" ? "جديد" : "مستعمل",
    }),
    el("span", { class: "chip", text: timeAgo(listing.createdAt) }),
    el("span", { class: "chip chip-ltr", text: `#${arPlain(listing.refNo)}` }),
  ]);

  meta.appendChild(
    el("span", {
      class: "chip",
      text: `البائع: ${listing.sellerName}`,
    }),
  );
  meta.appendChild(
    el("span", { class: "chip chip-ltr", text: arPlain(listing.sellerPhone) }),
  );

  card.appendChild(meta);

  card.appendChild(
    el("div", { class: "actions" }, [
      el("button", {
        class: "btn btn-success",
        text: "وافق وانشر",
        onclick: () => approve(listing),
      }),
      el("button", {
        class: "btn btn-danger",
        text: "ارفض",
        onclick: () => promptReject(listing),
      }),
      el("button", {
        class: "btn btn-ghost",
        text: "احظر البائع",
        onclick: () => promptBan(listing.sellerId, listing.sellerName),
      }),
      el("button", {
        class: "btn btn-ghost",
        text: "لاحقاً",
        onclick: () => step(1),
      }),
    ]),
  );

  view.appendChild(card);
}

/**
 * يزيح البطاقة المعالَجة من الطابور محلياً بدل إعادة تحميل القائمة كلها.
 *
 * حين تفرغ النسخة المحلية نعيد التحميل من الخادم: نجلب ستين إعلاناً في
 * المرة، ولو اكتفينا بالقائمة المحلية لظهرت «الطابور فاضي» بعد الستين
 * الأولى بينما مئة إعلان لا تزال تنتظر. المشرف يصدّقها ويمشي.
 */
async function drop(id) {
  state.queue = state.queue.filter((item) => item.id !== id);
  if (state.index >= state.queue.length) {
    state.index = Math.max(0, state.queue.length - 1);
  }

  if (state.queue.length === 0) {
    try {
      await loadQueue();
    } catch {
      renderQueue();
    }
  } else {
    renderQueue();
  }

  void refreshStats();
}

function step(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.queue.length) return;
  state.index = next;
  renderQueue();
}

async function approve(listing) {
  try {
    await call(`/admin/listings/${listing.id}/approve`, { method: "POST" });
    toast("اننشر الإعلان");
    await drop(listing.id);
  } catch (error) {
    /**
     * مشرفان على نفس الطابور.
     *
     * الخادم يوافق على الحالة pending وحدها، فالثاني يستلم not_pending.
     * هذا ليس خطأً يستحق تحذيراً أحمر: نزيح البطاقة ونكمل.
     */
    if (error.code === "not_pending") {
      toast("راجعه مشرف ثاني قبلك");
      await drop(listing.id);
      return;
    }
    toast(error.message, true);
  }
}

function promptReject(listing) {
  openModal({
    title: "رفض الإعلان",
    subtitle: listing.title,
    presets: REJECT_PRESETS,
    confirmText: "ارفض وأبلغه",
    onConfirm: async (reason) => {
      try {
        await call(`/admin/listings/${listing.id}/reject`, {
          method: "POST",
          body: { reason },
        });
        toast("انرفض ووصله السبب");
        await drop(listing.id);
      } catch (error) {
        toast(error.message, true);
      }
    },
  });
}

const BAN_PRESETS = [
  "احتيال على المشترين",
  "إعلانات وهمية متكررة",
  "محتوى مسيء",
  "انتحال هوية",
  "مخالفة شروط الاستخدام",
];

function promptBan(userId, name, afterBan) {
  openModal({
    title: "حظر الحساب",
    subtitle: `${name} — يُسحب من التطبيق فوراً وتُخفى إعلاناته`,
    presets: BAN_PRESETS,
    confirmText: "احظر",
    onConfirm: async (reason) => {
      try {
        await call(`/admin/users/${userId}/ban`, {
          method: "POST",
          body: { reason },
        });
        toast("انحظر الحساب");
        if (afterBan) await afterBan();
        else await Promise.all([loadQueue(), refreshStats()]);
      } catch (error) {
        toast(error.message, true);
      }
    },
  });
}

/* ------------------------------------------------------------- البلاغات */

async function loadReports() {
  const data = await call("/admin/reports?limit=60");
  state.reports = data.reports;
  renderReports();
}

function renderReports() {
  const view = $("view-reports");
  clear(view);

  if (state.reports.length === 0) {
    view.appendChild(
      el("div", { class: "empty" }, [
        el("div", { class: "empty-big", text: "✓" }),
        el("div", { text: "ما في بلاغ مفتوح." }),
      ]),
    );
    return;
  }

  const kinds = { listing: "إعلان", user: "مستخدم", message: "رسالة" };

  for (const report of state.reports) {
    const card = el("div", { class: "card" });

    const head = el("div", { class: "report-head" }, [
      el("span", { class: "report-reason", text: report.reasonAr }),
      el("span", {
        class: "chip",
        text: `على ${kinds[report.targetType] || report.targetType}`,
      }),
      el("span", { class: "chip", text: timeAgo(report.createdAt) }),
    ]);

    /**
     * عدد البلاغات على نفس الهدف.
     *
     * خمسة بلاغات على إعلان واحد إشارة أقوى بكثير من خمسة بلاغات متفرقة،
     * فنُبرزها بدل دفنها في القائمة.
     */
    if (report.reportsOnTarget > 1) {
      head.appendChild(
        el("span", {
          class: "chip chip-bad",
          text: `${arNumber(report.reportsOnTarget)} بلاغات على نفس الهدف`,
        }),
      );
    }

    card.appendChild(head);

    if (report.note) {
      card.appendChild(el("div", { class: "note", text: report.note }));
    }

    const targetBox = el("div", {});
    card.appendChild(targetBox);

    const actions = el("div", { class: "actions" }, [
      el("button", {
        class: "btn btn-ghost",
        text: "افحص الهدف",
        onclick: (event) => {
          event.currentTarget.disabled = true;
          void inspect(report, targetBox);
        },
      }),
      el("button", {
        class: "btn btn-primary",
        text: "عولج",
        onclick: () => resolve(report.id, "actioned"),
      }),
      el("button", {
        class: "btn btn-ghost",
        text: "بلا مخالفة",
        onclick: () => resolve(report.id, "dismissed"),
      }),
    ]);

    card.appendChild(actions);
    view.appendChild(card);
  }
}

async function inspect(report, box) {
  clear(box);
  box.appendChild(el("div", { class: "target", text: "نجيب الهدف…" }));

  let data;
  try {
    data = await call(`/admin/reports/${report.id}/target`);
  } catch (error) {
    clear(box);
    box.appendChild(el("div", { class: "error-box", text: error.message }));
    return;
  }

  clear(box);
  const target = el("div", { class: "target" });

  if (data.kind === "missing") {
    target.appendChild(
      el("div", { text: "الهدف انحذف. أغلق البلاغ بلا إجراء." }),
    );
  } else if (data.kind === "listing") {
    const listing = data.listing;

    if (listing.images.length > 0) {
      const strip = el("div", { class: "shots" });
      for (const src of listing.images) {
        strip.appendChild(
          el("img", {
            class: "shot",
            src,
            alt: "صورة الإعلان",
            loading: "lazy",
            onclick: () => openLightbox(src),
          }),
        );
      }
      target.appendChild(strip);
    }

    target.appendChild(el("div", { class: "title", text: listing.title }));
    target.appendChild(
      el("div", { class: "price", text: priceLabel(listing.priceIqd) }),
    );

    if (listing.description) {
      target.appendChild(el("div", { class: "desc", text: listing.description }));
    }

    const statusLabels = {
      published: "منشور",
      pending: "بانتظار المراجعة",
      rejected: "مرفوض",
      expired: "منتهي",
      sold: "مباع",
      draft: "مسودّة",
      deleted: "محذوف",
    };

    target.appendChild(
      el("div", { class: "meta" }, [
        el("span", {
          class: listing.status === "published" ? "chip chip-warn" : "chip",
          text: statusLabels[listing.status] || listing.status,
        }),
        el("span", { class: "chip", text: listing.categoryNameAr }),
        el("span", { class: "chip", text: listing.cityNameAr }),
        el("span", { class: "chip", text: `البائع: ${listing.sellerName}` }),
        el("span", {
          class: "chip chip-ltr",
          text: arPlain(listing.sellerPhone),
        }),
      ]),
    );

    const buttons = [];

    // الإخفاء لا معنى له لإعلان مخفي أصلاً
    if (listing.status === "published" || listing.status === "pending") {
      buttons.push(
        el("button", {
          class: "btn btn-danger",
          text: "أخفِ الإعلان",
          onclick: () =>
            openModal({
              title: "إخفاء الإعلان",
              subtitle: listing.title,
              presets: REJECT_PRESETS,
              confirmText: "أخفِه",
              onConfirm: async (reason) => {
                try {
                  await call(`/admin/listings/${listing.id}/takedown`, {
                    method: "POST",
                    body: { reason },
                  });
                  // الإخفاء يعني أن البلاغ صحيح، فنغلقه معه بلا نقرة ثانية
                  await resolve(report.id, "actioned");
                  toast("انخفى الإعلان وانغلق البلاغ");
                } catch (error) {
                  toast(error.message, true);
                }
              },
            }),
        }),
      );
    }

    if (!listing.sellerBanned) {
      buttons.push(
        el("button", {
          class: "btn btn-ghost",
          text: "احظر البائع",
          onclick: () =>
            promptBan(listing.sellerId, listing.sellerName, async () => {
              await resolve(report.id, "actioned");
            }),
        }),
      );
    }

    if (buttons.length > 0) {
      target.appendChild(el("div", { class: "actions" }, buttons));
    }
  } else if (data.kind === "user") {
    const user = data.user;

    target.appendChild(el("div", { class: "user-name", text: user.name }));
    target.appendChild(
      el("div", { class: "meta" }, [
        el("span", { class: "chip chip-ltr", text: arPlain(user.phone) }),
        el("span", {
          class: "chip chip-ltr",
          text: `#${arPlain(user.publicId)}`,
        }),
        el("span", {
          class: "chip",
          text: `${arNumber(user.publishedListings)} إعلان منشور`,
        }),
        el("span", { class: "chip", text: `مسجّل ${timeAgo(user.createdAt)}` }),
        user.isBanned
          ? el("span", { class: "chip chip-bad", text: "محظور" })
          : null,
      ]),
    );

    if (!user.isBanned) {
      target.appendChild(
        el("div", { class: "actions" }, [
          el("button", {
            class: "btn btn-danger",
            text: "احظر الحساب",
            onclick: () =>
              promptBan(user.id, user.name, async () => {
                await resolve(report.id, "actioned");
              }),
          }),
        ]),
      );
    }
  } else if (data.kind === "message") {
    target.appendChild(
      el("div", {
        class: "msg-who",
        text: "الرسالة المُبلَّغ عنها وما حولها فقط",
      }),
    );

    for (const message of data.messages) {
      const isTarget = message.id === data.reportedId;
      target.appendChild(
        el("div", { class: isTarget ? "msg msg-hot" : "msg" }, [
          el("div", {
            class: "msg-who",
            text: `${message.senderName} · ${timeAgo(message.createdAt)}`,
          }),
          el("div", { class: "msg-body", text: message.body }),
        ]),
      );
    }

    const sender = data.messages.find((m) => m.id === data.reportedId);
    if (sender) {
      target.appendChild(
        el("div", { class: "actions" }, [
          el("button", {
            class: "btn btn-danger",
            text: "احظر المُرسل",
            onclick: () =>
              promptBan(sender.senderId, sender.senderName, async () => {
                await resolve(report.id, "actioned");
              }),
          }),
        ]),
      );
    }
  }

  box.appendChild(target);
}

async function resolve(id, action) {
  try {
    await call(`/admin/reports/${id}/resolve`, {
      method: "POST",
      body: { action },
    });
    state.reports = state.reports.filter((report) => report.id !== id);
    renderReports();
    void refreshStats();
    toast(action === "actioned" ? "انغلق البلاغ" : "انغلق بلا مخالفة");
  } catch (error) {
    toast(error.message, true);
  }
}

/* ----------------------------------------------------------- المستخدمون */

async function searchUsers() {
  const q = $("user-q").value.trim();
  const data = await call(
    `/admin/users?limit=40${q ? `&q=${encodeURIComponent(q)}` : ""}`,
  );
  state.users = data.users;
  renderUsers();
}

function renderUsers() {
  const box = $("user-results");
  clear(box);

  if (state.users.length === 0) {
    box.appendChild(el("div", { class: "empty", text: "ما لكينا أحد." }));
    return;
  }

  const roles = { admin: "مدير", moderator: "مشرف" };

  for (const user of state.users) {
    const row = el("div", { class: "user-row" });

    const main = el("div", { class: "user-main" }, [
      el("div", { class: "user-name", text: user.name }),
      el("div", {
        class: "user-sub",
        text: `${arPlain(user.phone || user.email || "—")}  ·  #${arPlain(
          user.publicId,
        )}`,
      }),
    ]);

    row.appendChild(main);

    if (roles[user.role]) {
      row.appendChild(el("span", { class: "chip", text: roles[user.role] }));
    }

    if (user.isBanned) {
      row.appendChild(
        el("span", {
          class: "chip chip-bad",
          text: user.banReason ? `محظور: ${user.banReason}` : "محظور",
        }),
      );
      row.appendChild(
        el("button", {
          class: "btn btn-ghost btn-sm",
          text: "فكّ الحظر",
          onclick: async () => {
            try {
              await call(`/admin/users/${user.id}/unban`, { method: "POST" });
              toast("انفكّ الحظر. إعلاناته تبقى مرفوضة حتى يعيد نشرها.");
              await Promise.all([searchUsers(), refreshStats()]);
            } catch (error) {
              toast(error.message, true);
            }
          },
        }),
      );
    } else {
      row.appendChild(
        el("button", {
          class: "btn btn-danger btn-sm",
          text: "احظر",
          onclick: () =>
            promptBan(user.id, user.name, async () => {
              await Promise.all([searchUsers(), refreshStats()]);
            }),
        }),
      );
    }

    box.appendChild(row);
  }
}

/* ------------------------------------------------------------- التبويب */

async function openTab(name) {
  state.tab = name;

  for (const tab of document.querySelectorAll(".tab")) {
    tab.classList.toggle("is-on", tab.dataset.tab === name);
  }
  for (const view of document.querySelectorAll(".view")) {
    view.hidden = view.id !== `view-${name}`;
  }

  try {
    if (name === "queue") await loadQueue();
    else if (name === "reports") await loadReports();
    else if (name === "users" && state.users.length === 0) await searchUsers();
  } catch (error) {
    const view = $(`view-${name}`);
    clear(view);
    view.appendChild(el("div", { class: "error-box", text: error.message }));
  }
}

/* ------------------------------------------------------------- الإقلاع */

async function start() {
  $("gate").hidden = true;
  $("panel").hidden = false;

  const me = await call("/auth/me");
  $("who").textContent = me.user ? me.user.name : "";

  await refreshStats();
  await openTab("queue");
}

function bind() {
  $("send-code").addEventListener("click", () => void requestCode());
  $("verify-code").addEventListener("click", () => void verifyCode());
  $("back-to-phone").addEventListener("click", showGate);
  $("signout").addEventListener("click", signOut);

  $("phone").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void requestCode();
  });
  $("code").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void verifyCode();
  });

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => void openTab(tab.dataset.tab));
  }

  $("user-search").addEventListener("click", () => void searchUsers());
  $("user-q").addEventListener("keydown", (event) => {
    if (event.key === "Enter") void searchUsers();
  });

  $("modal-cancel").addEventListener("click", closeModal);
  $("modal-confirm").addEventListener("click", () => void submitModal());
  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) closeModal();
  });

  $("lightbox").addEventListener("click", () => {
    $("lightbox").hidden = true;
  });

  document.addEventListener("keydown", onKey);
}

/**
 * اختصارات الطابور.
 *
 * مراجعة مئة إعلان باليوم بالفأرة وحدها بطيئة. نقرأ event.code لا
 * event.key عمداً: المشرف يكتب أسباب الرفض بالعربية، ولوحته على التخطيط
 * العربي تُخرج «ش» من مفتاح A. الرمز يتجاهل التخطيط ويصف المفتاح نفسه.
 */
function onKey(event) {
  if (!$("lightbox").hidden) {
    if (event.key === "Escape") $("lightbox").hidden = true;
    return;
  }

  if (!$("modal").hidden) {
    if (event.key === "Escape") closeModal();
    // Ctrl+Enter يؤكّد، فالسبب حقل متعدّد الأسطر وEnter وحده سطر جديد
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      void submitModal();
    }
    return;
  }

  if ($("panel").hidden || state.tab !== "queue") return;

  // لا نخطف المفاتيح والمشرف يكتب في حقل
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const listing = state.queue[state.index];
  if (!listing) return;

  if (event.code === "KeyA") {
    event.preventDefault();
    void approve(listing);
  } else if (event.code === "KeyR") {
    event.preventDefault();
    promptReject(listing);
  } else if (event.code === "ArrowLeft") {
    // في واجهة من اليمين لليسار، التالي إلى اليسار
    event.preventDefault();
    step(1);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    step(-1);
  }
}

async function boot() {
  bind();

  if (!token) {
    showGate();
    return;
  }

  try {
    await start();
  } catch {
    // رمز محفوظ لم يعد صالحاً أو حساب فقد صلاحيته
    signOut();
  }
}

void boot();
