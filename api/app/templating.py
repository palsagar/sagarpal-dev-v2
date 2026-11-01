"""One Jinja2 environment for the admin pages and the RSS template, autoescaped everywhere."""

from pathlib import Path

import jinja2
from fastapi.templating import Jinja2Templates

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

# autoescape=True for every template, including feed.xml.j2 (select_autoescape would
# skip it because of the .j2 extension).
environment = jinja2.Environment(
    loader=jinja2.FileSystemLoader(TEMPLATES_DIR), autoescape=True, undefined=jinja2.StrictUndefined
)
templates = Jinja2Templates(env=environment)
