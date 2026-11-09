// 1) Isi dua nilai ini dari Supabase: Project Settings > API.
const SUPABASE_URL = "https://guagqblvxndsbstlpdqj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fdiGfQ7sKfR4FyfKiYwSOw_CpeaR-TU";
const BUCKET = "starbintangv2-media";
const TABLE = "memories";

const configured = SUPABASE_URL.startsWith("https://") && !SUPABASE_ANON_KEY.startsWith("PASTE_");
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
let allMedia = [];

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
  if (!configured) { await loadGallery(); return; }
  await loadGallery();
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
   STARBINTANG — iOS NAVIGATION ENGINE
===================================== */

(function () {

  function initLiquidNavigation() {

    const dock = document.querySelector(".mobile-dock");

    if (!dock || dock.dataset.liquidReady === "true") return;

    dock.dataset.liquidReady = "true";

    const links = [...dock.querySelectorAll("a")];
    const upload = dock.querySelector(".dock-upload");

    const sections = [
      document.querySelector(".hero"),
      document.querySelector(".gallery-section"),
      null,
      document.querySelector(".about")
    ];

    // Sliding active indicator
    function setActive(index) {

      dock.style.setProperty("--active-index", index);

      links.forEach((link, i) => {
        link.classList.toggle("active", i === index);
      });

    }

    setActive(0);

    // Smooth navigation
    links.forEach((link, index) => {

      link.addEventListener("click", function (event) {

        event.preventDefault();

        setActive(index);

        const target = sections[index];

        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        } else if (index === 0) {
          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });
        }

      });

    });

    // Upload button animation
    if (upload) {

      upload.addEventListener("click", function () {

        upload.animate(
          [
            { transform: "scale(1)" },
            { transform: "scale(.82)" },
            { transform: "scale(1.12)" },
            { transform: "scale(1)" }
          ],
          {
            duration: 450,
            easing: "cubic-bezier(.22,1.4,.36,1)"
          }
        );

      });

    }

    // Automatically update selected menu while scrolling
    const observer = new IntersectionObserver(entries => {

      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visible.length) return;

      const index = sections.indexOf(visible[0].target);

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
    document.addEventListener("DOMContentLoaded", initLiquidNavigation);
  } else {
    initLiquidNavigation();
  }

})();

/* LIQUID BUBBLE DRAG NAVIGATION */

(function () {
  function initBubbleNavigation() {
    const dock = document.querySelector(".mobile-dock");
    if (!dock || dock.dataset.bubbleReady) return;

    dock.dataset.bubbleReady = "true";

    const items = [
      ...dock.querySelectorAll("a, .dock-upload")
    ];

    const bubble = document.createElement("div");
    bubble.className = "liquid-bubble";
    dock.appendChild(bubble);

    let dragging = false;
    let activeIndex = 0;

    function getIndex(x, y) {
      const found = items.findIndex(item => {
        const r = item.getBoundingClientRect();
        return x >= r.left - 5 && x <= r.right + 5 &&
               y >= r.top - 5 && y <= r.bottom + 5;
      });
      return found;
    }

    function moveBubble(index) {
      if (index < 0) return;

      const rect = items[index].getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();

      bubble.style.left =
        (rect.left + rect.width / 2 - dockRect.left) + "px";

      bubble.style.top =
        (rect.top + rect.height / 2 - dockRect.top) + "px";

      items.forEach((item, i) => {
        item.classList.toggle("bubble-active", i === index);
      });

      activeIndex = index;
    }

    dock.addEventListener("pointerdown", event => {
      if (event.target.closest("button") &&
          !event.target.closest(".dock-upload")) return;

      const index = getIndex(event.clientX, event.clientY);
      if (index < 0) return;

      dragging = true;
      dock.classList.add("dragging-dock");
      bubble.classList.add("visible", "dragging");

      moveBubble(index);

      try {
        dock.setPointerCapture(event.pointerId);
      } catch (_) {}
    });

    dock.addEventListener("pointermove", event => {
      if (!dragging) return;

      const index = getIndex(event.clientX, event.clientY);
      if (index >= 0) moveBubble(index);
    });

    function finishDrag() {
      if (!dragging) return;

      dragging = false;
      dock.classList.remove("dragging-dock");
      bubble.classList.remove("dragging");

      setTimeout(() => {
        bubble.classList.remove("visible");
      }, 350);

      if (activeIndex === 2) {
        const upload = document.getElementById("uploadButton");
        if (upload) upload.click();
        return;
      }

      const link = items[activeIndex];
      if (link && link.tagName === "A") {
        link.click();
      }
    }

    dock.addEventListener("pointerup", finishDrag);
    dock.addEventListener("pointercancel", finishDrag);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBubbleNavigation);
  } else {
    initBubbleNavigation();
  }
})();

/* =====================================
   STARBINTANG INTRO CONTROLLER
===================================== */

(function () {
  const intro = document.getElementById("starIntro");
  const skip = document.getElementById("skipIntro");

  if (!intro) return;

  function closeIntro() {
    if (!intro.isConnected) return;

    intro.classList.add("intro-exit");

    setTimeout(() => {
      intro.remove();
    }, 1100);
  }

  // Hanya tampil sekali setiap sesi browser
  if (sessionStorage.getItem("starbintangIntroSeen")) {
    intro.remove();
    return;
  }

  sessionStorage.setItem("starbintangIntroSeen", "true");

  // Tombol lewati
  if (skip) {
    skip.addEventListener("click", closeIntro);
  }

  // Durasi intro
  setTimeout(closeIntro, 5200);

})();
