import { checkOff, slotAction } from '#lib/server/notification_actions.ts';
import { doneAtSubject } from '#lib/server/push.ts';

// Called by the done button of a notification the phone's alarm showed
export async function POST({ params, request }) {
    const { occurrence } = await slotAction(params, request, doneAtSubject)
    return checkOff(occurrence)
}
