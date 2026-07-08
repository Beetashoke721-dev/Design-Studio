import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import validate_email_address
from frappe.utils.oauth import get_oauth2_authorize_url
from frappe.website.utils import is_signup_disabled

DEFAULT_REDIRECT = "/design_studio"


def _google_configured() -> bool:
	key = frappe.db.get_value(
		"Social Login Key", "google", ["enable_social_login", "client_id"], as_dict=True
	)
	return bool(key and key.enable_social_login and key.client_id)


@frappe.whitelist(allow_guest=True)
def login_options():
	"""Tell the frontend which login methods are currently available."""
	return {
		"google": _google_configured(),
		"signup_enabled": not is_signup_disabled(),
	}


@frappe.whitelist(allow_guest=True)
def google_login_url(redirect_to: str | None = None):
	"""Return the Google OAuth authorize URL to redirect the browser to."""
	if not _google_configured():
		frappe.throw(_("Google login is not configured for this site. Please contact the administrator."))

	return get_oauth2_authorize_url("google", redirect_to or DEFAULT_REDIRECT)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=10, seconds=60 * 60)
def sign_up(email: str, full_name: str, password: str):
	"""Create a new Website User with a password and log them in."""
	if is_signup_disabled():
		frappe.throw(_("Sign up is disabled"), frappe.PermissionError)

	email = (email or "").strip().lower()
	full_name = (full_name or "").strip()

	if not email or not full_name or not password:
		frappe.throw(_("Full name, email and password are required"))

	validate_email_address(email, throw=True)

	if len(password) < 8:
		frappe.throw(_("Password must be at least 8 characters long"))

	if frappe.db.exists("User", email):
		frappe.throw(_("An account with this email already exists. Please log in instead."))

	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": full_name,
			"enabled": 1,
			"user_type": "Website User",
			"send_welcome_email": 0,
			"new_password": password,
		}
	)
	# Guests can't normally create User records or set roles - this is the one
	# controlled path where that's intentional (self-service signup).
	user.flags.ignore_permissions = True
	user.flags.no_welcome_mail = True
	user.insert()

	frappe.local.login_manager.login_as(email)

	return {"email": email, "full_name": full_name}
