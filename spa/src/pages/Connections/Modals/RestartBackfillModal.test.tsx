import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import RestartBackfillModal from "./RestartBackfillModal";
import SubscriptionManager from "../../../services/subscription-manager";

jest.mock("../../../services/subscription-manager");

const sampleSubscription = {
	app_slug: "string",
	syncWarning: "warning",
	id: 1,
	account:  {
		login: "sample",
		id: 1,
		avatar_url: "string",
	},
	repository_selection: "string",
	app_id: 1,
	target_id: 1,
	target_type: "string",
	created_at: "string",
	updated_at: "string",
	syncStatus: "string",
	totalNumberOfRepos: 2,
	numberOfSyncedRepos: 2,
	jiraHost: "https://test-jira.atlassian.net",
	isGlobalInstall: true,
	backfillSince: null,
	subscriptionId: 1,
	html_url: "html_url"
};
const isModalOpened = jest.fn();
const refetch = jest.fn();

test("Restart backfill Modal", async () => {
	render(
		<BrowserRouter>
			<RestartBackfillModal subscription={sampleSubscription} setIsModalOpened={isModalOpened} refetch={refetch} />
		</BrowserRouter>
	);

	expect(screen.getByText("Backfill your data")).toBeInTheDocument();
	// expect(screen.queryByTestId("backfill-datepicker")).toBeInTheDocument();
	expect(screen.getByRole("checkbox", {name: "Restart the backfill from today to this date"})).toBeInTheDocument();

	await userEvent.click(screen.getByText("Cancel"));
	expect(isModalOpened).toBeCalled();
	expect(refetch).not.toBeCalled();
});

test("Restart backfill Modal", async () => {

	jest.mocked(SubscriptionManager).syncSubscription = jest.fn().mockReturnValue(Promise.resolve(true));
	render(
		<BrowserRouter>
			<RestartBackfillModal subscription={sampleSubscription} setIsModalOpened={isModalOpened} refetch={refetch} />
		</BrowserRouter>
	);

	expect(screen.getByText("Backfill your data")).toBeInTheDocument();
	// expect(screen.queryByTestId("backfill-datepicker")).toBeInTheDocument();
	expect(screen.getByRole("checkbox", {name: "Restart the backfill from today to this date"})).toBeInTheDocument();

	await userEvent.click(screen.getByText("Backfill data"));
	/**
	 * Called twice, once when the loading is set to true,
	 * and later after getting the response from the API request
	 */
	expect(isModalOpened).toBeCalledTimes(2);
	expect(refetch).toBeCalled();
});
