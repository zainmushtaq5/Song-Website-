import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://localhost:8000";
const SONGS_DIR = "public/songs";
const ICONS_DIR = "public/icons";

function cleanTitle(filename) {
  let name = path.parse(filename).name;
  name = name.replace(/\s*\(\d+k?\)\s*/gi, "");
  name = name.replace(/_+/g, " ");
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/Lyrical Video|Lyrical Audio|Official Video|Official Audio|Full Song|Full Music Video/gi, "");
  name = name.replace(/\s+/g, " ").trim();
  if (name.length > 180) name = name.slice(0, 180).trim();
  return name || "Bollywood Song";
}

function detectGenre(title) {
  const lower = title.toLowerCase();
  if (lower.includes("naat") || lower.includes("qadri") || lower.includes("salam") || lower.includes("nabi") || lower.includes("qasida") || lower.includes("durood")) {
    return "Devotional";
  }
  if (lower.includes("sad") || lower.includes("bewafa") || lower.includes("zalim") || lower.includes("alvida")) {
    return "Bollywood Sad";
  }
  if (lower.includes("dance") || lower.includes("yaarian") || lower.includes("bhangra")) {
    return "Bollywood Dance";
  }
  if (lower.includes("love") || lower.includes("pyaar") || lower.includes("mohabbat") || lower.includes("tere") || lower.includes("meri") || lower.includes("romantic")) {
    return "Bollywood Romantic";
  }
  return "Bollywood";
}

function detectCoverMime(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.slice(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buffer.slice(0, 4).toString() === "RIFF" && buffer.slice(8, 12).toString() === "WEBP") return "image/webp";
  return "image/jpeg";
}

function detectAudioMime(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".wav") return "audio/wav";
  return "audio/mpeg";
}

async function loginAdmin() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin-smoke@smoketest.example.com", password: "password123" }),
  });
  if (!res.ok) throw new Error("Login failed: " + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

async function uploadAll() {
  console.log("=== BULK UPLOADING SONGS & ICONS IN SEQUENCE ===");
  const token = await loginAdmin();
  console.log("Logged in as admin. Ready to upload.");

  const songFiles = fs
    .readdirSync(SONGS_DIR)
    .filter((f) => !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const iconFiles = fs
    .readdirSync(ICONS_DIR)
    .filter((f) => !f.startsWith("."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  console.log(`Found ${songFiles.length} song files and ${iconFiles.length} icon files.\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < songFiles.length; i++) {
    const sFile = songFiles[i];
    const iFile = iconFiles[i % iconFiles.length];

    const sPath = path.join(SONGS_DIR, sFile);
    const iPath = path.join(ICONS_DIR, iFile);

    const sStat = fs.statSync(sPath);
    if (sStat.size < 40000) {
      console.log(`[SKIP ${i + 1}/${songFiles.length}] ${sFile} is too small (${sStat.size} bytes).`);
      continue;
    }

    const title = cleanTitle(sFile);
    const genre = detectGenre(title);

    try {
      const audioBuffer = fs.readFileSync(sPath);
      const coverBuffer = fs.readFileSync(iPath);

      const mimeAudio = detectAudioMime(audioBuffer, sFile);
      const mimeCover = detectCoverMime(coverBuffer);
      const coverExt = mimeCover === "image/jpeg" ? ".jpg" : mimeCover === "image/webp" ? ".webp" : ".png";
      const normalizedCoverName = path.parse(iFile).name + coverExt;

      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", `Original track: ${title} from album collection.`);
      formData.append("genre", genre);
      formData.append("download_allowed", "true");
      formData.append("license_type", "artist_owned");

      formData.append("audio", new Blob([audioBuffer], { type: mimeAudio }), sFile);
      formData.append("cover", new Blob([coverBuffer], { type: mimeCover }), normalizedCoverName);

      const uploadRes = await fetch(`${BASE_URL}/api/songs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error(`[FAIL ${i + 1}/${songFiles.length}] "${title}": ${errText}`);
        failCount++;
        continue;
      }

      const songData = await uploadRes.json();

      // Automatically approve so it's instantly active in public feed
      const approveRes = await fetch(`${BASE_URL}/api/admin/songs/${songData.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (approveRes.ok) {
        console.log(`[PASS ${i + 1}/${songFiles.length}] Uploaded & Approved: "${title}" (Icon: ${iFile} as ${mimeCover})`);
        successCount++;
      } else {
        console.log(`[WARN ${i + 1}/${songFiles.length}] Uploaded (${songData.id}) but approve failed: ${approveRes.status}`);
        successCount++;
      }
    } catch (err) {
      console.error(`[ERROR ${i + 1}/${songFiles.length}] ${sFile}:`, err.message);
      failCount++;
    }
  }

  console.log(`\n===========================================`);
  console.log(`BATCH COMPLETE: ${successCount} uploaded & active, ${failCount} failed/skipped.`);
  console.log(`===========================================`);
}

uploadAll();
