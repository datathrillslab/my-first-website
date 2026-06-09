import argparse
import csv
import json
import os
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[1] / "erasmus_staff_mobility_fully_cleaned.csv"
CACHE_PATH = Path(__file__).resolve().parents[1] / "geocode_cache.json"

EMAIL = os.environ.get("GEOCODE_EMAIL", "").strip()
if not EMAIL:
    raise SystemExit("GEOCODE_EMAIL is required for Nominatim requests.")

USER_AGENT = f"network-dijagram/1.0 ({EMAIL})"

try:
    import certifi
except ImportError:
    certifi = None

IZMIR_LAT = 38.42
IZMIR_LON = 27.1328


def load_cache():
    if CACHE_PATH.exists():
        with CACHE_PATH.open("r", encoding="utf-8") as file:
            return json.load(file)
    return {}


def save_cache(cache):
    with CACHE_PATH.open("w", encoding="utf-8") as file:
        json.dump(cache, file, ensure_ascii=True, indent=2, sort_keys=True)


def to_key(city, country):
    return f"{city}|{country}"


def geocode(city, country):
    if certifi is None:
        raise SystemExit("certifi is required for HTTPS requests. Run: python3 -m pip install certifi")

    query = ", ".join(part for part in [city, country] if part)
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
        "email": EMAIL,
    }
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(request, timeout=20, context=context) as response:
        data = json.loads(response.read().decode("utf-8"))

    if not data:
        return None

    top = data[0]
    return {
        "lat": float(top["lat"]),
        "lon": float(top["lon"]),
        "source": "nominatim",
    }


def format_coord(value):
    return f"{value:.6f}"


def normalize_city(value):
    return (value or "").strip()


def normalize_country(value):
    return (value or "").strip()


def has_coords(row):
    return bool((row.get("fi_lat") or "").strip()) and bool((row.get("fi_lon") or "").strip())


def main():
    parser = argparse.ArgumentParser(description="Update city coordinates in the CSV.")
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Re-geocode all cities with existing coordinates, ignoring cached values.",
    )
    args = parser.parse_args()

    cache = load_cache()

    rows = []
    with CSV_PATH.open("r", newline="", encoding="latin-1") as file:
        reader = csv.DictReader(file, delimiter=";")
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    if not fieldnames:
        raise SystemExit("CSV header not found.")

    pending = []
    seen = set()
    for row in rows:
        if not has_coords(row):
            continue
        city = normalize_city(row.get("fi_city"))
        country = normalize_country(row.get("fi_country"))
        if not city and not country:
            continue
        key = to_key(city, country)
        if key in seen:
            continue
        seen.add(key)
        if not args.refresh_cache and key in cache:
            continue
        pending.append((key, city, country))

    total = len(pending)
    print(f"New lookups: {total}")

    for idx, (key, city, country) in enumerate(pending, start=1):
        try:
            result = geocode(city, country)
            cache[key] = result
        except Exception as exc:
            print(f"Failed: {city}, {country} -> {exc}")
            cache[key] = None
        save_cache(cache)
        print(f"[{idx}/{total}] {city}, {country} -> {cache[key]}")
        time.sleep(1.1)

    updated = 0
    for row in rows:
        if not has_coords(row):
            continue
        city = normalize_city(row.get("fi_city"))
        country = normalize_country(row.get("fi_country"))
        if not city and not country:
            continue

        if city.lower() == "izmir":
            row["fi_lat"] = format_coord(IZMIR_LAT)
            row["fi_lon"] = format_coord(IZMIR_LON)
            updated += 1
            continue

        key = to_key(city, country)
        result = cache.get(key)
        if not result:
            continue
        row["fi_lat"] = format_coord(result["lat"])
        row["fi_lon"] = format_coord(result["lon"])
        updated += 1

    with CSV_PATH.open("w", newline="", encoding="latin-1") as file:
        writer = csv.DictWriter(file, delimiter=";", fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Updated rows: {updated}")


if __name__ == "__main__":
    main()
