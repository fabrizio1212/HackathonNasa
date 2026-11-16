# LUNA // South Pole Ops

Globo lunar interactivo para explorar relieve y comparar ubicaciones y horarios de referencia en el polo sur lunar. Three.js representa el globo; JPL Horizons aporta las posiciones aparentes del Sol y la Tierra para un observador en la superficie lunar.

## Ejecutar localmente

Requiere Python 3 y conexión a Internet. Desde esta carpeta, inicia el servidor local:

```powershell
python server.py
```

Abre <http://localhost:8000>. El servidor sirve la app y expone `/api/ephemeris` como proxy de mismo origen para JPL Horizons (el navegador no puede consultar ese servicio directamente por CORS).

## Recursos

- `lroc_color_4k.jpg`: albedo del TIFF local, convertido a JPEG para compatibilidad con navegadores.
- `ldem_3_8bit.jpg`: mapa de elevación; se hornea en la geometría para que el relieve participe en las sombras y el raycasting, y se reutiliza como bump map.
- Los sitios de referencia están definidos como datos en `src/main.js` para facilitar su sustitución por JSON o una API.

## Efemérides y límites del modelo

- JPL Horizons consulta posiciones aparentes y topocéntricas de Sol (ID 10) y Tierra (ID 399), observadas desde la latitud/longitud lunar elegida, para la fecha/hora UTC seleccionada y las 24 horas siguientes, en pasos horarios.
- Las franjas estiman horas sobre el horizonte geométrico. La luz del globo usa la dirección solar del horario seleccionado y el modelo local de relieve para proyectar sombras.
- El enlace a Tierra mostrado es geométrico. No incorpora un modelo de horizonte topográfico de alta resolución, estación retransmisora, libración detallada para operaciones ni restricciones de hardware. Las horas y el porcentaje de iluminación son ayudas comparativas, no predicciones operacionales.
- Los mapas locales son referencias visuales globales y no reemplazan un DEM polar de alta resolución/LOLA ni productos de iluminación acumulada LROC.

**No hace falta una API key ni un archivo `.env` para JPL Horizons.** La API pública de Horizons no requiere autenticación. El proxy local no almacena ni publica secretos; una clave de `api.nasa.gov` no es una “clave maestra” y no desbloquea Horizons. No pongas credenciales en el frontend.

Los sitios son una selección de referencia para la interfaz, no una lista oficial de sitios aprobados para aterrizaje.
