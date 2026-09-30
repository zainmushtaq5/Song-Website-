import urllib.request
import urllib.parse
import json

with open('all_songs.json', 'r', encoding='utf-8') as f:
    songs = json.load(f)

print(f"Total songs to check: {len(songs)}")

def clean_search(title):
    import re
    t = title
    t = t.replace("शोभा खोटे और अनंत कुमार का हिंदी गीत", "")
    t = re.sub(r'Classic Hindi Song|Lyrical Video|Lyrical Audio|Official Video|Official Audio|Full Song|Full Music Video|Video Song|NEW TRENDING SONG|Dance Performance|SGStudio 2025|@InsightRewind|30Sec', '', t, flags=re.I)
    t = re.sub(r'\[.*?\]|\(.*?\)', '', t)
    t = re.sub(r'[–\-_]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    words = t.split()
    return " ".join(words[:4])

def itunes_search(term):
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(term)}&entity=song&limit=3"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            return results
    except Exception as e:
        return []

report = []
for i, s in enumerate(songs, 1):
    cleaned = clean_search(s['title'])
    res = itunes_search(cleaned)
    if res:
        best = res[0]
        match_info = f"{best.get('trackName')} | {best.get('artistName')} | {best.get('collectionName')}"
        art = best.get('artworkUrl100', '')
    else:
        match_info = "NO RESULT"
        art = None
    report.append({
        "num": i,
        "id": s['id'],
        "title": s['title'],
        "clean_term": cleaned,
        "match": match_info,
        "artwork": art
    })
    safe_title = s['title'][:40].encode('ascii', 'replace').decode('ascii')
    safe_match = match_info.encode('ascii', 'replace').decode('ascii')
    print(f"[{i:02d}] {safe_title}... -> Clean: '{cleaned}' -> Match: {safe_match}")

with open('search_audit.json', 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
