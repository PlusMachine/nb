# Project Context

## What this project is

This repository contains a **web-first platform for homebrewers**.

The product is being built incrementally. The long-term core user flow is:

**My Ingredients → Recipes → Recipe Match → Brew Session → History**

This is **not** a forum-first product and **not** a store-first product.  
The primary value is practical brewing workflow and recipe/inventory usefulness.

---

## Read this first if you are an AI coding agent

Before making any changes:

1. Read this file fully.
2. Inspect the current repository state.
3. Reuse existing services, contracts, schemas, and UI patterns.
4. Do **not** invent parallel architectures if the repo already contains a working pattern.
5. Prefer minimal, consistent changes over broad rewrites.

Very important:

- Do not assume every planned feature already exists.
- Do not assume roadmap labels like `Stage 4B.2` matter inside the codebase.
- Use the **actual repo state** as source of truth.
- If something described here is missing, extend the existing structure carefully instead of rebuilding from scratch.

---

## Product principles

### 1. Recipe-first product
Recipes are a central product object.

### 2. Inventory-aware system
The system should understand ingredients as structured entities, not free-text strings.

### 3. Better than spreadsheets
The “My Ingredients” module should feel faster and more useful than Google Sheets.

### 4. One ingredient model everywhere
The same ingredient identity should be reused across:
- ingredient catalog
- user inventory
- recipes
- future match engine
- future brew session

### 5. Server-side truth
Ownership, permissions, normalization, and domain logic should be handled server-side.

### 6. Entered vs normalized values
Whenever units matter, the user may enter values in their preferred unit, but the system must also store normalized canonical values for comparisons and future matching.

---

## Current product scope

The project is being built in layers. At the time of writing, the expected implemented or partially implemented modules are:

### Implemented or expected foundation layers
- ingredient catalog foundation
- inventory foundation
- inventory page with add flow
- inventory usability improvements
- recipe domain foundation
- my recipes read layer
- recipe editor foundation
- local/dev seed and role utilities

### Not yet fully implemented
- public recipe page
- advanced recipe builder
- match engine
- brew session
- low stock / freshness UX
- shopping list
- content/article integration
- admin recipe moderation workflows
- public recipe catalog UX

If you are asked to work on one of the “not yet implemented” features, build on top of current foundations rather than bypassing them.

---

## Core domain entities

These are the key domain entities. Reuse them instead of inventing new parallel models.

### Ingredient catalog
- `IngredientCatalogItem`
- `ProposedIngredient`

### User inventory
- `UserCustomIngredient`
- `UserIngredient`

### Recipes
- `Recipe`
- `RecipeIngredient`

Future modules should continue to build on these.

---

## Architecture expectations

This project follows a **modular monolith** approach.

### General expectations
- one main runtime
- one database
- one repo
- clear feature/service boundaries
- shared domain logic in reusable layers
- no unnecessary microservices
- no duplicate business logic in page components

### Expected architectural style
Use:
- schemas/models in db layer
- reusable service layer for business logic
- contracts/DTOs for page/action boundaries
- shared UI components where already available
- existing auth guard patterns
- existing action/form/validation patterns

Do **not**:
- write ad-hoc DB queries directly inside page components if a service already exists
- duplicate normalization logic in UI
- duplicate ownership checks in page layer if service layer already handles it
- create a second ingredient picker or second search architecture

---

## Critical invariants

These must not be broken.

### Ingredient identity
Do **not** use free-text as the primary ingredient identity where entity linkage already exists.

Correct source linkage is:
- catalog ingredient entity
- or user custom ingredient entity

### Shared ingredient picking
If an ingredient picker/search component already exists, reuse it.  
Do not create a separate independent picker flow unless explicitly required.

### Entered vs normalized units
For inventory and recipes:
- keep what the user entered for UX
- also keep normalized canonical values for system logic

Examples:
- entered: `1 kg`
- normalized: `1000 g`

The client should not be the source of truth for normalization.

### Ownership and permissions
Ownership and role rules must be enforced server-side.

Examples:
- one user cannot edit another user’s inventory
- one user cannot edit another user’s private recipe
- role-based admin/moderation rules must not rely on hidden UI alone

### Domain logic location
Calculations, normalization, and access rules belong in domain/service layers, not in page rendering code.

---

## Units philosophy

This system must be consistent about units.

### User-facing behavior
Users may prefer:
- `g`, `kg`, `oz`, `lb`
- `ml`, `l`
- and other unit families where supported

### System-facing behavior
The system should store canonical normalized values.

Examples:
- weight normalized to `g`
- volume normalized to `ml`

This is important for:
- future recipe matching
- ingredient comparisons
- future brew session deductions
- future builder scaling

If you add any feature involving quantities, use existing normalization helpers and do not bypass canonical storage.

---

## Existing feature expectations

## Ingredient catalog
Expected foundations:
- ingredient catalog schema
- moderation/pending proposals
- search and fuzzy search
- shared ingredient picker
- admin ingredient management
- merge duplicate flow

If you work in this area:
- reuse catalog identity
- keep moderation model intact
- do not replace structured entities with text

## Inventory
Expected foundations:
- user inventory schemas
- user custom ingredients
- entered and normalized units
- add-from-catalog flow
- add custom ingredient flow
- search / type filter / archived toggle
- inline quantity editing
- ownership-safe service layer

If you work in this area:
- keep inventory service as source of truth
- do not move normalization into the client
- do not bypass ownership checks

## Recipes
Expected foundations:
- recipe schema
- recipe ingredient schema
- recipe service layer
- recipe read routes in app-zone
- recipe editor foundation
- stats integration via brewing-core

If you work in this area:
- use recipe service layer
- use existing ingredient linkage model
- use existing normalization model
- use brewing-core for calculations

---

## Routes and access model

This app uses authenticated app-zone routes and protected admin routes.

### App-zone
These are for authenticated users.

Expected examples:
- `/app`
- `/app/ingredients`
- `/app/recipes`
- `/app/recipes/[id]`
- `/app/recipes/new`
- `/app/recipes/[id]/edit`

### Admin / moderation
These are role-protected.

Examples may include:
- ingredient catalog admin pages
- moderation queue
- merge flows

### Important note for automated QA
Protected routes often redirect to login without an authenticated session.

That means:
- screenshots of protected routes without a session are usually not useful
- Playwright screenshots of `/app/...` or `/admin/...` without auth should **not** be treated as strong proof of correctness

Preferred validation:
- unit tests
- integration-like tests
- service layer tests
- action tests
- page wiring tests

---

## Local development and QA flow

Use this local setup flow:

```bash
cp .env.example .env
npm install
docker compose up -d
npm run dev
npm run seed:qa 

`npm run dev` is expected to auto-run `db:migrate` and `db:seed` before starting the app.

After that:

use the seeded QA users/roles

log in through the normal auth flow

manually inspect protected routes with a real authenticated session

Role and seed utilities

The repo is expected to contain dev/test utilities for local QA.

Expected capabilities:

create/update a dev test user

assign role by email

seed QA dataset

Examples of local commands may include:

npm run seed:qa

npm run seed:dev-user -- --email ...

npm run set-role -- --email ... --role admin

These utilities are for local/dev use only and must not become public backdoors.

Expected QA users and roles

The exact emails may vary, but the local QA seed is expected to create users like:

admin

moderator

editor

regular user

Use those seeded users for manual QA instead of patching SQL by hand whenever possible.

What counts as good validation

For protected app/admin work, these are strong signals:

service tests pass

action tests pass

component tests pass

route/page wiring tests pass

typecheck passes

These are weak signals:

screenshot of login page after redirect

opening protected route without auth

a browser screenshot with no session

Manual QA is still useful, but only if done through:

seeded local users

real login flow

real role assignment flow

Preferred implementation style

When adding a new feature:

Find the existing service layer for that domain.

Find existing DTO/contracts.

Find existing validation patterns.

Find existing shared UI components.

Extend them minimally.

Add focused tests.

Avoid broad rewrites.

Prefer:

small, composable components

server actions or existing mutation patterns

route-level loading/error states

revalidation through existing patterns

DTO-driven page rendering

Avoid:

giant multi-purpose components

duplicated form logic

duplicated search logic

duplicated unit conversion logic

duplicated ownership checks

Current functional priorities

The product should continue to be built in this order of importance:

Highest near-term priority

Inventory is reliable and pleasant to use

Recipe authoring becomes practical

Public recipe foundation becomes available

Recipe matching can be built on top of stable inventory + recipe data

Brew session can be built on top of stable recipe process model

Lower priority for now

content system expansion

public marketing polish

advanced admin workflows

non-core secondary UX

Planned feature groups

These are important, but not all are implemented yet.

Inventory

add ingredient

custom ingredient

search/filter/archive

inline edit

future low stock / freshness

Recipes

author-side create/edit

my recipes read layer

future public recipe page

future richer builder UX

Match

recipe vs inventory compatibility

missing ingredients

future recipe recommendations

Brew

brew session creation from recipe

stage/step execution

timers

confirmations

future inventory deduction integration

Guidance for AI coding agents

When you receive a new task:

First

read this file

inspect the repo

identify the existing source of truth

Then

describe briefly what already exists

explain the smallest safe implementation path

only then modify code

Always preserve

ingredient identity model

normalization model

service-layer ownership checks

shared ingredient picker/search foundation

recipe/inventory domain boundaries

Do not assume

that roadmap numbers matter inside the repo

that all planned future features are already implemented

that protected route screenshots prove anything useful

If something seems missing

If a feature mentioned here does not exist in the repo:

do not panic

do not rewrite everything

state clearly what is missing

extend the current architecture minimally

keep the same domain model and invariants

Short summary for agents

This codebase is a homebrewing platform built around structured ingredients, user inventory, recipes, and future recipe matching + brew execution.

The most important invariants are:

structured ingredient entities, not free-text

shared ingredient picker/search foundation

entered + normalized units

server-side business logic

ownership-safe services

recipe and inventory models that can support future matching

If in doubt, choose:

the smaller change

the more reusable change

the more domain-consistent change

the version that keeps logic server-side
