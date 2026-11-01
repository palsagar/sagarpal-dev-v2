"""Admin authentication (API.md §5): argon2id password, signed session cookie, CSRF tokens."""

import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Response
from itsdangerous import BadSignature, URLSafeTimedSerializer

SESSION_COOKIE = "admin_session"
CSRF_COOKIE = "admin_csrf"
SESSION_MAX_AGE = 30 * 24 * 3600
COOKIE_PATH = "/admin"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Return an argon2id hash for ``ADMIN_PASSWORD_HASH``.

    Examples
    --------
    .. code-block:: python

        hash_password("correct horse battery staple")  # '$argon2id$v=19$...'
    """
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    """True when ``password`` matches; False for a wrong password or a malformed hash.

    Examples
    --------
    .. code-block:: python

        verify_password(hash_password("pw"), "pw")  # True
    """
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


class AdminAuth:
    """Signs and checks the admin session cookie and the CSRF tokens.

    CSRF uses the signed double-submit pattern: the same signed random token is
    sent as a cookie and as a hidden form field. A forged cross-site form can
    send the cookie but cannot read it to copy it into the field.

    Parameters
    ----------
    secret
        ``SESSION_SECRET``.

    Examples
    --------
    .. code-block:: python

        auth = AdminAuth(settings.session_secret.get_secret_value())
        auth.set_session(response)
    """

    def __init__(self, secret: str) -> None:
        self._serializer = URLSafeTimedSerializer(secret)

    def session_valid(self, cookie: str | None) -> bool:
        """True for an unexpired session cookie that this server signed."""
        return self._loads(cookie, "admin-session") == "admin"

    def set_session(self, response: Response) -> None:
        """Start a 30-day session."""
        value = self._serializer.dumps("admin", salt="admin-session")
        _set_cookie(response, SESSION_COOKIE, value, SESSION_MAX_AGE)

    def clear_session(self, response: Response) -> None:
        """End the session (log out)."""
        response.delete_cookie(
            SESSION_COOKIE, path=COOKIE_PATH, secure=True, httponly=True, samesite="strict"
        )

    def csrf_for(self, cookie: str | None) -> tuple[str, bool]:
        """Return ``(token, is_new)``: the cookie's token when valid, else a fresh one."""
        if cookie and self._loads(cookie, "admin-csrf") is not None:
            return cookie, False
        return self._serializer.dumps(secrets.token_urlsafe(16), salt="admin-csrf"), True

    def csrf_valid(self, cookie: str | None, field: str | None) -> bool:
        """True when the form field equals the cookie and the token carries our signature."""
        if not cookie or not field or not hmac.compare_digest(cookie, field):
            return False
        return self._loads(cookie, "admin-csrf") is not None

    def set_csrf(self, response: Response, token: str) -> None:
        """Send the CSRF cookie."""
        _set_cookie(response, CSRF_COOKIE, token, SESSION_MAX_AGE)

    def _loads(self, value: str | None, salt: str) -> object | None:
        if not value:
            return None
        try:
            loaded: object = self._serializer.loads(value, salt=salt, max_age=SESSION_MAX_AGE)
        except BadSignature:  # also covers SignatureExpired
            return None
        return loaded


def _set_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        path=COOKIE_PATH,
        secure=True,
        httponly=True,
        samesite="strict",
    )
