import random
import string

import src.lib.db as db


def get_random_color():
    """Generates a random hex color with a minimum level of perceived brightness.
    See https://stackoverflow.com/questions/12043187/how-to-check-if-hex-color-is-too-black
    """
    max_threshold = 180
    min_threshold = 30
    luma = 0
    while luma >= max_threshold or luma <= min_threshold:
        r = random.randint(0, 255)
        g = random.randint(0, 255)
        b = random.randint(0, 255)
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b  # per ITU-R BT.709

    return "#%02x%02x%02x" % (r, g, b)


async def generate_pseudonym() -> dict:
    """Draw a random mountain + letter + color, return pseudonym data."""
    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, fullname, canton, height FROM auth.mountain_templates ORDER BY random() LIMIT 1"
        )

    if not row:
        raise RuntimeError("No mountain templates found in auth.mountain_templates")

    letter = random.choice(string.ascii_uppercase)
    color = get_random_color()
    display_name = f"{letter}. {row['name']}"
    return {
        "templateId": row["id"],
        "displayName": display_name,
        "mountainName": row["name"],
        "mountainFullname": row["fullname"],
        "canton": row["canton"],
        "height": float(row["height"]),
        "color": color,
    }
