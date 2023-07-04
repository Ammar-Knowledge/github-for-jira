const { pathsToModuleNameMapper } = require("ts-jest");
const { compilerOptions } = require("./tsconfig.json");

module.exports = {
	"testEnvironment": "node",
	"testTimeout": 10000,
	"setupFilesAfterEnv": [
		"<rootDir>/test/setup/setup.ts"
	],
	"snapshotResolver": "<rootDir>/test/snapshots/snapshot-resolver.ts",
	"transform": {
		"^.+\\.tsx?$": "ts-jest"
	},
	"moduleFileExtensions": [
		"ts",
		"tsx",
		"js",
		"jsx",
		"json",
		"node"
	],
	"modulePathIgnorePatterns": ["<rootDir>/spa"],
	"testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
	"collectCoverage": true,
	"coverageDirectory": "coverage",
	"collectCoverageFrom": [
		"src/**/*.{ts,tsx}",
		"!src/**/*.d.ts"
	],
	"maxConcurrency": 1,
	"maxWorkers": 1,
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/' } ),
};
