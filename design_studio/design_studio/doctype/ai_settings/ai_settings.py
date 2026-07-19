import frappe
from frappe.model.document import Document


class AISettings(Document):
	pass


def has_anthropic_api_key() -> bool:
	return bool(frappe.get_cached_doc("AI Settings").get_password("api_key", raise_exception=False))


def has_google_api_key() -> bool:
	return bool(
		frappe.get_cached_doc("AI Settings").get_password("google_api_key", raise_exception=False)
	)


def get_anthropic_api_key() -> str:
	api_key = frappe.get_cached_doc("AI Settings").get_password("api_key", raise_exception=False)
	if not api_key:
		frappe.throw(
			frappe._(
				"The Anthropic API key has not been configured yet. Ask an administrator to set it in AI Settings."
			)
		)
	return api_key


def get_google_api_key() -> str:
	api_key = frappe.get_cached_doc("AI Settings").get_password(
		"google_api_key", raise_exception=False
	)
	if not api_key:
		frappe.throw(
			frappe._(
				"The Google (Gemini) API key has not been configured yet. Ask an administrator to set it in AI Settings."
			)
		)
	return api_key


def has_huggingface_api_key() -> bool:
	return bool(
		frappe.get_cached_doc("AI Settings").get_password("huggingface_api_key", raise_exception=False)
	)


def get_huggingface_api_key() -> str:
	api_key = frappe.get_cached_doc("AI Settings").get_password(
		"huggingface_api_key", raise_exception=False
	)
	if not api_key:
		frappe.throw(
			frappe._(
				"The Hugging Face API token has not been configured yet. Ask an administrator to set it in AI Settings."
			)
		)
	return api_key


def get_default_model() -> str:
	return frappe.get_cached_doc("AI Settings").default_model or "claude-opus-4-8"


def get_image_model() -> str:
	return frappe.get_cached_doc("AI Settings").image_model or "black-forest-labs/FLUX.1-schnell"


def get_system_prompt() -> str | None:
	return frappe.get_cached_doc("AI Settings").system_prompt or None
