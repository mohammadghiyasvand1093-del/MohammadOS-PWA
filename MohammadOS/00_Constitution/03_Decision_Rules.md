# 03_Decision_Rules.md
**MohammadOS — Personal Operating System**
**Module:** Decision Engine
**Version:** 1.1
**Status:** Stable
**Classification:** Core System Document
**Review Cycle:** Annual or on major life-phase transition

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Decision Hierarchy](#2-decision-hierarchy)
3. [Mission Check](#3-mission-check)
4. [Principles Check](#4-principles-check)
5. [Long-term Impact Assessment](#5-long-term-impact-assessment)
6. [Opportunity Cost](#6-opportunity-cost)
7. [Risk Assessment](#7-risk-assessment)
8. [Reversible vs. Irreversible Decisions](#8-reversible-vs-irreversible-decisions)
9. [Time Horizon](#9-time-horizon)
10. [Financial Decisions](#10-financial-decisions)
11. [Career Decisions](#11-career-decisions)
12. [Learning Decisions](#12-learning-decisions)
13. [AI Consultation Rules](#13-ai-consultation-rules)
14. [Decision Checklist](#14-decision-checklist)
15. [Summary](#15-summary)

---

## 1. Purpose

This document defines the decision-making protocol for MohammadOS. Every non-trivial decision — career, financial, learning, personal — is routed through this engine before execution.

The objective is not to optimize every decision. The objective is to eliminate arbitrary, reactive, and emotionally-driven decisions that silently degrade long-term system integrity.

**This document is a permanent protocol, not a guideline.**
It does not change based on mood, social pressure, urgency, or circumstance.
It is the operating standard. It is always running.

---

## 2. Decision Hierarchy

All decisions in MohammadOS are classified into three tiers before processing begins.

### Tier 1 — Strategic (High-Cost)
Decisions that alter the system's trajectory. Irreversible or difficult to reverse. Require full Decision Engine processing.

> *Examples: Changing career path. Dropping university. Taking on significant debt. Accepting a full-time role. Committing to migration target.*

### Tier 2 — Tactical (Medium-Cost)
Decisions within an established strategy. Semi-reversible. Require abbreviated engine processing.

> *Examples: Choosing a tool or library. Enrolling in a course. Selecting a freelance project. Adjusting a schedule.*

### Tier 3 — Operational (Low-Cost)
Decisions within a defined daily or weekly system. Fully reversible. Processed via default rules without engine involvement.

> *Examples: Task order in a day. Which exercise to complete. What to eat.*

**Architectural Rule:**
```
NEVER process a Tier 1 decision with Tier 3 speed.
NEVER escalate a Tier 3 decision into Tier 1 deliberation.
Misclassification in either direction is a system fault.
```

---

## 3. Mission Check

The Mission Check is the first gate. All Tier 1 and Tier 2 decisions must pass it before proceeding.

### System Mission

> Build deep technical expertise along the Backend → DevOps → DevSecOps path.
> Achieve financial independence through that expertise.
> Migrate to a high-opportunity, high-stability environment.
> Build a life controlled by design, not by default.

### Mission Check Protocol

```
IF   decision.aligns_with_mission    → PASS → proceed to Principles Check
IF   decision.neutral_to_mission     → CONDITIONAL → proceed with explicit justification
IF   decision.contradicts_mission    → REJECT → no exceptions, no overrides
```

A decision that *feels* right but fails the Mission Check is a system error, not an opportunity.
Emotion is not an override flag for this gate.

---

## 4. Principles Check

MohammadOS operates on a fixed set of core principles. These are system constants, not preferences.

| ID | Principle |
|---|---|
| P-01 | **Depth over breadth.** Master the current domain before expanding to the next. |
| P-02 | **Execution over planning.** A decision that enables action is superior to one that requires more planning before it can enable action. |
| P-03 | **Financial discipline.** No avoidable debt without a defined income stream to service it. |
| P-04 | **Gate System integrity.** No new learning track opens before the current Gate is passed. |
| P-05 | **Reversibility preference.** When two options have equal value, choose the more reversible one. |
| P-06 | **Output over consumption.** Decisions that increase output — code, income, credentials, deliverables — take priority over decisions that increase consumption. |

### Principles Check Protocol

```
FOR each principle P in [P-01 ... P-06]:
    IF decision.violates(P) → FLAG violation, log reason

IF   violations.count == 0  → PASS
IF   violations.count >= 1  → REQUIRE written justification before proceeding
IF   violations.count >= 3  → BLOCK → return to design phase
```

Passing the Principles Check with violations requires a written record — not a mental note. If a justification cannot be written clearly in two sentences, the decision is not ready to be made.

---

## 5. Long-term Impact Assessment

Every Tier 1 decision must be evaluated across multiple time horizons before commitment.

### Time Horizons for Impact Assessment

| Horizon | Scope | Key Question |
|---|---|---|
| H1 | 6 months | What direct, measurable outcome does this produce? |
| H3 | 2 years | How does this affect career positioning and income ceiling? |
| H5 | 5 years | How does this affect lifestyle, migration readiness, and optionality? |

### Assessment Protocol

```
1. State the decision in one sentence.
2. For each horizon H1, H3, H5:
   a. Best-case outcome
   b. Base-case outcome
   c. Worst-case outcome

IF worst-case at H3 is catastrophic AND non-recoverable → REJECT or redesign.
IF all outcomes at H1 are within acceptable range     → provisional proceed.
IF base-case at H5 does not advance the mission       → reconsider.
```

No assessment is required for Tier 3 decisions. For Tier 2, H1 is sufficient.

---

## 6. Opportunity Cost

Every decision eliminates alternatives. The cost of a decision is not its price — it is the value of the best alternative surrendered.

### Opportunity Cost Protocol

```
1. Identify the next-best alternative to this decision.
2. Estimate the value of that alternative.
3. Compare:

   IF value(alternative) > value(decision) → reconsider
   IF value(alternative) ≤ value(decision) → proceed
```

**This cost is always real. Refusing to calculate it is a system fault.**

### Common Opportunity Cost Traps in MohammadOS

- Starting a new course while an active Gate is open: cost is delayed Gate pass, delayed income, degraded focus depth.
- Accepting a job that covers the current salary without advancing the career phase: cost is 12–24 months of positioning time.
- Spending deep-focus hours on low-leverage tasks: cost is the compounding value of that time applied to the critical path.

---

## 7. Risk Assessment

**Risk is not the probability of failure. Risk is the product of probability and non-recoverable cost.**

```
Risk = P(failure) × NonRecoverableCost(failure)
```

### Risk Level Matrix

| Level | Condition | Required Action |
|---|---|---|
| LOW | Recoverable failure AND low probability | Proceed without additional process |
| MEDIUM | Recoverable failure OR low probability (not both) | Proceed with defined rollback plan |
| HIGH | Non-recoverable failure AND medium+ probability | Explicit written override required before proceeding |
| CRITICAL | Non-recoverable failure AND high probability | BLOCK. Do not proceed under any framing. |

### Rollback Plan Requirement

For MEDIUM or HIGH risk decisions, define a rollback plan before executing:

```
rollback_plan = {
    trigger_condition:  "What signals that this decision is failing?",
    rollback_steps:     "What actions restore the system to prior state?",
    max_time_before_rollback: "What is the deadline for triggering rollback?",
    acceptable_loss:    "What is the maximum acceptable cost of this attempt?"
}
```

A decision without a rollback plan is not a MEDIUM-risk decision. It is a HIGH-risk decision with a MEDIUM-risk label.

---

## 8. Reversible vs. Irreversible Decisions

### Classification

**Type-R (Reversible)**
Can be undone at low cost and low time. Reversal is available if the outcome is wrong.

**Type-I (Irreversible)**
Cannot be undone, or reversal carries significant cost in time, money, reputation, or opportunity. The path backward is more expensive than the path forward.

### Processing Protocol

```
IF decision.type == Type-R:
    → Decide fast.
    → Bias toward action.
    → Learn from the outcome and adjust.

IF decision.type == Type-I:
    → Slow down deliberately.
    → Run the full Decision Engine.
    → Require a written record of rationale.
    → Default to inaction if uncertainty remains high after processing.
```

### Architectural Warning

Most people apply Type-R processing speed to Type-I decisions. This is one of the most common and most expensive system faults. MohammadOS treats them with different protocols by design.

**Type-I decisions in this system include:**
Leaving university. Taking on significant debt. Burning a professional relationship. Committing to a migration country. Accepting a full-time role that closes freelance or study flexibility. Making a large irreversible financial purchase.

---

## 9. Time Horizon

Every decision operates within a time horizon. Chronic decision errors are almost always the result of applying the wrong horizon to a decision.

### MohammadOS Time Horizons

| Label | Horizon | Scope |
|---|---|---|
| H0 | Daily | 24 hours |
| H1 | Sprint | 1–4 weeks |
| H2 | Quarter | 3 months |
| H3 | Year | 12 months |
| H4 | Career Phase | 3–5 years |
| H5 | Migration / Life Architecture | 5–10 years |

### Time Horizon Protocol

```
1. Before processing a decision, declare its time horizon explicitly.
2. Do not apply H0 reasoning to evaluate an H4 decision.
3. Do not sacrifice H4 outcomes for H0 comfort.
4. When horizons conflict, the longer horizon takes priority.
```

**Chronic error pattern:** Using H0 reasoning ("this feels uncomfortable right now") to reject a decision that operates at H3 or H4 ("this builds the career phase I need"). This is a scheduling conflict in the operating system. The longer horizon is architecturally senior.

---

## 10. Financial Decisions

Financial decisions are resource allocation on the system's critical path. Resources are finite. Allocation errors compound.

### Financial Rules

| ID | Rule |
|---|---|
| F-01 | No discretionary purchase above the defined threshold without a written justification that maps the expense to a system goal. |
| F-02 | Decisions that increase income potential are higher priority than decisions that increase comfort. |
| F-03 | The Emergency Fund is a system buffer, not deployable capital. It is excluded from all decision calculations as an available resource. |
| F-04 | Every debt decision must specify: principal amount, monthly cost, payoff timeline, and the income stream that services it. |
| F-05 | Before purchasing a tool, course, or service: verify whether an existing investment already covers ≥80% of the need. |
| F-06 | Never sacrifice long-term investments — courses, certifications, career tools — for short-term consumption. When budget is constrained, long-term investment takes priority over comfort spending. |

### Financial Decision Flow

```
1. Label the expense: Need vs. Want.
2. Map it to a system goal: Y / N.
3. Can it be deferred 30 days without consequence? → IF YES, defer it.
4. Is there a lower-cost alternative achieving ≥80% of the outcome? → Use it.
5. Does it eliminate a bottleneck on the current critical path? → Classify as investment.
6. Does it fail steps 2–5 entirely? → Reject.
```

---

## 11. Career Decisions

Career decisions are the highest-leverage decisions in MohammadOS. Errors at this layer do not stay local — they propagate across income, learning, migration timeline, and optionality.

### Career Decision Hierarchy

```
Priority 1: Does it advance the current career phase?
            (Backend → DevOps → DevSecOps — in sequence)
Priority 2: Does it produce verifiable, external output?
            (Deployed code, income, credentials, portfolio items)
Priority 3: Does it contribute to the migration target profile?
            (Canada Express Entry / Germany Blue Card)
```

### Career Rules

| ID | Rule |
|---|---|
| C-01 | Never accept a role or project that pulls you off the defined career path for more than 3 months without a defined exit and a documentable resume benefit. |
| C-02 | Side income is permitted if it does not consume more than 20% of total weekly productive capacity. |
| C-03 | A job offer that does not improve on the current learning trajectory or income level is not an opportunity — it is a lateral move with switching costs. |
| C-04 | University is a system constraint, not a career strategy. Manage it to completion with minimum resource expenditure. Do not let it consume deep-focus hours that belong to the career path. |
| C-05 | Every career decision must answer: "How does this appear on a German Blue Card or Canadian Express Entry profile in 3 years?" If the answer is neutral or negative, it requires explicit justification to proceed. |
| C-06 | Every engineering skill must eventually produce one of: Income, Portfolio item, Open Source Contribution, or Professional Experience. Learning that produces none of these within a reasonable horizon is incomplete and must be deprioritized. |

---

## 12. Learning Decisions

MohammadOS runs a Gate System for all learning tracks. This section defines its logic and constraints.

### Gate System

```
ACTIVE_GATES = [defined inside Roadmap and Dashboard modules]

WHILE any active_gate.status != PASSED:
    → New learning tracks: BLOCKED
    → New course enrollment: BLOCKED
    → New tool adoption outside active tracks: BLOCKED
    → Exception: tools directly required to complete an active Gate task → PERMITTED
```

### Learning Rules

| ID | Rule |
|---|---|
| L-01 | Learning that cannot be applied within 2 weeks is low-priority unless it is on the active Gate path. |
| L-02 | Consuming content — videos, articles, podcasts — is not learning. Application is learning. Time spent on consumption is logged as consumption, not as study time. |
| L-03 | RECALL is the default study protocol: Watch → Close → Recall → Code from scratch → Test in terminal. Deviation requires a documented reason. |
| L-04 | Before enrolling in any new course or resource, write: (a) the specific skill gap it closes, and (b) why no existing material covers it. If this cannot be written, enrollment is rejected. |
| L-05 | Tutorial completion is not a milestone. Project completion is a milestone. |
| L-06 | Pre-designated skippable sections are settled decisions. They are not re-evaluated. Processing bandwidth is not spent on them again. |
| L-07 | One Gate at a Time. No parallel major learning tracks unless explicitly approved by the Roadmap module. Concurrent Gates split focus, extend all timelines, and violate P-01. |

---

## 13. AI Consultation Rules

AI systems — including this one — are decision support tools. They are not decision authorities.

### Authority Hierarchy

Human Judgment has final authority in all decisions within MohammadOS.

```
Mission  >  Constitution  >  Human Judgment  >  AI Recommendations
```

AI output operates only at the lowest tier of this hierarchy.
No AI recommendation overrides human judgment, system principles, or the mission.
When AI output conflicts with any higher tier, the higher tier wins unconditionally.

### When AI Consultation Is Appropriate

- Structuring and articulating a decision already in progress
- Identifying blind spots and second-order effects not yet considered
- Drafting plans, documents, code, and communication
- Technical problem-solving within a defined scope
- Pressure-testing a decision by requesting counter-arguments

### When AI Consultation Is Not Appropriate

- As a substitute for executing and learning from real work
- To validate a decision already emotionally committed to (confirmation bias amplification)
- For decisions that require real-world data that only you hold
- As an emotional regulator or a source of motivation to substitute for self-regulation
- As a planning tool when you have been planning and not executing

### AI Consultation Protocol

```
1. State the decision in one sentence.
2. State what you already know and what specific gap you need filled.
3. State what you will do with the output.
4. Receive input. Extract what is useful. Discard what is not.
5. Make the decision yourself. Log it. Close the consultation.
```

### Hard Rules

```
IF you are consulting AI more than twice on the same decision:
    → You are in Planning Hell, not in a decision process.
    → Exit immediately. Make the call. Log it.

IF AI output contradicts a clear system principle:
    → The principle takes precedence.
    → AI outputs are inputs, not instructions.

IF you feel reluctant to make the decision after AI input:
    → The issue is execution resistance, not information deficit.
    → Do not request more information. Execute or explicitly log the deferral with a hard deadline.
```

---

## 14. Decision Checklist

Run this checklist for all Tier 1 and Tier 2 decisions before execution. It is not optional.

```
DECISION RECORD
───────────────────────────────────────────────────────────────
Date:
Decision Statement (one sentence):

CLASSIFICATION
[ ] Tier:    Tier 1 / Tier 2 / Tier 3
[ ] Type:    Type-R (Reversible) / Type-I (Irreversible)
[ ] Horizon: H0 / H1 / H2 / H3 / H4 / H5

GATE CHECKS
[ ] Mission Check:        PASS / REJECT
[ ] Principles Check:     PASS / FLAG (violations listed below)
      Violations:
      Justification:

ANALYSIS
[ ] Long-term Impact:     Documented for H1, H3, H5 (Tier 1 only)
[ ] Opportunity Cost:     Best alternative identified and accepted
[ ] Risk Level:           LOW / MEDIUM / HIGH / CRITICAL
[ ] Rollback Plan:        Defined (required for MEDIUM and HIGH)
      Trigger:
      Steps:
      Deadline:

DOMAIN RULES APPLIED
[ ] Financial rules (F-01 to F-06): N/A / Applied
[ ] Career rules   (C-01 to C-06): N/A / Applied
[ ] Learning rules (L-01 to L-07): N/A / Applied

FINAL GATE
[ ] All checks above completed or explicitly waived with documented reason.
[ ] Decision is ready to execute.

DECISION:  PROCEED / DEFER / REJECT
Rationale (two sentences maximum):
───────────────────────────────────────────────────────────────
```

A decision that cannot pass this checklist is not ready to be made. Forcing it through is an override, not a decision.

---

## 15. Summary

This document is the decision kernel of MohammadOS. It is not a reference to consult occasionally. It is the standard operating procedure for every non-trivial decision.

### Core Axioms

```
[1]  Most decisions are not urgent.
     The feeling of urgency is a system error, not a signal to act faster.

[2]  A fast decision on a Type-I problem is almost always
     worse than a slow one. Speed is a virtue for Type-R decisions only.

[3]  Planning Hell is not decision-making.
     It is the avoidance of decision-making with a productive-looking interface.

[4]  The system's time is finite and non-renewable.
     Every YES is a NO to something else. That cost is real.

[5]  Decision quality compounds.
     Consistently good decisions over 5–10 years produce outcomes
     that no single brilliant decision can replicate.

[6]  The longer time horizon is architecturally senior.
     H0 discomfort does not override H4 requirements.
```

### Definition of Progress

```
Knowing    is not progress.
Planning   is not progress.
Watching   courses is not progress.

Progress is measured only by completed outputs.

Valid outputs:
  • Finished projects
  • Passed Gates
  • GitHub commits
  • Certificates earned
  • Income generated
  • Job offers received
  • Professional documentation produced

Everything else is preparation.
Preparation is necessary. It is not progress.
```

### Failure Modes This Document Prevents

| Failure Mode | Prevented By |
|---|---|
| Course-jumping | Gate System + L-04 |
| Analysis Paralysis | Execution Over Planning Principle (P-02) + AI Consultation Limits |
| Emotional purchases | Financial Flow + F-01 |
| Urgency-driven Tier 1 errors | Reversibility Protocol + Tier Classification |
| Planning Hell | AI Rules + Checklist hard stop |
| Mission drift | Mission Check as mandatory first gate |
| Risk blindness | Risk Matrix + Rollback Plan requirement |
| Short-termism | Time Horizon Protocol |

### Decision Resolution Protocol

```
WHEN uncertainty exists:
    → Return to Mission.
    → Re-run Mission Check. The answer is usually there.

WHEN conflict exists between two valid options:
    → Return to Constitution (core principles, P-01 through P-06).
    → The principle that applies resolves the conflict.

WHEN both Mission and Constitution are satisfied:
    → Execute without hesitation.
    → Hesitation beyond this point is not caution.
    → It is resistance. Treat it as such.
```

---

**The decision engine is not bypassed under any circumstances.**
**It is the operating standard.**

---

*MohammadOS · 03_Decision_Rules.md · v1.1*
*Next review: On entry to next career phase or annual audit, whichever comes first.*