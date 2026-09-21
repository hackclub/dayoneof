// Prints a Slack app manifest with the right scopes, events and request URL already filled in —
// paste it into api.slack.com/apps → Create New App → From an app manifest. Run it once per
// environment to get the two apps.
//
//   node --env-file=.env scripts/slack_manifest.js dev
//   node --env-file=.env scripts/slack_manifest.js prod > slack_prod.json
//
// The site has to be reachable at PUBLIC_SITE_URL before importing: Slack verifies the request URL
// during the import itself. Socket mode is pinned off on purpose — with it on, Slack verifies the
// URL fine and then delivers zero events over HTTP.

/**
 * Mirrors config.js: NAME_DEV / NAME_PROD wins, unsuffixed name is the shared fallback.
 * @param {string} name
 * @param {'dev' | 'prod'} appEnv
 */
function envVar(name, appEnv) {
	const value = process.env[`${name}_${appEnv.toUpperCase()}`] || process.env[name];
	if (!value) throw new Error(`missing required env var: ${name} (APP_ENV=${appEnv})`);
	return value;
}

const BOT_SCOPES = [
	'app_mentions:read',
	'channels:history',
	'channels:manage',
	'chat:write',
	'groups:history',
	'groups:write',
	'im:write',
	'reactions:write',
	'users:read',
	'users:read.email'
];

const BOT_EVENTS = ['app_mention', 'member_joined_channel', 'message.channels', 'message.groups'];

/**
 * @param {string} name
 * @param {string} siteUrl
 */
function manifest(name, siteUrl) {
	return {
		display_information: {
			name,
			description: 'Post a video every day, keep the streak alive',
			background_color: '#1f1f1f'
		},
		features: {
			bot_user: { display_name: name, always_online: true },
			app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false }
		},
		oauth_config: { scopes: { bot: BOT_SCOPES } },
		settings: {
			event_subscriptions: {
				request_url: `${siteUrl.replace(/\/$/, '')}/api/slack/events`,
				bot_events: BOT_EVENTS
			},
			org_deploy_enabled: false,
			socket_mode_enabled: false,
			token_rotation_enabled: false
		}
	};
}

function main() {
	const arg = (process.argv[2] ?? process.env.APP_ENV ?? 'dev').trim().toLowerCase();
	if (arg !== 'dev' && arg !== 'prod') throw new Error('usage: slack_manifest.js [dev|prod]');
	const appEnv = /** @type {'dev' | 'prod'} */ (arg);

	const name = process.argv[3] ?? (appEnv === 'prod' ? 'dayoneof' : 'dayoneof-dev');
	console.log(JSON.stringify(manifest(name, envVar('PUBLIC_SITE_URL', appEnv)), null, 2));
}

try {
	main();
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exitCode = 1;
}
