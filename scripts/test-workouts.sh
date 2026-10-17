#!/usr/bin/env bash
# End-to-end tests for the workout logging and safety rules.
# Expects the dev server on :3000 and seeded data in the database.
B=http://localhost:3000
J=$(mktemp)

EMAIL=${1:-aarav@eirene.test}
PASSWORD=${2:-password123}
UNSAFE_ID=${3:-1}    # Barbell Squat — strains Knee Pain
SAFE_ID=${4:-4}      # Deadlift

pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; pass=$((pass+1));
          else echo "  FAIL  $1 — expected $2, got $3"; fail=$((fail+1)); fi; }

echo "1. Sign in as a seeded user"
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$J" -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
check "login" "200" "$code"
[ "$code" = "200" ] || { echo "cannot continue without a session"; exit 1; }

echo "2. Exercise catalog flags unsafe options"
flagged=$(curl -s -b "$J" "$B/api/exercises" | grep -o '"unsafe":true' | wc -l)
[ "$flagged" -gt 0 ] && { echo "  PASS  $flagged exercises flagged unsafe"; pass=$((pass+1)); } \
  || { echo "  FAIL  nothing flagged unsafe"; fail=$((fail+1)); }

echo "3. Logging an unsafe exercise is refused"
before=$(curl -s -b "$J" "$B/api/workouts" | grep -o '"log_id"' | wc -l)
resp=$(curl -s -b "$J" -X POST "$B/api/workouts" -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$UNSAFE_ID,\"sets\":3,\"reps\":10,\"weightKg\":60}")
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$UNSAFE_ID,\"sets\":3,\"reps\":10,\"weightKg\":60}")
check "refused with 409" "409" "$code"
echo "  message: $(echo "$resp" | sed 's/.*"error":"//;s/","reason.*//' | head -c 110)"

echo "4. Nothing was written"
after=$(curl -s -b "$J" "$B/api/workouts" | grep -o '"log_id"' | wc -l)
check "log count unchanged" "$before" "$after"

echo "5. Logging a safe exercise works"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$SAFE_ID,\"sets\":4,\"reps\":8,\"weightKg\":70}")
check "accepted with 201" "201" "$code"
after2=$(curl -s -b "$J" "$B/api/workouts" | grep -o '"log_id"' | wc -l)
check "log count grew by one" "$((before+1))" "$after2"

echo "6. Input validation"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' -d "{\"exerciseId\":$SAFE_ID,\"sets\":0,\"reps\":10}")
check "zero sets rejected" "400" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' -d '{"exerciseId":999999,"sets":3,"reps":10}')
check "unknown exercise rejected" "400" "$code"

echo "7. Weekly progress view is served"
curl -s -b "$J" "$B/api/progress" | grep -q '"week_start"' \
  && { echo "  PASS  v_weekly_progress returns rows"; pass=$((pass+1)); } \
  || { echo "  FAIL  no weekly rows"; fail=$((fail+1)); }

echo "8. Weigh-in records and corrects"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/progress" \
  -H 'Content-Type: application/json' -d '{"weightKg":72.5,"bodyFatPct":18}')
check "weigh-in saved" "201" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/progress" \
  -H 'Content-Type: application/json' -d '{"weightKg":72.1}')
check "same-day weigh-in corrects rather than failing" "201" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/progress" \
  -H 'Content-Type: application/json' -d '{"weightKg":5}')
check "impossible weight rejected" "400" "$code"

echo "9. Removing the injury unblocks the exercise"
INJ=$(curl -s -b "$J" "$B/api/injuries" | tr ',' '\n' | grep -B20 '"has_injury":true' | grep -o '"injury_id":[0-9]*' | tail -1 | cut -d: -f2)
curl -s -o /dev/null -b "$J" -X DELETE "$B/api/injuries" -H 'Content-Type: application/json' -d "{\"injuryId\":$INJ}"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$UNSAFE_ID,\"sets\":3,\"reps\":10,\"weightKg\":60}")
check "previously unsafe exercise now accepted" "201" "$code"
curl -s -o /dev/null -b "$J" -X POST "$B/api/injuries" -H 'Content-Type: application/json' \
  -d "{\"injuryId\":$INJ,\"severity\":\"moderate\"}"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" -X POST "$B/api/workouts" \
  -H 'Content-Type: application/json' \
  -d "{\"exerciseId\":$UNSAFE_ID,\"sets\":3,\"reps\":10,\"weightKg\":60}")
check "blocked again once the injury is back" "409" "$code"

echo "10. Pages render"
for p in /dashboard /workouts /profile; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" "$B$p")
  check "GET $p" "200" "$code"
done

echo "11. Signed-out access is refused"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/api/workouts")
check "GET /api/workouts without a session" "401" "$code"

echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ] || exit 1
