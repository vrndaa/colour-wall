"""
Color Grid Extractor
---------------------
Walks category folders (sky, mountain, water, forest), pulls a representative
still from each photo/video, runs KMeans to get a 3-color palette per item,
and writes everything to a CSV that the D3 grid will read from.

Expected folder structure:
    media/
        sky/       (photos + videos)
        mountain/
        water/
        forest/

Install dependencies:
    pip install opencv-python pillow scikit-learn numpy pandas

    If you have iPhone photos in HEIC format, also run:
    pip install pillow-heif

Run:
    python color_grid_extractor.py
"""

import os
import csv
import colorsys
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np
from PIL import Image, ExifTags
from sklearn.cluster import KMeans

try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except ImportError:
    pass  # HEIC files will be skipped if this isn't installed

# ---------- CONFIG ----------
ROOT_DIR = "media"                 # folder containing sky/ mountain/ water/ forest/
CATEGORIES = ["sky", "mountain", "water", "forest"]
OUTPUT_CSV = "grid_data.csv"
THUMBNAIL_DIR = "thumbnails"
THUMBNAIL_WIDTH = 500
N_CLUSTERS = 6
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic"}
FRAME_SAMPLE_STEP = 15             # check every 15th frame for saturation

os.makedirs(THUMBNAIL_DIR, exist_ok=True)


def mean_saturation(frame_bgr):
    """Average saturation of a frame, 0-255. Higher = more vivid."""
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    return hsv[:, :, 1].mean()


def best_frame_from_video(path):
    """Scan a video, return the frame (BGR numpy array) with highest
    average saturation, sampling every FRAME_SAMPLE_STEP frames."""
    cap = cv2.VideoCapture(str(path))
    best_score = -1
    best_frame = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % FRAME_SAMPLE_STEP == 0:
            score = mean_saturation(frame)
            if score > best_score:
                best_score = score
                best_frame = frame
        frame_idx += 1

    cap.release()
    return best_frame  # BGR numpy array, or None if video couldn't be read


def load_image_as_array(path):
    """Load a photo as an RGB numpy array, honoring EXIF rotation."""
    img = Image.open(path).convert("RGB")
    try:
        exif = img._getexif()
        if exif:
            orientation_key = next(
                k for k, v in ExifTags.TAGS.items() if v == "Orientation"
            )
            orientation = exif.get(orientation_key)
            rotations = {3: 180, 6: 270, 8: 90}
            if orientation in rotations:
                img = img.rotate(rotations[orientation], expand=True)
    except Exception:
        pass
    return np.array(img)


def get_capture_date(path, is_video):
    """Best-effort capture date. EXIF for photos, file mtime as fallback.
    Note: mtime is unreliable for videos that have been copied or edited,
    so treat video dates as approximate until you have better metadata."""
    if not is_video:
        try:
            img = Image.open(path)
            exif = img._getexif()
            if exif:
                date_key = next(
                    (k for k, v in ExifTags.TAGS.items() if v == "DateTimeOriginal"),
                    None,
                )
                if date_key and date_key in exif:
                    return exif[date_key]
        except Exception:
            pass
    return None  # caller falls back to mtime


def dominant_colors(rgb_array, k=N_CLUSTERS):
    """Run KMeans on downsampled pixels, return list of (hex, weight),
    sorted by weight descending."""
    small = cv2.resize(rgb_array, (150, 150), interpolation=cv2.INTER_AREA)
    pixels = small.reshape(-1, 3)

    kmeans = KMeans(n_clusters=k, n_init=4, random_state=42)
    labels = kmeans.fit_predict(pixels)
    centers = kmeans.cluster_centers_.astype(int)

    counts = np.bincount(labels)
    weights = counts / counts.sum()

    order = np.argsort(-weights)
    results = []
    for i in order:
        r, g, b = centers[i]
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
        results.append((hex_color, round(float(weights[i]), 3)))
    return results


def rgb_to_hue(hex_color):
    """Hue in degrees (0-360). Useful later for sorting the grid by color."""
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, _, _ = colorsys.rgb_to_hsv(r, g, b)
    return round(h * 360, 1)

def pick_dominant(colors, min_weight=0.05):
    """Choose which cluster represents the grid swatch. Instead of always
    taking the largest cluster by pixel count, this favors vivid color:
    among clusters covering at least min_weight of the image, pick the
    one with the highest weight x saturation score, so a smaller vivid
    patch (sky, a flower) can outrank a larger dull one (shadow, wall,
    pavement)."""
    candidates = [c for c in colors if c[1] >= min_weight]
    if not candidates:
        candidates = colors  # fallback if every cluster is tiny

    def score(item):
        hex_color, weight = item
        r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
        _, s, v = colorsys.rgb_to_hsv(r, g, b)
        return weight * s * v

    return max(candidates, key=score)

def save_thumbnail(rgb_array, out_path):
    img = Image.fromarray(rgb_array)
    ratio = THUMBNAIL_WIDTH / img.width
    img = img.resize((THUMBNAIL_WIDTH, int(img.height * ratio)))
    img.save(out_path, quality=85)


def main():
    rows = []

    for category in CATEGORIES:
        folder = Path(ROOT_DIR) / category
        if not folder.exists():
            print(f"Skipping missing folder: {folder}")
            continue

        for file_path in sorted(folder.iterdir()):
            ext = file_path.suffix.lower()
            is_video = ext in VIDEO_EXTENSIONS
            is_image = ext in IMAGE_EXTENSIONS

            if not (is_video or is_image):
                continue

            print(f"Processing {file_path.name}...")

            if is_video:
                frame_bgr = best_frame_from_video(file_path)
                if frame_bgr is None:
                    print(f"  Could not read video, skipping: {file_path.name}")
                    continue
                rgb_array = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            else:
                try:
                    rgb_array = load_image_as_array(file_path)
                except Exception as e:
                    print(f"  Could not open image, skipping: {file_path.name} ({e})")
                    continue

            colors = dominant_colors(rgb_array)
            dominant_hex, dominant_weight = pick_dominant(colors)

            thumb_name = f"{file_path.stem}.jpg"
            thumb_path = Path(THUMBNAIL_DIR) / thumb_name
            save_thumbnail(rgb_array, thumb_path)

            capture_date = get_capture_date(file_path, is_video)
            if not capture_date:
                mtime = os.path.getmtime(file_path)
                capture_date = datetime.fromtimestamp(mtime).strftime("%Y:%m:%d %H:%M:%S")

            row = {
                "filename": file_path.name,
                "category": category,
                "media_type": "video" if is_video else "photo",
                "source_path": str(file_path),
                "thumbnail_path": str(thumb_path),
                "capture_date": capture_date,
                "dominant_hex": dominant_hex,
                "dominant_weight": dominant_weight,
                "dominant_hue": rgb_to_hue(dominant_hex),
            }
            for i, (hex_c, weight) in enumerate(colors, start=1):
                row[f"color{i}_hex"] = hex_c
                row[f"color{i}_weight"] = weight

            rows.append(row)

    if not rows:
        print("No media found, check ROOT_DIR and folder names.")
        return

    fieldnames = list(rows[0].keys())
    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nDone. Wrote {len(rows)} rows to {OUTPUT_CSV}")
    print(f"Thumbnails saved to {THUMBNAIL_DIR}/")


if __name__ == "__main__":
    main()