# Eirene — report sections: Training & Users

Draft sections covering authentication and roles, the workout module, the
advanced SQL, and the test results. Written to be pasted into the project
report; headings can be renumbered to fit the final document.

---

## 1. Authentication and roles

### 1.1 Storing an account

An account is one row in `users`: `email`, `password_hash`, `full_name` and
`role`. The password itself is never stored. Registration hashes it with
bcrypt at cost 10, which is slow enough to make guessing expensive and fast
enough that signing in does not feel sluggish.

Two constraints do work that would otherwise be left to application code:

```sql
email VARCHAR(255) NOT NULL UNIQUE,
role  VARCHAR(10)  NOT NULL DEFAULT 'user',
CONSTRAINT chk_users_role CHECK (role IN ('admin', 'user'))
```

The `UNIQUE` on `email` is what rejects a duplicate registration. The route
does not `SELECT` first to check whether the address is taken, because two
requests arriving at the same moment would both find nothing and both insert.
Instead the `INSERT` is attempted and the resulting `23505 unique_violation`
is translated into a 409 response. The database arbitrates, so the race
cannot happen.

The `CHECK` on `role` means an invalid role cannot exist even if a bug
elsewhere tried to write one. Registration always writes `'user'`; `'admin'`
is granted in the database and never from anything a browser sends.

### 1.2 Signing in

Login looks the user up by email and compares the supplied password against
the stored hash. When the email is unknown, the comparison still runs,
against a fixed dummy hash:

```ts
const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
if (!user || !matches) {
  return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
}
```

Two decisions here. The message is the same for a wrong password and an
unknown address, so the form cannot be used to discover which accounts exist.
And the dummy comparison keeps the two paths taking a similar amount of time,
since skipping the hash entirely for an unknown email would make the response
measurably faster and give the same information away through timing.

### 1.3 The session

A successful sign-in returns a JSON Web Token signed with HS256, carrying the
user id and role, set as a cookie:

```ts
httpOnly: true,                                // not readable from JavaScript
sameSite: "lax",                               // not sent on cross-site POSTs
secure: process.env.NODE_ENV === "production", // HTTPS only once deployed
maxAge: 60 * 60 * 24 * 7,
```

`httpOnly` means a cross-site scripting bug cannot read the session.
`sameSite: "lax"` means another site cannot cause the browser to send it on a
form submission, which blocks basic cross-site request forgery.

Carrying the role inside the signed token means route protection can check it
without a database round trip on every request. The token is signed, so a user
editing the cookie to say `"role":"admin"` invalidates the signature and the
session is rejected outright.

### 1.4 Route protection

Next.js 16 deprecated the `middleware.ts` file convention and renamed it to
`proxy.ts`. The behaviour and the matcher configuration are unchanged.

`proxy.ts` runs before every matched request and makes the coarse decision:

- no valid session on a protected path redirects to `/login`, carrying the
  original path as `?next=` so the user returns there after signing in;
- a path under `/admin` with a non-admin session redirects to
  `/dashboard?denied=admin`;
- a signed-in user visiting `/login` or `/register` is sent to the dashboard.

API routes are excluded from the matcher deliberately. A redirect is the right
answer for a page and the wrong answer for a `fetch`, which needs a status
code and JSON. Each API route therefore checks the session itself and returns
401 or 403.

### 1.5 Three layers, not one

Access is checked at three levels, and each one assumes the others may be
bypassed:

| Layer | Mechanism | What it stops |
| --- | --- | --- |
| Request | `proxy.ts` | Opening a page you have no business opening |
| Route | `getSession()` and an explicit role check | Calling the API directly, past the page |
| Database | Roles, `GRANT`/`REVOKE`, row-level security | A query that reaches the database at all |

The admin pages re-check the session rather than trusting that the redirect
happened, and the admin API re-checks the role rather than trusting the page.

### 1.6 Database roles and row-level security

`security.sql` creates two roles, neither of which can log in directly:

```sql
CREATE ROLE eirene_user  NOLOGIN;
CREATE ROLE eirene_admin NOLOGIN;
```

All privileges are revoked and then granted back deliberately, so a table
added later is unreachable until someone decides what it should allow. Both
roles may read the catalog tables; only `eirene_admin` may write them.

Row-level security is enabled on the six tables holding per-user data, each
with a policy comparing the row's owner against a session setting:

```sql
CREATE POLICY p_workout_logs_own ON workout_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.user_id', true), '')::int)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::int);
```

`USING` controls which rows a statement can see or change. `WITH CHECK`
controls which rows it may write. Both are needed: with only `USING`, a user
could insert a row carrying someone else's `user_id` and then be unable to see
what they had just created.

The application supplies the setting through `withUser()`:

```ts
await client.query("BEGIN");
await client.query("SET LOCAL ROLE eirene_user");
await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
```

Both `SET LOCAL` and the `true` argument to `set_config` are
transaction-scoped, so they are undone at `COMMIT` and a pooled connection
carries nothing into the next request.

### 1.7 Why the policies are not FORCEd

PostgreSQL exempts a table's owner from its own policies unless the table is
also given `FORCE ROW LEVEL SECURITY`. The owner here is the role the
application connects as, and that is deliberate: registration and login must
read and write `users` before any user id exists, and `seed.sql` inserts rows
for every user at once. Neither can run under a policy keyed on
`app.user_id`.

The consequence is worth stating plainly: a query that skips `withUser()` runs
as the owner and is not filtered. The routes are written so that the only
queries outside it are registration, login and the health check.

### 1.8 Administrators

The per-user policies apply to `eirene_admin` as well, which meant an admin
reporting across users initially saw only their own rows. A second policy,
granted to that role and limited to `SELECT`, widens its reads:

```sql
CREATE POLICY p_workout_logs_admin_read ON workout_logs
    FOR SELECT TO eirene_admin USING (true);
```

Policies are permissive and combined with `OR`, so this widens `eirene_admin`
without touching `eirene_user`. It is `SELECT` only on purpose: administrators
report on user data, they do not edit someone else's workout log. Testing
confirms an admin `UPDATE` against another user's rows affects none.

---

## 2. The workout module

### 2.1 What it stores

Five tables carry the training side:

| Table | Holds |
| --- | --- |
| `injuries` | The catalog of injuries, admin-maintained |
| `exercises` | The catalog of exercises, admin-maintained |
| `exercise_injuries` | Which exercise strains which injury |
| `user_injuries` | Which injuries a user currently has |
| `workout_logs` | One row per exercise performed |

`exercise_injuries` and `user_injuries` are the two halves of the safety rule.
An exercise is unsafe for a user when a row exists in each that shares an
`injury_id`. Both use composite primary keys, so the same pair cannot be
recorded twice.

### 2.2 Deletion behaviour is not uniform

Everything a user owns cascades when the account is deleted — their logs,
their weigh-ins, their recorded injuries. But `workout_logs.exercise_id`
deliberately has no `ON DELETE CASCADE`. Removing an exercise from the catalog
should not silently erase the training history of everyone who ever did it.
The foreign key refuses the delete instead, and the admin page turns that
refusal into an explanation.

### 2.3 The safety trigger

The rule that an injured user cannot log an exercise that strains the injury
lives in the database, as a `BEFORE INSERT` trigger on `workout_logs`:

```sql
SELECT string_agg(i.name, ', ' ORDER BY i.name)
  INTO v_injuries
  FROM user_injuries ui
  JOIN exercise_injuries ei ON ei.injury_id = ui.injury_id
  JOIN injuries i           ON i.injury_id  = ui.injury_id
 WHERE ui.user_id     = NEW.user_id
   AND ei.exercise_id = NEW.exercise_id;

IF v_injuries IS NOT NULL THEN
    RAISE EXCEPTION 'Unsafe workout: % strains your recorded injury (%)',
        v_exercise, v_injuries
        USING ERRCODE = 'check_violation';
END IF;
```

Three choices are worth defending.

**Why the database and not the route.** The form already hides unsafe
exercises, and the API could check before inserting. Both of those can be
bypassed — the API by a direct HTTP request, the application entirely by a
`psql` session. A trigger cannot be gone around: every path into the table
goes through it. The checks in the user interface are a convenience; this is
the boundary.

**Why `BEFORE` and not `AFTER`.** A `BEFORE` trigger prevents the write.
An `AFTER` trigger would insert the row and rely on the rollback to undo it,
which works but consumes a value from the serial sequence each time, leaving
visible gaps in the ids.

**Why `string_agg` rather than `EXISTS`.** An `EXISTS` test would be simpler
but could only report that something was wrong. Collecting the names means the
error says exactly which injuries are involved, and that message is passed
through to the user unchanged.

### 2.4 The procedure

`log_workout` does the two things that must happen together:

```sql
INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_kg, logged_on)
VALUES (p_user_id, p_exercise_id, p_sets, p_reps, p_weight_kg, p_logged_on);

UPDATE users
   SET last_workout_on = p_logged_on
 WHERE user_id = p_user_id
   AND (last_workout_on IS NULL OR last_workout_on < p_logged_on);
```

The guard on the `UPDATE` means back-filling a session from last week cannot
drag a more recent date backwards.

The route calls it inside a transaction. If the trigger fires, both statements
roll back together: no log row, and `last_workout_on` untouched. Tested
directly — after a refused workout the user's log count is unchanged and the
streak date is unmoved.

### 2.5 The view

`v_weekly_progress` aggregates each user's logs into weeks:

```sql
SELECT w.user_id,
       date_trunc('week', w.logged_on)::date      AS week_start,
       COUNT(*)                                   AS workout_count,
       SUM(w.sets * w.reps * w.weight_kg)         AS total_volume_kg
FROM workout_logs w
GROUP BY w.user_id, date_trunc('week', w.logged_on);
```

Volume — sets times reps times weight — is the standard measure of training
load, and is more informative than a count of sessions. Weeks are keyed on
their Monday so they sort correctly and line up with the reporting query.

The view is declared `WITH (security_invoker = true)`. This matters more than
it looks: a view otherwise executes with its *owner's* privileges, and the
owner is exempt from row-level security. Without that clause the view returned
every user's weeks while `workout_logs` underneath was correctly protected —
a leak invisible from the interface, since each user only ever requested their
own. Section 4.4 covers how it was found.

### 2.6 Keeping the graph in step

PostgreSQL is the source of truth. After a workout commits, the application
records the same fact in Neo4j as a weighted edge:

```cypher
MATCH (u:User {id: $userId}), (e:Exercise {id: $exerciseId})
MERGE (u)-[r:DID]->(e)
ON CREATE SET r.count = 1
ON MATCH  SET r.count = coalesce(r.count, 0) + 1
```

The ordering is deliberate. The graph write happens after the commit, and a
failure there is logged but does not fail the request. A workout that was
validated and saved must not be undone because a second database was briefly
unreachable, and the sync script can repair a missing edge later.

The same applies to injuries: adding or removing one writes or deletes the
`HAS_INJURY` edge, so the graph's answer changes as soon as the profile does.

### 2.7 The safe-exercise query

The question "which exercises are safe for me" is a question about the absence
of a path:

```cypher
MATCH (e:Exercise)
WHERE NOT EXISTS {
  MATCH (u:User {id: $userId})-[:HAS_INJURY]->(:Injury)<-[:STRAINS]-(e)
}
RETURN e.id, e.name, e.muscleGroup
```

In SQL the same question needs a `NOT EXISTS` over a two-table join, and grows
more awkward as the chain lengthens. In Cypher the pattern is written the way
it is drawn.

The endpoint fails closed. If Neo4j cannot answer, the response is 503 and the
page says the list is unavailable, rather than falling back to showing
everything. An unfiltered list is precisely how someone ends up squatting on
an injured knee, so no list is the safer failure.

The two databases were checked against each other: the SQL flag and the graph
query independently identify the same six unsafe exercises for the seeded
knee-injury user.

---

## 3. Advanced SQL

### 3.1 Correlated subquery — who is losing weight

```sql
SELECT u.user_id, u.full_name,
       (SELECT p.weight_kg FROM progress_logs p
         WHERE p.user_id = u.user_id
         ORDER BY p.logged_on ASC  LIMIT 1) AS first_weight_kg,
       (SELECT p.weight_kg FROM progress_logs p
         WHERE p.user_id = u.user_id
         ORDER BY p.logged_on DESC LIMIT 1) AS latest_weight_kg
  FROM users u
 WHERE (SELECT p.weight_kg FROM progress_logs p
         WHERE p.user_id = u.user_id
         ORDER BY p.logged_on DESC LIMIT 1)
     < (SELECT p.weight_kg FROM progress_logs p
         WHERE p.user_id = u.user_id
         ORDER BY p.logged_on ASC  LIMIT 1)
 ORDER BY change_kg ASC;
```

The subqueries are correlated because each references `u.user_id` from the
outer query, so each is evaluated once per user rather than once for the whole
table.

Ordering by `logged_on` and taking one row is deliberate, rather than using
`MIN` and `MAX` of the weight. The question is which reading came *first and
last in time*, not which was smallest and largest — a user who lost weight and
then regained some should still show their actual latest figure.

Result against the seed data: five users, Rohan Mehta down 1.3 kg, Aarav
Sharma 1.1 kg, Meera Iyer 0.9 kg, Vikram Das 0.5 kg, Sana Khan 0.1 kg.

### 3.2 GROUP BY with HAVING — who trained three or more times this week

```sql
SELECT u.user_id, u.full_name,
       COUNT(*)                           AS workouts_this_week,
       SUM(w.sets * w.reps * w.weight_kg) AS total_volume_kg
  FROM workout_logs w
  JOIN users u ON u.user_id = w.user_id
 WHERE w.logged_on >= date_trunc('week', CURRENT_DATE)::date
 GROUP BY u.user_id, u.full_name
HAVING COUNT(*) >= 3
 ORDER BY workouts_this_week DESC, total_volume_kg DESC;
```

The distinction between `WHERE` and `HAVING` is the point of the query.
`WHERE` filters individual rows before grouping — here, restricting to this
week's logs. `HAVING` filters the groups afterwards. The count of three cannot
be tested in `WHERE`, because at that stage the groups do not yet exist.

Both queries are shown on `/admin/insights` with their SQL beside the results,
so they are visible in the running application rather than only in a file.

### 3.3 Constraints as logic

The schema refuses bad data rather than trusting the application to screen it:

```sql
CONSTRAINT chk_workout_logs_reps   CHECK (reps BETWEEN 1 AND 500),
CONSTRAINT chk_workout_logs_date   CHECK (logged_on <= CURRENT_DATE),
CONSTRAINT chk_progress_logs_weight CHECK (weight_kg BETWEEN 20 AND 400),
CONSTRAINT uq_progress_logs_per_day UNIQUE (user_id, logged_on)
```

The `UNIQUE` on `(user_id, logged_on)` enforces one weigh-in per user per day,
which keeps the dashboard's trend line to a single point per date. Rather than
rejecting a second entry, the route upserts, so logging again the same day
corrects the earlier figure.

`height_cm` is added by `ALTER TABLE` rather than declared inline, because it
is collected after registration rather than at signup — the `ALTER` reflects
how the column came to exist.

Eight invalid-value cases were tested and all are refused by the database:
an invalid role, a malformed email, a duplicate email, zero reps, an
impossible weight, an out-of-range height, a future date and an invalid
severity.

---

## 4. Test results

All tests are reproducible. `scripts/verify-report.sh` produces the output in
`docs/test-results.txt`; `scripts/test-auth.sh`, `scripts/test-workouts.sh`
and `scripts/test-admin-and-safety.sh` cover the modules in more detail. Each
prints the evidence behind a result rather than only a verdict, and the
verification script removes the rows it creates so it can be re-run against
unchanged seed data.

### 4.1 Registration and login

| Check | Result |
| --- | --- |
| Register a new account | 201, session cookie set, `HttpOnly` |
| Register the same email again | 409, from the `UNIQUE` constraint |
| Login, wrong password | 401 `{"error":"Email or password is incorrect"}` |
| Login, email that does not exist | 401, **byte-identical response** |
| Login, correct password | 200 |

The identical responses are the point of the fourth row: the form cannot be
used to find out which addresses are registered.

### 4.2 A normal user is refused an admin page

| Check | Result |
| --- | --- |
| `GET /admin/exercises` as a user | redirect to `/dashboard?denied=admin` |
| `GET /api/admin/exercises` as a user | 403 |
| `GET /api/admin/exercises` signed out | 401 |
| `GET /admin/exercises` as admin | 200 |

The second row matters most: it shows the API enforces the role itself rather
than relying on the page having been blocked.

### 4.3 An unsafe workout is rejected

Aarav Sharma has Knee Pain recorded; Barbell Squat strains Knee Pain.

```
-> workout_logs for this user before: 7
-> POST /api/workouts { exerciseId: 1, sets: 3, reps: 10, weightKg: 60 }
   HTTP 409
   Unsafe workout: Barbell Squat strains your recorded injury (Knee Pain)
-> workout_logs for this user after: 7
-> POST /api/workouts { exerciseId: 13, ... }   (strains nothing)
   HTTP 201
```

The log count is unchanged, confirming that the procedure's insert and its
update of `last_workout_on` rolled back together. The safe exercise still logs,
so the rule is specific rather than a blanket refusal.

The same refusal applies to a direct insert, because the rule is a trigger:

```
INSERT INTO workout_logs (user_id, exercise_id, sets, reps, weight_kg)
VALUES (2, 1, 3, 10, 60);
ERROR:  Unsafe workout: Barbell Squat strains your recorded injury (Knee Pain)
SQLSTATE 23514
```

A further test removes the injury from the profile, logs the same exercise
successfully, restores the injury, and sees it refused again — showing the
rule is evaluated against current data rather than a fixed list.

### 4.4 Row-level security hides another user's rows

```
as the owning role (no switch)      : 50 rows
as eirene_user, app.user_id = 2     : 8 rows, user_ids visible: 2
as eirene_user, app.user_id = 3     : 6 rows, user_ids visible: 3
role switched, app.user_id unset    : 0 rows (fails closed)
user 2 asking for user 3 rows       : 0 rows
as eirene_admin (reporting)         : 50 rows
admin UPDATE on another user        : 0 rows affected (read-only)
```

The first line is the documented owner exemption. The fourth is the important
one: a transaction that switched role but never set `app.user_id` sees nothing
at all, so a route that forgot to use `withUser()` fails safe rather than
returning the whole table.

**A defect this testing found.** The policies originally compared
`current_setting('app.user_id', true)::int`. On a connection where the setting
had never been used, that is `NULL`, the comparison is not true, and the
statement returns nothing — as intended. But on a *pooled* connection that had
already served a request, PostgreSQL remembers the setting name and resets its
value to an empty string rather than to `NULL`. `''::int` raises
`22P02 invalid input syntax for type integer`, so the same query failed with
an opaque error instead of quietly returning nothing.

No data was exposed either way, but the behaviour did not match what the file
claimed. Wrapping the read in `NULLIF(..., '')` turns the empty string back
into `NULL` and the policy now fails closed in both cases. The fault only
appears on a reused connection, which is exactly what a connection pool
provides — the first round of testing used fresh connections and missed it.

**A second defect, found the same way.** `v_weekly_progress` was returning
every user's weeks despite `workout_logs` being protected, because a view
executes with its owner's privileges by default and the owner is exempt from
the policies. Declaring the view `WITH (security_invoker = true)` makes it run
as the caller. Confirmed afterwards: user 2 sees only their weeks, user 3 only
theirs.

Both faults shared a shape worth noting — the protection looked correct from
the application, because each user only ever asked for their own data. Neither
would have surfaced without testing the database layer directly.

### 4.5 Summary

| Suite | Checks | Result |
| --- | --- | --- |
| `verify-report.sh` | 15 | all pass |
| `test-auth.sh` | 16 | all pass |
| `test-workouts.sh` | 18 | all pass |
| `test-admin-and-safety.sh` | 16 | all pass |
| Role and policy checks | 10 | all pass |
| Schema constraint checks | 8 | all refused as expected |
