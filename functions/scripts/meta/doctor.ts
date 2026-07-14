/**
 * Preflight.
 *
 * Almost every confusing Meta failure is one of a handful of unmet prerequisites, and the
 * API reports them as an undifferentiated "error 100". Each check here answers a question
 * that would otherwise cost several turns of guessing, and says which human action fixes
 * it — because most of these cannot be fixed from code at all.
 *
 * Run this first, every session.
 */
import { MetaClient } from './client';
import { Ctx } from './context';
import { Config } from './env';
import { CliError } from './errors';
import { line, money, ok, warn } from './output';

type Status = 'ok' | 'fail' | 'warn';

interface Check {
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

async function attempt<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: CliError }> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error: error as CliError };
  }
}

export async function doctor(ctx: Ctx): Promise<void> {
  const { client, config } = ctx;
  const checks: Check[] = [];

  // 1. Is the token alive, and who is it?
  const me = await attempt(() => client.get('me', { fields: 'id,name' }));
  if (me.error) {
    checks.push({
      name: 'access token',
      status: 'fail',
      detail: me.error.message,
      fix: 'Generate a System User token: Business Settings → Users → System Users → Generate Token. Put it in META_ACCESS_TOKEN in functions/.env.local.',
    });
    // Everything downstream needs the token; there is no point continuing.
    return render(checks, config.adAccountId);
  }
  checks.push({
    name: 'access token',
    status: 'ok',
    detail: `valid — acting as ${(me.value as any)?.name ?? (me.value as any)?.id}`,
  });

  // 2. Scopes. ads_read alone will read fine and then fail on the first write.
  const scopes = await checkScopes(client);
  checks.push(scopes);

  // 3. The ad account: reachable, active, and what currency does it charge in?
  const account = await attempt(() =>
    client.get(config.adAccountId, {
      fields: 'name,currency,account_status,min_daily_budget,amount_spent,timezone_name',
    }),
  );
  if (account.error) {
    checks.push({
      name: 'ad account',
      status: 'fail',
      detail: `${config.adAccountId}: ${account.error.message}`,
      fix: account.error.payload.hint ?? 'Check META_AD_ACCOUNT_ID (it needs the act_ prefix) and that the System User has a role on that ad account.',
    });
  } else {
    const acct = account.value as any;
    const active = Number(acct.account_status) === 1;
    checks.push({
      name: 'ad account',
      status: active ? 'ok' : 'fail',
      detail:
        `${acct.name} · ${acct.currency} · min daily budget ${money(acct.min_daily_budget, acct.currency)} · ${acct.timezone_name}` +
        (active ? '' : ` · STATUS ${acct.account_status} (not active)`),
      fix: active ? undefined : 'The ad account is not active — usually unpaid billing or a disabled account. Fix it in Ads Manager.',
    });
    if (acct.currency && acct.currency !== 'USD') {
      warn(`Ad account bills in ${acct.currency}, not USD. Budgets are still integer minor units of ${acct.currency}.`);
    }
  }

  // 4. The Page. This is the one that blocks a first launch — creatives cannot exist
  //    without it, and there is no default.
  checks.push(await checkPage(client, config.pageId));

  // 5. Is the app linked, and does it have SKAN slots left?
  checks.push(...(await checkApp(client, config)));

  // 6. Custom Audience TOS — a human must click it; Claude cannot.
  checks.push(await checkAudienceTos(client, config.adAccountId));

  // 7. The Conversions API half. Not needed to run ads, which is exactly why it went
  //    unnoticed that it was never configured — `doctor` was green and no purchase event
  //    had ever reached Meta. Without a dataset id there is no endpoint to POST to.
  if (!config.datasetId) {
    checks.push({
      name: 'dataset (CAPI)',
      status: 'warn',
      detail: 'META_DATASET_ID not set — the Conversions API cannot send a single event',
      fix:
        'Not needed to run ads, but purchases (including renewals) reach Meta ONLY through it. ' +
        'Events Manager → Data Sources → PickleGo → Settings → Dataset ID. Run: npm run meta -- datasets',
    });
  } else {
    const dataset = await attempt(() => client.get(config.datasetId!, { fields: 'id,name' }));
    checks.push(
      dataset.error
        ? {
            name: 'dataset (CAPI)',
            status: 'fail',
            detail: `${config.datasetId} is set but not readable: ${dataset.error.message}`,
            fix: 'Check the id is the app-events dataset from Events Manager, not the app id and not a web pixel.',
          }
        : {
            name: 'dataset (CAPI)',
            status: 'ok',
            detail: `${(dataset.value as any).name ?? ''} (${config.datasetId})`,
          },
    );
  }
  if (!config.appSecret) {
    checks.push({
      name: 'appsecret_proof',
      status: 'warn',
      detail: 'META_APP_SECRET not set — requests are not signed',
      fix: 'Optional but recommended: with it, a stolen token alone cannot call the API. App Dashboard → Settings → Basic.',
    });
  }

  render(checks, config.adAccountId);
}

async function checkScopes(client: MetaClient): Promise<Check> {
  const res = await attempt(() => client.get('me/permissions'));
  if (res.error) {
    return { name: 'token scopes', status: 'warn', detail: 'could not read permissions (normal for some System User tokens)' };
  }
  const granted = new Set(
    ((res.value as any)?.data ?? [])
      .filter((p: any) => p.status === 'granted')
      .map((p: any) => p.permission),
  );
  // A System User token often reports no permissions edge at all; absence is not proof.
  if (!granted.size) {
    return { name: 'token scopes', status: 'warn', detail: 'no permissions reported — cannot verify (common for System User tokens)' };
  }

  const need = ['ads_management', 'ads_read'];
  const missing = need.filter((s) => !granted.has(s));
  if (missing.length) {
    return {
      name: 'token scopes',
      status: 'fail',
      detail: `missing ${missing.join(', ')}`,
      fix: 'Regenerate the System User token with ads_management, ads_read, business_management, pages_show_list, pages_read_engagement. ads_read alone cannot write.',
    };
  }
  return { name: 'token scopes', status: 'ok', detail: [...granted].slice(0, 6).join(', ') };
}

async function checkPage(client: MetaClient, pageId?: string): Promise<Check> {
  if (!pageId) {
    const available = await attempt(() => client.get('me/accounts', { fields: 'id,name', limit: '10' }));
    const pages = ((available.value as any)?.data ?? []) as Array<{ id: string; name: string }>;
    return {
      name: 'facebook page',
      status: 'fail',
      detail: 'META_PAGE_ID is not set',
      fix:
        'Every ad creative requires object_story_spec.page_id — there is no default, so no ad can be created without it. ' +
        (pages.length
          ? `Pages this token can see:\n      ${pages.map((p) => `${p.id}  ${p.name}`).join('\n      ')}\n      Put one in META_PAGE_ID in functions/.env.local.`
          : 'This token can see no Pages. Create a PickleGo Facebook Page, add it to the Business, and give the System User access to it.'),
    };
  }

  const page = await attempt(() => client.get(pageId, { fields: 'name,id' }));
  if (!page.error) {
    return { name: 'facebook page', status: 'ok', detail: `${(page.value as any).name} (${pageId})` };
  }

  // Reading a Page's metadata needs pages_read_engagement, but CREATING AN AD that
  // references it does not — ads_management plus a role on the Page (same Business) is
  // enough. So a read failure here is not a blocker, and calling it one sends people
  // hunting for a Page that is already working. Verified empirically: a creative against
  // this Page validates fine while this read 403s.
  return {
    name: 'facebook page',
    status: 'warn',
    detail: `${pageId} set, but this token cannot read its metadata`,
    fix:
      'Harmless for running ads — creating a creative needs ads_management and a role on the Page, not ' +
      'pages_read_engagement. Add pages_show_list + pages_read_engagement to the token only if you want ' +
      'doctor to confirm the Page name. Confirm ads work with: npm run meta -- creative create ... --validate',
  };
}

async function checkApp(client: MetaClient, config: Config): Promise<Check[]> {
  const { appId, adAccountId } = config;
  if (!appId) {
    return [{ name: 'app', status: 'fail', detail: 'META_APP_ID is not set', fix: 'App Dashboard → Settings → Basic.' }];
  }

  const checks: Check[] = [];
  const app = await attempt(() => client.get(appId, { fields: 'name,object_store_urls,ios_bundle_id' }));
  checks.push(
    app.error
      ? {
          name: 'app',
          status: 'fail',
          detail: `${appId}: ${app.error.message}`,
          fix: 'The System User must be an admin/developer of the app, and the app must be owned by the Business.',
        }
      : { name: 'app', status: 'ok', detail: `${(app.value as any).name} (${appId})` },
  );

  // An app in Development Mode cannot create ad creatives ("must be in public to create
  // this ad"). Campaigns and ad sets are accepted regardless, so it ambushes you at the
  // creative step after the campaign already exists. There is no reliable public field
  // for app mode, so this cannot be asserted — say that plainly rather than implying the
  // check passed.
  checks.push({
    name: 'app mode',
    status: 'warn',
    detail: 'must be LIVE — not readable via the API, so verify by hand',
    fix:
      'A Development Mode app cannot create ad creatives. Toggle App Mode to Live at the top of the App Dashboard ' +
      '(it may first ask for a Privacy Policy URL). Confirm it works with: ' +
      'npm run meta -- creative create --name t --primary-text t --headline t --image-hash <h> --validate',
  });

  // The app's iOS platform must carry the App Store URL, or ad set creation dies with
  // subcode 1885093 ("application doesn't match the provided object store url"). The
  // CAMPAIGN is accepted without it, so this otherwise surfaces one step too late.
  if (app.value) {
    const itunes = (app.value as any).object_store_urls?.itunes;
    if (!itunes) {
      checks.push({
        name: 'app iOS platform',
        status: 'fail',
        detail: 'no iTunes/App Store URL configured on the Meta app',
        fix:
          'App Dashboard → Settings → Basic → Add Platform → iOS. Set Bundle ID (com.picklego.picklego) and ' +
          'iPhone Store ID (6743630735). Without it, campaigns are accepted but every AD SET is rejected ' +
          '(subcode 1885093). A human must do this.',
      });
    } else {
      checks.push({ name: 'app iOS platform', status: 'ok', detail: itunes });

      // Reading the URL and never comparing it to the one we actually SEND as
      // promoted_object.object_store_url was the gap: subcode 1885093 is precisely "these
      // two do not match", so the check was doing all the work except the part that matters.
      // Compare on the App Store id, not the string — Meta stores an http://itunes.apple.com
      // form while the modern canonical URL is https://apps.apple.com, and both are valid.
      const appStoreId = (url?: string) => url?.match(/id(\d+)/)?.[1];
      const metaId = appStoreId(itunes);
      const oursId = appStoreId(config.objectStoreUrl);

      if (config.objectStoreUrl && metaId && oursId && metaId !== oursId) {
        checks.push({
          name: 'store url match',
          status: 'fail',
          detail: `META_OBJECT_STORE_URL points at app ${oursId}, but Meta's app record says ${metaId}`,
          fix:
            'These must be the same app, or every ad set is rejected with subcode 1885093. Fix ' +
            'META_OBJECT_STORE_URL in functions/.env.local, or the iOS platform on the App Dashboard.',
        });
      } else {
        checks.push({
          name: 'store url match',
          status: metaId && oursId ? 'ok' : 'warn',
          detail:
            metaId && oursId
              ? `both point at App Store id ${metaId}`
              : 'could not extract an App Store id from one of the URLs — compare them by hand',
        });
      }
    }
  }

  // SKAdNetwork allows an app only 9 campaigns across all ad accounts. Running out is a
  // wall you hit with no warning, and the fix (deleting a campaign) is destructive.
  const campaigns = await attempt(() =>
    client.getAll(adAccountId + '/campaigns', { fields: 'is_skadnetwork_attribution,status,name' }),
  );
  if (campaigns.value) {
    const skan = (campaigns.value as Array<Record<string, any>>).filter((c) => c.is_skadnetwork_attribution);
    const status: Status = skan.length >= 9 ? 'fail' : skan.length >= 7 ? 'warn' : 'ok';
    checks.push({
      name: 'skadnetwork slots',
      status,
      detail: `${skan.length}/9 campaigns used`,
      fix:
        status === 'ok'
          ? undefined
          : 'An app gets 9 SKAN campaigns total, across every ad account. Free one with: npm run meta -- campaign archive <id> ' +
            '(archiving keeps its reporting history; deleting destroys it).',
    });
  }

  return checks;
}

async function checkAudienceTos(client: MetaClient, adAccountId: string): Promise<Check> {
  // There is no clean "have the TOS been accepted" field, so probe the edge. Subcode
  // 1885183 on read is the tell.
  const res = await attempt(() => client.get(`${adAccountId}/customaudiences`, { limit: '1' }));
  if (!res.error) return { name: 'custom audience TOS', status: 'ok', detail: 'accepted' };

  if (res.error.payload.subcode === 1885183) {
    return {
      name: 'custom audience TOS',
      status: 'fail',
      detail: 'not accepted',
      fix: 'A human must accept them: business.facebook.com → Business Settings → Ad Accounts → your account → Custom Audience Terms. Claude cannot click this. Audiences will not work until it is done. (Campaigns and ads are unaffected.)',
    };
  }
  return { name: 'custom audience TOS', status: 'warn', detail: res.error.message };
}

function render(checks: Check[], adAccountId: string): void {
  const failed = checks.filter((c) => c.status === 'fail');

  ok({ adAccountId, checks, healthy: failed.length === 0 }, () => {
    line(`\nMeta Ads preflight — ${adAccountId}\n`);
    for (const c of checks) {
      const mark = c.status === 'ok' ? '✓' : c.status === 'warn' ? '!' : '✗';
      line(`  ${mark} ${c.name.padEnd(22)} ${c.detail}`);
      if (c.fix) line(`      → ${c.fix}`);
    }
    line('');
    if (!failed.length) {
      line('Ready. Nothing here can spend money until you activate something.');
    } else {
      line(`${failed.length} blocking issue(s). Fix them before launching — most need a human in the Meta UI.`);
    }
    line('');
  });
}
