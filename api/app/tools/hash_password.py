"""Print an argon2id hash for ADMIN_PASSWORD_HASH.

Run with ``uv run python -m app.tools.hash_password`` and type the password twice.
The password is read without echo and never written anywhere.
"""

import getpass
import sys

from app.auth import hash_password


def main() -> int:
    """Prompt twice and print the hash; exit status 1 when the entries differ or are empty.

    Examples
    --------
    .. code-block:: console

        $ uv run python -m app.tools.hash_password
    """
    password = getpass.getpass("Admin password: ")
    if not password or password != getpass.getpass("Repeat: "):
        print("Passwords are empty or differ.", file=sys.stderr)
        return 1
    print(hash_password(password))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
