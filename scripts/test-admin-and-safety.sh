#!/usr/bin/env bash
# Tests the admin catalog, the Neo4j safe-exercise query, and role refusal.
# Expects the dev server on :3000 with seeded data.
B=http://localhost:3000
ADMIN=$(mktemp); USER=$(mktemp)

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; pass=$((pass+1));
          else echo "  FAIL  $1 — expected $2, got $3"; fail=$((fail+1)); fi; }

echo "1. Sign in"
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$ADMIN" -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"admin@eirene.test","password":"password123"}')
check "admin login" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$USER" -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"aarav@eirene.test","password":"password123"}')
check "user login" "200" "$code"

echo "2. Safe-exercise query from Neo4j"
resp=$(curl -s -b "$USER" "$B/api/exercises/safe")
echo "$resp" | grep -q '"source":"neo4j"' \
  && { echo "  PASS  answered by neo4j"; pass=$((pass+1)); } \
  || { echo "  FAIL  not answered by neo4j: $(echo "$resp" | head -c 120)"; fail=$((fail+1)); }
safe=$(echo "$resp" | grep -o '"exerciseId"' | wc -l)
unsafe=$(echo "$resp" | grep -o '"injuries"' | wc -l)
echo "  safe entries: $safe, unsafe entries: $unsafe"
[ "$unsafe" -gt 0 ] && { echo "  PASS  unsafe exercises identified for this user"; pass=$((pass+1)); } \
  || { echo "  FAIL  no unsafe exercises found"; fail=$((fail+1)); }

echo "3. Admin API refuses a normal user"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER" "$B/api/admin/exercises")
check "GET as normal user" "403" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER" -X POST "$B/api/admin/exercises" \
  -H 'Content-Type: application/json' -d '{"name":"Sneaky","muscleGroup":"Arms"}')
check "POST as normal user" "403" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/admin/exercises")
check "GET signed out" "401" "$code"

echo "4. Admin page is reachable by admin, not by user"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN" "$B/admin/exercises")
check "GET /admin/exercises as admin" "200" "$code"
loc=$(curl -s -o /dev/null -w "%{redirect_url}" -b "$USER" "$B/admin/exercises")
case "$loc" in *denied=admin*) echo "  PASS  user redirected to $loc"; pass=$((pass+1));;
  *) echo "  FAIL  got '$loc'"; fail=$((fail+1));; esac

echo "5. Admin creates an exercise that strains Knee Pain"
KNEE=$(curl -s -b "$ADMIN" "$B/api/admin/exercises" | tr '{' '\n' | grep -i '"name":"Knee Pain"' | grep -o '"injury_id":[0-9]*' | head -1 | cut -d: -f2)
echo "  knee injury_id: $KNEE"
NAME="Test Deep Squat $RANDOM"
resp=$(curl -s -b "$ADMIN" -X POST "$B/api/admin/exercises" -H 'Content-Type: application/json' \
  -d "{\"name\":\"$NAME\",\"muscleGroup\":\"Legs\",\"equipment\":\"Barbell\",\"difficulty\":\"advanced\",\"injuryIds\":[$KNEE]}")
NEWID=$(echo "$resp" | grep -o '"exerciseId":[0-9]*' | cut -d: -f2)
[ -n "$NEWID" ] && { echo "  PASS  created exercise id $NEWID"; pass=$((pass+1)); } \
  || { echo "  FAIL  create failed: $resp"; fail=$((fail+1)); }

echo "6. The new exercise reaches Neo4j and is unsafe for the knee user"
sleep 1
# Parse the JSON rather than grepping: the response holds both lists, so a
# plain grep matches the name in either one.
verdict=$(curl -s -b "$USER" "$B/api/exercises/safe" | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
  const j=JSON.parse(s), name=process.argv[1];
  const inSafe=j.safe.some(e=>e.name===name);
  const inUnsafe=j.unsafe.some(e=>e.name===name);
  console.log(inSafe?'IN_SAFE':inUnsafe?'IN_UNSAFE':'IN_NEITHER');
});" "$NAME")
case "$verdict" in
  IN_UNSAFE) echo "  PASS  graph places it in the unsafe list, not the safe one"; pass=$((pass+1));;
  IN_SAFE)   echo "  FAIL  graph says it is safe despite the STRAINS edge"; fail=$((fail+1));;
  *)         echo "  FAIL  not in either list ($verdict)"; fail=$((fail+1));;
esac

echo "7. The database refuses to log it"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' -d "{\"exerciseId\":$NEWID,\"sets\":3,\"reps\":5,\"weightKg\":80}")
check "logging the new unsafe exercise" "409" "$code"

echo "8. Admin edits it to strain nothing"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN" -X PUT "$B/api/admin/exercises" \
  -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$NEWID,\"name\":\"$NAME\",\"muscleGroup\":\"Legs\",\"equipment\":\"Barbell\",\"difficulty\":\"advanced\",\"injuryIds\":[]}")
check "edit removes the injury link" "200" "$code"
sleep 1
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$USER" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' -d "{\"exerciseId\":$NEWID,\"sets\":3,\"reps\":5,\"weightKg\":80}")
check "now it logs" "201" "$code"

echo "9. Deleting an exercise people have logged is refused"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN" -X DELETE "$B/api/admin/exercises" \
  -H 'Content-Type: application/json' -d "{\"exerciseId\":$NEWID}")
check "delete blocked by the foreign key" "409" "$code"

echo "10. Duplicate name refused"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$ADMIN" -X POST "$B/api/admin/exercises" \
  -H 'Content-Type: application/json' -d "{\"name\":\"$NAME\",\"muscleGroup\":\"Legs\"}")
check "duplicate rejected" "409" "$code"

echo
echo "cleanup: remove the test exercise and its log"
echo "  (handled by the caller)"
echo "TEST_EXERCISE_ID=$NEWID"
echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ] || exit 1
