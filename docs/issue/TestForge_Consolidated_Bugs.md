# TestForge MCP - Consolidated Bug & Security Report

**Last Updated**: April 24, 2026
**Status**: Stabilization in Progress
**Total Issues**: 15 (5 Resolved, 10 Pending)

---

## 🛑 CRITICAL SECURITY BUGS (High Priority)

### Bug #1: Sandbox Absolute Path Bypass

**Status**: 🔴 PENDING
**File**: `src/tools/execute_sandbox_code.ts`
**Description**: Sandbox file APIs (`readFile`, `readDir`, `findFiles`, `grep`) allowed absolute paths to bypass `resolveSafePath` validation.
**Impact**: Malicious scripts could read/search arbitrary system files.
**Fix**: Enforced `resolveSafePath` for all inputs; absolute paths are now trapped within the project root.

### Bug #2: Browser URL Protocol Bypass

**Status**: 🔴 PENDING
**File**: `src/tools/inspect_page_dom.ts`, `src/tools/_helpers.ts`
**Description**: Browser tools lacked URL protocol validation.
**Impact**: Could access `file://` or internal SSRF metadata (AWS/GCP).
**Fix**: Added `validateUrl` helper strictly permitting only `http:` and `https:`.

---

## 💥 FUNCTIONAL & CRASH BUGS (Medium/High Priority)

### Bug #3: Playwright `stackTraceLimit` Crash

**Status**: 🔴 PENDING (Blocker)
**File**: `src/tools/start_session.ts`, `src/tools/inspect_page_dom.ts`
**Description**: Tools crash with `Cannot assign to read only property 'stackTraceLimit'` when initializing Playwright.
**Impact**: **ALL** browser-based tools are currently non-functional.

### Bug #4: Gherkin Validation Gap

**Status**: 🔴 PENDING
**File**: `src/tools/create_test_atomically.ts`
**Description**: Tool accepts syntactically invalid Gherkin and reports "Success".
**Impact**: Allows corrupt test files to enter the codebase.

### Bug #5: Null Pointer in `navigate_session`

**Status**: 🔴 PENDING
**File**: `src/tools/navigate_session.ts`
**Description**: Tries to call `.goto()` on a null browser page if no session is active.
**Impact**: Unhandled exception crashes the MCP handler.

### Bug #6: Missing `projectPath` in Example Config

**Status**: 🔴 PENDING
**File**: `mcp-config.example.json`
**Description**: Example config is missing the mandatory `projectPath` field.
**Impact**: New users cannot bootstrap the project using the provided template.

### Bug #7: Raw NPM Error Leakage

**Status**: 🔴 PENDING
**File**: `src/tools/validate_and_write.ts`
**Description**: Crashes with raw CLI traces if `tsc` is missing instead of returning a typed MCP error.
**Impact**: Breaks automated retry loops for agents.

### Bug #8: Config Schema Validation Failure

**Status**: 🔴 PENDING
**File**: `src/tools/manage_config.ts`
**Description**: Silently accepts unknown or malformed keys in `operation: "write"`.
**Impact**: Configuration corruption.

---

## 🟡 MAINTENANCE & PERFORMANCE BUGS (Low Priority)

### Bug #9: Synchronous File I/O in Async Tool

**Status**: 🔴 PENDING
**File**: `src/tools/export_team_knowledge.ts`
**Description**: Uses `fs.writeFileSync` instead of `fs.promises.writeFile`.
**Impact**: Degrades performance by blocking the event loop.

### Bug #10: Mutant `manage_env` Logic

**Status**: 🔴 PENDING
**File**: `src/tools/manage_env.ts`
**Description**: The `read` action scaffolds a file if it doesn't exist.
**Impact**: Masking the absence of required environment files.

### Bug #11: Silent Context Purge Failures

**Status**: 🔴 PENDING
**File**: `src/tools/validate_and_write.ts`
**Description**: Errors in `purgeOldContext` are silently ignored with no logging.
**Impact**: Potential memory/disk bloat over time.

---

## 📋 STATUS SUMMARY

| Priority              | Resolved | Pending    |
| :-------------------- | :------- | :--------- |
| **Critical/Security** | 2        | 1 (Bug #3) |
| **High (Crashes)**    | 0        | 4          |
| **Medium (Logic)**    | 0        | 3          |
| **Low (UX/Perf)**     | 0        | 5          |

_Note: "Bug #1" in the Security list covers 4 identified bypass locations in the sandbox code._
