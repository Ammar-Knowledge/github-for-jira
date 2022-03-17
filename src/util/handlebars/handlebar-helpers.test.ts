/* eslint-disable @typescript-eslint/no-explicit-any */

import { replaceSpaceWithHyphenHelper, toLowercaseHelper } from "./handlebar-helpers";

describe("Handlebar Helpers", () => {
	describe("toLowercaseHelper", () => {
		it("should return empty string with no parameter", () => {
			expect(toLowercaseHelper()).toEqual("");
		});

		it("should return empty string with non stringifyable or falsy parameter", () => {
			expect(toLowercaseHelper(undefined)).toEqual("");
			expect(toLowercaseHelper(null as any)).toEqual("");
			expect(toLowercaseHelper({ } as any)).toEqual("");
		});

		it("should return the lowercase string of any stringifyable object", () => {
			expect(toLowercaseHelper("FOO")).toEqual("foo");
			expect(toLowercaseHelper("BaR")).toEqual("bar");
			expect(toLowercaseHelper(10943 as any)).toEqual("10943");
			expect(toLowercaseHelper(new Date(0) as any)).toMatch("thu jan 01 1970");
		});
	});

	describe("replaceSpaceWithHyphenHelper", () => {
		it("should return empty string with no parameter", () => {
			expect(replaceSpaceWithHyphenHelper()).toEqual("");
		});

		it("should return empty string with non stringifyable or falsy parameter", () => {
			expect(replaceSpaceWithHyphenHelper(undefined)).toEqual("");
			expect(replaceSpaceWithHyphenHelper(null as any)).toEqual("");
			expect(replaceSpaceWithHyphenHelper({ } as any)).toEqual("");
		});

		it("should return the kebab case string for any stringifyable object", () => {
			expect(replaceSpaceWithHyphenHelper("FOO bar")).toEqual("FOO-bar");
			expect(replaceSpaceWithHyphenHelper("baR")).toEqual("baR");
			expect(replaceSpaceWithHyphenHelper(10943 as any)).toEqual("10943");
			expect(replaceSpaceWithHyphenHelper(new Date(0) as any)).toMatch("Thu-Jan-01-1970");
		});
	});
});