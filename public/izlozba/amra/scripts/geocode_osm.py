import csv
import json
import os
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
    with urllib.request.urlopen(request, timeout=20) as response:
        data = json.loads(response.read().decode("utf-8"))

    if not data:
        return None

    top = data[0]
    return {
        "lat": float(top["lat"]),
        "lon": float(top["lon"]),
        "source": "nominatim",
    }


def main():
    cache = load_cache()

    rows = []
    with CSV_PATH.open("r", newline="", encoding="latin-1") as file:
        reader = csv.DictReader(file, delimiter=";")
        for row in reader:
            rows.append(row)

    pending = []
    for row in rows:
        lat = (row.get("fi_lat") or "").strip()
        lon = (row.get("fi_lon") or "").strip()
        if lat and lon:
            continue
        city = (row.get("fi_city") or "").strip()
        country = (row.get("fi_country") or "").strip()
        if not city and not country:
            continue
        key = to_key(city, country)
        if key in cache:
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

    print("Done.")


if __name__ == "__main__":
    main()
