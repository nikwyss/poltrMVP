from src.lib.fastapi import app


@app.get("/.well-known/lexicons/app/info/poltr/eid/verification.json")
async def get_lexicon_eid_verification():
    return {
        "lexicon": 1,
        "id": "app.info.poltr.eid.verification",
        "defs": {
            "main": {
                "type": "record",
                "description": "E-ID verification flag for a user.",
                "key": "literal",
                "record": {
                    "type": "object",
                    "required": ["eidIssuer", "verifiedBy", "verifiedAt"],
                    "properties": {
                        "eidIssuer": {"type": "string", "format": "did"},
                        "eidHash": {"type": "string"},
                        "verifiedBy": {"type": "string", "format": "did"},
                        "verifiedAt": {"type": "string", "format": "datetime"},
                    },
                },
            }
        },
    }
