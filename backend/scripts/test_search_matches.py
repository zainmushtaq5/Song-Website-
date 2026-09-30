import urllib.request
import urllib.parse
import json

songs = [
    ("4bb978aabc584fcd8d71c3d86474b377", "Wajah Tum Ho Title Song Lyrical Mithoon, Tulsi Kumar, Sana Khan, Sharman, Gurmeet Vishal Pandya"),
    ("05dfe3d938204653a106424bd602a0ce", "Aa Jao Meri Tamanna Lyrical - Ajab Prem Ki Ghazab Kahani Ranbir, Katrina Javed Ali, Jojo Pritam"),
    ("41aa5a81b88446d3b2b3597ee4725a44", "Aaye Ho Meri Zindagi Mein Udit Narayan Aamir Karisma Evergreen Love Song"),
    ("57fbc8605abf4ee7babab19f3e3a4e12", "Asalaam Ay Sabz Gumbad Ke Makeen Asalaam Ay Rehmatal Lil Alameen Syed Fasihudin Soharvardi"),
    ("1ac2ad8d6ca247b1a4f03f46a5819d5c", "Bahut Pyaar Karte Hai - Saajan Madhuri Dixit 90 s Best Hindi Romantic Songs"),
    ("03a9d87d5df44ca183095c56261daf17", "Bara Lajpal Ali Sona mera mola Ali Best Kaseeda"),
    ("67f50af0b5dd463c9a380abbcb93349f", "Chalo Koi Gal Nai - Shafaullah Khan Rokhri - Album 5 -"),
    ("0f0a6df3a53842ca8147f97d01944da7", "Chita Choly"),
    ("2b0cc5819e084f3fbdcdf411666bf5be", "Dekha Ek Khwab Song Silsila Amitabh Bachchan, Rekha Kishore Kumar, Lata Mangeshkar, Shiv-Hari"),
    ("3323ddb147f34b029bae3005b33a747d", "Dil Pe Chalayi Chooriyan Song Bewafa Sanam Sonu Nigam Dil Pe Chalayi Churiyan"),
    ("bc002c30a9864856820c88c99bb9af95", "Gal Sun Lyrics - Sabat Batin ft. Rackstar @InsightRewind"),
    ("61139b418f82492cb6165520aa79ae41", "Generosity of the Ahlul Bayt Haj Mahdi Rasouli"),
    ("19189bebf9aa441d9875372c78a32a66", "Hamaara Haal [] Team - The Force"),
    ("3fc3ca94651943429807e95b392656ea", "HEER RANJHA.1970 Sun Wanjli Di Mithri Taan Way, Main Taan Ho Ho Geyi Qurban Way.. NOORJAHAN"),
    ("1e61d1fce94241649764b1db2d1183af", "Hum isliye zalim tera charcha nhy karty....supab..sad ..The ghazal"),
    ("5a5ea2ac287a49e4bd372c75a1278315", "Jo Bhi Kasmein Khai Thi Humne - Raaz Bipasha Basu Dino Morea Alka Yagnik Udit Narayan"),
    ("5874b833e94442128c03ecd1dffe0cf0", "Khasara - Abdul Hannan Samar Jafri"),
    ("6f2fa3d1de4a4be2b2f83606be4a92e1", "Koi Naa Bhool Chuk Maaf Rajkummar Rao, Wamiqa Gabbi Tanishk, Irshad, Shreya, Harnoor, Gifty"),
    ("16250da0a2d646b6ab36fcb6af30b59c", "LETHAL COMBINATION - BILAL SAEED FT. ROACH KILLA -"),
    ("c5c6454403264325854f59d41876315d", "Lyrical Labon Ko Bhool Bhulaiyaa Pritam K.K. Akshay Kumar, Shiney Ahuja, Vidya Balan"),
    ("7c146daf622848a1a27e90be1f13d5c7", "Mann Mera [Lyrics]- Gajendra Verma"),
    ("71bdf9635eef40e1b6c0aeba7ce98b8f", "Mere Rang Mein Rangne Waali Lyrics - Salmaan Khan S. P. Balasubrahmanyam Asad Bhopali"),
    ("51f251b2a64f409cb6c0d1ae8ae3f010", "Muhabbat Tujhe Alvida Sahir Ali Bagga Afshan Fawad"),
    ("30446da054164bf7b5e913c4f123ff28", "New Best Durood O Salaam Muharram Ul Haram Mere Husain Tujhe Salam By Ahmed Raza Attari Qadri"),
    ("19a2e40d00674193b6fa4b31d2e372ca", "Paar chanaa de - music video ALI WASI KAZMI AMNA YOUZASAIF FAN VIDEO"),
    ("c92350253cda46f79911e436ccae652f", "Qasida - Sehra Shehzada Qasim As - Afzal Jamal - 2019"),
    ("79a75f4cdbcb4b2ab30bc4270235f014", "Salat-o-salam by Khalid hasnain Khalid old record 2000"),
    ("053e41f40fad47b48f234143aae93723", "Shaam Hai Dhuan [] Diljale Ajay Devgan"),
    ("517cfef1545b4420878388c5a6aa6777", "Shubh - Aura"),
    ("4443d35c996c472c89992e18375ecdf8", "Tera Kasoor Vishal Mishra Mr. Faisu, Mannara Payal Dev, Kunaal Vermaa"),
    ("10ff93ce39634dc3ab768c69fadb02d2", "Tere Bina Lyrical - Arijit Singh Zareen Khan Karan Kundrra Aakanksha S Asad Khan 1921"),
    ("047ee3713ec342aba95fb4575f3b6165", "Teri Mohabbat Ne Dil Mein Makaam Kar Diya Rang Alka Yagnik, Kumar Sanu 90 s Hit Song"),
    ("4d7b6e61c8734a63a92befc1d7cb6f68", "Tu Akh Badli Tera Yaar rullya Tere Nena Da Dewana Tera yaar rullya ! NEW TRENDING SONG"),
    ("969cc17d9bc744b487b3fa22b9323ffc", "Tu Nadi Ka Kinara Ghumnaam Lyric ArijitSingh 30Sec"),
    ("d14548ee8b8347ddb6da8d5be178c74d", "Tujhe Sochta Hoon KK Emraan Hashmi Esha Gupta Pritam Jannat 2"),
    ("cb1d9cade1bd420a9f70c6c3dcf953f3", "Tum Mere Ho Video Song Hate Story IV Vivan Bhathena, Ihana Dhillon Mithoon Jubin N Manoj M"),
    ("828e4af300204d368185966c3afa911e", "Yaarian Dildariyan , Urwa Khan Dance Performance , SGStudio 2025"),
    ("af58c42428384a1f9a1a1ca2f7539f2e", "Yeh Dua Hai Meri Video Song Sapne Saajan Ke Karisma Kapoor, Rahul Roy"),
    ("73b8c44fc813471c9ea31f08662a1fef", "Yeh Vaada Raha R. D. Burman Kishore Kumar Asha Bhosle Rishi Kapoor"),
    ("0f210817ee2f47aa9afe3703ef741db8", "Tadpaoge Tadpa Lo Classic Hindi Song Sasural")
]

def search_itunes(query):
    try:
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('results'):
                r = data['results'][0]
                return f"{r.get('trackName')} - {r.get('artistName')} ({r.get('collectionName')})"
    except Exception as e:
        return f"ERR: {e}"
    return "NO_MATCH"

# Test what the naive clean search in update_real_thumbnails gave
for idx, (sid, title) in enumerate(songs[:15], 1):
    # Old cleanSearchTerm:
    # clean.split(' ')[:4]
    words = title.replace('-', ' ').replace('_', ' ').split()
    query_old = " ".join(words[:4])
    res_old = search_itunes(query_old)
    print(f"[{idx:02d}] Query: '{query_old}' -> Matched: {res_old}")
