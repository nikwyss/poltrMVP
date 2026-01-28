
https://swiyu-admin-ch.github.io/cookbooks/onboarding-base-and-trust-registry/

# PUBLIC KEY: app.poltr.info
Public Key (für DID Doc):BsMCw9i9j8HoNX32i3bNKAjhO4qEdbC+mEi9lwHfQtI=

## Generate log file

java -jar didtoolbox-1.3.1-jar-with-dependencies.jar create --identifier-registry-url "$IDENTIFIER_REGISTRY_URL"

.didtoolbox/id_ed25519


export SWIYU_IDENTIFIER_REGISTRY_ACCESS_TOKEN=""
export IDENTIFIER_REGISTRY_ID = "<did-log>" // !!!  contains "
export SWIYU_PARTNER_ID="3ce97955-8c71-41f8-9b31-cd156370e168"


# UPLOAD LOG

curl --data-binary '<your-generated-didlog-string-here>' \
  -H "Authorization: Bearer $SWIYU_IDENTIFIER_REGISTRY_ACCESS_TOKEN" \
  -H "Content-Type: application/jsonl+json" \
  -X PUT "https://identifier-reg-api.trust-infra.swiyu-int.admin.ch/api/v1/identifier/business-entities/$SWIYU_PARTNER_ID/identifier-entries/$IDENTIFIER_REGISTRY_ID"


# CHECK LOG
curl "https://identifier-reg.trust-infra.swiyu-int.admin.ch/api/v1/did/$IDENTIFIER_REGISTRY_ID/did.jsonl"



# verify trusted invitee

https://swiyu-admin-ch.github.io/cookbooks/onboarding-base-and-trust-registry/#-4-become-a-trusted-participant


# manage users
https://eportal.admin.ch/manage-users/permissions

user=78045C51-6348-49D3-54A6-B53AFF7D9B02


##   <!-- "jwt_secured_authorization_request": false, -->
  "accepted_issuer_dids": [
    "${VERIFICATION_ID}"
 ],






# CURL REQUEST
source <(curl -s \
  -X 'POST' 'https://verifier.poltr.info/management/api/verifications' \
  -H 'accept: */*' \
  -H 'Content-Type: application/json' \
  -d '{
  "accepted_issuer_dids": [
    "did:web:verifier.poltr.info"
 ],
  "jwt_secured_authorization_request": false,
  "response_mode": "direct_post",
  "presentation_definition": {
    "id": "00000000-0000-0000-0000-000000000002",
    "input_descriptors": [
        {
            "id": "11111111-1111-1111-1111-111111111112",
            "format": {
                "vc+sd-jwt": {
                    "sd-jwt_alg_values": [
                        "ES256"
                    ],
                    "kb-jwt_alg_values": [
                        "ES256"
                    ]
                }
            },
            "constraints": {
                "fields": [
                    {
                        "path": [
                            "$.vct"
                        ],
                        "filter": {
                            "type": "string",
                            "const": "betaid-sdjwt"
                        }
                    },
                    {
                        "path": [
                            "$.personal_administrative_number"
                        ]
                    }
                ]
            }
        }
    ]
  }
}' | jq -r '"LOCAL_VERIFICATION_ID="+.id+"\nVERIFICATION_URL="+.verification_url+"\nVERIFICATION_DEEPLINK=\""+.verification_deeplink+"\"\necho\necho $VERIFICATION_DEEPLINK | qrencode -t ansiutf8"')



###}' | jq -r '"LOCAL_VERIFICATION_ID="+.id+"\nVERIFICATION_URL="+.verification_url+"\nVERIFICATION_DEEPLINK=\""+.verification_deeplink+"\"\necho\necho $VERIFICATION_DEEPLINK | ###qrencode -t ansiutf8"')

## }' | jq -r '"LOCAL_VERIFICATION_ID="+.id+"\nVERIFICATION_URL="+.verification_url+"\nVERIFICATION_DEEPLINK=\""+.verification_deeplink+"\"\necho\necho $VERIFICATION_URL | ## qrencode -t ansiutf8"')


# RESULT

{"id":"0b50e410-cd00-45fa-b2a3-3f15ad86ce1e","request_nonce":"9/GROT8RVDUohHmXPRo1Ljwqz2F89PLh","state":"PENDING","presentation_definition":{"id":"00000000-0000-0000-0000-000000000000","format":{},"input_descriptors":[{"id":"11111111-1111-1111-1111-111111111111","format":{"vc+sd-jwt":{"sd-jwt_alg_values":["ES256"],"kb-jwt_alg_values":["ES256"]}},"constraints":{"format":{},"fields":[{"path":["$.vct"],"filter":{"type":"string","const":"betaid-sdjwt"}},{"path":["$.age_over_18"]}]}}]},"verification_url":"https://verifier.poltr.info/oid4vp/api/request-object/0b50e410-cd00-45fa-b2a3-3f15ad86ce1e","verification_deeplink":"swiyu-verify://?client_id=did%3Atdw%3AQmPGmyfWv9Qttzh393hQjS8LXu1TtNbRTBKG5VztVXHsfh%3Aidentifier-reg.trust-infra.swiyu-int.admin.ch%3Aapi%3Av1%3Adid%3A6e0b847a-ea8f-46c0-8d9e-2832a71e0eac&request_uri=https%3A%2F%2Fverifier.poltr.info%2Foid4vp%2Fapi%2Frequest-object%2F0b50e410-cd00-45fa-b2a3-3f15ad86ce1e"}








# VERIFIY

curl -X GET \
  -H "Accept: application/json" \
  https://verifier.poltr.info/management/api/verifications/${LOCAL_VERIFICATION_ID}





# SUCCESS DATA

 "wallet_response": {
    "error_code": null,
    "error_description": null,
    "credential_subject_data": {
      "age_over_18": "true",
      "vct_metadata_uri#integrity": "sha256-ph0HNtvXefqelHdIYyl/BXwzJ+bNTbbqUrkzYSb7KS8=",
      "vct_metadata_uri": "https://bcs.admin.ch/bcs-web/metadata/betaid-sdjwt/vct/20251114145003",
      "vct": "betaid-sdjwt",
      "iss": "did:tdw:QmPEZPhDFR4nEYSFK5bMnvECqdpf1tPTPJuWs9QrMjCumw:identifier-reg.trust-infra.swiyu-int.admin.ch:api:v1:did:9a5559f0-b81c-4368-a170-e7b4ae424527",
      "cnf": {
        "kty": "EC",
        "crv": "P-256",
        "x": "aCNMib1jeZ8vOVaNAUGSeRjZxMsL6Q5xFQ8_5kTZpko",
        "y": "g09WEVHIuglalPvaqCY2rDx5VnZMm43tuiUy7nN7UUw",
        "jwk": {
          "kty": "EC",
          "crv": "P-256",
          "x": "aCNMib1jeZ8vOVaNAUGSeRjZxMsL6Q5xFQ8_5kTZpko",
          "y": "g09WEVHIuglalPvaqCY2rDx5VnZMm43tuiUy7nN7UUw"
        }
      },
      "iat": "2026-01-05T21:02:30.000+00:00",
      "status": {
        "status_list": {
          "uri": "https://status-reg.trust-infra.swiyu-int.admin.ch/api/v1/statuslist/c004fdd3-1bcb-47c6-b27b-26fcbda608af.jwt",
          "idx": 6660,
          "type": "SwissTokenStatusList-1.0"
        }
      }
