/**
 * Builds the public price list.
 *
 * A service has one primary category and, optionally, further categories it is
 * "also listed under". Only the primary is used by the POS, commissions and the
 * revenue-by-category report, so a treatment can appear under two headings on
 * the price list without its takings being counted twice.
 */

type MenuService = { id: string; sortRank: number; name: string };

type MenuCategory<S extends MenuService> = {
  id: string;
  name: string;
  /** Services whose primary category this is. */
  services: S[];
  /** Services listed here as well. */
  alsoListed: S[];
};

export function buildServiceMenu<S extends MenuService>(
  categories: MenuCategory<S>[],
): { id: string; name: string; services: S[] }[] {
  return categories
    .map((cat) => {
      const seen = new Set<string>();
      const services = [...cat.services, ...cat.alsoListed]
        // A service could be both its own category's and listed there again;
        // show it once.
        .filter((s) => !seen.has(s.id) && seen.add(s.id))
        // Sorted together, so an also-listed service takes its place in the
        // list rather than being appended after it. Name breaks ties, which
        // are otherwise ordered arbitrarily by Postgres.
        .sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name));
      return { id: cat.id, name: cat.name, services };
    })
    .filter((cat) => cat.services.length > 0);
}
