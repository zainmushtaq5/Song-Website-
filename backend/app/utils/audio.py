"""Best-effort audio metadata extraction.

Production uses ffprobe. If FFmpeg is not installed (local dev/test),
we fall back to header-based duration parsing for MP3/WAV so uploads still succeed.
"""

import io
import shutil
import subprocess
from functools import lru_cache

from app.models.song import Song

DurationMeta = tuple[int | None, int | None, int | None]  # (duration_sec, bitrate_kbps, sample_rate)


@lru_cache
def _has_ffprobe() -> bool:
    return shutil.which("ffprobe") is not None


def probe_duration(data: bytes) -> DurationMeta:
    if _has_ffprobe():
        try:
            args = [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration,bit_rate:stream=sample_rate",
                "-of", "default=noprint_wrappers=1",
                "-",
            ]
            proc = subprocess.run(args, input=data, capture_output=True, timeout=20)
            out = proc.stdout.decode("utf-8", "ignore")
            vals = {}
            for line in out.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    vals[k] = v
            duration = int(float(vals["duration"])) if vals.get("duration") else None
            bitrate = int(int(vals["bit_rate"]) / 1000) if vals.get("bit_rate") else None
            sample_rate = int(vals["sample_rate"]) if vals.get("sample_rate") else None
            return duration, bitrate, sample_rate
        except Exception:
            pass  # fall through to header parsing

    duration = _wav_duration(data) or _mp3_duration_estimate(data)
    return duration, None, None


def _wav_duration(data: bytes) -> int | None:
    try:
        if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
            return None
        import struct

        byte_rate = None
        # fmt chunk: bytes 12.. fmt chunk
        pos = 12
        while pos + 8 <= len(data):
            chunk_id = data[pos : pos + 4]
            (chunk_size,) = struct.unpack("<I", data[pos + 4 : pos + 8])
            if chunk_id == b"fmt ":
                fmt = data[pos + 8 : pos + 8 + min(chunk_size, 16)]
                byte_rate = struct.unpack("<I", fmt[8:12])[0]
            if chunk_id == b"data":
                return round(chunk_size / byte_rate) if byte_rate else None
            pos += 8 + chunk_size + (chunk_size % 2)
    except Exception:
        return None
    return None


def _mp3_duration_estimate(data: bytes) -> int | None:
    """Very rough estimate: average bitrate from first frame * file size."""
    try:
        import struct

        pos = 3 if data[:3] == b"ID3" else 0
        if pos == 3:
            tag_size = struct.unpack(">I", b"\x00" + data[6:9])[0]
            pos += tag_size
        BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
        SAMPLE_RATES = [44100, 48000, 32000, 0]
        for _ in range(100):
            if pos + 4 > len(data):
                return None
            head, = struct.unpack(">I", data[pos : pos + 4])
            if (head & 0xFFE00000) == 0xFFE00000:  # frame sync
                bitrate_idx = (head >> 12) & 0xF
                bitrate = BITRATES[bitrate_idx] * 1000
                if bitrate:
                    return round(len(data) * 8 / bitrate)
            pos += 1
    except Exception:
        return None
    return None
