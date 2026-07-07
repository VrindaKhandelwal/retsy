// Shared reminder scheduling, used by confirm-purchase (V1 forwarding flow)
// and gmail-sync (V2 auto-detected purchases).

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Schedule reminders: 7/3/1 days before the deadline. Skip any reminder
// whose send time has already passed so we don't immediately fire a backlog
// of emails for a deadline that's already close. Returns an error message
// string on failure (soft — the purchase itself is unaffected), else null.
export async function scheduleReminders(
  supabase: any,
  purchaseId: string,
  returnDeadline: string
): Promise<string | null> {
  const reminderPlan: { type: "7_day" | "3_day" | "1_day"; offset: number }[] = [
    { type: "7_day", offset: -7 },
    { type: "3_day", offset: -3 },
    { type: "1_day", offset: -1 },
  ];

  const now = new Date();
  const rows = reminderPlan
    .map((r) => ({
      purchase_id: purchaseId,
      reminder_type: r.type,
      send_at: addDays(returnDeadline, r.offset).toISOString(),
    }))
    .filter((r) => new Date(r.send_at) > now);

  // Clear any previously scheduled (unsent) reminders for this purchase
  // first, in case the deadline was edited and we're rescheduling — even
  // when the new deadline leaves nothing to schedule, the old reminders
  // point at a deadline that no longer exists.
  await supabase
    .from("reminders")
    .delete()
    .eq("purchase_id", purchaseId)
    .is("sent_at", null);

  if (rows.length === 0) {
    return null;
  }

  const { error } = await supabase
    .from("reminders")
    .upsert(rows, { onConflict: "purchase_id,reminder_type" });

  if (error) {
    console.error("reminder insert error", error);
    return "Reminders failed to schedule.";
  }
  return null;
}
