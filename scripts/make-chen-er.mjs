// Generates docs/er-diagram-chen.svg — the conceptual ER diagram in Chen
// notation (rectangles = entities, diamonds = relationships, ovals =
// attributes), as a companion to the relational schema from dbdiagram.io.
//
// Run with: node scripts/make-chen-er.mjs
//
// Layout is explicit rather than automatic, and the script asserts that no two
// shapes overlap before writing the file.

import { writeFileSync } from "node:fs";

const CHAR_W = 9.1; // approx width per character at font-size 19 in a sans stack

const entities = {};
const rels = {};
const attrs = [];
const edges = [];

/** Entity rectangle. weak = double border. */
function entity(id, label, x, y, { weak = false } = {}) {
  const w = Math.max(190, label.length * CHAR_W + 60);
  entities[id] = { id, label, x, y, w, h: 76, weak, kind: "entity" };
  return entities[id];
}

/** Relationship diamond. identifying = double border. */
function rel(id, label, x, y, { identifying = false } = {}) {
  const w = Math.max(200, label.length * CHAR_W + 70);
  rels[id] = { id, label, x, y, w, h: 104, identifying, kind: "rel" };
  return rels[id];
}

/**
 * Fan a list of attributes around an owner at the given angles (degrees,
 * 0 = right, 90 = up) and radius.
 */
function fan(ownerId, list, angles, radius) {
  const owner = entities[ownerId];
  list.forEach((spec, i) => {
    const [label, flag] = Array.isArray(spec) ? spec : [spec, null];
    const a = (angles[i] * Math.PI) / 180;
    const w = Math.max(150, label.length * CHAR_W + 44);
    attrs.push({
      kind: "attr",
      label,
      key: flag === "key",
      partial: flag === "partial",
      derived: flag === "derived",
      x: owner.x + radius * Math.cos(a),
      y: owner.y - radius * Math.sin(a),
      w,
      h: 52,
      owner,
    });
  });
}

/** Edge between an entity and a relationship, with a cardinality label. */
function link(aId, bId, card) {
  const a = entities[aId] ?? rels[aId];
  const b = entities[bId] ?? rels[bId];
  edges.push({ a, b, card });
}

// ----------------------------------------------------------------
// Entities
// ----------------------------------------------------------------

entity("user", "USER", 1400, 1050);
entity("goal", "GOAL", 1400, 300);
entity("injury", "INJURY", 600, 330);
entity("exercise", "EXERCISE", 600, 1780);
entity("allergen", "ALLERGEN", 2200, 330);
entity("food", "FOOD", 2200, 1780);
entity("ingredient", "INGREDIENT", 2850, 1050);
entity("progress", "PROGRESS_LOG", 1400, 1840, { weak: true });

// ----------------------------------------------------------------
// Relationships
// ----------------------------------------------------------------

rel("hasGoal", "HAS", 1400, 640);
rel("suffers", "SUFFERS", 1050, 620);
rel("logs", "LOGS", 1050, 1480);
rel("allergicTo", "ALLERGIC_TO", 1750, 620);
rel("eats", "EATS", 1750, 1480);
rel("strains", "STRAINS", 330, 1050);
rel("hasAllergen", "HAS", 2650, 600);
rel("contains", "CONTAINS", 2650, 1500);
rel("partOf", "PART_OF", 3250, 1050);
rel("records", "RECORDS", 1400, 1540, { identifying: true });

// ----------------------------------------------------------------
// Attributes
// ----------------------------------------------------------------

fan("user",
  [["user_id", "key"], "email", "password_hash", "full_name",
   "role", "height_cm", "last_workout_on", "created_at"],
  [165, 145, 195, 215, 35, 15, 345, 325], 440);

fan("goal", [["goal_id", "key"], "name", "description"], [140, 90, 40], 235);
fan("injury", [["injury_id", "key"], "name", "body_part", "description"],
  [45, 95, 145, 195], 275);
fan("exercise", [["exercise_id", "key"], "name", "muscle_group", "equipment", "difficulty"],
  [345, 300, 250, 200, 155], 280);
fan("allergen", [["allergen_id", "key"], "name"], [60, 130], 250);
fan("food", [["food_id", "key"], "name", "calories", "protein_g", "carbs_g"],
  [335, 300, 265, 230, 195], 285);
fan("ingredient", [["ingredient_id", "key"], "name"], [160, 200], 265);
fan("progress", [["logged_on", "partial"], "weight_kg", "body_fat_pct", "notes"],
  [205, 250, 290, 335], 270);

// ----------------------------------------------------------------
// Edges
// ----------------------------------------------------------------

link("user", "hasGoal", "N");        link("hasGoal", "goal", "1");
link("user", "suffers", "M");        link("suffers", "injury", "N");
link("user", "logs", "M");           link("logs", "exercise", "N");
link("user", "allergicTo", "M");     link("allergicTo", "allergen", "N");
link("user", "eats", "M");           link("eats", "food", "N");
link("exercise", "strains", "M");    link("strains", "injury", "N");
link("ingredient", "hasAllergen", "N"); link("hasAllergen", "allergen", "1");
link("food", "contains", "M");       link("contains", "ingredient", "N");
link("user", "records", "1");        link("records", "progress", "N");

// ----------------------------------------------------------------
// Overlap check — bounding boxes, with a little breathing room
// ----------------------------------------------------------------

const all = [...Object.values(entities), ...Object.values(rels), ...attrs];
const PAD = 8;
const collisions = [];
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const dx = Math.abs(a.x - b.x) - (a.w + b.w) / 2 - PAD;
    const dy = Math.abs(a.y - b.y) - (a.h + b.h) / 2 - PAD;
    if (dx < 0 && dy < 0) {
      collisions.push(`${a.kind}:${a.label}  <->  ${b.kind}:${b.label}` +
        `  (overlap x ${(-dx).toFixed(0)}px, y ${(-dy).toFixed(0)}px)`);
    }
  }
}

if (collisions.length) {
  console.error(`${collisions.length} OVERLAP(S):`);
  for (const c of collisions) console.error("  " + c);
} else {
  console.log("No overlapping shapes.");
}

// ----------------------------------------------------------------
// Render
// ----------------------------------------------------------------

/** Where a line from `from` toward `to` should leave `from`'s box. */
function anchor(shape, toward) {
  const dx = toward.x - shape.x, dy = toward.y - shape.y;
  const hw = shape.w / 2, hh = shape.h / 2;
  if (shape.kind === "rel") {
    // Diamond: scale to its edge along |x|/hw + |y|/hh = 1
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: shape.x + dx * t, y: shape.y + dy * t };
  }
  const t = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return { x: shape.x + dx * t, y: shape.y + dy * t };
}

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3560 2400" font-family="Segoe UI, Helvetica, Arial, sans-serif">`);
out.push(`<rect width="3560" height="2400" fill="#ffffff"/>`);
out.push(`<text x="60" y="78" font-size="42" font-weight="600" fill="#111">Eirene — Entity Relationship Diagram (Chen notation)</text>`);
out.push(`<text x="60" y="118" font-size="21" fill="#555">Underlined = primary key &#183; dashed underline = partial key &#183; double border = weak entity / identifying relationship</text>`);
// Everything below the heading is shifted down so the title band stays clear.
out.push(`<g transform="translate(0,170)">`);

// Attribute connector lines first, so shapes draw on top.
for (const a of attrs) {
  const p = anchor(a.owner, a);
  out.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" stroke="#8a8a8a" stroke-width="2"/>`);
}

// Entity <-> relationship edges with cardinality labels.
for (const e of edges) {
  const p = anchor(e.a, e.b), q = anchor(e.b, e.a);
  const double = e.b === rels.records || e.a === rels.records;
  out.push(`<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="#333" stroke-width="${double ? 3 : 2.5}"/>`);
  const mx = p.x + (q.x - p.x) * 0.42, my = p.y + (q.y - p.y) * 0.42;
  out.push(`<circle cx="${mx.toFixed(1)}" cy="${(my - 2).toFixed(1)}" r="17" fill="#fff" stroke="none"/>`);
  out.push(`<text x="${mx.toFixed(1)}" y="${(my + 6).toFixed(1)}" font-size="24" font-weight="700" fill="#b23b00" text-anchor="middle">${e.card}</text>`);
}

// PART_OF is recursive: two edges back to INGREDIENT, labelled by role.
{
  const ing = entities.ingredient, po = rels.partOf;
  const top = { x: ing.x + ing.w / 2, y: ing.y - 22 };
  const bot = { x: ing.x + ing.w / 2, y: ing.y + 22 };
  out.push(`<path d="M ${top.x} ${top.y} C ${top.x + 170} ${top.y - 130}, ${po.x - 60} ${po.y - 120}, ${po.x} ${po.y - po.h / 2}" fill="none" stroke="#333" stroke-width="2.5"/>`);
  out.push(`<path d="M ${bot.x} ${bot.y} C ${bot.x + 170} ${bot.y + 130}, ${po.x - 60} ${po.y + 120}, ${po.x} ${po.y + po.h / 2}" fill="none" stroke="#333" stroke-width="2.5"/>`);
  out.push(`<text x="${po.x - 95}" y="${po.y - 115}" font-size="22" font-weight="700" fill="#b23b00" text-anchor="middle">M (whole)</text>`);
  out.push(`<text x="${po.x - 95}" y="${po.y + 140}" font-size="22" font-weight="700" fill="#b23b00" text-anchor="middle">N (part)</text>`);
}

function textEl(x, y, label, { size = 19, weight = 400, fill = "#111" } = {}) {
  return `<text x="${x.toFixed(1)}" y="${(y + size * 0.35).toFixed(1)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${label}</text>`;
}

for (const a of attrs) {
  out.push(`<ellipse cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" rx="${(a.w / 2).toFixed(1)}" ry="${(a.h / 2).toFixed(1)}" fill="#fffdf5" stroke="#6b6b6b" stroke-width="2"/>`);
  out.push(textEl(a.x, a.y, a.label));
  if (a.key || a.partial) {
    const half = (a.label.length * CHAR_W) / 2;
    out.push(`<line x1="${(a.x - half).toFixed(1)}" y1="${(a.y + 15).toFixed(1)}" x2="${(a.x + half).toFixed(1)}" y2="${(a.y + 15).toFixed(1)}" stroke="#111" stroke-width="2"${a.partial ? ' stroke-dasharray="5 4"' : ""}/>`);
  }
}

for (const r of Object.values(rels)) {
  const pts = (inset) => [
    `${r.x},${r.y - r.h / 2 + inset}`,
    `${r.x + r.w / 2 - inset * 1.6},${r.y}`,
    `${r.x},${r.y + r.h / 2 - inset}`,
    `${r.x - r.w / 2 + inset * 1.6},${r.y}`,
  ].join(" ");
  out.push(`<polygon points="${pts(0)}" fill="#eef6ff" stroke="#1b4f86" stroke-width="2.5"/>`);
  if (r.identifying) out.push(`<polygon points="${pts(11)}" fill="none" stroke="#1b4f86" stroke-width="2"/>`);
  out.push(textEl(r.x, r.y, r.label, { size: 20, weight: 600, fill: "#12365c" }));
}

for (const e of Object.values(entities)) {
  const draw = (inset, fill) =>
    `<rect x="${(e.x - e.w / 2 + inset).toFixed(1)}" y="${(e.y - e.h / 2 + inset).toFixed(1)}" width="${(e.w - inset * 2).toFixed(1)}" height="${(e.h - inset * 2).toFixed(1)}" rx="4" fill="${fill}" stroke="#14532d" stroke-width="2.5"/>`;
  out.push(draw(0, "#e9f7ef"));
  if (e.weak) out.push(draw(9, "none"));
  out.push(textEl(e.x, e.y, e.label, { size: 23, weight: 700, fill: "#14532d" }));
}

out.push(`</g>`);
out.push(`</svg>`);

writeFileSync(new URL("../docs/er-diagram-chen.svg", import.meta.url), out.join("\n"));
console.log(`Wrote docs/er-diagram-chen.svg — ${Object.keys(entities).length} entities, ${Object.keys(rels).length} relationships, ${attrs.length} attributes.`);
