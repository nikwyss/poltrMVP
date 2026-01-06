
https://swiyu-admin-ch.github.io/cookbooks/onboarding-base-and-trust-registry/


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