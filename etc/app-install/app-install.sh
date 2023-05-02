# Checks to see if required env vars are set
if [[ -z "$JIRA_ADMIN_EMAIL" ]] || [[ -z "$JIRA_ADMIN_API_TOKEN" ]] || [[ -z "$ATLASSIAN_URL" ]] || [[ -z "$APP_KEY" ]]
then
  echo "Missing environment variables from .env - Please fill in 'JIRA_ADMIN_EMAIL', 'JIRA_ADMIN_API_TOKEN', 'ATLASSIAN_URL' and 'APP_KEY' to be able to have the app install automatically."
  exit 1
fi

curl --head -X GET -f --retry 30 --retry-all-errors --retry-delay 5 http://app:8080/healthcheck

# Fetching the new ngrok URL, not fetching the one from the .env because its not updated
BASE_URL=$((curl -fs http://ngrok:4040/api/tunnels || curl -fs http://localhost:4040/api/tunnels) | jq -r '.tunnels[] | select(.proto == "https") | .public_url')
ID="${APP_KEY##*.}"
# Uninstalling the app first
curl -s -X DELETE -u "$JIRA_ADMIN_EMAIL:$JIRA_ADMIN_API_TOKEN" -H "Content-Type: application/vnd.atl.plugins.install.uri+json" "${ATLASSIAN_URL}/rest/plugins/1.0/${APP_KEY}-key"
echo "Uninstalling old version of the app"

# Getting the UPM token first, which will be used for app installation
UPM_TOKEN=$(curl -s -u "$JIRA_ADMIN_EMAIL:$JIRA_ADMIN_API_TOKEN" --head "${ATLASSIAN_URL}/rest/plugins/1.0/" | fgrep upm-token | cut -c 12- | tr -d '\r\n')

# Installing the app
curl -s  -o /dev/null -u "$JIRA_ADMIN_EMAIL:$JIRA_ADMIN_API_TOKEN" -H "Content-Type: application/vnd.atl.plugins.install.uri+json" -X POST "${ATLASSIAN_URL}/rest/plugins/1.0/?token=${UPM_TOKEN}" -d "{\"pluginUri\":\"${BASE_URL}/jira/atlassian-connect.json\", \"pluginName\": \"Github for Jira (${ID})\"}"
echo ""
echo "The app has been successfully installed."
echo "
*********************************************************************************************************************
IF YOU ARE USING A FREE NGROK ACCOUNT, PLEASE DO THIS STEP FIRST!!!
Before going to your app, please open this URL first: ${BASE_URL}.
This will open up the ngrok page, don't worry just click on the Visit button.
That's it, you're all ready!
*********************************************************************************************************************
*********************************************************************************************************************
Now open your app in this URL: ${ATLASSIAN_URL}/plugins/servlet/ac/${APP_KEY}/gh-addon-admin
*********************************************************************************************************************
"
