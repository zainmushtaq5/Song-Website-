import urllib.request
import urllib.parse
import json

CURATED = {
    "4bb978aabc584fcd8d71c3d86474b377": [
        "Wajah Tum Ho Mithoon Tulsi Kumar",
        "Wajah Tum Ho Title Track"
    ],
    "05dfe3d938204653a106424bd602a0ce": [
        "Aa Jao Meri Tamanna Ajab Prem Ki Ghazab Kahani",
        "Aa Jao Meri Tamanna Pritam"
    ],
    "41aa5a81b88446d3b2b3597ee4725a44": [
        "Aaye Ho Meri Zindagi Mein Raja Hindustani",
        "Aaye Ho Meri Zindagi Mein Udit Narayan"
    ],
    "57fbc8605abf4ee7babab19f3e3a4e12": [
        "Syed Fasihuddin Soharwardi Asalaam",
        "Fasihuddin Soharwardi",
        "Sabz Gumbad Ke Makeen"
    ],
    "1ac2ad8d6ca247b1a4f03f46a5819d5c": [
        "Bahut Pyar Karte Hain Saajan",
        "Bahut Pyar Karte Saajan Kumar Sanu"
    ],
    "03a9d87d5df44ca183095c56261daf17": [
        "Bara Lajpal Ali",
        "Bara Lajpal Ali Sona"
    ],
    "67f50af0b5dd463c9a380abbcb93349f": [
        "Shafaullah Khan Rokhri Chalo Koi Gal Nai",
        "Shafaullah Khan Rokhri",
        "Shafaullah Rokhri"
    ],
    "0f0a6df3a53842ca8147f97d01944da7": [
        "Chitta Chola Mushtaq Ahmed Cheena",
        "Chita Chola Cheena"
    ],
    "2b0cc5819e084f3fbdcdf411666bf5be": [
        "Dekha Ek Khwab Silsila Kishore Kumar",
        "Dekha Ek Khwab Silsila"
    ],
    "3323ddb147f34b029bae3005b33a747d": [
        "Dil Pe Chalayi Chooriyan Bewafa Sanam Sonu Nigam",
        "Dil Pe Chalayi Chooriyan Bewafa Sanam"
    ],
    "bc002c30a9864856820c88c99bb9af95": [
        "Gal Sun Sabat Batin",
        "Sabat Batin",
        "Gal Sun Rackstar"
    ],
    "61139b418f82492cb6165520aa79ae41": [
        "Haj Mahdi Rasouli",
        "Mahdi Rasouli",
        "Mehdi Rasouli"
    ],
    "19189bebf9aa441d9875372c78a32a66": [
        "Hamara Haal Team The Force",
        "Team The Force Shreya Ghoshal"
    ],
    "3fc3ca94651943429807e95b392656ea": [
        "Sun Wanjli Di Mithri Noor Jehan",
        "Heer Ranjha 1970 Noor Jehan",
        "Sun Wanjli Di Mithri Taan"
    ],
    "1e61d1fce94241649764b1db2d1183af": [
        "Hum Isliye Zalim Tera Charcha",
        "Hum Isliye Zalim"
    ],
    "5a5ea2ac287a49e4bd372c75a1278315": [
        "Jo Bhi Kasmein Raaz Udit Narayan Alka",
        "Jo Bhi Kasmein Raaz"
    ],
    "5874b833e94442128c03ecd1dffe0cf0": [
        "Khasara Abdul Hannan Samar Jafri",
        "Khasara Abdul Hannan"
    ],
    "6f2fa3d1de4a4be2b2f83606be4a92e1": [
        "Koi Naa Bhool Chuk Maaf Tanishk Bagchi",
        "Koi Naa Bhool Chuk Maaf Shreya Ghoshal",
        "Koi Naa Bhool Chuk Maaf"
    ],
    "16250da0a2d646b6ab36fcb6af30b59c": [
        "Lethal Combination Bilal Saeed Roach Killa",
        "Lethal Combination Bilal Saeed"
    ],
    "c5c6454403264325854f59d41876315d": [
        "Labon Ko Bhool Bhulaiyaa KK Pritam",
        "Labon Ko Bhool Bhulaiyaa",
        "Bhool Bhulaiyaa Labon Ko"
    ],
    "7c146daf622848a1a27e90be1f13d5c7": [
        "Mann Mera Gajendra Verma Table No 21",
        "Mann Mera Gajendra Verma"
    ],
    "71bdf9635eef40e1b6c0aeba7ce98b8f": [
        "Mere Rang Mein Rangne Wali Maine Pyar Kiya",
        "Mere Rang Mein Rangne Wali SP Balasubrahmanyam"
    ],
    "51f251b2a64f409cb6c0d1ae8ae3f010": [
        "Muhabbat Tujhe Alvida Sahir Ali Bagga",
        "Mohabbat Tujhe Alvida Sahir Ali Bagga"
    ],
    "30446da054164bf7b5e913c4f123ff28": [
        "Mere Husain Tujhe Salam Ahmed Raza",
        "Ahmed Raza Qadri Mere Husain",
        "Mere Husain Tujhe Salam"
    ],
    "19a2e40d00674193b6fa4b31d2e372ca": [
        "Par Chanaa De Coke Studio Shilpa Rao Noori",
        "Par Chanaa De Shilpa Rao",
        "Paar Chanaa De Ali Wasi"
    ],
    "c92350253cda46f79911e436ccae652f": [
        "Sehra Shehzada Qasim Afzal Jamal",
        "Afzal Jamal Qasim",
        "Afzal Jamal"
    ],
    "79a75f4cdbcb4b2ab30bc4270235f014": [
        "Khalid Hasnain Khalid Salam",
        "Khalid Hasnain Khalid Naat",
        "Khalid Hasnain Khalid"
    ],
    "053e41f40fad47b48f234143aae93723": [
        "Shaam Hai Dhuan Diljale",
        "Shaam Hai Dhuan Dhuan Diljale",
        "Diljale Shaam Hai Dhuan"
    ],
    "517cfef1545b4420878388c5a6aa6777": [
        "Aura Shubh",
        "Shubh Leo Aura",
        "Shubh Sicario"
    ],
    "4443d35c996c472c89992e18375ecdf8": [
        "Tera Kasoor Vishal Mishra",
        "Tera Kasoor Payal Dev"
    ],
    "10ff93ce39634dc3ab768c69fadb02d2": [
        "Tere Bina 1921 Arijit Singh",
        "Tere Bina 1921 Aakanksha Sharma",
        "1921 Tere Bina"
    ],
    "047ee3713ec342aba95fb4575f3b6165": [
        "Teri Mohabbat Ne Dil Mein Makaam Kar Diya Rang",
        "Teri Mohabbat Ne Dil Mein Rang Alka Yagnik",
        "Teri Mohabbat Ne Dil Mein Rang"
    ],
    "4d7b6e61c8734a63a92befc1d7cb6f68": [
        "Tu Akh Badli Tera Yaar",
        "Tu Akh Badli Tera Yaar Rusiya",
        "Tere Nena Da Dewana"
    ],
    "969cc17d9bc744b487b3fa22b9323ffc": [
        "Tu Nadi Ka Kinara Ghumnaam Arijit Singh",
        "Tu Nadi Ka Kinara Arijit Singh"
    ],
    "d14548ee8b8347ddb6da8d5be178c74d": [
        "Tujhe Sochta Hoon Jannat 2 KK",
        "Tujhe Sochta Hoon Jannat 2"
    ],
    "cb1d9cade1bd420a9f70c6c3dcf953f3": [
        "Tum Mere Ho Hate Story IV Jubin Nautiyal",
        "Tum Mere Ho Hate Story IV",
        "Hate Story IV Tum Mere Ho"
    ],
    "828e4af300204d368185966c3afa911e": [
        "Yaarian Dildariyan",
        "Yaarian Dildariyan SGStudio"
    ],
    "af58c42428384a1f9a1a1ca2f7539f2e": [
        "Yeh Dua Hai Meri Sapne Saajan Ke",
        "Yeh Dua Hai Meri Kumar Sanu Alka Yagnik"
    ],
    "73b8c44fc813471c9ea31f08662a1fef": [
        "Yeh Vaada Raha Kishore Kumar Asha Bhosle",
        "Yeh Vaada Raha RD Burman"
    ],
    "0f210817ee2f47aa9afe3703ef741db8": [
        "Tadpaoge Tadpa Lo Sasural",
        "Sasural 1961 Lata Mangeshkar",
        "Sunle Bapu Yeh Paigham Sasural"
    ]
}

def query_itunes(term):
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(term)}&entity=song&limit=3"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            results = data.get('results', [])
            return results
    except Exception as e:
        return []

matched_map = {}
for song_id, queries in CURATED.items():
    found = False
    for q in queries:
        res = query_itunes(q)
        if res:
            best = res[0]
            track = best.get('trackName')
            artist = best.get('artistName')
            album = best.get('collectionName')
            art = best.get('artworkUrl100', '').replace('100x100bb', '600x600bb')
            matched_map[song_id] = {
                "query": q,
                "track": track,
                "artist": artist,
                "album": album,
                "artwork": art
            }
            safe_info = f"{track} | {artist} | {album}".encode('ascii', 'replace').decode('ascii')
            print(f"[FOUND] {song_id[:8]} -> '{q}' -> {safe_info}")
            found = True
            break
    if not found:
        print(f"[MISSING] {song_id[:8]} -> None of {queries}")
        matched_map[song_id] = None

with open('curated_matches.json', 'w', encoding='utf-8') as f:
    json.dump(matched_map, f, indent=2, ensure_ascii=False)
print("Finished querying curated matches.")
