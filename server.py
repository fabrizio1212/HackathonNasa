#!/usr/bin/env python3
"""Static app server and a small same-origin proxy for JPL Horizons."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from json import dumps, loads
from math import isfinite
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen


HOST = "0.0.0.0"
PORT = 8000
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"


class HorizonsError(Exception):
    pass


def parse_ephemeris_rows(result):
    try:
        rows = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    except IndexError as error:
        raise HorizonsError("JPL Horizons no devolvió datos horarios para esta consulta.") from error

    samples = []
    for line in rows.splitlines():
        columns = line.split()
        if len(columns) < 4:
            continue
        try:
            azimuth = float(columns[-2])
            elevation = float(columns[-1])
            observed_at = datetime.strptime(
                f"{columns[0]} {columns[1]}",
                "%Y-%b-%d %H:%M",
            ).replace(tzinfo=timezone.utc)
        except (ValueError, IndexError):
            continue
        samples.append({
            "time": observed_at.isoformat(),
            "azimuth": azimuth,
            "elevation": elevation,
            "aboveHorizon": elevation > 0,
        })

    if not samples:
        raise HorizonsError("JPL Horizons no devolvió filas de efemérides interpretables.")
    return samples


@lru_cache(maxsize=64)
def request_body_ephemeris(body, longitude, latitude, start_time):
    start = datetime.strptime(
        f"{start_time[0]} {start_time[1]}",
        "%Y-%m-%d %H:%M",
    ).replace(tzinfo=timezone.utc)
    stop = start + timedelta(hours=24)
    params = {
        "format": "json",
        "COMMAND": str(body),
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{longitude:.6f},{latitude:.6f},0",
        "START_TIME": f"'{start:%Y-%m-%d %H:%M}'",
        "STOP_TIME": f"'{stop:%Y-%m-%d %H:%M}'",
        "STEP_SIZE": "'1 h'",
        "QUANTITIES": "'4'",
    }
    request = Request(
        f"{HORIZONS_URL}?{urlencode(params)}",
        headers={"User-Agent": "LunaSouthPolePlanner/1.0"},
    )
    try:
        with urlopen(request, timeout=25) as response:
            payload = loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise HorizonsError(f"JPL Horizons respondió HTTP {error.code}.") from error
    except (TimeoutError, URLError) as error:
        raise HorizonsError("No se pudo conectar con JPL Horizons. Comprueba tu conexión e inténtalo de nuevo.") from error
    except (UnicodeDecodeError, ValueError) as error:
        raise HorizonsError("JPL Horizons devolvió una respuesta que no se pudo interpretar.") from error

    if payload.get("error"):
        raise HorizonsError(payload["error"])
    return parse_ephemeris_rows(payload.get("result", ""))


def get_ephemeris(longitude, latitude, date, time):
    start = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    cache_start = (date, time)
    with ThreadPoolExecutor(max_workers=2) as pool:
        sun_future = pool.submit(request_body_ephemeris, 10, longitude, latitude, cache_start)
        earth_future = pool.submit(request_body_ephemeris, 399, longitude, latitude, cache_start)
        sun_samples = sun_future.result()
        earth_samples = earth_future.result()

    return {
        "source": "NASA/JPL Horizons",
        "site": {"latitude": latitude, "longitude": longitude},
        "start": start.isoformat(),
        "stop": (start + timedelta(hours=24)).isoformat(),
        "sun": {"samples": sun_samples, "atStart": sun_samples[0]},
        "earth": {"samples": earth_samples, "atStart": earth_samples[0]},
        "method": "Muestras horarias de altitud/azimut aparente; horizonte local sin relieve.",
    }


class AppHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urlsplit(self.path)
        if parsed_url.path != "/api/ephemeris":
            super().do_GET()
            return

        query = parse_qs(parsed_url.query, strict_parsing=False)
        try:
            longitude = float(query.get("lon", [""])[0])
            latitude = float(query.get("lat", [""])[0])
            date = query.get("date", [""])[0]
            time = query.get("time", [""])[0]
            if not (isfinite(longitude) and -180 <= longitude <= 180):
                raise ValueError("La longitud debe estar entre -180 y 180 grados.")
            if not (isfinite(latitude) and -90 <= latitude <= 90):
                raise ValueError("La latitud debe estar entre -90 y 90 grados.")
            datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
            result = get_ephemeris(longitude, latitude, date, time)
        except ValueError as error:
            self.send_json(400, {"error": str(error) or "Fecha, hora o coordenadas no válidas."})
            return
        except HorizonsError as error:
            self.send_json(502, {"error": str(error)})
            return

        self.send_json(200, result)

    def send_json(self, status, payload):
        body = dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")


if __name__ == "__main__":
    print(f"LUNA planner: http://localhost:{PORT}")
    print("JPL Horizons no requiere API key; este servidor no publica credenciales.")
    ThreadingHTTPServer((HOST, PORT), AppHandler).serve_forever()
