import type { Session } from "@/lib/auth";
import { withUser } from "@/lib/db";
import GoalAllergiesForm from "./goal-allergies-form";

/** The goal and allergies part of the profile page. Add it to the page with
 *  <GoalAllergiesSection session={session} />. */
export default async function GoalAllergiesSection({ session }: { session: Session }) {
  const data = await withUser(session, async (q) => {
    const goals = await q<{ goal_id: number; name: string }>(
      `SELECT goal_id, name FROM goals ORDER BY goal_id`
    );
    const allergens = await q<{ allergen_id: number; name: string }>(
      `SELECT allergen_id, name FROM allergens ORDER BY name`
    );
    const me = await q<{ goal_id: number | null }>(
      `SELECT goal_id FROM users WHERE user_id = $1`,
      [session.userId]
    );
    const mine = await q<{ allergen_id: number; name: string; severity: string }>(
      `SELECT ua.allergen_id, a.name, ua.severity
         FROM user_allergies ua
         JOIN allergens a ON a.allergen_id = ua.allergen_id
        WHERE ua.user_id = $1
        ORDER BY a.name`,
      [session.userId]
    );

    return {
      goals: goals.rows,
      allergens: allergens.rows,
      currentGoalId: me.rows[0]?.goal_id ?? null,
      mine: mine.rows,
    };
  });

  return (
    <section className="mb-10">
      <h2 className="mb-3 font-medium">Goal and allergies</h2>
      <GoalAllergiesForm
        goals={data.goals}
        currentGoalId={data.currentGoalId}
        allergens={data.allergens}
        mine={data.mine}
      />
    </section>
  );
}