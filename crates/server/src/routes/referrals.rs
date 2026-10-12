//! Refer and earn (ADR 0076). Each organization has a code (`/i/<code>` on the site); an account
//! created with it is linked to the referrer. When the new organization pays its first batch with
//! real money (Stripe or confirmed by an admin, at least the minimum), both earn credit (ADR
//! 0040), once. A full refund of that batch takes back what is left of the reward.
//!
//! Guards against farming: one referral per e-mail ever (a keyed hash, aliases folded, kept after
//! the account is deleted), none for the referrer's own people (same e-mail, the same company
//! domain, or someone on one of its event teams), a monthly limit per referrer, a smallest paid
//! batch, and the reward claimed by one atomic `UPDATE`, so the webhook and the payer's return
//! racing each other credit it once (a unique index on the ledger backs that up).

use axum::Json;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use sqlx::{PgExecutor, Postgres, Transaction};
use uuid::Uuid;

use super::admin::{audit, require_admin};
use super::announcements::notify_organization;
use super::billing::credit_balance;
use super::privacy::{optional_rfc3339, rfc3339};
use crate::api::{
    AdminReferralDto, AdminReferralsDto, CreditReason, InvitedByDto, NotificationKind, ReferralDto,
    ReferralInviteDto, ReferralSettingsDto, ReferralStatus, ReferralTotalsDto, ReferralsDto,
};
use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult, bad_request};
use crate::state::AppState;
use crate::{keys, ratelimit};

/// Characters of a code: no look-alikes (0/O, 1/I).
const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN: usize = 8;
/// Referrals listed in the admin panel.
const ADMIN_LIST: i64 = 200;
/// Referrals listed to their referrer.
const OWN_LIST: i64 = 100;
/// Most credit per side, in centavos (R$ 1.000,00).
const MAX_REWARD_CENTS: i32 = 100_000;

/// Webmail providers: sharing one of these says nothing about two people being the same.
const PUBLIC_DOMAINS: &[&str] = &[
    "gmail.com",
    "googlemail.com",
    "hotmail.com",
    "hotmail.com.br",
    "outlook.com",
    "outlook.com.br",
    "live.com",
    "msn.com",
    "yahoo.com",
    "yahoo.com.br",
    "ymail.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "uol.com.br",
    "bol.com.br",
    "terra.com.br",
    "ig.com.br",
    "globo.com",
    "globomail.com",
    "r7.com",
    "zoho.com",
    "aol.com",
    "gmx.com",
    "yandex.com",
    "tutanota.com",
];

// Rules ------------------------------------------------------------------------------------

/// A code as typed or read from a link: trimmed, uppercase, 6 to 12 letters and digits.
pub(crate) fn normalize_code(raw: &str) -> Option<String> {
    let code = raw.trim().to_ascii_uppercase();
    ((6..=12).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphanumeric()))
        .then_some(code)
}

/// The mailbox behind an address: lowercase, `+tag` dropped and, on Gmail, the dots too (they
/// all reach the same inbox).
pub(crate) fn canonical_email(email: &str) -> String {
    let email = email.trim().to_lowercase();
    let Some((local, domain)) = email.rsplit_once('@') else {
        return email;
    };
    let local = local.split('+').next().unwrap_or(local);
    let (local, domain) = match domain {
        "gmail.com" | "googlemail.com" => (local.replace('.', ""), "gmail.com"),
        _ => (local.to_owned(), domain),
    };
    format!("{local}@{domain}")
}

fn domain_of(email: &str) -> String {
    email
        .rsplit_once('@')
        .map(|(_, domain)| domain.trim().to_lowercase())
        .unwrap_or_default()
}

/// Whether `domain` belongs to a webmail provider (or is one of its subdomains).
fn public_domain(domain: &str) -> bool {
    PUBLIC_DOMAINS.iter().any(|public| {
        domain == *public
            || domain
                .strip_suffix(public)
                .is_some_and(|rest| rest.ends_with('.'))
    })
}

/// Whether `email` looks like one of the referrer's own people: the same mailbox, or the same
/// company domain (a webmail domain proves nothing).
pub(crate) fn same_person(email: &str, referrer_emails: &[String]) -> bool {
    let canonical = canonical_email(email);
    let domain = domain_of(&canonical);
    referrer_emails.iter().any(|other| {
        let other = canonical_email(other);
        other == canonical || (!public_domain(&domain) && domain_of(&other) == domain)
    })
}

/// What the referrer sees of the e-mail: two characters, then the domain (`ma•••@gmail.com`).
pub(crate) fn email_hint(email: &str) -> String {
    let email = email.trim().to_lowercase();
    let (local, domain) = email.rsplit_once('@').unwrap_or((email.as_str(), ""));
    let shown: String = local.chars().take(2).collect();
    let hint = format!("{shown}•••@{domain}");
    hint.chars().take(120).collect()
}

fn random_code() -> ApiResult<String> {
    let mut bytes = [0u8; CODE_LEN];
    getrandom::fill(&mut bytes)
        .map_err(|error| ApiError::Internal(anyhow::anyhow!("OS RNG: {error}")))?;
    Ok(bytes
        .iter()
        .map(|byte| {
            let index = usize::from(*byte) % ALPHABET.len();
            char::from(ALPHABET.get(index).copied().unwrap_or(b'X'))
        })
        .collect())
}

fn status(value: &str) -> ApiResult<ReferralStatus> {
    ReferralStatus::from_db(value)
        .ok_or_else(|| ApiError::Internal(anyhow::anyhow!("unknown referral status {value}")))
}

// Settings ---------------------------------------------------------------------------------

/// The program's switches.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn load_settings<'e, E: PgExecutor<'e>>(
    executor: E,
) -> ApiResult<ReferralSettingsDto> {
    let row = sqlx::query!(
        r#"select referrals_enabled, referral_referrer_cents, referral_referred_cents,
                  referral_monthly_limit, referral_min_batch_cents
           from platform_settings where id"#
    )
    .fetch_one(executor)
    .await?;
    Ok(ReferralSettingsDto {
        enabled: row.referrals_enabled,
        referrer_cents: row.referral_referrer_cents,
        referred_cents: row.referral_referred_cents,
        monthly_limit: row.referral_monthly_limit,
        min_batch_cents: row.referral_min_batch_cents,
    })
}

fn validate_settings(body: &ReferralSettingsDto) -> ApiResult<()> {
    if !(0..=MAX_REWARD_CENTS).contains(&body.referrer_cents)
        || !(0..=MAX_REWARD_CENTS).contains(&body.referred_cents)
    {
        return Err(bad_request(
            "invalid_amount",
            "rewards from 0 to 100000 centavos",
        ));
    }
    if !(0..=1_000).contains(&body.monthly_limit) {
        return Err(bad_request("invalid_limit", "monthly limit from 0 to 1000"));
    }
    if !(0..=10_000_000).contains(&body.min_batch_cents) {
        return Err(bad_request(
            "invalid_amount",
            "smallest batch from 0 to 10000000 centavos",
        ));
    }
    Ok(())
}

// Signing up -------------------------------------------------------------------------------

/// Links a new organization to the one whose code came with the sign-up. Anything wrong with the
/// code (unknown, program off, the referrer's own people, an e-mail already referred) creates
/// nothing and never fails the sign-up. Returns whether a referral was recorded.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn attach(
    state: &AppState,
    tx: &mut Transaction<'_, Postgres>,
    referred_organization_id: Uuid,
    email: &str,
    raw_code: Option<&str>,
) -> ApiResult<bool> {
    let Some(code) = raw_code.and_then(normalize_code) else {
        return Ok(false);
    };
    if !load_settings(&mut **tx).await?.enabled {
        return Ok(false);
    }
    let Some(referrer) = sqlx::query_scalar!(
        "select id from organizations where referral_code = $1 and suspended_at is null",
        code
    )
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Ok(false);
    };
    if referrer == referred_organization_id {
        return Ok(false);
    }
    // The referrer's people: its members and whoever is on one of its event teams.
    let people = sqlx::query_scalar!(
        r#"select u.email::text as "email!" from memberships m join users u on u.id = m.user_id
           where m.organization_id = $1
           union
           select t.email::text as "email!" from event_team t join events e on e.id = t.event_id
           where e.organization_id = $1"#,
        referrer
    )
    .fetch_all(&mut **tx)
    .await?;
    if same_person(email, &people) {
        tracing::info!(%referrer, "referral of the referrer's own people ignored");
        return Ok(false);
    }
    let hash = keys::keyed_hash(
        &state.config.master_key,
        "referral-email",
        canonical_email(email).as_bytes(),
    );
    let inserted = sqlx::query_scalar!(
        r#"insert into referrals (id, referrer_organization_id, referred_organization_id, code,
                                  referred_email_hash, referred_email_hint)
           values ($1, $2, $3, $4, $5, $6)
           on conflict do nothing returning id"#,
        Uuid::new_v4(),
        referrer,
        referred_organization_id,
        code,
        hash.as_slice(),
        email_hint(email),
    )
    .fetch_optional(&mut **tx)
    .await?;
    Ok(inserted.is_some())
}

// Rewards ----------------------------------------------------------------------------------

async fn credit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    cents: i32,
    referral_id: Uuid,
    data: serde_json::Value,
) -> ApiResult<()> {
    if cents <= 0 {
        return Ok(());
    }
    sqlx::query!(
        r#"insert into credit_ledger (id, organization_id, amount_cents, reason, reference_id)
           values ($1, $2, $3, $4, $5)"#,
        Uuid::new_v4(),
        organization_id,
        cents,
        CreditReason::Referral.db(),
        referral_id,
    )
    .execute(&mut **tx)
    .await?;
    notify_organization(
        &mut **tx,
        organization_id,
        NotificationKind::ReferralRewarded,
        data,
    )
    .await
}

/// After a batch became paid (in the same transaction): if it is the referred organization's
/// first batch paid with real money of at least the minimum, both sides earn their credit. The
/// pending referral is claimed by one `UPDATE`, so a second confirmation of the same payment (the
/// webhook and the payer's return at once) finds nothing to claim.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn reward_paid_batch(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
) -> ApiResult<()> {
    let batch = sqlx::query!(
        r#"select b.status, b.paid_via, b.price_cents, e.organization_id
           from ticket_batches b join events e on e.id = b.event_id where b.id = $1"#,
        batch_id
    )
    .fetch_one(&mut **tx)
    .await?;
    // Free and credit batches cost the organization nothing: they never earn a reward.
    if batch.status != "paid" || !matches!(batch.paid_via.as_deref(), Some("stripe" | "admin")) {
        return Ok(());
    }
    let settings = load_settings(&mut **tx).await?;
    if !settings.enabled || batch.price_cents < settings.min_batch_cents.max(1) {
        return Ok(());
    }
    let Some(referral) = sqlx::query!(
        r#"update referrals set status = 'rewarded', rewarded_at = now(), qualifying_batch_id = $2
           where referred_organization_id = $1 and status = 'pending'
           returning id, referrer_organization_id, referred_email_hint"#,
        batch.organization_id,
        batch_id
    )
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Ok(());
    };
    let mut referrer_cents = 0;
    let mut capped = false;
    let mut referrer_name = None;
    if let Some(referrer) = referral.referrer_organization_id {
        // The referrer's row is locked: two of its referrals paying at once are counted in turn,
        // so the monthly limit holds.
        let row = sqlx::query!(
            r#"select name, suspended_at is not null as "suspended!" from organizations
               where id = $1 for update"#,
            referrer
        )
        .fetch_one(&mut **tx)
        .await?;
        let recent = sqlx::query_scalar!(
            r#"select count(*) as "count!" from referrals
               where referrer_organization_id = $1 and id <> $2 and status = 'rewarded'
                 and referrer_cents > 0 and rewarded_at > now() - interval '30 days'"#,
            referrer,
            referral.id
        )
        .fetch_one(&mut **tx)
        .await?;
        if !row.suspended && recent < i64::from(settings.monthly_limit) {
            referrer_cents = settings.referrer_cents;
        } else {
            capped = true;
        }
        referrer_name = Some(row.name);
    }
    sqlx::query!(
        r#"update referrals set referrer_cents = $2, referred_cents = $3, referrer_capped = $4
           where id = $1"#,
        referral.id,
        referrer_cents,
        settings.referred_cents,
        capped
    )
    .execute(&mut **tx)
    .await?;
    credit(
        tx,
        batch.organization_id,
        settings.referred_cents,
        referral.id,
        serde_json::json!({
            "role": "referred",
            "amountCents": settings.referred_cents,
            "organization": referrer_name,
        }),
    )
    .await?;
    if let Some(referrer) = referral.referrer_organization_id {
        credit(
            tx,
            referrer,
            referrer_cents,
            referral.id,
            serde_json::json!({
                "role": "referrer",
                "amountCents": referrer_cents,
                "who": referral.referred_email_hint,
            }),
        )
        .await?;
    }
    tracing::info!(referral = %referral.id, %batch_id, referrer_cents, capped, "referral rewarded");
    Ok(())
}

/// Takes a referral back: no reward after this, and what is left of the credit it gave (never
/// more than each balance, never below zero) is removed. Returns whether it changed.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn revoke(
    tx: &mut Transaction<'_, Postgres>,
    referral_id: Uuid,
    reason: &str,
) -> ApiResult<bool> {
    let Some(row) = sqlx::query!(
        r#"update referrals set status = 'revoked', revoked_at = now(), revoke_reason = $2
           where id = $1 and status in ('pending', 'rewarded')
           returning referrer_organization_id, referred_organization_id, referrer_cents, referred_cents"#,
        referral_id,
        reason
    )
    .fetch_optional(&mut **tx)
    .await?
    else {
        return Ok(false);
    };
    for (organization, cents) in [
        (row.referred_organization_id, row.referred_cents),
        (row.referrer_organization_id, row.referrer_cents),
    ] {
        let Some(organization) = organization.filter(|_| cents > 0) else {
            continue;
        };
        sqlx::query!(
            "select id from organizations where id = $1 for update",
            organization
        )
        .fetch_one(&mut **tx)
        .await?;
        let take = cents.min(credit_balance(&mut **tx, organization).await?);
        if take > 0 {
            sqlx::query!(
                r#"insert into credit_ledger (id, organization_id, amount_cents, reason, reference_id)
                   values ($1, $2, $3, $4, $5)"#,
                Uuid::new_v4(),
                organization,
                -take,
                CreditReason::ReferralRevoked.db(),
                referral_id,
            )
            .execute(&mut **tx)
            .await?;
        }
    }
    tracing::info!(referral = %referral_id, reason, "referral revoked");
    Ok(true)
}

/// A batch was refunded in full (ADR 0032, 0063): the reward it earned is taken back.
///
/// # Errors
///
/// Database errors.
pub(crate) async fn revoke_for_batch(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
) -> ApiResult<()> {
    let ids = sqlx::query_scalar!(
        "select id from referrals where qualifying_batch_id = $1 and status = 'rewarded'",
        batch_id
    )
    .fetch_all(&mut **tx)
    .await?;
    for id in ids {
        revoke(tx, id, "batch_refunded").await?;
    }
    Ok(())
}

/// The organization's referrals for its data export (ADR 0033): its code, who referred it and
/// whom it referred (masked e-mails, as the panel shows them).
///
/// # Errors
///
/// Database errors.
pub(crate) async fn export(
    pool: &sqlx::PgPool,
    organization_id: Uuid,
) -> ApiResult<serde_json::Value> {
    let code = sqlx::query_scalar!(
        "select referral_code from organizations where id = $1",
        organization_id
    )
    .fetch_one(pool)
    .await?;
    let invited_by = sqlx::query!(
        r#"select status, created_at, rewarded_at, referred_cents from referrals
           where referred_organization_id = $1"#,
        organization_id
    )
    .fetch_optional(pool)
    .await?
    .map(|row| {
        serde_json::json!({
            "status": row.status,
            "createdAt": rfc3339(row.created_at),
            "rewardedAt": optional_rfc3339(row.rewarded_at),
            "creditCents": row.referred_cents,
        })
    });
    let referred = sqlx::query!(
        r#"select referred_email_hint, status, created_at, rewarded_at, referrer_cents from referrals
           where referrer_organization_id = $1 order by created_at"#,
        organization_id
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| {
        serde_json::json!({
            "email": row.referred_email_hint,
            "status": row.status,
            "createdAt": rfc3339(row.created_at),
            "rewardedAt": optional_rfc3339(row.rewarded_at),
            "creditCents": row.referrer_cents,
        })
    })
    .collect::<Vec<_>>();
    Ok(serde_json::json!({ "code": code, "invitedBy": invited_by, "referred": referred }))
}

// Handlers ---------------------------------------------------------------------------------

/// `GET /api/referrals/{code}` (no login): who invites, for the sign-up page. Unknown codes,
/// and every code while the program is off, are 404.
pub async fn invite(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> ApiResult<Json<ReferralInviteDto>> {
    ratelimit::by_ip(&state, &headers, ratelimit::REFERRAL_INVITE).await?;
    let code = normalize_code(&code).ok_or(ApiError::NotFound)?;
    let settings = load_settings(&state.pool).await?;
    if !settings.enabled {
        return Err(ApiError::NotFound);
    }
    let name = sqlx::query_scalar!(
        "select name from organizations where referral_code = $1 and suspended_at is null",
        code
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(ReferralInviteDto {
        code,
        organization_name: name,
        referred_cents: settings.referred_cents,
        min_batch_cents: settings.min_batch_cents,
    }))
}

async fn own_organization(state: &AppState, user: &AuthUser) -> ApiResult<Uuid> {
    sqlx::query_scalar!(
        "select organization_id from memberships where user_id = $1 order by created_at limit 1",
        user.id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)
}

/// The organization's code, made the first time it is asked for.
async fn code_of(state: &AppState, organization_id: Uuid) -> ApiResult<String> {
    for _ in 0..5 {
        let candidate = random_code()?;
        let code = sqlx::query_scalar!(
            r#"update organizations set referral_code = coalesce(referral_code, $2)
               where id = $1 returning referral_code as "code!""#,
            organization_id,
            candidate
        )
        .fetch_one(&state.pool)
        .await;
        match code {
            Ok(code) => return Ok(code),
            // Another organization already has this one: draw again.
            Err(error) => match ApiError::from(error) {
                ApiError::Conflict("duplicate", _) => {}
                other => return Err(other),
            },
        }
    }
    Err(ApiError::Internal(anyhow::anyhow!(
        "no free referral code after 5 draws"
    )))
}

/// `GET /api/account/referrals`: the link, what each side earns, and the referrals.
pub async fn mine(State(state): State<AppState>, user: AuthUser) -> ApiResult<Json<ReferralsDto>> {
    let organization_id = own_organization(&state, &user).await?;
    let settings = load_settings(&state.pool).await?;
    let code = code_of(&state, organization_id).await?;
    let rows = sqlx::query!(
        r#"select id, referred_email_hint, status, created_at, rewarded_at, referrer_cents,
                  referrer_capped
           from referrals where referrer_organization_id = $1
           order by created_at desc limit $2"#,
        organization_id,
        OWN_LIST
    )
    .fetch_all(&state.pool)
    .await?;
    let referrals = rows
        .into_iter()
        .map(|row| {
            Ok(ReferralDto {
                id: row.id,
                email_hint: row.referred_email_hint,
                status: status(&row.status)?,
                created_at: row.created_at,
                rewarded_at: row.rewarded_at,
                earned_cents: row.referrer_cents,
                capped: row.referrer_capped,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let earned_cents = sqlx::query_scalar!(
        r#"select coalesce(sum(referrer_cents), 0)::bigint as "sum!" from referrals
           where referrer_organization_id = $1 and status = 'rewarded'"#,
        organization_id
    )
    .fetch_one(&state.pool)
    .await?;
    let invited_by = sqlx::query!(
        r#"select o.name as "name?", r.status, r.referred_cents
           from referrals r left join organizations o on o.id = r.referrer_organization_id
           where r.referred_organization_id = $1"#,
        organization_id
    )
    .fetch_optional(&state.pool)
    .await?
    .map(|row| {
        let status = status(&row.status)?;
        Ok::<_, ApiError>(InvitedByDto {
            organization_name: row.name,
            referred_cents: if status == ReferralStatus::Pending {
                settings.referred_cents
            } else {
                row.referred_cents
            },
            status,
        })
    })
    .transpose()?;
    Ok(Json(ReferralsDto {
        enabled: settings.enabled,
        code,
        referrer_cents: settings.referrer_cents,
        referred_cents: settings.referred_cents,
        min_batch_cents: settings.min_batch_cents,
        monthly_limit: settings.monthly_limit,
        earned_cents,
        referrals,
        invited_by,
    }))
}

async fn admin_dto(state: &AppState) -> ApiResult<AdminReferralsDto> {
    let settings = load_settings(&state.pool).await?;
    let totals = sqlx::query!(
        r#"select count(*) filter (where status = 'pending') as "pending!",
                  count(*) filter (where status = 'rewarded') as "rewarded!",
                  count(*) filter (where status = 'revoked') as "revoked!",
                  coalesce(sum(referrer_cents + referred_cents) filter (where status = 'rewarded'), 0)::bigint
                      as "credit!"
           from referrals"#
    )
    .fetch_one(&state.pool)
    .await?;
    let rows = sqlx::query!(
        r#"select r.id, r.referrer_organization_id, a.name as "referrer_name?",
                  r.referred_organization_id, b.name as "referred_name?", r.referred_email_hint,
                  r.status, r.created_at, r.rewarded_at, r.referrer_cents, r.referred_cents,
                  r.referrer_capped, r.revoked_at, r.revoke_reason
           from referrals r
           left join organizations a on a.id = r.referrer_organization_id
           left join organizations b on b.id = r.referred_organization_id
           order by r.created_at desc limit $1"#,
        ADMIN_LIST
    )
    .fetch_all(&state.pool)
    .await?;
    let referrals = rows
        .into_iter()
        .map(|row| {
            Ok(AdminReferralDto {
                id: row.id,
                referrer_id: row.referrer_organization_id,
                referrer_name: row.referrer_name,
                referred_id: row.referred_organization_id,
                referred_name: row.referred_name,
                email_hint: row.referred_email_hint,
                status: status(&row.status)?,
                created_at: row.created_at,
                rewarded_at: row.rewarded_at,
                referrer_cents: row.referrer_cents,
                referred_cents: row.referred_cents,
                referrer_capped: row.referrer_capped,
                revoked_at: row.revoked_at,
                revoke_reason: row.revoke_reason,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(AdminReferralsDto {
        settings,
        totals: ReferralTotalsDto {
            pending: totals.pending,
            rewarded: totals.rewarded,
            revoked: totals.revoked,
            credit_cents: totals.credit,
        },
        referrals,
    })
}

/// `GET /api/admin/referrals`.
pub async fn admin_list(
    State(state): State<AppState>,
    user: AuthUser,
) -> ApiResult<Json<AdminReferralsDto>> {
    require_admin(&user)?;
    Ok(Json(admin_dto(&state).await?))
}

/// `PUT /api/admin/referrals/settings`: every switch at once. Rewards already given stay.
pub async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ReferralSettingsDto>,
) -> ApiResult<Json<AdminReferralsDto>> {
    require_admin(&user)?;
    validate_settings(&body)?;
    let previous = load_settings(&state.pool).await?;
    sqlx::query!(
        r#"update platform_settings set referrals_enabled = $1, referral_referrer_cents = $2,
                  referral_referred_cents = $3, referral_monthly_limit = $4,
                  referral_min_batch_cents = $5, updated_at = now(), updated_by = $6
           where id"#,
        body.enabled,
        body.referrer_cents,
        body.referred_cents,
        body.monthly_limit,
        body.min_batch_cents,
        user.id,
    )
    .execute(&state.pool)
    .await?;
    audit(
        &state,
        &user,
        "referral_settings_update",
        None,
        None,
        None,
        serde_json::json!({ "from": previous, "to": body }),
    )
    .await?;
    Ok(Json(admin_dto(&state).await?))
}

/// `POST /api/admin/referrals/{id}/revoke`: a suspicious referral earns nothing (more); what is
/// left of its credit is taken back.
pub async fn admin_revoke(
    State(state): State<AppState>,
    user: AuthUser,
    Path(referral_id): Path<Uuid>,
) -> ApiResult<Json<AdminReferralsDto>> {
    require_admin(&user)?;
    let mut tx = state.pool.begin().await?;
    let organizations = sqlx::query!(
        "select referrer_organization_id, referred_organization_id from referrals where id = $1",
        referral_id
    )
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(ApiError::NotFound)?;
    if !revoke(&mut tx, referral_id, "admin").await? {
        return Err(ApiError::Conflict(
            "referral_revoked",
            "this referral was already revoked".to_owned(),
        ));
    }
    tx.commit().await?;
    audit(
        &state,
        &user,
        "referral_revoke",
        organizations.referrer_organization_id,
        None,
        Some(referral_id),
        serde_json::json!({ "referred": organizations.referred_organization_id }),
    )
    .await?;
    Ok(Json(admin_dto(&state).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_normalized() {
        assert_eq!(normalize_code(" k7m2qxpa ").as_deref(), Some("K7M2QXPA"));
        for bad in ["", "abc", "K7M2-QXPA", "K7M2QXPA1234X", "ÁBCDEFG"] {
            assert_eq!(normalize_code(bad), None, "{bad}");
        }
        let code = random_code().unwrap();
        assert_eq!(normalize_code(&code).as_deref(), Some(code.as_str()));
        assert!(!code.contains(['0', 'O', '1', 'I']));
    }

    #[test]
    fn aliases_reach_the_same_mailbox() {
        assert_eq!(
            canonical_email("Ana.Souza+show@Gmail.com"),
            "anasouza@gmail.com"
        );
        assert_eq!(
            canonical_email("ana.souza@googlemail.com"),
            "anasouza@gmail.com"
        );
        assert_eq!(
            canonical_email("ana.souza+x@banda.com.br"),
            "ana.souza@banda.com.br"
        );
    }

    #[test]
    fn own_people_are_not_referrals() {
        let people = vec!["ana@banda.com.br".to_owned(), "joao@gmail.com".to_owned()];
        assert!(same_person("j.o.a.o+2@gmail.com", &people));
        assert!(same_person("pedro@banda.com.br", &people));
        assert!(!same_person("pedro@som.banda.com.br", &people));
        // A webmail domain says nothing.
        assert!(!same_person("maria@gmail.com", &people));
        assert!(!same_person("maria@escola.org.br", &people));
    }

    #[test]
    fn hints_hide_the_address() {
        assert_eq!(email_hint("Maria.Silva@Gmail.com"), "ma•••@gmail.com");
        assert_eq!(email_hint("a@b.com"), "a•••@b.com");
    }
}
