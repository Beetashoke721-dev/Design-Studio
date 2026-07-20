import io

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils.file_manager import save_file
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError
from PIL import Image, ImageOps

from design_studio.design_studio.doctype.ai_settings.ai_settings import (
	get_google_api_key,
	get_huggingface_api_key,
	get_image_model,
	has_google_api_key,
	has_huggingface_api_key,
)

MAX_PROMPT_LENGTH = 2000

MIME_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
}

IMAGE_MODELS = [
	{"id": "gemini-2.5-flash-image", "label": "Gemini 2.5 Flash Image", "provider": "google"},
	{
		"id": "black-forest-labs/FLUX.1-schnell",
		"label": "FLUX.1 Schnell (Hugging Face, free)",
		"provider": "huggingface",
	},
]
IMAGE_MODEL_PROVIDER = {m["id"]: m["provider"] for m in IMAGE_MODELS}


def _get_owned_image(image: str):
	doc = frappe.get_doc("AI Generated Image", image)
	if doc.user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("You don't have access to this image"), frappe.PermissionError)
	return doc


def _get_image_bytes(doc) -> bytes:
	file_doc = frappe.get_doc("File", {"file_url": doc.image})
	return file_doc.get_content()


def _call_gemini_image(contents, model: str) -> tuple[bytes, str]:
	client = genai.Client(api_key=get_google_api_key())
	config = genai_types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
	try:
		response = client.models.generate_content(model=model, contents=contents, config=config)
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


def _call_huggingface_image(prompt: str, model: str) -> tuple[bytes, str]:
	# provider="auto" lets Hugging Face route to whichever backend currently serves
	# this model - hardcoding a specific provider (e.g. hf-inference) breaks whenever
	# that provider's catalog changes, which happens often on their free tier.
	client = InferenceClient(provider="auto", api_key=get_huggingface_api_key())
	try:
		image = client.text_to_image(prompt, model=model)
	except HfHubHTTPError as e:
		status_code = e.response.status_code if e.response is not None else None
		if status_code in (401, 403):
			frappe.throw(_("The configured Hugging Face API token is invalid. Please check AI Settings."))
		if status_code == 429:
			frappe.throw(_("Hugging Face is rate-limiting this token right now. Please try again shortly."))
		if status_code == 503:
			frappe.throw(_("The Hugging Face model is warming up. Please try again in about a minute."))
		frappe.throw(_("Hugging Face API error: {0}").format(e.server_message or str(e)))

	buffer = io.BytesIO()
	image.save(buffer, format="PNG")
	return buffer.getvalue(), "image/png"


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
def get_available_image_models():
	"""Image models the frontend can offer, flagged with whether their API key is configured."""
	google_ready = has_google_api_key()
	huggingface_ready = has_huggingface_api_key()
	return [
		{**m, "configured": google_ready if m["provider"] == "google" else huggingface_ready}
		for m in IMAGE_MODELS
	]


@frappe.whitelist()
@rate_limit(limit=15, seconds=60)
def generate_image(prompt: str, model: str | None = None):
	"""Generate a new image from a text prompt, using Gemini or a free Hugging Face model."""
	prompt = (prompt or "").strip()
	if not prompt:
		frappe.throw(_("Prompt cannot be empty"))
	if len(prompt) > MAX_PROMPT_LENGTH:
		frappe.throw(_("Prompt is too long (max {0} characters)").format(MAX_PROMPT_LENGTH))

	model = model or get_image_model()
	provider = IMAGE_MODEL_PROVIDER.get(model)
	if provider is None:
		frappe.throw(_("Unknown image model: {0}").format(model))

	if provider == "google":
		image_bytes, mime_type = _call_gemini_image(prompt, model)
	else:
		image_bytes, mime_type = _call_huggingface_image(prompt, model)

	doc = _save_generated_image(image_bytes, mime_type, "Generated", prompt, model)
	return _serialize(doc)


@frappe.whitelist()
@rate_limit(limit=15, seconds=60)
def edit_image(image: str, prompt: str, model: str | None = None):
	"""Edit an existing image with a text instruction, saved as a new linked image.

	Gemini can condition directly on the image's pixels. Hugging Face's free
	text-to-image models can't take an image as input, so for those we instead
	regenerate a fresh image from the original prompt plus the edit instruction.
	"""
	prompt = (prompt or "").strip()
	if not prompt:
		frappe.throw(_("Edit instruction cannot be empty"))
	if len(prompt) > MAX_PROMPT_LENGTH:
		frappe.throw(_("Prompt is too long (max {0} characters)").format(MAX_PROMPT_LENGTH))

	source = _get_owned_image(image)
	model = model or source.model or get_image_model()
	provider = IMAGE_MODEL_PROVIDER.get(model)
	if provider is None:
		frappe.throw(_("Unknown image model: {0}").format(model))

	if provider == "google":
		source_bytes = _get_image_bytes(source)
		contents = [
			prompt,
			genai_types.Part.from_bytes(data=source_bytes, mime_type=source.mime_type or "image/png"),
		]
		image_bytes, mime_type = _call_gemini_image(contents, model)
	else:
		combined_prompt = f"{source.prompt}. {prompt}" if source.prompt else prompt
		image_bytes, mime_type = _call_huggingface_image(combined_prompt, model)

	doc = _save_generated_image(
		image_bytes, mime_type, "AI Edit", prompt, model, parent_image=source.name
	)
	return _serialize(doc)


@frappe.whitelist()
@rate_limit(limit=15, seconds=60)
def extract_element(image: str):
	"""Cut the main subject out of an image onto a transparent background.

	Uses Gemini specifically - it's the only provider here that can condition on an
	existing image's pixels. Hugging Face's free-tier routing for dedicated
	background-removal models proved unreliable (inconsistent provider/task support
	between calls to the same model), so this doesn't offer that as a fallback.
	"""
	if not has_google_api_key():
		frappe.throw(_("Extracting an element requires a configured Google (Gemini) API key."))

	source = _get_owned_image(image)
	source_bytes = _get_image_bytes(source)
	contents = [
		"Remove the background completely and keep only the main subject, cleanly cut out. "
		"Output a PNG with a fully transparent alpha background outside the subject - not "
		"white, not any solid color, true transparency.",
		genai_types.Part.from_bytes(data=source_bytes, mime_type=source.mime_type or "image/png"),
	]
	image_bytes, mime_type = _call_gemini_image(contents, "gemini-2.5-flash-image")

	doc = _save_generated_image(
		image_bytes, mime_type, "Element", source.prompt, "gemini-2.5-flash-image", parent_image=source.name
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
@rate_limit(limit=30, seconds=60)
def save_design(data_url: str, title: str | None = None):
	"""Persist a composed design (blank canvas + text/image elements) as a new image."""
	if not data_url or "base64," not in data_url:
		frappe.throw(_("Invalid image data"))
	mime_type = data_url.split(";")[0].replace("data:", "") or "image/png"
	ext = MIME_EXTENSIONS.get(mime_type, "png")

	doc = frappe.get_doc(
		{
			"doctype": "AI Generated Image",
			"source_type": "Design",
			"mime_type": mime_type,
			"prompt": (title or "").strip() or None,
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
