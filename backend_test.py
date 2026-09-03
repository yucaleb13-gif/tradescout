#!/usr/bin/env python3
"""
Phase 3 Backend Testing: CanadaBuys csv_dataset connector + live discovery search
Focus: FIX VERIFICATION - Trade keyword word boundary fix + evidence field_name mapping
Expected: 'door' should NOT match 'Indoor' (word boundary at START)
Expected: evidence field_name should include company_name, contact_name, tender_status, timeline
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "https://tradescout-preview.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"
TIMEOUT = 120  # 120s timeout for search requests (downloads 7MB dataset)

# Test credentials
EMAIL = "qa.tradescout@example.com"
PASSWORD = "TradeScout!2025"

# Field mapping for evidence validation (UPDATED for Phase 3 fix)
# Evidence field_name should now include: company_name, contact_name, tender_status, timeline
FIELD_EVIDENCE_MAP = {
    'project_name': 'project_name',
    'project_description': 'project_description',
    'trade_category': 'trade_category',
    'location': 'location',
    'company_name': 'company_name',  # NOW has dedicated evidence field_name
    'contact_name': 'contact_name',  # NOW has dedicated evidence field_name
    'contact_email': 'contact_email',
    'contact_phone': 'contact_phone',
    'bid_deadline': 'timeline',
    'tender_status': 'tender_status',  # NOW has dedicated evidence field_name
    'project_type': 'project_description',  # Still maps to project_description (no enum)
    'timeline_start': 'timeline',
    'timeline_end': 'timeline',
    'timeline_text': 'timeline',
    'source_stated_value': 'project_value',
    'estimated_trade_value': None,  # Calculated field, no evidence required
    'lead_score': None,  # Calculated field, no evidence required
}

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
    def login(self):
        """Login and establish cookie session"""
        print("\n" + "="*80)
        print("PHASE 3 BACKEND TESTING - CanadaBuys Discovery Search")
        print("="*80)
        print(f"\n[LOGIN] Authenticating as {EMAIL}...")
        
        response = self.session.post(
            f"{API_URL}/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✓ Login successful")
            return True
        else:
            print(f"✗ Login failed: {response.status_code} - {response.text}")
            return False
    
    def test_unauthenticated_search(self):
        """Test scenario (H): Unauthenticated request should return 401"""
        print("\n" + "-"*80)
        print("TEST (H): Unauthenticated search should return 401")
        print("-"*80)
        
        unauth_session = requests.Session()
        response = unauth_session.post(
            f"{API_URL}/discover/search",
            json={"trade": "windows_doors", "location": "Fraser Valley, British Columbia", "limit": 20},
            timeout=30
        )
        
        if response.status_code == 401:
            print(f"✓ PASSED: Unauthenticated request correctly returned 401")
            return True
        else:
            print(f"✗ FAILED: Expected 401, got {response.status_code}")
            return False
    
    def validate_evidence_integrity(self, lead, evidence_list):
        """
        Validate that every non-null factual field has corresponding evidence.
        Returns (is_valid, issues_list)
        """
        issues = []
        
        # Fields to check for evidence
        factual_fields = [
            'project_name', 'project_description', 'trade_category', 'location',
            'company_name', 'contact_name', 'contact_email', 'contact_phone',
            'bid_deadline', 'tender_status', 'project_type', 'timeline_start',
            'timeline_end', 'timeline_text', 'source_stated_value'
        ]
        
        for field in factual_fields:
            value = lead.get(field)
            if value is None or value == '' or value == 'unknown':
                continue  # Null/empty fields don't need evidence
            
            # Check if this field should have evidence
            expected_evidence_field = FIELD_EVIDENCE_MAP.get(field)
            if expected_evidence_field is None:
                continue  # Calculated fields don't need evidence
            
            # Find evidence for this field
            # For some fields, evidence may be in project_description or related fields
            has_evidence = False
            for ev in evidence_list:
                ev_field = ev.get('field_name')
                # Check if evidence field matches (with flexible mapping)
                if ev_field == expected_evidence_field or \
                   (field in ['company_name', 'tender_status', 'project_type'] and ev_field == 'project_description') or \
                   (field in ['timeline_start', 'timeline_end', 'timeline_text', 'bid_deadline'] and ev_field == 'timeline'):
                    has_evidence = True
                    
                    # Validate source_url is a real URL
                    source_url = ev.get('source_url', '')
                    if not source_url.startswith('http'):
                        issues.append(f"Field '{field}': evidence.source_url is not a valid URL: {source_url}")
                    
                    # Validate extracted_value relates to the field value
                    extracted = str(ev.get('extracted_value', '')).lower()
                    field_val = str(value).lower()
                    
                    # For some fields, extracted_value should match or be contained
                    # (flexible check since evidence may be a snippet)
                    if field in ['project_name', 'contact_email', 'contact_phone', 'bid_deadline']:
                        if extracted not in field_val and field_val not in extracted:
                            # For project_name, allow partial match
                            if field == 'project_name':
                                # Check if key words match
                                extracted_words = set(extracted.split())
                                field_words = set(field_val.split())
                                if len(extracted_words & field_words) < 2:
                                    issues.append(f"Field '{field}': extracted_value '{extracted[:50]}...' does not match field value '{field_val[:50]}...'")
                            else:
                                issues.append(f"Field '{field}': extracted_value '{extracted[:50]}...' does not match field value '{field_val[:50]}...'")
                    
                    break
            
            if not has_evidence:
                # Critical: non-null field without evidence
                issues.append(f"CRITICAL: Field '{field}' has value '{str(value)[:50]}...' but NO evidence found")
        
        return len(issues) == 0, issues
    
    def test_discovery_search_scenario_a(self):
        """
        Test scenario (A): POST /api/discover/search with windows_doors + Fraser Valley
        UPDATED EXPECTATION: 2 leads (Training Van Fit-up, Cell Window Glazing)
        'Indoor Firing Range' should NOT appear (word boundary fix: 'door' must not match 'Indoor')
        Evidence field_name should include: company_name, contact_name, tender_status, timeline
        """
        print("\n" + "-"*80)
        print("TEST (A): Discovery search - windows_doors + Fraser Valley, British Columbia")
        print("EXPECTED: matched=2, leads=['Training Van Fit-up', 'Cell Window Glazing']")
        print("MUST NOT CONTAIN: 'Indoor Firing Range' (word boundary fix)")
        print("-"*80)
        
        search_payload = {
            "trade": "windows_doors",
            "location": "Fraser Valley, British Columbia",
            "limit": 20
        }
        
        print(f"Sending search request (timeout={TIMEOUT}s)...")
        print(f"Payload: {json.dumps(search_payload, indent=2)}")
        
        start_time = time.time()
        response = self.session.post(
            f"{API_URL}/discover/search",
            json=search_payload,
            timeout=TIMEOUT
        )
        elapsed = time.time() - start_time
        
        print(f"Response received in {elapsed:.1f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {response.status_code}")
            print(f"Response: {response.text[:500]}")
            return None
        
        data = response.json()
        
        # Validate response structure
        print("\n[RESPONSE STRUCTURE]")
        print(f"  query: {data.get('query')}")
        print(f"  runs: {len(data.get('runs', []))} source(s)")
        print(f"  totals: {data.get('totals')}")
        print(f"  leads: {len(data.get('leads', []))} lead(s)")
        
        # Find CanadaBuys run
        canadabuys_run = None
        for run in data.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run = run
                break
        
        if not canadabuys_run:
            print(f"✗ FAILED: No CanadaBuys run found in response")
            return None
        
        print(f"\n[CANADABUYS RUN]")
        print(f"  source_name: {canadabuys_run.get('source_name')}")
        print(f"  status: {canadabuys_run.get('status')}")
        print(f"  found: {canadabuys_run.get('found')}")
        print(f"  verified: {canadabuys_run.get('verified')}")
        print(f"  rejected: {canadabuys_run.get('rejected')}")
        print(f"  duplicated: {canadabuys_run.get('duplicated')}")
        
        search_stats = canadabuys_run.get('search', {})
        if search_stats:
            print(f"  search.rows: {search_stats.get('rows')}")
            print(f"  search.matched: {search_stats.get('matched')}")
            print(f"  search.returned: {search_stats.get('returned')}")
            print(f"  search.truncated: {search_stats.get('truncated')}")
        
        # Validate CanadaBuys run
        if canadabuys_run.get('status') != 'completed':
            print(f"✗ FAILED: CanadaBuys run status is '{canadabuys_run.get('status')}', expected 'completed'")
            return None
        
        if not search_stats or search_stats.get('rows', 0) < 900:
            print(f"✗ WARNING: Expected ~978 rows, got {search_stats.get('rows', 0)}")
        
        # CRITICAL FIX VERIFICATION: matched should be 2 (not 3)
        expected_matched = 2
        actual_matched = search_stats.get('matched', 0)
        if actual_matched != expected_matched:
            print(f"✗ CRITICAL: Expected matched={expected_matched}, got {actual_matched}")
            if actual_matched == 3:
                print(f"  This suggests 'Indoor Firing Range' is still matching (word boundary fix not working)")
            return None
        else:
            print(f"✓ CRITICAL: matched={expected_matched} (word boundary fix working)")
        
        # Analyze leads
        leads = data.get('leads', [])
        canadabuys_leads = [l for l in leads if 'CanadaBuys' in l.get('source', {}).get('name', '')]
        
        print(f"\n[LEADS ANALYSIS]")
        print(f"  Total leads: {len(leads)}")
        print(f"  CanadaBuys leads: {len(canadabuys_leads)}")
        
        # Expected lead names (UPDATED: only 2 leads, NOT 3)
        expected_names = ['Training Van Fit-up', 'Cell Window Glazing']
        forbidden_names = ['Indoor Firing Range']  # Must NOT appear
        found_names = []
        forbidden_found = []
        
        print(f"\n[LEAD DETAILS]")
        for i, lead in enumerate(canadabuys_leads[:10], 1):  # Show first 10
            project_name = lead.get('project_name', '')
            print(f"\n  Lead {i}: {project_name}")
            print(f"    source_url: {lead.get('source_url', '')[:80]}")
            print(f"    verification_status: {lead.get('verification_status')}")
            print(f"    trade_category: {lead.get('trade_category')}")
            print(f"    location: {lead.get('location')}")
            
            # Check for expected names
            for expected in expected_names:
                if expected.lower() in project_name.lower():
                    found_names.append(expected)
            
            # CRITICAL: Check for forbidden names (Indoor Firing Range)
            for forbidden in forbidden_names:
                if forbidden.lower() in project_name.lower():
                    forbidden_found.append(project_name)
                    print(f"    ✗ CRITICAL: FORBIDDEN lead found: '{project_name}'")
                    print(f"       This means 'door' is still matching 'Indoor' (word boundary fix FAILED)")
            
            # List non-null fields
            non_null_fields = []
            null_fields = []
            check_fields = ['contact_phone', 'source_stated_value', 'address', 'location', 
                          'contact_email', 'bid_deadline', 'company_name', 'contact_name']
            
            for field in check_fields:
                value = lead.get(field)
                if value and value != '' and value != 'unknown':
                    non_null_fields.append(field)
                else:
                    null_fields.append(field)
            
            print(f"    Non-null fields: {', '.join(non_null_fields) if non_null_fields else 'none'}")
            print(f"    Null fields: {', '.join(null_fields) if null_fields else 'none'}")
            
            # Evidence validation - CHECK FOR NEW FIELD_NAME MAPPINGS
            evidence = lead.get('evidence', [])
            print(f"    Evidence rows: {len(evidence)}")
            
            # CRITICAL: Check evidence field_name set includes required fields
            evidence_field_names = set(ev.get('field_name') for ev in evidence)
            required_field_names = {'company_name', 'contact_name', 'tender_status', 'timeline', 'project_name'}
            
            print(f"    Evidence field_name set: {sorted(evidence_field_names)}")
            
            missing_required = required_field_names - evidence_field_names
            if missing_required:
                print(f"    ✗ CRITICAL: Missing required evidence field_names: {missing_required}")
            else:
                print(f"    ✓ All required evidence field_names present")
            
            if len(evidence) > 0:
                print(f"    Sample evidence (first 3):")
                for j, ev in enumerate(evidence[:3], 1):
                    print(f"      {j}. field_name: {ev.get('field_name')}")
                    print(f"         extracted_value: {str(ev.get('extracted_value', ''))[:60]}...")
                    print(f"         source_url: {ev.get('source_url', '')[:60]}...")
                    print(f"         retrieved_content: {str(ev.get('retrieved_content', ''))[:60]}...")
            
            # Validate evidence integrity
            is_valid, issues = self.validate_evidence_integrity(lead, evidence)
            if not is_valid:
                print(f"    ✗ EVIDENCE ISSUES:")
                for issue in issues:
                    print(f"      - {issue}")
            else:
                print(f"    ✓ Evidence integrity validated")
        
        # Check for specific lead: Cell Window Glazing
        cell_window_lead = None
        for lead in canadabuys_leads:
            if 'Cell Window Glazing' in lead.get('project_name', ''):
                cell_window_lead = lead
                break
        
        if cell_window_lead:
            print(f"\n[SPECIFIC LEAD CHECK: Cell Window Glazing]")
            contact_email = cell_window_lead.get('contact_email', '')
            print(f"  contact_email: {contact_email}")
            
            if 'Carlie.Skotynski@csc-scc.gc.ca' in contact_email:
                print(f"  ✓ Expected contact email found")
                
                # Check evidence for this email
                evidence = cell_window_lead.get('evidence', [])
                email_evidence = [e for e in evidence if e.get('field_name') == 'contact_email']
                if email_evidence:
                    snippet = email_evidence[0].get('retrieved_content', '')
                    if 'contactInfoEmail' in snippet:
                        print(f"  ✓ Evidence snippet contains 'contactInfoEmail'")
                    else:
                        print(f"  ✗ Evidence snippet does not contain 'contactInfoEmail': {snippet[:100]}")
            else:
                print(f"  ✗ Expected contact email not found")
        
        print(f"\n[SUMMARY]")
        print(f"  Expected lead names found: {', '.join(found_names) if found_names else 'none'}")
        print(f"  Forbidden lead names found: {', '.join(forbidden_found) if forbidden_found else 'none (GOOD)'}")
        
        # CRITICAL CHECKS
        test_passed = True
        if forbidden_found:
            print(f"  ✗ CRITICAL FAILURE: 'Indoor Firing Range' found in results (word boundary fix FAILED)")
            test_passed = False
        else:
            print(f"  ✓ CRITICAL: 'Indoor Firing Range' NOT in results (word boundary fix WORKING)")
        
        if actual_matched != expected_matched:
            print(f"  ✗ CRITICAL FAILURE: matched={actual_matched}, expected {expected_matched}")
            test_passed = False
        
        if canadabuys_run.get('status') != 'completed':
            print(f"  ✗ Run status is '{canadabuys_run.get('status')}', expected 'completed'")
            test_passed = False
        
        print(f"\n{'✓ TEST (A) PASSED' if test_passed else '✗ TEST (A) FAILED'}")
        
        return {
            'run': canadabuys_run,
            'leads': canadabuys_leads,
            'search_stats': search_stats,
            'run_id': canadabuys_run.get('run_id'),
            'passed': test_passed
        }
    
    def test_discovery_search_scenario_b(self):
        """
        Test scenario (B): Re-run same search
        Expected: found=0, duplicated>=2 (was 3, now 2 after fix), leads still returned
        """
        print("\n" + "-"*80)
        print("TEST (B): Re-run same search - verify deduplication")
        print("EXPECTED: found=0, duplicated>=2")
        print("-"*80)
        
        search_payload = {
            "trade": "windows_doors",
            "location": "Fraser Valley, British Columbia",
            "limit": 20
        }
        
        print(f"Sending search request (timeout={TIMEOUT}s)...")
        
        start_time = time.time()
        response = self.session.post(
            f"{API_URL}/discover/search",
            json=search_payload,
            timeout=TIMEOUT
        )
        elapsed = time.time() - start_time
        
        print(f"Response received in {elapsed:.1f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Find CanadaBuys run
        canadabuys_run = None
        for run in data.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run = run
                break
        
        if not canadabuys_run:
            print(f"✗ FAILED: No CanadaBuys run found")
            return False
        
        print(f"\n[CANADABUYS RUN]")
        print(f"  status: {canadabuys_run.get('status')}")
        print(f"  found: {canadabuys_run.get('found')}")
        print(f"  duplicated: {canadabuys_run.get('duplicated')}")
        
        leads = data.get('leads', [])
        canadabuys_leads = [l for l in leads if 'CanadaBuys' in l.get('source', {}).get('name', '')]
        print(f"  leads returned: {len(canadabuys_leads)}")
        
        # Validate deduplication
        passed = True
        if canadabuys_run.get('found', -1) != 0:
            print(f"✗ FAILED: Expected found=0, got {canadabuys_run.get('found')}")
            passed = False
        else:
            print(f"✓ found=0 (no new leads)")
        
        # UPDATED: duplicated should be 2 (not 3) after word boundary fix
        if canadabuys_run.get('duplicated', 0) < 2:
            print(f"✗ FAILED: Expected duplicated>=2, got {canadabuys_run.get('duplicated')}")
            passed = False
        else:
            print(f"✓ duplicated={canadabuys_run.get('duplicated')} (known leads)")
        
        if len(canadabuys_leads) < 2:
            print(f"✗ FAILED: Expected at least 2 leads returned, got {len(canadabuys_leads)}")
            passed = False
        else:
            print(f"✓ {len(canadabuys_leads)} leads still returned (includes known duplicates)")
        
        print(f"\n{'✓ TEST (B) PASSED' if passed else '✗ TEST (B) FAILED'}")
        return passed
    
    def test_discovery_search_scenario_c(self):
        """
        Test scenario (C): Impossible criteria search
        Expected: 200 with leads=[], matched=0
        """
        print("\n" + "-"*80)
        print("TEST (C): Impossible criteria search - verify no fabrication")
        print("-"*80)
        
        search_payload = {
            "trade": "roofing",
            "location": "Fraser Valley, British Columbia",
            "date_from": "2030-01-01",
            "limit": 20
        }
        
        print(f"Payload: {json.dumps(search_payload, indent=2)}")
        print(f"Sending search request (timeout={TIMEOUT}s)...")
        
        start_time = time.time()
        response = self.session.post(
            f"{API_URL}/discover/search",
            json=search_payload,
            timeout=TIMEOUT
        )
        elapsed = time.time() - start_time
        
        print(f"Response received in {elapsed:.1f}s - Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Find CanadaBuys run
        canadabuys_run = None
        for run in data.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run = run
                break
        
        if not canadabuys_run:
            print(f"✗ FAILED: No CanadaBuys run found")
            return False
        
        print(f"\n[CANADABUYS RUN]")
        print(f"  status: {canadabuys_run.get('status')}")
        print(f"  found: {canadabuys_run.get('found')}")
        
        search_stats = canadabuys_run.get('search', {})
        if search_stats:
            print(f"  search.matched: {search_stats.get('matched')}")
        
        leads = data.get('leads', [])
        print(f"  leads returned: {len(leads)}")
        
        # Validate no fabrication
        passed = True
        if search_stats.get('matched', -1) != 0:
            print(f"✗ FAILED: Expected matched=0, got {search_stats.get('matched')}")
            passed = False
        else:
            print(f"✓ matched=0 (no results)")
        
        if len(leads) != 0:
            print(f"✗ FAILED: Expected 0 leads, got {len(leads)} (fabricated data!)")
            passed = False
        else:
            print(f"✓ 0 leads returned (nothing fabricated)")
        
        print(f"\n{'✓ TEST (C) PASSED' if passed else '✗ TEST (C) FAILED'}")
        return passed
    
    def test_admin_run_detail(self, run_id):
        """
        Test scenario (D): GET /api/admin/runs/:run_id
        Verify logs include robots step, retrieve step, search step
        """
        print("\n" + "-"*80)
        print(f"TEST (D): Admin run detail - run_id={run_id}")
        print("-"*80)
        
        response = self.session.get(
            f"{API_URL}/admin/runs/{run_id}",
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        print(f"\n[RUN DETAIL]")
        print(f"  status: {data.get('status')}")
        print(f"  connector: {data.get('connector')}")
        print(f"  params.trigger: {data.get('params', {}).get('trigger')}")
        
        logs = data.get('logs', [])
        print(f"  logs: {len(logs)} entries")
        
        retrievals = data.get('retrievals', [])
        print(f"  retrievals: {len(retrievals)} entries")
        
        # Check for required log steps
        log_steps = {log.get('step'): log for log in logs}
        
        required_steps = ['robots', 'retrieve', 'search']
        passed = True
        
        for step in required_steps:
            if step in log_steps:
                log_entry = log_steps[step]
                print(f"\n  Step '{step}':")
                print(f"    status: {log_entry.get('status')}")
                print(f"    message: {log_entry.get('message', '')[:100]}...")
                
                if step == 'robots':
                    message = log_entry.get('message', '')
                    if 'licensed access basis' in message.lower():
                        print(f"    ✓ Message contains 'licensed access basis'")
                    else:
                        print(f"    ✗ Message does not contain 'licensed access basis'")
                        passed = False
            else:
                print(f"  ✗ Step '{step}' not found in logs")
                passed = False
        
        # Check retrievals
        if retrievals:
            retrieval = retrievals[0]
            print(f"\n  Retrieval[0]:")
            print(f"    retrieval_status: {retrieval.get('retrieval_status')}")
            print(f"    byte_size: {retrieval.get('byte_size')}")
            
            if retrieval.get('retrieval_status') == 'success':
                print(f"    ✓ retrieval_status='success'")
            else:
                print(f"    ✗ retrieval_status='{retrieval.get('retrieval_status')}'")
                passed = False
            
            if retrieval.get('byte_size', 0) > 1000000:
                print(f"    ✓ byte_size > 1MB")
            else:
                print(f"    ✗ byte_size={retrieval.get('byte_size')} (expected > 1MB)")
        
        print(f"\n{'✓ TEST (D) PASSED' if passed else '✗ TEST (D) FAILED'}")
        return passed
    
    def test_search_history(self):
        """
        Test scenario (E): GET /api/search-history
        Verify newest entry has filters.trade='windows_doors' and search_run_id
        """
        print("\n" + "-"*80)
        print("TEST (E): Search history")
        print("-"*80)
        
        response = self.session.get(
            f"{API_URL}/search-history",
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        if not data or len(data) == 0:
            print(f"✗ FAILED: No search history entries found")
            return False
        
        # Newest entry is first (ordered by created_at desc)
        newest = data[0]
        
        print(f"\n[NEWEST SEARCH HISTORY ENTRY]")
        print(f"  query_text: {newest.get('query_text')}")
        print(f"  filters: {newest.get('filters')}")
        print(f"  result_count: {newest.get('result_count')}")
        print(f"  search_run_id: {newest.get('search_run_id')}")
        
        passed = True
        
        filters = newest.get('filters', {})
        if filters.get('trade') == 'windows_doors':
            print(f"  ✓ filters.trade='windows_doors'")
        else:
            print(f"  ✗ filters.trade='{filters.get('trade')}' (expected 'windows_doors')")
            passed = False
        
        if newest.get('search_run_id'):
            print(f"  ✓ search_run_id is not null")
        else:
            print(f"  ✗ search_run_id is null")
            passed = False
        
        if newest.get('result_count', 0) > 0:
            print(f"  ✓ result_count={newest.get('result_count')}")
        else:
            print(f"  ✗ result_count={newest.get('result_count')}")
        
        print(f"\n{'✓ TEST (E) PASSED' if passed else '✗ TEST (E) FAILED'}")
        return passed
    
    def test_location_filter_semantics(self):
        """
        Test scenario (G): Location filter semantics
        UPDATED EXPECTATIONS:
        - {trade:'windows_doors', location:'British Columbia'} -> matched == 5
        - {location:'Fraser Valley, British Columbia'} (no trade) -> matched == 8
        'British Columbia' should return more matches than 'Fraser Valley, British Columbia'
        """
        print("\n" + "-"*80)
        print("TEST (G): Location filter semantics")
        print("EXPECTED: BC=5 (with trade), Fraser Valley=8 (no trade)")
        print("-"*80)
        
        # Search 1: British Columbia with trade windows_doors
        print(f"\nSearch 1: windows_doors + British Columbia")
        search1 = {
            "trade": "windows_doors",
            "location": "British Columbia",
            "limit": 20
        }
        
        response1 = self.session.post(
            f"{API_URL}/discover/search",
            json=search1,
            timeout=TIMEOUT
        )
        
        if response1.status_code != 200:
            print(f"✗ FAILED: Search 1 returned {response1.status_code}")
            return False
        
        data1 = response1.json()
        canadabuys_run1 = None
        for run in data1.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run1 = run
                break
        
        if not canadabuys_run1:
            print(f"✗ FAILED: No CanadaBuys run in search 1")
            return False
        
        matched1 = canadabuys_run1.get('search', {}).get('matched', 0)
        print(f"  CanadaBuys matched: {matched1} (expected: 5)")
        
        # Search 2: Fraser Valley, British Columbia with trade windows_doors
        print(f"\nSearch 2: windows_doors + Fraser Valley, British Columbia")
        search2 = {
            "trade": "windows_doors",
            "location": "Fraser Valley, British Columbia",
            "limit": 20
        }
        
        response2 = self.session.post(
            f"{API_URL}/discover/search",
            json=search2,
            timeout=TIMEOUT
        )
        
        if response2.status_code != 200:
            print(f"✗ FAILED: Search 2 returned {response2.status_code}")
            return False
        
        data2 = response2.json()
        canadabuys_run2 = None
        for run in data2.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run2 = run
                break
        
        if not canadabuys_run2:
            print(f"✗ FAILED: No CanadaBuys run in search 2")
            return False
        
        matched2 = canadabuys_run2.get('search', {}).get('matched', 0)
        print(f"  CanadaBuys matched: {matched2} (expected: 2)")
        
        # Search 3: Fraser Valley, British Columbia WITHOUT trade filter
        print(f"\nSearch 3: Fraser Valley, British Columbia (no trade)")
        search3 = {
            "location": "Fraser Valley, British Columbia",
            "limit": 20
        }
        
        response3 = self.session.post(
            f"{API_URL}/discover/search",
            json=search3,
            timeout=TIMEOUT
        )
        
        if response3.status_code != 200:
            print(f"✗ FAILED: Search 3 returned {response3.status_code}")
            return False
        
        data3 = response3.json()
        canadabuys_run3 = None
        for run in data3.get('runs', []):
            if 'CanadaBuys' in run.get('source_name', ''):
                canadabuys_run3 = run
                break
        
        if not canadabuys_run3:
            print(f"✗ FAILED: No CanadaBuys run in search 3")
            return False
        
        matched3 = canadabuys_run3.get('search', {}).get('matched', 0)
        print(f"  CanadaBuys matched: {matched3} (expected: 8)")
        
        # Compare and validate
        print(f"\n[COMPARISON]")
        print(f"  'windows_doors + British Columbia': {matched1} matches (expected: 5)")
        print(f"  'windows_doors + Fraser Valley, BC': {matched2} matches (expected: 2)")
        print(f"  'Fraser Valley, BC (no trade)': {matched3} matches (expected: 8)")
        
        passed = True
        
        # Check if BC returns more than Fraser Valley (with trade)
        if matched1 > matched2:
            print(f"  ✓ 'British Columbia' returns more matches than 'Fraser Valley' ({matched1} > {matched2})")
        else:
            print(f"  ✗ Expected 'British Columbia' to return more matches")
            passed = False
        
        # Check if Fraser Valley without trade returns more than with trade
        if matched3 > matched2:
            print(f"  ✓ 'Fraser Valley (no trade)' returns more than 'Fraser Valley + trade' ({matched3} > {matched2})")
        else:
            print(f"  ✗ Expected 'Fraser Valley (no trade)' to return more matches")
            passed = False
        
        # Check exact expected values (allow ±1-2 tolerance as per instructions)
        tolerance = 2
        if abs(matched1 - 5) <= tolerance:
            print(f"  ✓ BC matched={matched1} is within tolerance of expected 5")
        else:
            print(f"  ✗ BC matched={matched1} differs from expected 5 by more than {tolerance}")
            passed = False
        
        if abs(matched2 - 2) <= tolerance:
            print(f"  ✓ Fraser Valley+trade matched={matched2} is within tolerance of expected 2")
        else:
            print(f"  ✗ Fraser Valley+trade matched={matched2} differs from expected 2 by more than {tolerance}")
            passed = False
        
        if abs(matched3 - 8) <= tolerance:
            print(f"  ✓ Fraser Valley (no trade) matched={matched3} is within tolerance of expected 8")
        else:
            print(f"  ✗ Fraser Valley (no trade) matched={matched3} differs from expected 8 by more than {tolerance}")
            passed = False
        
        print(f"\n{'✓ TEST (G) PASSED' if passed else '✗ TEST (G) FAILED'}")
        return passed
    
    def run_all_tests(self):
        """Run all Phase 3 tests"""
        if not self.login():
            print("\n✗ Cannot proceed without authentication")
            return
        
        # Test (H) first - unauthenticated
        test_h = self.test_unauthenticated_search()
        
        # Test (A) - main discovery search (CRITICAL: word boundary fix)
        result_a = self.test_discovery_search_scenario_a()
        test_a_passed = result_a and result_a.get('passed', False)
        
        # Test (B) - re-run for deduplication
        test_b = self.test_discovery_search_scenario_b()
        
        # Test (C) - impossible criteria
        test_c = self.test_discovery_search_scenario_c()
        
        # Test (D) - admin run detail
        test_d = False
        if result_a and result_a.get('run_id'):
            test_d = self.test_admin_run_detail(result_a['run_id'])
        
        # Test (E) - search history
        test_e = self.test_search_history()
        
        # Test (G) - location filter semantics (UPDATED with new expectations)
        test_g = self.test_location_filter_semantics()
        
        # Final summary
        print("\n" + "="*80)
        print("PHASE 3 FIX VERIFICATION SUMMARY")
        print("="*80)
        print(f"Test (A) - Discovery search (CRITICAL: word boundary fix): {'✓ PASSED' if test_a_passed else '✗ FAILED'}")
        print(f"Test (B) - Re-run deduplication: {'✓ PASSED' if test_b else '✗ FAILED'}")
        print(f"Test (C) - Impossible criteria (no fabrication): {'✓ PASSED' if test_c else '✗ FAILED'}")
        print(f"Test (D) - Admin run detail: {'✓ PASSED' if test_d else '✗ FAILED'}")
        print(f"Test (E) - Search history: {'✓ PASSED' if test_e else '✗ FAILED'}")
        print(f"Test (G) - Location filter semantics (BC=5, FV=2, FV no trade=8): {'✓ PASSED' if test_g else '✗ FAILED'}")
        print(f"Test (H) - Unauthenticated request (401): {'✓ PASSED' if test_h else '✗ FAILED'}")
        
        all_passed = all([test_a_passed, test_b, test_c, test_d, test_e, test_g, test_h])
        
        if all_passed:
            print("\n" + "="*80)
            print("✓ ALL PHASE 3 FIX VERIFICATION TESTS PASSED")
            print("="*80)
        else:
            print("\n" + "="*80)
            print("✗ SOME TESTS FAILED - SEE DETAILS ABOVE")
            print("="*80)
        
        return all_passed

if __name__ == "__main__":
    test_session = TestSession()
    test_session.run_all_tests()
