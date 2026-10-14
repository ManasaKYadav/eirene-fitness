// Eirene — Neo4j constraints (Person B, Day 2)
//
// A uniqueness constraint on id for each label:
//   User, Goal, Injury, Allergen, Exercise, Ingredient, Food
//
// Relationships used by the graph:
//   (User)-[:HAS_GOAL]->(Goal)
//   (User)-[:HAS_INJURY]->(Injury)      (Exercise)-[:STRAINS]->(Injury)
//   (User)-[:ALLERGIC_TO]->(Allergen)   (Ingredient)-[:HAS_ALLERGEN]->(Allergen)
//   (Food)-[:CONTAINS]->(Ingredient)    (Ingredient)-[:CONTAINS]->(Ingredient)
//   (User)-[:DID {count}]->(Exercise)   (User)-[:ATE {count}]->(Food)
