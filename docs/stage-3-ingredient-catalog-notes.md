# Stage 3 Ingredient Catalog — stabilization notes

This note documents intentionally deferred work after Stage 3 foundation stabilization.

## Known limitations / TODO for next stages

1. **Dependent-entity rebinding on merge**
   - Current merge flow marks source ingredient as `merged` and points `mergedIntoId`.
   - Future stages must rebind dependent entities (inventory items, recipe ingredients, brew-session references) in a transactional migration-safe way.

2. **User proposal UX flow**
   - `ProposedIngredient` model and moderator actions are implemented.
   - End-user submission UI/flow ("Не нашли ингредиент?") is intentionally deferred.

3. **Public ingredient pages**
   - Not part of Stage 3. Public ingredient browsing/profile pages are deferred.

4. **Inventory integration**
   - "My Ingredients" inventory module should consume `IngredientCatalogItem` IDs as source of truth.
   - Inventory UI itself is intentionally out of Stage 3 scope.

5. **Recipe builder integration**
   - Recipe builder should use the same search contract and shared `IngredientPicker`.
   - Recipe features are intentionally deferred.

## Architecture validation checklist (Stage 3)

- `IngredientPicker` remains shared UI (not admin-only).
- Search and normalization live in reusable feature/service modules.
- Permissions are checked server-side for admin/moderation APIs.
- Merge logic is implemented in service layer, not hardcoded only in UI handlers.
