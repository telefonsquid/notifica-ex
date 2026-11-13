import { slotAction, snoozeChoice, snoozeFor } from '#lib/server/notification_actions.ts';
import { snoozeAtSubject } from '#lib/server/push.ts';

// Called by the snooze buttons of a notification the phone's alarm showed
export async function POST({ params, request }) {
    const { occurrence, extra } = await slotAction(params, request, snoozeAtSubject, snoozeChoice)
    return snoozeFor(occurrence, extra.until)
}
