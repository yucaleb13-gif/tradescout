#!/usr/bin/env python3
"""
TradeScout Phase 1 Backend API Test Suite
Tests all endpoints with RLS isolation verification
"""

import requests
import random
import string
import json
from datetime import datetime

# Base URL from .env
BASE_URL = "https://tradescout-preview.preview.emergentagent.com/api"

def random_email():
    """Generate random email for testing"""
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"user_{rand}@tradescout.dev"

def log_test(name, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  Details: {details}")

class TestSession:
    """Wrapper for requests session with cookie jar"""
    def __init__(self, name):
        self.name = name
        self.session = requests.Session()
        self.email = None
        self.user_id = None
        
    def post(self, path, json_data=None):
        return self.session.post(f"{BASE_URL}/{path}", json=json_data, timeout=30)
    
    def get(self, path):
        return self.session.get(f"{BASE_URL}/{path}", timeout=30)
    
    def put(self, path, json_data=None):
        return self.session.put(f"{BASE_URL}/{path}", json=json_data, timeout=30)
    
    def patch(self, path, json_data=None):
        return self.session.patch(f"{BASE_URL}/{path}", json=json_data, timeout=30)
    
    def delete(self, path):
        return self.session.delete(f"{BASE_URL}/{path}", timeout=30)

def test_auth_signup_and_profile_trigger():
    """Test 1: Signup with auto-confirm + profile trigger"""
    print("\n" + "="*80)
    print("TEST 1: Auth Signup + Profile Trigger")
    print("="*80)
    
    session = TestSession("signup_test")
    email = random_email()
    password = "Passw0rd123"
    full_name = "John Contractor"
    company_name = "ABC Roofing Ltd"
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": password,
            "fullName": full_name,
            "companyName": company_name
        })
        
        if resp.status_code != 200:
            log_test("Signup", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        if not data.get("ok") or not data.get("user"):
            log_test("Signup", False, f"Invalid response: {data}")
            return False
        
        log_test("Signup", True, f"User created: {email}")
        
        # Verify /me returns authenticated with profile
        resp = session.get("auth/me")
        if resp.status_code != 200:
            log_test("Profile trigger - /me check", False, f"Status {resp.status_code}")
            return False
        
        me_data = resp.json()
        if not me_data.get("authenticated"):
            log_test("Profile trigger - /me check", False, "Not authenticated after signup")
            return False
        
        profile = me_data.get("profile")
        if not profile:
            log_test("Profile trigger - /me check", False, "No profile returned")
            return False
        
        if profile.get("full_name") != full_name:
            log_test("Profile trigger - full_name", False, f"Expected '{full_name}', got '{profile.get('full_name')}'")
            return False
        
        if profile.get("company_name") != company_name:
            log_test("Profile trigger - company_name", False, f"Expected '{company_name}', got '{profile.get('company_name')}'")
            return False
        
        log_test("Profile trigger verification", True, f"Profile has correct full_name and company_name")
        return True
        
    except Exception as e:
        log_test("Signup test", False, f"Exception: {str(e)}")
        return False

def test_auth_login_logout():
    """Test 2: Login with correct/wrong password, logout"""
    print("\n" + "="*80)
    print("TEST 2: Auth Login / Logout")
    print("="*80)
    
    # Create a user first
    session = TestSession("login_test")
    email = random_email()
    password = "Passw0rd123"
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": password,
            "fullName": "Test User",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Login test - setup", False, f"Signup failed: {resp.status_code}")
            return False
        
        # Logout
        resp = session.post("auth/logout", {})
        if resp.status_code != 200:
            log_test("Logout", False, f"Status {resp.status_code}")
            return False
        
        log_test("Logout", True)
        
        # Verify logged out - /me should show not authenticated
        resp = session.get("auth/me")
        me_data = resp.json()
        if me_data.get("authenticated"):
            log_test("Logout verification - /me", False, "Still authenticated after logout")
            return False
        
        log_test("Logout verification - /me", True, "authenticated: false")
        
        # Try accessing protected endpoint - should get 401
        resp = session.get("sources")
        if resp.status_code != 401:
            log_test("Logout verification - protected endpoint", False, f"Expected 401, got {resp.status_code}")
            return False
        
        log_test("Logout verification - protected endpoint", True, "Got 401 as expected")
        
        # Login with wrong password
        resp = session.post("auth/login", {
            "email": email,
            "password": "WrongPassword123"
        })
        
        if resp.status_code != 401:
            log_test("Login with wrong password", False, f"Expected 401, got {resp.status_code}")
            return False
        
        log_test("Login with wrong password", True, "Got 401 as expected")
        
        # Login with correct password
        resp = session.post("auth/login", {
            "email": email,
            "password": password
        })
        
        if resp.status_code != 200:
            log_test("Login with correct password", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        if not data.get("ok"):
            log_test("Login with correct password", False, f"Invalid response: {data}")
            return False
        
        log_test("Login with correct password", True)
        
        # Verify logged in
        resp = session.get("auth/me")
        me_data = resp.json()
        if not me_data.get("authenticated"):
            log_test("Login verification - /me", False, "Not authenticated after login")
            return False
        
        log_test("Login verification - /me", True, "authenticated: true")
        
        return True
        
    except Exception as e:
        log_test("Login/Logout test", False, f"Exception: {str(e)}")
        return False

def test_auth_update_password():
    """Test 3: Update password and verify new password works"""
    print("\n" + "="*80)
    print("TEST 3: Auth Update Password")
    print("="*80)
    
    session = TestSession("password_test")
    email = random_email()
    old_password = "Passw0rd123"
    new_password = "NewPassw0rd456"
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": old_password,
            "fullName": "Password Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Update password - setup", False, f"Signup failed")
            return False
        
        # Update password
        resp = session.post("auth/update-password", {
            "password": new_password
        })
        
        if resp.status_code != 200:
            log_test("Update password", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        log_test("Update password", True)
        
        # Logout
        session.post("auth/logout", {})
        
        # Try login with old password - should fail
        resp = session.post("auth/login", {
            "email": email,
            "password": old_password
        })
        
        if resp.status_code != 401:
            log_test("Login with old password after update", False, f"Expected 401, got {resp.status_code}")
            return False
        
        log_test("Login with old password after update", True, "Got 401 as expected")
        
        # Login with new password - should work
        resp = session.post("auth/login", {
            "email": email,
            "password": new_password
        })
        
        if resp.status_code != 200:
            log_test("Login with new password", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        log_test("Login with new password", True)
        
        return True
        
    except Exception as e:
        log_test("Update password test", False, f"Exception: {str(e)}")
        return False

def test_auth_reset_request():
    """Test 4: Password reset request (always returns 200)"""
    print("\n" + "="*80)
    print("TEST 4: Auth Reset Request")
    print("="*80)
    
    session = TestSession("reset_test")
    
    try:
        # Test with non-existent email - should still return 200
        resp = session.post("auth/reset-request", {
            "email": "nonexistent@example.com"
        })
        
        if resp.status_code != 200:
            log_test("Reset request (non-existent email)", False, f"Status {resp.status_code}")
            return False
        
        log_test("Reset request (non-existent email)", True, "Returns 200 (does not reveal existence)")
        
        # Test with existing email
        email = random_email()
        signup_session = TestSession("reset_signup")
        resp = signup_session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Reset Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Reset request - setup", False, "Signup failed")
            return False
        
        resp = session.post("auth/reset-request", {
            "email": email
        })
        
        if resp.status_code != 200:
            log_test("Reset request (existing email)", False, f"Status {resp.status_code}")
            return False
        
        log_test("Reset request (existing email)", True, "Returns 200")
        
        return True
        
    except Exception as e:
        log_test("Reset request test", False, f"Exception: {str(e)}")
        return False

def test_unauthenticated_access():
    """Test 5: Unauthenticated access to protected endpoints"""
    print("\n" + "="*80)
    print("TEST 5: Unauthenticated Access to Protected Endpoints")
    print("="*80)
    
    session = TestSession("unauth_test")
    
    endpoints = [
        "sources",
        "leads",
        "stats",
        "saved-leads",
        "search-history",
        "profile"
    ]
    
    all_passed = True
    
    try:
        for endpoint in endpoints:
            resp = session.get(endpoint)
            if resp.status_code != 401:
                log_test(f"Unauthenticated GET /{endpoint}", False, f"Expected 401, got {resp.status_code}")
                all_passed = False
            else:
                log_test(f"Unauthenticated GET /{endpoint}", True, "Got 401")
        
        # Test /me unauthenticated - should return authenticated: false
        resp = session.get("auth/me")
        if resp.status_code != 200:
            log_test("Unauthenticated GET /auth/me", False, f"Expected 200, got {resp.status_code}")
            all_passed = False
        else:
            data = resp.json()
            if data.get("authenticated"):
                log_test("Unauthenticated GET /auth/me", False, "authenticated should be false")
                all_passed = False
            else:
                log_test("Unauthenticated GET /auth/me", True, "Returns authenticated: false")
        
        return all_passed
        
    except Exception as e:
        log_test("Unauthenticated access test", False, f"Exception: {str(e)}")
        return False

def test_stats_endpoint():
    """Test 6: Stats endpoint returns correct structure"""
    print("\n" + "="*80)
    print("TEST 6: Stats Endpoint")
    print("="*80)
    
    session = TestSession("stats_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Stats Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Stats test - setup", False, "Signup failed")
            return False
        
        # Get stats
        resp = session.get("stats")
        
        if resp.status_code != 200:
            log_test("GET /stats", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        
        required_fields = ["available_leads", "saved_leads", "high_opportunity", "new_this_week"]
        for field in required_fields:
            if field not in data:
                log_test(f"Stats field '{field}'", False, "Missing from response")
                return False
            
            if not isinstance(data[field], int):
                log_test(f"Stats field '{field}'", False, f"Expected int, got {type(data[field])}")
                return False
        
        log_test("Stats endpoint", True, f"All fields present: {data}")
        
        # Verify saved_leads is 0 for new user
        if data["saved_leads"] != 0:
            log_test("Stats saved_leads for new user", False, f"Expected 0, got {data['saved_leads']}")
            return False
        
        log_test("Stats saved_leads for new user", True, "Correctly shows 0")
        
        return True
        
    except Exception as e:
        log_test("Stats test", False, f"Exception: {str(e)}")
        return False

def test_leads_list_and_filters():
    """Test 7: Leads list with various filters"""
    print("\n" + "="*80)
    print("TEST 7: Leads List and Filters")
    print("="*80)
    
    session = TestSession("leads_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Leads Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Leads test - setup", False, "Signup failed")
            return False
        
        # Get all leads
        resp = session.get("leads")
        
        if resp.status_code != 200:
            log_test("GET /leads", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        
        if not isinstance(data, list):
            log_test("GET /leads", False, f"Expected array, got {type(data)}")
            return False
        
        log_test("GET /leads", True, f"Returned {len(data)} leads")
        
        if len(data) == 0:
            log_test("Demo leads present", False, "Expected 6 demo leads, got 0")
            return False
        
        # Test filters
        filters = [
            ("trade=roofing", "trade filter"),
            ("project_type=Industrial", "project_type filter"),
            ("location=Sample", "location filter"),
            ("q=Warehouse", "search query filter"),
            ("min_value=500000", "min_value filter"),
        ]
        
        for filter_param, filter_name in filters:
            resp = session.get(f"leads?{filter_param}")
            if resp.status_code != 200:
                log_test(f"GET /leads?{filter_param}", False, f"Status {resp.status_code}")
                return False
            
            filter_data = resp.json()
            log_test(f"GET /leads?{filter_param}", True, f"Returned {len(filter_data)} results")
        
        return True
        
    except Exception as e:
        log_test("Leads list test", False, f"Exception: {str(e)}")
        return False

def test_lead_detail():
    """Test 8: Lead detail with evidence, source, saved"""
    print("\n" + "="*80)
    print("TEST 8: Lead Detail")
    print("="*80)
    
    session = TestSession("lead_detail_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Lead Detail Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Lead detail test - setup", False, "Signup failed")
            return False
        
        # Get leads to find an ID
        resp = session.get("leads")
        leads = resp.json()
        
        if len(leads) == 0:
            log_test("Lead detail test - get lead ID", False, "No leads available")
            return False
        
        lead_id = leads[0]["id"]
        
        # Get lead detail
        resp = session.get(f"leads/{lead_id}")
        
        if resp.status_code != 200:
            log_test(f"GET /leads/{lead_id}", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        data = resp.json()
        
        # Check required fields
        if "evidence" not in data:
            log_test("Lead detail - evidence field", False, "Missing evidence array")
            return False
        
        if not isinstance(data["evidence"], list):
            log_test("Lead detail - evidence field", False, f"Expected array, got {type(data['evidence'])}")
            return False
        
        log_test("Lead detail - evidence field", True, f"Evidence array present with {len(data['evidence'])} items")
        
        if "source" not in data:
            log_test("Lead detail - source field", False, "Missing source object")
            return False
        
        log_test("Lead detail - source field", True, "Source object present")
        
        if "saved" not in data:
            log_test("Lead detail - saved field", False, "Missing saved field")
            return False
        
        if data["saved"] is not None:
            log_test("Lead detail - saved field", False, f"Expected null for unsaved lead, got {data['saved']}")
            return False
        
        log_test("Lead detail - saved field", True, "Correctly shows null for unsaved lead")
        
        return True
        
    except Exception as e:
        log_test("Lead detail test", False, f"Exception: {str(e)}")
        return False

def test_saved_leads_crud():
    """Test 9: Saved leads CRUD operations"""
    print("\n" + "="*80)
    print("TEST 9: Saved Leads CRUD")
    print("="*80)
    
    session = TestSession("saved_leads_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Saved Leads Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Saved leads test - setup", False, "Signup failed")
            return False
        
        # Get a lead ID
        resp = session.get("leads")
        leads = resp.json()
        
        if len(leads) == 0:
            log_test("Saved leads test - get lead ID", False, "No leads available")
            return False
        
        lead_id = leads[0]["id"]
        
        # Save the lead
        resp = session.post("saved-leads", {
            "lead_id": lead_id
        })
        
        if resp.status_code != 201:
            log_test("POST /saved-leads", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        saved_data = resp.json()
        saved_id = saved_data["id"]
        
        if "lead" not in saved_data:
            log_test("POST /saved-leads - joined lead", False, "Missing joined lead object")
            return False
        
        log_test("POST /saved-leads", True, f"Lead saved with ID {saved_id}")
        
        # Try to save the same lead again - should get 409
        resp = session.post("saved-leads", {
            "lead_id": lead_id
        })
        
        if resp.status_code != 409:
            log_test("POST /saved-leads duplicate", False, f"Expected 409, got {resp.status_code}")
            return False
        
        log_test("POST /saved-leads duplicate", True, "Got 409 as expected")
        
        # Get saved leads list
        resp = session.get("saved-leads")
        
        if resp.status_code != 200:
            log_test("GET /saved-leads", False, f"Status {resp.status_code}")
            return False
        
        saved_list = resp.json()
        
        if not isinstance(saved_list, list):
            log_test("GET /saved-leads", False, f"Expected array, got {type(saved_list)}")
            return False
        
        if len(saved_list) == 0:
            log_test("GET /saved-leads", False, "Expected at least 1 saved lead")
            return False
        
        found = False
        for item in saved_list:
            if item["id"] == saved_id:
                found = True
                break
        
        if not found:
            log_test("GET /saved-leads - includes saved lead", False, f"Saved lead {saved_id} not in list")
            return False
        
        log_test("GET /saved-leads", True, f"Includes saved lead")
        
        # Update saved lead
        resp = session.patch(f"saved-leads/{saved_id}", {
            "status": "Interested",
            "notes": "This looks promising"
        })
        
        if resp.status_code != 200:
            log_test("PATCH /saved-leads/:id", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        updated_data = resp.json()
        
        if updated_data.get("status") != "Interested":
            log_test("PATCH /saved-leads/:id - status", False, f"Expected 'Interested', got '{updated_data.get('status')}'")
            return False
        
        if updated_data.get("notes") != "This looks promising":
            log_test("PATCH /saved-leads/:id - notes", False, f"Expected 'This looks promising', got '{updated_data.get('notes')}'")
            return False
        
        log_test("PATCH /saved-leads/:id", True, "Status and notes updated")
        
        # Delete saved lead
        resp = session.delete(f"saved-leads/{saved_id}")
        
        if resp.status_code != 200:
            log_test("DELETE /saved-leads/:id", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        log_test("DELETE /saved-leads/:id", True)
        
        # Verify it's deleted
        resp = session.get("saved-leads")
        saved_list = resp.json()
        
        found = False
        for item in saved_list:
            if item["id"] == saved_id:
                found = True
                break
        
        if found:
            log_test("DELETE verification", False, f"Saved lead {saved_id} still in list")
            return False
        
        log_test("DELETE verification", True, "Saved lead removed from list")
        
        return True
        
    except Exception as e:
        log_test("Saved leads CRUD test", False, f"Exception: {str(e)}")
        return False

def test_search_history_crud():
    """Test 10: Search history CRUD operations"""
    print("\n" + "="*80)
    print("TEST 10: Search History CRUD")
    print("="*80)
    
    session = TestSession("search_history_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Search History Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Search history test - setup", False, "Signup failed")
            return False
        
        # Create search history entry
        resp = session.post("search-history", {
            "query_text": "roofing projects",
            "filters": {
                "trade": "roofing",
                "location": "Sydney"
            },
            "result_count": 5
        })
        
        if resp.status_code != 201:
            log_test("POST /search-history", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        search_data = resp.json()
        search_id = search_data["id"]
        
        log_test("POST /search-history", True, f"Search history created with ID {search_id}")
        
        # Get search history list
        resp = session.get("search-history")
        
        if resp.status_code != 200:
            log_test("GET /search-history", False, f"Status {resp.status_code}")
            return False
        
        history_list = resp.json()
        
        if not isinstance(history_list, list):
            log_test("GET /search-history", False, f"Expected array, got {type(history_list)}")
            return False
        
        found = False
        for item in history_list:
            if item["id"] == search_id:
                found = True
                break
        
        if not found:
            log_test("GET /search-history - includes entry", False, f"Search history {search_id} not in list")
            return False
        
        log_test("GET /search-history", True, "Includes search history entry")
        
        # Delete search history entry
        resp = session.delete(f"search-history/{search_id}")
        
        if resp.status_code != 200:
            log_test("DELETE /search-history/:id", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        log_test("DELETE /search-history/:id", True)
        
        # Verify it's deleted
        resp = session.get("search-history")
        history_list = resp.json()
        
        found = False
        for item in history_list:
            if item["id"] == search_id:
                found = True
                break
        
        if found:
            log_test("DELETE verification", False, f"Search history {search_id} still in list")
            return False
        
        log_test("DELETE verification", True, "Search history removed from list")
        
        return True
        
    except Exception as e:
        log_test("Search history CRUD test", False, f"Exception: {str(e)}")
        return False

def test_profile_get_update():
    """Test 11: Profile get and update"""
    print("\n" + "="*80)
    print("TEST 11: Profile Get/Update")
    print("="*80)
    
    session = TestSession("profile_test")
    email = random_email()
    
    try:
        # Signup
        resp = session.post("auth/signup", {
            "email": email,
            "password": "Passw0rd123",
            "fullName": "Profile Test",
            "companyName": "Test Co"
        })
        
        if resp.status_code != 200:
            log_test("Profile test - setup", False, "Signup failed")
            return False
        
        # Get profile
        resp = session.get("profile")
        
        if resp.status_code != 200:
            log_test("GET /profile", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        profile = resp.json()
        
        log_test("GET /profile", True, f"Profile retrieved")
        
        # Update profile
        resp = session.put("profile", {
            "full_name": "Updated Name",
            "company_name": "Updated Company",
            "region": "NSW",
            "trade_focus": ["roofing", "hvac"]
        })
        
        if resp.status_code != 200:
            log_test("PUT /profile", False, f"Status {resp.status_code}: {resp.text}")
            return False
        
        updated_profile = resp.json()
        
        if updated_profile.get("full_name") != "Updated Name":
            log_test("PUT /profile - full_name", False, f"Expected 'Updated Name', got '{updated_profile.get('full_name')}'")
            return False
        
        if updated_profile.get("company_name") != "Updated Company":
            log_test("PUT /profile - company_name", False, f"Expected 'Updated Company', got '{updated_profile.get('company_name')}'")
            return False
        
        if updated_profile.get("region") != "NSW":
            log_test("PUT /profile - region", False, f"Expected 'NSW', got '{updated_profile.get('region')}'")
            return False
        
        if updated_profile.get("trade_focus") != ["roofing", "hvac"]:
            log_test("PUT /profile - trade_focus", False, f"Expected ['roofing', 'hvac'], got {updated_profile.get('trade_focus')}")
            return False
        
        log_test("PUT /profile", True, "All fields updated correctly")
        
        # Verify changes persist
        resp = session.get("profile")
        profile = resp.json()
        
        if profile.get("full_name") != "Updated Name":
            log_test("Profile update persistence", False, "Changes did not persist")
            return False
        
        log_test("Profile update persistence", True, "Changes persisted")
        
        return True
        
    except Exception as e:
        log_test("Profile test", False, f"Exception: {str(e)}")
        return False

def test_rls_isolation():
    """Test 12: CRITICAL - RLS isolation between users"""
    print("\n" + "="*80)
    print("TEST 12: CRITICAL - RLS ISOLATION")
    print("="*80)
    
    # Create two separate users with separate cookie jars
    user_a = TestSession("User A")
    user_b = TestSession("User B")
    
    email_a = random_email()
    email_b = random_email()
    password = "Passw0rd123"
    
    try:
        # Signup user A
        resp = user_a.post("auth/signup", {
            "email": email_a,
            "password": password,
            "fullName": "User A",
            "companyName": "Company A"
        })
        
        if resp.status_code != 200:
            log_test("RLS test - User A signup", False, f"Status {resp.status_code}")
            return False
        
        log_test("RLS test - User A signup", True, f"Email: {email_a}")
        
        # Signup user B
        resp = user_b.post("auth/signup", {
            "email": email_b,
            "password": password,
            "fullName": "User B",
            "companyName": "Company B"
        })
        
        if resp.status_code != 200:
            log_test("RLS test - User B signup", False, f"Status {resp.status_code}")
            return False
        
        log_test("RLS test - User B signup", True, f"Email: {email_b}")
        
        # Get a lead ID
        resp = user_a.get("leads")
        leads = resp.json()
        
        if len(leads) == 0:
            log_test("RLS test - get lead", False, "No leads available")
            return False
        
        lead_id = leads[0]["id"]
        
        # User A saves a lead
        resp = user_a.post("saved-leads", {
            "lead_id": lead_id
        })
        
        if resp.status_code != 201:
            log_test("RLS test - User A save lead", False, f"Status {resp.status_code}")
            return False
        
        user_a_saved_id = resp.json()["id"]
        log_test("RLS test - User A save lead", True, f"Saved lead ID: {user_a_saved_id}")
        
        # User A creates search history
        resp = user_a.post("search-history", {
            "query_text": "User A search",
            "filters": {"trade": "roofing"},
            "result_count": 3
        })
        
        if resp.status_code != 201:
            log_test("RLS test - User A create search history", False, f"Status {resp.status_code}")
            return False
        
        user_a_search_id = resp.json()["id"]
        log_test("RLS test - User A create search history", True, f"Search ID: {user_a_search_id}")
        
        # User B gets saved leads - should NOT see User A's saved lead
        resp = user_b.get("saved-leads")
        
        if resp.status_code != 200:
            log_test("RLS test - User B get saved-leads", False, f"Status {resp.status_code}")
            return False
        
        user_b_saved = resp.json()
        
        for item in user_b_saved:
            if item["id"] == user_a_saved_id:
                log_test("RLS VIOLATION - saved_leads", False, f"User B can see User A's saved lead {user_a_saved_id}")
                return False
        
        log_test("RLS isolation - saved_leads read", True, "User B cannot see User A's saved leads")
        
        # User B gets search history - should NOT see User A's search
        resp = user_b.get("search-history")
        
        if resp.status_code != 200:
            log_test("RLS test - User B get search-history", False, f"Status {resp.status_code}")
            return False
        
        user_b_history = resp.json()
        
        for item in user_b_history:
            if item["id"] == user_a_search_id:
                log_test("RLS VIOLATION - search_history", False, f"User B can see User A's search history {user_a_search_id}")
                return False
        
        log_test("RLS isolation - search_history read", True, "User B cannot see User A's search history")
        
        # User B tries to PATCH User A's saved lead - should fail
        resp = user_b.patch(f"saved-leads/{user_a_saved_id}", {
            "status": "Contacted",
            "notes": "User B trying to modify User A's data"
        })
        
        # Should either return error or not affect the data
        if resp.status_code == 200:
            # If it returns 200, verify User A's data is unchanged
            resp = user_a.get("saved-leads")
            user_a_saved = resp.json()
            
            for item in user_a_saved:
                if item["id"] == user_a_saved_id:
                    if item.get("status") == "Contacted":
                        log_test("RLS VIOLATION - saved_leads update", False, "User B modified User A's saved lead")
                        return False
                    break
        
        log_test("RLS isolation - saved_leads update", True, "User B cannot modify User A's saved lead")
        
        # User B tries to DELETE User A's saved lead - should fail
        resp = user_b.delete(f"saved-leads/{user_a_saved_id}")
        
        # Verify User A's saved lead still exists
        resp = user_a.get("saved-leads")
        user_a_saved = resp.json()
        
        found = False
        for item in user_a_saved:
            if item["id"] == user_a_saved_id:
                found = True
                break
        
        if not found:
            log_test("RLS VIOLATION - saved_leads delete", False, "User B deleted User A's saved lead")
            return False
        
        log_test("RLS isolation - saved_leads delete", True, "User B cannot delete User A's saved lead")
        
        # User B tries to DELETE User A's search history - should fail
        resp = user_b.delete(f"search-history/{user_a_search_id}")
        
        # Verify User A's search history still exists
        resp = user_a.get("search-history")
        user_a_history = resp.json()
        
        found = False
        for item in user_a_history:
            if item["id"] == user_a_search_id:
                found = True
                break
        
        if not found:
            log_test("RLS VIOLATION - search_history delete", False, "User B deleted User A's search history")
            return False
        
        log_test("RLS isolation - search_history delete", True, "User B cannot delete User A's search history")
        
        print("\n" + "="*80)
        print("✅ RLS ISOLATION VERIFIED - All tests passed")
        print("="*80)
        
        return True
        
    except Exception as e:
        log_test("RLS isolation test", False, f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("TradeScout Phase 1 Backend API Test Suite")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print(f"Started at: {datetime.now().isoformat()}")
    
    results = {}
    
    # Run all tests
    results["Auth Signup + Profile Trigger"] = test_auth_signup_and_profile_trigger()
    results["Auth Login/Logout"] = test_auth_login_logout()
    results["Auth Update Password"] = test_auth_update_password()
    results["Auth Reset Request"] = test_auth_reset_request()
    results["Unauthenticated Access"] = test_unauthenticated_access()
    results["Stats Endpoint"] = test_stats_endpoint()
    results["Leads List and Filters"] = test_leads_list_and_filters()
    results["Lead Detail"] = test_lead_detail()
    results["Saved Leads CRUD"] = test_saved_leads_crud()
    results["Search History CRUD"] = test_search_history_crud()
    results["Profile Get/Update"] = test_profile_get_update()
    results["RLS Isolation"] = test_rls_isolation()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
        if result:
            passed += 1
        else:
            failed += 1
    
    print("\n" + "="*80)
    print(f"Total: {passed + failed} tests")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Completed at: {datetime.now().isoformat()}")
    print("="*80)
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
