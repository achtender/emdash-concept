import type { TaxonomyTerm } from "emdash";

/** Depth-first flatten of a taxonomy term tree, parents before children. */
export function flattenTerms(terms: readonly TaxonomyTerm[] | null | undefined): TaxonomyTerm[] {
	if (!Array.isArray(terms)) return [];
	return terms.flatMap((term) => [term, ...flattenTerms(term.children)]);
}
