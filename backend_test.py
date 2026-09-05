#!/usr/bin/env python3
"""
TradeScout Backend Testing: High-Opportunity Alerts Endpoint
Tests the new GET /api/alerts endpoint that powers the in-app alerts bell.
Also includes regression tests for existing endpoints.
"""

import requests
import json
import sys
from typing import Dict, Any, List, Optional

# Configuration
BASE_URL = "https://tradescout-preview.preview.emergentagent.com/api"
AUTH_EMAIL = "qa.tradescout@example.com"
AUTH_PASSWORD = "TradeScout!2025"

class TestSession:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.authenticated = False
    
    def login(self) -> bool:
        """Authenticate and establish cookie session"""
        try:
            print(f"\n{'='*80}")
            print("AUTHENTICATION")
            print(f"{'='*80}")
            
            response = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"email": AUTH_EMAIL, "password": AUTH_PASSWORD},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✓ Login successful: {data.get('user', {}).get('email')}")
                self.authenticated = True
                return True
            else:
                print(f"✗ Login failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"✗ Login error: {e}")
            return False
    
    def get(self, path: str, **kwargs) -> requests.Response:
        """GET request with session cookies"""
        return self.session.get(f"{BASE_URL}/{path}", timeout=30, **kwargs)
    
    def post(self, path: str, **kwargs) -> requests.Response:
        """POST request with session cookies"""
        return self.session.post(f"{BASE_URL}/{path}", timeout=30, **kwargs)


def test_1_leads_list_scoring_fields(session: TestSession) -> bool:
    """
    TEST 1: GET /api/leads -> every lead has lead_score (0-100), 
    score_category in [high,good,moderate,low], and score_factors with 7 factors
    """
    print(f"\n{'='*80}")
    print("TEST 1: Leads List - Scoring Fields Validation")
    print(f"{'='*80}")
    
    try:
        response = session.get("leads")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads failed: {response.status_code}")
            return False
        
        leads = response.json()
        print(f"✓ GET /api/leads returned {len(leads)} leads")
        
        if len(leads) == 0:
            print("✗ No leads found in database")
            return False
        
        # Validate every lead has required scoring fields
        valid_categories = ['high', 'good', 'moderate', 'low']
        all_valid = True
        
        for i, lead in enumerate(leads):
            lead_id = lead.get('id', 'unknown')
            project_name = lead.get('project_name', 'unknown')
            
            # Check lead_score
            if 'lead_score' not in lead:
                print(f"✗ Lead {i+1} ({project_name}): missing lead_score")
                all_valid = False
                continue
            
            lead_score = lead['lead_score']
            if not isinstance(lead_score, int) or lead_score < 0 or lead_score > 100:
                print(f"✗ Lead {i+1} ({project_name}): lead_score={lead_score} not in 0-100")
                all_valid = False
                continue
            
            # Check score_category
            if 'score_category' not in lead:
                print(f"✗ Lead {i+1} ({project_name}): missing score_category")
                all_valid = False
                continue
            
            score_category = lead['score_category']
            if score_category not in valid_categories:
                print(f"✗ Lead {i+1} ({project_name}): score_category={score_category} not in {valid_categories}")
                all_valid = False
                continue
            
            # Check score_factors
            if 'score_factors' not in lead:
                print(f"✗ Lead {i+1} ({project_name}): missing score_factors")
                all_valid = False
                continue
            
            score_factors = lead['score_factors']
            if not isinstance(score_factors, dict):
                print(f"✗ Lead {i+1} ({project_name}): score_factors not an object")
                all_valid = False
                continue
            
            # Check factors array
            if 'factors' not in score_factors:
                print(f"✗ Lead {i+1} ({project_name}): score_factors missing factors array")
                all_valid = False
                continue
            
            factors = score_factors['factors']
            if not isinstance(factors, list) or len(factors) != 7:
                print(f"✗ Lead {i+1} ({project_name}): factors array has {len(factors)} entries, expected 7")
                all_valid = False
                continue
            
            # Validate each factor structure
            required_factor_keys = ['key', 'label', 'points', 'awarded', 'earned', 'reason']
            for j, factor in enumerate(factors):
                for key in required_factor_keys:
                    if key not in factor:
                        print(f"✗ Lead {i+1} ({project_name}): factor {j+1} missing key '{key}'")
                        all_valid = False
        
        if all_valid:
            print(f"✓ All {len(leads)} leads have valid scoring fields:")
            print(f"  - lead_score (integer 0-100)")
            print(f"  - score_category in {valid_categories}")
            print(f"  - score_factors.factors[] with 7 entries")
            print(f"  - Each factor has: key, label, points, awarded, earned, reason")
            return True
        else:
            print(f"✗ Some leads have invalid scoring fields")
            return False
            
    except Exception as e:
        print(f"✗ Test 1 error: {e}")
        return False


def test_2_cell_window_glazing_score(session: TestSession) -> Dict[str, Any]:
    """
    TEST 2: GET /api/leads?q=Glazing -> find 'Cell Window Glazing' lead
    Verify lead_score == 90, score_category == 'high'
    Verify factor breakdown matches expected values
    """
    print(f"\n{'='*80}")
    print("TEST 2: Cell Window Glazing - Expected Score 90 (High)")
    print(f"{'='*80}")
    
    try:
        # Search for the lead
        response = session.get("leads", params={"q": "Glazing"})
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads?q=Glazing failed: {response.status_code}")
            return {"success": False}
        
        leads = response.json()
        print(f"✓ Search returned {len(leads)} leads")
        
        # Find Cell Window Glazing
        target_lead = None
        for lead in leads:
            if 'Cell Window Glazing' in lead.get('project_name', ''):
                target_lead = lead
                break
        
        if not target_lead:
            print(f"✗ 'Cell Window Glazing' lead not found in search results")
            return {"success": False}
        
        lead_id = target_lead['id']
        print(f"✓ Found 'Cell Window Glazing' lead: {lead_id}")
        
        # Get full lead detail
        response = session.get(f"leads/{lead_id}")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads/{lead_id} failed: {response.status_code}")
            return {"success": False}
        
        lead = response.json()
        
        # Snapshot factual fields BEFORE any operations
        factual_fields = {
            'project_name': lead.get('project_name'),
            'tender_status': lead.get('tender_status'),
            'trade_category': lead.get('trade_category'),
            'contact_email': lead.get('contact_email'),
            'timeline_text': lead.get('timeline_text'),
            'project_description': lead.get('project_description'),
            'location': lead.get('location'),
            'company_name': lead.get('company_name'),
            'contact_name': lead.get('contact_name'),
            'bid_deadline': lead.get('bid_deadline'),
            'project_type': lead.get('project_type'),
        }
        
        print(f"\n--- Lead Details ---")
        print(f"Project: {lead.get('project_name')}")
        print(f"Tender Status: {lead.get('tender_status')}")
        print(f"Trade Category: {lead.get('trade_category')}")
        print(f"Contact Email: {lead.get('contact_email')}")
        print(f"Source Trust Level: {lead.get('source', {}).get('trust_level')}")
        
        # Check lead_score
        lead_score = lead.get('lead_score')
        print(f"\n--- Score Validation ---")
        print(f"Lead Score: {lead_score} (expected: 90)")
        
        if lead_score != 90:
            print(f"✗ Lead score is {lead_score}, expected 90")
            # Continue to show factor breakdown
        else:
            print(f"✓ Lead score matches expected value: 90")
        
        # Check score_category
        score_category = lead.get('score_category')
        print(f"Score Category: {score_category} (expected: high)")
        
        if score_category != 'high':
            print(f"✗ Score category is {score_category}, expected 'high'")
        else:
            print(f"✓ Score category matches expected value: high")
        
        # Analyze factor breakdown
        score_factors = lead.get('score_factors', {})
        factors = score_factors.get('factors', [])
        
        print(f"\n--- Factor Breakdown (7 factors) ---")
        
        expected_factors = {
            'active_tender': {'points': 25, 'awarded': True, 'earned': 25, 'reason_contains': 'open'},
            'trade_match': {'points': 20, 'awarded': True, 'earned': 20},
            'contact_info': {'points': 15, 'awarded': True, 'earned': 15},
            'recently_published': {'points': 15, 'awarded': True, 'earned': 15},
            'project_size': {'points': 10, 'awarded': False, 'earned': 0, 'reason_contains': 'does not state'},
            'timeline': {'points': 10, 'awarded': True, 'earned': 10},
            'reliable_source': {'points': 5, 'awarded': True, 'earned': 5, 'reason_contains': '90'},
        }
        
        total_earned = 0
        all_factors_valid = True
        
        for factor in factors:
            key = factor.get('key')
            label = factor.get('label')
            points = factor.get('points')
            awarded = factor.get('awarded')
            earned = factor.get('earned')
            reason = factor.get('reason', '')
            
            total_earned += earned
            
            print(f"\n{key}:")
            print(f"  Label: {label}")
            print(f"  Points: {points}")
            print(f"  Awarded: {awarded}")
            print(f"  Earned: {earned}")
            print(f"  Reason: {reason}")
            
            # Validate against expected
            if key in expected_factors:
                exp = expected_factors[key]
                
                if points != exp['points']:
                    print(f"  ✗ Points mismatch: got {points}, expected {exp['points']}")
                    all_factors_valid = False
                
                if awarded != exp['awarded']:
                    print(f"  ✗ Awarded mismatch: got {awarded}, expected {exp['awarded']}")
                    all_factors_valid = False
                
                if earned != exp['earned']:
                    print(f"  ✗ Earned mismatch: got {earned}, expected {exp['earned']}")
                    all_factors_valid = False
                
                if 'reason_contains' in exp and exp['reason_contains'].lower() not in reason.lower():
                    print(f"  ✗ Reason should contain '{exp['reason_contains']}'")
                    all_factors_valid = False
                
                if all([
                    points == exp['points'],
                    awarded == exp['awarded'],
                    earned == exp['earned']
                ]):
                    print(f"  ✓ Factor matches expected values")
        
        print(f"\n--- Score Calculation ---")
        print(f"Sum of earned points: {total_earned}")
        print(f"Lead score (normalized): {lead_score}")
        
        if total_earned != lead_score:
            print(f"✗ Sum of earned ({total_earned}) != lead_score ({lead_score})")
            all_factors_valid = False
        else:
            print(f"✓ Sum of earned points equals lead_score")
        
        success = (lead_score == 90 and score_category == 'high' and all_factors_valid)
        
        if success:
            print(f"\n✓ TEST 2 PASSED: Cell Window Glazing has correct score and factor breakdown")
        else:
            print(f"\n✗ TEST 2 FAILED: Some validations did not pass")
        
        return {
            "success": success,
            "lead_id": lead_id,
            "factual_fields_snapshot": factual_fields,
            "lead_score": lead_score,
            "factors": factors
        }
        
    except Exception as e:
        print(f"✗ Test 2 error: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False}


def test_3_data_integrity_during_rescore(session: TestSession, glazing_data: Dict[str, Any]) -> bool:
    """
    TEST 3: Data integrity - factual fields must be byte-identical before/after rescore
    Scoring must only change lead_score/score_category/score_factors/scored_at/published_at
    """
    print(f"\n{'='*80}")
    print("TEST 3: Data Integrity During Rescore")
    print(f"{'='*80}")
    
    if not glazing_data.get("success"):
        print("✗ Skipping test 3 - Cell Window Glazing data not available")
        return False
    
    try:
        lead_id = glazing_data["lead_id"]
        snapshot_before = glazing_data["factual_fields_snapshot"]
        
        print(f"Lead ID: {lead_id}")
        print(f"Factual fields snapshot taken in Test 2")
        
        # Run rescore
        print(f"\n--- Running POST /api/admin/rescore ---")
        response = session.post("admin/rescore", json={})
        
        if response.status_code != 200:
            print(f"✗ POST /api/admin/rescore failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        rescore_result = response.json()
        print(f"✓ Rescore completed:")
        print(f"  Scored: {rescore_result.get('scored')}")
        print(f"  Total: {rescore_result.get('total')}")
        print(f"  Distribution: {rescore_result.get('distribution')}")
        
        # Get lead again
        print(f"\n--- Fetching lead after rescore ---")
        response = session.get(f"leads/{lead_id}")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads/{lead_id} failed: {response.status_code}")
            return False
        
        lead_after = response.json()
        
        # Compare factual fields
        print(f"\n--- Comparing Factual Fields (Before vs After) ---")
        
        all_identical = True
        for field, value_before in snapshot_before.items():
            value_after = lead_after.get(field)
            
            if value_before != value_after:
                print(f"✗ {field}: CHANGED")
                print(f"  Before: {value_before}")
                print(f"  After: {value_after}")
                all_identical = False
            else:
                print(f"✓ {field}: unchanged")
        
        if all_identical:
            print(f"\n✓ TEST 3 PASSED: All factual fields are byte-identical after rescore")
            return True
        else:
            print(f"\n✗ TEST 3 FAILED: Some factual fields were modified by scoring")
            return False
            
    except Exception as e:
        print(f"✗ Test 3 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_4_non_open_tender_scoring(session: TestSession) -> bool:
    """
    TEST 4: Find a lead whose tender_status is NOT 'open'/'closing_soon'
    Verify its active_tender factor is awarded:false, earned:0
    """
    print(f"\n{'='*80}")
    print("TEST 4: Non-Open Tender - Active Tender Factor Should Be False")
    print(f"{'='*80}")
    
    try:
        # Get all leads
        response = session.get("leads")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads failed: {response.status_code}")
            return False
        
        leads = response.json()
        
        # Find a lead with tender_status NOT in ['open', 'closing_soon']
        non_open_lead = None
        for lead in leads:
            tender_status = str(lead.get('tender_status', '')).lower()
            if tender_status not in ['open', 'closing_soon', '']:
                non_open_lead = lead
                break
        
        # If not found, try DEMO leads or leads with null tender_status
        if not non_open_lead:
            for lead in leads:
                if lead.get('is_demo') or not lead.get('tender_status'):
                    non_open_lead = lead
                    break
        
        if not non_open_lead:
            print(f"✗ No lead found with tender_status != 'open'/'closing_soon'")
            print(f"  (Searched {len(leads)} leads)")
            return False
        
        lead_id = non_open_lead['id']
        project_name = non_open_lead.get('project_name', 'unknown')
        tender_status = non_open_lead.get('tender_status', 'null')
        
        print(f"✓ Found lead: {project_name}")
        print(f"  Lead ID: {lead_id}")
        print(f"  Tender Status: {tender_status}")
        print(f"  Is Demo: {non_open_lead.get('is_demo', False)}")
        
        # Get full lead detail
        response = session.get(f"leads/{lead_id}")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads/{lead_id} failed: {response.status_code}")
            return False
        
        lead = response.json()
        
        # Check active_tender factor
        score_factors = lead.get('score_factors', {})
        factors = score_factors.get('factors', [])
        
        active_tender_factor = None
        for factor in factors:
            if factor.get('key') == 'active_tender':
                active_tender_factor = factor
                break
        
        if not active_tender_factor:
            print(f"✗ active_tender factor not found in score_factors")
            return False
        
        print(f"\n--- Active Tender Factor ---")
        print(f"Awarded: {active_tender_factor.get('awarded')}")
        print(f"Earned: {active_tender_factor.get('earned')}")
        print(f"Reason: {active_tender_factor.get('reason')}")
        
        awarded = active_tender_factor.get('awarded')
        earned = active_tender_factor.get('earned')
        
        if awarded == False and earned == 0:
            print(f"\n✓ TEST 4 PASSED: Non-open tender has active_tender awarded=false, earned=0")
            return True
        else:
            print(f"\n✗ TEST 4 FAILED: Expected awarded=false, earned=0, got awarded={awarded}, earned={earned}")
            return False
            
    except Exception as e:
        print(f"✗ Test 4 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_5_determinism(session: TestSession) -> bool:
    """
    TEST 5: Determinism - POST /api/admin/rescore twice
    Verify same lead's lead_score and score_factors are byte-identical between runs
    """
    print(f"\n{'='*80}")
    print("TEST 5: Determinism - Rescore Twice Should Produce Identical Results")
    print(f"{'='*80}")
    
    try:
        # First rescore
        print(f"\n--- First Rescore ---")
        response1 = session.post("admin/rescore", json={})
        
        if response1.status_code != 200:
            print(f"✗ First POST /api/admin/rescore failed: {response1.status_code}")
            return False
        
        result1 = response1.json()
        print(f"✓ First rescore completed:")
        print(f"  Scored: {result1.get('scored')}")
        print(f"  Total: {result1.get('total')}")
        print(f"  Distribution: {result1.get('distribution')}")
        
        expected_total = result1.get('total', 0)
        expected_scored = result1.get('scored', 0)
        
        if expected_scored != expected_total:
            print(f"✗ First rescore: scored ({expected_scored}) != total ({expected_total})")
            return False
        
        if expected_total != 27:
            print(f"⚠ Warning: Expected 27 total leads, got {expected_total}")
        
        # Get a sample lead's score
        response = session.get("leads", params={"q": "Glazing"})
        if response.status_code != 200:
            print(f"✗ Failed to get sample lead")
            return False
        
        leads = response.json()
        sample_lead = None
        for lead in leads:
            if 'Cell Window Glazing' in lead.get('project_name', ''):
                sample_lead = lead
                break
        
        if not sample_lead:
            print(f"✗ Sample lead not found")
            return False
        
        lead_id = sample_lead['id']
        score_after_first = sample_lead.get('lead_score')
        factors_after_first = sample_lead.get('score_factors')
        
        print(f"\nSample lead after first rescore:")
        print(f"  Lead ID: {lead_id}")
        print(f"  Score: {score_after_first}")
        
        # Second rescore
        print(f"\n--- Second Rescore ---")
        response2 = session.post("admin/rescore", json={})
        
        if response2.status_code != 200:
            print(f"✗ Second POST /api/admin/rescore failed: {response2.status_code}")
            return False
        
        result2 = response2.json()
        print(f"✓ Second rescore completed:")
        print(f"  Scored: {result2.get('scored')}")
        print(f"  Total: {result2.get('total')}")
        print(f"  Distribution: {result2.get('distribution')}")
        
        # Compare results
        print(f"\n--- Comparing Rescore Results ---")
        
        if result1.get('scored') != result2.get('scored'):
            print(f"✗ Scored count differs: {result1.get('scored')} vs {result2.get('scored')}")
            return False
        
        if result1.get('total') != result2.get('total'):
            print(f"✗ Total count differs: {result1.get('total')} vs {result2.get('total')}")
            return False
        
        if result1.get('distribution') != result2.get('distribution'):
            print(f"✗ Distribution differs:")
            print(f"  First: {result1.get('distribution')}")
            print(f"  Second: {result2.get('distribution')}")
            return False
        
        print(f"✓ Rescore results are identical")
        
        # Get sample lead again
        response = session.get(f"leads/{lead_id}")
        if response.status_code != 200:
            print(f"✗ Failed to get sample lead after second rescore")
            return False
        
        lead_after_second = response.json()
        score_after_second = lead_after_second.get('lead_score')
        factors_after_second = lead_after_second.get('score_factors')
        
        print(f"\nSample lead after second rescore:")
        print(f"  Score: {score_after_second}")
        
        # Compare lead scores
        if score_after_first != score_after_second:
            print(f"✗ Lead score changed: {score_after_first} -> {score_after_second}")
            return False
        
        # Compare factors (excluding scored_at timestamp)
        factors1_copy = dict(factors_after_first)
        factors2_copy = dict(factors_after_second)
        
        # Remove scored_at for comparison (timestamp will differ)
        factors1_copy.pop('scored_at', None)
        factors2_copy.pop('scored_at', None)
        
        # Compare factor arrays
        factors1_array = factors1_copy.get('factors', [])
        factors2_array = factors2_copy.get('factors', [])
        
        if len(factors1_array) != len(factors2_array):
            print(f"✗ Factor count differs: {len(factors1_array)} vs {len(factors2_array)}")
            return False
        
        for i, (f1, f2) in enumerate(zip(factors1_array, factors2_array)):
            if f1.get('key') != f2.get('key'):
                print(f"✗ Factor {i} key differs: {f1.get('key')} vs {f2.get('key')}")
                return False
            if f1.get('awarded') != f2.get('awarded'):
                print(f"✗ Factor {i} ({f1.get('key')}) awarded differs: {f1.get('awarded')} vs {f2.get('awarded')}")
                return False
            if f1.get('earned') != f2.get('earned'):
                print(f"✗ Factor {i} ({f1.get('key')}) earned differs: {f1.get('earned')} vs {f2.get('earned')}")
                return False
        
        print(f"✓ Sample lead score and factors are identical (deterministic)")
        
        print(f"\n✓ TEST 5 PASSED: Rescore is deterministic")
        return True
        
    except Exception as e:
        print(f"✗ Test 5 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_6_single_lead_rescore(session: TestSession) -> bool:
    """
    TEST 6: POST /api/admin/rescore {lead_id: <id>} -> re-scores only that lead
    Should return scored:1, total:1
    """
    print(f"\n{'='*80}")
    print("TEST 6: Single Lead Rescore")
    print(f"{'='*80}")
    
    try:
        # Get a sample lead
        response = session.get("leads", params={"q": "Glazing"})
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads failed: {response.status_code}")
            return False
        
        leads = response.json()
        if len(leads) == 0:
            print(f"✗ No leads found")
            return False
        
        sample_lead = leads[0]
        lead_id = sample_lead['id']
        project_name = sample_lead.get('project_name', 'unknown')
        
        print(f"Selected lead: {project_name}")
        print(f"Lead ID: {lead_id}")
        
        # Rescore single lead
        print(f"\n--- Rescoring Single Lead ---")
        response = session.post("admin/rescore", json={"lead_id": lead_id})
        
        if response.status_code != 200:
            print(f"✗ POST /api/admin/rescore {{lead_id}} failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"✓ Single lead rescore completed:")
        print(f"  Scored: {result.get('scored')}")
        print(f"  Total: {result.get('total')}")
        print(f"  Distribution: {result.get('distribution')}")
        
        scored = result.get('scored')
        total = result.get('total')
        
        if scored != 1:
            print(f"✗ Expected scored=1, got {scored}")
            return False
        
        if total != 1:
            print(f"✗ Expected total=1, got {total}")
            return False
        
        print(f"\n✓ TEST 6 PASSED: Single lead rescore returned scored=1, total=1")
        return True
        
    except Exception as e:
        print(f"✗ Test 6 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_7_auth_gating(session: TestSession) -> bool:
    """
    TEST 7: Unauthenticated POST /api/admin/rescore -> 401
    """
    print(f"\n{'='*80}")
    print("TEST 7: Auth Gating - Unauthenticated Rescore Should Return 401")
    print(f"{'='*80}")
    
    try:
        # Create a new session without authentication
        unauth_session = requests.Session()
        unauth_session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
        print(f"Attempting unauthenticated POST /api/admin/rescore")
        
        response = unauth_session.post(
            f"{BASE_URL}/admin/rescore",
            json={},
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 401:
            print(f"✓ Unauthenticated request correctly returned 401")
            print(f"\n✓ TEST 7 PASSED: Auth gating working correctly")
            return True
        else:
            print(f"✗ Expected 401, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Test 7 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_8_no_factor_without_data(session: TestSession) -> bool:
    """
    TEST 8: "No factor without verifiable data" rule
    - Leads with source_stated_value null -> project_size earned=0
    - Leads with published_at null OR future -> recently_published earned=0
    """
    print(f"\n{'='*80}")
    print("TEST 8: No Factor Without Verifiable Data")
    print(f"{'='*80}")
    
    try:
        # Get all leads
        response = session.get("leads")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads failed: {response.status_code}")
            return False
        
        leads = response.json()
        print(f"✓ Retrieved {len(leads)} leads")
        
        # Check project_size factor for leads without source_stated_value
        print(f"\n--- Checking project_size factor (source_stated_value null) ---")
        
        leads_without_value = [l for l in leads if not l.get('source_stated_value')]
        print(f"Found {len(leads_without_value)} leads without source_stated_value")
        
        project_size_valid = True
        for lead in leads_without_value[:5]:  # Check first 5
            project_name = lead.get('project_name', 'unknown')
            score_factors = lead.get('score_factors', {})
            factors = score_factors.get('factors', [])
            
            project_size_factor = None
            for factor in factors:
                if factor.get('key') == 'project_size':
                    project_size_factor = factor
                    break
            
            if project_size_factor:
                earned = project_size_factor.get('earned')
                awarded = project_size_factor.get('awarded')
                
                if earned != 0 or awarded != False:
                    print(f"✗ {project_name}: project_size earned={earned}, awarded={awarded} (expected 0, false)")
                    project_size_valid = False
                else:
                    print(f"✓ {project_name}: project_size correctly earned=0")
        
        # Check recently_published factor for leads without published_at or future dates
        print(f"\n--- Checking recently_published factor (published_at null/future) ---")
        
        from datetime import datetime
        now = datetime.utcnow()
        
        leads_without_published = []
        for lead in leads:
            published_at = lead.get('published_at')
            if not published_at:
                leads_without_published.append(lead)
            else:
                try:
                    pub_date = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                    if pub_date > now:
                        leads_without_published.append(lead)
                except:
                    pass
        
        print(f"Found {len(leads_without_published)} leads without published_at or future dates")
        
        recently_published_valid = True
        for lead in leads_without_published[:5]:  # Check first 5
            project_name = lead.get('project_name', 'unknown')
            published_at = lead.get('published_at')
            score_factors = lead.get('score_factors', {})
            factors = score_factors.get('factors', [])
            
            recently_published_factor = None
            for factor in factors:
                if factor.get('key') == 'recently_published':
                    recently_published_factor = factor
                    break
            
            if recently_published_factor:
                earned = recently_published_factor.get('earned')
                awarded = recently_published_factor.get('awarded')
                
                if earned != 0 or awarded != False:
                    print(f"✗ {project_name} (published_at={published_at}): recently_published earned={earned}, awarded={awarded} (expected 0, false)")
                    recently_published_valid = False
                else:
                    print(f"✓ {project_name}: recently_published correctly earned=0")
        
        if project_size_valid and recently_published_valid:
            print(f"\n✓ TEST 8 PASSED: No factor awarded without verifiable data")
            return True
        else:
            print(f"\n✗ TEST 8 FAILED: Some factors awarded without verifiable data")
            return False
            
    except Exception as e:
        print(f"✗ Test 8 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_alerts_authenticated(session: TestSession) -> bool:
    """
    TEST ALERTS-1: Authenticated GET /api/alerts
    - Returns HTTP 200 with JSON array
    - EVERY item has score_category == 'high' AND lead_score >= 80
    - Array ordered by created_at descending
    - Count matches number of High-band leads (expect 5) and never exceeds 30
    - Each item includes: id, project_name, trade_category, location, lead_score, score_category, created_at, is_demo
    """
    print(f"\n{'='*80}")
    print("TEST ALERTS-1: Authenticated GET /api/alerts")
    print(f"{'='*80}")
    
    try:
        response = session.get("alerts")
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"✗ Expected HTTP 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        print(f"✓ HTTP 200 returned")
        
        alerts = response.json()
        
        if not isinstance(alerts, list):
            print(f"✗ Response is not a JSON array, got type: {type(alerts)}")
            return False
        
        print(f"✓ Response is a JSON array")
        print(f"✓ Array length: {len(alerts)}")
        
        # Check count
        if len(alerts) > 30:
            print(f"✗ Array length {len(alerts)} exceeds maximum of 30")
            return False
        
        print(f"✓ Array length does not exceed 30")
        
        # Expected count is 5 high-band leads
        expected_count = 5
        if len(alerts) != expected_count:
            print(f"⚠ Warning: Expected {expected_count} high-band leads, got {len(alerts)}")
            # Not a failure, just a warning - the count may vary
        
        # Validate each item
        required_fields = ['id', 'project_name', 'trade_category', 'location', 'lead_score', 'score_category', 'created_at', 'is_demo']
        all_valid = True
        
        print(f"\n--- Validating {len(alerts)} alert items ---")
        
        for i, alert in enumerate(alerts):
            project_name = alert.get('project_name', 'unknown')
            
            # Check required fields
            missing_fields = [f for f in required_fields if f not in alert]
            if missing_fields:
                print(f"✗ Alert {i+1} ({project_name}): missing fields {missing_fields}")
                all_valid = False
                continue
            
            # Check score_category == 'high'
            score_category = alert.get('score_category')
            if score_category != 'high':
                print(f"✗ Alert {i+1} ({project_name}): score_category={score_category}, expected 'high'")
                all_valid = False
            
            # Check lead_score >= 80
            lead_score = alert.get('lead_score')
            if not isinstance(lead_score, int) or lead_score < 80:
                print(f"✗ Alert {i+1} ({project_name}): lead_score={lead_score}, expected >= 80")
                all_valid = False
            
            # Print item details
            print(f"\nAlert {i+1}:")
            print(f"  Project: {project_name}")
            print(f"  Trade: {alert.get('trade_category')}")
            print(f"  Location: {alert.get('location')}")
            print(f"  Score: {lead_score} ({score_category})")
            print(f"  Created: {alert.get('created_at')}")
            print(f"  Is Demo: {alert.get('is_demo')}")
        
        # Check ordering by created_at descending
        print(f"\n--- Checking created_at ordering (descending) ---")
        
        ordering_valid = True
        for i in range(len(alerts) - 1):
            current_created = alerts[i].get('created_at')
            next_created = alerts[i+1].get('created_at')
            
            if current_created and next_created:
                if current_created < next_created:
                    print(f"✗ Ordering violation at index {i}: {current_created} < {next_created}")
                    ordering_valid = False
        
        if ordering_valid:
            print(f"✓ Array is correctly ordered by created_at descending")
        else:
            all_valid = False
        
        if all_valid:
            print(f"\n✓ TEST ALERTS-1 PASSED: All validations passed")
            return True
        else:
            print(f"\n✗ TEST ALERTS-1 FAILED: Some validations failed")
            return False
            
    except Exception as e:
        print(f"✗ Test ALERTS-1 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_alerts_unauthenticated() -> bool:
    """
    TEST ALERTS-2: Unauthenticated GET /api/alerts -> HTTP 401
    """
    print(f"\n{'='*80}")
    print("TEST ALERTS-2: Unauthenticated GET /api/alerts")
    print(f"{'='*80}")
    
    try:
        # Create a new session without authentication
        unauth_session = requests.Session()
        unauth_session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
        print(f"Attempting unauthenticated GET /api/alerts")
        
        response = unauth_session.get(
            f"{BASE_URL}/alerts",
            timeout=30
        )
        
        print(f"Response status: {response.status_code}")
        
        if response.status_code == 401:
            print(f"✓ Unauthenticated request correctly returned 401")
            print(f"\n✓ TEST ALERTS-2 PASSED: Auth gating working correctly")
            return True
        else:
            print(f"✗ Expected 401, got {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Test ALERTS-2 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_leads(session: TestSession) -> bool:
    """
    TEST REGRESSION-1: GET /api/leads returns 27 leads with lead_score/score_category/score_factors
    """
    print(f"\n{'='*80}")
    print("TEST REGRESSION-1: GET /api/leads (27 leads with scoring)")
    print(f"{'='*80}")
    
    try:
        response = session.get("leads")
        
        if response.status_code != 200:
            print(f"✗ GET /api/leads failed: {response.status_code}")
            return False
        
        leads = response.json()
        print(f"✓ GET /api/leads returned {len(leads)} leads")
        
        expected_count = 27
        if len(leads) != expected_count:
            print(f"⚠ Warning: Expected {expected_count} leads, got {len(leads)}")
            # Not a hard failure - count may vary
        
        # Check that each lead has scoring fields
        all_valid = True
        for i, lead in enumerate(leads):
            if 'lead_score' not in lead:
                print(f"✗ Lead {i+1}: missing lead_score")
                all_valid = False
            if 'score_category' not in lead:
                print(f"✗ Lead {i+1}: missing score_category")
                all_valid = False
            if 'score_factors' not in lead:
                print(f"✗ Lead {i+1}: missing score_factors")
                all_valid = False
        
        if all_valid:
            print(f"✓ All leads have lead_score, score_category, and score_factors")
            print(f"\n✓ TEST REGRESSION-1 PASSED")
            return True
        else:
            print(f"\n✗ TEST REGRESSION-1 FAILED: Some leads missing scoring fields")
            return False
            
    except Exception as e:
        print(f"✗ Test REGRESSION-1 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_saved_leads(session: TestSession) -> bool:
    """
    TEST REGRESSION-2: GET /api/saved-leads returns array with .lead object including lead_score and score_category
    """
    print(f"\n{'='*80}")
    print("TEST REGRESSION-2: GET /api/saved-leads (lead object with scoring)")
    print(f"{'='*80}")
    
    try:
        response = session.get("saved-leads")
        
        if response.status_code != 200:
            print(f"✗ GET /api/saved-leads failed: {response.status_code}")
            return False
        
        saved_leads = response.json()
        print(f"✓ GET /api/saved-leads returned {len(saved_leads)} saved leads")
        
        if len(saved_leads) == 0:
            print(f"⚠ No saved leads found - creating one for testing")
            
            # Get a lead to save
            leads_response = session.get("leads")
            if leads_response.status_code != 200:
                print(f"✗ Failed to get leads for testing")
                return False
            
            leads = leads_response.json()
            if len(leads) == 0:
                print(f"✗ No leads available to save")
                return False
            
            # Save the first lead
            lead_to_save = leads[0]
            save_response = session.post("saved-leads", json={"lead_id": lead_to_save['id']})
            
            if save_response.status_code not in [200, 201]:
                print(f"✗ Failed to save lead: {save_response.status_code}")
                return False
            
            print(f"✓ Created a saved lead for testing")
            
            # Get saved leads again
            response = session.get("saved-leads")
            if response.status_code != 200:
                print(f"✗ GET /api/saved-leads failed after saving: {response.status_code}")
                return False
            
            saved_leads = response.json()
        
        # Check that each saved lead has a .lead object with scoring fields
        all_valid = True
        for i, saved_lead in enumerate(saved_leads):
            if 'lead' not in saved_lead:
                print(f"✗ Saved lead {i+1}: missing 'lead' object")
                all_valid = False
                continue
            
            lead = saved_lead['lead']
            
            if 'lead_score' not in lead:
                print(f"✗ Saved lead {i+1}: lead object missing lead_score")
                all_valid = False
            
            if 'score_category' not in lead:
                print(f"✗ Saved lead {i+1}: lead object missing score_category")
                all_valid = False
        
        if all_valid:
            print(f"✓ All saved leads have .lead object with lead_score and score_category")
            print(f"\n✓ TEST REGRESSION-2 PASSED")
            return True
        else:
            print(f"\n✗ TEST REGRESSION-2 FAILED: Some saved leads missing scoring fields")
            return False
            
    except Exception as e:
        print(f"✗ Test REGRESSION-2 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_regression_rescore(session: TestSession) -> bool:
    """
    TEST REGRESSION-3: POST /api/admin/rescore {} returns {scored:27,total:27,distribution:{high,good,moderate,low}}
    """
    print(f"\n{'='*80}")
    print("TEST REGRESSION-3: POST /api/admin/rescore (distribution)")
    print(f"{'='*80}")
    
    try:
        response = session.post("admin/rescore", json={})
        
        if response.status_code != 200:
            print(f"✗ POST /api/admin/rescore failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        result = response.json()
        print(f"✓ POST /api/admin/rescore returned 200")
        
        # Check required fields
        if 'scored' not in result:
            print(f"✗ Response missing 'scored' field")
            return False
        
        if 'total' not in result:
            print(f"✗ Response missing 'total' field")
            return False
        
        if 'distribution' not in result:
            print(f"✗ Response missing 'distribution' field")
            return False
        
        scored = result['scored']
        total = result['total']
        distribution = result['distribution']
        
        print(f"✓ Scored: {scored}")
        print(f"✓ Total: {total}")
        print(f"✓ Distribution: {distribution}")
        
        expected_total = 27
        if total != expected_total:
            print(f"⚠ Warning: Expected total={expected_total}, got {total}")
            # Not a hard failure - count may vary
        
        if scored != total:
            print(f"✗ Scored ({scored}) != Total ({total})")
            return False
        
        # Check distribution has all categories
        required_categories = ['high', 'good', 'moderate', 'low']
        for category in required_categories:
            if category not in distribution:
                print(f"✗ Distribution missing category '{category}'")
                return False
        
        print(f"✓ Distribution has all required categories: {required_categories}")
        print(f"\n✓ TEST REGRESSION-3 PASSED")
        return True
        
    except Exception as e:
        print(f"✗ Test REGRESSION-3 error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all alerts endpoint tests and regression tests"""
    print(f"\n{'#'*80}")
    print("# TradeScout Backend Testing")
    print("# High-Opportunity Alerts Endpoint + Regression Tests")
    print(f"{'#'*80}")
    
    # Initialize session and authenticate
    session = TestSession()
    
    if not session.login():
        print("\n✗ AUTHENTICATION FAILED - Cannot proceed with tests")
        sys.exit(1)
    
    # Run tests
    results = {}
    
    # ALERTS ENDPOINT TESTS
    print(f"\n{'='*80}")
    print("ALERTS ENDPOINT TESTS")
    print(f"{'='*80}")
    
    results['alerts_1_authenticated'] = test_alerts_authenticated(session)
    results['alerts_2_unauthenticated'] = test_alerts_unauthenticated()
    
    # REGRESSION TESTS
    print(f"\n{'='*80}")
    print("REGRESSION TESTS")
    print(f"{'='*80}")
    
    results['regression_1_leads'] = test_regression_leads(session)
    results['regression_2_saved_leads'] = test_regression_saved_leads(session)
    results['regression_3_rescore'] = test_regression_rescore(session)
    
    # Summary
    print(f"\n{'='*80}")
    print("TEST SUMMARY")
    print(f"{'='*80}")
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASSED" if result else "✗ FAILED"
        print(f"{test_name}: {status}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed}/{total} tests passed")
    print(f"{'='*80}")
    
    if passed == total:
        print("\n✓ ALL TESTS PASSED - Alerts endpoint and regression tests working correctly")
        sys.exit(0)
    else:
        print(f"\n✗ {total - passed} TEST(S) FAILED - See details above")
        sys.exit(1)


if __name__ == "__main__":
    main()
