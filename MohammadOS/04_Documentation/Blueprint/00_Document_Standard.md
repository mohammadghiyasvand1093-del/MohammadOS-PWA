# Document Standard

**MohammadOS — Documentation Architecture**

**Module:** Blueprint
**Document:** Document Standard
**Version:** 1.0
**Status:** Stable
**Classification:** Architecture Standard

---

# Purpose

This document defines the documentation standard used throughout MohammadOS.

Every Markdown document in the system should follow a consistent structure, naming convention, and level of detail.

Consistency improves readability, maintainability, automation, and AI collaboration.

---

# Design Principles

Every document should be:

* Clear
* Concise
* Structured
* Versioned
* Easy to review
* Easy for both humans and AI to understand

Documentation exists to reduce ambiguity—not to increase it.

---

# Standard Header

Every major document should begin with the following header.

```text
# Document Title

**MohammadOS — Personal Operating System**

**Module:** Module Name
**Version:** x.y
**Status:** Draft / Active / Stable / Archived
**Classification:** Constitution / Blueprint / Core Module / Operational
**Review Cycle:** Daily / Weekly / Monthly / Quarterly / Annual
```

---

# Standard Sections

Whenever applicable, documents should follow this order:

1. Purpose
2. Scope
3. Principles
4. Rules
5. Workflow
6. Examples
7. Related Modules
8. Version

Not every document requires every section, but the order should remain consistent.

---

# Naming Convention

Use:

* PascalCase for folder names.
* Descriptive file names with underscores.

Examples:

```text
01_Project_Vision.md
02_System_Blueprint.md
03_Modules.md
```

Avoid spaces in filenames.

---

# Versioning Rules

Major changes:

```
v1.0 → v2.0
```

Minor improvements:

```
v1.0 → v1.1
```

Bug fixes:

```
v1.1 → v1.1.1
```

Every document should contain its current version.

---

# Writing Style

Documentation should be:

* Direct
* Technical
* Objective
* Action-oriented

Avoid:

* Emotional language
* Long storytelling
* Redundant explanations

Every sentence should contribute useful information.

---

# Markdown Standards

Use:

* `#` for document title
* `##` for primary sections
* `###` for subsections
* Tables for structured information
* Lists for sequential steps
* Code blocks for examples and protocols

Avoid excessive formatting.

---

# AI Compatibility

Documents should be readable by both humans and AI systems.

Therefore:

* Use consistent terminology.
* Define concepts only once.
* Avoid ambiguous wording.
* Keep workflows explicit.
* Prefer structured data over free-form prose.

---

# Document Lifecycle

Each document progresses through four states:

```
Draft
    ↓
Active
    ↓
Stable
    ↓
Archived
```

Only Stable documents should define long-term behavior.

---

# Review Policy

Different documents require different review frequencies.

| Document Type | Review Cycle            |
| ------------- | ----------------------- |
| Constitution  | Annual                  |
| Blueprint     | As architecture evolves |
| Dashboard     | Daily                   |
| Roadmap       | Monthly                 |
| Reviews       | Weekly / Monthly        |
| Finance       | Monthly                 |

---

# Related Modules

This standard applies to every module inside MohammadOS, including:

* Constitution
* Blueprint
* Dashboard
* Roadmap
* Profile
* Finance
* Career
* Health
* Reviews
* AI

---

# Version

Current Version: v1.0

Status: Stable
