// Convenience wrapper that re-exports the raw policy text
// and provides small render helpers so callers have a stable import.
import { termOfServices } from "./term-of-services"
import { privacyPolicy } from "./privacy-policy"

export function renderTerms(options?: { effectiveDate?: string }) {
	// The source text already contains an Effective Date line; if caller
	// supplied an override, do a simple replacement, otherwise return raw.
	if (options?.effectiveDate) {
		return termOfServices.replace(/Effective Date: .*\n/, `Effective Date: ${options.effectiveDate}\n`)
	}
	return termOfServices
}

export function renderPrivacy(options?: { effectiveDate?: string }) {
	if (options?.effectiveDate) {
		return privacyPolicy.replace(/Effective Date: .*\n/, `Effective Date: ${options.effectiveDate}\n`)
	}
	return privacyPolicy
}

export default renderTerms
