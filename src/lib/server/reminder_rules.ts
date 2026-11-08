import { firstOccurrence, normalizeRule } from '#lib/reminders.ts';
import type { ReminderRule } from '#lib/schemas/reminders.ts';
import { error } from '@sveltejs/kit';

// What a reminder stores for the rule someone picked
export function ruleFields(sent: ReminderRule) {
    const rule = normalizeRule(sent)
    if(rule.repeat === 'weekdays' && !rule.weekdays.length) error(400, 'Pick at least one day.')
    if(rule.until && new Date(rule.until) < new Date(rule.at)) error(400, 'The end lies before the start.')

    // A time already passed is kept as finished
    const next = firstOccurrence(rule, new Date())

    return { ...rule, until: rule.until && new Date(rule.until).toISOString(), at: new Date(rule.at).toISOString(), next: next?.toISOString() ?? '' }
}
