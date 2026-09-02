#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "TradeScout Phase 1 - verified construction opportunity discovery foundation. Supabase auth (signup/login/logout/password reset/profile), RLS-protected data, dashboard stats, leads (browse/filter/detail), saved leads (CRUD + status + notes), search history, sources registry. No fake data/sources; unknown facts shown as unavailable; live discovery not connected."

backend:
  - task: "Auth - signup (admin auto-confirm) + profile trigger + cookie session"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Signup uses admin.createUser email_confirm:true then signInWithPassword to set cookies. profiles row auto-created by DB trigger. Verified via curl: profile has full_name/company_name."
        - working: true
          agent: "testing"
          comment: "Comprehensive test passed. Signup creates user with auto-confirm, sets cookies via signInWithPassword. GET /auth/me returns authenticated:true with profile containing correct full_name and company_name from signup. Profile trigger working correctly."
  - task: "Auth - login / logout / me / update-password / reset-request"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Uses supabase.auth.getUser() (getClaims not in installed ssr 0.5.1). Needs full flow test incl. logout invalidation and wrong-password 401."
        - working: true
          agent: "testing"
          comment: "All auth flows tested and working: (1) Login with correct password returns 200 with cookies, wrong password returns 401. (2) Logout invalidates session - /auth/me shows authenticated:false and protected endpoints return 401. (3) Update-password works - old password fails, new password succeeds. (4) Reset-request always returns 200 for both existing and non-existent emails (doesn't reveal existence)."
  - task: "RLS isolation - saved_leads/search_history/profile per-user; leads/sources readable by authenticated only"
    implemented: true
    working: true
    file: "db/schema.sql, app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Verify unauthenticated gets 401; two users cannot see each other's saved_leads/search_history."
        - working: true
          agent: "testing"
          comment: "CRITICAL RLS isolation verified. Created User A and User B with separate cookie jars. User A saved a lead and created search history. User B: (1) Cannot see User A's saved_leads in GET list. (2) Cannot see User A's search_history in GET list. (3) Cannot PATCH User A's saved_leads (User A's data unchanged). (4) Cannot DELETE User A's saved_leads or search_history (User A's data intact). All unauthenticated requests to protected endpoints return 401. RLS working perfectly."
  - task: "Stats endpoint (real DB counts, not simulated)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Returns available_leads/saved_leads/high_opportunity/new_this_week from counts. curl showed 6/0/2/6."
        - working: true
          agent: "testing"
          comment: "Stats endpoint verified. Returns all required numeric fields: available_leads:6, saved_leads:0, high_opportunity:2, new_this_week:6. Correctly shows saved_leads:0 for new user (per-user count working)."
  - task: "Leads list with filters + lead detail with evidence/source/saved"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "GET /leads supports trade/project_type/location/q/min_value/date range. GET /leads/:id returns evidence[], source, saved. 6 demo leads present."
        - working: true
          agent: "testing"
          comment: "Leads endpoints verified. GET /leads returns 6 demo leads. All filters tested and working: trade=roofing (1 result), project_type=Industrial (1), location=Sample (6), q=Warehouse (1), min_value=500000 (4). GET /leads/:id returns complete lead with evidence[] array (1 item), source object, and saved field (null for unsaved lead)."
  - task: "Saved leads CRUD (save, list, patch status/notes, delete)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST saved-leads, GET saved-leads (join lead), PATCH saved-leads/:id, DELETE saved-leads/:id. Duplicate save should 409."
        - working: true
          agent: "testing"
          comment: "Saved leads CRUD fully tested. POST /saved-leads returns 201 with joined lead object. Duplicate save returns 409 as expected. GET /saved-leads includes saved lead. PATCH /saved-leads/:id updates status and notes correctly. DELETE /saved-leads/:id removes lead, verified by GET showing it's gone."
  - task: "Search history create/list/delete"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST search-history saves params+filters; GET lists; DELETE removes. Used by Discover 'Find Opportunities'."
        - working: true
          agent: "testing"
          comment: "Search history CRUD verified. POST /search-history returns 201 with query_text, filters, result_count. GET /search-history includes created entry. DELETE /search-history/:id removes entry, verified by GET showing it's gone."
  - task: "Profile get/update"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /profile, PUT /profile (full_name, company_name, region, trade_focus)."
        - working: true
          agent: "testing"
          comment: "Profile endpoints verified. GET /profile returns user profile. PUT /profile updates all fields correctly: full_name, company_name, region, trade_focus (array). Changes persist across subsequent GET requests."

frontend:
  - task: "Full SPA (auth screen, dashboard, discover, saved, history, sources, settings, lead detail)"
    implemented: true
    working: "NA"
    file: "app/page.js, components/tradescout/*"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Built but not yet tested by testing agent. Awaiting user permission for frontend testing."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "Phase 1 backend ready. Supabase (project jxgzulgqnbfmwtyzlwtf, us-east-1) with 7 tables + RLS + signup trigger applied via psql. Auth uses cookie sessions; endpoints under /api. Please test all backend endpoints via the external URL. Auth notes: signup auto-confirms via admin so login works immediately; create fresh users with random emails. Focus: full auth lifecycle, RLS per-user isolation (create user A and B, ensure B cannot read/modify A's saved_leads/search_history and unauth requests get 401), saved-leads CRUD incl duplicate 409, search-history CRUD, profile update, leads filters + lead detail evidence. Demo data: 6 leads (is_demo) + 1 demo source exist; none are verification_status='verified'."
    - agent: "testing"
      message: "Backend testing complete - ALL 12 TESTS PASSED ✅. Comprehensive test suite executed covering: (1) Auth signup with profile trigger - working perfectly. (2) Auth login/logout/update-password/reset-request - all flows verified. (3) CRITICAL RLS isolation - User A and User B tested, complete isolation confirmed (read/write/delete). (4) Stats endpoint - all numeric fields correct, per-user counts working. (5) Leads list with all filters (trade, project_type, location, q, min_value) - 6 demo leads returned. (6) Lead detail with evidence array, source object, saved field - all present. (7) Saved leads CRUD - create (201), duplicate (409), list, update status/notes, delete all working. (8) Search history CRUD - create, list, delete all working. (9) Profile get/update with all fields - working and persisting. (10) Unauthenticated access - all protected endpoints return 401. Cookie-based sessions working correctly across all requests. No issues found. Backend is production-ready."
