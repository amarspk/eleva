# Agent implementation sandbox (Slice 6)

Approved `write_implementation_file` actions may create TypeScript drafts here only.

- Not imported by `AgentModule`.
- Excluded from the API `tsc` program.
- Must not contain shell, secrets, or destructive filesystem APIs.
- Production Agent/runtime files stay outside this directory.
- Slice 10 `apply_approved_product_implementation` may copy a verified+analyzed draft only to `packages/receipts/src/promoted-implementation.ts` (not exported by `@zayjar/receipts`).
