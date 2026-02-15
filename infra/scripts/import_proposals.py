#!/usr/bin/env python3
"""
Script to create proposal records via AT Protocol API
Usage: python import_proposals.py [json_file] [handle] [password]
Handle and password can be provided as arguments or via environment variables
"""

import os
import sys
import csv
from dataclasses import dataclass
from typing import Optional
from datetime import datetime, timezone
from typing import Dict, Optional
import time
import requests


VOTING_URL = 'https://swissvotes.ch/page/dataset/swissvotes_dataset.csv'


@dataclass
class SwissVote:
    """Swiss vote data from swissvotes.ch dataset"""
    anr: str
    datum: str
    titel_kurz_d: str
    titel_kurz_f: str
    titel_kurz_e: str
    titel_off_d: str
    titel_off_f: str
    stichwort: str
    swissvoteslink: str
    rechtsform: str
    kurzbetitel: str = ""
    # volk: str
    # stand: str
    # annahme: str
    # volkja_proz: str
    
    # Optional fields with common default of empty string
    # berecht: str = ""
    # stimmen: str = ""
    # bet: str = ""
    # gultig: str = ""
    # volkja: str = ""
    # volknein: str = ""
    # kt_ja: str = ""
    # kt_nein: str = ""
    
    @classmethod
    def from_csv_row(cls, row: Dict[str, str]) -> 'SwissVote':
        """Create SwissVote from CSV row dictionary"""
        # Remove BOM if present
        clean_row = {k.lstrip('\ufeff'): v for k, v in row.items()}
        
        return cls(
            anr=clean_row.get('anr', ''),
            datum=clean_row.get('datum', ''),
            titel_kurz_d=clean_row.get('titel_kurz_d', ''),
            titel_kurz_f=clean_row.get('titel_kurz_f', ''),
            titel_kurz_e=clean_row.get('titel_kurz_e', ''),
            titel_off_d=clean_row.get('titel_off_d', ''),
            titel_off_f=clean_row.get('titel_off_f', ''),
            stichwort=clean_row.get('stichwort', ''),
            swissvoteslink=clean_row.get('swissvoteslink', ''),
            rechtsform=clean_row.get('rechtsform', ''),
            kurzbetitel=clean_row.get('kurzbetitel', ''),
            # volk=clean_row.get('volk', ''),
            # stand=clean_row.get('stand', ''),
            # annahme=clean_row.get('annahme', ''),
            # volkja_proz=clean_row.get('volkja-proz', ''),
            # berecht=clean_row.get('berecht', ''),
            # stimmen=clean_row.get('stimmen', ''),
            # bet=clean_row.get('bet', ''),
            # gultig=clean_row.get('gultig', ''),
            # volkja=clean_row.get('volkja', ''),
            # volknein=clean_row.get('volknein', ''),
            # kt_ja=clean_row.get('kt-ja', ''),
            # kt_nein=clean_row.get('kt-nein', '')
        )

class ProposalImporter:
    def __init__(self, pds_host: str, handle: str, password: str):
        self.pds_host = pds_host
        self.handle = handle
        self.password = password
        self.access_token: Optional[str] = None
        self.did: Optional[str] = None
        
    def authenticate(self) -> bool:
        """Authenticate with PDS and get access token"""
        print("Authenticating...")
        
        url = f"{self.pds_host}/xrpc/com.atproto.server.createSession"
        payload = {
            "identifier": self.handle,
            "password": self.password
        }
        
        try:
            response = requests.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            
            self.access_token = data.get("accessJwt")
            self.did = data.get("did")
            
            if not self.access_token or not self.did:
                print(f"ERROR: Authentication failed - missing token or DID")
                print(f"Response: {data}")
                return False
                
            print(f"✓ Authenticated as {self.did}")
            return True
            
        except requests.exceptions.RequestException as e:
            print(f"ERROR: Authentication failed - {e}")
            return False
    
    def create_proposal(self, vote: SwissVote) -> bool:
        """Create a proposal record"""

        # Parse date from DD.MM.YYYY format
        vote_date = datetime.strptime(vote.datum, "%d.%m.%Y").date()

        # Use anr directly as rkey (e.g. "413.2") for deterministic AT-URIs
        rkey = vote.anr
        
        # Convert date to ISO format string for the record
        vote_date_iso = vote_date.strftime("%Y-%m-%d")
        
        # Create the record
        record = {
            "$type": "app.ch.poltr.ballot.entry",
            "title": vote.titel_kurz_d,
            "topic": "Federal",
            "text": vote.titel_off_d,
            "voteDate": vote_date_iso,
            "language": "de-CH",
            "officialRef": vote.anr,
            "sourceUrl": vote.swissvoteslink,
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-3] + "Z"
        }
        
        # Create/update record via API (upsert)
        url = f"{self.pds_host}/xrpc/com.atproto.repo.putRecord"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "repo": self.did,
            "collection": "app.ch.poltr.ballot.entry",
            "rkey": rkey,
            "record": record
        }
        
        try:
            # Small delay to avoid rate limiting
            time.sleep(0.05)
            
            response = requests.post(url, headers=headers, json=payload)
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                if "uri" in data:
                    print(f"✓ Created/Updated: {data['uri']}")
                    return True
            
            # Print detailed error information for errors
            try:
                error_data = response.json()
                error_msg = error_data.get("message") or error_data.get("error") or f"HTTP {response.status_code}"
                print(f"✗ Failed ({response.status_code}): {error_msg}")
                if response.status_code >= 500:
                    print(f"  Server error - skipping record")
            except:
                print(f"✗ Failed ({response.status_code}): {response.text[:200]}")
            
            return False
                
        except requests.exceptions.RequestException as e:
            error_msg = "Unknown error"
            try:
                error_data = e.response.json()
                error_msg = error_data.get("message") or error_data.get("error") or str(e)
            except:
                error_msg = str(e)
            print(f"✗ Failed: {error_msg}")
            return False
    
    def import_from_url(self, csv_url: str, max_imports: int = 0):
        """Import proposals from JSON file"""
        print(f"Reading data from: {csv_url}")

        # downoad the csv_url (with redirect)
        csv_path = './opendata_swiss/votings.csv'
        response = requests.get(csv_url, allow_redirects=True)
        response.raise_for_status()
        os.makedirs(os.path.dirname(csv_path), exist_ok=True)
        with open(csv_path, 'wb') as f:
            f.write(response.content)
        print(f"✓ Downloaded CSV to: {csv_path}")


        # parse the csv file (header on first row, semicolon separated )
        votings = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                votings.append(row)

        created_count = 0
        skipped_count = 0


        for i, voting in enumerate(votings, 1):
            # Extract essential data for filtering
            # Try to create the proposal
            voting = SwissVote.from_csv_row(voting)

            if self.create_proposal(voting):
                created_count += 1
                if max_imports and created_count >= max_imports:
                    print(f"Reached max imports limit ({max_imports})")
                    break
            else:
                skipped_count += 1
            
        
        print("=" * 42)
        print(f"Synched: {created_count} proposals")
        print("=" * 42)


def main():
    # Get configuration from arguments or environment
    csv_url = VOTING_URL # its a csv
    handle = os.getenv("PDS_GOVERNANCE_ACCOUNT_HANDLE")
    password = os.getenv("PDS_GOVERNANCE_ACCOUNT_PASSWORD")
    pds_host = os.getenv("PDS_HOST", "http://localhost:2583")
    max_imports = int(os.getenv("MAX_IMPORTS", "0"))  # 0 = unlimited
    
    # Validate arguments
    if not csv_url:
        print("ERROR: Missing csv url")
        sys.exit(1)
    
    if not handle:
        print("ERROR: Handle required")
        print("Set PDS_GOVERNANCE_ACCOUNT_HANDLE environment variable")
        sys.exit(1)
    
    if not password:
        print("ERROR: Password required")
        print("Set PDS_GOVERNANCE_ACCOUNT_PASSWORD environment variable")
        sys.exit(1)
    
    # Print configuration
    print("=== AT Protocol Proposal Import ===")
    print(f"PDS Host: {pds_host}")
    print(f"Handle: {handle}")
    print()
    
    # Create importer and authenticate
    importer = ProposalImporter(pds_host, handle, password)
    
    if not importer.authenticate():
        sys.exit(1)
    
    print()
    
    # Import proposals
    importer.import_from_url(csv_url, max_imports=max_imports)


if __name__ == "__main__":
    main()
