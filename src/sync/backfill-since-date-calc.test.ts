import { calcNewBackfillSinceDate } from "./backfill-since-date-calc";

const EMPTY_DATE = undefined;
const MIDDLE_DATE = new Date();
const EARLIER_DATE = new Date(MIDDLE_DATE.getTime() - 1000);
const RECENT_DATE = new Date(MIDDLE_DATE.getTime() + 1000);

describe("Calculating backfill since date", () => {
	describe("For partial sync", () => {
		it("should keep existing backfillSince date if new backfill date is empty", () => {
			expect(calcNewBackfillSinceDate(MIDDLE_DATE, EMPTY_DATE, "partial", undefined)).toEqual(MIDDLE_DATE);
		});
		it("should keep existing backfillSince date if new backfill date is earlier", () => {
			expect(calcNewBackfillSinceDate(MIDDLE_DATE, EARLIER_DATE, "partial", undefined)).toEqual(MIDDLE_DATE);
		});
		it("should keep existing backfillSince date if new backfill date is recent", () => {
			expect(calcNewBackfillSinceDate(MIDDLE_DATE, RECENT_DATE, "partial", undefined)).toEqual(MIDDLE_DATE);
		});
	});
	describe("For full sync", () => {
		describe("on initial new sync", () => {
			it("should take whatever supplied in the new backfill date", () => {
				expect(calcNewBackfillSinceDate(EMPTY_DATE, MIDDLE_DATE, "full", true)).toEqual(MIDDLE_DATE);
			});
		});
		describe("On non-initial sync, with empty existingBackfillSince date", () => {
			it("should keep existing backfillSince date if new backfill date is empty", () => {
				expect(calcNewBackfillSinceDate(EMPTY_DATE, EMPTY_DATE, "full", false)).toEqual(EMPTY_DATE);
			});
			it("should keep existing backfillSince date if new backfill date is recent", () => {
				expect(calcNewBackfillSinceDate(EMPTY_DATE, RECENT_DATE, "full", false)).toEqual(EMPTY_DATE);
			});
		});
		describe("On non-initial sync, with existing backfillSince date", () => {
			it("should use new backfill date (empty) if new backfill date is empty", () => {
				expect(calcNewBackfillSinceDate(RECENT_DATE, EMPTY_DATE, "full", false)).toEqual(EMPTY_DATE);
			});
			it("should keep existing backfillSince date if new backfill date is recent", () => {
				expect(calcNewBackfillSinceDate(EARLIER_DATE, RECENT_DATE, "full", false)).toEqual(EARLIER_DATE);
			});
			it("should use new backfill date if new backfillSince is earlier", () => {
				expect(calcNewBackfillSinceDate(RECENT_DATE, EARLIER_DATE, "full", false)).toEqual(EARLIER_DATE);
			});
		});
	});
});
