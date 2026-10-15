#!/usr/bin/env bash
# End-to-end auth tests against the dev server.
B=http://localhost:3000
J=$(mktemp)   # cookie jar
EMAIL="rhea.test.$RANDOM@eirene.dev"

pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "  PASS  $1 ($3)"; pass=$((pass+1));
  else echo "  FAIL  $1 — expected $2, got $3"; fail=$((fail+1)); fi
}

echo "1. Protected route while signed out"
code=$(curl -s -o /dev/null -w "%{http_code}" "$B/dashboard")
check "GET /dashboard redirects" "307" "$code"
loc=$(curl -s -o /dev/null -w "%{redirect_url}" "$B/dashboard")
case "$loc" in *"/login"*) echo "  PASS  redirect target is $loc"; pass=$((pass+1));;
  *) echo "  FAIL  redirect target was $loc"; fail=$((fail+1));; esac

echo "2. Registration validation"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/register" \
  -H 'Content-Type: application/json' -d '{"fullName":"A","email":"notanemail","password":"short"}')
check "bad input rejected" "400" "$code"

echo "3. Register a new account"
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$J" -X POST "$B/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Rhea Test\",\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "register succeeds" "201" "$code"
grep -q "eirene_session" "$J" && { echo "  PASS  session cookie set"; pass=$((pass+1)); } \
  || { echo "  FAIL  no session cookie"; fail=$((fail+1)); }
grep -q "HttpOnly\|#HttpOnly" "$J" && { echo "  PASS  cookie is HttpOnly"; pass=$((pass+1)); } \
  || { echo "  FAIL  cookie not HttpOnly"; fail=$((fail+1)); }

echo "4. Duplicate email"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Someone Else\",\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "duplicate rejected" "409" "$code"

echo "5. Dashboard with the session cookie"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J" "$B/dashboard")
check "GET /dashboard allowed" "200" "$code"
curl -s -b "$J" "$B/dashboard" | grep -q "Rhea Test" \
  && { echo "  PASS  page shows the signed-in name"; pass=$((pass+1)); } \
  || { echo "  FAIL  name missing from page"; fail=$((fail+1)); }

echo "6. Admin route as a normal user"
loc=$(curl -s -o /dev/null -w "%{redirect_url}" -b "$J" "$B/admin/exercises")
case "$loc" in *"denied=admin"*) echo "  PASS  blocked, sent to $loc"; pass=$((pass+1));;
  *) echo "  FAIL  admin redirect was '$loc'"; fail=$((fail+1));; esac

echo "7. Wrong password"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpassword\"}")
check "wrong password rejected" "401" "$code"

echo "8. Unknown email gives the same message"
m1=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"wrongpassword\"}")
m2=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"nobody@nowhere.dev","password":"wrongpassword"}')
[ "$m1" = "$m2" ] && { echo "  PASS  identical response, no account enumeration"; pass=$((pass+1)); } \
  || { echo "  FAIL  responses differ: $m1 vs $m2"; fail=$((fail+1)); }

echo "9. Correct password"
J2=$(mktemp)
code=$(curl -s -o /dev/null -w "%{http_code}" -c "$J2" -X POST "$B/api/auth/login" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}")
check "login succeeds" "200" "$code"

echo "10. Signed-in user visiting /login"
loc=$(curl -s -o /dev/null -w "%{redirect_url}" -b "$J2" "$B/login")
case "$loc" in *"/dashboard"*) echo "  PASS  bounced to dashboard"; pass=$((pass+1));;
  *) echo "  FAIL  got '$loc'"; fail=$((fail+1));; esac

echo "11. Logout"
curl -s -o /dev/null -b "$J2" -c "$J2" -X POST "$B/api/auth/logout"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J2" "$B/dashboard")
check "dashboard protected again after logout" "307" "$code"

echo "12. Tampered token"
J3=$(mktemp)
printf '#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\teirene_session\tnot.a.real.token\n' > "$J3"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$J3" "$B/dashboard")
check "forged cookie rejected" "307" "$code"

echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ] || exit 1
