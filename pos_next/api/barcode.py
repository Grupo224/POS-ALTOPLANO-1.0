import io

import frappe
from frappe.utils.file_manager import save_file


def _render_code_image(item_code):
	"""Render a combined QR + Code 39 barcode image, return PNG bytes."""
	import segno
	import barcode
	from barcode.writer import ImageWriter
	from PIL import Image

	# QR code (encodes the item code)
	qr_buf = io.BytesIO()
	segno.make(item_code, error="m").save(qr_buf, kind="png", scale=4)
	qr_buf.seek(0)

	# Code 39 (uppercase alphanumeric; matches the "CODE-39" barcode_type option)
	bc = barcode.get("code39", item_code.upper(), writer=ImageWriter())
	bc_buf = io.BytesIO()
	bc.write(bc_buf, options={"write_text": False})
	bc_buf.seek(0)

	qr_img = Image.open(qr_buf).convert("RGB")
	bc_img = Image.open(bc_buf).convert("RGB")

	# Cap barcode width so the combined image stays tidy
	if bc_img.width > 320:
		ratio = 320 / bc_img.width
		bc_img = bc_img.resize((320, int(bc_img.height * ratio)))

	gap = 16
	width = max(qr_img.width, bc_img.width)
	height = qr_img.height + bc_img.height + gap
	combo = Image.new("RGB", (width, height), "white")
	combo.paste(qr_img, ((width - qr_img.width) // 2, 0))
	combo.paste(bc_img, ((width - bc_img.width) // 2, qr_img.height + gap))

	out = io.BytesIO()
	combo.save(out, format="PNG")
	return out.getvalue()


@frappe.whitelist()
def generate_item_barcode(item_code):
	"""Generate a QR + Code 39 barcode for an Item, attach the combined PNG
	image to the Item, and add a row to its \"barcodes\" child table."""
	item_code = (item_code or "").strip()
	if not item_code:
		frappe.throw("item_code is required")

	item = frappe.get_doc("Item", item_code)

	try:
		png = _render_code_image(item_code)
	except Exception as e:
		frappe.log_error(title="POSNext barcode generation failed", message=str(e))
		frappe.throw("Could not generate barcode image: " + str(e))

	fname = item_code + "_barcode_qr.png"
	file_doc = save_file(fname, png, "Item", item_code, is_private=0)
	file_url = file_doc.file_url if hasattr(file_doc, "file_url") else "/files/" + fname

	# Append the barcode row (dedupe against existing rows)
	exists = any((r.barcode or "").strip() == item_code for r in (item.barcodes or []))
	if not exists:
		item.append("barcodes", {"barcode": item_code, "barcode_type": "CODE-39"})
		item.save(ignore_permissions=True)
		frappe.db.commit()

	return {"barcode": item_code, "file_url": file_url}
