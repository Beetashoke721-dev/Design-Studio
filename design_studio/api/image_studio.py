import io

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils.file_manager import save_file
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from PIL import Image, ImageOps

from design_studio.design_studio.doctype.ai_settings.ai_settings import (
	get_google_api_key,
	get_image_model,
)

MAX_PROMPT_LENGTH = 2000

MIME_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
}


def _get_owned_image(image: str):
	doc = frappe.get_doc("AI Generated Image", image)
	if doc.user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("You don't have access to this image"), frappe.PermissionError)
	return doc


def _get_image_bytes(doc) -> bytes:
	file_doc = frappe.get_doc("File", {"file_url": doc.image})
	return file_doc.get_content()


def _call_gemini_image(contents) -> tuple[bytes, str]:
	client = genai.Client(api_key=get_google_api_key())
	config = genai_types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
	try:
		response = client.models.generate_content(
			model=get_image_model(), contents=contents, config=config
		)
	except genai_errors.APIError as e:
		if e.code in (401, 403):
			frappe.throw(_("The configured Google (Gemini) API key is invalid. Please check AI Settings."))
		if e.code == 429:
			frappe.throw(_("Gemini is rate-limiting this API key right now. Please try again shortly."))
		frappe.throw(_("Gemini API error: {0}").format(e.message))

	candidates = response.candidates or []
	parts = candidates[0].content.parts if candidates and candidates[0].content else []
	for part in parts:
		if part.inline_data and part.inline_data.data:
			return part.inline_data.data, part.inline_data.mime_type or "image/png"

	frappe.throw(_("Gemini did not return an image. Please try a different prompt."))


def _save_generated_image(
	image_bytes: bytes,
	mime_type: str,
	source_type: str,
	prompt: str | None,
	model: str | None,
	parent_image: str | None = None,
):
	ext = MIME_EXTENSIONS.get(mime_type, "png")
	doc = frappe.get_doc(
		{
			"doctype": "AI Generated Image",
			"source_type": source_type,
			"prompt": prompt,
			"model": model,
			"mime_type": mime_type,
			"parent_image": parent_image,
		}
	).insert()

	file_doc = save_file(
		f"{frappe.generate_hash(length=10)}.{ext}",
		image_bytes,
		"AI Generated Image",
		doc.name,
		is_private=1,
	)
	doc.db_set("image", file_doc.file_url)
	return doc


def _serialize(doc) -> dict:
	return {
		"name": doc.name,
		"image": doc.image,
		"prompt": doc.prompt,
		"source_type": doc.source_type,
		"parent_image": doc.parent_image,
		"model": doc.model,
	}


@frappe.whitelist()
@rate_limit(limit=15, seconds=60)
def generate_image(prompt: str):
	"""Generate a new image from a text prompt using Gemini."""
	prompt = (prompt or "").strip()
	if not prompt:
		frappe.throw(_("Prompt cannot be empty"))
	if len(prompt) > MAX_PROMPT_LENGTH:
		frappe.throw(_("Prompt is too long (max {0} characters)").format(MAX_PROMPT_LENGTH))

	model = get_image_model()
	image_bytes, mime_type = _call_gemini_image(prompt)
	doc = _save_generated_image(image_bytes, mime_type, "Generated", prompt, model)
	return _serialize(doc)


@frappe.whitelist()
@rate_limit(limit=15, seconds=60)
def edit_image(image: str, prompt: str):
	"""Edit an existing image with a text instruction using Gemini, saved as a new linked image."""
	prompt = (prompt or "").strip()
	if not prompt:
		frappe.throw(_("Edit instruction cannot be empty"))
	if len(prompt) > MAX_PROMPT_LENGTH:
		frappe.throw(_("Prompt is too long (max {0} characters)").format(MAX_PROMPT_LENGTH))

	source = _get_owned_image(image)
	source_bytes = _get_image_bytes(source)
	model = get_image_model()

	contents = [
		prompt,
		genai_types.Part.from_bytes(data=source_bytes, mime_type=source.mime_type or "image/png"),
	]
	image_bytes, mime_type = _call_gemini_image(contents)
	doc = _save_generated_image(
		image_bytes, mime_type, "AI Edit", prompt, model, parent_image=source.name
	)
	return _serialize(doc)


@frappe.whitelist()
@rate_limit(limit=30, seconds=60)
def save_manual_edit(image: str, data_url: str):
	"""Persist a manually edited image (crop/rotate/filter/text) exported from the browser canvas."""
	source = _get_owned_image(image)
	if not data_url or "base64," not in data_url:
		frappe.throw(_("Invalid image data"))
	mime_type = data_url.split(";")[0].replace("data:", "") or "image/png"
	ext = MIME_EXTENSIONS.get(mime_type, "png")

	doc = frappe.get_doc(
		{
			"doctype": "AI Generated Image",
			"source_type": "Manual Edit",
			"mime_type": mime_type,
			"parent_image": source.name,
		}
	).insert()

	file_doc = save_file(
		f"{frappe.generate_hash(length=10)}.{ext}",
		data_url,
		"AI Generated Image",
		doc.name,
		decode=True,
		is_private=1,
	)
	doc.db_set("image", file_doc.file_url)
	return _serialize(doc)


@frappe.whitelist()
def list_images():
	return frappe.get_all(
		"AI Generated Image",
		filters={"user": frappe.session.user},
		fields=["name", "image", "prompt", "source_type", "parent_image", "model", "creation"],
		order_by="creation desc",
	)


@frappe.whitelist()
@rate_limit(limit=10, seconds=60)
def export_pdf(images: list[str], title: str | None = None):
	"""Combine the given images (in order) into a single multi-page PDF and save it."""
	if not images:
		frappe.throw(_("Select at least one image to export"))

	docs = [_get_owned_image(image) for image in images]

	prepared = []
	for doc in docs:
		img = Image.open(io.BytesIO(_get_image_bytes(doc)))
		img = ImageOps.exif_transpose(img)
		if img.mode in ("RGBA", "LA", "P"):
			rgba = img.convert("RGBA")
			background = Image.new("RGB", img.size, (255, 255, 255))
			background.paste(rgba, mask=rgba.split()[-1])
			img = background
		elif img.mode != "RGB":
			img = img.convert("RGB")
		prepared.append(img)

	buffer = io.BytesIO()
	prepared[0].save(buffer, format="PDF", save_all=True, append_images=prepared[1:])

	export_doc = frappe.get_doc(
		{
			"doctype": "AI PDF Export",
			"title": (title or "").strip() or None,
			"images": [{"image": doc.name} for doc in docs],
		}
	).insert()

	file_doc = save_file(
		f"{frappe.generate_hash(length=10)}.pdf",
		buffer.getvalue(),
		"AI PDF Export",
		export_doc.name,
		is_private=1,
	)
	export_doc.db_set("pdf_file", file_doc.file_url)
	return {"name": export_doc.name, "pdf_file": file_doc.file_url}
