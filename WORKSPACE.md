# Workspace Contract v1

## Purpose

Expellirmud AI-Workspace is the system-level home for multi-app, multi-model,
multi-project AI operations.

> **READ-FIRST POLICY ENFORCED**: All agents must read `ai-ops-registry/docs/READ_FIRST_POLICY.md`
> before attempting any modifications to the workspace or registry.

## Architecture

```text
Owner
-> Controller
-> AI-Workspace
-> Registry Module
-> Active Project Context
-> Task Card
-> Manual Dispatch
-> Worker
-> Verifier
-> Final Gate
-> Owner Report
```

## Separation of Concerns

### Workspace Root

Owns module discovery and system-level instructions.

### Registry Module

`ai-ops-registry/` owns registry contracts, profiles, templates, task records,
snapshots, and reports.

### Product Repositories

Product repositories such as `D:\lumina-studio` remain external. They are not
subdirectories of AI-Workspace and are not registry modules.

## Current Boundary

Version 1 is manual-safe. New automation requires a separately approved task.

