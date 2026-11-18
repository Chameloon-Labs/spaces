// A tiny spots log on window.phone: camera.take, location.once, data.query/exec, haptic, notify.at.
// No build step, no inline script (the page's content security policy allows only files of this app).
const $ = (id) => document.getElementById(id);
let photo = null, thumb = null, place = null, toastTimer = 0;

const PIN = "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z";
const svg = (inner) => { const el = document.createElementNS("http://www.w3.org/2000/svg", "svg"); el.setAttribute("viewBox", "0 0 24 24"); el.setAttribute("aria-hidden", "true"); el.setAttribute("fill", "none"); el.setAttribute("stroke", "currentColor"); el.setAttribute("stroke-width", "1.8"); el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round"); el.innerHTML = inner; return el; };
const pinGlyph = () => svg(`<path d="${PIN}"/><circle cx="12" cy="9.5" r="2.5"/>`);

// "Today, 19:04", "Yesterday, 19:04", "Tomorrow, 19:04", else "12 Nov, 19:04"
// formats follow the phone's own locale and 12/24-hour setting (navigator.language outside Chameloon)
let clock, short, rel;
function formats(info) {
  const locale = info?.locale || navigator.language || "en";
  const opts = { hour: "2-digit", minute: "2-digit" };
  if (typeof info?.hour12 === "boolean") opts.hour12 = info.hour12;
  clock = new Intl.DateTimeFormat(locale, opts);
  short = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
}
formats();
function when(date) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(date) - day(new Date())) / 86400000);
  let label = Math.abs(diff) <= 1 ? rel.format(diff, "day") : short.format(date);
  label = label.charAt(0).toUpperCase() + label.slice(1);
  return `${label}, ${clock.format(date)}`;
}
// SQLite's datetime('now') is UTC without a zone
const parse = (s) => new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z");

// A small JPEG data URL of a photo: the list keeps showing it even if the media file is gone.
async function thumbnail(uri) {
  const bitmap = await createImageBitmap(await phone.file(uri));
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// the confirmation line under the title; it fades out by itself
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  clearTimeout(toastTimer);
  if (text) toastTimer = setTimeout(() => { el.textContent = ""; }, 4000);
}
const note = (text) => { $("status").textContent = text; };
// phone.* rejects with Error.code: Cancelled is the person backing out, not a problem
const fail = (e) => note(e.code === "Cancelled" ? "" : `${e.message}`);

async function load(highlight) {
  const rows = await phone.data.query("SELECT id, name, lat, lon, photo, thumb, created FROM spots ORDER BY created DESC, rowid DESC");
  $("empty").hidden = rows.length > 0;
  $("list").replaceChildren(...rows.map((r) => {
    const li = document.createElement("li");
    if (highlight && r.id === highlight) { li.className = "new"; setTimeout(() => li.classList.remove("new"), 2000); }
    let pic;
    if (r.thumb || r.photo) { pic = Object.assign(document.createElement("img"), { src: r.thumb || r.photo, alt: "" }); }
    else { pic = document.createElement("div"); pic.className = "none"; pic.append(pinGlyph()); }
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = r.name;
    const small = document.createElement("small");
    small.textContent = when(parse(r.created));
    text.append(name, small);
    if (r.lat != null) {
      const where = document.createElement("small");
      where.textContent = `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`;
      text.append(where);
    }
    const remind = document.createElement("button");
    remind.textContent = "Remind me";
    remind.setAttribute("aria-label", `Remind me about ${r.name}`);
    remind.addEventListener("click", async () => {
      try {
        const at = new Date(Date.now() + 24 * 3600 * 1000);
        await phone.notify.at(at, { title: "Back to this spot?", body: r.name, id: `spot-${r.id}` });
        phone.haptic("success");
        remind.textContent = "Reminder set";
        toast(`Reminder set for ${rel.format(1, "day")}, ${clock.format(at)}`);
      } catch (e) { if (e.code !== "Cancelled") toast(e.message); }
    });
    li.append(pic, text, remind);
    return li;
  }));
}

// ---- the sheet
const sheet = $("sheet");
function reset() {
  $("add").reset();
  photo = thumb = place = null;
  $("shot").hidden = true; $("photo").hidden = false;
  $("place").hidden = true; $("place").textContent = "";
  $("err").hidden = true; $("name").removeAttribute("aria-invalid");
  note("");
  $("where").textContent = "Use my location";
  $("photo").textContent = "Take photo";
}
const openSheet = () => { reset(); sheet.showModal(); $("name").focus(); };
$("open").addEventListener("click", openSheet);
$("first").addEventListener("click", openSheet);
$("close").addEventListener("click", () => sheet.close());
sheet.addEventListener("click", (ev) => { if (ev.target === sheet) sheet.close(); }); // the backdrop

async function takePhoto() {
  try {
    const shot = await phone.camera.take();
    photo = shot.uri;
    thumb = await thumbnail(photo).catch(() => null);
    $("preview").src = photo;
    $("shot").hidden = false; $("photo").hidden = true;
    note("");
  } catch (e) { fail(e); }
}
$("photo").addEventListener("click", takePhoto);
$("retake").addEventListener("click", takePhoto);
$("remove").addEventListener("click", () => {
  photo = thumb = null;
  $("shot").hidden = true; $("photo").hidden = false; $("photo").focus();
});

$("where").addEventListener("click", async () => {
  try {
    place = await phone.location.once();
    $("place").textContent = `Location saved: ${place.lat.toFixed(4)}, ${place.lon.toFixed(4)} (within ${Math.round(place.accuracy)} m)`;
    $("place").hidden = false;
    $("where").textContent = "Update location";
    note("");
  } catch (e) { fail(e); }
});

$("name").addEventListener("input", () => { if ($("name").value.trim()) { $("err").hidden = true; $("name").removeAttribute("aria-invalid"); } });

$("add").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("name").value.trim();
  if (!name) { $("err").hidden = false; $("name").setAttribute("aria-invalid", "true"); $("name").focus(); return; }
  try {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
    await phone.data.exec("INSERT INTO spots (id, name, lat, lon, photo, thumb) VALUES (?, ?, ?, ?, ?, ?)", [id, name, place?.lat ?? null, place?.lon ?? null, photo, thumb]);
    phone.haptic("success");
    phone.widget.reload().catch(() => {}); // the Home Screen widget follows
    sheet.close();
    reset();
    toast(`Saved ${name}`);
    await load(id);
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } catch (e) { fail(e); }
});

phone.ready.then(() => phone.info()).then((info) => formats(info), () => {}).then(() => load(), fail);
phone.on("rows", () => load());
