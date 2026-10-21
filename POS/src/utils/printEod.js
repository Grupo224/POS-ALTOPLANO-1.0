import { silentPrintDoc } from "./printInvoice";
import { call } from "@/utils/apiWrapper";

const EOD_PRINT_FORMAT = "POS Next EOD Report";
const EOD_DOCTYPE = "POS Closing Shift";

export async function printEODReport(closingShiftName) {
	await silentPrintDoc(EOD_DOCTYPE, closingShiftName, EOD_PRINT_FORMAT);
}

/**
 * Open the EOD report in a browser window with the OS print dialog.
 * Works on mobile: the user can "Save as PDF", AirPrint, or send it to
 * any printer the OS knows about.
 */
export async function printEODBrowser(closingShiftName) {
	const result = await call("frappe.www.printview.get_html_and_style", {
		doc: EOD_DOCTYPE,
		name: closingShiftName,
		print_format: EOD_PRINT_FORMAT,
		no_letterhead: 1,
	});
	const html = result?.html || result?.message?.html;
	const style = result?.style || result?.message?.style || "";
	if (!html) throw new Error("Failed to get EOD print HTML");

	const fullHTML = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>EOD ${closingShiftName}</title><style>${style}</style></head>
<body>${html}</body>
</html>`;

	const w = window.open("", "_blank");
	if (!w) throw new Error("Popup blocked — allow popups for this site");
	w.document.write(fullHTML);
	w.document.close();
	w.onload = () => setTimeout(() => w.print(), 300);
}

/**
 * Download the EOD report as a PDF file. Works on mobile — the phone
 * downloads the PDF and the user can open/share/print it.
 */
export async function downloadEODPDF(closingShiftName) {
	const params = new URLSearchParams({
		doctype: EOD_DOCTYPE,
		name: closingShiftName,
		format: EOD_PRINT_FORMAT,
		no_letterhead: 1,
	});
	const url = `/api/method/frappe.utils.print_format.download_pdf?${params}`;
	const res = await fetch(url, { credentials: "include" });
	if (!res.ok) throw new Error(`PDF download failed (${res.status})`);
	const blob = await res.blob();
	const filename = `${closingShiftName.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(link.href);
}
