# Integration Test Notes and Issues

## Environment issues
- Node.js is not available in the current environment, so the integration script could not be executed here.
- `npm` is also unavailable, so dependency installation and frontend/backend runtime verification are not possible in this workspace.

## Functional issues discovered during test planning
- Admin and coach login flows currently require multi-factor authentication, but no public MFA setup or confirmation endpoints are exposed in the backend API.
  - This prevents integration testing of admin-protected endpoints such as `/audit/logs` using the current public route set.
- Audit logging retrieval can only be validated for access control with non-admin users in the current state.

## Test runner
- The integration test script is `tests/integration.test.js`.
- The test runner command is available as `npm run test:integration` once Node.js is installed.
- The script uses `TEST_BASE_URL` environment variable or defaults to `http://127.0.0.1:4000`.

## Recommended next steps
- Install Node.js and dependencies in the project environment.
- Add MFA setup and confirmation routes to the backend so admin workflow/integration tests can verify audit log retrieval.
- Implement persistent storage and real backend startup before running the integration script.
