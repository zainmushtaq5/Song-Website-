import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const BASE_URL = "http://localhost:8000";
const COVERS_CACHE = "public/downloaded_covers";

if (!fs.existsSync(COVERS_CACHE)) {
  fs.mkdirSync(COVERS_CACHE, { recursive: true });
}

function cleanSearchTerm(title) {
  let clean = title;
  // Remove technical prefixes/suffixes
  clean = clean.replace(/शोभा खोटे और अनंत कुमार का हिंदी गीत/g, "");
  clean = clean.replace(/Classic Hindi Song/gi, "");
  clean = clean.replace(/Lyrical Video|Lyrical Audio|Official Video|Official Audio|Full Song|Full Music Video/gi, "");
  clean = clean.replace(/Video Song/gi, "");
  clean = clean.replace(/NEW TRENDING SONG/gi, "");
  clean = clean.replace(/Dance Performance/gi, "");
  clean = clean.replace(/SGStudio 2025/gi, "");
  clean = clean.replace(/@InsightRewind/gi, "");
  clean = clean.replace(/30Sec/gi, "");
  clean = clean.replace(/\[.*?\]/g, "");
  clean = clean.replace(/\(.*?\)/g, "");
  clean = clean.replace(/–|-/g, " ");
  clean = clean.replace(/_+/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();

  // Extract first 4-5 meaningful words
  const words = clean.split(" ").filter(Boolean);
  return words.slice(0, 4).join(" ");
}

async function searchOnlineArtwork(query) {
  return new Promise((resolve) => {
    const q = encodeURIComponent(query);
    const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=1`;
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.results && parsed.results.length > 0) {
              const item = parsed.results[0];
              const art = item.artworkUrl100
                ? item.artworkUrl100.replace("100x100bb", "600x600bb")
                : null;
              resolve({
                track: item.trackName,
                artist: item.artistName,
                coverUrl: art,
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      })
      .on("error", () => resolve(null));
  });
}

async function downloadImage(url, dest) {
  return new Promise((resolve) => {
    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode !== 200) {
          resolve(false);
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      })
      .on("error", () => resolve(false));
  });
}

async function loginAdmin() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin-smoke@smoketest.example.com",
      password: "password123",
    }),
  });
  if (!res.ok) throw new Error("Admin login failed");
  const data = await res.json();
  return data.access_token;
}

async function updateAllThumbnails() {
  console.log("=== STARTING ONLINE COVER SEARCH & REPLACEMENT ===");
  const token = await loginAdmin();
  console.log("Logged in as Admin.");

  const listRes = await fetch(`${BASE_URL}/api/songs?page_size=50`);
  const songs = await listRes.json();
  console.log(`Fetched ${songs.length} active songs from database.\n`);

  let updatedCount = 0;

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const searchTerm = cleanSearchTerm(song.title);
    console.log(`[${i + 1}/${songs.length}] Searching for: "${searchTerm}" (Original: "${song.title.slice(0, 40)}...")`);

    let chosenResult = await searchOnlineArtwork(searchTerm);
    if (!chosenResult || !chosenResult.coverUrl) {
      console.log(`  -> No online artwork found, trying fallback keywords...`);
      const words = searchTerm.replace(/[^a-zA-Z0-9 ]/g, "").split(" ").filter(Boolean);
      let fallbackResult = null;
      if (words.length >= 2) {
        fallbackResult = await searchOnlineArtwork(words.slice(0, 2).join(" "));
      }
      if (!fallbackResult || !fallbackResult.coverUrl) {
        console.log(`  -> Still no match found, keeping existing.`);
        continue;
      }
      chosenResult = fallbackResult;
    }

    console.log(`  -> Found artwork for "${chosenResult.track}": ${chosenResult.coverUrl.slice(0, 60)}...`);

    const coverDest = path.join(COVERS_CACHE, `${song.id}.jpg`);
    const ok = await downloadImage(chosenResult.coverUrl, coverDest);
    if (!ok) {
      console.log(`  -> Failed to download image.`);
      continue;
    }

    // Now update song in backend via PATCH /api/admin/songs/{id}
    try {
      const coverBuffer = fs.readFileSync(coverDest);
      const formData = new FormData();
      formData.append(
        "cover",
        new Blob([coverBuffer], { type: "image/jpeg" }),
        `cover_${song.id}.jpg`
      );

      const patchRes = await fetch(`${BASE_URL}/api/admin/songs/${song.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (patchRes.ok) {
        console.log(`  -> [SUCCESS] Replaced thumbnail for "${song.title.slice(0, 40)}..."`);
        updatedCount++;
      } else {
        console.log(`  -> [FAIL] Patch returned ${patchRes.status}: ${await patchRes.text()}`);
      }
    } catch (err) {
      console.error(`  -> [ERROR] Failed to patch song:`, err.message);
    }
  }

  console.log(`\n===========================================`);
  console.log(`REPLACEMENT COMPLETE: ${updatedCount}/${songs.length} song thumbnails updated with real online artwork.`);
  console.log(`===========================================`);
}

updateAllThumbnails();
