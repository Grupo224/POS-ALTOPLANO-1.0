# POS Next

Punto de venta (POS) construido sobre ERPNext, con frontend **Vue 3 + frappe-ui**. Facturación en tiempo real, control de stock, multi-usuario, modo offline e impresión de tickets (térmica 58mm).

> Repo derivado de `BrainWise-DEV/POSNext` (upstream). Este repo es el fork de trabajo de Grupo224, rama `version-15`.

## Stack

- **Backend:** Python 3.12, Frappe/ERPNext **v15**, app `pos_next` (v1.17.0).
- **Frontend:** Vue 3 + frappe-ui + Vite, en la carpeta `POS/`.
- **Ruta web:** `/pos` (sirve `pos_next/www/pos.html`, cargado por `website_route_rules`).
- **Entrada en desk:** hook `add_to_apps_screen` (aparece como "POS Next" en el menú de apps).

## Estructura

- `pos_next/` — backend: API whitelisted, doctypes, hooks, www.
- `POS/` — frontend Vue (el build de Vite escribe en `pos_next/public/pos/`).
- `pos_next/www/pos.html` — HTML de entrada (Jinja; inyecta los datos de arranque).
- `pos_next/public/pos/` — bundle compilado (gitignored; se regenera con `yarn build`).

## Despliegue

### Requisitos
- Frappe/ERPNext **v15** (no compatible con v16 sin adaptar).
- Python 3.12.
- Node 20+ y **Yarn classic (v1.22)** — NO usar Yarn 4 (rompe el build).

### Instalar en un bench

```bash
cd ~/frappe-bench
bench get-app git@github.com:Grupo224/POS-ALTOPLANO-1.0.git --branch version-15
bench --site <sitio> install-app pos_next
bench --site <sitio> migrate
```

### Compilar el frontend

```bash
cd apps/pos_next/POS
yarn build                        # vite build -> pos_next/public/pos/
cp ../pos_next/public/pos/index.html ../pos_next/www/pos.html
```

### Servicio

`bench start` se ejecuta con una unit de systemd de usuario (`erpnext-bench.service`, `systemctl --user`). Para reiniciar:

```bash
systemctl --user restart erpnext-bench
```

## Funciones implementadas en este branch

- Menú de apps (`add_to_apps_screen`).
- **EOD descargable como PDF** (fallback cuando QZ Tray no está; útil en celular).
- **Impresión de tickets por Bluetooth** (Web Bluetooth + ESC/POS, impresora térmica 58mm).
- **Scanner por cámara** de QR y código de barras (cross-browser con `html5-qrcode`).
- Branding **Altoplano** + localización al **español**.

## ⚠️ Bugs / temas detectados (para revisar)

1. **QZ Tray es solo de escritorio.** La impresión silenciosa por QZ Tray no funciona en celular; el EOD se resuelve descargando PDF y los tickets por Bluetooth o fallback al navegador.
2. **Web Bluetooth solo funciona en Chrome de Android.** En iOS/Safari no existe la API; ahí se debe usar el PDF o la app del fabricante de la impresora.
3. **Texto del setting "Silent Print" desactualizado** — todavía dice "via QZ Tray" y no menciona Bluetooth (`POSSettings.vue`). Ajuste de UI pendiente.
4. **Scanner por cámara requiere HTTPS** (`window.isSecureContext`) y permiso de cámara en el navegador. Sin HTTPS, `getUserMedia` falla.
5. **`pos-v2` (repo `Grupo224/altoplano-pos`) está BLOQUEADO** — es legacy, no usar en producción.
6. **Localización al español:** validar que la selección de idioma en `/pos` persista correctamente tras cada rebuild.

## TODO

- [ ] Actualizar el texto del setting "Silent Print" para incluir Bluetooth.
- [ ] Validar el flujo completo de español (labels, reportes, tickets).
- [ ] Evaluar más code-splitting del bundle (el principal está ~779 KB).

## Impresión / escáner (resumen de uso)

- **Impresora Bluetooth:** Ajustes → Silent Print → "Connect Bluetooth printer" (solo Chrome/Android).
- **Scanner cámara:** icono de cámara en la barra de búsqueda del POS. QR y barcode.
- **EOD PDF:** al cerrar turno aparece un único botón "Download EOD PDF".
