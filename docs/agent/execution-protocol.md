# Agent Execution Protocol

## Purpose

This project adapts useful engineering workflow patterns from Superpowers without introducing a second autonomous runtime.

`AGENTS.md` remains authoritative.

## Canonical Workflow

Every substantial implementation task follows:

1. Task Contract
2. Context Selection
3. Relevant ADRs / Contracts
4. Small Implementation Slice
5. Focused Verification
6. Full Repository Verification
7. Review
8. Evidence Report
9. Human-Controlled Finish

## Task Contract

Before implementation, define:

- goal
- scope
- non-goals
- acceptance criteria
- expected files/modules
- applicable project rules
- verification required
- assumptions and risks

Use `docs/agent/task-template.md` for substantial work.

## Context Selection

Select only the context required for the task:

- relevant source files
- specifications
- ADRs
- contracts
- tests
- security/privacy constraints
- relevant specialist skills

Do not treat accumulated chat history as the source of truth when a durable project artifact exists.

## Implementation

Prefer the smallest safe change.

Reuse existing abstractions and dependencies before introducing new ones.

For behavior changes, use focused tests where practical and preserve explicit failure states.

## Verification

Verification should proceed from narrow to broad:

1. focused tests
2. relevant type/build/lint checks
3. repository verification
4. diff inspection
5. unintended-file check

Use these evidence states:

- `VERIFIED`
- `IMPLEMENTED_UNVERIFIED`
- `BLOCKED`

Never claim verification that was not actually run.

## Review

Review the completed slice for:

- correctness
- architecture
- security/privacy
- reliability/failure handling
- simplicity
- scope discipline
- regression risk

## Evidence

Record what changed, what was verified, what remains unverified, and the known risks.

Use `docs/agent/evidence-template.md`.

## Recovery

For multi-step work, maintain durable progress information so an interrupted agent does not blindly repeat completed work.

A recovery record should identify the task, current state, implementation brief, verification evidence, and unresolved concerns.

## Human-Controlled Finish

Agents must not commit, push, open pull requests, merge, deploy, or mutate external production systems unless explicitly authorized.