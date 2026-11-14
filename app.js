// 1) Isi dua nilai ini dari Supabase: Project Settings > API.
const SUPABASE_URL = "https://guagqblvxndsbstlpdqj.supabase.co";
const VAPID_PUBLIC_KEY = "BFkSrY3YF4yFY69nrImCy1UaJ_laltbZhreLiY7kdenv3vI-tBYKbIFfaAxC26n3purUoTbefql0glhbKU5rIgk";
const SUPABASE_ANON_KEY = "sb_publishable_fdiGfQ7sKfR4FyfKiYwSOw_CpeaR-TU";
const BUCKET = "starbintangv2-media";
const TABLE = "memories";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
let allMedia = [];
// IDENTITAS PERANGKAT ANONIM
function getDeviceId() {
  let deviceId = localStorage.getItem("starbintang_device_id");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem("starbintang_device_id", deviceId);
  }

  return deviceId;
}

// DETEKSI APLIKASI TERINSTAL
function getInstallStatus() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  return {
    installed: standalone,
    display_mode: standalone ? "standalone" : "browser"
  };
}

// LOGIN ANONIM DAN CATAT PERANGKAT
async function registerDevice() {
  if (!db) return;

  try {
    let { data: { session } } = await db.auth.getSession();

    if (!session) {
      const { data, error } = await db.auth.signInAnonymously();

      if (error) throw error;
      session = data.session;
    }

    if (!session) throw new Error("Sesi anonim tidak tersedia.");

    const deviceId = getDeviceId();
    const installStatus = getInstallStatus();

    const { error } = await db.functions.invoke("save-subscription", {
      body: {
        device_id: deviceId,
        installed: installStatus.installed,
        display_mode: installStatus.display_mode
      }
    });

    if (error) throw error;

    console.log("Perangkat berhasil dicatat.");
  } catch (error) {
    console.error("Gagal mencatat perangkat:", error);
  }
}
// KONVERSI VAPID PUBLIC KEY
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }

  return output;
}
// AKTIFKAN NOTIFIKASI STARBINTANG
async function enablePushNotifications() {
  const status = $("notificationStatus");
  const button = $("enableNotificationsButton");

  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Browser ini belum mendukung Push Notification.");
    }

    if (!db) {
      throw new Error("Supabase belum terhubung.");
    }

    if (Notification.permission === "denied") {
      throw new Error("Izin notifikasi diblokir. Periksa pengaturan browser.");
    }

    button.disabled = true;
    status.textContent = "Memproses...";

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Izin notifikasi belum diberikan.");
    }

    const { data: { session } } = await db.auth.getSession();

    if (!session) {
      throw new Error("Sesi anonim belum tersedia. Muat ulang halaman.");
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const installStatus = getInstallStatus();

    const { error } = await db.functions.invoke("save-subscription", {
      body: {
        device_id: getDeviceId(),
        subscription: subscription.toJSON(),
        installed: installStatus.installed,
        display_mode: installStatus.display_mode
      }
    });

    if (error) throw error;

    status.textContent = "Notifikasi berhasil diaktifkan!";
    button.textContent = "✓ Notifikasi Aktif";
  } catch (error) {
    console.error("Push notification error:", error);
    status.textContent = error.message || "Gagal mengaktifkan notifikasi.";
  } finally {
    button.disabled = false;
  }
}
// EVENT TOMBOL AKTIFKAN NOTIFIKASI
document.addEventListener("DOMContentLoaded", () => {
  const button = $("enableNotificationsButton");

  if (button) {
    button.addEventListener("click", enablePushNotifications);
  }
});

function setStatus(message) { $("statusLine").textContent = message; }
function safeName(name) { return name.replace(/[^\w.-]+/g, "_").slice(-90); }
function isVideo(type) { return (type || "").startsWith("video/"); }

async function loadGallery() {
  if (!db) {
    setStatus("Mode pratinjau: hubungkan Supabase untuk galeri publik dan upload online.");
    $("emptyState").hidden = false;
    $("emptyState").querySelector("h3").textContent = "Galeri belum terhubung";
    $("emptyState").querySelector("p").textContent = "Ikuti README untuk menghubungkan database dan penyimpanan online.";
    return;
  }
  setStatus("Memuat kenangan...");
  const { data, error } = await db.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) { setStatus("Gagal memuat galeri: " + error.message); return; }
  allMedia = data || [];
  renderGallery(allMedia);
  setStatus(`${allMedia.length} kenangan tersedia untuk dilihat publik.`);
}
function renderGallery(items) {
  const grid = $("galleryGrid"); grid.innerHTML = "";
  $("emptyState").hidden = items.length !== 0;
  for (const item of items) {
    const card = document.createElement("article"); card.className = "media-card";
    const thumb = document.createElement("div"); thumb.className = "thumb";
    if (isVideo(item.mime_type)) {
      const video = document.createElement("video"); video.src = item.public_url; video.muted = true; video.preload = "metadata"; video.playsInline = true; thumb.append(video);
      const play = document.createElement("span"); play.className = "video-thumb"; play.textContent = "▶"; thumb.append(play);
    } else {
      const img = document.createElement("img"); img.src = item.public_url; img.alt = item.title || "Kenangan"; img.loading = "lazy"; thumb.append(img);
    }
    const info = document.createElement("div"); info.className = "media-info";
    const words = document.createElement("div"); const title = document.createElement("h3"); title.textContent = item.title || item.file_name || "Kenangan";
    const date = document.createElement("p"); date.textContent = item.memory_date || new Date(item.created_at).toLocaleDateString("id-ID");
    words.append(title, date);
    const type = document.createElement("span"); type.className = "media-type"; type.textContent = isVideo(item.mime_type) ? "VIDEO" : "FOTO";
    info.append(words, type); card.append(thumb, info);
    card.addEventListener("click", () => openViewer(item)); grid.append(card);
  }
}
function openViewer(item) {
  const holder = $("viewerContent"); holder.innerHTML = "";
  let media;
  if (isVideo(item.mime_type)) { media = document.createElement("video"); media.controls = true; media.autoplay = true; }
  else { media = document.createElement("img"); media.alt = item.title || "Kenangan"; }
  media.src = item.public_url; holder.append(media);
  $("viewerTitle").textContent = item.title || item.file_name || "Kenangan";
  $("downloadLink").href = item.public_url;
  $("downloadLink").setAttribute("download", item.file_name || "kenangan");
  $("viewerModal").classList.add("open"); $("viewerModal").setAttribute("aria-hidden", "false");
}
function closeViewer() {
  $("viewerModal").classList.remove("open"); $("viewerModal").setAttribute("aria-hidden", "true");
  const v = $("viewerContent").querySelector("video"); if (v) v.pause();
}
$("closeViewer").addEventListener("click", closeViewer);
$("viewerModal").addEventListener("click", e => { if (e.target === $("viewerModal")) closeViewer(); });
$("authButton").textContent = "Upload bebas";
$("authButton").addEventListener("click", () => $("fileInput").click());
$("uploadButton").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async e => {
  const file = e.target.files[0]; if (!file || !db) return;
  const allowed = file.type.startsWith("image/") || file.type.startsWith("video/");
  if (!allowed) { alert("Pilih file foto atau video."); e.target.value = ""; return; }
  const max = file.type.startsWith("video/") ? 100 * 1024 * 1024 : 15 * 1024 * 1024;
  if (file.size > max) { alert("Ukuran terlalu besar. Batas foto 15 MB dan video 100 MB."); e.target.value = ""; return; }
  const title = prompt("Judul kenangan:", file.name.replace(/\.[^.]+$/, "")) || file.name;
  setStatus("Mengunggah " + file.name + "...");
  const path = `public/${Date.now()}_${safeName(file.name)}`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) { setStatus("Upload gagal: " + uploadError.message); e.target.value = ""; return; }
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
  const { error: insertError } = await db.from(TABLE).insert({
    title, memory_date: new Date().toISOString().slice(0, 10), public_url: urlData.publicUrl,
    file_name: file.name, mime_type: file.type, storage_path: path
  });
  if (insertError) {
    await db.storage.from(BUCKET).remove([path]);
    setStatus("File terunggah tetapi data gagal disimpan: " + insertError.message);
  } else { setStatus("Upload berhasil!"); await loadGallery(); }
  e.target.value = "";
});
$("searchInput").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  renderGallery(allMedia.filter(x => `${x.title || ""} ${x.file_name || ""}`.toLowerCase().includes(q)));
});
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeViewer(); $("authModal").classList.remove("open"); } });

(async function init() {
  if (!configured) {
    await loadGallery();
    return;
  }

  await loadGallery();
  await registerDevice();
})();

/* ==========================================
   STARBINTANG V2 — 3D INTERACTIONS
   ========================================== */

document.addEventListener("DOMContentLoaded", () => {

  // 1. 3D TILT EFFECT
  const gallery = document.getElementById("galleryGrid");

  if (gallery) {
    gallery.addEventListener("pointermove", (event) => {
      if (window.innerWidth <= 600) return;
      if (event.pointerType === "touch") return;

      const card = event.target.closest(".media-card");
      if (!card) return;

      const rect = card.getBoundingClientRect();

      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      const rotateY = (x - 0.5) * 12;
      const rotateX = (0.5 - y) * 12;

      card.style.setProperty("--tilt-x", `${rotateX}deg`);
      card.style.setProperty("--tilt-y", `${rotateY}deg`);
    });

    gallery.addEventListener("pointerleave", () => {
      gallery.querySelectorAll(".media-card").forEach(card => {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
      });
    }, true);
  }

  // 2. MOBILE FLOATING DOCK
if (window.innerWidth <= 600 &&
    !document.querySelector(".mobile-dock")) {

  const dock = document.createElement("nav");
  dock.className = "mobile-dock";
  dock.setAttribute("aria-label", "Navigasi utama");

  dock.innerHTML = `
    <a href="#" aria-label="Beranda">
      <span class="dock-icon">⌂</span>
      <span>Home</span>
    </a>

    <a href="#galeri" aria-label="Galeri">
      <span class="dock-icon">▦</span>
      <span>Galeri</span>
    </a>

    <a href="game.html" aria-label="Game">
      <span class="dock-icon">🎮</span>
      <span>Game</span>
    </a>

    <button class="dock-upload" type="button" aria-label="Upload media">
      <span class="dock-icon">＋</span>
      <span>Upload</span>
    </button>

    <a href="#tentang" aria-label="Tentang">
      <span class="dock-icon">✦</span>
      <span>Tentang</span>
    </a>
  `;

  document.body.appendChild(dock);

  const uploadButton = document.getElementById("uploadButton");
  const dockUpload = dock.querySelector(".dock-upload");

  if (uploadButton && dockUpload) {
    dockUpload.addEventListener("click", () => {
      uploadButton.click();
    });
  }
}
  
});

/* =====================================
   STARBINTANG — SINGLE LIQUID NAVIGATION
===================================== */

(function () {
  function initNavigation() {
    const dock = document.querySelector(".mobile-dock");

    if (!dock || dock.dataset.navigationReady === "true") return;
    dock.dataset.navigationReady = "true";

    const items = [...dock.querySelectorAll("a, .dock-upload")];
    const uploadButton = document.getElementById("uploadButton");

    const sections = [
      document.querySelector(".hero"),
      document.querySelector("#galeri"),
      null,
      null,
      document.querySelector("#tentang")
    ];

    if (items.length !== 5) {
      console.warn("StarBintang: jumlah item navigasi tidak sesuai.");
      return;
    }

    const bubble = document.createElement("div");
    bubble.className = "liquid-bubble";
    dock.appendChild(bubble);

    let activeIndex = 0;
    let pointerStart = null;
    let dragIndex = -1;
    let dragged = false;
    let suppressClick = false;

    function moveBubble(index) {
      if (index < 0 || index >= items.length) return;

      const rect = items[index].getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();

      bubble.style.left =
        (rect.left + rect.width / 2 - dockRect.left) + "px";

      bubble.style.top =
        (rect.top + rect.height / 2 - dockRect.top) + "px";

      items.forEach((item, i) => {
        item.classList.toggle("bubble-active", i === index);
      });
    }

    function setActive(index) {
      if (index < 0 || index >= items.length) return;

      activeIndex = index;
      dock.style.setProperty("--active-index", index);

      items.forEach((item, i) => {
        item.classList.toggle("active", i === index);
      });

      moveBubble(index);
    }

    function activate(index) {
      if (index < 0 || index >= items.length) return;

      setActive(index);

      if (index === 3) {
        if (uploadButton) uploadButton.click();
        return;
      }

      if (index === 2) {
        window.location.href = "game.html";
        return;
      }

      if (index === 0) {
        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
        return;
      }

      const section = sections[index];

      if (section) {
        section.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    }

    setActive(0);

    // Klik navigasi biasa
    items.forEach((item, index) => {
      item.addEventListener("click", event => {
        if (suppressClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        if (index === 2) return;

        event.preventDefault();
        activate(index);
      });
    });

    // Deteksi posisi item ketika disentuh
    function getIndex(x, y) {
      return items.findIndex(item => {
        const rect = item.getBoundingClientRect();

        return (
          x >= rect.left - 8 &&
          x <= rect.right + 8 &&
          y >= rect.top - 8 &&
          y <= rect.bottom + 8
        );
      });
    }

    // Mulai sentuhan
    dock.addEventListener("pointerdown", event => {
      const item = event.target.closest("a, .dock-upload");

      if (!item || !dock.contains(item)) return;

      pointerStart = {
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId
      };

      dragIndex = items.indexOf(item);
      dragged = false;

      bubble.classList.add("visible");
      moveBubble(dragIndex);
    });

    // Geser bubble
    dock.addEventListener("pointermove", event => {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;

      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;

      if (!dragged && Math.hypot(dx, dy) > 9) {
        dragged = true;
        dock.classList.add("dragging-dock");
        bubble.classList.add("dragging");

        try {
          dock.setPointerCapture(event.pointerId);
        } catch (_) {}
      }

      if (!dragged) return;

      event.preventDefault();

      const index = getIndex(event.clientX, event.clientY);

      if (index >= 0) {
        dragIndex = index;
        moveBubble(index);
      }
    });

    // Selesaikan sentuhan atau drag
    function finishPointer(event) {
      if (!pointerStart || pointerStart.id !== event.pointerId) return;

      const wasDragged = dragged;
      const finalIndex = dragIndex;

      pointerStart = null;
      dragged = false;

      dock.classList.remove("dragging-dock");
      bubble.classList.remove("dragging");

      if (wasDragged && finalIndex >= 0) {
        suppressClick = true;
        activate(finalIndex);

        setTimeout(() => {
          suppressClick = false;
        }, 350);
      }

      setTimeout(() => {
        bubble.classList.remove("visible");
      }, 300);
    }

    dock.addEventListener("pointerup", finishPointer);
    dock.addEventListener("pointercancel", finishPointer);

    // Perbarui menu sesuai posisi scroll
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visible.length) return;

      const section = visible[0].target;
      const index = sections.indexOf(section);

      if (index >= 0) setActive(index);
    }, {
      threshold: [0.2, 0.4, 0.6],
      rootMargin: "-15% 0px -35% 0px"
    });

    sections.forEach(section => {
      if (section) observer.observe(section);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNavigation);
  } else {
    initNavigation();
  }
})();

/* =====================================
   STARBINTANG INTRO + MODE SELECTOR
===================================== */

(function () {
  const intro = document.getElementById("starIntro");
  const skip = document.getElementById("skipIntro");

  const modeGate = document.getElementById("modeGate");
  const userButton = document.getElementById("userModeButton");
  const adminButton = document.getElementById("adminModeButton");

  // Tampilkan pilihan USER / ADMIN
  function showModeGate() {
    if (modeGate) {
      modeGate.hidden = false;
    }
  }

  // Pilihan USER: masuk ke galeri utama
  if (userButton) {
    userButton.addEventListener("click", () => {
      modeGate.hidden = true;
    });
  }

  // Pilihan ADMIN: buka halaman admin
  if (adminButton) {
    adminButton.addEventListener("click", () => {
      window.location.href = "https://adminstarbintangv2.pages.dev";
    });
  }

  // Jika elemen intro tidak ditemukan
  if (!intro) {
    showModeGate();
    return;
  }

  let introClosing = false;

  function closeIntro() {
    if (introClosing || !intro.isConnected) return;

    introClosing = true;
    intro.classList.add("intro-exit");

    setTimeout(() => {
      intro.remove();
      showModeGate();
    }, 1100);
  }

  // Intro hanya sekali setiap sesi browser
  if (sessionStorage.getItem("starbintangIntroSeen")) {
    intro.remove();
    showModeGate();
    return;
  }

  sessionStorage.setItem("starbintangIntroSeen", "true");

  // Tombol lewati intro
  if (skip) {
    skip.addEventListener("click", closeIntro);
  }

  // Durasi intro
  setTimeout(closeIntro, 5200);

})();

/* STARBINTANG — PWA SERVICE WORKER */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log(
          "StarBintang PWA aktif:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error("PWA gagal diaktifkan:", error);
      });
  });
}
