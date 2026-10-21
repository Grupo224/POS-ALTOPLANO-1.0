import { logger } from "@/utils/logger";

const log = logger.create("WebBluetoothPrint");

// Standard Serial Port Profile (SPP) service UUID used by most 58mm
// Bluetooth thermal receipt printers.
const SPP_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";

let activeDevice = null;
let activeCharacteristic = null;

export function isBluetoothSupported() {
	return typeof navigator !== "undefined" && typeof navigator.bluetooth !== "undefined";
}

export function isBluetoothConnected() {
	return !!(activeCharacteristic && activeDevice?.gatt?.connected);
}

export function getBluetoothPrinterName() {
	return activeDevice?.name || "";
}

/**
 * Open the Web Bluetooth device picker and connect to a thermal printer.
 * Must be called from a user gesture (button click).
 */
export async function connectBluetoothPrinter() {
	if (!isBluetoothSupported()) {
		throw new Error("Web Bluetooth is not supported on this browser. Use Chrome on Android.");
	}
	const device = await navigator.bluetooth.requestDevice({
		filters: [{ services: [SPP_SERVICE_UUID] }],
		optionalServices: [SPP_SERVICE_UUID],
	});
	const server = await device.gatt.connect();
	const service = await server.getPrimaryService(SPP_SERVICE_UUID);
	const chars = await service.getCharacteristics();
	const char =
		chars.find((c) => c.properties.writeWithoutResponse || c.properties.write) || chars[0];
	if (!char) throw new Error("No writable characteristic found on the printer");
	activeDevice = device;
	activeCharacteristic = char;
	device.addEventListener("gattserverdisconnected", () => {
		activeCharacteristic = null;
		log.info("Bluetooth printer disconnected");
	});
	log.info("Bluetooth printer connected:", device.name);
	return device.name || "Bluetooth printer";
}

export async function disconnectBluetoothPrinter() {
	try {
		if (activeDevice?.gatt?.connected) await activeDevice.gatt.disconnect();
	} catch (err) {
		log.warn("Bluetooth disconnect failed:", err?.message || err);
	}
	activeDevice = null;
	activeCharacteristic = null;
}

// ---------------------------------------------------------------------------
// ESC/POS encoding
// ---------------------------------------------------------------------------
function escPosBytes(lines) {
	const out = [];
	const push = (...xs) => out.push(...xs);

	push(0x1b, 0x40); // ESC @  init

	for (const ln of lines) {
		if (ln.align === "center") push(0x1b, 0x61, 0x01);
		else if (ln.align === "right") push(0x1b, 0x61, 0x02);
		else push(0x1b, 0x61, 0x00);

		push(0x1b, 0x45, ln.bold ? 0x01 : 0x00); // bold on/off
		push(0x1d, 0x21, ln.size || 0x00); // font size

		const text = toAscii(ln.text || "");
		for (let i = 0; i < text.length; i++) {
			out.push(text.charCodeAt(i) & 0xff);
		}
		push(0x0a); // LF
	}

	push(0x0a, 0x0a, 0x0a);
	push(0x1d, 0x56, 0x42, 0x00); // GS V B 0  full cut
	return new Uint8Array(out);
}

function toAscii(text) {
	return String(text || "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\x20-\x7e\n]/g, " ");
}

async function writeChunked(data) {
	const CHUNK = 512;
	for (let i = 0; i < data.length; i += CHUNK) {
		const slice = data.slice(i, i + CHUNK);
		if (activeCharacteristic.properties.writeWithoutResponse) {
			await activeCharacteristic.writeValueWithoutResponse(slice);
		} else {
			await activeCharacteristic.writeValue(slice);
		}
	}
}

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------
function fmt(n) {
	return Number.parseFloat(n || 0).toFixed(2);
}

function lineBetween(left, right, width) {
	width = width || 32;
	left = String(left || "").slice(0, width);
	right = String(right || "");
	const gap = Math.max(1, width - left.length - right.length);
	return left + " ".repeat(gap) + right;
}

export function buildReceiptText(invoiceData) {
	const lines = [];
	const items = invoiceData.items || [];
	const paid = Number.parseFloat(invoiceData.paid_amount) || 0;
	const grand = Number.parseFloat(invoiceData.grand_total) || 0;

	lines.push({ text: (invoiceData.company || "POS").toUpperCase(), align: "center", bold: true, size: 0x11 });
	if (invoiceData.customer_name || invoiceData.customer) {
		lines.push({ text: invoiceData.customer_name || invoiceData.customer, align: "center" });
	}
	lines.push({ text: "--------------------------------", align: "center" });
	lines.push({ text: "No: " + (invoiceData.name || ""), align: "left" });
	lines.push({ text: "Fecha: " + new Date(invoiceData.posting_date || Date.now()).toLocaleString(), align: "left" });
	lines.push({ text: "--------------------------------" });

	for (const it of items) {
		const name = it.item_name || it.item_code || "";
		const qty = it.quantity || it.qty || 0;
		const rate = Number.parseFloat(it.price_list_rate || it.rate || 0);
		const sub = qty * rate;
		lines.push({ text: name, align: "left" });
		lines.push({ text: lineBetween("   " + qty + " x " + fmt(rate), fmt(sub)), align: "left" });
	}

	lines.push({ text: "--------------------------------" });
	lines.push({ text: lineBetween("TOTAL", fmt(grand)), bold: true, align: "left" });
	if (paid > 0) lines.push({ text: lineBetween("Pagado", fmt(paid)), align: "left" });
	const change = Number.parseFloat(invoiceData.change_amount) || 0;
	if (change > 0) lines.push({ text: lineBetween("Cambio", fmt(change)), align: "left" });

	lines.push({ text: "--------------------------------", align: "center" });
	lines.push({ text: invoiceData.footer || "Gracias por su compra", align: "center" });

	return lines;
}

export async function printReceiptBluetooth(invoiceData) {
	if (!isBluetoothConnected()) throw new Error("Bluetooth printer not connected");
	const lines = buildReceiptText(invoiceData);
	const data = escPosBytes(lines);
	await writeChunked(data);
	log.info("Bluetooth receipt printed:", invoiceData?.name);
}
