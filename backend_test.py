#!/usr/bin/env python3
"""
Phase 4 AI Fix Verification Test Suite for TradeScout
Tests sequential AI processing, grounding validation, and error handling
"""

import requests
import json
import time
import sys
import re
from typing import Dict, List, Any, Optional

# Configuration
BASE_URL = "https://tradescout-preview.preview.emergentagent.com"
API_BASE = f"{BASE_URL}/api"
CREDENTIALS = {
    "email": "qa.tradescout@example.com",
    "password": "TradeScout!2025"
}

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def login(self):
        """Login and establish cookie session"""
        print("\n=== AUTHENTICATION ===")
        try:
            resp = self.session.post(
                f"{API_BASE}/auth/login",
                json=CREDENTIALS,
                timeout=10
            )
            if resp.status_code == 200:
                print(f"✓ Login successful: {CREDENTIALS['email']}")
                return True
            else:
                print(f"✗ Login failed: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"✗ Login error: {e}")
            return False
    
    def get(self, path: str, timeout: int = 30) -> requests.Response:
        """GET request with timeout"""
        return self.session.get(f"{API_BASE}/{path}", timeout=timeout)
    
    def post(self, path: str, data: Dict, timeout: int = 90) -> requests.Response:
        """POST request with timeout"""
        return self.session.post(f"{API_BASE}/{path}", json=data, timeout=timeout)

def normalize_number(text: str) -> str:
    """Normalize number for grounding check (lowercase, remove spaces/commas/$, million->m, billion->b)"""
    return (text.lower()
            .replace(' ', '')
            .replace(',', '')
            .replace('$', '')
            .replace('million', 'm')
            .replace('billion', 'b'))

def extract_digit_tokens(text: str) -> List[str]:
    """Extract all digit-containing tokens from text"""
    # Match numbers with optional $, spaces, commas, decimals, and units (%, million, billion, m, k, etc.)
    pattern = r'\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:%|million|billion|bn|m|k)?'
    matches = re.findall(pattern, text, re.IGNORECASE)
    return [normalize_number(m) for m in matches if re.search(r'\d', m)]

def check_grounding(ai_summary: str, evidence_corpus: str) -> tuple[bool, List[str], List[str]]:
    """
    Check if all digit-containing tokens in ai_summary appear in evidence corpus
    Returns: (all_grounded, found_tokens, missing_tokens)
    """
    summary_tokens = extract_digit_tokens(ai_summary)
    corpus_normalized = normalize_number(evidence_corpus)
    
    found = []
    missing = []
    
    for token in summary_tokens:
        if token in corpus_normalized:
            found.append(token)
        else:
            missing.append(token)
    
    return len(missing) == 0, found, missing

def snapshot_factual_fields(lead: Dict) -> Dict:
    """Snapshot all factual fields from a lead"""
    factual_fields = [
        'project_name', 'location', 'company_name', 'contact_name', 
        'contact_email', 'contact_phone', 'bid_deadline', 'tender_status',
        'trade_category', 'project_type', 'project_description', 'timeline_text'
    ]
    return {field: lead.get(field) for field in factual_fields}

def compare_snapshots(before: Dict, after: Dict) -> tuple[bool, List[str]]:
    """Compare two snapshots, return (identical, differences)"""
    differences = []
    for field in before.keys():
        if before[field] != after[field]:
            differences.append(f"{field}: '{before[field]}' -> '{after[field]}'")
    return len(differences) == 0, differences

def test_check_1_process_pending(session: TestSession):
    """
    CHECK 1: POST /api/ai/process-pending {limit:10} -> processed 0, pending 0
    """
    print("\n" + "="*80)
    print("CHECK 1: Process Pending - All Leads Already Processed")
    print("="*80)
    
    try:
        print("\nCalling POST /api/ai/process-pending with limit=10...")
        resp = session.post("ai/process-pending", {"limit": 10}, timeout=90)
        
        if resp.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {resp.status_code}")
            print(f"Response: {resp.text}")
            return False
        
        data = resp.json()
        processed = data.get('processed', -1)
        pending = data.get('pending', -1)
        
        print(f"\nResponse:")
        print(f"  - processed: {processed}")
        print(f"  - pending: {pending}")
        print(f"  - results: {len(data.get('results', []))} items")
        
        if processed == 0 and pending == 0:
            print("\n✓ CHECK 1 PASSED: All leads already processed (processed=0, pending=0)")
            return True
        else:
            print(f"\n✗ CHECK 1 FAILED: Expected processed=0 and pending=0, got processed={processed}, pending={pending}")
            return False
            
    except Exception as e:
        print(f"\n✗ CHECK 1 ERROR: {e}")
        return False

def test_check_2_lead_ai_processing(session: TestSession):
    """
    CHECK 2: For 3 non-demo leads, verify:
    - Factual fields byte-identical before/after
    - All digit tokens in ai_summary present in evidence
    - ai_classification.status 'ok'
    - input_snapshot.evidence_ids subset of evidence[].id
    """
    print("\n" + "="*80)
    print("CHECK 2: Lead AI Processing - Grounding & Data Integrity")
    print("="*80)
    
    # Find 3 non-demo leads
    test_queries = [
        ("Glazing", "Cell Window Glazing"),
        ("Suffolk", "Suffolk"),
        ("Training", "Training Van")
    ]
    
    leads_to_test = []
    
    print("\n--- Finding Non-Demo Leads ---")
    for query, expected_keyword in test_queries:
        try:
            print(f"\nSearching for leads with q={query}...")
            resp = session.get(f"leads?q={query}", timeout=30)
            if resp.status_code == 200:
                leads = resp.json()
                non_demo = [l for l in leads if not l.get('is_demo', False)]
                if non_demo:
                    lead = non_demo[0]
                    print(f"  ✓ Found: {lead.get('project_name', 'N/A')} (id: {lead['id']})")
                    leads_to_test.append(lead['id'])
                else:
                    print(f"  ✗ No non-demo leads found for query '{query}'")
            else:
                print(f"  ✗ Search failed: {resp.status_code}")
        except Exception as e:
            print(f"  ✗ Error searching: {e}")
    
    if len(leads_to_test) < 3:
        # Try to get any non-demo leads
        print("\nFalling back to general lead list...")
        try:
            resp = session.get("leads", timeout=30)
            if resp.status_code == 200:
                all_leads = resp.json()
                non_demo = [l for l in all_leads if not l.get('is_demo', False)]
                for lead in non_demo:
                    if lead['id'] not in leads_to_test:
                        leads_to_test.append(lead['id'])
                        print(f"  ✓ Added: {lead.get('project_name', 'N/A')} (id: {lead['id']})")
                    if len(leads_to_test) >= 3:
                        break
        except Exception as e:
            print(f"  ✗ Error getting leads: {e}")
    
    if len(leads_to_test) < 3:
        print(f"\n✗ CHECK 2 FAILED: Could not find 3 non-demo leads (found {len(leads_to_test)})")
        return False
    
    print(f"\n--- Testing {len(leads_to_test)} Leads ---")
    
    all_passed = True
    results = []
    
    for i, lead_id in enumerate(leads_to_test[:3], 1):
        print(f"\n{'='*60}")
        print(f"LEAD {i}/3: {lead_id}")
        print(f"{'='*60}")
        
        try:
            # Get lead detail with evidence BEFORE AI processing
            print("\n1. Getting lead detail (BEFORE AI processing)...")
            resp = session.get(f"leads/{lead_id}", timeout=30)
            if resp.status_code != 200:
                print(f"  ✗ Failed to get lead: {resp.status_code}")
                all_passed = False
                continue
            
            lead_before = resp.json()
            snapshot_before = snapshot_factual_fields(lead_before)
            evidence = lead_before.get('evidence', [])
            
            print(f"  ✓ Lead: {lead_before.get('project_name', 'N/A')}")
            print(f"  - Evidence items: {len(evidence)}")
            print(f"  - Factual fields snapshot: {len([v for v in snapshot_before.values() if v is not None])} non-null fields")
            
            # Build evidence corpus for grounding check
            evidence_corpus = json.dumps(snapshot_before) + ' '
            for ev in evidence:
                evidence_corpus += ev.get('extracted_value', '') + ' ' + ev.get('retrieved_content', '') + ' '
            
            # POST /api/ai/leads/:id with force:true
            print("\n2. Processing with AI (force:true)...")
            start_time = time.time()
            resp = session.post(f"ai/leads/{lead_id}", {"force": True}, timeout=90)
            latency = int((time.time() - start_time) * 1000)
            
            if resp.status_code != 200:
                print(f"  ✗ AI processing failed: {resp.status_code}")
                print(f"  Response: {resp.text}")
                all_passed = False
                continue
            
            ai_result = resp.json()
            print(f"  ✓ AI processing completed")
            print(f"  - Status: {ai_result.get('status')}")
            print(f"  - Model: {ai_result.get('model')}")
            print(f"  - Latency: {ai_result.get('latency_ms', latency)} ms")
            print(f"  - Fit: {ai_result.get('fit')}")
            
            # Check for 429 errors
            if ai_result.get('status') == 'failed' and '429' in str(ai_result.get('error', '')):
                print(f"  ✗ CRITICAL: 429 rate limit error detected!")
                all_passed = False
                continue
            
            if ai_result.get('status') != 'ok':
                print(f"  ✗ AI processing status not 'ok': {ai_result.get('status')}")
                print(f"  Error: {ai_result.get('error')}")
                all_passed = False
                continue
            
            # Get lead detail AFTER AI processing
            print("\n3. Getting lead detail (AFTER AI processing)...")
            time.sleep(1)  # Brief pause to ensure DB update
            resp = session.get(f"leads/{lead_id}", timeout=30)
            if resp.status_code != 200:
                print(f"  ✗ Failed to get lead after AI: {resp.status_code}")
                all_passed = False
                continue
            
            lead_after = resp.json()
            snapshot_after = snapshot_factual_fields(lead_after)
            
            # VALIDATION 1: Factual fields byte-identical
            print("\n4. Validating factual field integrity...")
            identical, differences = compare_snapshots(snapshot_before, snapshot_after)
            if identical:
                print(f"  ✓ All factual fields byte-identical (AI did not modify source data)")
            else:
                print(f"  ✗ CRITICAL: Factual fields were modified by AI!")
                for diff in differences:
                    print(f"    - {diff}")
                all_passed = False
            
            # VALIDATION 2: ai_classification.status == 'ok'
            print("\n5. Validating AI classification...")
            ai_classification = lead_after.get('ai_classification', {})
            if ai_classification.get('status') == 'ok':
                print(f"  ✓ ai_classification.status = 'ok'")
                print(f"  - schema_version: {ai_classification.get('schema_version')}")
                print(f"  - model: {ai_classification.get('model')}")
            else:
                print(f"  ✗ ai_classification.status = '{ai_classification.get('status')}' (expected 'ok')")
                all_passed = False
            
            # VALIDATION 3: Grounding - digit tokens in ai_summary
            print("\n6. Validating number grounding...")
            ai_summary = lead_after.get('ai_summary', '')
            if ai_summary:
                print(f"  AI Summary: {ai_summary[:200]}...")
                grounded, found_tokens, missing_tokens = check_grounding(ai_summary, evidence_corpus)
                
                if grounded:
                    print(f"  ✓ All digit tokens grounded in evidence")
                    print(f"    Found tokens: {found_tokens}")
                else:
                    print(f"  ✗ CRITICAL: Ungrounded digit tokens found!")
                    print(f"    Missing tokens: {missing_tokens}")
                    print(f"    Found tokens: {found_tokens}")
                    all_passed = False
            else:
                print(f"  ✗ ai_summary is empty")
                all_passed = False
            
            # VALIDATION 4: input_snapshot.evidence_ids subset of evidence[].id
            print("\n7. Validating evidence references...")
            input_snapshot = ai_classification.get('input_snapshot', {})
            snapshot_evidence_ids = set(input_snapshot.get('evidence_ids', []))
            actual_evidence_ids = set(ev['id'] for ev in evidence)
            
            if snapshot_evidence_ids.issubset(actual_evidence_ids):
                print(f"  ✓ input_snapshot.evidence_ids ({len(snapshot_evidence_ids)}) ⊆ evidence[].id ({len(actual_evidence_ids)})")
            else:
                invalid_ids = snapshot_evidence_ids - actual_evidence_ids
                print(f"  ✗ CRITICAL: input_snapshot references invalid evidence IDs: {invalid_ids}")
                all_passed = False
            
            # Additional checks
            print("\n8. Additional classification checks...")
            trade_class = ai_classification.get('trade_classification', {})
            if trade_class.get('trade'):
                trade_ev_ids = set(trade_class.get('evidence_ids', []))
                if trade_ev_ids.issubset(actual_evidence_ids):
                    print(f"  ✓ trade_classification.evidence_ids valid ({len(trade_ev_ids)} refs)")
                else:
                    print(f"  ✗ trade_classification.evidence_ids contains invalid refs")
                    all_passed = False
            
            ptype_class = ai_classification.get('project_type_classification', {})
            if ptype_class.get('project_type'):
                ptype_ev_ids = set(ptype_class.get('evidence_ids', []))
                if ptype_ev_ids.issubset(actual_evidence_ids):
                    print(f"  ✓ project_type_classification.evidence_ids valid ({len(ptype_ev_ids)} refs)")
                else:
                    print(f"  ✗ project_type_classification.evidence_ids contains invalid refs")
                    all_passed = False
            
            relevance = ai_classification.get('relevance', {})
            fit = relevance.get('fit')
            if fit in ['strong', 'possible', 'weak', 'not_applicable']:
                print(f"  ✓ relevance.fit = '{fit}' (valid)")
            else:
                print(f"  ✗ relevance.fit = '{fit}' (invalid)")
                all_passed = False
            
            results.append({
                'lead_id': lead_id,
                'project_name': lead_before.get('project_name'),
                'passed': identical and grounded and ai_classification.get('status') == 'ok',
                'latency_ms': ai_result.get('latency_ms', latency),
                'fit': ai_result.get('fit')
            })
            
            print(f"\n{'='*60}")
            print(f"LEAD {i} RESULT: {'✓ PASSED' if results[-1]['passed'] else '✗ FAILED'}")
            print(f"{'='*60}")
            
            # Sequential processing - wait between leads
            if i < 3:
                print("\nWaiting 2s before next lead (sequential processing)...")
                time.sleep(2)
            
        except Exception as e:
            print(f"\n✗ ERROR processing lead {lead_id}: {e}")
            all_passed = False
    
    # Summary
    print("\n" + "="*80)
    print("CHECK 2 SUMMARY")
    print("="*80)
    for r in results:
        status = "✓ PASSED" if r['passed'] else "✗ FAILED"
        print(f"{status}: {r['project_name']} (latency: {r['latency_ms']}ms, fit: {r['fit']})")
    
    if all_passed:
        print("\n✓ CHECK 2 PASSED: All leads processed correctly with grounding and data integrity")
    else:
        print("\n✗ CHECK 2 FAILED: One or more leads failed validation")
    
    return all_passed

def test_check_3_no_failed_leads(session: TestSession):
    """
    CHECK 3: GET /api/leads -> zero non-demo leads with ai_classification.status == 'failed'
    """
    print("\n" + "="*80)
    print("CHECK 3: No Failed AI Classifications")
    print("="*80)
    
    try:
        print("\nGetting all leads...")
        resp = session.get("leads", timeout=30)
        
        if resp.status_code != 200:
            print(f"✗ FAILED: Expected 200, got {resp.status_code}")
            return False
        
        leads = resp.json()
        non_demo_leads = [l for l in leads if not l.get('is_demo', False)]
        
        print(f"  - Total leads: {len(leads)}")
        print(f"  - Non-demo leads: {len(non_demo_leads)}")
        
        failed_leads = []
        for lead in non_demo_leads:
            ai_class = lead.get('ai_classification', {})
            if ai_class.get('status') == 'failed':
                failed_leads.append({
                    'id': lead['id'],
                    'project_name': lead.get('project_name', 'N/A'),
                    'error': ai_class.get('error', 'N/A')
                })
        
        print(f"  - Non-demo leads with ai_classification.status='failed': {len(failed_leads)}")
        
        if failed_leads:
            print("\n✗ Failed leads found:")
            for fl in failed_leads[:5]:  # Show first 5
                print(f"  - {fl['project_name']} (id: {fl['id']})")
                print(f"    Error: {fl['error']}")
        
        if len(failed_leads) == 0:
            print("\n✓ CHECK 3 PASSED: Zero non-demo leads with failed AI classification")
            return True
        else:
            print(f"\n✗ CHECK 3 FAILED: Found {len(failed_leads)} non-demo leads with failed AI classification")
            return False
            
    except Exception as e:
        print(f"\n✗ CHECK 3 ERROR: {e}")
        return False

def test_check_4_auth_gating(session: TestSession):
    """
    CHECK 4: Unauthenticated POST /api/ai/leads/<id> and /api/ai/process-pending -> 401
    """
    print("\n" + "="*80)
    print("CHECK 4: Authentication Gating")
    print("="*80)
    
    # Create unauthenticated session
    unauth_session = requests.Session()
    unauth_session.headers.update({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    })
    
    all_passed = True
    
    # Test 1: Unauthenticated POST /api/ai/process-pending
    print("\n1. Testing unauthenticated POST /api/ai/process-pending...")
    try:
        resp = unauth_session.post(
            f"{API_BASE}/ai/process-pending",
            json={"limit": 5},
            timeout=10
        )
        if resp.status_code == 401:
            print(f"  ✓ Correctly returned 401 Unauthorized")
        else:
            print(f"  ✗ Expected 401, got {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        all_passed = False
    
    # Test 2: Unauthenticated POST /api/ai/leads/:id
    print("\n2. Testing unauthenticated POST /api/ai/leads/:id...")
    try:
        # Get a lead ID first (using authenticated session)
        resp = session.get("leads", timeout=30)
        if resp.status_code == 200:
            leads = resp.json()
            if leads:
                test_lead_id = leads[0]['id']
                print(f"  Using lead ID: {test_lead_id}")
                
                resp = unauth_session.post(
                    f"{API_BASE}/ai/leads/{test_lead_id}",
                    json={"force": True},
                    timeout=10
                )
                if resp.status_code == 401:
                    print(f"  ✓ Correctly returned 401 Unauthorized")
                else:
                    print(f"  ✗ Expected 401, got {resp.status_code}")
                    all_passed = False
            else:
                print(f"  ✗ No leads found to test with")
                all_passed = False
        else:
            print(f"  ✗ Could not get leads: {resp.status_code}")
            all_passed = False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        all_passed = False
    
    if all_passed:
        print("\n✓ CHECK 4 PASSED: Authentication gating working correctly")
    else:
        print("\n✗ CHECK 4 FAILED: Authentication gating issues detected")
    
    return all_passed

def main():
    print("="*80)
    print("PHASE 4 AI FIX VERIFICATION TEST SUITE")
    print("TradeScout - Sequential AI Processing & Grounding Validation")
    print("="*80)
    print(f"\nBase URL: {BASE_URL}")
    print(f"Test User: {CREDENTIALS['email']}")
    
    session = TestSession()
    
    # Login
    if not session.login():
        print("\n✗ FATAL: Could not authenticate. Aborting tests.")
        sys.exit(1)
    
    # Run all checks
    results = {}
    
    results['check_1'] = test_check_1_process_pending(session)
    results['check_2'] = test_check_2_lead_ai_processing(session)
    results['check_3'] = test_check_3_no_failed_leads(session)
    results['check_4'] = test_check_4_auth_gating(session)
    
    # Final summary
    print("\n" + "="*80)
    print("FINAL TEST RESULTS")
    print("="*80)
    
    for check, passed in results.items():
        status = "✓ PASSED" if passed else "✗ FAILED"
        print(f"{status}: {check.upper().replace('_', ' ')}")
    
    all_passed = all(results.values())
    
    print("\n" + "="*80)
    if all_passed:
        print("✓ ALL CHECKS PASSED - PHASE 4 AI FIXES VERIFIED")
    else:
        print("✗ SOME CHECKS FAILED - SEE DETAILS ABOVE")
    print("="*80)
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
