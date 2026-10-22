//! Announcements by e-mail (ADR 0107): the audience, the queue and a paced sender that keeps
//! part of the day's quota for sign-in codes. Each recipient is a row, claimed with
//! `skip locked`, so a restart or a second sender never sends one twice.

use std::sync::atomic::Ordering;
use std::time::Duration;

use base64::Engine as _;
use uuid::Uuid;

use crate::api::{AnnouncementAudience, AnnouncementMailingDto};
use crate::emails;
use crate::error::ApiResult;
use crate::keys::{MasterKey, keyed_hash};
use crate::mail::{MailError, MailKind};
use crate::state::AppState;

/// Pause between two announcement e-mails (the provider takes a few per second).
const PACE: Duration = Duration::from_millis(600);
/// A recipient claimed this long ago and never marked was lost in a restart.
const STALE_MINUTES: i32 = 10;
/// Bytes of the token's signature.
const TOKEN_MAC: usize = 12;

/// The e-mails of the day's quota kept for everything else (codes, payments, invitations): a
/// quarter of it, at least 10.
pub const fn reserve(limit: i64) -> i64 {
    let quarter = limit / 4;
    let reserve = if quarter > 10 { quarter } else { 10 };
    if reserve > limit { limit } else { reserve }
}

/// Announcement e-mails a day within `MAIL_DAILY_LIMIT`; `None` without a limit.
pub fn daily_budget(state: &AppState) -> Option<i32> {
    state
        .config
        .mail_daily_limit
        .map(|limit| i32::try_from((limit - reserve(limit)).max(0)).unwrap_or(i32::MAX))
}

/// The token of a recipient's unsubscribe link: the account and a signature only the server can
/// make. It only turns announcement e-mails off or on.
pub fn token(master: &MasterKey, user_id: Uuid) -> String {
    signed(master, ANNOUNCEMENTS, user_id)
}

/// The token of a reminder's unsubscribe link (ADR 0118): `r.` and its own signature, so it only
/// turns reminders off or on.
pub fn reminder_token(master: &MasterKey, user_id: Uuid) -> String {
    format!("{REMINDER_PREFIX}{}", signed(master, REMINDERS, user_id))
}

const ANNOUNCEMENTS: &str = "announcement-unsubscribe";
const REMINDERS: &str = "reminder-unsubscribe";
const REMINDER_PREFIX: &str = "r.";

/// Which e-mails an unsubscribe link stops.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unsubscribe {
    /// The platform's announcements (ADR 0107).
    Announcements(Uuid),
    /// The reminders that bring people back (ADR 0118).
    Reminders(Uuid),
}

/// What a token unsubscribes from, when its signature holds.
pub fn unsubscribe_of(master: &MasterKey, token: &str) -> Option<Unsubscribe> {
    let token = token.trim();
    match token.strip_prefix(REMINDER_PREFIX) {
        Some(rest) => verified(master, REMINDERS, rest).map(Unsubscribe::Reminders),
        None => verified(master, ANNOUNCEMENTS, token).map(Unsubscribe::Announcements),
    }
}

/// The account of an announcements token, when the signature holds.
pub fn user_of(master: &MasterKey, token: &str) -> Option<Uuid> {
    verified(master, ANNOUNCEMENTS, token.trim())
}

fn signed(master: &MasterKey, purpose: &str, user_id: Uuid) -> String {
    let mac = keyed_hash(master, purpose, user_id.as_bytes());
    let mut bytes = user_id.as_bytes().to_vec();
    bytes.extend_from_slice(mac.get(..TOKEN_MAC).unwrap_or_default());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn verified(master: &MasterKey, purpose: &str, token: &str) -> Option<Uuid> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(token)
        .ok()?;
    let (id, mac) = bytes.split_at_checked(16)?;
    let user_id = Uuid::from_slice(id).ok()?;
    let expected = keyed_hash(master, purpose, user_id.as_bytes());
    let expected = expected.get(..TOKEN_MAC)?;
    // Constant time: the comparison never tells how much of a guess was right.
    (mac.len() == TOKEN_MAC
        && mac
            .iter()
            .zip(expected)
            .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
            == 0)
        .then_some(user_id)
}

/// How many accounts an audience reaches: (will get it, stopped these e-mails, got it before).
pub async fn audience_counts(
    state: &AppState,
    announcement_id: Uuid,
    audience: AnnouncementAudience,
    tag: Option<&str>,
) -> ApiResult<(i64, i64, i64)> {
    let row = sqlx::query!(
        r#"select
             count(*) filter (where u.announcement_emails and r.user_id is null) as "recipients!",
             count(*) filter (where not u.announcement_emails and r.user_id is null) as "opted_out!",
             count(*) filter (where r.user_id is not null) as "already!"
           from users u
           -- Only a row that went out or is on its way counts: a canceled (skipped) or failed
           -- one can be sent again.
           left join announcement_mail_recipients r
             on r.announcement_id = $1 and r.user_id = u.id
            and r.status in ('pending', 'sending', 'sent')
           where exists (
               select 1 from memberships m join organizations o on o.id = m.organization_id
               where m.user_id = u.id
                 and ($2 <> 'owners' or m.role = 'owner')
                 and ($2 <> 'paying' or exists (
                       select 1 from ticket_batches b join events e on e.id = b.event_id
                       where e.organization_id = o.id and b.status in ('paid', 'refunded')
                         and b.price_cents > 0))
                 and ($2 <> 'tagged' or $3 = any(o.admin_tags)))
             and ($2 <> 'recent' or u.last_login_at > now() - interval '90 days')"#,
        announcement_id,
        audience.db(),
        tag,
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((row.recipients, row.opted_out, row.already))
}

/// Where the quota stands now: e-mails sent in the last 24 hours (every kind) and announcement
/// e-mails waiting in other sendings (they go out before a new one).
pub async fn quota_now(state: &AppState) -> ApiResult<(i64, i64)> {
    let row = sqlx::query!(
        r#"select
             (select count(*) from mail_sends
              where created_at > now() - interval '24 hours' and status <> 'quota') as "sent!",
             (select count(*) from announcement_mail_recipients r
              join announcement_mailings m on m.id = r.mailing_id
              where r.status in ('pending', 'sending') and m.canceled_at is null) as "queued!""#
    )
    .fetch_one(&state.pool)
    .await?;
    Ok((row.sent, row.queued))
}

/// Queues an announcement for an audience; `None` when nobody is left to get it.
pub async fn queue(
    state: &AppState,
    announcement_id: Uuid,
    audience: AnnouncementAudience,
    tag: Option<&str>,
    created_by: Option<Uuid>,
) -> ApiResult<Option<Uuid>> {
    let mut tx = state.pool.begin().await?;
    let id = Uuid::new_v4();
    sqlx::query!(
        r#"insert into announcement_mailings (id, announcement_id, audience, tag, created_by)
           values ($1, $2, $3, $4, $5)"#,
        id,
        announcement_id,
        audience.db(),
        tag,
        created_by,
    )
    .execute(&mut *tx)
    .await?;
    let added = sqlx::query!(
        r#"insert into announcement_mail_recipients (mailing_id, announcement_id, user_id)
           select $1, $2, u.id from users u
           where u.announcement_emails
             and exists (
               select 1 from memberships m join organizations o on o.id = m.organization_id
               where m.user_id = u.id
                 and ($3 <> 'owners' or m.role = 'owner')
                 and ($3 <> 'paying' or exists (
                       select 1 from ticket_batches b join events e on e.id = b.event_id
                       where e.organization_id = o.id and b.status in ('paid', 'refunded')
                         and b.price_cents > 0))
                 and ($3 <> 'tagged' or $4 = any(o.admin_tags)))
             and ($3 <> 'recent' or u.last_login_at > now() - interval '90 days')
           -- Someone left out by a canceled sending, or whose e-mail failed, gets this one.
           on conflict (announcement_id, user_id) do update
           set mailing_id = excluded.mailing_id, status = 'pending', sent_at = null
           where announcement_mail_recipients.status in ('skipped', 'failed')"#,
        id,
        announcement_id,
        audience.db(),
        tag,
    )
    .execute(&mut *tx)
    .await?
    .rows_affected();
    if added == 0 {
        return Ok(None);
    }
    tx.commit().await?;
    wake(state);
    Ok(Some(id))
}

/// Starts the sender unless one is running. It stops by itself when nothing is left or the
/// day's share of the quota is used; the worker's hourly tick wakes it again.
pub fn wake(state: &AppState) {
    if state.mailing.swap(true, Ordering::SeqCst) {
        return;
    }
    let state = state.clone();
    tokio::spawn(async move {
        loop {
            match deliver_one(&state).await {
                Ok(Step::Sent) => tokio::time::sleep(PACE).await,
                Ok(Step::Idle | Step::Budget) => break,
                Err(error) => {
                    tracing::error!(?error, "announcement e-mail failed");
                    break;
                }
            }
            if state.shutting_down() {
                break;
            }
        }
        state.mailing.store(false, Ordering::SeqCst);
    });
}

/// What one turn of the sender did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// Handled one recipient.
    Sent,
    /// Nothing waiting.
    Idle,
    /// The day's share of the quota is used.
    Budget,
}

/// Sends everything waiting, without pauses, until the quota share runs out (tests).
///
/// # Errors
///
/// Database errors.
pub async fn drain(state: &AppState) -> ApiResult<Step> {
    loop {
        let step = deliver_one(state).await?;
        if step != Step::Sent {
            return Ok(step);
        }
    }
}

/// The e-mail of an announcement for one account, with its own way out.
pub fn message(
    state: &AppState,
    user_id: Uuid,
    title: &str,
    body: &str,
    cta: Option<(&str, &str)>,
) -> emails::Email {
    let site = &state.config.public_web_url;
    let token = token(&state.config.master_key, user_id);
    // A path of the site becomes a full address in the e-mail.
    let cta = cta.map(|(label, url)| {
        let url = if url.starts_with('/') {
            format!("{site}{url}")
        } else {
            url.to_owned()
        };
        (label, url)
    });
    emails::announcement(
        &emails::AnnouncementMail {
            title,
            body,
            cta: cta.as_ref().map(|(label, url)| (*label, url.as_str())),
            unsubscribe_url: &format!("{site}/descadastrar#{token}"),
            one_click_url: &format!(
                "{}/api/email/unsubscribe/{token}",
                state.config.public_api_url
            ),
        },
        site,
    )
}

/// Sends the next waiting e-mail.
///
/// # Errors
///
/// Database errors.
pub async fn deliver_one(state: &AppState) -> ApiResult<Step> {
    // A recipient claimed before a restart may or may not have gone out: never twice.
    sqlx::query!(
        r#"update announcement_mail_recipients set status = 'failed'
           where status = 'sending' and sent_at < now() - make_interval(mins => $1)"#,
        STALE_MINUTES,
    )
    .execute(&state.pool)
    .await?;
    if let Some(limit) = state.config.mail_daily_limit {
        let sent = sqlx::query_scalar!(
            r#"select count(*) as "count!" from mail_sends
               where created_at > now() - interval '24 hours' and status <> 'quota'"#
        )
        .fetch_one(&state.pool)
        .await?;
        if sent >= limit - reserve(limit) {
            return Ok(Step::Budget);
        }
    }
    let Some(claimed) = sqlx::query!(
        r#"update announcement_mail_recipients r set status = 'sending', sent_at = now()
           from (select r2.mailing_id, r2.user_id from announcement_mail_recipients r2
                 join announcement_mailings m on m.id = r2.mailing_id
                 where r2.status = 'pending' and m.canceled_at is null
                 order by m.created_at, r2.user_id
                 limit 1 for update of r2 skip locked) next
           where r.mailing_id = next.mailing_id and r.user_id = next.user_id
           returning r.mailing_id, r.user_id"#
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(Step::Idle);
    };
    let row = sqlx::query!(
        r#"select u.email::text as "email!", u.announcement_emails, a.title, a.body, a.cta_label,
                  a.cta_url, a.archived_at is not null as "archived!"
           from users u, announcement_mailings m join announcements a on a.id = m.announcement_id
           where u.id = $1 and m.id = $2"#,
        claimed.user_id,
        claimed.mailing_id,
    )
    .fetch_one(&state.pool)
    .await?;
    let status = if !row.announcement_emails || row.archived {
        "skipped"
    } else {
        let email = message(
            state,
            claimed.user_id,
            &row.title,
            &row.body,
            row.cta_label.as_deref().zip(row.cta_url.as_deref()),
        );
        match state
            .send_mail(MailKind::Announcement, &row.email, &email)
            .await
        {
            Ok(()) => "sent",
            Err(MailError::Quota(_)) => {
                // The provider's own limit: back in line for later.
                sqlx::query!(
                    "update announcement_mail_recipients set status = 'pending', sent_at = null where mailing_id = $1 and user_id = $2",
                    claimed.mailing_id,
                    claimed.user_id,
                )
                .execute(&state.pool)
                .await?;
                return Ok(Step::Budget);
            }
            Err(MailError::Failed(_)) => "failed",
        }
    };
    sqlx::query!(
        "update announcement_mail_recipients set status = $3, sent_at = now() where mailing_id = $1 and user_id = $2",
        claimed.mailing_id,
        claimed.user_id,
        status,
    )
    .execute(&state.pool)
    .await?;
    sqlx::query!(
        r#"update announcement_mailings set finished_at = now()
           where id = $1 and finished_at is null
             and not exists (select 1 from announcement_mail_recipients
                             where mailing_id = $1 and status in ('pending', 'sending'))"#,
        claimed.mailing_id,
    )
    .execute(&state.pool)
    .await?;
    Ok(Step::Sent)
}

/// Sendings with their counts: of one announcement (the latest first) or one by id.
pub async fn load(
    state: &AppState,
    announcement_id: Option<Uuid>,
    mailing_id: Option<Uuid>,
) -> ApiResult<Vec<(Uuid, AnnouncementMailingDto)>> {
    let rows = sqlx::query!(
        r#"select m.id, m.announcement_id, m.audience, m.tag, m.created_at, m.finished_at,
                  m.canceled_at, u.email::text as "created_by?",
                  count(r.user_id) as "total!",
                  count(r.user_id) filter (where r.status = 'sent') as "sent!",
                  count(r.user_id) filter (where r.status = 'failed') as "failed!",
                  count(r.user_id) filter (where r.status = 'skipped') as "skipped!",
                  count(r.user_id) filter (where r.status in ('pending', 'sending')) as "pending!"
           from announcement_mailings m
           left join users u on u.id = m.created_by
           left join announcement_mail_recipients r on r.mailing_id = m.id
           where ($1::uuid is null or m.announcement_id = $1) and ($2::uuid is null or m.id = $2)
           group by m.id, u.email
           order by m.created_at desc"#,
        announcement_id,
        mailing_id,
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.announcement_id,
                AnnouncementMailingDto {
                    id: row.id,
                    audience: AnnouncementAudience::from_db(&row.audience)
                        .unwrap_or(AnnouncementAudience::All),
                    tag: row.tag,
                    total: row.total,
                    sent: row.sent,
                    failed: row.failed,
                    skipped: row.skipped,
                    pending: row.pending,
                    created_by: row.created_by,
                    created_at: row.created_at,
                    finished_at: row.finished_at,
                    canceled_at: row.canceled_at,
                },
            )
        })
        .collect())
}

/// Whether a sending still has e-mails to go (the panel polls while it does).
pub fn running(mailing: &AnnouncementMailingDto) -> bool {
    mailing.finished_at.is_none() && mailing.canceled_at.is_none()
}

/// `an•••@gmail.com`: enough for the owner to recognize, little for anyone else.
pub fn mask_email(email: &str) -> String {
    let Some((name, domain)) = email.split_once('@') else {
        return "•••".to_owned();
    };
    let shown: String = name.chars().take(2).collect();
    format!("{shown}•••@{domain}")
}

/// When the sending will end at this pace: today when the share of the quota is enough.
pub fn days_needed(pending: i64, budget: Option<i32>) -> i64 {
    match budget {
        Some(budget) if budget > 0 => (pending + i64::from(budget) - 1) / i64::from(budget),
        _ => i64::from(pending > 0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn master(byte: u8) -> MasterKey {
        MasterKey::from_base64(&base64::engine::general_purpose::STANDARD.encode([byte; 32]))
            .unwrap_or_else(|_| unreachable!())
    }

    #[test]
    fn tokens_hold_only_with_the_servers_key() {
        let user = Uuid::from_bytes([7; 16]);
        let token = token(&master(1), user);
        assert_eq!(user_of(&master(1), &token), Some(user));
        assert_eq!(user_of(&master(2), &token), None);
        // Another account with the same signature does not pass.
        let mut forged = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&token)
            .unwrap_or_default();
        if let Some(byte) = forged.first_mut() {
            *byte ^= 1;
        }
        let forged = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(forged);
        assert_eq!(user_of(&master(1), &forged), None);
        assert_eq!(user_of(&master(1), "nada"), None);
    }

    #[test]
    fn the_quota_keeps_room_for_codes() {
        assert_eq!(reserve(95), 23);
        assert_eq!(reserve(20), 10);
        assert_eq!(reserve(5), 5);
        assert_eq!(days_needed(150, Some(72)), 3);
        assert_eq!(days_needed(0, Some(72)), 0);
        assert_eq!(days_needed(10, None), 1);
        assert_eq!(mask_email("ana@gmail.com"), "an•••@gmail.com");
    }
}
