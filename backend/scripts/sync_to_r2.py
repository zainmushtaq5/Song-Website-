import os
import boto3
from botocore.client import Config as BotoConfig

R2_ENDPOINT = "https://0e398abfd5d90a667894d7c5b8815ab6.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "6fc5c1abd9caeecf73b28658dc2b1489"
R2_SECRET_KEY = "c04dbecf7ac62acc2499e9f9f3fc6af9a9f815efcfcf1a636a089dc324b77f39"
R2_BUCKET = "music-app-storage"

s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    config=BotoConfig(signature_version="s3v4"),
    region_name="auto"
)

LOCAL_STORAGE = os.path.join("backend", ".storage")

def get_content_type(filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    elif ext == ".png":
        return "image/png"
    elif ext == ".webp":
        return "image/webp"
    elif ext == ".mp3":
        return "audio/mpeg"
    elif ext == ".m4a":
        return "audio/mp4"
    elif ext == ".wav":
        return "audio/wav"
    return "application/octet-stream"

def upload_directory(subfolder):
    target_dir = os.path.join(LOCAL_STORAGE, subfolder)
    if not os.path.exists(target_dir):
        print(f"Directory {target_dir} does not exist.")
        return 0
    
    files = [f for f in os.listdir(target_dir) if os.path.isfile(os.path.join(target_dir, f))]
    print(f"Uploading {len(files)} files from {subfolder} to R2...")
    
    count = 0
    for idx, f in enumerate(files, 1):
        file_path = os.path.join(target_dir, f)
        key = f"{subfolder}/{f}"
        ct = get_content_type(f)
        try:
            with open(file_path, "rb") as fp:
                s3.upload_fileobj(fp, R2_BUCKET, key, ExtraArgs={"ContentType": ct})
            count += 1
            if idx % 10 == 0 or idx == len(files):
                print(f"  [{idx}/{len(files)}] uploaded {key}")
        except Exception as e:
            print(f"  [ERROR] {key}: {e}")
    return count

covers_count = upload_directory("covers")
audio_count = upload_directory("audio")

print(f"\nUpload complete: {covers_count} covers and {audio_count} audio files synced to R2 bucket '{R2_BUCKET}'.")
