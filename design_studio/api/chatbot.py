import anthropic
import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types

from design_studio.design_studio.doctype.ai_settings.ai_settings import (
	get_anthropic_api_key,
	get_default_model,
	get_google_api_key,
	get_system_prompt,
	has_anthropic_api_key,
	has_google_api_key,
)

MAX_MESSAGE_LENGTH = 8000

# Gemini models are listed because Google's API has a genuinely free usage tier,
# unlike Anthropic's pay-as-you-go-only API - useful for testing without billing.
AVAILABLE_MODELS = [
	{"id": "claude-opus-4-8", "label": "Claude Opus 4.8", "provider": "anthropic"},
	{"id": "claude-sonnet-5", "label": "Claude Sonnet 5", "provider": "anthropic"},
	{"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5", "provider": "anthropic"},
	{"id": "gemini-3.5-flash", "label": "Gemini 3.5 Flash (free tier)", "provider": "google"},
	{"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash (free tier)", "provider": "google"},
]
MODEL_PROVIDER = {m["id"]: m["provider"] for m in AVAILABLE_MODELS}


def _get_owned_conversation(conversation: str):
	doc = frappe.get_doc("AI Chat Conversation", conversation)
	if doc.user != frappe.session.user and "System Manager" not in frappe.get_roles():
		frappe.throw(_("You don't have access to this conversation"), frappe.PermissionError)
	return doc


def _build_title(message: str) -> str:
	title = " ".join(message.split())
	return title[:60] + ("…" if len(title) > 60 else "")


def _call_anthropic(model: str, system_prompt: str | None, history: list) -> str:
	client = anthropic.Anthropic(api_key=get_anthropic_api_key())
	try:
		response = client.messages.create(
			model=model,
			max_tokens=4096,
			system=system_prompt or anthropic.NOT_GIVEN,
			messages=[
				{"role": "user" if row.role == "User" else "assistant", "content": row.content}
				for row in history
			],
		)
	except anthropic.AuthenticationError:
		frappe.throw(_("The configured Anthropic API key is invalid. Please check AI Settings."))
	except anthropic.PermissionDeniedError:
		frappe.throw(_("The Anthropic API key does not have permission to use this model."))
	except anthropic.RateLimitError:
		frappe.throw(_("Claude is rate-limiting this API key right now. Please try again shortly."))
	except anthropic.APIStatusError as e:
		if e.status_code == 400 and "credit balance" in str(e).lower():
			frappe.throw(
				_("The Anthropic account has insufficient credits. Please add credits in Plans & Billing.")
			)
		frappe.throw(_("Claude API error: {0}").format(e.message))
	except anthropic.APIConnectionError:
		frappe.throw(_("Could not reach the Claude API. Please try again."))

	return next((block.text for block in response.content if block.type == "text"), "")


def _call_google(model: str, system_prompt: str | None, history: list) -> str:
	client = genai.Client(api_key=get_google_api_key())
	contents = [
		genai_types.Content(
			role="user" if row.role == "User" else "model",
			parts=[genai_types.Part(text=row.content)],
		)
		for row in history
	]
	config = genai_types.GenerateContentConfig(system_instruction=system_prompt or None)

	try:
		response = client.models.generate_content(model=model, contents=contents, config=config)
	except genai_errors.APIError as e:
		if e.code in (401, 403):
			frappe.throw(_("The configured Google (Gemini) API key is invalid. Please check AI Settings."))
		if e.code == 429:
			frappe.throw(_("Gemini is rate-limiting this API key right now. Please try again shortly."))
		frappe.throw(_("Gemini API error: {0}").format(e.message))

	return response.text or ""


@frappe.whitelist()
def get_available_models():
	"""Models the frontend can offer, flagged with whether their API key is configured."""
	anthropic_ready = has_anthropic_api_key()
	google_ready = has_google_api_key()
	return [
		{**m, "configured": anthropic_ready if m["provider"] == "anthropic" else google_ready}
		for m in AVAILABLE_MODELS
	]


@frappe.whitelist()
@rate_limit(limit=20, seconds=60)
def send_message(message: str, conversation: str | None = None, model: str | None = None):
	"""Send a user message to the chosen model and return the assistant's reply."""
	message = (message or "").strip()
	if not message:
		frappe.throw(_("Message cannot be empty"))
	if len(message) > MAX_MESSAGE_LENGTH:
		frappe.throw(_("Message is too long (max {0} characters)").format(MAX_MESSAGE_LENGTH))

	if conversation:
		conversation_doc = _get_owned_conversation(conversation)
	else:
		model = model or get_default_model()
		if model not in MODEL_PROVIDER:
			frappe.throw(_("Unknown model: {0}").format(model))
		provider = MODEL_PROVIDER[model]
		if provider == "anthropic" and not has_anthropic_api_key():
			frappe.throw(_("The Anthropic API key has not been configured yet. Ask an administrator to set it in AI Settings."))
		if provider == "google" and not has_google_api_key():
			frappe.throw(_("The Google (Gemini) API key has not been configured yet. Ask an administrator to set it in AI Settings."))
		conversation_doc = frappe.get_doc(
			{"doctype": "AI Chat Conversation", "title": _build_title(message), "model": model}
		).insert()

	frappe.get_doc(
		{
			"doctype": "AI Chat Message",
			"conversation": conversation_doc.name,
			"role": "User",
			"content": message,
		}
	).insert(ignore_permissions=True)
	# Commit now so the user's message survives even if the model call below fails.
	frappe.db.commit()

	history = frappe.get_all(
		"AI Chat Message",
		filters={"conversation": conversation_doc.name},
		fields=["role", "content"],
		order_by="creation asc",
	)

	system_prompt = get_system_prompt()
	conversation_model = conversation_doc.model
	if MODEL_PROVIDER.get(conversation_model) == "google":
		reply = _call_google(conversation_model, system_prompt, history)
	else:
		reply = _call_anthropic(conversation_model, system_prompt, history)

	frappe.get_doc(
		{
			"doctype": "AI Chat Message",
			"conversation": conversation_doc.name,
			"role": "Assistant",
			"content": reply,
		}
	).insert(ignore_permissions=True)

	return {
		"conversation": conversation_doc.name,
		"title": conversation_doc.title,
		"model": conversation_model,
		"reply": reply,
	}


@frappe.whitelist()
def list_conversations():
	return frappe.get_all(
		"AI Chat Conversation",
		filters={"user": frappe.session.user},
		fields=["name", "title", "model", "modified"],
		order_by="modified desc",
	)


@frappe.whitelist()
def get_messages(conversation: str):
	_get_owned_conversation(conversation)
	return frappe.get_all(
		"AI Chat Message",
		filters={"conversation": conversation},
		fields=["name", "role", "content", "creation"],
		order_by="creation asc",
	)
