#!/usr/bin/env python3
"""
Verify all city coordinates in geocode_cache.json against the Nominatim geocoding API.
Fixes any entries where the difference is more than 0.5 degrees in lat OR lon.
"""

import json
import time
import urllib.request
import urllib.parse
import urllib.error
import ssl

# Create an unverified SSL context (needed on macOS when system certs aren't set up)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

CACHE_FILE = "/Users/amralevak/Desktop/network-dijagram/geocode_cache.json"
THRESHOLD = 0.5  # degrees
DELAY = 0.6      # seconds between requests (Nominatim policy: 1 req/sec)
USER_AGENT = "erasmus-koordinate-checker/1.0"

def query_nominatim(city, country):
    """Query Nominatim for city coordinates. Returns (lat, lon) or None."""
    params = {"format": "json", "limit": "1"}
    if city:
        params["city"] = city
    if country:
        params["country"] = country

    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  [ERROR] Query failed for '{city}|{country}': {e}")
    return None


def main():
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        cache = json.load(f)

    total = len(cache)
    checked = 0
    no_result = 0
    null_entries = 0
    fixed = []
    errors = []

    updated_cache = {}

    keys = sorted(cache.keys())

    for key in keys:
        value = cache[key]
        parts = key.split("|", 1)
        city = parts[0].strip() if len(parts) > 0 else ""
        country = parts[1].strip() if len(parts) > 1 else ""

        if value is None:
            null_entries += 1
            print(f"[NULL ] {key} — skipping (null entry), will query Nominatim to fill in")
            result = query_nominatim(city, country)
            time.sleep(DELAY)
            if result:
                new_lat, new_lon = result
                print(f"  -> Found: lat={new_lat}, lon={new_lon}")
                fixed.append({
                    "key": key,
                    "old_lat": None,
                    "old_lon": None,
                    "new_lat": new_lat,
                    "new_lon": new_lon,
                    "reason": "was null, filled from Nominatim"
                })
                updated_cache[key] = {"lat": new_lat, "lon": new_lon, "source": "nominatim"}
            else:
                print(f"  -> No result from Nominatim, keeping null")
                no_result += 1
                updated_cache[key] = None
            continue

        old_lat = value.get("lat")
        old_lon = value.get("lon")

        if old_lat is None or old_lon is None:
            print(f"[SKIP ] {key} — missing lat/lon in value")
            updated_cache[key] = value
            continue

        checked += 1
        print(f"[CHECK] ({checked}/{total}) {key} ...", end=" ", flush=True)

        result = query_nominatim(city, country)
        time.sleep(DELAY)

        if result is None:
            no_result += 1
            print(f"NO RESULT (keeping original)")
            updated_cache[key] = value
            continue

        new_lat, new_lon = result
        lat_diff = abs(new_lat - old_lat)
        lon_diff = abs(new_lon - old_lon)

        if lat_diff > THRESHOLD or lon_diff > THRESHOLD:
            print(f"WRONG! old=({old_lat:.4f}, {old_lon:.4f}) new=({new_lat:.4f}, {new_lon:.4f}) diff=({lat_diff:.4f}, {lon_diff:.4f})")
            fixed.append({
                "key": key,
                "old_lat": old_lat,
                "old_lon": old_lon,
                "new_lat": new_lat,
                "new_lon": new_lon,
                "reason": f"lat_diff={lat_diff:.4f}, lon_diff={lon_diff:.4f}"
            })
            updated_cache[key] = {"lat": new_lat, "lon": new_lon, "source": "nominatim"}
        else:
            print(f"OK (diff: {lat_diff:.4f}, {lon_diff:.4f})")
            updated_cache[key] = value

    # Write corrected data back
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(updated_cache, f, indent=2, ensure_ascii=False, sort_keys=True)

    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    print(f"Total entries in file : {total}")
    print(f"Non-null entries checked: {checked}")
    print(f"Null entries encountered : {null_entries}")
    print(f"  Of which filled from Nominatim: {sum(1 for f in fixed if f['reason'] == 'was null, filled from Nominatim')}")
    print(f"  Of which still null (no result): {no_result - sum(1 for f in [] if False)}")
    print(f"Nominatim returned no result: {no_result}")
    print(f"Entries fixed (wrong coords OR null filled): {len(fixed)}")
    print()

    if fixed:
        print("FIXED ENTRIES:")
        print("-"*70)
        for item in fixed:
            print(f"  Key    : {item['key']}")
            print(f"  Old    : lat={item['old_lat']}, lon={item['old_lon']}")
            print(f"  New    : lat={item['new_lat']:.7f}, lon={item['new_lon']:.7f}")
            print(f"  Reason : {item['reason']}")
            print()
    else:
        print("No entries needed fixing.")

    print(f"Updated cache written to: {CACHE_FILE}")


if __name__ == "__main__":
    main()
