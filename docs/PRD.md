# Ravotsoy PRD

## Product Summary

Ravotsoy is a hospitality operations system for managing bookings, payments, manager workflows, and owner reporting through a website plus Telegram bots.

## Primary Goals

- Convert website interest into completed bookings without manual copy-paste
- Let the manager run daily operations entirely from Telegram
- Keep resource availability and pricing consistent in one backend source of truth
- Make finance and handover activity visible to the owner
- Recover quickly from hosting inactivity and webhook interruptions

## Users

- Customer: browses offers, starts booking, submits proof, checks or cancels own bookings
- Manager: approves, edits, creates offline bookings, handles operations, finance, diagnostics
- Owner: receives reports, finance notifications, and oversight visibility

## Core Jobs To Be Done

- Customer can browse places and complete a booking in Telegram
- Customer can submit proof and cancel their own booking when needed
- Manager can approve or reject bookings and proofs
- Manager can create offline bookings at any final price
- Manager can change dates, names, phones, and totals
- Manager can view monthly occupancy and day-level bookings
- Manager can record expenses, hand over cash, and view earnings
- Manager can wake connections from Telegram after Render sleep
- Owner can receive daily summaries and finance updates
- Manager control can be transferred safely to another Telegram user

## Success Metrics

- Booking completion rate from website to Telegram
- Approval turnaround time
- Number of missed or duplicate booking notifications
- Daily report delivery success
- Time to recover after Render sleep
- Accuracy of balance, expenses, and handover records

## Scope Included

- Resource-first booking engine
- Customer bot booking and proof flow
- Manager bot operations flow
- Manager group notifications
- Balance and expense tracking
- Daily report generation
- Webhook registration and diagnostics
- Audit logging of manager actions

## Out Of Scope For Now

- Online payment gateway integration
- Multi-property support
- Multi-manager simultaneous permissions model beyond current handover flow
- Automated SMS or WhatsApp notifications
- Full accounting / tax module
- Native mobile apps

## Non-Functional Requirements

- The system must keep functioning even if some optional migrations are missing
- Telegram updates must be idempotent
- Security-sensitive endpoints must not be publicly writable
- Manager operations should remain usable on mobile-first workflows
- Documentation must reflect real live behavior, not planned behavior

## Operational Constraints

- Render free tier can cold-start after inactivity
- Telegram is the primary operations surface
- Supabase is the source of truth
- Production safety matters more than perfect UI polish

## Product Readiness Definition

The product is operationally ready when:

- both bots are registered with correct webhooks
- manager group notifications work
- the manager can run the day from Telegram alone
- daily owner reporting works
- balance and expense flows work
- audit logs are available through table or fallback mode
- docs match the live system
